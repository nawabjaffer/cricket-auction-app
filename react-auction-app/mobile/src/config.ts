// Build-time configuration for NJS Live Studio.
// The Firebase web config is public by design (same values the web app ships); access is governed by RTDB rules.

/** Production site the app talks to unless the operator pairs with another origin. */
export const DEFAULT_ORIGIN = 'https://e-auction-store.web.app';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL: 'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
};

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';

/** Title of the reusable YouTube stream (stream key) the app creates once per channel. */
export const YOUTUBE_STREAM_TITLE = 'NJS Live Studio';

export const LOG_LIMIT = 400;
