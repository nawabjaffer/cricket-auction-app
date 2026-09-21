// ============================================================================
// SCORECARD DESIGNER — TYPE DEFINITIONS
// Canva-style drag-and-drop scorecard layout system shared by the Designer
// admin page, the live OBS overlay pages, and the camera recorder — all three
// render the exact same `ScorecardLayout` so on-screen and burned-in-video
// scorecards always stay pixel-identical.
// ============================================================================

import type { SportKey } from '../services/tenantService';

/** A layout's placement surface — each renders on a different screen area/moment. */
export type ScorecardSurface = 'scoreboard' | 'team_squad' | 'match_stats';

export const SURFACE_LABELS: Record<ScorecardSurface, string> = {
  scoreboard: 'Scoreboard',
  team_squad: 'Team Squad',
  match_stats: 'Match Stats',
};

export const SURFACE_HINTS: Record<ScorecardSurface, string> = {
  scoreboard: 'Bottom-band ticker shown throughout the match — keep widgets within the recommended 10–20% height band.',
  team_squad: 'Full-screen (100% width & height), centered overlay shown during lineup / squad reveal.',
  match_stats: 'Full-screen (100% width & height), centered overlay for top scorers, MVPs, and tournament stats.',
};

/** Every placeable element the designer can drop onto a layout. */
export type WidgetKind =
  // Universal (any sport)
  | 'team_a_logo' | 'team_b_logo' | 'team_a_name' | 'team_b_name'
  | 'match_venue' | 'live_badge' | 'match_clock'
  | 'tournament_logo' | 'partner_logo'
  | 'custom_text' | 'custom_image' | 'custom_timer'
  // Cricket
  | 'cricket_score' | 'cricket_overs' | 'cricket_run_rate' | 'cricket_striker'
  | 'cricket_non_striker' | 'cricket_bowler' | 'cricket_current_over'
  | 'cricket_target' | 'cricket_partnership'
  // Football
  | 'football_score' | 'football_half_label' | 'football_added_time'
  // Kabaddi
  | 'kabaddi_score' | 'kabaddi_half_label' | 'kabaddi_raid_clock'
  | 'kabaddi_players_on_mat' | 'kabaddi_raider_name' | 'kabaddi_do_or_die_flag'
  // Team Squad surface (universal)
  | 'squad_team_a_players' | 'squad_team_b_players' | 'squad_toss_result'
  // Match Stats surface — cricket
  | 'stats_top_run_scorer' | 'stats_top_wicket_taker' | 'stats_orange_cap'
  | 'stats_purple_cap' | 'stats_mvp_leaderboard'
  // Match Stats surface — football
  | 'stats_top_goal_scorer' | 'stats_top_assist'
  // Match Stats surface — kabaddi
  | 'stats_top_raider' | 'stats_top_defender';

export interface WidgetGeometry {
  /** All position/size values are percentages of the canvas, so the layout is resolution independent. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg: number;
  zIndex: number;
}

export type WidgetEntranceAnimation =
  | 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'zoom-in' | 'bounce';

export const ANIMATION_PRESETS: { value: WidgetEntranceAnimation; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade In' },
  { value: 'slide-up', label: 'Slide Up' },
  { value: 'slide-down', label: 'Slide Down' },
  { value: 'slide-left', label: 'Slide In (Left)' },
  { value: 'slide-right', label: 'Slide In (Right)' },
  { value: 'zoom-in', label: 'Zoom In' },
  { value: 'bounce', label: 'Bounce In' },
];

export interface WidgetStyle {
  backgroundColor?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;     // px, relative to a 1080px-tall canvas
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'capitalize';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  padding?: number;
  textShadowEnabled?: boolean;
  textShadowColor?: string;
  textShadowBlur?: number;
  boxShadowEnabled?: boolean;
  boxShadowColor?: string;
  boxShadowBlur?: number;
  objectFit?: 'cover' | 'contain';
  /** Uniform scale applied on top of width/height — lets a widget "pop" without resizing its box. */
  zoom?: number;
  /** How the widget animates in on the live overlay (designer canvas can replay it via the Preview button). */
  entranceAnimation?: WidgetEntranceAnimation;
  animationDurationMs?: number;
  animationDelayMs?: number;
}

export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  backgroundColor: 'rgba(10,10,10,0.55)',
  color: '#ffffff',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 22,
  fontWeight: 700,
  textAlign: 'center',
  letterSpacing: 0,
  textTransform: 'none',
  borderRadius: 8,
  borderWidth: 0,
  borderColor: '#ffffff',
  opacity: 1,
  padding: 8,
  textShadowEnabled: true,
  textShadowColor: 'rgba(0,0,0,0.65)',
  textShadowBlur: 6,
  boxShadowEnabled: false,
  boxShadowColor: 'rgba(0,0,0,0.5)',
  boxShadowBlur: 12,
  objectFit: 'contain',
  zoom: 1,
  entranceAnimation: 'fade',
  animationDurationMs: 600,
  animationDelayMs: 0,
};

export interface ScorecardWidgetInstance {
  id: string;
  kind: WidgetKind;
  label: string;
  geometry: WidgetGeometry;
  style: WidgetStyle;
  /** For custom_text — the literal text to show (can include live bindings later). */
  staticText?: string;
  /** For custom_image — a fixed uploaded/linked image URL. */
  staticImageUrl?: string;
  /** For custom_timer — optional label prefix shown before the mm:ss clock. */
  timerLabel?: string;
  visible: boolean;
  locked: boolean;
}

export interface ScorecardBackgroundGeometry {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg: number;
  zoom: number;
}

export interface ScorecardLayout {
  id: string;
  sport: SportKey;
  /** Which screen area/moment this layout renders on. Defaults to 'scoreboard' for layouts saved before this field existed. */
  surface: ScorecardSurface;
  name: string;
  backgroundImageUrl?: string;
  /** Percentage-based placement so the preview, OBS, and camera output match. */
  backgroundGeometry?: ScorecardBackgroundGeometry;
  backgroundColor?: string;
  widgets: ScorecardWidgetInstance[];
  createdAt: number;
  updatedAt: number;
}

export type CustomWidgetBaseKind = 'text' | 'image' | 'timer' | 'stat';

/** A user-authored widget definition that then appears in the palette like any built-in widget. */
export interface CustomWidgetDef {
  id: string;
  sport: SportKey;
  label: string;
  baseKind: CustomWidgetBaseKind;
  icon?: string;
  defaultText?: string;
  defaultImageUrl?: string;
  /** For baseKind === 'stat' — reuses an existing built-in WidgetKind's live data binding. */
  statBindingKey?: WidgetKind;
  createdAt: number;
}

export interface WidgetCatalogEntry {
  kind: WidgetKind;
  label: string;
  icon: string;
  defaultW: number;
  defaultH: number;
  category: 'team' | 'score' | 'timer' | 'branding' | 'player' | 'flag' | 'squad' | 'stats';
  description: string;
}

const UNIVERSAL_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'team_a_logo', label: 'Team A Logo', icon: '🛡️', defaultW: 10, defaultH: 12, category: 'team', description: 'Home / Team A crest' },
  { kind: 'team_b_logo', label: 'Team B Logo', icon: '🛡️', defaultW: 10, defaultH: 12, category: 'team', description: 'Away / Team B crest' },
  { kind: 'team_a_name', label: 'Team A Name', icon: '🔤', defaultW: 18, defaultH: 6, category: 'team', description: 'Team A display name' },
  { kind: 'team_b_name', label: 'Team B Name', icon: '🔤', defaultW: 18, defaultH: 6, category: 'team', description: 'Team B display name' },
  { kind: 'match_venue', label: 'Venue', icon: '📍', defaultW: 22, defaultH: 5, category: 'branding', description: 'Match venue text' },
  { kind: 'live_badge', label: 'LIVE Badge', icon: '🔴', defaultW: 8, defaultH: 5, category: 'flag', description: 'Blinking LIVE indicator' },
  { kind: 'match_clock', label: 'Match Clock', icon: '⏱️', defaultW: 10, defaultH: 6, category: 'timer', description: 'Running match clock (mm:ss)' },
  { kind: 'tournament_logo', label: 'Tournament Logo', icon: '🏆', defaultW: 8, defaultH: 10, category: 'branding', description: 'Tournament / league logo' },
  { kind: 'partner_logo', label: 'Partner Logo', icon: '🤝', defaultW: 8, defaultH: 10, category: 'branding', description: 'Broadcast partner logo' },
  { kind: 'custom_text', label: 'Text Box', icon: '📝', defaultW: 16, defaultH: 6, category: 'branding', description: 'Freeform static text' },
  { kind: 'custom_image', label: 'Image', icon: '🖼️', defaultW: 12, defaultH: 12, category: 'branding', description: 'Freeform static image/logo' },
  { kind: 'custom_timer', label: 'Custom Timer', icon: '⏲️', defaultW: 10, defaultH: 6, category: 'timer', description: 'Labeled countdown/clock widget' },
];

const CRICKET_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'cricket_score', label: 'Score (R/W)', icon: '🏏', defaultW: 14, defaultH: 8, category: 'score', description: 'Runs / wickets' },
  { kind: 'cricket_overs', label: 'Overs', icon: '🎯', defaultW: 10, defaultH: 6, category: 'score', description: 'Overs bowled' },
  { kind: 'cricket_run_rate', label: 'Run Rate', icon: '📈', defaultW: 12, defaultH: 5, category: 'score', description: 'Current run rate' },
  { kind: 'cricket_striker', label: 'Striker Card', icon: '🏃', defaultW: 18, defaultH: 6, category: 'player', description: 'On-strike batsman name/runs/balls' },
  { kind: 'cricket_non_striker', label: 'Non-Striker Card', icon: '🚶', defaultW: 18, defaultH: 6, category: 'player', description: 'Non-striker batsman' },
  { kind: 'cricket_bowler', label: 'Bowler Card', icon: '🎳', defaultW: 18, defaultH: 6, category: 'player', description: 'Current bowler figures' },
  { kind: 'cricket_current_over', label: 'This Over', icon: '⚾', defaultW: 20, defaultH: 6, category: 'score', description: 'Ball-by-ball chips for the current over' },
  { kind: 'cricket_target', label: 'Target', icon: '🎯', defaultW: 14, defaultH: 5, category: 'score', description: 'Chase target (2nd innings)' },
  { kind: 'cricket_partnership', label: 'Partnership', icon: '🤝', defaultW: 14, defaultH: 5, category: 'score', description: 'Current partnership runs/balls' },
];

const FOOTBALL_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'football_score', label: 'Score', icon: '⚽', defaultW: 12, defaultH: 8, category: 'score', description: 'Home - Away score' },
  { kind: 'football_half_label', label: 'Half Label', icon: '🕑', defaultW: 12, defaultH: 5, category: 'timer', description: '1st/2nd half, ET, penalties' },
  { kind: 'football_added_time', label: 'Added Time', icon: '➕', defaultW: 8, defaultH: 5, category: 'timer', description: 'Stoppage time badge' },
];

const KABADDI_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'kabaddi_score', label: 'Score', icon: '🤼', defaultW: 12, defaultH: 8, category: 'score', description: 'Team A - Team B raid points' },
  { kind: 'kabaddi_half_label', label: 'Half Label', icon: '🕑', defaultW: 12, defaultH: 5, category: 'timer', description: 'Half / toss / full time' },
  { kind: 'kabaddi_raid_clock', label: 'Raid Clock', icon: '⏱️', defaultW: 8, defaultH: 6, category: 'timer', description: '30-second raid countdown' },
  { kind: 'kabaddi_players_on_mat', label: 'Players on Mat', icon: '👥', defaultW: 14, defaultH: 5, category: 'score', description: 'On-court player counts' },
  { kind: 'kabaddi_raider_name', label: 'Raider Name', icon: '🏃', defaultW: 16, defaultH: 5, category: 'player', description: 'Active raider name' },
  { kind: 'kabaddi_do_or_die_flag', label: 'Do-or-Die Flag', icon: '⚠️', defaultW: 12, defaultH: 5, category: 'flag', description: 'Do-or-die raid warning banner' },
];

const SQUAD_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'squad_team_a_players', label: 'Team A Squad List', icon: '📋', defaultW: 36, defaultH: 70, category: 'squad', description: 'Full player roster grid for Team A' },
  { kind: 'squad_team_b_players', label: 'Team B Squad List', icon: '📋', defaultW: 36, defaultH: 70, category: 'squad', description: 'Full player roster grid for Team B' },
  { kind: 'squad_toss_result', label: 'Toss Result', icon: '🪙', defaultW: 30, defaultH: 6, category: 'squad', description: 'Who won the toss and what they elected' },
];

const CRICKET_STATS_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'stats_top_run_scorer', label: 'Top Run Scorer', icon: '🏏', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading run scorer this match' },
  { kind: 'stats_top_wicket_taker', label: 'Top Wicket Taker', icon: '🎯', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading wicket taker this match' },
  { kind: 'stats_orange_cap', label: 'Orange Cap', icon: '🧡', defaultW: 28, defaultH: 10, category: 'stats', description: 'Tournament-wide top run scorer' },
  { kind: 'stats_purple_cap', label: 'Purple Cap', icon: '💜', defaultW: 28, defaultH: 10, category: 'stats', description: 'Tournament-wide top wicket taker' },
  { kind: 'stats_mvp_leaderboard', label: 'MVP Leaderboard', icon: '🏆', defaultW: 34, defaultH: 40, category: 'stats', description: 'Top 3 MVP point leaders' },
];

const FOOTBALL_STATS_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'stats_top_goal_scorer', label: 'Top Goal Scorer', icon: '⚽', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading goal scorer' },
  { kind: 'stats_top_assist', label: 'Top Assist', icon: '🎯', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading assist provider' },
];

const KABADDI_STATS_WIDGETS: WidgetCatalogEntry[] = [
  { kind: 'stats_top_raider', label: 'Top Raider', icon: '🏃', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading raid point scorer' },
  { kind: 'stats_top_defender', label: 'Top Defender', icon: '🛡️', defaultW: 28, defaultH: 10, category: 'stats', description: 'Leading tackle point scorer' },
];

/** Only widgets relevant to a given sport are ever shown in that sport's palette. */
export const SPORT_WIDGET_CATALOG: Record<Extract<SportKey, 'cricket' | 'football' | 'kabaddi'>, WidgetCatalogEntry[]> = {
  cricket: [...UNIVERSAL_WIDGETS, ...CRICKET_WIDGETS],
  football: [...UNIVERSAL_WIDGETS, ...FOOTBALL_WIDGETS],
  kabaddi: [...UNIVERSAL_WIDGETS, ...KABADDI_WIDGETS],
};

const BRANDING_ONLY_WIDGETS = UNIVERSAL_WIDGETS.filter(w => w.kind !== 'live_badge' && w.kind !== 'match_clock');

/** Per-sport, per-surface widget palette — Team Squad and Match Stats get their own relevant widgets. */
export const SPORT_SURFACE_WIDGET_CATALOG: Record<Extract<SportKey, 'cricket' | 'football' | 'kabaddi'>, Record<ScorecardSurface, WidgetCatalogEntry[]>> = {
  cricket: {
    scoreboard: SPORT_WIDGET_CATALOG.cricket,
    team_squad: [...BRANDING_ONLY_WIDGETS, ...SQUAD_WIDGETS],
    match_stats: [...BRANDING_ONLY_WIDGETS, ...CRICKET_STATS_WIDGETS],
  },
  football: {
    scoreboard: SPORT_WIDGET_CATALOG.football,
    team_squad: [...BRANDING_ONLY_WIDGETS, ...SQUAD_WIDGETS],
    match_stats: [...BRANDING_ONLY_WIDGETS, ...FOOTBALL_STATS_WIDGETS],
  },
  kabaddi: {
    scoreboard: SPORT_WIDGET_CATALOG.kabaddi,
    team_squad: [...BRANDING_ONLY_WIDGETS, ...SQUAD_WIDGETS],
    match_stats: [...BRANDING_ONLY_WIDGETS, ...KABADDI_STATS_WIDGETS],
  },
};

export function getWidgetCatalog(sport: Extract<SportKey, 'cricket' | 'football' | 'kabaddi'>, surface: ScorecardSurface): WidgetCatalogEntry[] {
  return SPORT_SURFACE_WIDGET_CATALOG[sport][surface];
}

export function makeWidgetId(): string {
  return `sw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createWidgetInstance(entry: WidgetCatalogEntry, xPct = 40, yPct = 40): ScorecardWidgetInstance {
  return {
    id: makeWidgetId(),
    kind: entry.kind,
    label: entry.label,
    geometry: { xPct, yPct, wPct: entry.defaultW, hPct: entry.defaultH, rotationDeg: 0, zIndex: 1 },
    style: { ...DEFAULT_WIDGET_STYLE },
    staticText: entry.kind === 'custom_text' ? entry.label : undefined,
    visible: true,
    locked: false,
  };
}

export function createEmptyLayout(sport: SportKey, surface: ScorecardSurface = 'scoreboard', name = 'Untitled Layout'): ScorecardLayout {
  const now = Date.now();
  return {
    id: `layout_${now}_${Math.random().toString(36).slice(2, 8)}`,
    sport,
    surface,
    name,
    widgets: [],
    backgroundGeometry: { xPct: 0, yPct: 0, wPct: 100, hPct: 100, rotationDeg: 0, zoom: 1 },
    backgroundColor: 'transparent',
    createdAt: now,
    updatedAt: now,
  };
}
