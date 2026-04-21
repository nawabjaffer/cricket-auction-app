// ============================================================================
// RESTORE-FROM-SNAPSHOT
// Uses auction/initialSnapshot to recover original Drive/media URLs that
// were destroyed by an earlier migration that uploaded HTML-interstitial
// responses as `.bin` files.
//
// For each RTDB media field currently pointing at a Firebase Storage `.bin`:
//   1. If a matching record exists in initialSnapshot with a non-trivial URL,
//      re-migrate it through lh3.googleusercontent.com (real image/jpeg).
//   2. Otherwise, clear the URL so the UI falls back to the placeholder.
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

const APP_NAME = 'restore-from-snapshot';
const app = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);
const db = getDatabase(app);
const storage = getStorage(app);

function isStorageBin(url) {
  if (typeof url !== 'string') return false;
  if (!(url.includes('firebasestorage.googleapis.com') || url.includes('firebasestorage.app'))) return false;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/o\/([^?]+)/);
    if (!m) return false;
    return /\.bin$/i.test(decodeURIComponent(m[1]));
  } catch { return false; }
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

function extFromCt(ct = '') {
  const c = ct.toLowerCase();
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
  if (c.includes('png')) return 'png';
  if (c.includes('webp')) return 'webp';
  if (c.includes('gif')) return 'gif';
  if (c.includes('svg')) return 'svg';
  if (c.includes('mp4')) return 'mp4';
  if (c.includes('webm')) return 'webm';
  return 'bin';
}

function sniff(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  return null;
}

// Fetch a Drive URL via the image CDN which does not return HTML interstitials.
async function fetchDriveImage(url) {
  const id = extractDriveId(url);
  const candidates = id
    ? [
        `https://lh3.googleusercontent.com/d/${id}=s2048`,
        `https://lh3.googleusercontent.com/d/${id}=w2048`,
        `https://drive.google.com/thumbnail?id=${id}&sz=w2048`,
      ]
    : [url];
  for (const cand of candidates) {
    try {
      const r = await fetch(cand, { cache: 'no-store' });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length === 0) continue;
      const sniffed = sniff(buf);
      if (!sniffed) continue; // HTML or unknown
      return { bytes: buf, ct: sniffed };
    } catch {}
  }
  return null;
}

async function uploadBytesToStorage(bytes, ct, storagePathBase) {
  const ext = extFromCt(ct);
  if (ext === 'bin') throw new Error(`No ext for ct=${ct}`);
  const finalPath = `${storagePathBase}.${ext}`;
  const sRef = storageRef(storage, finalPath);
  await uploadBytes(sRef, bytes, { contentType: ct, cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(sRef);
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h = h >>> 0; }
  return h.toString(36);
}

// ── Build lookups from initialSnapshot ──
function buildSnapshotIndex(snapshot) {
  const playerById = new Map();
  const playerByNormName = new Map();
  const teamById = new Map();
  const teamByNormName = new Map();

  const norm = (s) => String(s || '').trim().toLowerCase();

  const players = Array.isArray(snapshot?.players) ? snapshot.players : Object.values(snapshot?.players || {});
  for (const p of players) {
    if (!p) continue;
    if (p.id != null) playerById.set(String(p.id), p);
    if (p.name) playerByNormName.set(norm(p.name), p);
  }
  const teams = Array.isArray(snapshot?.teams) ? snapshot.teams : Object.values(snapshot?.teams || {});
  for (const t of teams) {
    if (!t) continue;
    if (t.id != null) teamById.set(String(t.id), t);
    if (t.name) teamByNormName.set(norm(t.name), t);
  }
  return { playerById, playerByNormName, teamById, teamByNormName, norm };
}

(async () => {
  const snapSnap = await get(ref(db, 'auction/initialSnapshot'));
  if (!snapSnap.exists()) {
    console.error('No initialSnapshot found — cannot restore.');
    process.exit(1);
  }
  const snap = snapSnap.val();
  const idx = buildSnapshotIndex(snap);
  console.log(`[restore] snapshot players=${idx.playerById.size} teams=${idx.teamById.size}`);

  // Gather current broken fields
  const rootsSpec = [
    { root: 'auction/adminPlayers', type: 'player', key: 'imageUrl' },
    { root: 'auction/teams',        type: 'team',   key: 'logoUrl'  },
    { root: 'auction/soldPlayers',  type: 'player', key: 'imageUrl' },
    { root: 'auction/unsoldPlayers',type: 'player', key: 'imageUrl' },
  ];

  const updates = [];
  for (const spec of rootsSpec) {
    const rootSnap = await get(ref(db, spec.root));
    if (!rootSnap.exists()) continue;
    const rootVal = rootSnap.val();
    if (!rootVal || typeof rootVal !== 'object') continue;
    const entries = [];
    if (Array.isArray(rootVal)) {
      for (let i = 0; i < rootVal.length; i++) entries.push([String(i), rootVal[i]]);
    } else {
      for (const [k, v] of Object.entries(rootVal)) entries.push([k, v]);
    }
    for (const [k, v] of entries) {
      if (!v || typeof v !== 'object') continue;
      const url = v[spec.key];
      if (!isStorageBin(url)) continue;
      updates.push({ dbPath: `${spec.root}/${k}/${spec.key}`, type: spec.type, record: v });
    }
  }
  console.log(`[restore] broken entries to repair: ${updates.length}`);

  let restored = 0;
  let cleared = 0;
  let failed = 0;
  let cursor = 0;
  const MAX_CONCURRENT = 6;

  async function worker() {
    while (cursor < updates.length) {
      const i = cursor++;
      const item = updates[i];
      if (!item) continue;
      try {
        // 1) look up in snapshot
        let srcUrl = '';
        if (item.type === 'player') {
          const byId = idx.playerById.get(String(item.record.id));
          const byName = idx.playerByNormName.get(idx.norm(item.record.name));
          const match = byId ?? byName;
          srcUrl = (match?.imageUrl || '').trim();
        } else {
          const byId = idx.teamById.get(String(item.record.id));
          const byName = idx.teamByNormName.get(idx.norm(item.record.name));
          const match = byId ?? byName;
          srcUrl = (match?.logoUrl || '').trim();
        }

        if (!srcUrl || srcUrl.includes('firebasestorage')) {
          // nothing usable → clear
          await update(ref(db), { [item.dbPath]: '' });
          cleared += 1;
          continue;
        }

        const fetched = await fetchDriveImage(srcUrl);
        if (!fetched) {
          await update(ref(db), { [item.dbPath]: '' });
          cleared += 1;
          continue;
        }

        const storagePathBase = `media/restored/${item.dbPath.replace(/[^a-z0-9]+/gi, '_')}-${hashString(srcUrl)}`;
        const newUrl = await uploadBytesToStorage(fetched.bytes, fetched.ct, storagePathBase);
        await update(ref(db), { [item.dbPath]: newUrl });
        restored += 1;
        if (restored % 10 === 0) console.log(`[restore] restored=${restored} cleared=${cleared} failed=${failed}`);
      } catch (err) {
        failed += 1;
        console.warn(`[restore] FAILED ${item.dbPath}:`, err instanceof Error ? err.message : err);
        try { await update(ref(db), { [item.dbPath]: '' }); cleared += 1; } catch {}
      }
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, Math.max(updates.length, 1)) }, () => worker());
  await Promise.all(workers);

  // Also clear broken currentState.currentPlayer.imageUrl if any
  const cs = await get(ref(db, 'auction/currentState/currentPlayer/imageUrl'));
  if (cs.exists() && isStorageBin(cs.val())) {
    await update(ref(db), { 'auction/currentState/currentPlayer/imageUrl': '' });
    cleared += 1;
  }

  console.log('\n[restore] DONE');
  console.log(JSON.stringify({ total: updates.length, restored, cleared, failed }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('[restore] fatal:', err);
  process.exit(1);
});
