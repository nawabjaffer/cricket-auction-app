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

async function fetchSourceImage(sourceUrl: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(sourceUrl, { cache: 'no-store' });
  } catch (error) {
    if (error instanceof TypeError && sourceUrl.includes('firebasestorage.googleapis.com')) {
      throw new Error('Could not fetch the Firebase Storage source image. Apply the bucket CORS policy from storage.cors.json, then retry.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not fetch the source image. Its origin may block browser access through CORS.');
    }
    throw error;
  }

  if (!response.ok) throw new Error(`Could not fetch the source image (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error(`Source URL did not return an image (${blob.type || 'unknown content type'}).`);
  return blob;
}

/** Run local inference on a Blob; remote sources must permit browser CORS. */
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
  const inputBlob = sourceBlob ?? await fetchSourceImage(sourceUrl!);
  let highestProgress = 35;
  const processedBlob = await enqueueModelJob(async () => {
    onStatus?.('loading-model');
    onProgress?.('Loading the background-removal model...', 25);
    const { removeBackground } = await loadBackgroundRemoval();
    onStatus?.('processing');
    onProgress?.('Removing the background from the portrait...', 35);

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await removeBackground(inputBlob, {
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
