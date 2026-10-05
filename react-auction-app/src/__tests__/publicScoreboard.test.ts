import { describe, expect, it } from 'vitest';
import type { Innings, MatchSetup } from '../types/scoring';
import { buildCorrectedFinalScore, buildPublicTournamentPlayers, getMatchNumbers, publicMatchResult, filterPublicMatches, validatePublicInningsCorrection, verifySuperAdminMobileCredentials } from '../utils/publicScoreboard';

const makeMatch = (id: string, status: MatchSetup['status'], date: string): MatchSetup => ({
  id,
  status,
  date,
  teamA: { id: `${id}-a`, name: 'A' },
  teamB: { id: `${id}-b`, name: 'B' },
  maxOvers: 20,
  venue: '',
  tournamentName: '',
  createdAt: 0,
  updatedAt: 0,
} as MatchSetup);

const validInnings: Innings = {
  number: 1,
  battingTeamId: 'a',
  bowlingTeamId: 'b',
  totalRuns: 12,
  totalWickets: 1,
  totalOvers: 2,
  maxOvers: 20,
  extras: { total: 2, wides: 2, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  batsmen: [{ playerId: 'batter-1', playerName: 'Batter', runs: 10, balls: 12, fours: 1, sixes: 0, strikeRate: 83.3, dismissal: 'bowled', isOut: true, order: 1 }],
  bowlers: [{ playerId: 'bowler-1', playerName: 'Bowler', overs: 2, maidens: 0, runs: 12, wickets: 1, economy: 6, wides: 2, noBalls: 0, dots: 3 }],
  fallOfWickets: [],
  overs: [],
  isCompleted: false,
};

describe('public scoreboard helpers', () => {
  it('aggregates tournament boundaries and maidens without counting final snapshots twice', () => {
    const setup = { ...makeMatch('one', 'completed', ''), teamA: { id: 'a', name: 'Team A' }, teamB: { id: 'b', name: 'Team B' } };
    const score = { ...validInnings, bowlers: [{ ...validInnings.bowlers[0], maidens: 2 }] };
    const players = buildPublicTournamentPlayers([
      { setup, innings: { 1: score }, final: { matchId: 'one', status: 'completed', innings: [score], teams: [], result: null, toss: null, venue: '', date: '' } },
      { setup: { ...setup, id: 'two' }, innings: { 1: score } },
    ]);
    expect(players.find(player => player.playerId === 'batter-1')).toMatchObject({ runs: 20, fours: 2, matches: 2, teamName: 'Team A' });
    expect(players.find(player => player.playerId === 'bowler-1')).toMatchObject({ wickets: 2, maidens: 4, bowlingBalls: 24, economy: 6 });
  });

  it('preserves stored match numbers while assigning unique legacy numbers', () => {
    const first = makeMatch('a', 'scheduled', '');
    const second = { ...makeMatch('b', 'scheduled', ''), matchNumber: 1 };
    expect([...getMatchNumbers([first, second]).values()].sort()).toEqual([1, 2]);
  });

  it('includes abandoned fixtures in completed and shows the interruption reason', () => {
    const match = { ...makeMatch('rain', 'abandoned', ''), interruption: { kind: 'abandoned' as const, reason: 'Rain', updatedAt: 1 } };
    expect(filterPublicMatches([match], 'completed')).toHaveLength(1);
    expect(publicMatchResult(match)).toBe('Match abandoned: Rain');
  });
  it('verifies configured mobile credentials without trimming the password', () => {
    const configured = { superAdminUsername: 'organizer', superAdminPassword: 'secure pass' };
    expect(verifySuperAdminMobileCredentials(configured, ' organizer ', 'secure pass')).toBe(true);
    expect(verifySuperAdminMobileCredentials(configured, 'organizer', 'secure pass ')).toBe(false);
    expect(verifySuperAdminMobileCredentials(null, 'organizer', 'secure pass')).toBe(false);
  });

  it('separates live, upcoming, and completed fixtures in the match picker', () => {
    const matches = [
      makeMatch('live', 'live', '2026-10-02T11:00:00Z'),
      makeMatch('soon', 'scheduled', '2026-10-02T12:00:00Z'),
      makeMatch('old', 'completed', '2026-10-01T12:00:00Z'),
    ];
    expect(filterPublicMatches(matches, 'live').map(match => match.id)).toEqual(['live']);
    expect(filterPublicMatches(matches, 'upcoming').map(match => match.id)).toEqual(['soon']);
    expect(filterPublicMatches(matches, 'completed').map(match => match.id)).toEqual(['old']);
    expect(filterPublicMatches(matches, 'all').map(match => match.id)).toEqual(['live', 'soon', 'old']);
  });

  it('validates innings totals and player figures before a public correction is saved', () => {
    expect(validatePublicInningsCorrection(validInnings)).toEqual([]);
    expect(validatePublicInningsCorrection({ ...validInnings, totalRuns: 99 })).toContain('Innings 1: total runs must equal batter runs plus extras.');
  });

  it('recalculates a completed result after corrected scorecard totals change', () => {
    const final = {
      matchId: 'match-1', status: 'completed' as const, teams: [], innings: [],
      result: { winner: 'a', margin: '1 run' }, toss: null, venue: '', date: '',
    };
    const first = { ...validInnings, number: 1 as const, totalRuns: 100, battingTeamId: 'a', bowlingTeamId: 'b' };
    const second = { ...validInnings, number: 2 as const, totalRuns: 98, battingTeamId: 'b', bowlingTeamId: 'a' };
    expect(buildCorrectedFinalScore(final, [first, second]).result).toEqual({ winner: 'a', margin: '2 runs' });
  });
});
