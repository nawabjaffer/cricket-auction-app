// Usage: npm run dev:local | npm run dev:prod | npm run dev -- --local
// Local extras: --sync forces a prod->emulator download, --no-sync skips it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { syncFromProd } from './emulator-sync.mjs';
import { listenerPids, saveEmulator, stopEmulator } from './emulator-persist.mjs';

// npm 11 drops bare flags (`npm run dev --local`); pass them after `--` or use dev:local / dev:prod.
const args = new Set(process.argv.slice(2));
const wantsLocal = args.has('--local') || process.env.npm_config_local === 'true';
const wantsProd = args.has('--prod') || process.env.npm_config_prod === 'true';
const forceSync = args.has('--sync');
const skipSync = args.has('--no-sync');

if (wantsLocal && wantsProd) {
  console.error('Choose either --local or --prod, not both.');
  process.exit(1);
}

const mode = wantsLocal ? 'local' : 'prod';
const PROJECT_ID = 'e-auction-store';
const EMULATOR_PORT = 9000;
const DATA_DIR = '.emulator-data';
const AUTOSAVE_MS = 120_000;

spawnSync('npm', ['run', 'package:cricheroes-extension'], { stdio: 'inherit' });

const children = [];
let shuttingDown = false;
let emulatorRunning = false;
let autosaveTimer;
let saving = Promise.resolve();

// Saves are serialized so an autosave and the shutdown save never write the folder together.
function saveData() {
  saving = saving.then(() => saveEmulator({ dataDir: DATA_DIR, port: EMULATOR_PORT, projectId: PROJECT_ID }));
  return saving.catch(error => {
    console.error(`Could not save emulator data: ${error.message}`);
    return false;
  });
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(autosaveTimer);
  setTimeout(() => process.exit(code), 15_000).unref();
  if (mode === 'local' && emulatorRunning && (await saveData())) console.log(`Emulator data saved to ${DATA_DIR}.`);
  children.forEach(child => child.kill('SIGINT'));
  await Promise.all(children.map(child => new Promise(resolve => (child.exitCode === null ? child.once('exit', resolve) : resolve()))));
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

function waitForPort(port, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`Emulator did not open port ${port}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function startVite(useEmulator) {
  const vite = spawn('npx', ['vite'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_USE_EMULATOR: String(useEmulator) },
  });
  children.push(vite);
  vite.on('exit', code => shutdown(code ?? 0));
}

if (mode === 'prod') {
  console.log('\n▶ dev:prod — using the LIVE Firebase Realtime Database (reads and writes are billed).\n');
  startVite(false);
} else {
  console.log(`\n▶ dev:local — using the Firebase Emulator Suite (Realtime Database on :${EMULATOR_PORT}, UI on :4000). No cloud traffic.\n`);
  mkdirSync(DATA_DIR, { recursive: true });

  if (listenerPids(EMULATOR_PORT).length > 0) {
    console.log(`An emulator is already running on :${EMULATOR_PORT}; saving its data, then restarting it.`);
    try {
      console.log((await saveEmulator({ dataDir: DATA_DIR, port: EMULATOR_PORT, projectId: PROJECT_ID })) ? `Saved its data to ${DATA_DIR}.` : 'It held no data; nothing to save.');
    } catch (error) {
      console.error(`Not stopping the running emulator because its data could not be saved: ${error.message}`);
      process.exit(1);
    }
    await stopEmulator(EMULATOR_PORT);
  }

  // Persistence is handled by saveData(); --export-on-exit is skipped because a killed CLI never runs it.
  const emulatorArgs = ['emulators:start', '--only', 'database', '--project', PROJECT_ID];
  if (existsSync(`${DATA_DIR}/firebase-export-metadata.json`)) emulatorArgs.push(`--import=${DATA_DIR}`);
  const emulator = spawn('firebase', emulatorArgs, { stdio: 'inherit' });
  children.push(emulator);
  emulator.on('exit', code => {
    emulatorRunning = false;
    if (!shuttingDown) { console.error('Firebase emulator stopped.'); shutdown(code ?? 1); }
  });
  waitForPort(EMULATOR_PORT)
    .then(async () => {
      emulatorRunning = true;
      autosaveTimer = setInterval(saveData, AUTOSAVE_MS);
      if (!skipSync) {
        try {
          await syncFromProd({ force: forceSync });
        } catch (error) {
          console.error(`Prod sync failed (continuing with existing emulator data): ${error.message}`);
        }
      }
      startVite(true);
    })
    .catch(error => { console.error(error.message); shutdown(1); });
}
