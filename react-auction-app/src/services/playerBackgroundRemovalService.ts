import { uploadFileToStorage } from './firebaseStorageService';

export interface ProcessPlayerImageOptions {
  playerId: string;
  playerName: string;
  sourceUrl?: string;
  sourceBlob?: Blob;
  onProcessedBlob?: (blob: Blob) => void;
  onStatus?: (status: 'loading-model' | 'processing' | 'uploading' | 'complete') => void;
  onProgress?: (message: string, percent?: number) => void;
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

  onStatus?.('loading-model');
  onProgress?.('Loading the background-removal model...');
  const { removeBackground } = await import('@imgly/background-removal');

  onStatus?.('processing');
  onProgress?.('Removing the background from the portrait...');
  let highestProgress = 35;
  const processedBlob = await removeBackground(sourceBlob ?? sourceUrl!, {
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
