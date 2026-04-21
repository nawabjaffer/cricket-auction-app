import { describe, it, expect } from 'vitest';
import { getRoleBasedStats, getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
import type { Player } from '../types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'P001',
    name: 'Test Player',
    imageUrl: '',
    role: 'Batsman',
    age: 25,
    matches: '50',
    runs: '1500',
    wickets: '0',
    battingBestFigures: '120',
    bowlingBestFigures: 'N/A',
    basePrice: 5,
    ...overrides,
  };
}

describe('getRoleBasedStats', () => {
  it('returns batting stats for Batsman', () => {
    const player = makePlayer({ role: 'Batsman' });
    const stats = getRoleBasedStats(player);
    expect(stats.length).toBeGreaterThan(0);
    expect(stats.some(s => s.label === 'Matches')).toBe(true);
    expect(stats.some(s => s.label === 'Runs')).toBe(true);
  });

  it('returns bowling stats for Bowler', () => {
    const player = makePlayer({ role: 'Bowler', wickets: '30', bowlingBestFigures: '5/20' });
    const stats = getRoleBasedStats(player);
    expect(stats.length).toBeGreaterThan(0);
  });

  it('returns mixed stats for All-Rounder', () => {
    const player = makePlayer({ role: 'All-Rounder', wickets: '20' });
    const stats = getRoleBasedStats(player, 6);
    expect(stats.length).toBeLessThanOrEqual(6);
  });

  it('returns general stats for unknown role', () => {
    const player = makePlayer({ role: 'Player' as Player['role'] });
    const stats = getRoleBasedStats(player);
    expect(stats.length).toBeGreaterThan(0);
  });

  it('handles Wicket Keeper', () => {
    const player = makePlayer({ role: 'Wicket Keeper Batsman' });
    const stats = getRoleBasedStats(player);
    expect(stats.some(s => s.category === 'batting')).toBe(true);
  });

  it('handles empty/null role', () => {
    const player = makePlayer({ role: '' as Player['role'] });
    const stats = getRoleBasedStats(player);
    expect(stats).toBeDefined();
  });

  it('respects maxStats parameter', () => {
    const player = makePlayer({
      battingStats: {
        matches: '50', innings: '48', notOut: '5', runs: '1500',
        highestScore: '120', average: '34.88', strikeRate: '85.50',
        thirties: '3', fifties: '10', hundreds: '3', fours: '150', sixes: '50',
      },
    });
    const stats = getRoleBasedStats(player, 3);
    expect(stats.length).toBeLessThanOrEqual(3);
  });

  it('uses detailed battingStats when available', () => {
    const player = makePlayer({
      battingStats: {
        matches: '50', innings: '48', notOut: '5', runs: '1500',
        highestScore: '120', average: '34.88', strikeRate: '85.50',
        thirties: '3', fifties: '10', hundreds: '3', fours: '150', sixes: '50',
      },
    });
    const stats = getRoleBasedStats(player);
    expect(stats.some(s => s.label === 'Highest')).toBe(true);
    expect(stats.some(s => s.label === 'Average')).toBe(true);
  });
});

describe('getRoleLabel', () => {
  it('maps roles correctly', () => {
    expect(getRoleLabel('Batsman')).toBe('Batsman');
    expect(getRoleLabel('Bowler')).toBe('Bowler');
    expect(getRoleLabel('All-Rounder')).toBe('All-Rounder');
    expect(getRoleLabel('Wicket Keeper Batsman')).toBe('WK-Batsman');
    expect(getRoleLabel('Wicket-Keeper')).toBe('Wicket-Keeper');
  });

  it('returns original for unknown', () => {
    expect(getRoleLabel('Custom')).toBe('Custom');
  });

  it('returns Player for empty', () => {
    expect(getRoleLabel('')).toBe('Player');
  });
});

describe('getRoleBadgeClass', () => {
  it('maps roles to CSS classes', () => {
    expect(getRoleBadgeClass('Batsman')).toBe('role-batsman');
    expect(getRoleBadgeClass('Bowler')).toBe('role-bowler');
    expect(getRoleBadgeClass('All-Rounder')).toBe('role-allrounder');
    expect(getRoleBadgeClass('Wicket Keeper')).toBe('role-keeper');
  });

  it('returns default for unknown', () => {
    expect(getRoleBadgeClass('')).toBe('role-default');
    expect(getRoleBadgeClass('Custom')).toBe('role-default');
  });
});
