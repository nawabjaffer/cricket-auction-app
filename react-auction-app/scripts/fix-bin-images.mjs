// ============================================================================
// FIX-BIN-IMAGES
// Scans RTDB for media URLs in Firebase Storage that were uploaded as .bin
// (application/octet-stream). For each, downloads the bytes, sniffs actual
// image/video magic bytes, and re-uploads with the correct extension and
// content-type. RTDB is then updated with the new download URL.
// ============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const APP_NAME = 'fix-bin-images-script';
const app = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);
const db = getDatabase(app);
const storage = getStorage(app);

const ROOTS = [
  'auction/adminPlayers',
  'auction/teams',
  'auction/sponsors',
  'auction/soldPlayers',
  'auction/unsoldPlayers',
  'auction/currentState',
];

const MEDIA_KEYS = ['imageUrl', 'logoUrl', 'brandLogoUrl', 'videoUrl'];

function extFromContentType(contentType = '', fallback = 'bin') {
  const ct = contentType.toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('svg')) return 'svg';
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('quicktime')) return 'mov';
  return fallback;
}

function sniffMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image/bmp';
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video/webm';
  if (bytes[0] === 0x3C) {
    const head = Buffer.from(bytes.slice(0, Math.min(256, bytes.length))).toString('utf8');
    if (/^\s*<\?xml/i.test(head) || /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  }
  return null;
}

function isFirebaseStorageUrl(url) {
  return typeof url === 'string'
    && (url.includes('firebasestorage.googleapis.com') || url.includes('firebasestorage.app'));
}

// Extract object path from a Firebase Storage download URL.
// e.g. https://firebasestorage.googleapis.com/v0/b/BUCKET/o/media%2Fmigrated%2Ffoo.bin?alt=media&token=...
function extractStoragePath(url) {
  try {
    const u = new URL(url);
    // Path like /v0/b/<bucket>/o/<encoded object path>
    const m = u.pathname.match(/\/o\/([^?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch { return null; }
}

function pathLooksLikeBin(objectPath) {
  if (!objectPath) return false;
  return /\.bin(?:$|[?#])/i.test(objectPath);
}

function walk(obj, path = [], out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, [...path, String(i)], out));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = [...path, k];
    if (typeof v === 'string' && MEDIA_KEYS.includes(k)) {
      out.push({ key: k, value: v, path: p });
    } else if (v && typeof v === 'object') {
      walk(v, p, out);
    }
  }
  return out;
}

async function rewriteBinEntry({ dbPath, downloadUrl, objectPath }) {
  const res = await fetch(downloadUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  if (bytes.length === 0) throw new Error('Empty payload');

  const sniffed = sniffMimeFromBytes(bytes);
  if (!sniffed) throw new Error('Unrecognized magic bytes');

  const ext = extFromContentType(sniffed, 'bin');
  if (ext === 'bin') throw new Error(`No ext for ct=${sniffed}`);

  const newObjectPath = objectPath.replace(/\.bin$/i, `.${ext}`);
  const sRef = storageRef(storage, newObjectPath);
  await uploadBytes(sRef, bytes, {
    contentType: sniffed,
    cacheControl: 'public,max-age=31536000',
  });
  const newUrl = await getDownloadURL(sRef);
  await update(ref(db), { [dbPath]: newUrl });
  return { newObjectPath, newUrl, ct: sniffed };
}

(async () => {
  const candidates = [];
  for (const root of ROOTS) {
    const snap = await get(ref(db, root));
    if (!snap.exists()) continue;
    const data = snap.val();
    const fields = walk(data);
    for (const f of fields) {
      const raw = (f.value || '').trim();
      if (!raw || !isFirebaseStorageUrl(raw)) continue;
      const objectPath = extractStoragePath(raw);
      if (!objectPath || !pathLooksLikeBin(objectPath)) continue;
      const dbPath = `${root}/${f.path.join('/')}`;
      candidates.push({ dbPath, downloadUrl: raw, objectPath });
    }
  }

  console.log(`[fix-bin-images] found ${candidates.length} .bin entries to fix`);

  let fixed = 0;
  let failed = 0;
  const MAX_CONCURRENT = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const item = candidates[idx];
      if (!item) continue;
      try {
        const { newObjectPath, ct } = await rewriteBinEntry(item);
        fixed += 1;
        if (fixed % 20 === 0 || fixed === candidates.length) {
          console.log(`[fix-bin-images] ${fixed}/${candidates.length} rewritten (last ct=${ct}, path=${newObjectPath})`);
        }
      } catch (err) {
        failed += 1;
        console.warn(`[fix-bin-images] FAILED ${item.dbPath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT, Math.max(candidates.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);

  console.log('\n[fix-bin-images] DONE');
  console.log(JSON.stringify({ total: candidates.length, fixed, failed }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('[fix-bin-images] fatal:', err);
  process.exit(1);
});
