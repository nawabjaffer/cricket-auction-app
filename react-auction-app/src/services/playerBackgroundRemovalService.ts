import { uploadFileToStorage } from './firebaseStorageService';

export interface ProcessPlayerImageOptions {
  playerId: string;
  playerName: string;
  sourceUrl?: string;
  sourceBlob?: Blob;
  onProcessedBlob?: (blob: Blob) => void;
  onStatus?: (status: 'queued' | 'loading-model' | 'processing' | 'uploading' | 'complete') => void;
  onProgress?: (message: string, percent?: number) => void;
}

type BackgroundRemovalFunction = (input: Blob | string, options: { progress: (key: string, current: number, total: number) => void }) => Promise<Blob>;

let removeBackgroundModule: Promise<{ removeBackground: BackgroundRemovalFunction }> | null = null;
let modelQueue: Promise<void> = Promise.resolve();

function loadBackgroundRemoval(): Promise<{ removeBackground: BackgroundRemovalFunction }> {
  removeBackgroundModule ??= import('@imgly/background-removal') as Promise<{ removeBackground: BackgroundRemovalFunction }>;
  return removeBackgroundModule;
}

async function enqueueModelJob<T>(job: () => Promise<T>): Promise<T> {
  const previous = modelQueue;
  let release!: () => void;
  modelQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await job();
  } finally {
    release();
  }
}

/** Process local uploads in-browser so Firebase Storage CORS is not required. */
export async function processPlayerImage({
  playerId,
  playerName,
  sourceUrl,
  sourceBlob,
  onProcessedBlob,
  onStatus,
  onProgress,
}: ProcessPlayerImageOptions): Promise<string> {
  if (!sourceBlob && !sourceUrl) throw new Error('Player image is empty');

  onStatus?.('queued');
  onProgress?.('Waiting for the background-removal worker...', 5);
  let highestProgress = 35;
  const processedBlob = await enqueueModelJob(async () => {
    onStatus?.('loading-model');
    onProgress?.('Loading the background-removal model...', 12);
    const { removeBackground } = await loadBackgroundRemoval();
    onStatus?.('processing');
    onProgress?.('Removing the background from the portrait...', 35);

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await removeBackground(sourceBlob ?? sourceUrl!, {
          progress: (key: string, current: number, total: number) => {
            if (total > 0) {
              // The model reports separate file phases, each starting at 0. Map the
              // raw value into one monotonic range so the UI never jumps backward.
              const rawPercent = Math.round((current / total) * 100);
              highestProgress = Math.max(highestProgress, Math.min(92, Math.round(rawPercent * 0.57 + 35)));
              onProgress?.(`Processing ${key}: ${highestProgress}%`, highestProgress);
            }
          },
        });
      } catch (error) {
        lastError = error;
        if (attempt < 3) onProgress?.(`Retrying image processing (${attempt + 1}/3)...`, highestProgress);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Background removal failed after 3 attempts.');
  });
  onProcessedBlob?.(processedBlob);

  onStatus?.('uploading');
  onProgress?.('Uploading the transparent PNG to Firebase Storage...', 96);
  const safeName = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || playerId;
  const file = new File([processedBlob], `${safeName}-background-removed.png`, { type: 'image/png' });
  const processedUrl = await uploadFileToStorage(file, `media/players/processed/${safeName}-${playerId}`);
  onStatus?.('complete');
  onProgress?.('Background removed successfully.', 100);
  return processedUrl;
}
