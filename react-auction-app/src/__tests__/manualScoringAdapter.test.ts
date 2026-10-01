import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_database: unknown, path?: string) => ({ path })),
  push: vi.fn(() => ({ key: 'ball-wicket-1' })),
  set: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/database', () => firebase);

import { ManualScoringAdapter } from '../services/scoring/ManualScoringAdapter';
import { PENDING_NEXT_BATSMAN_ID } from '../types/scoring';
import type { Innings, LiveScore } from '../types/scoring';

describe('ManualScoringAdapter deferred wicket replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebase.set.mockResolvedValue(undefined);
  });

  it('records a wicket without replacement, marks the next batter slot, and suppresses a duplicate OBS trigger', async () => {
    const adapter = new ManualScoringAdapter({} as never, 'tenants/test/scoring');
    const live: LiveScore = {
      matchId: 'match-1', currentInnings: 1, battingTeamId: 'batting', bowlingTeamId: 'bowling',
      runs: 12, wickets: 0, overs: 1.2, runRate: 6, currentBatsmen: [
        { playerId: 'batter-1', playerName: 'Batter One', runs: 8, balls: 7, fours: 1, sixes: 0, strikeRate: 114.29, isOnStrike: true },
        { playerId: 'batter-2', playerName: 'Batter Two', runs: 4, balls: 5, fours: 0, sixes: 0, strikeRate: 80, isOnStrike: false },
      ],
      currentBowler: { playerId: 'bowler-1', playerName: 'Bowler One', overs: 1.2, maidens: 0, runs: 8, wickets: 0, economy: 6, dots: 4 },
      lastBall: '1', lastBallRuns: 1, currentOverBalls: ['0', '1'], recentOvers: [], partnership: { runs: 12, balls: 12 },
      lastUpdated: 1, isPowerplay: true, powerplayOvers: 6, isFreehit: false,
      allBatsmen: [
        { playerId: 'batter-1', playerName: 'Batter One', runs: 8, balls: 7, fours: 1, sixes: 0, strikeRate: 114.29, dismissal: 'not out', isOut: false, order: 1 },
        { playerId: 'batter-2', playerName: 'Batter Two', runs: 4, balls: 5, fours: 0, sixes: 0, strikeRate: 80, dismissal: 'not out', isOut: false, order: 2 },
      ],
      allBowlers: [],
    };
    const innings: Innings = {
      number: 1, battingTeamId: 'batting', bowlingTeamId: 'bowling', totalRuns: 12, totalWickets: 0, totalOvers: 1.2, maxOvers: 20,
      extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
      batsmen: live.allBatsmen || [], bowlers: [], fallOfWickets: [], overs: [], isCompleted: false,
    };

    const result = await adapter.recordBall('match-1', live, innings, {
      outcome: 'W',
      wicket: { dismissalType: 'bowled', batsmanId: 'batter-1', bowlerId: 'bowler-1' },
      suppressAutomaticObsAction: true,
    });

    expect(result.updatedLive.currentBatsmen.some(batter => batter.playerId === PENDING_NEXT_BATSMAN_ID)).toBe(true);
    expect(result.updatedInnings.batsmen.find(batter => batter.playerId === 'batter-1')).toMatchObject({ isOut: true, dismissal: 'b bowler' });
    const writtenPaths = firebase.set.mock.calls.map(([firebaseRef]) => (firebaseRef as { path?: string }).path);
    expect(writtenPaths).toContain('tenants/test/scoring/matches/match-1/live');
    expect(writtenPaths).toContain('tenants/test/scoring/matches/match-1/innings/1');
    expect(writtenPaths).toContain('tenants/test/scoring/matches/match-1/balls/ball-wicket-1');
    expect(writtenPaths.some(path => path?.endsWith('/overlay') || path?.endsWith('/replayTrigger'))).toBe(false);
  });
});