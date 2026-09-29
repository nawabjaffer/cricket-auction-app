import type { PointerEvent as ReactPointerEvent } from 'react';

// Placement design for the premium score ticker (`score-ticker--premium`).
// Each part can be moved (px on the 1920×1080 canvas), rotated, scaled and hidden.

export const PREMIUM_TICKER_PART_KEYS = [
  'ticker',
  'battingLogo',
  'matchup',
  'score',
  'overs',
  'widgets',
  'batter1Portrait',
  'batter1Info',
  'batter2Portrait',
  'batter2Info',
  'bowlerPortrait',
  'bowlerName',
  'bowlerFigures',
  'overBalls',
  'bowlingBadge',
  'powerplay',
] as const;

export type PremiumTickerPartKey = (typeof PREMIUM_TICKER_PART_KEYS)[number];

export interface PremiumTickerPartTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  visible: boolean;
}

export interface PremiumTickerDesign {
  parts: Record<PremiumTickerPartKey, PremiumTickerPartTransform>;
}

export const PREMIUM_TICKER_PART_LABELS: Record<PremiumTickerPartKey, string> = {
  ticker: 'Whole ticker bar',
  battingLogo: 'Batting team logo',
  matchup: 'Team matchup text',
  score: 'Score (runs-wickets)',
  overs: 'Overs',
  widgets: 'Stat widgets (CRR / RRR)',
  batter1Portrait: 'Batter 1 portrait',
  batter1Info: 'Batter 1 name & runs',
  batter2Portrait: 'Batter 2 portrait',
  batter2Info: 'Batter 2 name & runs',
  bowlerPortrait: 'Bowler portrait',
  bowlerName: 'Bowler name',
  bowlerFigures: 'Bowler figures',
  overBalls: 'This-over balls',
  bowlingBadge: 'Bowling team badge',
  powerplay: 'Powerplay badge',
};

export const PREMIUM_TICKER_LIMITS = {
  offset: 1920,
  rotation: 180,
  minScale: 0.2,
  maxScale: 5,
} as const;

export const DEFAULT_PREMIUM_TICKER_PART: PremiumTickerPartTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  visible: true,
};

export function createDefaultPremiumTickerDesign(): PremiumTickerDesign {
  const parts = {} as Record<PremiumTickerPartKey, PremiumTickerPartTransform>;
  PREMIUM_TICKER_PART_KEYS.forEach(key => { parts[key] = { ...DEFAULT_PREMIUM_TICKER_PART }; });
  return { parts };
}

export interface PremiumTickerEditor {
  selectedPart: PremiumTickerPartKey | null;
  onPointerDown: (part: PremiumTickerPartKey, event: ReactPointerEvent) => void;
}
