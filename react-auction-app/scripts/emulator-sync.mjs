// Copies production RTDB paths into the local emulator, at most once per interval.
// Usage: npm run emulator:sync                 (config paths, skipped if recent)
//        npm run emulator:sync -- --force      (ignore the interval)
//        npm run emulator:sync -- platform tenants/x   (explicit paths, always runs)
// Any path larger than maxMbPerPath (config) or --max-mb=N is aborted and skipped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app';
const NAMESPACE = 'e-auction-store-default-rtdb';
const TARGET = `http://127.0.0.1:${process.env.EMULATOR_DB_PORT || 9000}`;
const CONFIG_FILE = new URL('./emulator-sync.config.json', import.meta.url);
const STATE_FILE = '.emulator-sync-state.json';

const readJson = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};

const cleanPath = path => path.replace(/^\/+|\/+$/g, '');

// Aborts the download once maxBytes is exceeded, so an oversized path costs at most that much.
async function readCapped(url, maxBytes) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > maxBytes) {
      await response.body.cancel();
      return { body: null, received };
    }
    chunks.push(chunk);
  }
  return { body: Buffer.concat(chunks).toString('utf8'), received };
}

// Checks the emulator root (prod paths can be empty), polling up to waitMs for data to appear.
async function emulatorHasData(waitMs = 0) {
  const deadline = Date.now() + waitMs;
  do {
    try {
      const response = await fetch(`${TARGET}/.json?ns=${NAMESPACE}&shallow=true`, {
        headers: { Authorization: 'Bearer owner' },
      });
      if (response.ok && (await response.json()) !== null) return true;
    } catch {
      /* emulator not reachable yet */
    }
    if (Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  return false;
}

export async function syncFromProd({ paths: explicitPaths = [], force = false, maxMb } = {}) {
  const config = readJson(CONFIG_FILE, { paths: [], intervalHours: 24, maxMbPerPath: 5 });
  const maxBytes = (maxMb ?? config.maxMbPerPath ?? 5) * 1_048_576;
  const explicit = explicitPaths.map(cleanPath).filter(Boolean);
  const paths = explicit.length > 0 ? explicit : config.paths.map(cleanPath).filter(Boolean);
  if (paths.length === 0) {
    console.error('No paths to sync. Edit scripts/emulator-sync.config.json or pass paths.');
    return false;
  }

  if (explicit.length === 0 && !force) {
    const state = readJson(STATE_FILE, {});
    const ageHours = (Date.now() - (state.syncedAt || 0)) / 3_600_000;
    const samePaths = JSON.stringify(state.paths) === JSON.stringify(paths);
    // The emulator opens its port before the on-disk import finishes, so allow it a few seconds to fill.
    if (samePaths && ageHours < config.intervalHours && (await emulatorHasData(15_000))) {
      console.log(`Emulator data synced ${ageHours.toFixed(1)}h ago (interval ${config.intervalHours}h); skipping prod download.`);
      return false;
    }
  }

  let totalBytes = 0;
  for (const path of paths) {
    const { body, received } = await readCapped(`${SOURCE}/${path}.json`, maxBytes).catch(error => {
      throw new Error(`Could not read ${path}: ${error.message}`);
    });
    totalBytes += received;
    if (body === null) {
      console.warn(`Skipped ${path}: larger than the ${(maxBytes / 1_048_576).toFixed(1)} MB cap (aborted after ${(received / 1_048_576).toFixed(2)} MB).`);
      continue;
    }
    const write = await fetch(`${TARGET}/${path}.json?ns=${NAMESPACE}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body,
    });
    if (!write.ok) throw new Error(`Could not write ${path} to the emulator (is it running?): ${write.status}`);
    console.log(`Synced ${path} (${(Buffer.byteLength(body) / 1_048_576).toFixed(2)} MB)`);
  }

  if (explicit.length === 0) writeFileSync(STATE_FILE, JSON.stringify({ syncedAt: Date.now(), paths }));
  console.log(`Prod download for this sync: ${(totalBytes / 1_048_576).toFixed(2)} MB`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const maxArg = args.find(arg => arg.startsWith('--max-mb='));
  const maxMb = maxArg ? Number(maxArg.split('=')[1]) : undefined;
  syncFromProd({ paths: args.filter(arg => !arg.startsWith('--')), force, maxMb }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
