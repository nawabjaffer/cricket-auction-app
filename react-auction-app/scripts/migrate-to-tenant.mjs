// ============================================================================
// MIGRATE TO TENANT
// One-time script that copies existing root-level data at `auction/*`,
// `admin/*`, `premium/*` into the new tenant namespace
// `tenants/{DEFAULT_TENANT_ID}/...`.
//
// - Safe to run multiple times: each subtree is only written if the tenant
//   copy is missing or `--force` is passed.
// - Also registers the default tenant under `platform/tenants/{id}`.
//
// Usage:  node scripts/migrate-to-tenant.mjs [--force] [--tenant=epl_2026]
// ============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, get, set } from 'firebase/database';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const tenantArg = args.find((a) => a.startsWith('--tenant='));
const TENANT_ID = tenantArg ? tenantArg.split('=')[1] : 'epl_2026';

const APP_NAME = 'migrate-to-tenant';
const app = getApps().find((a) => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);
const db = getDatabase(app);

const SUBTREES = ['auction', 'admin', 'premium'];

async function readPath(path) {
  const snap = await get(ref(db, path));
  return snap.exists() ? snap.val() : null;
}

async function writePath(path, value) {
  await set(ref(db, path), value);
}

async function migrateSubtree(name) {
  const srcPath = name;                               // e.g. "auction"
  const dstPath = `tenants/${TENANT_ID}/${name}`;     // e.g. "tenants/epl_2026/auction"
  const [src, existing] = await Promise.all([readPath(srcPath), readPath(dstPath)]);
  if (!src) { console.log(`[skip]  ${srcPath} — empty at source`); return { name, copied: 0, skipped: true }; }
  if (existing && !FORCE) {
    console.log(`[keep]  ${dstPath} already exists (use --force to overwrite)`);
    return { name, copied: 0, skipped: true };
  }
  await writePath(dstPath, src);
  const keyCount = typeof src === 'object' && src ? Object.keys(src).length : 1;
  console.log(`[copy]  ${srcPath} → ${dstPath} (${keyCount} top-level keys)`);
  return { name, copied: keyCount, skipped: false };
}

async function registerTenant() {
  const regPath = `platform/tenants/${TENANT_ID}`;
  const existing = await readPath(regPath);
  if (existing) { console.log(`[keep]  tenant registry ${regPath}`); return; }
  const rec = {
    id: TENANT_ID,
    slug: TENANT_ID.replace(/_/g, '-'),
    name: TENANT_ID === 'epl_2026' ? 'EPL 2026' : TENANT_ID,
    plan: 'pro',
    isActive: true,
    createdAt: Date.now(),
    createdBy: 'migrate-to-tenant script',
  };
  await writePath(regPath, rec);
  console.log(`[reg ]  registered tenant ${TENANT_ID} at ${regPath}`);
}

(async () => {
  console.log(`[migrate-to-tenant] target=${TENANT_ID} force=${FORCE}`);
  await registerTenant();
  const results = [];
  for (const name of SUBTREES) {
    results.push(await migrateSubtree(name));
  }
  console.log('\n[migrate-to-tenant] DONE');
  console.log(JSON.stringify({ tenant: TENANT_ID, results }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('[migrate-to-tenant] fatal:', err);
  process.exit(1);
});
