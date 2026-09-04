import { describe, it, expect } from 'vitest';
import { getRoleBasedStats, getRoleLabel, getRoleBadgeClass } from '../utils/playerStats';
import { getStatFieldsForSport, getStatFieldDef, SPORT_ROLE_ORDERS, DEFAULT_SPORT_STAT_FIELDS } from '../config/playerStatFields';
import { getRoleBadgeColor, getRoleBadge } from '../utils/roleFormatter';
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
    // Kabaddi
    expect(getRoleLabel('Raider')).toBe('Raider');
    expect(getRoleLabel('Defender')).toBe('Defender');
    // Football
    expect(getRoleLabel('Striker')).toBe('Forward');
    expect(getRoleLabel('Midfielder')).toBe('Midfielder');
    expect(getRoleLabel('Goalkeeper')).toBe('Goalkeeper');
  });

  it('returns original for unknown', () => {
    expect(getRoleLabel('Custom')).toBe('Custom');
  });

  it('returns Player for empty', () => {
    expect(getRoleLabel('')).toBe('Player');
  });
});

describe('getRoleBadgeClass and getRoleBadgeColor', () => {
  it('maps roles to CSS classes', () => {
    expect(getRoleBadgeClass('Batsman')).toBe('role-batsman');
    expect(getRoleBadgeClass('Bowler')).toBe('role-bowler');
    expect(getRoleBadgeClass('All-Rounder')).toBe('role-allrounder');
    expect(getRoleBadgeClass('Wicket Keeper')).toBe('role-keeper');
    // Kabaddi
    expect(getRoleBadgeClass('Raider')).toBe('role-raider');
    expect(getRoleBadgeClass('Defender')).toBe('role-defender');
    // Football
    expect(getRoleBadgeClass('Forward')).toBe('role-forward');
    expect(getRoleBadgeClass('Midfielder')).toBe('role-midfielder');
    expect(getRoleBadgeClass('Goalkeeper')).toBe('role-goalkeeper');
  });

  it('returns badge codes and colors for multi-sport roles', () => {
    expect(getRoleBadge('Raider')).toBe('RAID');
    expect(getRoleBadge('Defender')).toBe('DEF');
    expect(getRoleBadge('Striker')).toBe('FWD');
    expect(getRoleBadge('Midfielder')).toBe('MID');
    expect(getRoleBadge('Goalkeeper')).toBe('GK');
    expect(getRoleBadge('Attacker')).toBe('ATK');
    expect(getRoleBadge('Point Guard')).toBe('PG');

    expect(getRoleBadgeColor('Raider')).toBe('#ea580c');
    expect(getRoleBadgeColor('Defender')).toBe('#6366f1');
    expect(getRoleBadgeColor('Striker')).toBe('#ef4444');
    expect(getRoleBadgeColor('Midfielder')).toBe('#06b6d4');
  });

  it('returns default for unknown', () => {
    expect(getRoleBadgeClass('')).toBe('role-default');
    expect(getRoleBadgeClass('Custom')).toBe('role-default');
  });
});

describe('Sport-Specific Config & Stat Fields', () => {
  it('provides default role orders and stat fields for all sports', () => {
    expect(SPORT_ROLE_ORDERS.cricket).toContain('Batsman');
    expect(SPORT_ROLE_ORDERS.kabaddi).toEqual(['Raider', 'Defender', 'All-Rounder']);
    expect(SPORT_ROLE_ORDERS.football).toEqual(['Forward', 'Midfielder', 'Defender', 'Goalkeeper']);
    expect(SPORT_ROLE_ORDERS.volleyball).toContain('Libero');
    expect(SPORT_ROLE_ORDERS.basketball).toContain('Point Guard');
    expect(SPORT_ROLE_ORDERS.badminton).toContain('Singles Player');

    expect(DEFAULT_SPORT_STAT_FIELDS.kabaddi).toContain('raidPoints');
    expect(DEFAULT_SPORT_STAT_FIELDS.football).toContain('goals');
    expect(DEFAULT_SPORT_STAT_FIELDS.cricket).toContain('runs');
  });

  it('provides stat fields for each sport', () => {
    const kabaddiFields = getStatFieldsForSport('kabaddi');
    expect(kabaddiFields.some(f => f.key === 'raidPoints')).toBe(true);
    expect(kabaddiFields.some(f => f.key === 'tacklePoints')).toBe(true);

    const footballFields = getStatFieldsForSport('football');
    expect(footballFields.some(f => f.key === 'goals')).toBe(true);
    expect(footballFields.some(f => f.key === 'assists')).toBe(true);

    const cricketFields = getStatFieldsForSport('cricket');
    expect(cricketFields.some(f => f.key === 'runs')).toBe(true);
    expect(cricketFields.some(f => f.key === 'wickets')).toBe(true);
  });

  it('resolves individual field definitions', () => {
    const raidPointsDef = getStatFieldDef('raidPoints', 'kabaddi');
    expect(raidPointsDef?.label).toBe('Raid Points');
    expect(raidPointsDef?.category).toBe('raiding');

    const goalsDef = getStatFieldDef('goals', 'football');
    expect(goalsDef?.label).toBe('Goals');
    expect(goalsDef?.category).toBe('attack');
  });
});
