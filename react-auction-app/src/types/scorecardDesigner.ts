// ============================================================================
// SCORECARD DESIGNER — TYPE DEFINITIONS
// Canva-style drag-and-drop scorecard layout system shared by the Designer
// admin page, the live OBS overlay pages, and the camera recorder — all three
// render the exact same `ScorecardLayout` so on-screen and burned-in-video
// scorecards always stay pixel-identical.
// ============================================================================

import type { SportKey } from '../services/tenantService';

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
  | 'kabaddi_players_on_mat' | 'kabaddi_raider_name' | 'kabaddi_do_or_die_flag';

export interface WidgetGeometry {
  /** All position/size values are percentages of the canvas, so the layout is resolution independent. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  rotationDeg: number;
  zIndex: number;
}

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

export interface ScorecardLayout {
  id: string;
  sport: SportKey;
  name: string;
  backgroundImageUrl?: string;
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
  category: 'team' | 'score' | 'timer' | 'branding' | 'player' | 'flag';
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

/** Only widgets relevant to a given sport are ever shown in that sport's palette. */
export const SPORT_WIDGET_CATALOG: Record<Extract<SportKey, 'cricket' | 'football' | 'kabaddi'>, WidgetCatalogEntry[]> = {
  cricket: [...UNIVERSAL_WIDGETS, ...CRICKET_WIDGETS],
  football: [...UNIVERSAL_WIDGETS, ...FOOTBALL_WIDGETS],
  kabaddi: [...UNIVERSAL_WIDGETS, ...KABADDI_WIDGETS],
};

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

export function createEmptyLayout(sport: SportKey, name = 'Untitled Layout'): ScorecardLayout {
  const now = Date.now();
  return {
    id: `layout_${now}_${Math.random().toString(36).slice(2, 8)}`,
    sport,
    name,
    widgets: [],
    backgroundColor: 'transparent',
    createdAt: now,
    updatedAt: now,
  };
}
