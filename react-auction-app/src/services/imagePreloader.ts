// ============================================================================
// IMAGE PRELOADER SERVICE - Eager Image Preloading
// Preloads all images concurrently during startup
// ============================================================================

import { imageCacheService } from './imageCache';
import { getDriveImageUrl, extractDriveFileId } from '../utils/driveImage';

interface PreloadOptions {
  maxConcurrent?: number;
  timeout?: number;
  onProgress?: (current: number, total: number) => void;
}

interface PreloadResult {
  successful: string[];
  failed: string[];
  total: number;
  duration: number;
  successRate: number;
}

/**
 * Image Preloader Service
 * - Preloads all player images with concurrent fetching
 * - Attempts multiple fallback URLs for Drive images
 * - Reports progress and results
 */
class ImagePreloaderService {
  private isPreloading = false;
  private preloadAbortController: AbortController | null = null;

  /**
   * Preload images with fallback chain and caching
   */
  async preloadImage(
    imageUrl: string,
    options: { timeout?: number } = {}
  ): Promise<boolean> {
    if (!imageUrl) return false;

    const { timeout = 10000 } = options;

    // Check cache first
    const cached = imageCacheService.getFromCache(imageUrl);
    if (cached) {
      console.log('[ImagePreloader] Using cached:', imageUrl);
      return cached.status === 'success';
    }

    imageCacheService.markAsLoading(imageUrl);

    return new Promise((resolve) => {
      const img = new Image();
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeoutId);
        img.onload = null;
        img.onerror = null;
        img.src = '';
      };

      img.onload = () => {
        cleanup();
        imageCacheService.markAsLoaded(imageUrl);
        console.log('[ImagePreloader] Successfully preloaded:', imageUrl);
        resolve(true);
      };

      img.onerror = async () => {
        cleanup();

        // Try fallback URLs for Drive images
        const fileId = extractDriveFileId(imageUrl);
        if (fileId) {
          console.log('[ImagePreloader] Primary load failed, trying fallbacks for:', imageUrl);

          const fallbackUrls = [
            `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
            `https://drive.google.com/uc?export=view&id=${fileId}`,
            `https://ui-avatars.com/api/?name=Player&background=1976D2&color=ffffff&size=400&bold=true&format=svg`,
          ];

          for (const fallbackUrl of fallbackUrls) {
            const fallbackSuccess = await new Promise<boolean>((res) => {
              const fallbackImg = new Image();
              let fallbackTimeoutId: ReturnType<typeof setTimeout>;

              const fallbackCleanup = () => {
                clearTimeout(fallbackTimeoutId);
                fallbackImg.onload = null;
                fallbackImg.onerror = null;
                fallbackImg.src = '';
              };

              fallbackImg.onload = () => {
                fallbackCleanup();
                console.log('[ImagePreloader] Fallback successful:', fallbackUrl);
                res(true);
              };

              fallbackImg.onerror = () => {
                fallbackCleanup();
                res(false);
              };

              fallbackTimeoutId = setTimeout(() => {
                fallbackCleanup();
                res(false);
              }, timeout / 3);

              fallbackImg.src = fallbackUrl;
            });

            if (fallbackSuccess) {
              imageCacheService.markAsLoaded(imageUrl);
              resolve(true);
              return;
            }
          }
        }

        // All fallbacks failed
        imageCacheService.markAsFailed(imageUrl);
        console.log('[ImagePreloader] All attempts failed for:', imageUrl);
        resolve(false);
      };

      timeoutId = setTimeout(() => {
        cleanup();
        img.onerror = null; // Prevent double-handling
        imageCacheService.markAsFailed(imageUrl);
        console.log('[ImagePreloader] Timeout for:', imageUrl);
        resolve(false);
      }, timeout);

      // Start loading
      const transformedUrl = getDriveImageUrl(imageUrl) || imageUrl;
      img.src = transformedUrl;
    });
  }

  /**
   * Preload multiple images with concurrency control
   */
  async preloadImages(
    imageUrls: string[],
    options: PreloadOptions = {}
  ): Promise<PreloadResult> {
    const {
      maxConcurrent = 6,
      timeout = 10000,
      onProgress,
    } = options;

    if (this.isPreloading) {
      console.warn('[ImagePreloader] Already preloading, aborting previous batch');
      this.abortPreloading();
    }

    this.isPreloading = true;
    this.preloadAbortController = new AbortController();

    const startTime = Date.now();
    const unique = [...new Set(imageUrls)].filter(Boolean);
    const successful: string[] = [];
    const failed: string[] = [];

    console.log('[ImagePreloader] Starting preload of', unique.length, 'images (max concurrent:', maxConcurrent, ')');

    // Process in batches
    for (let i = 0; i < unique.length; i += maxConcurrent) {
      // Check if preload was aborted
      if (this.preloadAbortController.signal.aborted) {
        console.log('[ImagePreloader] Preloading aborted');
        break;
      }

      const batch = unique.slice(i, i + maxConcurrent);
      const results = await Promise.all(
        batch.map(url => this.preloadImage(url, { timeout }))
      );

      results.forEach((success, index) => {
        const url = batch[index];
        if (success) {
          successful.push(url);
        } else {
          failed.push(url);
        }
      });

      const current = Math.min(i + maxConcurrent, unique.length);
      onProgress?.(current, unique.length);

      console.log(
        '[ImagePreloader] Batch complete:',
        current,
        '/',
        unique.length,
        `(${successful.length} success, ${failed.length} failed)`
      );
    }

    const duration = Date.now() - startTime;
    const result: PreloadResult = {
      successful,
      failed,
      total: unique.length,
      duration,
      successRate: unique.length > 0 ? (successful.length / unique.length) * 100 : 0,
    };

    this.isPreloading = false;
    console.log(
      '[ImagePreloader] Preload complete:',
      result.successful.length,
      '/',
      result.total,
      `in ${result.duration}ms (${result.successRate.toFixed(1)}% success rate)`
    );

    return result;
  }

  /**
   * Abort ongoing preload operation
   */
  abortPreloading(): void {
    if (this.preloadAbortController) {
      this.preloadAbortController.abort();
      this.isPreloading = false;
      console.log('[ImagePreloader] Preload aborted');
    }
  }

  /**
   * Check if currently preloading
   */
  isCurrentlyPreloading(): boolean {
    return this.isPreloading;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return imageCacheService.getStats();
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    imageCacheService.clearAll();
  }
}

export const imagePreloaderService = new ImagePreloaderService();
