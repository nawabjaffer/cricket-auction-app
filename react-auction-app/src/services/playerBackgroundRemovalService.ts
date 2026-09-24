import { uploadFileToStorage } from './firebaseStorageService';

export interface ProcessPlayerImageOptions {
  playerId: string;
  playerName: string;
  sourceUrl?: string;
  sourceBlob?: Blob;
  onStatus?: (status: 'loading-model' | 'processing' | 'uploading' | 'complete') => void;
  onProgress?: (message: string, percent?: number) => void;
}

/** Process local uploads in-browser so Firebase Storage CORS is not required. */
export async function processPlayerImage({
  playerId,
  playerName,
  sourceUrl,
  sourceBlob,
  onStatus,
  onProgress,
}: ProcessPlayerImageOptions): Promise<string> {
  if (!sourceBlob && !sourceUrl) throw new Error('Player image is empty');

  onStatus?.('loading-model');
  onProgress?.('Loading the background-removal model...');
  const { removeBackground } = await import('@imgly/background-removal');

  onStatus?.('processing');
  onProgress?.('Removing the background from the portrait...');
  const processedBlob = await removeBackground(sourceBlob ?? sourceUrl!, {
    progress: (key: string, current: number, total: number) => {
      if (total > 0) {
        const percent = Math.round((current / total) * 100);
        onProgress?.(`Processing ${key}: ${percent}%`, percent);
      }
    },
  });

  onStatus?.('uploading');
  onProgress?.('Uploading the transparent PNG to Firebase Storage...');
  const safeName = playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || playerId;
  const file = new File([processedBlob], `${safeName}-background-removed.png`, { type: 'image/png' });
  const processedUrl = await uploadFileToStorage(file, `media/players/processed/${safeName}-${playerId}`);
  onStatus?.('complete');
  onProgress?.('Background removed successfully.');
  return processedUrl;
}
