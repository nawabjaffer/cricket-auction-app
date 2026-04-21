// ============================================================================
// MEDIA BLOB CACHE - IndexedDB-backed persistent cache for images/videos
// Once a URL is fetched, its blob is stored in IndexedDB keyed by URL. On
// subsequent requests we hydrate a blob URL directly — zero network, works
// offline, and survives page reloads.
// ============================================================================

const DB_NAME   = 'auction-media-cache-v1';
const STORE     = 'media';
const DB_VERSION = 1;

interface CachedEntry {
  url: string;
  blob: Blob;
  contentType: string;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IDB'));
  });
  return dbPromise;
}

async function idbGet(url: string): Promise<CachedEntry | null> {
  try {
    const db = await getDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const req = st.get(url);
      req.onsuccess = () => resolve((req.result as CachedEntry | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function idbPut(entry: CachedEntry): Promise<void> {
  try {
    const db = await getDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const req = st.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch { /* ignore quota/open errors */ }
}

// Active blob-URL map so callers can reuse and we can revoke on clear.
const liveBlobUrls = new Map<string, string>();

/** Fetch a URL and persist its blob in IndexedDB. Returns a local blob: URL. */
export async function cacheAndGetBlobUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  // Return existing blob: URL if we already created one this session
  const existing = liveBlobUrls.get(url);
  if (existing) return existing;

  // Hit IDB first
  const cached = await idbGet(url);
  if (cached?.blob) {
    const blobUrl = URL.createObjectURL(cached.blob);
    liveBlobUrls.set(url, blobUrl);
    return blobUrl;
  }

  // Network fetch
  try {
    const res = await fetch(url, { mode: 'cors', cache: 'force-cache', signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    const ct = blob.type || res.headers.get('content-type') || 'application/octet-stream';
    await idbPut({ url, blob, contentType: ct, cachedAt: Date.now() });
    const blobUrl = URL.createObjectURL(blob);
    liveBlobUrls.set(url, blobUrl);
    return blobUrl;
  } catch {
    return null;
  }
}

/** Synchronously returns a previously-minted blob: URL for this URL, if any. */
export function getLiveBlobUrl(url: string): string | null {
  return liveBlobUrls.get(url) ?? null;
}

/** Drop all cached media. */
export async function clearMediaBlobCache(): Promise<void> {
  for (const [, blobUrl] of liveBlobUrls) URL.revokeObjectURL(blobUrl);
  liveBlobUrls.clear();
  try {
    const db = await getDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function countCachedMedia(): Promise<number> {
  try {
    const db = await getDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror = () => resolve(0);
    });
  } catch { return 0; }
}
