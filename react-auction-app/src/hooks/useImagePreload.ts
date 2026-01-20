// ============================================================================
// USE IMAGE PRELOAD HOOK
// Handles robust image loading with retry logic for Drive URLs
// ============================================================================

import { useEffect, useState } from 'react';

interface UseImagePreloadOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Preloads an image with retry logic
 * Useful for handling flaky Drive URLs that need time to respond
 */
export function useImagePreload(
  imageUrl: string | undefined | null,
  options: UseImagePreloadOptions = {}
) {
  const { maxRetries = 3, retryDelay = 500, timeout = 5000 } = options;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setLoadedUrl(null);
      setError(null);
      return;
    }

    let isMounted = true;
    let retryCount = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const attemptLoad = () => {
      if (!isMounted) return;

      setIsLoading(true);
      const img = new Image();

      // Set timeout for the image load
      timeoutId = setTimeout(() => {
        if (isMounted && !img.complete) {
          console.warn(`[useImagePreload] Timeout loading image (${retryCount}/${maxRetries}):`, imageUrl);
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(attemptLoad, retryDelay);
          } else {
            setError('Image load timeout');
            setIsLoading(false);
          }
        }
      }, timeout);

      img.onload = () => {
        if (isMounted) {
          clearTimeout(timeoutId);
          console.log('[useImagePreload] Image loaded successfully:', imageUrl);
          setLoadedUrl(imageUrl);
          setError(null);
          setIsLoading(false);
        }
      };

      img.onerror = () => {
        if (isMounted) {
          clearTimeout(timeoutId);
          console.warn(`[useImagePreload] Image load failed (${retryCount}/${maxRetries}):`, imageUrl);

          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`[useImagePreload] Retrying in ${retryDelay}ms...`);
            setTimeout(attemptLoad, retryDelay);
          } else {
            setError('Image failed to load after retries');
            setIsLoading(false);
          }
        }
      };

      // Trigger the load
      img.src = imageUrl;
    };

    attemptLoad();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [imageUrl, maxRetries, retryDelay, timeout]);

  return { loadedUrl, isLoading, error };
}
