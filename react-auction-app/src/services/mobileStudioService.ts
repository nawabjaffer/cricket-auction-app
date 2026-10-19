// ============================================================================
// MOBILE STUDIO SERVICE — singleton RTDB access for the Android Live Studio
// integration: the per-game studio profile the phones sync from, and the
// presence records the phones report back.
//
// Layout (tenant scoped): tenants/{id}/mobileStudio/{game}/{profile|devices}
// No secrets are ever written here — see the contract in types/mobileStudio.
// ============================================================================

import { get, onValue, ref, set, type Database } from 'firebase/database';
import { tenantPath } from './tenantPath';
import {
  STUDIO_PROFILE_VERSION, defaultStudioProfile, normalizeDevices, normalizeStudioProfile,
  sortMatchSummaries, studioSportNamespace, summarizeMatchSetup,
  type StudioDevicePresence, type StudioGameType, type StudioMatchSummary, type StudioProfile,
} from '../types/mobileStudio';

class MobileStudioService {
  private db: Database | null = null;

  initialize(db: Database): void {
    this.db = db;
  }

  get isReady(): boolean {
    return !!this.db;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('MobileStudioService not initialized');
    return this.db;
  }

  private profilePath(game: StudioGameType): string {
    return tenantPath(`mobileStudio/${game}/profile`);
  }

  private devicesPath(game: StudioGameType): string {
    return tenantPath(`mobileStudio/${game}/devices`);
  }

  /** Subscribes to the profile; an unsaved tenant yields the default profile. */
  subscribeProfile(game: StudioGameType, cb: (profile: StudioProfile) => void, onError?: (error: Error) => void): () => void {
    return onValue(ref(this.ensureDb(), this.profilePath(game)), snap => {
      cb(snap.exists() ? normalizeStudioProfile(snap.val(), game) : defaultStudioProfile(game));
    }, error => onError?.(error));
  }

  async saveProfile(game: StudioGameType, profile: StudioProfile): Promise<StudioProfile> {
    const normalized = normalizeStudioProfile({ ...profile, version: STUDIO_PROFILE_VERSION, updatedAt: Date.now() }, game);
    // JSON round-trip drops any stray `undefined` (RTDB rejects it).
    await set(ref(this.ensureDb(), this.profilePath(game)), JSON.parse(JSON.stringify(normalized)));
    return normalized;
  }

  subscribeDevices(game: StudioGameType, cb: (devices: StudioDevicePresence[]) => void): () => void {
    return onValue(ref(this.ensureDb(), this.devicesPath(game)), snap => {
      cb(snap.exists() ? normalizeDevices(snap.val()) : []);
    });
  }

  /** Reads each match's small `setup` node through the sport's id-only `matchIndex`. */
  async listMatches(game: StudioGameType, limit = 40): Promise<StudioMatchSummary[]> {
    const db = this.ensureDb();
    const base = tenantPath(studioSportNamespace(game));
    const index = await get(ref(db, `${base}/matchIndex`));
    const ids = index.exists() ? Object.keys(index.val() as Record<string, unknown>) : [];
    const setups = await Promise.all(ids.map(async id => {
      const snap = await get(ref(db, `${base}/matches/${id}/setup`));
      return snap.exists() ? summarizeMatchSetup(id, snap.val()) : null;
    }));
    return sortMatchSummaries(setups.filter((item): item is StudioMatchSummary => item !== null)).slice(0, limit);
  }
}

export const mobileStudioService = new MobileStudioService();
