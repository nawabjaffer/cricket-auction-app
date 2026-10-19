// Firebase Realtime Database access (same project the web app uses).
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { FIREBASE_CONFIG } from '../config';

const APP_NAME = 'njs-live-studio';

let app: FirebaseApp | null = null;
let database: Database | null = null;

export function getDb(): Database {
  if (!database) {
    app = getApps().find(candidate => candidate.name === APP_NAME) ?? initializeApp(FIREBASE_CONFIG, APP_NAME);
    database = getDatabase(app);
  }
  return database;
}
