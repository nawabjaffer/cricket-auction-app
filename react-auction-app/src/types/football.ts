// ============================================================================
// FOOTBALL SCORING MODULE — TYPE DEFINITIONS
// Team & player management, live match state (timer / goals / cards),
// broadcast OBS overlay, and stats dock (top scorers, rankings).
//
// Mirrors the cricket scoring model (src/types/scoring.ts) but with
// football-specific logic: formations, positions, goals/assists, halves,
// added/extra time.
// ============================================================================

// ── Positions & formations ──

export type FootballPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export const FOOTBALL_POSITIONS: { value: FootballPosition; label: string; order: number }[] = [
  { value: 'GK', label: 'Goalkeeper', order: 0 },
  { value: 'DEF', label: 'Defender', order: 1 },
  { value: 'MID', label: 'Midfielder', order: 2 },
  { value: 'FWD', label: 'Forward', order: 3 },
];

/** Common formations. Numbers are outfield lines back-to-front (excludes GK). */
export type FootballFormation =
  | '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3'
  | '5-3-2' | '5-4-1' | '4-5-1' | '4-1-4-1';

export const FOOTBALL_FORMATIONS: FootballFormation[] = [
  '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1', '4-5-1', '4-1-4-1',
];

// ── Team ──

export interface FootballTeam {
  id: string;
  name: string;
  shortName: string;       // 3-letter code shown on the scoreboard, e.g. "MUN"
  logoUrl?: string;
  primaryColor?: string;   // shirt / brand color
  secondaryColor?: string;
  formation?: FootballFormation;
  coach?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Player ──

export interface FootballPlayer {
  id: string;
  teamId: string;
  name: string;
  photoUrl?: string;
  number?: number;         // squad number
  position: FootballPosition;
  isCaptain?: boolean;
  isStarter?: boolean;     // in the starting XI vs bench
  nationality?: string;
  age?: number;
  // Season / ranking stats (may be sourced from a sheet import)
  appearances?: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheets?: number;    // for GK/DEF
  minutesPlayed?: number;
  rating?: number;         // 0-10 average match rating
  ranking?: number;        // manual leaderboard rank
  marketValue?: string;    // display string, e.g. "€45M"
  createdAt: number;
  updatedAt: number;
}

// ── Match setup ──

export interface FootballTeamRef {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface FootballMatchSetup {
  id: string;
  teamA: FootballTeamRef;  // home
  teamB: FootballTeamRef;  // away
  venue: string;
  date: string;            // ISO date
  competition?: string;    // e.g. "Group Stage", "Final"
  halfDurationMin: number; // e.g. 45
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  referee?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Match events (goals, cards, substitutions) ──

export type FootballEventType =
  | 'goal' | 'own_goal' | 'penalty_goal' | 'penalty_miss'
  | 'yellow_card' | 'red_card' | 'second_yellow'
  | 'substitution' | 'assist';

export interface FootballMatchEvent {
  id: string;
  type: FootballEventType;
  teamId: string;          // team the event belongs to
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  subOutPlayerId?: string;
  subOutPlayerName?: string;
  minute: number;          // match minute at time of event
  addedTime?: number;      // stoppage minute (e.g. 45+2 -> minute 45, addedTime 2)
  half: FootballHalf;
  timestamp: number;
}

// ── Live state (timer + score, written by the scorer, read by overlays) ──

export type FootballHalf =
  | 'not_started' | 'first_half' | 'half_time'
  | 'second_half' | 'extra_first' | 'extra_break'
  | 'extra_second' | 'penalties' | 'full_time';

export const FOOTBALL_HALF_LABELS: Record<FootballHalf, string> = {
  not_started: 'Kick-off',
  first_half: '1st Half',
  half_time: 'Half Time',
  second_half: '2nd Half',
  extra_first: 'ET 1st',
  extra_break: 'ET Break',
  extra_second: 'ET 2nd',
  penalties: 'Penalties',
  full_time: 'Full Time',
};

export interface FootballLiveState {
  matchId: string;
  homeScore: number;
  awayScore: number;
  homePenalties?: number;  // shoot-out score
  awayPenalties?: number;
  half: FootballHalf;
  // Timer: the clock is derived from `running` + `clockStartedAt` + `baseElapsedSec`.
  running: boolean;
  clockStartedAt: number;  // epoch ms when the clock was last resumed (0 if paused)
  baseElapsedSec: number;  // accumulated seconds while paused
  addedTimeMin: number;    // announced stoppage time for the current half
  events: FootballMatchEvent[];
  lastUpdated: number;
}

// ── OBS overlay control (celebration triggers) ──

export type FootballOverlayType =
  | 'none' | 'goal' | 'penalty' | 'red_card' | 'yellow_card'
  | 'substitution' | 'kickoff' | 'half_time' | 'full_time' | 'lineup';

export interface FootballOverlayControl {
  activeOverlay: FootballOverlayType;
  activeEvent?: FootballMatchEvent;
  lastUpdated: number;
}

// ── Overlay branding / theme config (persisted admin settings) ──

export interface FootballAnimationConfig {
  enabled: boolean;
  durationMs: number;
  mediaUrl?: string;       // optional custom image/gif for the celebration
  soundUrl?: string;
  text?: string;           // e.g. "GOAL!"
}

export interface FootballOverlayConfig {
  tournamentLogo?: string;
  tournamentName?: string;
  broadcastPartnerLogo?: string;
  broadcastPartnerName?: string;
  // Broadcast theme colors — default to the requested red / yellow / black palette.
  primaryColor: string;    // scoreboard base (default black)
  secondaryColor: string;  // accent bar (default red)
  accentColor: string;     // highlights / timer (default yellow)
  textColor: string;
  showLiveBadge: boolean;
  showTimer: boolean;
  scoreboardPosition: 'top-left' | 'top-center' | 'top-right';
  // Celebration animations
  enableGoalAnimation: boolean;
  enableCardAnimation: boolean;
  goalAnimation?: FootballAnimationConfig;
  redCardAnimation?: FootballAnimationConfig;
  // Stats sheet source (optional Google Sheet CSV URL for rankings import)
  statsSheetUrl?: string;
}

export const DEFAULT_FOOTBALL_OVERLAY_CONFIG: FootballOverlayConfig = {
  primaryColor: '#0a0a0a',
  secondaryColor: '#e11d1d',
  accentColor: '#facc15',
  textColor: '#ffffff',
  showLiveBadge: true,
  showTimer: true,
  scoreboardPosition: 'top-left',
  enableGoalAnimation: true,
  enableCardAnimation: true,
  goalAnimation: { enabled: true, durationMs: 5000, text: 'GOAL!' },
  redCardAnimation: { enabled: true, durationMs: 4000, text: 'RED CARD' },
};

// ── Rules & regulations (per-tournament, configured from Platform Admin) ─────

/** Match format — players per side. */
export type FootballFormat = '5s' | '7s' | '9s' | '11s';

export const FOOTBALL_FORMATS: { value: FootballFormat; label: string }[] = [
  { value: '5s', label: '5-a-side' },
  { value: '7s', label: '7-a-side' },
  { value: '9s', label: '9-a-side' },
  { value: '11s', label: '11-a-side' },
];

export interface FootballRulesConfig {
  format: FootballFormat;
  playersPerSide: number;
  // Timing
  halfDurationMin: number;     // duration of each half (minutes)
  numberOfHalves: number;      // usually 2
  halfTimeBreakMin: number;    // interval between halves
  // Extra time
  extraTimeEnabled: boolean;
  extraTimeHalfMin: number;    // each ET half duration
  // Penalties
  penaltiesEnabled: boolean;
  penaltyShootoutBest: number; // best-of N (e.g. 5)
  // Substitutions
  maxSubstitutions: number;    // per team (use 99 for unlimited/rolling)
  rollingSubs: boolean;
  squadSize: number;           // total squad incl. subs
  // Discipline
  yellowCardsForSuspension: number; // accumulation → suspension
  sinBinEnabled: boolean;      // temporary suspension (common in small-sided)
  sinBinMinutes: number;
  // Play
  offsideEnabled: boolean;
  // Free note for match officials
  notes?: string;
}

/** Sensible presets per format. Admins can override any field afterwards. */
export const FOOTBALL_FORMAT_PRESETS: Record<FootballFormat, FootballRulesConfig> = {
  '5s': {
    format: '5s', playersPerSide: 5,
    halfDurationMin: 20, numberOfHalves: 2, halfTimeBreakMin: 5,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    penaltiesEnabled: true, penaltyShootoutBest: 3,
    maxSubstitutions: 99, rollingSubs: true, squadSize: 10,
    yellowCardsForSuspension: 2, sinBinEnabled: true, sinBinMinutes: 2,
    offsideEnabled: false,
  },
  '7s': {
    format: '7s', playersPerSide: 7,
    halfDurationMin: 25, numberOfHalves: 2, halfTimeBreakMin: 5,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    penaltiesEnabled: true, penaltyShootoutBest: 5,
    maxSubstitutions: 99, rollingSubs: true, squadSize: 12,
    yellowCardsForSuspension: 2, sinBinEnabled: true, sinBinMinutes: 2,
    offsideEnabled: false,
  },
  '9s': {
    format: '9s', playersPerSide: 9,
    halfDurationMin: 30, numberOfHalves: 2, halfTimeBreakMin: 10,
    extraTimeEnabled: false, extraTimeHalfMin: 10,
    penaltiesEnabled: true, penaltyShootoutBest: 5,
    maxSubstitutions: 5, rollingSubs: true, squadSize: 14,
    yellowCardsForSuspension: 2, sinBinEnabled: false, sinBinMinutes: 0,
    offsideEnabled: true,
  },
  '11s': {
    format: '11s', playersPerSide: 11,
    halfDurationMin: 45, numberOfHalves: 2, halfTimeBreakMin: 15,
    extraTimeEnabled: true, extraTimeHalfMin: 15,
    penaltiesEnabled: true, penaltyShootoutBest: 5,
    maxSubstitutions: 5, rollingSubs: false, squadSize: 18,
    yellowCardsForSuspension: 2, sinBinEnabled: false, sinBinMinutes: 0,
    offsideEnabled: true,
  },
};

export const DEFAULT_FOOTBALL_RULES: FootballRulesConfig = FOOTBALL_FORMAT_PRESETS['11s'];

// ── Aggregated stats (for the OBS dock) ──

export interface FootballTopScorer {
  playerId: string;
  playerName: string;
  photoUrl?: string;
  teamId: string;
  teamName: string;
  teamLogoUrl?: string;
  goals: number;
  assists: number;
  appearances: number;
  rating?: number;
}

// ── Helpers ──

/** Compute the live match minute from a live state snapshot. */
export function computeMatchMinute(live: FootballLiveState | null): { minute: number; second: number } {
  if (!live) return { minute: 0, second: 0 };
  let elapsedSec = live.baseElapsedSec ?? 0;
  if (live.running && live.clockStartedAt) {
    elapsedSec += Math.max(0, Math.floor((Date.now() - live.clockStartedAt) / 1000));
  }
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) elapsedSec = 0;
  return { minute: Math.floor(elapsedSec / 60), second: elapsedSec % 60 };
}

/** The clock offset (minutes) at which each half begins, for display.
 *  Rules-aware: uses the configured half duration so 5s/7s/11s all work. */
export function halfBaseMinute(half: FootballHalf, rules?: FootballRulesConfig | null): number {
  const h = rules?.halfDurationMin ?? 45;
  const et = rules?.extraTimeHalfMin ?? 15;
  const regulation = h * (rules?.numberOfHalves ?? 2);
  switch (half) {
    case 'second_half': return h;
    case 'extra_first': return regulation;
    case 'extra_second': return regulation + et;
    default: return 0;
  }
}

/** The scheduled end minute (limit) of the given half — for whistle cues. */
export function halfLimitMinute(half: FootballHalf, rules?: FootballRulesConfig | null): number | null {
  const h = rules?.halfDurationMin ?? 45;
  const et = rules?.extraTimeHalfMin ?? 15;
  const regulation = h * (rules?.numberOfHalves ?? 2);
  switch (half) {
    case 'first_half': return h;
    case 'second_half': return regulation;
    case 'extra_first': return regulation + et;
    case 'extra_second': return regulation + et * 2;
    default: return null;
  }
}

export function createEmptyFootballLiveState(matchId: string): FootballLiveState {
  return {
    matchId,
    homeScore: 0,
    awayScore: 0,
    half: 'not_started',
    running: false,
    clockStartedAt: 0,
    baseElapsedSec: 0,
    addedTimeMin: 0,
    events: [],
    lastUpdated: Date.now(),
  };
}
