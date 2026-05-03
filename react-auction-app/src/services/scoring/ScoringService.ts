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
  LiveScore, MatchScore, PlayerMatchStats, PlayerCareerStats,
  ScoringOverlayConfig, ScoringAd, OverlayControlState, MatchLineup,
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
    await set(ref(db, `${this.basePath}/matches/${match.id}/setup`), match);
    return match.id;
  }

  async updateMatch(matchId: string, updates: Partial<MatchSetup>): Promise<void> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/setup`));
    if (!snapshot.exists()) throw new Error('Match not found');
    const existing = snapshot.val();
    await set(ref(db, `${this.basePath}/matches/${matchId}/setup`), {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    });
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

  // ── Match Config (scoring provider per match) ──────────────────────────────

  async configureMatchScoring(matchId: string, config: MatchScoringConfig): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/config`), config);
  }

  async getMatchConfig(matchId: string): Promise<MatchScoringConfig | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/config`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  // ── Lineup ─────────────────────────────────────────────────────────────────

  async saveLineup(matchId: string, lineup: MatchLineup): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/lineups/${lineup.teamId}`), lineup);
  }

  async getLineup(matchId: string, teamId: string): Promise<MatchLineup | null> {
    const db = this.ensureDb();
    const snapshot = await get(ref(db, `${this.basePath}/matches/${matchId}/lineups/${teamId}`));
    return snapshot.exists() ? snapshot.val() : null;
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
    await set(ref(db, `${this.basePath}/matches/${matchId}/overlay`), {
      ...existing,
      ...control,
      lastUpdated: Date.now(),
    });
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
    await set(ref(db, `${this.basePath}/ads/${ad.id}`), ad);
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
    await set(ref(db, `${this.basePath}/overlayConfig`), config);
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
    await set(ref(db, `${this.basePath}/playerStats/${playerId}/career`), stats);
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
}

/** Singleton instance */
export const scoringService = new ScoringService();
