// ============================================================================
// MANUAL SCORING ADAPTER — Firebase RTDB based ball-by-ball scoring
// Always available as the default/fallback scoring provider.
// Full innings persistence, powerplay, free hit, maiden detection,
// extras tracking, replay triggers, bowling consecutive-over prevention.
// ============================================================================

import { ref, get, set, onValue, push, type Database } from 'firebase/database';
import type {
  IScoringAdapter, MatchScore, PlayerMatchStats, LiveScore,
  BallEvent, BallOutcome, WicketDetail, LiveBatsman, LiveBowler,
  Innings, BatsmanInnings, BowlerInnings, Extras,
  ReplayTrigger,
} from '../../types/scoring';

export interface BallInput {
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
   * and writes it atomically to Firebase RTDB. Also persists full innings data.
   */
  async recordBall(
    matchId: string,
    currentLive: LiveScore,
    currentInnings: Innings,
    input: BallInput,
  ): Promise<{ updatedLive: LiveScore; ballEvent: BallEvent; updatedInnings: Innings; isInningsComplete: boolean }> {
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
      isBoundary: batsmanRuns === 4,  // boundary counts even on NB/extras
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
    const newRunRate = ballsDelivered > 0 ? Math.round((newRuns / ballsDelivered) * 6 * 100) / 100 : 0;

    // Update current over balls display
    const currentOverBalls = [...currentLive.currentOverBalls, this.ballDisplay(outcome, totalRuns, !!wicket)];

    // Check if over just completed
    const overCompleted = isLegal && this.getBallsInCurrentOver(newOvers) === 0 && ballsDelivered > 0;

    // Determine if free hit should be set (no-ball → next legal ball is free hit)
    const isNoBall = outcome === 'NB' || outcome === 'NB+0' || String(outcome).startsWith('NB+');
    const isWide = outcome === 'WD' || String(outcome).startsWith('WD+');
    // Free hit persists until next legal ball; if another NB, new free hit starts
    // If wide on free hit, free hit carries over (wide doesn't consume the free hit)
    const nextIsFreehit = isNoBall || (currentLive.isFreehit && !isLegal);

    // Strike swap rules:
    // In cricket, strike changes for two independent reasons:
    //   1. Odd runs scored (batsmen physically cross) — applies to batsman runs, wide runs taken, bye/LB runs
    //   2. End of over (bowling switches ends)
    // When BOTH happen on the same ball (e.g. single off last ball), they cancel out.
    // The correct logic is XOR: swap if exactly ONE reason applies, not both.
    const isByeOrLegbye = parsed.extraType === 'bye' || parsed.extraType === 'legbye';
    const wideRunsTaken = isWide ? (totalRuns - 1) : 0; // subtract the automatic +1 wide extra
    const oddRunsScored =
      (!isWide && !isByeOrLegbye && batsmanRuns % 2 === 1) ||  // normal/NB: odd batsman runs
      (isWide && wideRunsTaken % 2 === 1) ||                    // wide: odd runs taken
      (isByeOrLegbye && extras % 2 === 1);                      // bye/lb: odd extras (they ran)

    // XOR: swap only if one is true but not both
    const shouldSwapStrike = overCompleted !== oddRunsScored;

    // Update batsmen stats
    let updatedBatsmen = this.updateBatsmenStats(
      currentLive.currentBatsmen, batsmanRuns, isLegal, wicket,
      shouldSwapStrike,
    );

    // Replace dismissed batsman with new batsman if provided
    if (wicket?.newBatsmanId) {
      const newBatsman: LiveBatsman = {
        playerId: wicket.newBatsmanId,
        playerName: wicket.newBatsmanName || wicket.newBatsmanId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        isOnStrike: updatedBatsmen[0].playerId === wicket.batsmanId,
      };
      updatedBatsmen = updatedBatsmen.map(b =>
        b.playerId === wicket.batsmanId ? newBatsman : b,
      ) as [LiveBatsman, LiveBatsman];
    }

    // Update bowler stats
    // Run out, retired hurt/out, obstructing field, timed out do NOT credit the bowler
    const nonBowlerDismissals = ['run_out', 'retired_hurt', 'retired_out', 'obstructing_field', 'timed_out'];
    const isBowlerWicket = !!wicket && !nonBowlerDismissals.includes(wicket.dismissalType);
    const updatedBowler = this.updateBowlerStats(
      currentLive.currentBowler, totalRuns, batsmanRuns, extras, isLegal, isBowlerWicket, parsed.extraType,
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

    // Maiden detection: over completed with 0 runs conceded by bowler
    // Byes/leg-byes don't count against bowler; wides/no-balls do
    let updatedBowlerFinal = updatedBowler;
    if (overCompleted) {
      const overHadRunsAgainstBowler = currentOverBalls.some(b => {
        if (b === 'W' || b === '0' || b.includes('·W') && !b.includes('WD') && !b.includes('NB')) {
          // Pure wicket or dot — no runs against bowler
          // Run-out with runs (e.g. '2·W') still counts as runs
          if (b.includes('·W')) {
            const runPart = parseInt(b);
            return !isNaN(runPart) && runPart > 0;
          }
          return false;
        }
        if (b === 'B' || b === 'LB' || b === 'B·W' || b === 'LB·W') return false; // byes/LBs don't count against bowler
        if (b.includes('WD') || b.includes('NB')) return true; // wides/no-balls count as runs against bowler
        const n = parseInt(b);
        return !isNaN(n) && n > 0;
      });
      if (!overHadRunsAgainstBowler) {
        updatedBowlerFinal = { ...updatedBowlerFinal, maidens: updatedBowlerFinal.maidens + 1 };
      }
    }

    // Powerplay tracking
    const powerplayOvers = currentLive.powerplayOvers || 6;
    const isPowerplay = newOvers < powerplayOvers;

    // Update all batsmen and bowlers arrays for full scorecard
    const allBatsmen = this.updateAllBatsmen(
      currentLive.allBatsmen || [],
      currentLive.currentBatsmen,
      batsmanRuns, isLegal, wicket,
    );
    const allBowlers = this.updateAllBowlers(
      currentLive.allBowlers || [],
      updatedBowlerFinal,
    );

    // Update innings extras
    const updatedExtras: Extras = {
      total: (currentInnings.extras?.total || 0) + extras,
      wides: (currentInnings.extras?.wides || 0) + (parsed.extraType === 'wide' ? extras : 0),
      noBalls: (currentInnings.extras?.noBalls || 0) + (parsed.extraType === 'noball' ? 1 : 0),
      byes: (currentInnings.extras?.byes || 0) + (parsed.extraType === 'bye' ? extras : 0),
      legByes: (currentInnings.extras?.legByes || 0) + (parsed.extraType === 'legbye' ? extras : 0),
      penalty: (currentInnings.extras?.penalty || 0) + (parsed.extraType === 'penalty' ? extras : 0),
    };

    // Update fall of wickets
    const fallOfWickets = [...(currentInnings.fallOfWickets || [])];
    if (wicket) {
      fallOfWickets.push({
        wicketNumber: newWickets,
        score: newRuns,
        overs: newOvers,
        batsmanId: wicket.batsmanId,
        batsmanName: allBatsmen.find(b => b.playerId === wicket.batsmanId)?.playerName || '',
      });
    }

    // Determine previous bowler for consecutive-over prevention
    const previousBowlerId = overCompleted ? currentLive.currentBowler.playerId : currentLive.previousBowlerId;

    const updatedLive: LiveScore = {
      ...currentLive,
      runs: newRuns,
      wickets: newWickets,
      overs: newOvers,
      runRate: newRunRate,
      requiredRate: currentLive.target
        ? this.computeRequiredRate(currentLive.target, newRuns, newOvers, currentInnings.maxOvers)
        : undefined,
      currentBatsmen: updatedBatsmen,
      currentBowler: overCompleted
        ? { ...updatedBowlerFinal } // keep current bowler; ScoreUpdatePage will prompt for new bowler
        : updatedBowlerFinal,
      lastBall: outcome,
      lastBallRuns: totalRuns,
      currentOverBalls: overCompleted ? [] : currentOverBalls,
      lastCompletedOverBalls: overCompleted ? currentOverBalls : currentLive.lastCompletedOverBalls,
      recentOvers,
      partnership: wicket
        ? { runs: 0, balls: 0 }  // reset partnership on wicket
        : {
          runs: currentLive.partnership.runs + totalRuns,
          balls: currentLive.partnership.balls + (isLegal ? 1 : 0),
        },
      lastUpdated: Date.now(),
      isPowerplay: isPowerplay,
      powerplayOvers,
      isFreehit: nextIsFreehit,
      previousBowlerId,
      allBatsmen,
      allBowlers,
    };

    // Build updated innings
    const updatedInnings: Innings = {
      ...currentInnings,
      totalRuns: newRuns,
      totalWickets: newWickets,
      totalOvers: newOvers,
      extras: updatedExtras,
      batsmen: allBatsmen,
      bowlers: allBowlers,
      fallOfWickets,
      isCompleted: false,
    };

    // Check if innings is complete
    const maxWickets = 10;
    const isAllOut = newWickets >= maxWickets;
    const isOversComplete = newOvers >= currentInnings.maxOvers;
    const isTargetChased = currentLive.target ? newRuns >= currentLive.target : false;
    const isInningsComplete = isAllOut || isOversComplete || isTargetChased;

    if (isInningsComplete) {
      updatedInnings.isCompleted = true;
    }

    // Write to Firebase atomically
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/live`), this.stripUndefinedDeep(updatedLive));

    // Persist full innings data
    await set(
      ref(this.db, `${this.basePath}/matches/${matchId}/innings/${currentLive.currentInnings}`),
      this.stripUndefinedDeep(updatedInnings),
    );

    // Store ball event in history
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/balls/${ballEvent.id}`), this.stripUndefinedDeep(ballEvent));

    // Trigger overlay animation + replay on boundaries and wickets
    if (ballEvent.isBoundary || ballEvent.isSix || ballEvent.isWicket) {
      // Determine overlay type — check for duck (batsman out on 0)
      let overlayType: string;
      if (ballEvent.isWicket && wicket) {
        const outBatsman = currentLive.currentBatsmen.find(b => b.playerId === wicket.batsmanId);
        const batsmanTotalRuns = (outBatsman?.runs || 0) + (outBatsman?.playerId === currentLive.currentBatsmen[0].playerId ? batsmanRuns : 0);
        overlayType = batsmanTotalRuns === 0 ? 'duck_out' : 'wicket';
      } else {
        overlayType = ballEvent.isSix ? 'boundary_six' : 'boundary_four';
      }
      // Set overlay so OBS browser source auto-shows animation
      await set(ref(this.db, `${this.basePath}/matches/${matchId}/overlay`), {
        activeOverlay: overlayType,
        lastUpdated: Date.now(),
      });
      // Also write replay trigger for replay systems
      const trigger: ReplayTrigger = {
        id: ballEvent.id,
        matchId,
        type: ballEvent.isWicket ? 'wicket' : (ballEvent.isSix ? 'six' : 'four'),
        timestamp: Date.now(),
        delaySeconds: 3,
        consumed: false,
      };
      await set(ref(this.db, `${this.basePath}/matches/${matchId}/replayTrigger`), this.stripUndefinedDeep(trigger));
    }

    return { updatedLive, ballEvent, updatedInnings, isInningsComplete };
  }

  // ── Update all batsmen array (full scorecard) ──────────────────────────

  private updateAllBatsmen(
    existing: BatsmanInnings[],
    currentPair: [LiveBatsman, LiveBatsman],
    batsmanRuns: number,
    isLegal: boolean,
    wicket?: WicketDetail,
  ): BatsmanInnings[] {
    const result = [...existing];

    // Ensure both current batsmen are in the array
    for (const bat of currentPair) {
      const idx = result.findIndex(b => b.playerId === bat.playerId);
      if (idx === -1) {
        result.push({
          playerId: bat.playerId,
          playerName: bat.playerName,
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          strikeRate: bat.strikeRate,
          dismissal: 'not out',
          isOut: false,
          order: result.length + 1,
        });
      } else {
        // Update from live data
        result[idx] = {
          ...result[idx],
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          strikeRate: bat.strikeRate,
        };
      }
    }

    // Update striker with this ball's runs
    const strikerLive = currentPair[0]; // striker is always index 0
    const strikerIdx = result.findIndex(b => b.playerId === strikerLive.playerId);
    if (strikerIdx !== -1) {
      const s = result[strikerIdx];
      result[strikerIdx] = {
        ...s,
        runs: s.runs + batsmanRuns,
        balls: s.balls + (isLegal ? 1 : 0),
        fours: s.fours + (batsmanRuns === 4 ? 1 : 0),
        sixes: s.sixes + (batsmanRuns === 6 ? 1 : 0),
        strikeRate: (s.balls + (isLegal ? 1 : 0)) > 0
          ? Math.round(((s.runs + batsmanRuns) / (s.balls + (isLegal ? 1 : 0))) * 100 * 100) / 100
          : 0,
      };
    }

    // Mark dismissal
    if (wicket) {
      const outIdx = result.findIndex(b => b.playerId === wicket.batsmanId);
      if (outIdx !== -1) {
        result[outIdx] = {
          ...result[outIdx],
          isOut: true,
          dismissal: this.formatDismissal(wicket),
        };
      }
    }

    return result;
  }

  private formatDismissal(wicket: WicketDetail): string {
    switch (wicket.dismissalType) {
      case 'bowled': return 'b ' + (wicket.fielderName || 'bowler');
      case 'caught': return `c ${wicket.fielderName || '?'} b bowler`;
      case 'caught_and_bowled': return 'c & b bowler';
      case 'lbw': return 'lbw b bowler';
      case 'run_out': return `run out (${wicket.fielderName || '?'})`;
      case 'stumped': return `st ${wicket.fielderName || '?'} b bowler`;
      case 'hit_wicket': return 'hit wicket';
      case 'obstructing_field': return 'obstructing the field';
      case 'retired_hurt': return 'retired hurt';
      case 'retired_out': return 'retired out';
      case 'timed_out': return 'timed out';
      default: return wicket.dismissalType;
    }
  }

  // ── Update all bowlers array (full scorecard) ──────────────────────────

  private updateAllBowlers(
    existing: BowlerInnings[],
    currentBowler: LiveBowler,
  ): BowlerInnings[] {
    const result = [...existing];
    const idx = result.findIndex(b => b.playerId === currentBowler.playerId);
    const bowlerEntry: BowlerInnings = {
      playerId: currentBowler.playerId,
      playerName: currentBowler.playerName,
      overs: currentBowler.overs,
      maidens: currentBowler.maidens,
      runs: currentBowler.runs,
      wickets: currentBowler.wickets,
      economy: currentBowler.economy,
      wides: 0, // tracked separately if needed
      noBalls: 0,
      dots: currentBowler.dots,
    };

    if (idx === -1) {
      result.push(bowlerEntry);
    } else {
      result[idx] = bowlerEntry;
    }

    return result;
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
    maxOvers?: number,
  ): Promise<LiveScore> {
    const effectiveMaxOvers = maxOvers || 20;
    const powerplayOvers = effectiveMaxOvers >= 20 ? 6 : Math.min(effectiveMaxOvers, 6);
    const live: LiveScore = {
      matchId,
      currentInnings: inningsNumber,
      battingTeamId,
      bowlingTeamId,
      runs: 0,
      wickets: 0,
      overs: 0,
      runRate: 0,
      requiredRate: target ? Math.round((target / effectiveMaxOvers) * 6 * 100) / 100 : undefined,
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
      isPowerplay: true,
      powerplayOvers,
      isFreehit: false,
      allBatsmen: [
        { playerId: openers[0].id, playerName: openers[0].name, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, dismissal: 'not out', isOut: false, order: 1 },
        { playerId: openers[1].id, playerName: openers[1].name, runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, dismissal: 'not out', isOut: false, order: 2 },
      ],
      allBowlers: [
        { playerId: openingBowler.id, playerName: openingBowler.name, overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, wides: 0, noBalls: 0, dots: 0 },
      ],
    };

    // Also initialize the innings data node
    const inningsData: Innings = {
      number: inningsNumber,
      battingTeamId,
      bowlingTeamId,
      totalRuns: 0,
      totalWickets: 0,
      totalOvers: 0,
      maxOvers: effectiveMaxOvers,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
      batsmen: live.allBatsmen!,
      bowlers: live.allBowlers!,
      fallOfWickets: [],
      overs: [],
      isCompleted: false,
    };

    await set(ref(this.db, `${this.basePath}/matches/${matchId}/live`), this.stripUndefinedDeep(live));
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/innings/${inningsNumber}`), this.stripUndefinedDeep(inningsData));
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
   * Get innings data from Firebase.
   */
  async getInnings(matchId: string, inningsNumber: 1 | 2): Promise<Innings | null> {
    const snap = await get(ref(this.db, `${this.basePath}/matches/${matchId}/innings/${inningsNumber}`));
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Complete a match — compute result, save final scorecard.
   */
  async completeMatch(
    matchId: string,
    match: { teamA: { id: string; name: string }; teamB: { id: string; name: string }; maxOvers: number; venue: string; date: string; tossWonBy?: string; tossElected?: 'bat' | 'bowl' },
  ): Promise<MatchScore> {
    const inn1 = await this.getInnings(matchId, 1);
    const inn2 = await this.getInnings(matchId, 2);
    const innings: Innings[] = [];
    if (inn1) innings.push(inn1);
    if (inn2) innings.push(inn2);

    // Compute result
    let result: MatchScore['result'] = null;
    if (inn1 && inn2) {
      if (inn1.totalRuns > inn2.totalRuns) {
        const margin = inn1.totalRuns - inn2.totalRuns;
        const winnerId = inn1.battingTeamId;
        result = { winner: winnerId, margin: `${margin} runs` };
      } else if (inn2.totalRuns > inn1.totalRuns) {
        const wicketsRemaining = 10 - inn2.totalWickets;
        const winnerId = inn2.battingTeamId;
        result = { winner: winnerId, margin: `${wicketsRemaining} wickets` };
      } else {
        // Tie — super over would follow
        result = { winner: '', margin: 'Match Tied' };
      }
    }

    const score: MatchScore = {
      matchId,
      status: 'completed',
      teams: innings.map(i => ({ batting: i.battingTeamId, bowling: i.bowlingTeamId })),
      innings,
      result,
      toss: match.tossWonBy ? { wonBy: match.tossWonBy, elected: match.tossElected || 'bat' } : null,
      venue: match.venue,
      date: match.date,
    };

    await this.saveMatchScore(matchId, score);

    // Update match status
    await set(ref(this.db, `${this.basePath}/matches/${matchId}/setup/status`), 'completed');

    return score;
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
    isLegal: boolean; extraType?: 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';
  } {
    const str = String(outcome);

    if (str === 'W') return { totalRuns: 0, batsmanRuns: 0, extras: 0, isLegal: true };
    if (str === 'WD') return { totalRuns: 1, batsmanRuns: 0, extras: 1, isLegal: false, extraType: 'wide' };
    if (str === 'NB+0') return { totalRuns: 1, batsmanRuns: 0, extras: 1, isLegal: false, extraType: 'noball' };
    if (str === 'NB') return { totalRuns: 1, batsmanRuns: 0, extras: 1, isLegal: false, extraType: 'noball' };
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

    // Bye + runs: "B+N"
    if (str.startsWith('B+')) {
      const n = parseInt(str.slice(2)) || 0;
      return { totalRuns: n, batsmanRuns: 0, extras: n, isLegal: true, extraType: 'bye' };
    }

    // Leg bye + runs: "LB+N"
    if (str.startsWith('LB+')) {
      const n = parseInt(str.slice(3)) || 0;
      return { totalRuns: n, batsmanRuns: 0, extras: n, isLegal: true, extraType: 'legbye' };
    }

    // Penalty runs: "PEN+N" (awarded outside legal delivery count)
    if (str.startsWith('PEN+')) {
      const n = parseInt(str.slice(4)) || 0;
      return { totalRuns: n, batsmanRuns: 0, extras: n, isLegal: false, extraType: 'penalty' };
    }

    // Simple runs: "0", "1", "2", "3", "4", "6"
    const runs = parseInt(str) || 0;
    return { totalRuns: runs, batsmanRuns: runs, extras: 0, isLegal: true };
  }

  private getBallsInCurrentOver(overs: number): number {
    // Fix floating point: round to 1 decimal place first
    const rounded = Math.round(overs * 10) / 10;
    return Math.round((rounded % 1) * 10);
  }

  private incrementOvers(overs: number): number {
    const completedOvers = Math.floor(overs);
    const ballsInOver = this.getBallsInCurrentOver(overs);
    if (ballsInOver >= 5) {
      // Over complete
      return completedOvers + 1;
    }
    // Use integer math to avoid floating-point issues
    return Math.round((completedOvers * 10 + ballsInOver + 1)) / 10;
  }

  private oversToBalls(overs: number): number {
    const rounded = Math.round(overs * 10) / 10;
    return Math.floor(rounded) * 6 + this.getBallsInCurrentOver(rounded);
  }

  private ballDisplay(outcome: BallOutcome, runs: number, isWicket?: boolean): string {
    if (outcome === 'W') return 'W';
    if (outcome === 'WD' || String(outcome).startsWith('WD+')) return isWicket ? 'WD·W' : 'WD';
    if (outcome === 'NB' || outcome === 'NB+0' || String(outcome).startsWith('NB+')) return isWicket ? 'NB·W' : 'NB';
    if (outcome === 'B' || String(outcome).startsWith('B+')) return isWicket ? 'B·W' : 'B';
    if (outcome === 'LB' || String(outcome).startsWith('LB+')) return isWicket ? 'LB·W' : 'LB';
    if (String(outcome).startsWith('PEN+')) return `P${runs}`;
    // Regular runs — show wicket indicator if run-out happened
    if (isWicket) return runs > 0 ? `${runs}·W` : 'W';
    return String(runs);
  }

  private updateBatsmenStats(
    batsmen: [LiveBatsman, LiveBatsman],
    batsmanRuns: number,
    isLegal: boolean,
    _wicket?: WicketDetail,
    swapStrike?: boolean,
  ): [LiveBatsman, LiveBatsman] {
    const [striker, nonStriker] = batsmen;
    const newRuns = striker.runs + batsmanRuns;
    const newBalls = striker.balls + (isLegal ? 1 : 0);
    const updatedStriker: LiveBatsman = {
      ...striker,
      runs: newRuns,
      balls: newBalls,
      fours: striker.fours + (batsmanRuns === 4 ? 1 : 0),
      sixes: striker.sixes + (batsmanRuns === 6 ? 1 : 0),
      strikeRate: newBalls > 0 ? Math.round((newRuns / newBalls) * 100 * 100) / 100 : 0,
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
    const runsAgainst = extraType === 'bye' || extraType === 'legbye' || extraType === 'penalty' ? 0 : totalRuns;
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
