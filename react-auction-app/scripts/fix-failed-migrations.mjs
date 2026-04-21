import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const cfg = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const app = getApps().find((a) => a.name === 'post-migration-fix') ?? initializeApp(cfg, 'post-migration-fix');
const db = getDatabase(app);
const st = getStorage(app);

const paths = [
  'auction/adminPlayers/165/imageUrl',
  'auction/adminPlayers/166/imageUrl',
];

function extractDriveId(url) {
  if (!url) return null;
  const ps = [
    /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /\/d\/([a-zA-Z0-9_-]{10,})/,
  ];
  for (const p of ps) {
    const m = String(url).match(p);
    if (m?.[1]) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(String(url).trim())) return String(url).trim();
  return null;
}

async function fetchAny(raw) {
  const id = extractDriveId(raw);
  const cands = id
    ? [
        `https://lh3.googleusercontent.com/d/${id}=s2048`,
        `https://drive.google.com/uc?export=view&id=${id}`,
        `https://drive.google.com/uc?export=download&id=${id}`,
        `https://drive.google.com/thumbnail?id=${id}&sz=w2048`,
      ]
    : [raw];

  for (const c of cands) {
    try {
      const r = await fetch(c, { cache: 'no-store' });
      if (!r.ok) continue;
      const ab = await r.arrayBuffer();
      if (!ab.byteLength) continue;
      const ct = r.headers.get('content-type') || 'application/octet-stream';
      return { bytes: new Uint8Array(ab), contentType: ct };
    } catch {
      // try next candidate
    }
  }
  return null;
}

function extFromContentType(ct = '') {
  const v = ct.toLowerCase();
  if (v.includes('png')) return 'png';
  if (v.includes('webp')) return 'webp';
  if (v.includes('gif')) return 'gif';
  if (v.includes('svg')) return 'svg';
  if (v.includes('mp4')) return 'mp4';
  return 'jpg';
}

for (const p of paths) {
  const snap = await get(ref(db, p));
  const raw = snap.exists() ? String(snap.val() || '').trim() : '';

  if (!raw) {
    console.log('[SKIP empty]', p);
    continue;
  }
  if (raw.includes('firebasestorage')) {
    console.log('[SKIP already migrated]', p);
    continue;
  }

  const fetched = await fetchAny(raw);
  if (!fetched) {
    console.log('[FAILED unresolved]', p, raw);
    continue;
  }

  const ext = extFromContentType(fetched.contentType);
  const target = `media/migrated/manual/${p.replace(/[^a-z0-9]+/gi, '_')}.${ext}`;
  const r = sRef(st, target);
  await uploadBytes(r, fetched.bytes, { contentType: fetched.contentType, cacheControl: 'public,max-age=31536000' });
  const dl = await getDownloadURL(r);
  await update(ref(db), { [p]: dl });
  console.log('[MIGRATED manual]', p);
}
