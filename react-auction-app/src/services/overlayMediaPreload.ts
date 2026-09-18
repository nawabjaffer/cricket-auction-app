// ============================================================================
// OVERLAY MEDIA PRELOAD SERVICE
// Preloads GIF, WebM, MP4, image and sound assets directly into local memory
// (RAM Blob URLs + pre-decoded DOM Image/Video elements) to ensure <10ms
// zero-delay playback when celebration / special moment overlays trigger.
// ============================================================================

import { extractDriveFileId } from '../utils/driveImage';

class OverlayMediaPreloadService {
  private blobCache = new Map<string, string>();
  private imageCache = new Map<string, HTMLImageElement>();
  private videoCache = new Map<string, HTMLVideoElement>();
  private audioCache = new Map<string, HTMLAudioElement>();
  private inFlight = new Map<string, Promise<string>>();

  /** Normalizes URL so Google Drive links point to high-speed CDN. */
  normalizeUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return '';
    const fileId = extractDriveFileId(trimmed);
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}=w1280`;
    }
    return trimmed;
  }

  /**
   * Preloads an asset into memory:
   * 1. Fetches raw bytes and stores in RAM as an Object Blob URL.
   * 2. For images/GIFs, invokes img.decode() so the browser GPU decodes all frames ahead of time.
   * 3. For video clips, prepares an in-memory video element with preload="auto".
   * 4. For audio, buffers audio element.
   * Returns the immediate memory URL (blob: URL) or fallback URL.
   */
  async preload(rawUrl: string | undefined | null): Promise<string> {
    if (!rawUrl) return '';
    const url = this.normalizeUrl(rawUrl);
    if (!url) return '';

    // If already in RAM, return immediately (<1ms)
    if (this.blobCache.has(url)) {
      return this.blobCache.get(url)!;
    }

    // Deduplicate in-flight requests for the same URL
    if (this.inFlight.has(url)) {
      return this.inFlight.get(url)!;
    }

    const promise = (async () => {
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
      const isAudio = /\.(mp3|wav|ogg|aac)(\?|$)/i.test(url);

      // Attempt 1: Fetch as blob to store directly in RAM (Blob URL)
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) {
            const blob = await res.blob();
            if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
              const blobUrl = URL.createObjectURL(blob);
              this.blobCache.set(url, blobUrl);

              if (isVideo || blob.type.startsWith('video/')) {
                if (typeof document !== 'undefined') {
                  const vid = document.createElement('video');
                  vid.preload = 'auto';
                  vid.muted = true;
                  vid.playsInline = true;
                  vid.src = blobUrl;
                  if (typeof vid.load === 'function') {
                    try { vid.load(); } catch { /* jsdom safe */ }
                  }
                  this.videoCache.set(url, vid);
                }
                return blobUrl;
              }

              if (isAudio || blob.type.startsWith('audio/')) {
                if (typeof Audio !== 'undefined') {
                  const aud = new Audio(blobUrl);
                  aud.preload = 'auto';
                  if (typeof aud.load === 'function') {
                    try { aud.load(); } catch { /* jsdom safe */ }
                  }
                  this.audioCache.set(url, aud);
                }
                return blobUrl;
              }

              // Image / GIF
              if (typeof Image !== 'undefined') {
                const img = new Image();
                img.src = blobUrl;
                if (typeof img.decode === 'function') {
                  await img.decode().catch(() => {});
                }
                this.imageCache.set(url, img);
              }
              return blobUrl;
            }
          }
        }
      } catch {
        // CORS or network failure on blob fetch — fall back to DOM preload below
      }

      // Attempt 2: DOM-level preload (works even when CORS restricts fetch for 3rd-party GIFs/videos)
      if (isVideo) {
        if (typeof document !== 'undefined') {
          const vid = document.createElement('video');
          vid.preload = 'auto';
          vid.muted = true;
          vid.playsInline = true;
          vid.src = url;
          if (typeof vid.load === 'function') {
            try { vid.load(); } catch { /* jsdom safe */ }
          }
          this.videoCache.set(url, vid);
        }
      } else if (isAudio) {
        if (typeof Audio !== 'undefined') {
          const aud = new Audio(url);
          aud.preload = 'auto';
          if (typeof aud.load === 'function') {
            try { aud.load(); } catch { /* jsdom safe */ }
          }
          this.audioCache.set(url, aud);
        }
      } else if (typeof Image !== 'undefined') {
        const img = new Image();
        img.src = url;
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => {});
        }
        this.imageCache.set(url, img);
      }

      return url;
    })();

    this.inFlight.set(url, promise);
    try {
      const result = await promise;
      return result;
    } finally {
      this.inFlight.delete(url);
    }
  }

  /** Preloads a batch of media URLs concurrently. */
  async preloadBatch(urls: (string | undefined | null)[]): Promise<void> {
    const valid = urls.filter((u): u is string => Boolean(u && u.trim()));
    await Promise.all(valid.map(u => this.preload(u).catch(() => {})));
  }

  /**
   * Retrieves the preloaded in-memory URL (<10ms instant paint).
   * Returns the Blob URL if available in RAM, else normalized URL.
   */
  getMediaUrl(rawUrl: string | undefined | null): string {
    if (!rawUrl) return '';
    const url = this.normalizeUrl(rawUrl);
    return this.blobCache.get(url) || url;
  }

  /** Retrieves the pre-warmed audio element ready to play immediately. */
  getAudio(rawUrl: string | undefined | null): HTMLAudioElement | null {
    if (!rawUrl) return null;
    const url = this.normalizeUrl(rawUrl);
    return this.audioCache.get(url) || null;
  }

  /** Checks if URL is already decoded in local memory. */
  isPreloaded(rawUrl: string | undefined | null): boolean {
    if (!rawUrl) return false;
    const url = this.normalizeUrl(rawUrl);
    return this.blobCache.has(url) || this.imageCache.has(url) || this.videoCache.has(url);
  }

  /** Clears cached Blob URLs and elements. */
  clear(): void {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      this.blobCache.forEach(blobUrl => {
        try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ }
      });
    }
    this.blobCache.clear();
    this.imageCache.clear();
    this.videoCache.clear();
    this.audioCache.clear();
    this.inFlight.clear();
  }
}

export const overlayMediaPreload = new OverlayMediaPreloadService();
export const getPreloadedMediaUrl = (url: string | undefined | null) => overlayMediaPreload.getMediaUrl(url);
