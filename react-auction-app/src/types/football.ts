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
  let elapsedSec = live.baseElapsedSec;
  if (live.running && live.clockStartedAt) {
    elapsedSec += Math.max(0, Math.floor((Date.now() - live.clockStartedAt) / 1000));
  }
  return { minute: Math.floor(elapsedSec / 60), second: elapsedSec % 60 };
}

/** The clock offset (minutes) at which each half begins, for display. */
export function halfBaseMinute(half: FootballHalf): number {
  switch (half) {
    case 'second_half': return 45;
    case 'extra_first': return 90;
    case 'extra_second': return 105;
    default: return 0;
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
