import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const app = getApps().find((a) => a.name === 'verify-migration') ?? initializeApp(FB_CONFIG, 'verify-migration');
const db = getDatabase(app);

const ROOTS = [
  'auction/adminPlayers',
  'auction/teams',
  'auction/sponsors',
  'auction/soldPlayers',
  'auction/unsoldPlayers',
  'auction/currentState',
];

function isStorage(url) {
  return typeof url === 'string' && (url.includes('firebasestorage.googleapis.com') || url.includes('firebasestorage.app'));
}

function isCandidate(url) {
  if (typeof url !== 'string') return false;
  const v = url.toLowerCase();
  return v.startsWith('data:') || v.includes('drive.google.com') || v.includes('docs.google.com') || v.includes('googleusercontent.com');
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
      out.push({ path: p.join('/'), value: v });
    } else if (v && typeof v === 'object') {
      walk(v, p, out);
    }
  }
  return out;
}

const result = {
  scannedFields: 0,
  storageFields: 0,
  remainingNonStorageCandidates: 0,
  remaining: [],
};

for (const root of ROOTS) {
  const snap = await get(ref(db, root));
  if (!snap.exists()) continue;
  const fields = walk(snap.val());
  for (const f of fields) {
    result.scannedFields += 1;
    if (isStorage(f.value)) {
      result.storageFields += 1;
      continue;
    }
    if (isCandidate(f.value)) {
      result.remainingNonStorageCandidates += 1;
      result.remaining.push({ path: `${root}/${f.path}`, value: f.value.slice(0, 120) });
    }
  }
}

console.log(JSON.stringify(result, null, 2));
