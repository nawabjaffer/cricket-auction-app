// ============================================================================
// LOCAL IMAGE CACHE SERVICE
// Persists image responses in Cache Storage for faster repeat loads
// ============================================================================

interface CachedImageResult {
  src: string;
  fromCache: boolean;
  revoke?: () => void;
}

const CACHE_NAME = 'auction-player-images-v1';

class LocalImageCacheService {
  private readonly objectUrls = new Set<string>();

  private canUseCacheStorage(): boolean {
    return typeof globalThis.window !== 'undefined' && 'caches' in globalThis;
  }

  private isDirectFetchBlocked(url: string): boolean {
    try {
      const parsed = new URL(url, globalThis.window.location.origin);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol === 'data:' || protocol === 'blob:' || protocol === 'file:') {
        return true;
      }

      // Avoid CORS and provider throttling issues when trying to fetch remote images
      // into Cache Storage. The image can still be rendered directly by the browser.
      if (parsed.origin !== globalThis.window.location.origin) {
        return true;
      }

      const host = parsed.hostname.toLowerCase();
      return host.includes('drive.google.com') || host.includes('docs.google.com');
    } catch {
      return false;
    }
  }

  /**
   * Resolve a displayable URL.
   * - Tries Cache Storage first
   * - Falls back to network and stores successful responses
   * - Returns original URL when CORS/network blocks blob caching
   */
  async resolveImageSrc(originalUrl: string): Promise<CachedImageResult> {
    if (!originalUrl) return { src: '', fromCache: false };

    if (this.isDirectFetchBlocked(originalUrl)) {
      return { src: originalUrl, fromCache: false };
    }

    if (!this.canUseCacheStorage()) {
      return { src: originalUrl, fromCache: false };
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const request = new Request(originalUrl, { method: 'GET' });

      let response = await cache.match(request);
      let fromCache = true;

      if (!response) {
        fromCache = false;
        response = await fetch(request, { mode: 'cors', cache: 'force-cache' });
        if (response?.ok) {
          await cache.put(request, response.clone());
        }
      }

      if (!response?.ok) {
        return { src: originalUrl, fromCache: false };
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        return { src: originalUrl, fromCache: false };
      }

      const objectUrl = URL.createObjectURL(blob);
      this.objectUrls.add(objectUrl);

      return {
        src: objectUrl,
        fromCache,
        revoke: () => {
          URL.revokeObjectURL(objectUrl);
          this.objectUrls.delete(objectUrl);
        },
      };
    } catch {
      // Fallback for blocked cross-origin fetches.
      return { src: originalUrl, fromCache: false };
    }
  }

  /**
   * Warm cache for a list of URLs in the background.
   */
  async warmCache(imageUrls: string[]): Promise<void> {
    if (!this.canUseCacheStorage()) return;

    const unique = [...new Set(imageUrls)]
      .filter(Boolean)
      .filter((url) => !this.isDirectFetchBlocked(url));

    if (unique.length === 0) return;

    await Promise.all(
      unique.map(async (url) => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const request = new Request(url, { method: 'GET' });
          const existing = await cache.match(request);
          if (existing) return;

          const response = await fetch(request, { mode: 'cors', cache: 'force-cache' });
          if (response.ok) {
            await cache.put(request, response.clone());
          }
        } catch {
          // Ignore warm-up failures and let runtime loading handle fallbacks.
        }
      })
    );
  }

  async clearCache(): Promise<void> {
    if (this.canUseCacheStorage()) {
      await caches.delete(CACHE_NAME);
    }

    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }
}

export const localImageCacheService = new LocalImageCacheService();
