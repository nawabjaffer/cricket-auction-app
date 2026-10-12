// ============================================================================
// CARROM SERVICE — singleton RTDB access for the carrom scorer module.
// Mirrors Football/Kabaddi conventions; every path lives under the tenant's
// `tenants/{id}/carrom` namespace passed in through `initialize()`.
// ============================================================================

import { ref, get, set, update, remove, onValue, type Database } from 'firebase/database';
import { MatchIndex } from '../matchIndex';
import {
  DEFAULT_CARROM_OVERLAY_CONFIG, normalizeCarromLive, normalizeCarromRules,
} from '../../types/carrom';
import type {
  CarromTeam, CarromMatchSetup, CarromLiveState, CarromOverlayControl,
  CarromOverlayConfig, CarromRulesConfig,
} from '../../types/carrom';

class CarromService {
  private readonly matchIndex = new MatchIndex<CarromMatchSetup>(() => this.ensureDb(), () => this.basePath);
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, tenantCarromPath: string): void {
    this.db = db;
    this.basePath = tenantCarromPath;
  }

  get isReady(): boolean {
    return !!this.db && !!this.basePath;
  }

  private ensureDb(): Database {
    if (!this.db || !this.basePath) throw new Error('CarromService not initialized');
    return this.db;
  }

  /** Firebase rejects `undefined`; strip it recursively before every write. */
  private clean<T>(value: T): T {
    if (Array.isArray(value)) return value.map(v => this.clean(v)) as T;
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        out[k] = this.clean(v);
      }
      return out as T;
    }
    return value;
  }

  // ── Teams / entries ─────────────────────────────────────────────────────────

  async saveTeam(team: CarromTeam): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/teams/${team.id}`), this.clean(team));
  }

  subscribeTeams(cb: (teams: CarromTeam[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/teams`), snap => {
      const val = (snap.val() as Record<string, CarromTeam>) ?? {};
      cb(Object.values(val)
        .filter(t => !!t?.id)
        .map(t => ({ ...t, members: Array.isArray(t.members) ? t.members : [] }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    });
  }

  async deleteTeam(teamId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/teams/${teamId}`));
  }

  // ── Matches ────────────────────────────────────────────────────────────────

  async saveMatch(match: CarromMatchSetup): Promise<void> {
    await this.matchIndex.save(match.id, this.clean(match));
  }

  async getMatches(): Promise<CarromMatchSetup[]> {
    return this.matchIndex.list();
  }

  subscribeMatches(cb: (matches: CarromMatchSetup[]) => void): () => void {
    return this.matchIndex.subscribe(cb);
  }

  subscribeMatch(matchId: string, cb: (match: CarromMatchSetup | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/setup`), snap => {
      cb(snap.exists() ? (snap.val() as CarromMatchSetup) : null);
    });
  }

  async updateMatch(matchId: string, patch: Partial<CarromMatchSetup>): Promise<void> {
    const db = this.ensureDb();
    await update(ref(db, `${this.basePath}/matches/${matchId}/setup`), this.clean({ ...patch, updatedAt: Date.now() }));
  }

  async deleteMatch(matchId: string): Promise<void> {
    const active = await this.getActiveMatch();
    await this.matchIndex.remove(matchId);
    if (active === matchId) await this.setActiveMatch(null);
  }

  // ── Active match pointer (single overlay mode / OBS auto-follow) ──────────

  async setActiveMatch(matchId: string | null): Promise<void> {
    const db = this.ensureDb();
    if (!matchId) {
      await remove(ref(db, `${this.basePath}/activeMatch`));
      return;
    }
    await set(ref(db, `${this.basePath}/activeMatch`), { matchId, updatedAt: Date.now() });
  }

  async getActiveMatch(): Promise<string | null> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/activeMatch/matchId`));
    return snap.exists() ? (snap.val() as string) : null;
  }

  subscribeActiveMatch(cb: (matchId: string | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/activeMatch/matchId`), snap => {
      cb(snap.exists() ? (snap.val() as string) : null);
    });
  }

  // ── Live state ────────────────────────────────────────────────────────────

  async getLive(matchId: string): Promise<CarromLiveState> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/matches/${matchId}/live`));
    return normalizeCarromLive(snap.exists() ? (snap.val() as Partial<CarromLiveState>) : null, matchId);
  }

  async saveLive(live: CarromLiveState): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${live.matchId}/live`), this.clean({ ...live, lastUpdated: Date.now() }));
  }

  subscribeLive(matchId: string, cb: (live: CarromLiveState | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/live`), snap => {
      cb(snap.exists() ? normalizeCarromLive(snap.val() as Partial<CarromLiveState>, matchId) : null);
    });
  }

  // ── Overlay control (celebrations) ────────────────────────────────────────

  async triggerOverlay(matchId: string, control: CarromOverlayControl): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), this.clean(control));
  }

  async clearOverlay(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), { activeOverlay: 'none', lastUpdated: Date.now() });
  }

  subscribeOverlay(matchId: string, cb: (control: CarromOverlayControl | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/overlay`), snap => {
      cb(snap.exists() ? (snap.val() as CarromOverlayControl) : null);
    });
  }

  // ── Overlay config ────────────────────────────────────────────────────────

  async getOverlayConfig(): Promise<CarromOverlayConfig> {
    const db = this.ensureDb();
    const snap = await get(ref(db, `${this.basePath}/overlayConfig`));
    return { ...DEFAULT_CARROM_OVERLAY_CONFIG, ...(snap.exists() ? snap.val() as Partial<CarromOverlayConfig> : {}) };
  }

  async saveOverlayConfig(config: CarromOverlayConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/overlayConfig`), this.clean(config));
  }

  subscribeOverlayConfig(cb: (config: CarromOverlayConfig) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/overlayConfig`), snap => {
      cb({ ...DEFAULT_CARROM_OVERLAY_CONFIG, ...(snap.exists() ? snap.val() as Partial<CarromOverlayConfig> : {}) });
    });
  }

  // ── Rules (written by Platform Admin, read by scorer + overlay) ──────────

  async saveRules(rules: CarromRulesConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/rules`), this.clean(normalizeCarromRules(rules)));
  }

  subscribeRules(cb: (rules: CarromRulesConfig) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/rules`), snap => {
      cb(normalizeCarromRules(snap.exists() ? snap.val() as Partial<CarromRulesConfig> : null));
    });
  }
}

export const carromService = new CarromService();
