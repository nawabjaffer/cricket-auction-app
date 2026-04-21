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

const APP_NAME = 'drive-migration-script';
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

function isAlreadyStorage(url) {
  return typeof url === 'string' && (url.includes('firebasestorage.googleapis.com') || url.includes('firebasestorage.app'));
}

function isDriveLike(url) {
  if (typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return u.includes('drive.google.com') || u.includes('docs.google.com') || u.includes('googleusercontent.com');
}

function isDataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:');
}

function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

function extractDriveId(url) {
  if (!url) return null;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/, 
    /[?&]id=([a-zA-Z0-9_-]{10,})/, 
    /\/d\/([a-zA-Z0-9_-]{10,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

function normalizeDriveUrl(url, keyName = '') {
  const id = extractDriveId(url);
  if (!id) return url;
  const key = keyName.toLowerCase();
  if (key.includes('video')) {
    return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return `https://lh3.googleusercontent.com/d/${id}=s2048`;
}

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

async function uploadRemote(url, storagePathBase) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const bytes = new Uint8Array(ab);
  if (bytes.length === 0) throw new Error('Empty response');
  const sniffed = sniffMimeFromBytes(bytes);
  const headerCt = (res.headers.get('content-type') || '').toLowerCase();
  const headerCtGeneric = !headerCt
    || headerCt.includes('octet-stream')
    || headerCt.includes('text/html')
    || headerCt === 'application/binary';
  const ct = sniffed ?? (headerCtGeneric ? 'application/octet-stream' : headerCt);
  const ext = extFromContentType(ct, 'bin');
  if (ext === 'bin') throw new Error(`Unrecognized media type ct=${ct}`);
  const finalPath = `${storagePathBase}.${ext}`;
  const sRef = storageRef(storage, finalPath);
  await uploadBytes(sRef, bytes, { contentType: ct, cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(sRef);
}

async function uploadDataUrl(dataUrl, storagePathBase) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid data URL');
  const declaredCt = m[1] || 'application/octet-stream';
  const b64 = m[2] || '';
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  if (bytes.length === 0) throw new Error('Empty data URL payload');
  const sniffed = sniffMimeFromBytes(bytes);
  const ct = sniffed ?? declaredCt;
  const ext = extFromContentType(ct, 'bin');
  if (ext === 'bin') throw new Error(`Unrecognized data URL media type ct=${ct}`);
  const finalPath = `${storagePathBase}.${ext}`;
  const sRef = storageRef(storage, finalPath);
  await uploadBytes(sRef, bytes, { contentType: ct, cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(sRef);
}

function walk(obj, path = [], out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, [...path, String(i)], out));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = [...path, k];
    if (typeof v === 'string' && ['imageUrl', 'logoUrl', 'brandLogoUrl', 'videoUrl'].includes(k)) {
      out.push({ key: k, value: v, path: p });
    } else if (v && typeof v === 'object') {
      walk(v, p, out);
    }
  }
  return out;
}

(async () => {
  const updates = {};
  let scanned = 0;
  let migrated = 0;
  let failed = 0;
  const MAX_CONCURRENT = 8;
  const candidates = [];
  let processed = 0;

  for (const root of ROOTS) {
    const snap = await get(ref(db, root));
    if (!snap.exists()) continue;
    const data = snap.val();
    const fields = walk(data);

    for (const f of fields) {
      scanned += 1;
      const raw = (f.value || '').trim();
      if (!raw || isAlreadyStorage(raw)) continue;
      if (!(isDriveLike(raw) || isDataUrl(raw))) continue;

      const dbPath = `${root}/${f.path.join('/')}`;
      const keyHash = hashString(`${dbPath}:${raw}`);
      const storageBase = `media/migrated/${root.replace(/[^a-z0-9]+/gi, '_')}/${f.key}-${keyHash}`;

      candidates.push({ dbPath, raw, key: f.key, storageBase });
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const item = candidates[index];
      if (!item) continue;

      try {
        const source = isDataUrl(item.raw) ? item.raw : normalizeDriveUrl(item.raw, item.key);
        const storageUrl = isDataUrl(source)
          ? await uploadDataUrl(source, item.storageBase)
          : await uploadRemote(source, item.storageBase);

        updates[item.dbPath] = storageUrl;
        await update(ref(db), { [item.dbPath]: storageUrl });
        migrated += 1;
      } catch (err) {
        failed += 1;
      } finally {
        processed += 1;
        if (processed % 25 === 0 || processed === candidates.length) {
          process.stdout.write(`\n[PROGRESS] ${processed}/${candidates.length} processed | migrated=${migrated} failed=${failed}`);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, Math.max(candidates.length, 1)) }, () => worker());
  await Promise.all(workers);

  console.log('\n\nMigration finished.');
  console.log(JSON.stringify({ scanned, migrated, failed, updatedPaths: Object.keys(updates).length }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('\nMigration failed hard:', err);
  process.exit(1);
});
