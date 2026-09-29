import type { FirebaseApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';

// Set by `npm run dev -- --local`; never true in production builds.
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true';

// Default to the page host so phones on the LAN reach the emulator running on the dev machine.
const EMULATOR_HOST = import.meta.env.VITE_EMULATOR_DB_HOST || globalThis.location?.hostname || '127.0.0.1';
const EMULATOR_PORT = Number(import.meta.env.VITE_EMULATOR_DB_PORT) || 9000;

const connected = new WeakSet<Database>();

/** Single entry point for Realtime Database handles so local mode can redirect them to the emulator. */
export function openDatabase(app: FirebaseApp): Database {
  const db = getDatabase(app);
  if (USE_EMULATOR && !connected.has(db)) {
    connectDatabaseEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
    connected.add(db);
  }
  return db;
}
