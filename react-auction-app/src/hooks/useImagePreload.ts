// ============================================================================
// USE IMAGE PRELOAD HOOK
// Handles robust image loading with timeout retry for Drive URLs
// ============================================================================

import { useEffect, useState } from 'react';

interface UseImagePreloadOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

/**
 * Tracks image URL and validity without using Image() object
 * Avoids CORS issues by letting browser handle loading naturally
 */
export function useImagePreload(
  imageUrl: string | undefined | null,
  options: UseImagePreloadOptions = {}
) {
  const { maxRetries = 2, retryDelay = 1000, timeout = 8000 } = options;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!imageUrl) {
      setLoadedUrl(null);
      setError(null);
      setRetryCount(0);
      return;
    }

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;
    let hasLoaded = false;

    const startAttempt = () => {
      if (!isMounted) return;

      setIsLoading(true);
      
      console.log(`[useImagePreload] Attempt ${retryCount + 1}/${maxRetries + 1}: ${imageUrl}`);

      // Create a fetch request to check if the image is accessible
      // This works better with CORS than Image() object
      fetch(imageUrl, { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'reload'
      })
        .then(() => {
          if (isMounted && !hasLoaded) {
            hasLoaded = true;
            console.log('[useImagePreload] Image fetch successful:', imageUrl);
            setLoadedUrl(imageUrl);
            setError(null);
            setIsLoading(false);
            setRetryCount(0);
          }
        })
        .catch((err) => {
          if (isMounted && !hasLoaded) {
            console.warn(`[useImagePreload] Fetch attempt failed:`, err.message);
            
            // For Drive URLs, the fetch might fail due to CORS, but the image still works
            // in img tags. So we'll just assume it's valid and let the browser handle it
            if (imageUrl.includes('drive.google.com') || imageUrl.includes('googleusercontent.com')) {
              console.log('[useImagePreload] Google Drive URL detected - trusting browser to load');
              hasLoaded = true;
              setLoadedUrl(imageUrl);
              setError(null);
              setIsLoading(false);
              setRetryCount(0);
              return;
            }

            // For non-Drive URLs, retry
            if (retryCount < maxRetries) {
              console.log(`[useImagePreload] Retrying in ${retryDelay}ms... (${retryCount + 1}/${maxRetries})`);
              timeoutId = setTimeout(() => {
                if (isMounted) {
                  setRetryCount(prev => prev + 1);
                  startAttempt();
                }
              }, retryDelay);
            } else {
              console.error('[useImagePreload] All retries exhausted for:', imageUrl);
              setError('Image failed to load after retries');
              setIsLoading(false);
            }
          }
        });

      // Also set a timeout as fallback - assume success after timeout
      timeoutId = setTimeout(() => {
        if (isMounted && !hasLoaded) {
          console.log('[useImagePreload] Timeout reached - assuming image is loadable:', imageUrl);
          hasLoaded = true;
          setLoadedUrl(imageUrl);
          setError(null);
          setIsLoading(false);
          setRetryCount(0);
        }
      }, timeout);
    };

    startAttempt();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [imageUrl, maxRetries, retryDelay, timeout, retryCount]);

  return { loadedUrl, isLoading, error };
}

