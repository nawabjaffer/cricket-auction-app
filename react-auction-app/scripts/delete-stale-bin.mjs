// ============================================================================
// DELETE-STALE-BIN
// Lists all objects under media/migrated and deletes any with `.bin` extension
// since our new pipeline never produces those. Also clears any RTDB media
// field that still points at one.
// ============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';
import { getStorage, ref as storageRef, listAll, deleteObject } from 'firebase/storage';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const APP_NAME = 'delete-stale-bin';
const app = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);
const db = getDatabase(app);
const storage = getStorage(app);

async function listAllRecursive(prefix) {
  const rootRef = storageRef(storage, prefix);
  const out = [];
  async function recurse(r) {
    const page = await listAll(r);
    for (const item of page.items) out.push(item);
    for (const sub of page.prefixes) await recurse(sub);
  }
  await recurse(rootRef);
  return out;
}

function isStorageUrl(url) {
  return typeof url === 'string'
    && (url.includes('firebasestorage.googleapis.com') || url.includes('firebasestorage.app'));
}

function extractObjectPath(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/o\/([^?]+)/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch { return null; }
}

(async () => {
  console.log('[delete-stale-bin] listing media/ ...');
  const all = await listAllRecursive('media');
  const bins = all.filter(it => /\.bin$/i.test(it.fullPath));
  console.log(`[delete-stale-bin] total objects=${all.length} bins=${bins.length}`);

  // 1) Clear any RTDB field that still points at a .bin URL
  const roots = ['auction/adminPlayers', 'auction/teams', 'auction/sponsors',
    'auction/soldPlayers', 'auction/unsoldPlayers', 'auction/currentState'];

  const mediaKeys = new Set(['imageUrl', 'logoUrl', 'brandLogoUrl', 'videoUrl']);

  function walk(obj, path = [], out = []) {
    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => walk(v, [...path, String(i)], out));
      return out;
    }
    for (const [k, v] of Object.entries(obj)) {
      const p = [...path, k];
      if (typeof v === 'string' && mediaKeys.has(k)) {
        out.push({ key: k, value: v, path: p });
      } else if (v && typeof v === 'object') {
        walk(v, p, out);
      }
    }
    return out;
  }

  let rtdbCleared = 0;
  for (const root of roots) {
    const snap = await get(ref(db, root));
    if (!snap.exists()) continue;
    const fields = walk(snap.val());
    for (const f of fields) {
      const raw = (f.value || '').trim();
      if (!isStorageUrl(raw)) continue;
      const objPath = extractObjectPath(raw);
      if (!objPath) continue;
      if (!/\.bin$/i.test(objPath)) continue;
      await update(ref(db), { [`${root}/${f.path.join('/')}`]: '' });
      rtdbCleared += 1;
    }
  }
  console.log(`[delete-stale-bin] cleared ${rtdbCleared} RTDB fields`);

  // 2) Delete Storage .bin objects
  let deleted = 0;
  let failed = 0;
  const MAX_CONCURRENT = 8;
  let cursor = 0;
  async function worker() {
    while (cursor < bins.length) {
      const idx = cursor++;
      const obj = bins[idx];
      try {
        await deleteObject(obj);
        deleted += 1;
        if (deleted % 25 === 0 || deleted === bins.length) {
          console.log(`[delete-stale-bin] deleted ${deleted}/${bins.length}`);
        }
      } catch (err) {
        failed += 1;
        console.warn(`[delete-stale-bin] FAILED ${obj.fullPath}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, Math.max(bins.length, 1)) }, () => worker());
  await Promise.all(workers);

  console.log('\n[delete-stale-bin] DONE');
  console.log(JSON.stringify({ totalObjects: all.length, bins: bins.length, deleted, failed, rtdbCleared }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('[delete-stale-bin] fatal:', err);
  process.exit(1);
});
