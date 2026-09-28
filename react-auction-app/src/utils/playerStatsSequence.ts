import type { PlayerStatsSequenceConfig, PlayerStatsSequenceItem } from '../types/scoring';

export const DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG: PlayerStatsSequenceConfig = {
  enabled: false,
  items: ['player_stats_notes', 'stats_fours', 'stats_sixes', 'stats_sr', 'stats_mvp'],
  displayDurationMs: 6000,
  gapBetweenItemsMs: 1200,
  repeatIntervalMs: 90000,
};

const PLAYER_STATS_SEQUENCE_ITEMS: PlayerStatsSequenceItem[] = [
  'player_stats_notes', 'stats_fours', 'stats_sixes', 'stats_sr', 'stats_mvp',
];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizePlayerStatsSequenceConfig(value: unknown): PlayerStatsSequenceConfig {
  const input = value && typeof value === 'object'
    ? value as Partial<PlayerStatsSequenceConfig>
    : {};
  const selectedItems = Array.isArray(input.items)
    ? input.items.filter((item): item is PlayerStatsSequenceItem => PLAYER_STATS_SEQUENCE_ITEMS.includes(item))
    : DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG.items;

  return {
    enabled: input.enabled === true,
    items: [...new Set(selectedItems)],
    displayDurationMs: clamp(input.displayDurationMs, 1000, 60000, DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG.displayDurationMs),
    gapBetweenItemsMs: clamp(input.gapBetweenItemsMs, 0, 30000, DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG.gapBetweenItemsMs),
    repeatIntervalMs: clamp(input.repeatIntervalMs, 10000, 600000, DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG.repeatIntervalMs),
  };
}