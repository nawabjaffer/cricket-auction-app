// ============================================================================
// USE IMAGE PRELOAD HOOK
// Tracks image URLs and uses cache for fast loading
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { imageCacheService } from '../services/imageCache';

interface UseImagePreloadOptions {
  timeout?: number;
}

/**
 * Image preload hook with cache awareness
 * - Checks image cache first (session memory + localStorage)
 * - Shows loading state only if image not in cache
 * - Immediate display for cached images
 */
export function useImagePreload(
  imageUrl: string | undefined | null,
  options: UseImagePreloadOptions = {}
) {
  const { timeout = 100 } = options;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Callback to mark loading as complete
  const onImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      setLoadedUrl(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Check cache first for instant display
    const cachedImage = imageCacheService.getFromCache(imageUrl);
    
    if (cachedImage && cachedImage.status === 'success') {
      // Image is in cache and was successfully loaded before
      console.log('[useImagePreload] Using cached image (successful):', imageUrl);
      setLoadedUrl(imageUrl);
      setIsLoading(false);
      return;
    }

    // Show loading state only for non-cached images
    setIsLoading(true);

    // Delayed state update to ensure img src is set
    // This gives React time to render and allows browser to handle image loading
    timeoutId = setTimeout(() => {
      if (isMounted) {
        console.log('[useImagePreload] Setting image URL:', imageUrl);
        setLoadedUrl(imageUrl);
      }
    }, timeout);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [imageUrl, timeout]);

  return { loadedUrl, isLoading, onImageLoad };
}

