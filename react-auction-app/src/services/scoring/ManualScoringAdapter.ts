// ============================================================================
// MANUAL SCORING ADAPTER — Firebase RTDB based ball-by-ball scoring
// Always available as the default/fallback scoring provider.
// ============================================================================

import { ref, get, set, onValue, push, type Database } from 'firebase/database';
import type {
  IScoringAdapter, MatchScore, PlayerMatchStats, LiveScore,
  BallEvent, BallOutcome, WicketDetail, LiveBatsman, LiveBowler,
  BatsmanInnings, BowlerInnings, Over, Innings, Extras, FallOfWicket,
} from '../../types/scoring';

interface BallInput {
  outcome: BallOutcome;
  wicket?: WicketDetail;
  batsmanRuns?: number;
}

export class ManualScoringAdapter implements IScoringAdapter {
  readonly provider = 'manual' as const;

  private db: Database;
  private basePath: string;

  constructor(db: Database, tenantScoringPath: string) {
    this.db = db;
    this.basePath = tenantScoringPath; // e.g. "tenants/epl_2026/scoring"
  }

  // ── IScoringAdapter ────────────────────────────────────────────────────────

  async fetchMatchScore(matchId: string): Promise<MatchScore> {
    const snapshot = await get(ref(this.db, `${this.basePath}/matches/${matchId}/final`));
    if (!snapshot.exists()) throw new Error('Score not found');
    return snapshot.val() as MatchScore;
  }

  async fetchPlayerMatchStats(matchId: string, playerId: string): Promise<PlayerMatchStats> {
    const snapshot = await get(ref(this.db,
      `${this.basePath}/playerStats/${playerId}/matches/${matchId}`));
    if (!snapshot.exists()) throw new Error('Stats not found');
    return snapshot.val() as PlayerMatchStats;
  }

  syncLiveScore(matchId: string, callback: (score: LiveScore) => void): () => void {
    const liveRef = ref(this.db, `${this.basePath}/matches/${matchId}/live`);
    const unsub = onValue(liveRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as LiveScore);
      }
    });
    return unsub;
  }

  isConfigured(): boolean {
    return true; // Always available
  }

  getProviderName(): string {
    return 'Manual Scoring';
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

  // ── Ball-by-ball Entry Methods ─────────────────────────────────────────────

  /**
   * Record a single ball delivery. Computes the new live score state
   * and writes it atomically to Firebase RTDB.
   */
  async recordBall(
    matchId: string,
    currentLive: LiveScore,
    currentInnings: Innings,
    input: BallInput,
  ): Promise<{ updatedLive: LiveScore; ballEvent: BallEvent }> {
    const { outcome, wicket } = input;

    // Parse outcome
    const parsed = this.parseOutcome(outcome, input.batsmanRuns);
    const isLegal = parsed.isLegal;
    const totalRuns = parsed.totalRuns;
    const batsmanRuns = parsed.batsmanRuns;
    const extras = parsed.extras;

    // Create ball event
    const ballEvent: BallEvent = {
      id: push(ref(this.db)).key!,
      inningsNumber: currentLive.currentInnings,
      overNumber: Math.floor(currentLive.overs),
      ballInOver: isLegal ? this.getBallsInCurrentOver(currentLive.overs) : -1,
      outcome,
      runs: totalRuns,
      batsmanRuns,
      extras,
      extraType: parsed.extraType,
      isLegal,
      isBoundary: batsmanRuns === 4 && isLegal,
      isSix: batsmanRuns === 6,
      isWicket: !!wicket,
      wicket,
      strikerId: currentLive.currentBatsmen[0].playerId,
      nonStrikerId: currentLive.currentBatsmen[1].playerId,
      bowlerId: currentLive.currentBowler.playerId,
      timestamp: Date.now(),
    };

    // Update live score
    const newRuns = currentLive.runs + totalRuns;
    const newWickets = currentLive.wickets + (wicket ? 1 : 0);
    const newOvers = isLegal
      ? this.incrementOvers(currentLive.overs)
      : currentLive.overs;
    const ballsDelivered = this.oversToBalls(newOvers);
    const newRunRate = ballsDelivered > 0 ? (newRuns / ballsDelivered) * 6 : 0;

    // Update current over balls display
    const currentOverBalls = [...currentLive.currentOverBalls, this.ballDisplay(outcome, totalRuns)];

    // Check if over just completed
    const overCompleted = isLegal && this.getBallsInCurrentOver(newOvers) === 0 && ballsDelivered > 0;

    // Update batsmen stats
    const updatedBatsmen = this.updateBatsmenStats(
      currentLive.currentBatsmen, batsmanRuns, isLegal, wicket,
      // Swap strike if odd runs on legal ball, or at end of over
      (batsmanRuns % 2 === 1 && isLegal) || overCompleted,
    );

    // Update bowler stats
    const updatedBowler = this.updateBowlerStats(
      currentLive.currentBowler, totalRuns, batsmanRuns, extras, isLegal, !!wicket, parsed.extraType,
    );

    // Build recent overs summary
    let recentOvers = [...currentLive.recentOvers];
    if (overCompleted) {
      const overRuns = currentOverBalls.reduce((sum, b) => {
        const n = parseInt(b);
        return sum + (isNaN(n) ? (b === 'W' ? 0 : 1) : n);
      }, 0);
      recentOvers = [...recentOvers, String(overRuns)].slice(-12);
    }

    const updatedLive: LiveScore = {
      ...currentLive,
      runs: newRuns,
      wickets: newWickets,
      overs: newOvers,
      runRate: Math.round(newRunRate * 100) / 100,
      requiredRate: currentLive.target
        ? this.computeRequiredRate(currentLive.target, newRuns, newOvers, currentInnings.maxOvers)
        : undefined,
      currentBatsmen: updatedBatsmen,
      currentBowler: updatedBowler,
      lastBall: outcome,
      lastBallRuns: totalRuns,
      currentOverBalls: overCompleted ? [] : currentOverBalls,
      recentOvers,
      partnership: {
        runs: currentLive.partnership.runs + totalRuns,
        balls: currentLive.partnership.balls + (isLegal ? 1 : 0),
      },
      lastUpdated: Date.now(),
    };

    // Write to Firebase
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/live`), this.stripUndefinedDeep(updatedLive));

    // Store ball event in history
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/balls/${ballEvent.id}`), this.stripUndefinedDeep(ballEvent));

    return { updatedLive, ballEvent };
  }

  /**
   * Undo the last ball by restoring a previous live state snapshot.
   */
  async undoLastBall(matchId: string, previousLive: LiveScore, lastBallId: string): Promise<void> {
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/live`), previousLive);
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/balls/${lastBallId}`), null);
  }

  /**
   * Initialize live score for a new innings.
   */
  async initInnings(
    matchId: string,
    inningsNumber: 1 | 2,
    battingTeamId: string,
    bowlingTeamId: string,
    openers: [{ id: string; name: string }, { id: string; name: string }],
    openingBowler: { id: string; name: string },
    target?: number,
  ): Promise<LiveScore> {
    const live: LiveScore = {
      matchId,
      currentInnings: inningsNumber,
      battingTeamId,
      bowlingTeamId,
      runs: 0,
      wickets: 0,
      overs: 0,
      runRate: 0,
      requiredRate: target ? (target / 20) : undefined, // assuming T20 initially
      target,
      currentBatsmen: [
        { playerId: openers[0].id, playerName: openers[0].name, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike: true },
        { playerId: openers[1].id, playerName: openers[1].name, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike: false },
      ],
      currentBowler: {
        playerId: openingBowler.id, playerName: openingBowler.name,
        overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, dots: 0,
      },
      lastBall: '0',
      lastBallRuns: 0,
      currentOverBalls: [],
      recentOvers: [],
      partnership: { runs: 0, balls: 0 },
      lastUpdated: Date.now(),
    };

    await set(ref(this.db, `${this.basePath}/matches/${matchId}/live`), this.stripUndefinedDeep(live));
    return live;
  }

  /**
   * Write overlay control (which overlay to show).
   */
  async setOverlayControl(matchId: string, overlay: { activeOverlay: string; activeOverlayData?: Record<string, unknown>; liveQuestion?: unknown }): Promise<void> {
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/overlay`), this.stripUndefinedDeep({
      ...overlay,
      lastUpdated: Date.now(),
    }));
  }

  /**
   * Save completed match scorecard.
   */
  async saveMatchScore(matchId: string, score: MatchScore): Promise<void> {
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/final`), this.stripUndefinedDeep(score));
  }

  /**
   * Save player match stats.
   */
  async savePlayerStats(matchId: string, playerId: string, stats: PlayerMatchStats): Promise<void> {
    await set(ref(this.db, `${this.basePath}/playerStats/${playerId}/matches/${matchId}`), this.stripUndefinedDeep(stats));
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private parseOutcome(outcome: BallOutcome, batsmanRunsOverride?: number): {
    totalRuns: number; batsmanRuns: number; extras: number;
    isLegal: boolean; extraType?: 'wide' | 'noball' | 'bye' | 'legbye';
  } {
    const str = String(outcome);

    if (str === 'W') return { totalRuns: 0, batsmanRuns: 0, extras: 0, isLegal: true };
    if (str === 'WD') return { totalRuns: 1, batsmanRuns: 0, extras: 1, isLegal: false, extraType: 'wide' };
    if (str === 'NB+0') return { totalRuns: 1, batsmanRuns: 0, extras: 1, isLegal: false, extraType: 'noball' };
    if (str === 'B') return { totalRuns: batsmanRunsOverride ?? 1, batsmanRuns: 0, extras: batsmanRunsOverride ?? 1, isLegal: true, extraType: 'bye' };
    if (str === 'LB') return { totalRuns: batsmanRunsOverride ?? 1, batsmanRuns: 0, extras: batsmanRunsOverride ?? 1, isLegal: true, extraType: 'legbye' };

    // Wide + runs: "WD+N"
    if (str.startsWith('WD+')) {
      const n = parseInt(str.slice(3)) || 0;
      return { totalRuns: 1 + n, batsmanRuns: 0, extras: 1 + n, isLegal: false, extraType: 'wide' };
    }

    // No-ball + runs: "NB+N"
    if (str.startsWith('NB+')) {
      const n = parseInt(str.slice(3)) || 0;
      return { totalRuns: 1 + n, batsmanRuns: n, extras: 1, isLegal: false, extraType: 'noball' };
    }

    // Simple runs: "0", "1", "2", "3", "4", "6"
    const runs = parseInt(str) || 0;
    return { totalRuns: runs, batsmanRuns: runs, extras: 0, isLegal: true };
  }

  private getBallsInCurrentOver(overs: number): number {
    return Math.round((overs % 1) * 10);
  }

  private incrementOvers(overs: number): number {
    const completedOvers = Math.floor(overs);
    const ballsInOver = this.getBallsInCurrentOver(overs);
    if (ballsInOver >= 5) {
      // Over complete
      return completedOvers + 1;
    }
    return completedOvers + (ballsInOver + 1) / 10;
  }

  private oversToBalls(overs: number): number {
    return Math.floor(overs) * 6 + this.getBallsInCurrentOver(overs);
  }

  private ballDisplay(outcome: BallOutcome, runs: number): string {
    if (outcome === 'W') return 'W';
    if (outcome === 'WD' || String(outcome).startsWith('WD+')) return `WD`;
    if (outcome === 'NB+0' || String(outcome).startsWith('NB+')) return `NB`;
    if (outcome === 'B') return 'B';
    if (outcome === 'LB') return 'LB';
    return String(runs);
  }

  private updateBatsmenStats(
    batsmen: [LiveBatsman, LiveBatsman],
    batsmanRuns: number,
    isLegal: boolean,
    wicket?: WicketDetail,
    swapStrike?: boolean,
  ): [LiveBatsman, LiveBatsman] {
    const [striker, nonStriker] = batsmen;
    const updatedStriker: LiveBatsman = {
      ...striker,
      runs: striker.runs + batsmanRuns,
      balls: striker.balls + (isLegal ? 1 : 0),
      fours: striker.fours + (batsmanRuns === 4 ? 1 : 0),
      sixes: striker.sixes + (batsmanRuns === 6 ? 1 : 0),
      strikeRate: isLegal
        ? Math.round(((striker.runs + batsmanRuns) / (striker.balls + 1)) * 100 * 100) / 100
        : striker.strikeRate,
    };

    if (swapStrike) {
      return [
        { ...nonStriker, isOnStrike: true },
        { ...updatedStriker, isOnStrike: false },
      ];
    }
    return [updatedStriker, nonStriker];
  }

  private updateBowlerStats(
    bowler: LiveBowler,
    totalRuns: number,
    _batsmanRuns: number,
    _extras: number,
    isLegal: boolean,
    isWicket: boolean,
    extraType?: string,
  ): LiveBowler {
    const newOvers = isLegal ? this.incrementOvers(bowler.overs) : bowler.overs;
    const runsAgainst = extraType === 'bye' || extraType === 'legbye' ? 0 : totalRuns;
    const newRuns = bowler.runs + runsAgainst;
    const ballsBowled = this.oversToBalls(newOvers);
    return {
      ...bowler,
      overs: newOvers,
      runs: newRuns,
      wickets: bowler.wickets + (isWicket ? 1 : 0),
      economy: ballsBowled > 0 ? Math.round((newRuns / ballsBowled) * 6 * 100) / 100 : 0,
      dots: bowler.dots + (totalRuns === 0 && isLegal ? 1 : 0),
    };
  }

  private computeRequiredRate(target: number, currentRuns: number, currentOvers: number, maxOvers: number): number {
    const remaining = target - currentRuns;
    const ballsLeft = (maxOvers * 6) - this.oversToBalls(currentOvers);
    if (ballsLeft <= 0) return 0;
    return Math.round((remaining / ballsLeft) * 6 * 100) / 100;
  }
}
