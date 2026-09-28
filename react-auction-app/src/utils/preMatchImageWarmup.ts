const STORAGE_PREFIX = 'cricket-prematch-image-warmup-v1';
export const PREMATCH_IMAGE_WARM_TTL_MS = 30 * 60 * 1000;

interface WarmupRecord {
  fingerprint: string;
  warmedAt: number;
}

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

export function fingerprintImageUrls(urls: string[]): string {
  const value = [...new Set(urls.filter(Boolean))].sort().join('\n');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function shouldWarmPreMatchImages(
  record: WarmupRecord | null,
  fingerprint: string,
  now = Date.now(),
  ttlMs = PREMATCH_IMAGE_WARM_TTL_MS,
): boolean {
  if (!record || record.fingerprint !== fingerprint) return true;
  if (!Number.isFinite(record.warmedAt) || record.warmedAt > now) return true;
  return now - record.warmedAt >= ttlMs;
}

function readRecord(storageKey: string): WarmupRecord | null {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<WarmupRecord>;
    if (typeof parsed.fingerprint !== 'string' || typeof parsed.warmedAt !== 'number') return null;
    return { fingerprint: parsed.fingerprint, warmedAt: parsed.warmedAt };
  } catch {
    return null;
  }
}

function writeRecord(storageKey: string, fingerprint: string, warmedAt: number): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ fingerprint, warmedAt } satisfies WarmupRecord));
  } catch {
    // Image requests still warm the browser cache when storage is unavailable.
  }
}

/** Warm ordinary browser image caches, including cross-origin assets in embedded browsers. */
export function schedulePreMatchImageWarmup(
  urls: string[],
  cacheKey: string,
  ttlMs = PREMATCH_IMAGE_WARM_TTL_MS,
): () => void {
  const uniqueUrls = [...new Set(urls.filter(url => /^https?:\/\//i.test(url)))];
  if (uniqueUrls.length === 0 || typeof Image === 'undefined') return () => {};

  const fingerprint = fingerprintImageUrls(uniqueUrls);
  const storageKey = `${STORAGE_PREFIX}:${cacheKey}`;
  const activeImages = new Set<HTMLImageElement>();
    let cancelled = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let idleHandle: number | undefined;

    const scheduleIdle = (callback: () => void) => {
      const idleWindow = window as unknown as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 3000 });
      } else {
        idleTimer = setTimeout(callback, 250);
      }
    };

    const runWarmup = () => {
      if (cancelled) return;
      const previous = readRecord(storageKey);
      if (!shouldWarmPreMatchImages(previous, fingerprint, Date.now(), ttlMs)) {
        const wait = Math.max(1000, ttlMs - (Date.now() - previous!.warmedAt));
        refreshTimer = setTimeout(() => scheduleIdle(runWarmup), wait);
        return;
      }

      scheduleIdle(() => {
        if (cancelled) return;
        let nextUrl = 0;
        let activeCount = 0;
        let loadedCount = 0;
        const concurrency = Math.min(4, uniqueUrls.length);

        const pump = () => {
          while (!cancelled && activeCount < concurrency && nextUrl < uniqueUrls.length) {
            const image = new Image();
            const url = uniqueUrls[nextUrl++];
            activeImages.add(image);
            activeCount += 1;
            image.decoding = 'async';
            image.loading = 'eager';
            image.fetchPriority = 'low';
            image.onload = () => finish(image, true);
            image.onerror = () => finish(image, false);
            image.src = url;
          }
        };

        const finish = (image: HTMLImageElement, loaded: boolean) => {
          if (!activeImages.delete(image)) return;
          activeCount -= 1;
          if (loaded) loadedCount += 1;
          if (nextUrl < uniqueUrls.length) {
            pump();
          } else if (activeCount === 0 && !cancelled) {
            if (loadedCount > 0) writeRecord(storageKey, fingerprint, Date.now());
            refreshTimer = setTimeout(() => scheduleIdle(runWarmup), ttlMs);
          }
        };

        pump();
      });
    };

    runWarmup();
    return () => {
      cancelled = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (idleHandle !== undefined) (window as unknown as IdleWindow).cancelIdleCallback?.(idleHandle);
      activeImages.forEach(image => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      });
      activeImages.clear();
    };
  }
