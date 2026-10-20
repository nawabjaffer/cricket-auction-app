import { isSafeStudioId, type StudioGameType } from './studioProfile';

export const MOBILE_SCORING_FEATURES = [
  { id: 'scoreboard', label: 'Results and scoreboard' },
  { id: 'teams', label: 'Team setup' },
  { id: 'players', label: 'Player setup' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'broadcast', label: 'Broadcast and animations' },
  { id: 'provider', label: 'External scoring providers' },
  { id: 'ads', label: 'Advertisements' },
  { id: 'tournamentAdmin', label: 'Full tournament administration' },
  { id: 'designer', label: 'Scorecard designer' },
  { id: 'guides', label: 'Operator guides' },
  { id: 'exports', label: 'Print and exports' },
] as const;

export type MobileScoringFeature = typeof MOBILE_SCORING_FEATURES[number]['id'];
export type MobileScoringOptions = Record<MobileScoringFeature, boolean>;

export const DEFAULT_MOBILE_SCORING_OPTIONS: MobileScoringOptions = {
  scoreboard: true, teams: false, players: false, statistics: false, broadcast: false,
  provider: false, ads: false, tournamentAdmin: false, designer: false, guides: false, exports: false,
};

export function normalizeMobileScoringOptions(raw: unknown): MobileScoringOptions {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(MOBILE_SCORING_FEATURES.map(feature => [feature.id,
    typeof value[feature.id] === 'boolean' ? value[feature.id] : DEFAULT_MOBILE_SCORING_OPTIONS[feature.id],
  ])) as MobileScoringOptions;
}

export function mobileScoringOptionsPath(tenantId: string, game: StudioGameType): string {
  if (!isSafeStudioId(tenantId)) throw new Error('Invalid tournament.');
  return `tenants/${tenantId}/mobileStudio/${game}/scoringOptions`;
}

export function mobileScoringTabVisible(tab: string, options: MobileScoringOptions): boolean {
  if (tab === 'matches') return true;
  if (tab === 'entries' || tab === 'teams') return options.teams;
  if (tab === 'players') return options.players;
  if (tab === 'stats') return options.statistics;
  if (tab === 'provider') return options.provider;
  if (tab === 'ads') return options.ads;
  return options.broadcast;
}

export function mobileScoringPageVisible(page: string, options: MobileScoringOptions): boolean {
  if (page === 'matches' || page === 'score') return true;
  if (page === 'scoreboard') return options.scoreboard;
  if (page === 'admin') return options.tournamentAdmin;
  if (page === 'designer') return options.designer;
  if (page === 'dock') return options.broadcast;
  if (page === 'guides') return options.guides;
  return false;
}