// ============================================================================
// USE IMAGE PRELOADER HOOK - Initialize Image Preloading
// Handles eager preloading of all player images at startup
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { imagePreloaderService } from '../services/imagePreloader';

interface PreloadState {
  isPreloading: boolean;
  progress: number;
  total: number;
  successful: number;
  failed: number;
  duration: number;
  successRate: number;
}

/**
 * Hook to initialize and track image preloading
 * Runs once on component mount to preload all images
 */
export function useImagePreloaderInit(
  imageUrls: string[],
  onComplete?: (state: PreloadState) => void
) {
  const [state, setState] = useState<PreloadState>({
    isPreloading: false,
    progress: 0,
    total: imageUrls.length,
    successful: 0,
    failed: 0,
    duration: 0,
    successRate: 0,
  });

  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only run once
    if (hasInitialized.current || !imageUrls || imageUrls.length === 0) {
      return;
    }

    hasInitialized.current = true;

    const initializePreload = async () => {
      console.log('[useImagePreloaderInit] Starting preload of', imageUrls.length, 'images');
      setState(prev => ({ ...prev, isPreloading: true, total: imageUrls.length }));

      const result = await imagePreloaderService.preloadImages(imageUrls, {
        maxConcurrent: 6,
        timeout: 15000,
        onProgress: (current, total) => {
          setState(prev => ({
            ...prev,
            progress: current,
            total,
          }));
        },
      });

      const finalState: PreloadState = {
        isPreloading: false,
        progress: result.total,
        total: result.total,
        successful: result.successful.length,
        failed: result.failed.length,
        duration: result.duration,
        successRate: result.successRate,
      };

      setState(finalState);
      onComplete?.(finalState);

      console.log('[useImagePreloaderInit] Preload complete:', {
        successful: result.successful.length,
        failed: result.failed.length,
        total: result.total,
        duration: `${result.duration}ms`,
        successRate: `${result.successRate.toFixed(1)}%`,
      });
    };

    initializePreload().catch(error => {
      console.error('[useImagePreloaderInit] Error during preload:', error);
      setState(prev => ({ ...prev, isPreloading: false }));
    });
  }, [imageUrls.length, onComplete]);

  return state;
}
