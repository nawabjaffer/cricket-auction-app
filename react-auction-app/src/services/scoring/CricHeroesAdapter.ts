// ============================================================================
// CRICHEROES ADAPTER — Polls CricHeroes public scorecard for live score data
// No API key needed: uses public scorecard page data via configurable proxy.
// The proxy fetches CricHeroes scorecard HTML/JSON and returns parsed match data.
// ============================================================================

import type { IScoringAdapter, MatchScore, PlayerMatchStats, LiveScore, LiveBatsman, LiveBowler } from '../../types/scoring';

interface CricHeroesConfig {
  /** CricHeroes match URL or numeric match ID */
  matchUrl?: string;
  /** CORS proxy base URL (e.g. Firebase Function endpoint or local proxy) */
  proxyBaseUrl?: string;
  /** Poll interval in ms (default 10000 = 10s) */
  pollIntervalMs?: number;
}

// ── CricHeroes response types (from their public page/API data) ──

interface CHBatsman {
  player_id?: number;
  player_name?: string;
  name?: string;
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  strike_rate?: number;
  sr?: number;
  how_out?: string;
  dismissal?: string;
  is_on_strike?: boolean;
  batting?: boolean;
}

interface CHBowler {
  player_id?: number;
  player_name?: string;
  name?: string;
  overs?: number | string;
  maidens?: number;
  runs?: number;
  runs_conceded?: number;
  wickets?: number;
  economy?: number;
  eco?: number;
  dots?: number;
}

interface CHInningsData {
  batting_team_id?: number;
  batting_team_name?: string;
  bowling_team_id?: number;
  bowling_team_name?: string;
  total_runs?: number;
  runs?: number;
  total_wickets?: number;
  wickets?: number;
  total_overs?: number | string;
  overs?: number | string;
  run_rate?: number;
  crr?: number;
  required_run_rate?: number;
  rrr?: number;
  target?: number;
  batsmen?: CHBatsman[];
  batsman?: CHBatsman[];
  current_batsmen?: CHBatsman[];
  bowlers?: CHBowler[];
  bowler?: CHBowler[];
  current_bowler?: CHBowler | CHBowler[];
  this_over?: string[];
  current_over?: string[];
  recent_overs?: string[];
  partnership?: { runs?: number; balls?: number };
  extras?: { total?: number; wides?: number; no_balls?: number; byes?: number; leg_byes?: number };
}

export interface CHMatchData {
  match_id?: number;
  status?: string;
  current_innings?: number;
  innings?: CHInningsData[];
  current_innings_data?: CHInningsData;
  team_a?: { id?: number; name?: string; logo?: string };
  team_b?: { id?: number; name?: string; logo?: string };
  toss?: { won_by?: number; elected?: string };
  result?: string;
  venue?: string;
  date?: string;
}

export class CricHeroesAdapter implements IScoringAdapter {
  readonly provider = 'cricheroes' as const;

  private matchUrl: string;
  private proxyBaseUrl: string;
  private pollIntervalMs: number;
  private matchId: string = '';

  constructor(config: CricHeroesConfig = {}) {
    this.matchUrl = config.matchUrl || '';
    this.proxyBaseUrl = config.proxyBaseUrl || '/api/cricheroes-proxy';
    this.pollIntervalMs = config.pollIntervalMs || 10000;
    if (this.matchUrl) {
      this.matchId = this.extractMatchId(this.matchUrl);
    }
  }

  /** Extract numeric match ID from CricHeroes URL or raw ID */
  private extractMatchId(urlOrId: string): string {
    if (/^\d+$/.test(urlOrId.trim())) return urlOrId.trim();
    // URL: https://cricheroes.com/scorecard/12345/match-slug
    const m1 = urlOrId.match(/cricheroes\.com\/scorecard\/(\d+)/);
    if (m1) return m1[1];
    // URL: https://cricheroes.com/match/12345
    const m2 = urlOrId.match(/cricheroes\.com\/match\/(\d+)/);
    if (m2) return m2[1];
    return urlOrId.trim();
  }

  /** Fetch live data from CricHeroes via proxy */
  private async fetchLiveData(): Promise<CHMatchData | null> {
    if (!this.matchId) return null;
    try {
      const url = `${this.proxyBaseUrl}?matchId=${encodeURIComponent(this.matchId)}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[CricHeroes] Proxy returned ${response.status}`);
        return null;
      }
      return await response.json() as CHMatchData;
    } catch (err) {
      console.error('[CricHeroes] Failed to fetch live data:', err);
      return null;
    }
  }

  /** Transform CricHeroes data to our LiveScore format */
  transformToLiveScore(data: CHMatchData): LiveScore | null {
    const innings = data.current_innings_data || data.innings?.[(data.current_innings || 1) - 1];
    if (!innings) return null;

    const totalRuns = innings.total_runs ?? innings.runs ?? 0;
    const totalWickets = innings.total_wickets ?? innings.wickets ?? 0;
    const totalOvers = parseFloat(String(innings.total_overs ?? innings.overs ?? 0));
    const runRate = innings.run_rate ?? innings.crr ?? (totalOvers > 0 ? totalRuns / totalOvers : 0);

    // Parse current batsmen
    const rawBatsmen = innings.current_batsmen || innings.batsman || innings.batsmen || [];
    const currentBatsmen: [LiveBatsman, LiveBatsman] = [
      this.transformBatsman(rawBatsmen[0], true),
      this.transformBatsman(rawBatsmen[1], false),
    ];

    // Parse current bowler
    const rawBowler = Array.isArray(innings.current_bowler)
      ? innings.current_bowler[0]
      : innings.current_bowler || (innings.bowlers || innings.bowler || [])[0];
    const currentBowler = this.transformBowler(rawBowler);

    // Current over balls
    const currentOverBalls = innings.this_over || innings.current_over || [];

    // Recent overs
    const recentOvers = innings.recent_overs || [];

    // Partnership
    const partnership = innings.partnership || { runs: 0, balls: 0 };

    // Determine teams
    const battingTeamId = String(innings.batting_team_id || data.team_a?.id || '');
    const bowlingTeamId = String(innings.bowling_team_id || data.team_b?.id || '');

    return {
      matchId: String(data.match_id || this.matchId),
      currentInnings: (data.current_innings || 1) as 1 | 2,
      battingTeamId,
      bowlingTeamId,
      runs: totalRuns,
      wickets: totalWickets,
      overs: totalOvers,
      runRate: Math.round(runRate * 100) / 100,
      requiredRate: innings.required_run_rate ?? innings.rrr,
      target: innings.target,
      currentBatsmen,
      currentBowler,
      lastBall: (currentOverBalls[currentOverBalls.length - 1] || '0') as LiveScore['lastBall'],
      lastBallRuns: 0,
      currentOverBalls,
      recentOvers,
      partnership: { runs: partnership.runs || 0, balls: partnership.balls || 0 },
      lastUpdated: Date.now(),
      isPowerplay: totalOvers < 6,
      powerplayOvers: 6,
      isFreehit: false,
    };
  }

  private transformBatsman(raw: CHBatsman | undefined, isOnStrike: boolean): LiveBatsman {
    if (!raw) {
      return { playerId: '', playerName: 'TBD', runs: 0, balls: 0, fours: 0, sixes: 0, strikeRate: 0, isOnStrike };
    }
    return {
      playerId: String(raw.player_id || ''),
      playerName: raw.player_name || raw.name || 'Unknown',
      runs: raw.runs || 0,
      balls: raw.balls || 0,
      fours: raw.fours || 0,
      sixes: raw.sixes || 0,
      strikeRate: raw.strike_rate || raw.sr || 0,
      isOnStrike: raw.is_on_strike ?? raw.batting ?? isOnStrike,
    };
  }

  private transformBowler(raw: CHBowler | undefined): LiveBowler {
    if (!raw) {
      return { playerId: '', playerName: 'TBD', overs: 0, maidens: 0, runs: 0, wickets: 0, economy: 0, dots: 0 };
    }
    return {
      playerId: String(raw.player_id || ''),
      playerName: raw.player_name || raw.name || 'Unknown',
      overs: parseFloat(String(raw.overs || 0)),
      maidens: raw.maidens || 0,
      runs: raw.runs ?? raw.runs_conceded ?? 0,
      wickets: raw.wickets || 0,
      economy: raw.economy || raw.eco || 0,
      dots: raw.dots || 0,
    };
  }

  async fetchMatchScore(_externalMatchId: string): Promise<MatchScore> {
    throw new Error('CricHeroes fetchMatchScore — use syncLiveScore for real-time data');
  }

  async fetchPlayerMatchStats(_externalMatchId: string, _playerId: string): Promise<PlayerMatchStats> {
    throw new Error('CricHeroes fetchPlayerMatchStats not implemented');
  }

  /** Subscribe to live score updates by polling CricHeroes public scorecard */
  syncLiveScore(_externalMatchId: string, callback: (score: LiveScore) => void): () => void {
    if (!this.isConfigured()) {
      console.warn('[CricHeroes] Not configured — provide a match URL via setMatchUrl()');
      return () => {};
    }

    let active = true;

    const poll = async () => {
      if (!active) return;
      const data = await this.fetchLiveData();
      if (data && active) {
        const liveScore = this.transformToLiveScore(data);
        if (liveScore) {
          callback(liveScore);
        }
      }
    };

    // Initial poll immediately
    poll();
    // Then poll at interval
    const interval = setInterval(poll, this.pollIntervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  isConfigured(): boolean {
    return !!this.matchId;
  }

  getProviderName(): string {
    return 'CricHeroes';
  }

  /** Update match URL at runtime (from admin config) */
  setMatchUrl(url: string): void {
    this.matchUrl = url;
    this.matchId = this.extractMatchId(url);
  }

  /** Update proxy URL at runtime */
  setProxyUrl(url: string): void {
    this.proxyBaseUrl = url;
  }

  /** Get the extracted match ID */
  getMatchId(): string {
    return this.matchId;
  }
}
