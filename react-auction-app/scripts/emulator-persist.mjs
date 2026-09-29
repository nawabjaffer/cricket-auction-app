// Saves a running RTDB emulator to disk (firebase --import format) and stops stray emulators.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AUTH = { Authorization: 'Bearer owner' };
const DEFAULT_NAMESPACE = 'e-auction-store-default-rtdb';
const FALLBACK_DB_VERSION = '4.11.2';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const run = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

export const listenerPids = port =>
  run('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN']).split('\n').filter(Boolean).map(Number);

function databaseVersion(port) {
  const [pid] = listenerPids(port);
  const match = pid && run('ps', ['-o', 'command=', '-p', String(pid)]).match(/firebase-database-emulator-v([\d.]+)\.jar/);
  return match ? match[1] : FALLBACK_DB_VERSION;
}

// Returns false when the emulator holds no data, so an empty emulator never overwrites a good save.
export async function saveEmulator({ dataDir, port, projectId }) {
  const base = `http://127.0.0.1:${port}`;
  let namespaces = [DEFAULT_NAMESPACE];
  const inspect = await fetch(`${base}/.inspect/databases.json?ns=${projectId}`, { headers: AUTH });
  if (inspect.ok) namespaces = (await inspect.json()).map(database => database.name);

  const tmpDir = `${dataDir}.tmp`;
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, 'database_export'), { recursive: true });

  let saved = 0;
  for (const ns of namespaces) {
    const probe = await fetch(`${base}/.json?ns=${ns}&shallow=true`, { headers: AUTH });
    if (!probe.ok || (await probe.json()) === null) continue;
    const data = await fetch(`${base}/.json?ns=${ns}&format=export`, { headers: AUTH });
    if (!data.ok) throw new Error(`Export of ${ns} failed: ${data.status}`);
    writeFileSync(join(tmpDir, 'database_export', `${ns}.json`), await data.text());
    saved++;
  }
  if (saved === 0) {
    rmSync(tmpDir, { recursive: true, force: true });
    return false;
  }

  writeFileSync(
    join(tmpDir, 'firebase-export-metadata.json'),
    JSON.stringify({ version: '15.15.0', database: { version: databaseVersion(port), path: 'database_export' } }, null, 2),
  );
  const backupDir = `${dataDir}.old`;
  rmSync(backupDir, { recursive: true, force: true });
  if (existsSync(dataDir)) renameSync(dataDir, backupDir);
  renameSync(tmpDir, dataDir);
  rmSync(backupDir, { recursive: true, force: true });
  return true;
}

// Stops whatever listens on the port, including the parent `firebase emulators:start` CLI.
export async function stopEmulator(port) {
  const pids = listenerPids(port);
  if (pids.length === 0) return false;

  const targets = new Set(pids);
  for (const pid of pids) {
    const parent = Number(run('ps', ['-o', 'ppid=', '-p', String(pid)]));
    const parentCommand = parent > 1 ? run('ps', ['-o', 'command=', '-p', String(parent)]) : '';
    if (/firebase/.test(parentCommand) && /emulators:start/.test(parentCommand)) targets.add(parent);
  }
  const signal = (pid, name) => {
    try {
      process.kill(pid, name);
    } catch {
      /* already gone */
    }
  };
  targets.forEach(pid => signal(pid, 'SIGTERM'));

  const deadline = Date.now() + 15_000;
  while (listenerPids(port).length > 0 && Date.now() < deadline) await sleep(300);
  listenerPids(port).forEach(pid => signal(pid, 'SIGKILL'));
  return true;
}
