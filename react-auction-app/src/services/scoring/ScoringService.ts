// ============================================================================
// SCORING SERVICE — Factory + match management + career stats aggregation
// Central service that picks the right adapter per match and provides
// convenience methods for match lifecycle.
// ============================================================================

import { ref, get, set, onValue, remove, type Database } from 'firebase/database';
import { ManualScoringAdapter } from './ManualScoringAdapter';
import { CricHeroesAdapter } from './CricHeroesAdapter';
import type {
  IScoringAdapter, ScoringProvider, MatchSetup, MatchScoringConfig,
  LiveScore, PlayerMatchStats, PlayerCareerStats,
  ScoringOverlayConfig, ScoringAd, OverlayControlState, MatchLineup,
  PreMatchState, Innings,
} from '../../types/scoring';
import { createEmptyCareerStats } from '../../types/scoring';

export class ScoringService {
  private db: Database | null = null;
  private basePath = '';
  private manualAdapter: ManualScoringAdapter | null = null;
  private cricHeroesAdapter: CricHeroesAdapter = new CricHeroesAdapter();
  private adapters = new Map<string, IScoringAdapter>();

  /** Initialize with Firebase database and tenant scoring path */
  initialize(db: Database, tenantScoringPath: string): void {
    this.db = db;
    this.basePath = tenantScoringPath;
    this.manualAdapter = new ManualScoringAdapter(db, tenantScoringPath);
    this.adapters.set('manual', this.manualAdapter);
    this.adapters.set('cricheroes', this.cricHeroesAdapter);
  }

  get manual(): ManualScoringAdapter {
    if (!this.manualAdapter) throw new Error('ScoringService not initialized');
    return this.manualAdapter;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('ScoringService not initialized');
    return this.db;
  }

  private stripUndefinedDeep<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((item) => this.stripUndefinedDeep(item)) as T;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        out[k] = this.stripUndefinedDeep(v);
      }
      return out as T;
    }
    return value;
  }

  // ── Adapter Selection ──────────────────────────────────────────────────────

  async getAdapterForMatch(matchId: string): Promise<IScoringAdapter> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/config`));
    if (!snapshot.exists()) return this.manual;
    const config = snapshot.val() as MatchScoringConfig;
    const adapter = this.adapters.get(config.provider);
    if (!adapter || !adapter.isConfigured()) return this.manual;
    return adapter;
  }

  getAvailableProviders(): { provider: ScoringProvider; name: string; configured: boolean }[] {
    return Array.from(this.adapters.values()).map(a => ({
      provider: a.provider,
      name: a.getProviderName(),
      configured: a.isConfigured(),
    }));
  }

  registerAdapter(adapter: IScoringAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  // ── Match Management ───────────────────────────────────────────────────────

  async createMatch(match: MatchSetup): Promise<string> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${match.id}/setup`), this.stripUndefinedDeep(match));
    return match.id;
  }

  async updateMatch(matchId: string, updates: Partial<MatchSetup>): Promise<void> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/setup`));
    if (!snapshot.exists()) throw new Error('Match not found');
    const existing = snapshot.val();
    await set(ref(db, `${this.basePath}/matches/${matchId}/setup`), this.stripUndefinedDeep({
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    }));
  }

  async getMatch(matchId: string): Promise<MatchSetup | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/setup`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async getAllMatches(): Promise<MatchSetup[]> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches`));
    if (!snapshot.exists()) return [];
    const data = snapshot.val() as Record<string, { setup?: MatchSetup }>;
    return Object.values(data)
      .map(m => m.setup)
      .filter((s): s is MatchSetup => !!s)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async deleteMatch(matchId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/matches/${matchId}`));
  }

  // ── Venue Directory ───────────────────────────────────────────────────────

  async saveVenue(venue: string): Promise<void> {
    const db = this.ensureDb();
    const normalized = venue.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) return;
    await set(ref(db, `${this.basePath}/meta/venues/${key}`), {
      name: normalized,
      updatedAt: Date.now(),
    });
  }

  async getSavedVenues(): Promise<string[]> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/meta/venues`));
    if (!snapshot.exists()) return [];
    const data = snapshot.val() as Record<string, { name?: string }>;
    return Object.values(data)
      .map(v => (v?.name || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  subscribeMatches(callback: (matches: MatchSetup[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches`), (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const data = snapshot.val() as Record<string, { setup?: MatchSetup }>;
      const matches = Object.values(data)
        .map(m => m.setup)
        .filter((s): s is MatchSetup => !!s)
        .sort((a, b) => b.createdAt - a.createdAt);
      callback(matches);
    });
  }

  // ── Active Match Pointer (Single Overlay Mode) ─────────────────────────────
  // Tenant-wide "currently active" match id consumed by the universal overlay/
  // dock/scorer link so a single link can follow whichever match is started.

  async setActiveMatch(matchId: string | null): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/activeMatch`), { matchId, updatedAt: Date.now() });
  }

  async getActiveMatch(): Promise<string | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/activeMatch/matchId`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  subscribeActiveMatch(callback: (matchId: string | null) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/activeMatch/matchId`), (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    });
  }

  /** Lightweight "continue" start used by the Dock/Scorer Single Overlay Mode
   * quick actions — marks the match live and pins it as active. The Matches
   * admin tab's Start button additionally runs full squad/ceremony automation. */
  async startMatchQuick(matchId: string): Promise<void> {
    await this.updateMatch(matchId, { status: 'live' });
    await this.setActiveMatch(matchId);
  }

  // ── Match Config (scoring provider per match) ──────────────────────────────

  async configureMatchScoring(matchId: string, config: MatchScoringConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/config`), this.stripUndefinedDeep(config));
  }

  async getMatchConfig(matchId: string): Promise<MatchScoringConfig | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/config`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  // ── Lineup ─────────────────────────────────────────────────────────────────

  async saveLineup(matchId: string, lineup: MatchLineup): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/lineups/${lineup.teamId}`), this.stripUndefinedDeep(lineup));
  }

  async getLineup(matchId: string, teamId: string): Promise<MatchLineup | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/lineups/${teamId}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  // ── Player Match Notes/Stats ────────────────────────────────────────────────

  async savePlayerMatchNote(matchId: string, playerId: string, note: { stat: string; value: string }): Promise<void> {
    const db = this.ensureDb();
    const path = `${this.basePath}/matches/${matchId}/playerNotes/${playerId}`;
    const snapshot = await get(ref(db, path));
    const existing = snapshot.exists() ? snapshot.val() : { stats: [] };
    const stats = Array.isArray(existing.stats) ? existing.stats : [];
    // Replace if same stat key exists, otherwise add
    const idx = stats.findIndex((s: { stat: string }) => s.stat === note.stat);
    if (idx >= 0) {
      stats[idx] = note;
    } else {
      stats.push(note);
    }
    await set(ref(db, path), { stats, lastUpdated: Date.now() });
  }

  async getPlayerMatchNotes(matchId: string): Promise<Record<string, { stats: { stat: string; value: string }[] }>> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/playerNotes`));
    return snapshot.exists() ? snapshot.val() : {};
  }

  async deletePlayerMatchNote(matchId: string, playerId: string, statKey: string): Promise<void> {
    const db = this.ensureDb();
    const path = `${this.basePath}/matches/${matchId}/playerNotes/${playerId}`;
    const snapshot = await get(ref(db, path));
    if (!snapshot.exists()) return;
    const existing = snapshot.val();
    const stats = Array.isArray(existing.stats) ? existing.stats.filter((s: { stat: string }) => s.stat !== statKey) : [];
    await set(ref(db, path), { stats, lastUpdated: Date.now() });
  }

  // ── Innings ─────────────────────────────────────────────────────────────────

  async getInnings(matchId: string, inningsNumber: 1 | 2): Promise<Innings | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/innings/${inningsNumber}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async saveInnings(matchId: string, inningsNumber: 1 | 2, innings: Innings): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/innings/${inningsNumber}`), this.stripUndefinedDeep(innings));
  }

  async saveLiveScore(matchId: string, live: LiveScore): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/live`), this.stripUndefinedDeep(live));
  }

  // ── Live Score Subscription ────────────────────────────────────────────────

  subscribeLiveScore(matchId: string, callback: (score: LiveScore) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/live`), (snapshot) => {
      if (snapshot.exists()) callback(snapshot.val());
    });
  }

  // ── Overlay Control ────────────────────────────────────────────────────────

  async setOverlayControl(matchId: string, control: Partial<OverlayControlState>): Promise<void> {
    const db = this.ensureDb();
    const current = await get(ref(db, `${this.basePath}/matches/${matchId}/overlay`));
    const existing = current.exists() ? current.val() : { activeOverlay: 'none' };
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), this.stripUndefinedDeep({
      ...existing,
      ...control,
      lastUpdated: Date.now(),
    }));
  }

  subscribeOverlayControl(matchId: string, callback: (control: OverlayControlState) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/overlay`), (snapshot) => {
      if (snapshot.exists()) callback(snapshot.val());
    });
  }

  // ── Ads Management ─────────────────────────────────────────────────────────

  async saveAd(ad: ScoringAd): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/ads/${ad.id}`), this.stripUndefinedDeep(ad));
  }

  async deleteAd(adId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/ads/${adId}`));
  }

  async getAds(): Promise<ScoringAd[]> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/ads`));
    if (!snapshot.exists()) return [];
    const data = snapshot.val() as Record<string, ScoringAd>;
    return Object.values(data).sort((a, b) => a.order - b.order);
  }

  subscribeAds(callback: (ads: ScoringAd[]) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/ads`), (snapshot) => {
      if (!snapshot.exists()) { callback([]); return; }
      const data = snapshot.val() as Record<string, ScoringAd>;
      callback(Object.values(data).sort((a, b) => a.order - b.order));
    });
  }

  // ── Overlay Config (persisted settings) ────────────────────────────────────

  async saveOverlayConfig(config: ScoringOverlayConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/overlayConfig`), this.stripUndefinedDeep(config));
  }

  async getOverlayConfig(): Promise<ScoringOverlayConfig | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/overlayConfig`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  subscribeOverlayConfig(callback: (config: ScoringOverlayConfig) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/overlayConfig`), (snapshot) => {
      if (snapshot.exists()) callback(snapshot.val());
    });
  }

  // ── Pre-Match State ─────────────────────────────────────────────────────

  async savePreMatchState(matchId: string, state: PreMatchState): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/preMatch`), this.stripUndefinedDeep(state));
  }

  async getPreMatchState(matchId: string): Promise<PreMatchState | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/preMatch`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  subscribePreMatchState(matchId: string, callback: (state: PreMatchState) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/preMatch`), (snapshot) => {
      if (snapshot.exists()) callback(snapshot.val());
    });
  }

  async updatePreMatchPhase(matchId: string, phase: PreMatchState['phase']): Promise<void> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/preMatch`));
    const existing = snapshot.exists() ? snapshot.val() : {
      matchId,
      phase: 'idle',
      revealedPlayersTeamA: [],
      revealedPlayersTeamB: [],
    };
    await set(ref(db, `${this.basePath}/matches/${matchId}/preMatch`), this.stripUndefinedDeep({
      ...existing,
      phase,
      lastUpdated: Date.now(),
    }));
  }

  async revealPlayer(matchId: string, team: 'teamA' | 'teamB', playerId: string): Promise<void> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/preMatch`));
    if (!snapshot.exists()) return;
    const state = snapshot.val() as PreMatchState;
    const key = team === 'teamA' ? 'revealedPlayersTeamA' : 'revealedPlayersTeamB';
    const list = [...(state[key] || [])];
    if (!list.includes(playerId)) list.push(playerId);
    await set(ref(db, `${this.basePath}/matches/${matchId}/preMatch/${key}`), list);
  }

  // ── Career Stats Aggregation ───────────────────────────────────────────────

  async aggregatePlayerCareerStats(playerId: string): Promise<PlayerCareerStats> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/playerStats/${playerId}/matches`));
    if (!snapshot.exists()) return createEmptyCareerStats(playerId);

    const matchStats = Object.values(snapshot.val()) as PlayerMatchStats[];
    return this.computeCareerStats(playerId, matchStats);
  }

  async saveCareerStats(playerId: string, stats: PlayerCareerStats): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/playerStats/${playerId}/career`), this.stripUndefinedDeep(stats));
  }

  async getCareerStats(playerId: string): Promise<PlayerCareerStats | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/playerStats/${playerId}/career`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  private computeCareerStats(playerId: string, matchStats: PlayerMatchStats[]): PlayerCareerStats {
    const career = createEmptyCareerStats(playerId);
    career.matchesPlayed = matchStats.length;

    for (const ms of matchStats) {
      if (ms.batting) {
        career.batting.innings++;
        career.batting.runs += ms.batting.runs;
        career.batting.fours += ms.batting.fours;
        career.batting.sixes += ms.batting.sixes;
        if (ms.batting.isNotOut) career.batting.notOuts++;
        if (ms.batting.runs > career.batting.highestScore) {
          career.batting.highestScore = ms.batting.runs;
        }
        if (ms.batting.runs >= 50 && ms.batting.runs < 100) career.batting.fifties++;
        if (ms.batting.runs >= 100) career.batting.hundreds++;
      }
      if (ms.bowling) {
        career.bowling.innings++;
        career.bowling.overs += ms.bowling.overs;
        career.bowling.wickets += ms.bowling.wickets;
        if (ms.bowling.wickets >= 3) career.bowling.threeWickets++;
        if (ms.bowling.wickets >= 5) career.bowling.fiveWickets++;
        // Track best bowling
        const currentBest = career.bowling.bestBowling.split('/');
        const bestW = parseInt(currentBest[0]) || 0;
        const bestR = parseInt(currentBest[1]) || 999;
        if (ms.bowling.wickets > bestW || (ms.bowling.wickets === bestW && ms.bowling.runs < bestR)) {
          career.bowling.bestBowling = `${ms.bowling.wickets}/${ms.bowling.runs}`;
        }
      }
      if (ms.fielding) {
        career.fielding.catches += ms.fielding.catches;
        career.fielding.runOuts += ms.fielding.runOuts;
        career.fielding.stumpings += ms.fielding.stumpings;
      }
    }

    // Compute averages
    const dismissals = career.batting.innings - career.batting.notOuts;
    career.batting.average = dismissals > 0
      ? Math.round((career.batting.runs / dismissals) * 100) / 100
      : career.batting.runs;
    const totalBalls = matchStats.reduce((sum, ms) => sum + (ms.batting?.balls || 0), 0);
    career.batting.strikeRate = totalBalls > 0
      ? Math.round((career.batting.runs / totalBalls) * 100 * 100) / 100
      : 0;

    const totalBowlingRuns = matchStats.reduce((sum, ms) => sum + (ms.bowling?.runs || 0), 0);
    career.bowling.average = career.bowling.wickets > 0
      ? Math.round((totalBowlingRuns / career.bowling.wickets) * 100) / 100
      : 0;
    const totalOversDecimal = career.bowling.overs;
    const totalBowlingBalls = Math.floor(totalOversDecimal) * 6 + Math.round((totalOversDecimal % 1) * 10);
    career.bowling.economy = totalBowlingBalls > 0
      ? Math.round((totalBowlingRuns / totalBowlingBalls) * 6 * 100) / 100
      : 0;

    career.lastUpdated = Date.now();
    return career;
  }

  // ── Field Placement ──

  async getFieldPlacements(matchId: string): Promise<import('../../types/scoring').FieldPlacement[]> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/fieldPlacements`));
    return snapshot.exists() ? Object.values(snapshot.val()) : [];
  }

  async saveFieldPlacement(matchId: string, placement: import('../../types/scoring').FieldPlacement): Promise<void> {
    const db = this.ensureDb();
    await set(
      ref(db, `${this.basePath}/matches/${matchId}/fieldPlacements/${placement.id}`),
      this.stripUndefinedDeep(placement)
    );
  }

  async setActiveFieldPlacement(matchId: string, placementId: string | null): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/activeFieldPlacement`), placementId);
  }

  async getActiveFieldPlacement(matchId: string): Promise<string | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/activeFieldPlacement`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  async deleteFieldPlacement(matchId: string, placementId: string): Promise<void> {
    const db = this.ensureDb();
    await remove(ref(db, `${this.basePath}/matches/${matchId}/fieldPlacements/${placementId}`));
  }
}

/** Singleton instance */
export const scoringService = new ScoringService();
