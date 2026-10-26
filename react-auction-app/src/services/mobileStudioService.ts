// ============================================================================
// MOBILE STUDIO SERVICE — singleton RTDB access for the Android Live Studio
// integration: the per-game studio profile the phones sync from, and the
// presence records the phones report back.
//
// Layout (tenant scoped): tenants/{id}/mobileStudio/{game}/{profile|devices}
// No secrets are ever written here — see the contract in types/mobileStudio.
// ============================================================================

import { get, limitToLast, onValue, query, ref, remove, set, type Database } from 'firebase/database';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import { tenantPath } from './tenantPath';
import {
  STUDIO_PROFILE_VERSION, defaultStudioProfile, normalizeDevices, normalizeStudioProfile,
  sortMatchSummaries, studioSportNamespace, summarizeMatchSetup,
  normalizeMobileScoringOptions, type MobileScoringOptions,
  normalizeMobileHighlights, type MobileHighlight, type MobileHighlightOptions,
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

  subscribeScoringOptions(game: StudioGameType, cb: (options: MobileScoringOptions) => void, onError?: (error: Error) => void): () => void {
    return onValue(ref(this.ensureDb(), tenantPath(`mobileStudio/${game}/scoringOptions`)), snapshot => {
      cb(normalizeMobileScoringOptions(snapshot.val()));
    }, error => onError?.(error));
  }

  async saveScoringOptions(game: StudioGameType, value: MobileScoringOptions): Promise<void> {
    await set(ref(this.ensureDb(), tenantPath(`mobileStudio/${game}/scoringOptions`)), normalizeMobileScoringOptions(value));
  }

  subscribeHighlightOptions(cb: (options: MobileHighlightOptions) => void, onError?: (error: Error) => void): () => void {
    return onValue(ref(this.ensureDb(), tenantPath('mobileStudio/cricket/highlightOptions')), snapshot => {
      cb(normalizeMobileHighlights(snapshot.val()));
    }, error => onError?.(error));
  }

  async saveHighlightOptions(value: MobileHighlightOptions): Promise<void> {
    await set(ref(this.ensureDb(), tenantPath('mobileStudio/cricket/highlightOptions')), normalizeMobileHighlights(value));
  }

  subscribeHighlights(matchId: string, cb: (clips: MobileHighlight[]) => void, onError?: (error: Error) => void): () => void {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(matchId)) throw new Error('Invalid match.');
    const source = query(ref(this.ensureDb(), tenantPath(`scoring/matches/${matchId}/mobileHighlights`)), limitToLast(100));
    return onValue(source, snapshot => {
      const clips = Object.values(snapshot.val() ?? {}).filter((value): value is MobileHighlight => {
        if (!value || typeof value !== 'object') return false;
        const clip = value as MobileHighlight;
        return clip.matchId === matchId && /^[a-zA-Z0-9_-]{1,64}$/.test(clip.id) && typeof clip.url === 'string'
          && (clip.url.startsWith('https://firebasestorage.googleapis.com/') || (clip.status === 'uploading' && clip.url === '')) && Number.isFinite(clip.createdAt);
      });
      cb(clips.sort((left, right) => right.createdAt - left.createdAt));
    }, error => onError?.(error));
  }

  async deleteHighlight(clip: MobileHighlight): Promise<void> {
    const expected = tenantPath(`highlights/${clip.matchId}/${clip.deviceId}/${clip.id}.mp4`);
    if (clip.storagePath !== expected || ![clip.matchId, clip.deviceId, clip.id].every(value => /^[a-zA-Z0-9_-]{1,64}$/.test(value))) throw new Error('Invalid highlight.');
    try { await deleteObject(storageRef(getStorage(this.ensureDb().app), expected)); }
    catch (error) { if ((error as { code?: string }).code !== 'storage/object-not-found') throw error; }
    await remove(ref(this.ensureDb(), tenantPath(`scoring/matches/${clip.matchId}/mobileHighlights/${clip.id}`)));
  }

  /** Reads each match's small `setup` node through the sport's id-only `matchIndex`. */
  async listMatches(game: StudioGameType, limit = 40): Promise<StudioMatchSummary[]> {
    const db = this.ensureDb();
    const base = tenantPath(studioSportNamespace(game));
    const pageSize = Math.min(120, Math.max(1, Math.round(limit)));
    const [index, active] = await Promise.all([
      get(query(ref(db, `${base}/matchIndex`), limitToLast(pageSize))),
      get(ref(db, `${base}/activeMatch/matchId`)),
    ]);
    const ids = index.exists() ? Object.keys(index.val() as Record<string, unknown>) : [];
    const activeId = active.val();
    if (typeof activeId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(activeId) && !ids.includes(activeId)) ids.push(activeId);
    const setups = await Promise.all(ids.map(async id => {
      const snap = await get(ref(db, `${base}/matches/${id}/setup`));
      return snap.exists() ? summarizeMatchSetup(id, snap.val()) : null;
    }));
    const sorted = sortMatchSummaries(setups.filter((item): item is StudioMatchSummary => item !== null));
    const onAir = sorted.find(item => item.id === activeId);
    return [...(onAir ? [onAir] : []), ...sorted.filter(item => item.id !== activeId)].slice(0, pageSize);
  }
}

export const mobileStudioService = new MobileStudioService();
