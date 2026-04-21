// ============================================================================
// FIREBASE STORAGE IMAGE SERVICE
// Uploads player/team images to Firebase Storage so every client (including
// OBS overlays) fetches from a CDN-backed URL instead of slow Google Drive
// or external URLs.
//
// STRATEGY
// ─────────
// 1. Check localStorage for a cached Storage URL (instant, zero-network).
// 2. Check RTDB path auction/imageIndex/{hash} for a Storage URL uploaded by
//    any other device (fast RTDB read).
// 3. If not found, fetch the original URL and upload to Firebase Storage,
//    then write the result into both localStorage + RTDB so every device
//    benefits immediately.
// 4. Always return the original URL synchronously for first-paint — the
//    cached/Storage URL is delivered via a callback once resolved.
// ============================================================================

import { getApps, initializeApp } from 'firebase/app';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from 'firebase/storage';
import {
  getDatabase,
  ref as dbRef,
  get,
  set,
  type Database,
} from 'firebase/database';

// ── Firebase config (same project as realtimeSync.ts) ────────────────────────
const FB_CONFIG = {
  apiKey:         'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain:     'e-auction-store.firebaseapp.com',
  databaseURL:    'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId:      'e-auction-store',
  storageBucket:  'e-auction-store.firebasestorage.app',
  messagingSenderId: '830797180032',
  appId:          '1:830797180032:web:a0f0a92678ecc36fedca65',
};

// Reuse the 'realtime-sync' app if available; fall back to own named app
// so this service works even before realtimeSync.initialize() has been called.
const STORAGE_APP_NAME = 'realtime-sync';
const FALLBACK_APP_NAME = 'firebase-storage-service';

const RTDB_IMAGE_INDEX = 'auction/imageIndex';
const LS_KEY          = 'obs_img_index_v1';
const IS_DEV          = import.meta.env.DEV;

// ── Simple djb2 hash for URL → short stable key ───────────────────────────────
function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(36);
}

// ── Local cache (localStorage) ────────────────────────────────────────────────
function lsGet(key: string): string | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const map: Record<string, string> = JSON.parse(raw);
    return map[key] ?? null;
  } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[key] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch { /* storage full — ignore */ }
}

// ── Firebase app/service getters (lazy) ───────────────────────────────────────
function getFirebaseApp() {
  // Prefer the already-running realtime-sync app
  const existing = getApps().find((a) => a.name === STORAGE_APP_NAME);
  if (existing) return existing;
  // Or our own fallback
  const fallback = getApps().find((a) => a.name === FALLBACK_APP_NAME);
  if (fallback) return fallback;
  return initializeApp(FB_CONFIG, FALLBACK_APP_NAME);
}

let _storage: FirebaseStorage | null = null;
let _db: Database | null = null;

function getStorageInstance(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getFirebaseApp());
  return _storage;
}

function getDbInstance(): Database {
  if (!_db) _db = getDatabase(getFirebaseApp());
  return _db;
}

// ── In-flight dedup: don't upload the same URL twice concurrently ─────────────
const inFlight = new Map<string, Promise<string>>();

// ── Upload an image from a remote URL to Firebase Storage ─────────────────────
async function uploadFromRemoteUrl(
  originalUrl: string,
  storagePath: string
): Promise<string> {
  const response = await fetch(originalUrl, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}`);

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Empty blob');

  // Detect content type; default to jpeg
  const ct = blob.type || 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
  const fullPath = `${storagePath}.${ext}`;

  const sRef = storageRef(getStorageInstance(), fullPath);
  await uploadBytes(sRef, blob, { contentType: ct, cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(sRef);
}

// ── Core resolution logic ─────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves to the Firebase Storage CDN URL for the
 * given image.
 *
 * - Instant if the URL is already in localStorage.
 * - Fast (one RTDB read) if another device already uploaded it.
 * - Uploads to Firebase Storage on first encounter.
 * - Returns the original URL on any failure so the UI always has something.
 */
async function resolveToStorageUrl(
  originalUrl: string,
  storagePath: string
): Promise<string> {
  if (!originalUrl) return '';

  // Skip data: and blob: URLs — they're already local
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }

  // Skip Firebase Storage URLs — they're already resolved
  if (originalUrl.includes('firebasestorage.googleapis.com') ||
      originalUrl.includes('firebasestorage.app')) {
    return originalUrl;
  }

  const key = hashUrl(originalUrl);

  // 1. localStorage hit (instant)
  const lsCached = lsGet(key);
  if (lsCached) return lsCached;

  // Deduplicate concurrent calls for the same URL
  const flying = inFlight.get(key);
  if (flying) return flying;

  const promise = (async (): Promise<string> => {
    try {
      // 2. RTDB hit (fast — another device already uploaded it)
      const snap = await get(dbRef(getDbInstance(), `${RTDB_IMAGE_INDEX}/${key}`));
      if (snap.exists()) {
        const url = snap.val() as string;
        lsSet(key, url);
        return url;
      }

      // 3. Upload to Firebase Storage
      if (IS_DEV) console.log('[FirebaseStorage] Uploading:', originalUrl.slice(0, 60));
      const storageUrl = await uploadFromRemoteUrl(originalUrl, storagePath);

      // Persist in both RTDB and localStorage
      await set(dbRef(getDbInstance(), `${RTDB_IMAGE_INDEX}/${key}`), storageUrl);
      lsSet(key, storageUrl);

      if (IS_DEV) console.log('[FirebaseStorage] Uploaded →', storageUrl.slice(0, 80));
      return storageUrl;
    } catch (err) {
      if (IS_DEV) console.warn('[FirebaseStorage] Could not resolve, using original URL:', err);
      return originalUrl;
    }
  })();

  inFlight.set(key, promise);
  promise.finally(() => inFlight.delete(key));
  return promise;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Preload and cache a single image URL (fire-and-forget). */
export function preloadImage(url: string, storagePath: string): void {
  if (!url) return;
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  if (url.includes('firebasestorage')) return;
  resolveToStorageUrl(url, storagePath).catch(() => {});
}

/**
 * React hook helper: resolves an image URL to Firebase Storage.
 * Returns `{ src }` where `src` starts as `originalUrl` and is updated
 * to the Storage CDN URL once resolved.
 *
 * Usage:
 *   const { src } = useStorageImage(player.imageUrl, `images/players/${player.id}`);
 */
export function resolveImageAsync(
  originalUrl: string,
  storagePath: string,
  onResolved: (storageUrl: string) => void
): void {
  resolveToStorageUrl(originalUrl, storagePath)
    .then((url) => { if (url !== originalUrl) onResolved(url); })
    .catch(() => {});
}

/**
 * Synchronously returns the cached Storage URL from localStorage (instant),
 * or `undefined` if not yet cached.
 */
export function getCachedStorageUrl(originalUrl: string): string | undefined {
  if (!originalUrl) return undefined;
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) return undefined;
  if (originalUrl.includes('firebasestorage')) return originalUrl;
  const key = hashUrl(originalUrl);
  return lsGet(key) ?? undefined;
}

/**
 * Batch-preload images in the background (no-op if already cached).
 * Call from startup code — uses concurrency limit to avoid quota bursts.
 */
export async function batchPreloadImages(
  items: Array<{ url: string; storagePath: string }>,
  { maxConcurrent = 3 }: { maxConcurrent?: number } = {}
): Promise<void> {
  // Filter out already-cached items
  const pending = items.filter(({ url }) => {
    if (!url) return false;
    if (url.startsWith('data:') || url.startsWith('blob:')) return false;
    if (url.includes('firebasestorage')) return false;
    const key = hashUrl(url);
    return !lsGet(key);
  });

  if (pending.length === 0) return;
  if (IS_DEV) console.log(`[FirebaseStorage] Batch uploading ${pending.length} images`);

  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const item = pending[index++];
      await resolveToStorageUrl(item.url, item.storagePath).catch(() => {});
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrent, pending.length) }, worker);
  await Promise.all(workers);
}
