// ============================================================================
// BROADCAST FIREBASE APP — dedicated named app for zero-delay overlay reads.
// Shared by the OBS-style camera pages so they don't each re-init the SDK.
// ============================================================================

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const FB_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

const APP_NAME = 'score-obs';

const broadcastApp = getApps().find(a => a.name === APP_NAME) ?? initializeApp(FB_CONFIG, APP_NAME);

export const broadcastDb = getDatabase(broadcastApp);
