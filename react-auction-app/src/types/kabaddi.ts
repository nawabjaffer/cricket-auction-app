// ============================================================================
// KABADDI SCORING MODULE — TYPE DEFINITIONS
//
// Mirrors the football model (src/types/football.ts) — same team/player/match/
// live-state/overlay shape — but encodes kabaddi rules: raids, touch & tackle
// points, bonus points, all-outs, revivals and do-or-die raids.
//
// Rules reference: https://www.olympics.com/en/news/kabaddi-rules-regulations-how-to-play
// ============================================================================

// ── Positions ──

export type KabaddiPosition = 'RAIDER' | 'DEFENDER' | 'ALL_ROUNDER';

export const KABADDI_POSITIONS: { value: KabaddiPosition; label: string; order: number }[] = [
  { value: 'RAIDER', label: 'Raider', order: 0 },
  { value: 'ALL_ROUNDER', label: 'All-Rounder', order: 1 },
  { value: 'DEFENDER', label: 'Defender', order: 2 },
];

/** Court positions a defender occupies in the standard 7-player formation. */
export type KabaddiDefenderRole =
  | 'left_corner' | 'left_in' | 'left_cover'
  | 'center'
  | 'right_cover' | 'right_in' | 'right_corner';

export const KABADDI_DEFENDER_ROLES: { value: KabaddiDefenderRole; label: string }[] = [
  { value: 'left_corner', label: 'Left Corner' },
  { value: 'left_in', label: 'Left In' },
  { value: 'left_cover', label: 'Left Cover' },
  { value: 'center', label: 'Center' },
  { value: 'right_cover', label: 'Right Cover' },
  { value: 'right_in', label: 'Right In' },
  { value: 'right_corner', label: 'Right Corner' },
];

// ── Team ──

export interface KabaddiTeam {
  id: string;
  name: string;
  shortName: string;       // 3-letter code shown on the scoreboard, e.g. "TAM"
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  coach?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Player ──

export interface KabaddiPlayer {
  id: string;
  teamId: string;
  name: string;
  photoUrl?: string;
  number?: number;
  position: KabaddiPosition;
  defenderRole?: KabaddiDefenderRole;
  isCaptain?: boolean;
  isStarter?: boolean;     // on the mat vs on the bench
  nationality?: string;
  age?: number;
  // Season / ranking stats
  appearances?: number;
  raidPoints?: number;
  tacklePoints?: number;
  totalPoints?: number;
  superRaids?: number;
  superTackles?: number;
  super10s?: number;       // 10+ raid points in a match
  high5s?: number;         // 5+ tackle points in a match
  greenCards?: number;
  yellowCards?: number;
  redCards?: number;
  rating?: number;
  ranking?: number;
  marketValue?: string;
  createdAt: number;
  updatedAt: number;
}

// ── Match setup ──

export interface KabaddiTeamRef {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface KabaddiMatchSetup {
  id: string;
  teamA: KabaddiTeamRef;   // home
  teamB: KabaddiTeamRef;   // away
  venue: string;
  date: string;            // ISO date
  competition?: string;
  halfDurationMin: number; // 20 in a standard match
  status: 'scheduled' | 'live' | 'completed' | 'abandoned';
  referee?: string;
  /** Coin toss: winner elects to raid or defend first. */
  tossWonBy?: string;      // team id
  tossElected?: 'raid' | 'defend';
  createdAt: number;
  updatedAt: number;
}

// ── Match events ──

export type KabaddiEventType =
  | 'touch_point'      // raider tags defender(s) and returns safely
  | 'bonus_point'      // raider crosses the bonus line
  | 'tackle_point'     // defence stops the raider
  | 'super_raid'       // 3+ points in a single raid
  | 'super_tackle'     // tackle made with 3 or fewer defenders on court
  | 'all_out'          // whole side out → 2 bonus points + full revival
  | 'empty_raid'
  | 'do_or_die_fail'
  | 'technical_point'  // e.g. out of bounds, late entry
  | 'revival'
  | 'substitution'
  | 'green_card' | 'yellow_card' | 'red_card';

export interface KabaddiMatchEvent {
  id: string;
  type: KabaddiEventType;
  teamId: string;          // team credited with the event
  playerId?: string;
  playerName?: string;
  /** Defenders tagged / raider tackled, for raid and tackle events. */
  opponentIds?: string[];
  opponentNames?: string[];
  points: number;          // points awarded by this event
  raidNumber?: number;
  minute: number;
  half: KabaddiHalf;
  timestamp: number;
}

// ── Live state ──

export type KabaddiHalf =
  | 'not_started' | 'first_half' | 'half_time'
  | 'second_half' | 'extra_first' | 'extra_break' | 'extra_second'
  | 'full_time';

export const KABADDI_HALF_LABELS: Record<KabaddiHalf, string> = {
  not_started: 'Toss',
  first_half: '1st Half',
  half_time: 'Half Time',
  second_half: '2nd Half',
  extra_first: 'ET 1st',
  extra_break: 'ET Break',
  extra_second: 'ET 2nd',
  full_time: 'Full Time',
};

/** Per-team live counters that drive revivals, all-outs and do-or-die raids. */
export interface KabaddiTeamState {
  score: number;
  /** Players currently on the mat (starts at playersPerSide). */
  playersOnCourt: number;
  /** Consecutive empty raids — the 3rd raid becomes do-or-die. */
  consecutiveEmptyRaids: number;
  allOutsConceded: number;
  allOutsInflicted: number;
  totalRaidPoints: number;
  totalTacklePoints: number;
  totalBonusPoints: number;
}

export function createEmptyKabaddiTeamState(playersPerSide: number): KabaddiTeamState {
  return {
    score: 0,
    playersOnCourt: playersPerSide,
    consecutiveEmptyRaids: 0,
    allOutsConceded: 0,
    allOutsInflicted: 0,
    totalRaidPoints: 0,
    totalTacklePoints: 0,
    totalBonusPoints: 0,
  };
}

export interface KabaddiLiveState {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamA: KabaddiTeamState;
  teamB: KabaddiTeamState;
  half: KabaddiHalf;
  // Match clock — same derivation as football: running + startedAt + base.
  running: boolean;
  clockStartedAt: number;
  baseElapsedSec: number;
  // Raid state
  /** Team currently raiding. */
  raidingTeamId: string | null;
  raiderId?: string;
  raiderName?: string;
  raidNumber: number;
  /** Epoch ms when the 30-second raid clock started (0 = not running). */
  raidClockStartedAt: number;
  isDoOrDie: boolean;
  events: KabaddiMatchEvent[];
  lastUpdated: number;
}

export function createEmptyKabaddiLiveState(
  matchId: string, teamAId: string, teamBId: string, playersPerSide = 7,
): KabaddiLiveState {
  return {
    matchId,
    teamAId,
    teamBId,
    teamA: createEmptyKabaddiTeamState(playersPerSide),
    teamB: createEmptyKabaddiTeamState(playersPerSide),
    half: 'not_started',
    running: false,
    clockStartedAt: 0,
    baseElapsedSec: 0,
    raidingTeamId: null,
    raidNumber: 0,
    raidClockStartedAt: 0,
    isDoOrDie: false,
    events: [],
    lastUpdated: Date.now(),
  };
}

// ── OBS overlay control ──

export type KabaddiOverlayType =
  | 'none' | 'super_raid' | 'super_tackle' | 'all_out' | 'bonus_point'
  | 'do_or_die' | 'toss' | 'half_time' | 'full_time' | 'lineup';

export interface KabaddiOverlayControl {
  activeOverlay: KabaddiOverlayType;
  activeEvent?: KabaddiMatchEvent;
  lastUpdated: number;
}

// ── Overlay branding / theme ──

export interface KabaddiAnimationConfig {
  enabled: boolean;
  durationMs: number;
  mediaUrl?: string;       // custom image / gif / video for the celebration
  soundUrl?: string;
  text?: string;
  color?: string;
}

export interface KabaddiOverlayConfig {
  tournamentLogo?: string;
  tournamentName?: string;
  broadcastPartnerLogo?: string;
  broadcastPartnerName?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  showLiveBadge: boolean;
  showTimer: boolean;
  showRaidClock: boolean;
  showMatDiagram: boolean;
  /** Kabaddi scoreboard sits along the bottom of frame by default. */
  scoreboardPosition: 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-center';
  // Celebration animations — each configurable from the Kabaddi admin.
  enableSuperRaidAnimation: boolean;
  enableSuperTackleAnimation: boolean;
  enableAllOutAnimation: boolean;
  enableBonusAnimation: boolean;
  enableDoOrDieAnimation: boolean;
  superRaidAnimation?: KabaddiAnimationConfig;
  superTackleAnimation?: KabaddiAnimationConfig;
  allOutAnimation?: KabaddiAnimationConfig;
  bonusAnimation?: KabaddiAnimationConfig;
  doOrDieAnimation?: KabaddiAnimationConfig;
  statsSheetUrl?: string;
}

export const DEFAULT_KABADDI_OVERLAY_CONFIG: KabaddiOverlayConfig = {
  primaryColor: '#0a0a0a',
  secondaryColor: '#1d4ed8',
  accentColor: '#f59e0b',
  textColor: '#ffffff',
  showLiveBadge: true,
  showTimer: true,
  showRaidClock: true,
  showMatDiagram: true,
  scoreboardPosition: 'bottom-center',
  enableSuperRaidAnimation: true,
  enableSuperTackleAnimation: true,
  enableAllOutAnimation: true,
  enableBonusAnimation: true,
  enableDoOrDieAnimation: true,
  superRaidAnimation: { enabled: true, durationMs: 5000, text: 'SUPER RAID!', color: '#f59e0b' },
  superTackleAnimation: { enabled: true, durationMs: 4500, text: 'SUPER TACKLE!', color: '#3b82f6' },
  allOutAnimation: { enabled: true, durationMs: 6000, text: 'ALL OUT!', color: '#ef4444' },
  bonusAnimation: { enabled: true, durationMs: 2500, text: 'BONUS!', color: '#22c55e' },
  doOrDieAnimation: { enabled: true, durationMs: 3000, text: 'DO OR DIE RAID', color: '#a855f7' },
};

// ── Rules & regulations (per-tournament, configured from Platform Admin) ─────

export type KabaddiFormat = 'standard' | 'circle' | 'youth' | 'beach';

export const KABADDI_FORMATS: { value: KabaddiFormat; label: string }[] = [
  { value: 'standard', label: 'Standard (7-a-side mat)' },
  { value: 'circle', label: 'Circle Style' },
  { value: 'youth', label: 'Youth / School' },
  { value: 'beach', label: 'Beach Kabaddi' },
];

export interface KabaddiRulesConfig {
  format: KabaddiFormat;
  playersPerSide: number;      // 7 in a standard match
  substitutesAllowed: number;  // 5 on the bench
  // Timing
  halfDurationMin: number;     // 20
  numberOfHalves: number;      // 2
  halfTimeBreakMin: number;    // 5
  raidDurationSec: number;     // 30
  // Extra time
  extraTimeEnabled: boolean;
  extraTimeHalfMin: number;
  // Scoring
  bonusLineEnabled: boolean;
  /** Minimum defenders on court for a bonus point to be available. */
  bonusMinDefenders: number;   // 6
  allOutBonusPoints: number;   // 2
  /** Raid points needed to count as a super raid. */
  superRaidPoints: number;     // 3
  /** Defenders on court at or below which a tackle is a super tackle. */
  superTackleMaxDefenders: number; // 3
  superTacklePoints: number;   // 2
  doOrDieEnabled: boolean;
  /** Consecutive empty raids before the next raid is do-or-die. */
  doOrDieAfterEmptyRaids: number; // 2 → the 3rd raid is do-or-die
  // Discipline
  greenCardEnabled: boolean;
  yellowCardSuspensionMin: number;
  notes?: string;
}

export const KABADDI_FORMAT_PRESETS: Record<KabaddiFormat, KabaddiRulesConfig> = {
  standard: {
    format: 'standard', playersPerSide: 7, substitutesAllowed: 5,
    halfDurationMin: 20, numberOfHalves: 2, halfTimeBreakMin: 5, raidDurationSec: 30,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    bonusLineEnabled: true, bonusMinDefenders: 6, allOutBonusPoints: 2,
    superRaidPoints: 3, superTackleMaxDefenders: 3, superTacklePoints: 2,
    doOrDieEnabled: true, doOrDieAfterEmptyRaids: 2,
    greenCardEnabled: true, yellowCardSuspensionMin: 2,
  },
  circle: {
    format: 'circle', playersPerSide: 7, substitutesAllowed: 4,
    halfDurationMin: 20, numberOfHalves: 2, halfTimeBreakMin: 5, raidDurationSec: 30,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    bonusLineEnabled: false, bonusMinDefenders: 6, allOutBonusPoints: 2,
    superRaidPoints: 3, superTackleMaxDefenders: 3, superTacklePoints: 2,
    doOrDieEnabled: false, doOrDieAfterEmptyRaids: 2,
    greenCardEnabled: false, yellowCardSuspensionMin: 2,
  },
  youth: {
    format: 'youth', playersPerSide: 7, substitutesAllowed: 5,
    halfDurationMin: 15, numberOfHalves: 2, halfTimeBreakMin: 5, raidDurationSec: 30,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    bonusLineEnabled: true, bonusMinDefenders: 6, allOutBonusPoints: 2,
    superRaidPoints: 3, superTackleMaxDefenders: 3, superTacklePoints: 2,
    doOrDieEnabled: true, doOrDieAfterEmptyRaids: 2,
    greenCardEnabled: true, yellowCardSuspensionMin: 2,
  },
  beach: {
    format: 'beach', playersPerSide: 6, substitutesAllowed: 4,
    halfDurationMin: 15, numberOfHalves: 2, halfTimeBreakMin: 5, raidDurationSec: 30,
    extraTimeEnabled: false, extraTimeHalfMin: 5,
    bonusLineEnabled: false, bonusMinDefenders: 5, allOutBonusPoints: 2,
    superRaidPoints: 3, superTackleMaxDefenders: 2, superTacklePoints: 2,
    doOrDieEnabled: true, doOrDieAfterEmptyRaids: 2,
    greenCardEnabled: true, yellowCardSuspensionMin: 2,
  },
};

export const DEFAULT_KABADDI_RULES: KabaddiRulesConfig = KABADDI_FORMAT_PRESETS.standard;

// ── Aggregated stats (for the OBS dock) ──

export interface KabaddiTopPerformer {
  playerId: string;
  playerName: string;
  photoUrl?: string;
  teamId: string;
  teamName: string;
  teamLogoUrl?: string;
  raidPoints: number;
  tacklePoints: number;
  totalPoints: number;
  appearances: number;
  rating?: number;
}

// ── Helpers ──

/** Live match clock derived from a live-state snapshot. */
export function computeKabaddiClock(live: KabaddiLiveState | null): { minute: number; second: number } {
  if (!live) return { minute: 0, second: 0 };
  let elapsedSec = live.baseElapsedSec ?? 0;
  if (live.running && live.clockStartedAt) {
    elapsedSec += Math.max(0, Math.floor((Date.now() - live.clockStartedAt) / 1000));
  }
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) elapsedSec = 0;
  return { minute: Math.floor(elapsedSec / 60), second: elapsedSec % 60 };
}

/** Seconds left in the current 30-second raid (null when no raid is running). */
export function raidSecondsRemaining(live: KabaddiLiveState | null, rules?: KabaddiRulesConfig | null): number | null {
  if (!live?.raidClockStartedAt) return null;
  const limit = rules?.raidDurationSec ?? 30;
  const elapsed = Math.floor((Date.now() - live.raidClockStartedAt) / 1000);
  return Math.max(0, limit - elapsed);
}

/** Clock offset (minutes) at which the given half begins. */
export function kabaddiHalfBaseMinute(half: KabaddiHalf, rules?: KabaddiRulesConfig | null): number {
  const h = rules?.halfDurationMin ?? 20;
  const et = rules?.extraTimeHalfMin ?? 5;
  const regulation = h * (rules?.numberOfHalves ?? 2);
  switch (half) {
    case 'second_half': return h;
    case 'extra_first': return regulation;
    case 'extra_second': return regulation + et;
    default: return 0;
  }
}

/** Scheduled end minute of the given half — used for whistle cues. */
export function kabaddiHalfLimitMinute(half: KabaddiHalf, rules?: KabaddiRulesConfig | null): number | null {
  const h = rules?.halfDurationMin ?? 20;
  const et = rules?.extraTimeHalfMin ?? 5;
  const regulation = h * (rules?.numberOfHalves ?? 2);
  switch (half) {
    case 'first_half': return h;
    case 'second_half': return regulation;
    case 'extra_first': return regulation + et;
    case 'extra_second': return regulation + et * 2;
    default: return null;
  }
}

/** A tackle counts as a super tackle when the defence is down to a thin line. */
export function isSuperTackle(defendersOnCourt: number, rules?: KabaddiRulesConfig | null): boolean {
  return defendersOnCourt <= (rules?.superTackleMaxDefenders ?? 3);
}

/** Bonus is only available while the defence still fields enough players. */
export function isBonusAvailable(defendersOnCourt: number, rules?: KabaddiRulesConfig | null): boolean {
  if (rules && !rules.bonusLineEnabled) return false;
  return defendersOnCourt >= (rules?.bonusMinDefenders ?? 6);
}
