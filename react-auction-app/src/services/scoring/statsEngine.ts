// ============================================================================
// STATS ENGINE — Real-time match & tournament statistics aggregation
// Listens to ball events and maintains aggregated stats for overlay consumption
// ============================================================================

import { ref, get, set, onValue, type Database } from 'firebase/database';
import type {
  MatchStatsSnapshot, TournamentStats, PlayerMVPPoints, PlayerMatchStats,
  MVPWeights, LiveScore, BallEvent, Innings, BatsmanInnings, BowlerInnings,
  MatchSetup, PlayerCareerStats,
} from '../../types/scoring';
import { DEFAULT_MVP_WEIGHTS, createEmptyCareerStats } from '../../types/scoring';

export class StatsEngine {
  private db: Database | null = null;
  private basePath = '';

  initialize(db: Database, tenantScoringPath: string): void {
    this.db = db;
    this.basePath = tenantScoringPath;
  }

  private ensureDb(): Database {
    if (!this.db) throw new Error('StatsEngine not initialized');
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

  // ── MVP Points Calculation ───────────────────────────────────────────────

  computeMVPPoints(
    stats: PlayerMatchStats,
    playerName: string,
    teamId: string,
    weights: MVPWeights = DEFAULT_MVP_WEIGHTS,
  ): PlayerMVPPoints {
    let batting = 0;
    let bowling = 0;
    let fielding = 0;
    let bonus = 0;

    if (stats.batting) {
      batting += stats.batting.runs * weights.runPoints;
      batting += stats.batting.fours * weights.fourBonus;
      batting += stats.batting.sixes * weights.sixBonus;
      // Strike rate bonus
      if (stats.batting.balls >= 10 && stats.batting.strikeRate >= weights.srBonusThreshold) {
        bonus += weights.srBonusPoints;
      }
      // Milestone bonuses
      if (stats.batting.runs >= 100) bonus += weights.centuryBonus;
      else if (stats.batting.runs >= 50) bonus += weights.halfCenturyBonus;
      else if (stats.batting.runs >= 30) bonus += weights.thirtyRunBonus;
    }

    if (stats.bowling) {
      bowling += stats.bowling.wickets * weights.wicketPoints;
      bowling += stats.bowling.maidens * weights.maidenPoints;
      bowling += stats.bowling.dots * weights.dotBallPoints;
      // Economy bonus (minimum 2 overs)
      if (stats.bowling.overs >= 2 && stats.bowling.economy <= weights.economyBonusThreshold) {
        bonus += weights.economyBonusPoints;
      }
      // Wicket milestone bonuses
      if (stats.bowling.wickets >= 5) bonus += weights.fiveWicketBonus;
      else if (stats.bowling.wickets >= 3) bonus += weights.threeWicketBonus;
    }

    if (stats.fielding) {
      fielding += stats.fielding.catches * weights.catchPoints;
      fielding += stats.fielding.runOuts * weights.runOutPoints;
      fielding += stats.fielding.stumpings * weights.stumpingPoints;
    }

    return {
      playerId: stats.playerId,
      playerName,
      teamId,
      batting: Math.round(batting * 100) / 100,
      bowling: Math.round(bowling * 100) / 100,
      fielding: Math.round(fielding * 100) / 100,
      bonus: Math.round(bonus * 100) / 100,
      total: Math.round((batting + bowling + fielding + bonus) * 100) / 100,
    };
  }

  // ── Match Stats Snapshot (real-time during match) ──────────────────────

  computeMatchStats(
    matchId: string,
    innings: Innings[],
    match: MatchSetup,
    minBallsForSR = 10,
  ): MatchStatsSnapshot {
    const allBatsmen: (BatsmanInnings & { teamId: string })[] = [];
    const allBowlers: (BowlerInnings & { teamId: string })[] = [];

    for (const inn of innings) {
      for (const bat of inn.batsmen) {
        allBatsmen.push({ ...bat, teamId: inn.battingTeamId });
      }
      for (const bowl of inn.bowlers) {
        allBowlers.push({ ...bowl, teamId: inn.bowlingTeamId });
      }
    }

    // Highest dot ball bowler (min 10 balls = ~1.4 overs)
    const eligibleBowlers = allBowlers.filter(b => {
      const balls = Math.floor(b.overs) * 6 + Math.round((b.overs % 1) * 10);
      return balls >= minBallsForSR;
    });
    const topDotBowler = eligibleBowlers.length > 0
      ? eligibleBowlers.reduce((best, b) => (b.dots > best.dots ? b : best))
      : null;

    // Highest four scorer
    const topFours = allBatsmen.length > 0
      ? allBatsmen.reduce((best, b) => (b.fours > best.fours ? b : best))
      : null;

    // Highest six scorer
    const topSixes = allBatsmen.length > 0
      ? allBatsmen.reduce((best, b) => (b.sixes > best.sixes ? b : best))
      : null;

    // Highest strike rate (min N balls)
    const eligibleBatsmen = allBatsmen.filter(b => b.balls >= minBallsForSR);
    const topSR = eligibleBatsmen.length > 0
      ? eligibleBatsmen.reduce((best, b) => (b.strikeRate > best.strikeRate ? b : best))
      : null;

    return {
      matchId,
      highestDotBallBowler: topDotBowler ? {
        playerId: topDotBowler.playerId,
        playerName: topDotBowler.playerName,
        teamId: topDotBowler.teamId,
        dots: topDotBowler.dots,
        balls: Math.floor(topDotBowler.overs) * 6 + Math.round((topDotBowler.overs % 1) * 10),
      } : null,
      highestFourScorer: topFours && topFours.fours > 0 ? {
        playerId: topFours.playerId,
        playerName: topFours.playerName,
        teamId: topFours.teamId,
        fours: topFours.fours,
      } : null,
      highestSixScorer: topSixes && topSixes.sixes > 0 ? {
        playerId: topSixes.playerId,
        playerName: topSixes.playerName,
        teamId: topSixes.teamId,
        sixes: topSixes.sixes,
      } : null,
      highestStrikeRate: topSR ? {
        playerId: topSR.playerId,
        playerName: topSR.playerName,
        teamId: topSR.teamId,
        strikeRate: topSR.strikeRate,
        runs: topSR.runs,
        balls: topSR.balls,
      } : null,
      mvpLeaderboard: [],
      lastUpdated: Date.now(),
    };
  }

  // ── Persist Match Stats ──────────────────────────────────────────────

  async saveMatchStats(matchId: string, stats: MatchStatsSnapshot): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/matches/${matchId}/stats`), this.stripUndefinedDeep(stats));
  }

  subscribeMatchStats(matchId: string, callback: (stats: MatchStatsSnapshot) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/matches/${matchId}/stats`), (snap) => {
      if (snap.exists()) callback(snap.val());
    });
  }

  // ── Tournament Stats Aggregation ─────────────────────────────────────

  async aggregateTournamentStats(): Promise<TournamentStats> {
    const db = this.ensureDb();
    const matchesSnap = await get(ref(db, `${this.basePath}/matches`));
    if (!matchesSnap.exists()) {
      return this.emptyTournamentStats();
    }

    const matchesData = matchesSnap.val() as Record<string, {
      setup?: MatchSetup;
      innings?: Record<string, Innings>;
    }>;

    // Aggregate per-player totals across all completed matches
    const playerAgg: Record<string, {
      playerName: string; teamId: string; teamName: string;
      runs: number; wickets: number; fours: number; sixes: number;
      dots: number; balls: number; bowlingRuns: number; bowlingBalls: number;
      matches: number; imageUrl?: string;
    }> = {};

    for (const [, matchData] of Object.entries(matchesData)) {
      const setup = matchData.setup;
      if (!setup || (setup.status !== 'completed' && setup.status !== 'live')) continue;

      const inningsMap = matchData.innings || {};
      for (const inn of Object.values(inningsMap)) {
        const teamId = inn.battingTeamId;
        const teamName = teamId === setup.teamA.id ? setup.teamA.name : setup.teamB.name;

        for (const bat of (inn.batsmen || [])) {
          if (!playerAgg[bat.playerId]) {
            playerAgg[bat.playerId] = {
              playerName: bat.playerName, teamId, teamName,
              runs: 0, wickets: 0, fours: 0, sixes: 0,
              dots: 0, balls: 0, bowlingRuns: 0, bowlingBalls: 0, matches: 0,
            };
          }
          const p = playerAgg[bat.playerId];
          p.runs += bat.runs;
          p.fours += bat.fours;
          p.sixes += bat.sixes;
          p.balls += bat.balls;
        }

        const bowlTeamId = inn.bowlingTeamId;
        const bowlTeamName = bowlTeamId === setup.teamA.id ? setup.teamA.name : setup.teamB.name;

        for (const bowl of (inn.bowlers || [])) {
          if (!playerAgg[bowl.playerId]) {
            playerAgg[bowl.playerId] = {
              playerName: bowl.playerName, teamId: bowlTeamId, teamName: bowlTeamName,
              runs: 0, wickets: 0, fours: 0, sixes: 0,
              dots: 0, balls: 0, bowlingRuns: 0, bowlingBalls: 0, matches: 0,
            };
          }
          const p = playerAgg[bowl.playerId];
          p.wickets += bowl.wickets;
          p.dots += bowl.dots;
          p.bowlingRuns += bowl.runs;
          const b = Math.floor(bowl.overs) * 6 + Math.round((bowl.overs % 1) * 10);
          p.bowlingBalls += b;
        }
      }
    }

    const players = Object.entries(playerAgg);

    // Orange Cap (most runs)
    const orangeArr = players.filter(([, p]) => p.runs > 0).sort((a, b) => b[1].runs - a[1].runs);
    const orange = orangeArr[0]
      ? { playerId: orangeArr[0][0], ...orangeArr[0][1], matches: orangeArr[0][1].matches }
      : null;

    // Purple Cap (most wickets)
    const purpleArr = players.filter(([, p]) => p.wickets > 0).sort((a, b) => b[1].wickets - a[1].wickets);
    const purple = purpleArr[0]
      ? { playerId: purpleArr[0][0], ...purpleArr[0][1], matches: purpleArr[0][1].matches }
      : null;

    // Most sixes
    const sixArr = players.filter(([, p]) => p.sixes > 0).sort((a, b) => b[1].sixes - a[1].sixes);
    const mostSixes = sixArr[0]
      ? { playerId: sixArr[0][0], playerName: sixArr[0][1].playerName, teamId: sixArr[0][1].teamId, teamName: sixArr[0][1].teamName, sixes: sixArr[0][1].sixes }
      : null;

    // Most fours
    const fourArr = players.filter(([, p]) => p.fours > 0).sort((a, b) => b[1].fours - a[1].fours);
    const mostFours = fourArr[0]
      ? { playerId: fourArr[0][0], playerName: fourArr[0][1].playerName, teamId: fourArr[0][1].teamId, teamName: fourArr[0][1].teamName, fours: fourArr[0][1].fours }
      : null;

    // Best economy (min 12 balls = 2 overs across tournament)
    const ecoArr = players
      .filter(([, p]) => p.bowlingBalls >= 12)
      .map(([id, p]) => ({
        playerId: id,
        playerName: p.playerName,
        teamId: p.teamId,
        teamName: p.teamName,
        economy: p.bowlingBalls > 0 ? Math.round((p.bowlingRuns / p.bowlingBalls) * 6 * 100) / 100 : 0,
        overs: Math.floor(p.bowlingBalls / 6) + (p.bowlingBalls % 6) / 10,
      }))
      .sort((a, b) => a.economy - b.economy);
    const bestEco = ecoArr[0] || null;

    // Best strike rate (min 20 balls across tournament)
    const srArr = players
      .filter(([, p]) => p.balls >= 20)
      .map(([id, p]) => ({
        playerId: id,
        playerName: p.playerName,
        teamId: p.teamId,
        teamName: p.teamName,
        strikeRate: p.balls > 0 ? Math.round((p.runs / p.balls) * 100 * 100) / 100 : 0,
        runs: p.runs,
        balls: p.balls,
      }))
      .sort((a, b) => b.strikeRate - a.strikeRate);
    const bestSR = srArr[0] || null;

    // Most dot balls
    const dotArr = players.filter(([, p]) => p.dots > 0).sort((a, b) => b[1].dots - a[1].dots);
    const mostDots = dotArr[0]
      ? { playerId: dotArr[0][0], playerName: dotArr[0][1].playerName, teamId: dotArr[0][1].teamId, teamName: dotArr[0][1].teamName, dots: dotArr[0][1].dots }
      : null;

    const stats: TournamentStats = {
      orangeCap: orange ? { playerId: orange.playerId, playerName: orange.playerName, teamId: orange.teamId, teamName: orange.teamName, runs: orange.runs, matches: orange.matches } : null,
      purpleCap: purple ? { playerId: purple.playerId, playerName: purple.playerName, teamId: purple.teamId, teamName: purple.teamName, wickets: purple.wickets, matches: purple.matches } : null,
      mostSixes,
      mostFours,
      bestEconomy: bestEco,
      bestStrikeRate: bestSR,
      mostDotBalls: mostDots,
      mvpLeaderboard: [],
      lastUpdated: Date.now(),
    };

    return stats;
  }

  async saveTournamentStats(stats: TournamentStats): Promise<void> {
    const db = this.ensureDb();
    await set(ref(db, `${this.basePath}/tournamentStats`), this.stripUndefinedDeep(stats));
  }

  subscribeTournamentStats(callback: (stats: TournamentStats) => void): () => void {
    const db = this.ensureDb();
    return onValue(ref(db, `${this.basePath}/tournamentStats`), (snap) => {
      if (snap.exists()) callback(snap.val());
    });
  }

  // ── Player Match Stats from Innings Data ─────────────────────────────

  extractPlayerMatchStats(
    matchId: string,
    innings: Innings[],
    match: MatchSetup,
  ): PlayerMatchStats[] {
    const statsMap: Record<string, PlayerMatchStats> = {};

    for (const inn of innings) {
      for (const bat of (inn.batsmen || [])) {
        if (!statsMap[bat.playerId]) {
          statsMap[bat.playerId] = { playerId: bat.playerId, matchId };
        }
        statsMap[bat.playerId].batting = {
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          strikeRate: bat.strikeRate,
          dismissal: bat.dismissal,
          isNotOut: !bat.isOut,
        };
      }

      for (const bowl of (inn.bowlers || [])) {
        if (!statsMap[bowl.playerId]) {
          statsMap[bowl.playerId] = { playerId: bowl.playerId, matchId };
        }
        statsMap[bowl.playerId].bowling = {
          overs: bowl.overs,
          maidens: bowl.maidens,
          runs: bowl.runs,
          wickets: bowl.wickets,
          economy: bowl.economy,
          dots: bowl.dots,
          wides: bowl.wides,
          noBalls: bowl.noBalls,
        };
      }
    }

    // Fielding stats would come from ball events (catches, run outs, stumpings)
    // collected during the match. Initialize empty for now.
    for (const stats of Object.values(statsMap)) {
      if (!stats.fielding) {
        stats.fielding = { catches: 0, runOuts: 0, stumpings: 0 };
      }
    }

    return Object.values(statsMap);
  }

  // ── Save All Player Stats for a Match ────────────────────────────────

  async saveAllPlayerMatchStats(matchId: string, allStats: PlayerMatchStats[]): Promise<void> {
    const db = this.ensureDb();
    for (const stats of allStats) {
      await set(
        ref(db, `${this.basePath}/playerStats/${stats.playerId}/matches/${matchId}`),
        this.stripUndefinedDeep(stats),
      );
    }
  }

  // ── Update Career Stats for All Players in a Match ───────────────────

  async updateCareerStatsForMatch(playerIds: string[]): Promise<void> {
    const db = this.ensureDb();
    for (const playerId of playerIds) {
      const snap = await get(ref(db, `${this.basePath}/playerStats/${playerId}/matches`));
      if (!snap.exists()) continue;
      const matchStats = Object.values(snap.val()) as PlayerMatchStats[];
      const career = this.computeCareerStats(playerId, matchStats);
      await set(ref(db, `${this.basePath}/playerStats/${playerId}/career`), this.stripUndefinedDeep(career));
    }
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
    const totalBowlingBalls = matchStats.reduce((sum, ms) => {
      if (!ms.bowling) return sum;
      return sum + Math.floor(ms.bowling.overs) * 6 + Math.round((ms.bowling.overs % 1) * 10);
    }, 0);
    career.bowling.economy = totalBowlingBalls > 0
      ? Math.round((totalBowlingRuns / totalBowlingBalls) * 6 * 100) / 100
      : 0;

    career.lastUpdated = Date.now();
    return career;
  }

  private emptyTournamentStats(): TournamentStats {
    return {
      orangeCap: null,
      purpleCap: null,
      mostSixes: null,
      mostFours: null,
      bestEconomy: null,
      bestStrikeRate: null,
      mostDotBalls: null,
      mvpLeaderboard: [],
      lastUpdated: Date.now(),
    };
  }
}

/** Singleton instance */
export const statsEngine = new StatsEngine();
