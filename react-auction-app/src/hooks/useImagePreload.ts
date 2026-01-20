// ============================================================================
// USE IMAGE PRELOAD HOOK
// Tracks image URLs and lets browser handle loading naturally
// ============================================================================

import { useEffect, useState } from 'react';

interface UseImagePreloadOptions {
  timeout?: number;
}

/**
 * Simple image URL tracking without validation
 * Avoids CORS/fetch issues by letting browser handle image loading
 */
export function useImagePreload(
  imageUrl: string | undefined | null,
  options: UseImagePreloadOptions = {}
) {
  const { timeout = 100 } = options;
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setLoadedUrl(null);
      return;
    }

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Simple delayed state update to ensure img src is set
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

  return { loadedUrl };
}

