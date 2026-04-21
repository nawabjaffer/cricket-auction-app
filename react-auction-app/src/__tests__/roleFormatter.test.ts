import { describe, it, expect } from 'vitest';
import {
  getRoleCategory,
  formatRoleDisplay,
  getRoleBadge,
  parseRoleDetails,
  getRoleBadgeColor,
} from '../utils/roleFormatter';

describe('getRoleCategory', () => {
  it('maps standard roles', () => {
    expect(getRoleCategory('Batsman')).toBe('Batsman');
    expect(getRoleCategory('Bowler')).toBe('Bowler');
    expect(getRoleCategory('All-Rounder')).toBe('All-Rounder');
    expect(getRoleCategory('Wicket Keeper Batsman')).toBe('Wicket Keeper Batsman');
    expect(getRoleCategory('Wicket-Keeper')).toBe('Wicket Keeper Batsman');
  });

  it('handles case insensitivity', () => {
    expect(getRoleCategory('batsman')).toBe('Batsman');
    expect(getRoleCategory('BOWLER')).toBe('Bowler');
  });

  it('handles partial matches', () => {
    expect(getRoleCategory('WK-Batsman')).toBe('Wicket Keeper Batsman');
    expect(getRoleCategory('All Rounder')).toBe('All-Rounder');
    expect(getRoleCategory('allrounder')).toBe('All-Rounder');
  });

  it('returns Uncategorized for unknown roles', () => {
    expect(getRoleCategory('Unknown')).toBe('Uncategorized');
    expect(getRoleCategory('Player')).toBe('Uncategorized');
  });

  it('handles null/undefined/empty safely', () => {
    expect(getRoleCategory(null)).toBe('Uncategorized');
    expect(getRoleCategory(undefined)).toBe('Uncategorized');
    expect(getRoleCategory('')).toBe('Uncategorized');
  });

  it('handles non-string types safely', () => {
    expect(getRoleCategory(123 as unknown as string)).toBe('Uncategorized');
    expect(getRoleCategory({} as unknown as string)).toBe('Uncategorized');
  });
});

describe('formatRoleDisplay', () => {
  it('formats standard roles', () => {
    expect(formatRoleDisplay('Batsman')).toBe('Batsman');
    expect(formatRoleDisplay('Bowler')).toBe('Bowler');
  });

  it('handles roles with hand abbreviations', () => {
    const result = formatRoleDisplay('Batsman (RHB)');
    expect(result).toContain('Right-Hand Bat');
  });

  it('returns Player for null/undefined', () => {
    expect(formatRoleDisplay(null)).toBe('Player');
    expect(formatRoleDisplay(undefined)).toBe('Player');
    expect(formatRoleDisplay('')).toBe('Player');
  });

  it('handles non-string types safely', () => {
    expect(formatRoleDisplay(42 as unknown as string)).toBe('Player');
  });

  it('normalizes wicket keeper variants', () => {
    const result = formatRoleDisplay('Wicket Keeper Batsman');
    expect(result).toContain('WK-Batsman');
  });
});

describe('getRoleBadge', () => {
  it('returns correct badges', () => {
    expect(getRoleBadge('Batsman')).toBe('BAT');
    expect(getRoleBadge('Bowler')).toBe('BOWL');
    expect(getRoleBadge('All-Rounder')).toBe('AR');
    expect(getRoleBadge('Wicket Keeper Batsman')).toBe('WK');
  });

  it('returns PLR for null/undefined', () => {
    expect(getRoleBadge(null)).toBe('PLR');
    expect(getRoleBadge(undefined)).toBe('PLR');
  });
});

describe('parseRoleDetails', () => {
  it('parses batsman correctly', () => {
    const result = parseRoleDetails('Batsman');
    expect(result.coreRole).toBe('Batsman');
    expect(result.category).toBe('Batsman');
    expect(result.badge).toBe('BAT');
  });

  it('parses role with hand and bowling style', () => {
    const result = parseRoleDetails('All-Rounder (RHB) Right-Arm Fast');
    expect(result.category).toBe('All-Rounder');
    expect(result.battingHand).toBe('Right-Hand Bat');
    expect(result.bowlingStyle).toBeTruthy();
  });

  it('returns defaults for null/undefined', () => {
    const result = parseRoleDetails(undefined);
    expect(result.coreRole).toBe('Player');
    expect(result.category).toBe('Uncategorized');
    expect(result.badge).toBe('PLR');
  });

  it('handles non-string types safely', () => {
    const result = parseRoleDetails(999 as unknown as string);
    expect(result.coreRole).toBe('Player');
  });
});

describe('getRoleBadgeColor', () => {
  it('returns correct colors', () => {
    expect(getRoleBadgeColor('Batsman')).toBe('#3b82f6');
    expect(getRoleBadgeColor('Bowler')).toBe('#ef4444');
    expect(getRoleBadgeColor('All-Rounder')).toBe('#10b981');
    expect(getRoleBadgeColor('Wicket Keeper Batsman')).toBe('#8b5cf6');
  });

  it('returns default gray for null/undefined', () => {
    expect(getRoleBadgeColor(null)).toBe('#6b7280');
    expect(getRoleBadgeColor(undefined)).toBe('#6b7280');
    expect(getRoleBadgeColor('')).toBe('#6b7280');
  });
});
