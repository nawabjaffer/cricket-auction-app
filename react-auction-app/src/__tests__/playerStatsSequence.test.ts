import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG,
  normalizePlayerStatsSequenceConfig,
} from '../utils/playerStatsSequence';

describe('normalizePlayerStatsSequenceConfig', () => {
  it('uses the default stat selection while keeping rotation disabled', () => {
    expect(normalizePlayerStatsSequenceConfig(null)).toEqual(DEFAULT_PLAYER_STATS_SEQUENCE_CONFIG);
  });

  it('filters unknown stats and clamps display timings', () => {
    expect(normalizePlayerStatsSequenceConfig({
      enabled: true,
      items: ['stats_sixes', 'not_a_stat', 'stats_sixes'],
      displayDurationMs: 100,
      gapBetweenItemsMs: 50000,
      repeatIntervalMs: 1,
    })).toEqual({
      enabled: true,
      items: ['stats_sixes'],
      displayDurationMs: 1000,
      gapBetweenItemsMs: 30000,
      repeatIntervalMs: 10000,
    });
  });
});