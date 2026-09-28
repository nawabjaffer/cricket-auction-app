export interface MatchSquadOverlayDesign {
  panelColor: string;
  panelOpacity: number;
  cardColor: string;
  accentColor: string;
  useTeamColors: boolean;
  textColor: string;
  mutedTextColor: string;
  portraitHeight: number;
  thumbnailSize: number;
  cardRadius: number;
  rowGap: number;
  imageFit: 'contain' | 'cover';
  showSquadDisplay: boolean;
  showTossAnimation: boolean;
  showTossResult: boolean;
  showSquadReveal: boolean;
  showImpactPlayers: boolean;
  showMatchReady: boolean;
  squadDisplayDurationMs: number;
  tossAnimationDurationMs: number;
  tossResultDurationMs: number;
  squadRevealDurationMs: number;
  impactPlayersDurationMs: number;
  matchReadyDurationMs: number;
  squadRevealHoldDurationMs: number;
  delayAfterTossMs: number;
  playerRevealIntervalMs: number;
}

export const DEFAULT_MATCH_SQUAD_OVERLAY_DESIGN: MatchSquadOverlayDesign = {
  panelColor: '#08082f',
  panelOpacity: 88,
  cardColor: '#142033',
  accentColor: '#38bdf8',
  useTeamColors: true,
  textColor: '#ffffff',
  mutedTextColor: '#cbd5e1',
  portraitHeight: 210,
  thumbnailSize: 44,
  cardRadius: 14,
  rowGap: 8,
  imageFit: 'contain',
  showSquadDisplay: true,
  showTossAnimation: true,
  showTossResult: true,
  showSquadReveal: true,
  showImpactPlayers: true,
  showMatchReady: true,
  squadDisplayDurationMs: 8000,
  tossAnimationDurationMs: 5000,
  tossResultDurationMs: 5000,
  squadRevealDurationMs: 10000,
  impactPlayersDurationMs: 5000,
  matchReadyDurationMs: 900,
  squadRevealHoldDurationMs: 5000,
  delayAfterTossMs: 2000,
  playerRevealIntervalMs: 250,
};