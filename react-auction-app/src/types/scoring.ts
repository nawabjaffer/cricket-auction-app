// ============================================================================
// CRICKET SCORING MODULE — TYPE DEFINITIONS
// Ball-by-ball scoring, live scorecard, OBS overlay, career stats
// ============================================================================

// ── Scoring Provider ──

export type ScoringProvider = 'cricheroes' | 'cricbuzz' | 'manual' | 'custom';

// ── Match Setup & Config ──

export interface MatchSetup {
  id: string;
  teamA: { id: string; name: string; logoUrl?: string; primaryColor?: string };
  teamB: { id: string; name: string; logoUrl?: string; primaryColor?: string };
  venue: string;
  date: string;           // ISO date
  maxOvers: number;       // e.g. 20 for T20
  tossWonBy?: string;     // team ID
  tossElected?: 'bat' | 'bowl';
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  createdAt: number;
  updatedAt: number;
}

export interface MatchScoringConfig {
  provider: ScoringProvider;
  externalMatchId?: string;  // CricHeroes match ID, etc.
  apiKey?: string;
  webhookUrl?: string;
  pollIntervalMs?: number;   // default 30000
}

// ── Ball-by-ball ──

export type BallOutcome =
  | '0' | '1' | '2' | '3' | '4' | '6'
  | 'W'     // wicket
  | 'WD'    // wide
  | 'NB'    // no-ball
  | 'B'     // bye
  | 'LB'    // leg bye
  | 'WD+1' | 'WD+2' | 'WD+4'  // wide + extra runs
  | 'NB+0' | 'NB+1' | 'NB+2' | 'NB+4' | 'NB+6'; // no-ball + runs

export type DismissalType =
  | 'bowled' | 'caught' | 'lbw' | 'run_out'
  | 'stumped' | 'hit_wicket' | 'retired_hurt'
  | 'retired_out' | 'obstructing_field' | 'timed_out';

export interface WicketDetail {
  dismissalType: DismissalType;
  batsmanId: string;
  bowlerId: string;
  fielderId?: string;      // for caught, run out, stumped
  fielderName?: string;
  newBatsmanId?: string;   // replacement batsman
}

export interface BallEvent {
  id: string;              // unique ball ID
  inningsNumber: 1 | 2;
  overNumber: number;      // 0-indexed (0 = first over)
  ballInOver: number;      // 0-indexed legal ball count in this over
  outcome: BallOutcome;
  runs: number;            // total runs from this ball
  batsmanRuns: number;     // runs credited to batsman
  extras: number;          // extra runs
  extraType?: 'wide' | 'noball' | 'bye' | 'legbye';
  isLegal: boolean;        // false for wides/no-balls
  isBoundary: boolean;
  isSix: boolean;
  isWicket: boolean;
  wicket?: WicketDetail;
  strikerId: string;       // batsman on strike
  nonStrikerId: string;    // batsman at non-strike end
  bowlerId: string;
  timestamp: number;
}

export interface Over {
  number: number;          // 0-indexed
  bowlerId: string;
  bowlerName: string;
  balls: BallEvent[];
  runs: number;
  wickets: number;
  extras: number;
}

// ── Innings ──

export interface Extras {
  total: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  penalty: number;
}

export interface BatsmanInnings {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal: string;       // "c Smith b Jones" or "not out"
  isOut: boolean;
  order: number;           // batting order (1-indexed)
}

export interface BowlerInnings {
  playerId: string;
  playerName: string;
  overs: number;           // completed overs (e.g. 3.4)
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  wides: number;
  noBalls: number;
  dots: number;
}

export interface FallOfWicket {
  wicketNumber: number;
  score: number;
  overs: number;
  batsmanId: string;
  batsmanName: string;
}

export interface Innings {
  number: 1 | 2;
  battingTeamId: string;
  bowlingTeamId: string;
  totalRuns: number;
  totalWickets: number;
  totalOvers: number;      // e.g. 15.3
  maxOvers: number;
  extras: Extras;
  batsmen: BatsmanInnings[];
  bowlers: BowlerInnings[];
  fallOfWickets: FallOfWicket[];
  overs: Over[];
  isCompleted: boolean;
}

// ── Match Score (completed) ──

export interface MatchResult {
  winner: string;          // team ID
  margin: string;          // "5 wickets" or "32 runs"
  method?: string;         // "DLS" etc.
}

export interface MatchScore {
  matchId: string;
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  teams: { batting: string; bowling: string }[];
  innings: Innings[];
  result: MatchResult | null;
  toss: { wonBy: string; elected: 'bat' | 'bowl' } | null;
  venue: string;
  date: string;
  motm?: string;
}

// ── Live Score (real-time updates written per ball) ──

export interface LiveBatsman {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOnStrike: boolean;
}

export interface LiveBowler {
  playerId: string;
  playerName: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  dots: number;
}

export interface LiveScore {
  matchId: string;
  currentInnings: 1 | 2;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  overs: number;           // e.g. 15.3
  runRate: number;
  requiredRate?: number;
  target?: number;
  currentBatsmen: [LiveBatsman, LiveBatsman]; // striker, non-striker
  currentBowler: LiveBowler;
  lastBall: BallOutcome;
  lastBallRuns: number;
  currentOverBalls: string[];   // e.g. ["1", "4", "0", "W", "2"]
  recentOvers: string[];        // e.g. ["7", "4", "12", "6"]  (runs per over)
  partnership: { runs: number; balls: number };
  lastUpdated: number;
}

// ── Player Stats ──

export interface PlayerMatchStats {
  playerId: string;
  matchId: string;
  batting?: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    strikeRate: number;
    dismissal: string;
    isNotOut: boolean;
  };
  bowling?: {
    overs: number;
    maidens: number;
    runs: number;
    wickets: number;
    economy: number;
    dots: number;
    wides: number;
    noBalls: number;
  };
  fielding?: {
    catches: number;
    runOuts: number;
    stumpings: number;
  };
}

export interface PlayerCareerStats {
  playerId: string;
  matchesPlayed: number;
  batting: {
    innings: number;
    runs: number;
    highestScore: number;
    average: number;
    strikeRate: number;
    fifties: number;
    hundreds: number;
    fours: number;
    sixes: number;
    notOuts: number;
  };
  bowling: {
    innings: number;
    overs: number;
    wickets: number;
    bestBowling: string;  // "3/24"
    average: number;
    economy: number;
    threeWickets: number;
    fiveWickets: number;
  };
  fielding: {
    catches: number;
    runOuts: number;
    stumpings: number;
  };
  lastUpdated: number;
}

// ── Overlay Control State (admin → overlay real-time) ──

export type OverlayType =
  | 'none'
  | 'batsman_striker'
  | 'batsman_nonstriker'
  | 'bowler'
  | 'full_scorecard'
  | 'boundary_four'
  | 'boundary_six'
  | 'wicket'
  | 'duck_out'
  | 'hat_trick'
  | 'live_question'
  | 'ads_break';

export interface LiveQuestion {
  id: string;
  text: string;
  options?: string[];
  imageUrl?: string;
  duration: number;        // seconds
}

export interface OverlayControlState {
  activeOverlay: OverlayType;
  activeOverlayData?: Record<string, unknown>;
  liveQuestion?: LiveQuestion;
  lastUpdated: number;
}

// ── Ads ──

export interface ScoringAd {
  id: string;
  name: string;
  imageUrl: string;
  position: 'l-banner' | 'bottom-strip' | 'break';
  durationSeconds: number;
  active: boolean;
  order: number;
}

// ── Overlay Config (persisted admin settings) ──

export interface ScoringOverlayConfig {
  tournamentLogo?: string;
  tournamentName?: string;
  titleSponsorLogo?: string;
  titleSponsorName?: string;
  broadcastPartnerLogo?: string;
  broadcastPartnerName?: string;
  showLiveBadge: boolean;
  // Animation enables
  enableBoundaryAnimation: boolean;
  enableWicketAnimation: boolean;
  enableDuckOutAnimation: boolean;
  enableHatTrickAnimation: boolean;
  enableSixerAnimation: boolean;
  enableKeyboardShortcuts: boolean;
  autoOverlayEnabled: boolean;
  autoOverlayIntervalSeconds: number;
  // Custom animation assets (optional image/video URLs)
  duckOutImageUrl?: string;
  hatTrickImageUrl?: string;
  wicketImageUrl?: string;
  // Live questions queue
  liveQuestions: LiveQuestion[];
  // Toss animation config
  tossConfig?: TossConfig;
}

// ── Scoring Adapter Interface ──

export interface IScoringAdapter {
  readonly provider: ScoringProvider;
  fetchMatchScore(matchId: string): Promise<MatchScore>;
  fetchPlayerMatchStats(matchId: string, playerId: string): Promise<PlayerMatchStats>;
  syncLiveScore(matchId: string, callback: (score: LiveScore) => void): () => void;
  isConfigured(): boolean;
  getProviderName(): string;
}

// ── Squad / Lineup for a match ──

export interface MatchSquadPlayer {
  playerId: string;
  playerName: string;
  role: string;
  battingOrder?: number;
  isCaptain?: boolean;
  isWicketKeeper?: boolean;
}

export interface MatchLineup {
  matchId: string;
  teamId: string;
  players: MatchSquadPlayer[];
}

// ── Helper: create empty career stats ──

export function createEmptyCareerStats(playerId: string): PlayerCareerStats {
  return {
    playerId,
    matchesPlayed: 0,
    batting: {
      innings: 0, runs: 0, highestScore: 0,
      average: 0, strikeRate: 0,
      fifties: 0, hundreds: 0, fours: 0, sixes: 0, notOuts: 0,
    },
    bowling: {
      innings: 0, overs: 0, wickets: 0,
      bestBowling: '0/0', average: 0, economy: 0,
      threeWickets: 0, fiveWickets: 0,
    },
    fielding: { catches: 0, runOuts: 0, stumpings: 0 },
    lastUpdated: Date.now(),
  };
}

// ── Pre-Match Overlay Types ──

export type PreMatchPhase =
  | 'idle'
  | 'squad_display'       // Show both teams' full squads
  | 'toss_animation'      // Coin flip video (head / tail)
  | 'toss_result'         // Show who won toss & elected to bat/bowl
  | 'squad_reveal_teamA'  // Animated reveal of Team A playing XI
  | 'squad_reveal_teamB'  // Animated reveal of Team B playing XI
  | 'impact_players'      // Show 4 impact sub players per team
  | 'match_ready';        // Transition to live scoring

export interface ImpactPlayer {
  playerId: string;
  playerName: string;
  role: string;            // 'batsman' | 'bowler' | 'all-rounder' | 'wicket-keeper'
  imageUrl?: string;
}

export interface TossConfig {
  headsVideoUrl?: string;   // Video file for heads animation
  tailsVideoUrl?: string;   // Video file for tails animation
  chromaKeyEnabled: boolean; // Apply chroma green matte effect
  chromaKeyColor: string;    // Default '#00FF00'
}

export interface PreMatchState {
  matchId: string;
  phase: PreMatchPhase;
  tossResult?: {
    wonBy: string;           // team ID
    elected: 'bat' | 'bowl';
    coinSide: 'heads' | 'tails';
  };
  squadRevealConfig: {
    autoReveal: boolean;
    delayAfterTossSeconds: number;  // seconds before auto-reveal starts
    playerRevealIntervalMs: number; // ms between each player reveal
  };
  impactPlayers: {
    teamA: ImpactPlayer[];   // up to 4
    teamB: ImpactPlayer[];   // up to 4
  };
  revealedPlayersTeamA: string[];   // player IDs revealed so far
  revealedPlayersTeamB: string[];
  lastUpdated: number;
}
