import { describe, expect, it } from 'vitest';
import type { Innings, MatchSetup } from '../types/scoring';
import { buildPointsTableStandings, buildPoolAssignments, calculateTeamNetRunRate } from '../utils/pointsTable';

const setup = { status: 'completed' } as MatchSetup;
const makeInnings = (number: 1 | 2, battingTeamId: string, bowlingTeamId: string, totalRuns: number, totalWickets: number, totalOvers: number): Innings => ({
  number,
  battingTeamId,
  bowlingTeamId,
  totalRuns,
  totalWickets,
  totalOvers,
  maxOvers: 20,
  extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  batsmen: [],
  bowlers: [],
  fallOfWickets: [],
  overs: [],
  isCompleted: true,
});

describe('points-table calculations', () => {
  it('calculates aggregate NRR and credits full overs to an all-out innings', () => {
    const match = {
      setup,
      final: {
        matchId: 'match-1',
        status: 'completed' as const,
        teams: [],
        innings: [
          makeInnings(1, 'team-a', 'team-b', 160, 8, 20),
          makeInnings(2, 'team-b', 'team-a', 120, 10, 15.2),
        ],
        result: { winner: 'team-a', margin: '40 runs' },
        toss: null,
        venue: '',
        date: '',
      },
    };

    expect(calculateTeamNetRunRate('team-a', [match])).toBe(2);
    expect(calculateTeamNetRunRate('team-b', [match])).toBe(-2);
  });

  it('balances teams into configured pools and reports teams beyond capacity', () => {
    const teams = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: id }));
    const balanced = buildPoolAssignments(teams, 2, 3);
    expect(Object.values(balanced.assignments)).toHaveLength(5);
    expect(balanced.unassignedTeamIds).toEqual([]);
    expect(new Set(Object.values(balanced.assignments))).toEqual(new Set(['pool_1', 'pool_2']));

    const tooSmall = buildPoolAssignments(teams, 1, 4);
    expect(tooSmall.unassignedTeamIds).toEqual(['e']);
  });

  it('builds sorted standings and includes teams that have not played', () => {
    const match = {
      setup: {
        ...setup,
        teamA: { id: 'team-a', name: 'Team A' },
        teamB: { id: 'team-b', name: 'Team B' },
      } as MatchSetup,
      final: {
        matchId: 'match-1',
        status: 'completed' as const,
        teams: [],
        innings: [
          makeInnings(1, 'team-a', 'team-b', 160, 8, 20),
          makeInnings(2, 'team-b', 'team-a', 120, 10, 15.2),
        ],
        result: { winner: 'team-a', margin: '40 runs' },
        toss: null,
        venue: '',
        date: '',
      },
    };

    const standings = buildPointsTableStandings([match], [{ id: 'team-c', name: 'Team C' }]);
    expect(standings.map(team => team.teamId)).toEqual(['team-a', 'team-c', 'team-b']);
    expect(standings.find(team => team.teamId === 'team-a')).toMatchObject({ played: 1, won: 1, points: 2, nrr: 2 });
    expect(standings.find(team => team.teamId === 'team-c')).toMatchObject({ played: 0, points: 0, nrr: 0 });
  });
});