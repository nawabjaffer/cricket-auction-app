import { describe, expect, it } from 'vitest';
import { belongsToTeam } from '../utils/teamMembership';

describe('belongsToTeam', () => {
  it('uses the explicit team ID as authoritative when present', () => {
    expect(belongsToTeam({ teamId: 'team-a', teamName: 'Shared Name' }, { id: 'team-a', name: 'A' })).toBe(true);
    expect(belongsToTeam({ teamId: 'team-a', teamName: 'Shared Name' }, { id: 'team-b', name: 'Shared Name' })).toBe(false);
  });

  it('falls back to normalized team name for legacy records without an ID', () => {
    expect(belongsToTeam({ teamName: '  North   Stars ' }, { id: 'team-a', name: 'north stars' })).toBe(true);
    expect(belongsToTeam({ teamName: 'North Stars' }, { id: 'team-a', name: 'South Stars' })).toBe(false);
  });
});
