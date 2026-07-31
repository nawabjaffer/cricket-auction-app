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
  powerplayOvers?: number; // e.g. 6 for T20 (default: maxOvers <= 20 ? 6 : 10)
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
  | 'WD'    // wide (dot)
  | 'NB'    // no-ball (dot)
  | 'B'     // bye
  | 'LB'    // leg bye
  | 'WD+1' | 'WD+2' | 'WD+3' | 'WD+4'  // wide + extra runs
  | 'NB+0' | 'NB+1' | 'NB+2' | 'NB+3' | 'NB+4' | 'NB+6' // no-ball + runs
  | 'B+1' | 'B+2' | 'B+3' | 'B+4'       // bye + runs
  | 'LB+1' | 'LB+2' | 'LB+3' | 'LB+4'; // leg bye + runs

export type DismissalType =
  | 'bowled' | 'caught' | 'caught_and_bowled' | 'lbw' | 'run_out'
  | 'stumped' | 'hit_wicket' | 'retired_hurt'
  | 'retired_out' | 'obstructing_field' | 'timed_out';

export interface WicketDetail {
  dismissalType: DismissalType;
  batsmanId: string;
  bowlerId: string;
  fielderId?: string;      // for caught, run out, stumped
  fielderName?: string;
  newBatsmanId?: string;   // replacement batsman
  newBatsmanName?: string; // replacement batsman name
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
  lastCompletedOverBalls?: string[]; // balls from the last completed over (shown until new over starts)
  recentOvers: string[];        // e.g. ["7", "4", "12", "6"]  (runs per over)
  partnership: { runs: number; balls: number };
  lastUpdated: number;
  // Powerplay & free hit tracking
  isPowerplay: boolean;
  powerplayOvers: number;       // e.g. 6 for T20
  isFreehit: boolean;
  // Previous bowler (to prevent consecutive overs)
  previousBowlerId?: string;
  // All batsman innings (full scorecard)
  allBatsmen?: BatsmanInnings[];
  // All bowler innings (full scorecard)
  allBowlers?: BowlerInnings[];
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
  | 'ads_break'
  // Stats overlays — match scope (current match only, 2 teams)
  | 'stats_dots'
  | 'stats_fours'
  | 'stats_sixes'
  | 'stats_sr'
  | 'stats_mvp'
  | 'match_summary'
  // Stats overlays — tournament scope (all teams/players)
  | 'tournament_fours'
  | 'tournament_sixes'
  | 'tournament_sr'
  | 'tournament_mvp'
  | 'tournament_stats'
  | 'points_table'
  // Awards overlays
  | 'award_orange_cap'
  | 'award_purple_cap'
  | 'award_orange_cap_match'
  | 'award_purple_cap_match'
  | 'award_mvp'
  | 'award_ceremony'
  // Match intro sequence
  | 'match_intro'
  // Field placement overlay
  | 'field_placement';

export interface LiveQuestion {
  id: string;
  text: string;
  options?: string[];
  imageUrl?: string;
  duration: number;        // seconds
  responses?: Record<string, number>; // optionIndex -> count
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

export type AnimationType = 'css' | 'lottie' | 'image' | 'video';

export interface AnimationConfig {
  type: AnimationType;
  enabled: boolean;
  durationMs: number;        // how long the animation shows (ms)
  mediaUrl?: string;         // URL for image/video/lottie json
  soundUrl?: string;         // optional sound effect URL
  text?: string;             // text overlay (e.g. "FOUR!", "SIX!", "OUT!")
  color?: string;            // primary accent color
  scale?: number;            // scale factor (1 = normal)
  chromaKeyEnabled?: boolean; // enable chroma key (green screen removal)
  chromaKeyColor?: string;   // color to remove (default: #00ff00)
  chromaKeySimilarity?: number; // 0-1 threshold for color matching (default: 0.4)
}

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
  // Per-event animation configs
  fourAnimation?: AnimationConfig;
  sixAnimation?: AnimationConfig;
  wicketAnimation?: AnimationConfig;
  duckOutAnimation?: AnimationConfig;
  hatTrickAnimation?: AnimationConfig;
  // Live questions queue
  liveQuestions: LiveQuestion[];
  // Toss animation config
  tossConfig?: TossConfig;
  // Impact sub toggle (tournament-level)
  impactSubEnabled?: boolean;
  // Scorecard ticker config
  tickerConfig?: TickerConfig;
  // OBS WebSocket config
  obsWebSocketConfig?: OBSWebSocketConfig;
  // OBS Replay Source button configuration
  obsReplayConfig?: OBSReplayConfig;
  // MVP point weights (customizable)
  mvpWeights?: MVPWeights;
  // Minimum balls for strike rate eligibility
  minBallsForSR?: number; // default 10
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
  imageUrl?: string;
  auctionPrice?: number;
  isImpactSub?: boolean;        // marked as impact substitute at match time
  replacedPlayerId?: string;    // player this impact sub replaced
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
  chromaKeySimilarity?: number; // 0-1, how aggressively to remove chroma color (default 0.4)
  tossDurationSeconds?: number; // How many seconds to show the toss animation (default 5)
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

// ── MVP Points System ──

export interface MVPWeights {
  runPoints: number;            // default 1
  fourBonus: number;            // default 1
  sixBonus: number;             // default 2
  wicketPoints: number;         // default 25
  catchPoints: number;          // default 10
  runOutPoints: number;         // default 10
  stumpingPoints: number;       // default 10
  maidenPoints: number;         // default 5
  dotBallPoints: number;        // default 0.5
  // Bonuses
  thirtyRunBonus: number;       // default 4
  halfCenturyBonus: number;     // default 8
  centuryBonus: number;         // default 16
  threeWicketBonus: number;     // default 4
  fiveWicketBonus: number;      // default 8
  economyBonusThreshold: number;   // default 6.0 (eco below this gets bonus)
  economyBonusPoints: number;      // default 4
  srBonusThreshold: number;        // default 150 (SR above this gets bonus)
  srBonusPoints: number;           // default 4
}

export const DEFAULT_MVP_WEIGHTS: MVPWeights = {
  runPoints: 1,
  fourBonus: 1,
  sixBonus: 2,
  wicketPoints: 25,
  catchPoints: 10,
  runOutPoints: 10,
  stumpingPoints: 10,
  maidenPoints: 5,
  dotBallPoints: 0.5,
  thirtyRunBonus: 4,
  halfCenturyBonus: 8,
  centuryBonus: 16,
  threeWicketBonus: 4,
  fiveWicketBonus: 8,
  economyBonusThreshold: 6.0,
  economyBonusPoints: 4,
  srBonusThreshold: 150,
  srBonusPoints: 4,
};

export interface PlayerMVPPoints {
  playerId: string;
  playerName: string;
  teamId: string;
  batting: number;
  bowling: number;
  fielding: number;
  bonus: number;
  total: number;
}

// ── Match Stats (real-time aggregation) ──

export interface PlayerStatEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  imageUrl?: string;
}

export interface BowlerStatEntry {
  playerId: string;
  playerName: string;
  teamId: string;
  wickets: number;
  runs: number;
  overs: number;
  economy: number;
  dots: number;
  imageUrl?: string;
}

export interface MatchStatsSnapshot {
  matchId: string;
  highestDotBallBowler: { playerId: string; playerName: string; teamId: string; dots: number; balls: number } | null;
  highestFourScorer: { playerId: string; playerName: string; teamId: string; fours: number } | null;
  highestSixScorer: { playerId: string; playerName: string; teamId: string; sixes: number } | null;
  highestStrikeRate: { playerId: string; playerName: string; teamId: string; strikeRate: number; runs: number; balls: number } | null;
  mvpLeaderboard: PlayerMVPPoints[];
  // Ranked lists for overlay consumption
  topRunScorers: PlayerStatEntry[];
  topWicketTakers: BowlerStatEntry[];
  topFours: PlayerStatEntry[];
  topSixes: PlayerStatEntry[];
  topStrikeRates: PlayerStatEntry[];
  topDotBowlers: BowlerStatEntry[];
  mvpPoints: { playerId: string; playerName: string; teamId: string; totalPoints: number; imageUrl?: string }[];
  lastUpdated: number;
}

// ── Tournament Stats ──

export interface TournamentStats {
  orangeCap: { playerId: string; playerName: string; teamId: string; teamName: string; runs: number; matches: number; imageUrl?: string } | null;
  purpleCap: { playerId: string; playerName: string; teamId: string; teamName: string; wickets: number; matches: number; imageUrl?: string } | null;
  mostSixes: { playerId: string; playerName: string; teamId: string; teamName: string; sixes: number; imageUrl?: string } | null;
  mostFours: { playerId: string; playerName: string; teamId: string; teamName: string; fours: number; imageUrl?: string } | null;
  bestEconomy: { playerId: string; playerName: string; teamId: string; teamName: string; economy: number; overs: number; imageUrl?: string } | null;
  bestStrikeRate: { playerId: string; playerName: string; teamId: string; teamName: string; strikeRate: number; runs: number; balls: number; imageUrl?: string } | null;
  mostDotBalls: { playerId: string; playerName: string; teamId: string; teamName: string; dots: number; imageUrl?: string } | null;
  mvpLeaderboard: PlayerMVPPoints[];
  // Ranked lists for overlays
  topRunScorers: { playerId: string; playerName: string; teamId: string; teamName: string; runs: number; balls: number; strikeRate: number; imageUrl?: string }[];
  topWicketTakers: { playerId: string; playerName: string; teamId: string; teamName: string; wickets: number; economy: number; imageUrl?: string }[];
  topSixHitters: { playerId: string; playerName: string; teamId: string; teamName: string; sixes: number; imageUrl?: string }[];
  topFourHitters: { playerId: string; playerName: string; teamId: string; teamName: string; fours: number; imageUrl?: string }[];
  topStrikeRates: { playerId: string; playerName: string; teamId: string; teamName: string; strikeRate: number; runs: number; balls: number; imageUrl?: string }[];
  lastUpdated: number;
}

// ── Tournament Awards ──

export type AwardCategory =
  | 'orange_cap'
  | 'purple_cap'
  | 'mvp'
  | 'most_sixes'
  | 'best_strike_rate'
  | 'best_economy'
  | 'most_dot_balls'
  | 'best_fielder'
  | 'motm';

export interface TournamentAward {
  id: string;
  category: AwardCategory;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  value: string;               // "342 runs", "15 wickets"
  matchId?: string;            // for MOTM
  sponsorName?: string;        // reuse from auction sponsors
  sponsorLogoUrl?: string;
  imageUrl?: string;
}

// ── Scorecard Ticker Config ──

export type TickerMode = 'html' | 'png';
export type TickerDesign = 'glass' | 'premium';
export type TickerInfoMode = 'batsmen' | 'target' | 'projection';

export interface TickerConfig {
  mode: TickerMode;
  design?: TickerDesign;       // 'glass' (light/frosted) or 'premium' (dark purple/gold)
  position?: 'top' | 'bottom';
  height?: number;
  showBowlerOnRight?: boolean;
  animationSpeed?: number;
  dotBallSymbol?: string;      // custom emoji/symbol for dot balls (default '0')
  infoMode?: TickerInfoMode;   // batsmen | target | projection
  // HTML/CSS mode
  customHTML?: string;
  customCSS?: string;
  // PNG template mode
  pngTemplateUrl?: string;
  pngFieldPositions?: Record<string, { x: number; y: number; fontSize?: number; color?: string; fontWeight?: string }>;
}

// ── OBS WebSocket Config ──

export interface OBSWebSocketConfig {
  host: string;
  port: number;
  password?: string;
  autoReplay: boolean;
  replayDelaySeconds: number;
  replayDurationSeconds: number;
}

// ── OBS Replay Source Button configuration ──

/** How a configured button interacts with OBS */
export type OBSButtonAction =
  | 'hotkey_name'       // TriggerHotkeyByName — best for Replay Source plugin
  | 'hotkey_sequence'   // TriggerHotkeyByKeySequence — simulates a keypress
  | 'scene_switch'      // SetCurrentProgramScene
  | 'replay_buffer_save'  // SaveReplayBuffer (built-in replay buffer)
  | 'replay_buffer_start' // StartReplayBuffer
  | 'replay_buffer_stop'; // StopReplayBuffer

export interface OBSButtonKeySequence {
  keyId: string;    // OBS key ID string, e.g. "OBS_KEY_F1"
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

export interface OBSReplayButton {
  id: string;
  label: string;
  icon: string;           // emoji or text symbol
  color: string;          // CSS color for accent
  action: OBSButtonAction;
  hotkeyName?: string;    // for action = 'hotkey_name'
  keySequence?: OBSButtonKeySequence; // for action = 'hotkey_sequence'
  sceneName?: string;     // for action = 'scene_switch'
  order: number;
  enabled: boolean;
}

export interface OBSReplayConfig {
  replaySceneName?: string;  // scene to switch to when showing replay
  drsSceneName?: string;     // scene to switch to for DRS review
  buttons: OBSReplayButton[];
}

// Replay Trigger (written to RTDB for overlay/dock to consume)

export interface ReplayTrigger {
  id: string;
  matchId: string;
  type: 'four' | 'six' | 'wicket';
  timestamp: number;
  delaySeconds: number;
  consumed: boolean;
}

// ── Field Placement ──

export interface FielderPosition {
  id: string;
  label: string;             // e.g. 'Mid-on', 'Deep Fine Leg'
  x: number;                 // 0-100 percentage from left
  y: number;                 // 0-100 percentage from top
}

export interface FieldPlacement {
  id: string;
  name: string;              // e.g. 'Powerplay Default', 'Death Overs Spread'
  positions: FielderPosition[];
  isDefault?: boolean;       // mark as a preset
}

export const DEFAULT_FIELD_PLACEMENTS: FieldPlacement[] = [
  {
    id: 'powerplay',
    name: 'Powerplay (2 out)',
    isDefault: true,
    positions: [
      { id: 'wk', label: 'Wicket Keeper', x: 50, y: 62 },
      { id: 'slip', label: 'Slip', x: 58, y: 58 },
      { id: 'point', label: 'Point', x: 72, y: 42 },
      { id: 'cover', label: 'Cover', x: 68, y: 30 },
      { id: 'mid-off', label: 'Mid Off', x: 55, y: 22 },
      { id: 'mid-on', label: 'Mid On', x: 42, y: 22 },
      { id: 'midwicket', label: 'Mid Wicket', x: 30, y: 32 },
      { id: 'sq-leg', label: 'Square Leg', x: 28, y: 48 },
      { id: 'fine-leg', label: 'Fine Leg', x: 30, y: 72 },
      { id: 'third-man', label: 'Third Man', x: 72, y: 72 },
      { id: 'long-on', label: 'Long On', x: 42, y: 8 },
    ],
  },
  {
    id: 'death-overs',
    name: 'Death Overs (5 out)',
    isDefault: true,
    positions: [
      { id: 'wk', label: 'Wicket Keeper', x: 50, y: 62 },
      { id: 'long-off', label: 'Long Off', x: 60, y: 8 },
      { id: 'long-on', label: 'Long On', x: 40, y: 8 },
      { id: 'deep-midwicket', label: 'Deep Mid Wicket', x: 18, y: 25 },
      { id: 'deep-sq-leg', label: 'Deep Square Leg', x: 12, y: 50 },
      { id: 'fine-leg', label: 'Fine Leg', x: 25, y: 80 },
      { id: 'third-man', label: 'Third Man', x: 75, y: 80 },
      { id: 'deep-point', label: 'Deep Point', x: 85, y: 42 },
      { id: 'deep-cover', label: 'Deep Cover', x: 82, y: 22 },
      { id: 'mid-off', label: 'Mid Off', x: 55, y: 30 },
      { id: 'mid-on', label: 'Mid On', x: 42, y: 30 },
    ],
  },
  {
    id: 'spin-attack',
    name: 'Spin Attack',
    isDefault: true,
    positions: [
      { id: 'wk', label: 'Wicket Keeper', x: 50, y: 62 },
      { id: 'slip', label: 'Slip', x: 58, y: 56 },
      { id: 'short-leg', label: 'Short Leg', x: 42, y: 48 },
      { id: 'silly-point', label: 'Silly Point', x: 58, y: 46 },
      { id: 'cover', label: 'Cover', x: 72, y: 30 },
      { id: 'mid-off', label: 'Mid Off', x: 55, y: 20 },
      { id: 'mid-on', label: 'Mid On', x: 42, y: 20 },
      { id: 'midwicket', label: 'Mid Wicket', x: 28, y: 32 },
      { id: 'deep-midwicket', label: 'Deep Mid Wicket', x: 15, y: 25 },
      { id: 'long-on', label: 'Long On', x: 38, y: 5 },
      { id: 'long-off', label: 'Long Off', x: 62, y: 5 },
    ],
  },
];
