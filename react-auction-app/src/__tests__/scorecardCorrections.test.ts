import { describe, expect, it } from 'vitest';
import type { Innings, LiveScore } from '../types/scoring';
import { PENDING_NEXT_BATSMAN_ID } from '../types/scoring';
import { reconcileEditedLiveScore } from '../utils/scorecardCorrections';

const liveScore: LiveScore = {
  matchId: 'match-1',
  currentInnings: 2,
  battingTeamId: 'team-b',
  bowlingTeamId: 'team-a',
  runs: 40,
  wickets: 1,
  overs: 5,
  runRate: 8,
  target: 151,
  requiredRate: 7.4,
  currentBatsmen: [
    { playerId: 'bat-1', playerName: 'Batter One', runs: 20, balls: 14, fours: 2, sixes: 0, strikeRate: 142.86, isOnStrike: true },
    { playerId: 'bat-2', playerName: 'Batter Two', runs: 10, balls: 8, fours: 1, sixes: 0, strikeRate: 125, isOnStrike: false },
  ],
  currentBowler: { playerId: 'bowl-1', playerName: 'Bowler One', overs: 2, maidens: 0, runs: 15, wickets: 1, economy: 7.5, dots: 4 },
  lastBall: '1',
  lastBallRuns: 1,
  currentOverBalls: ['1'],
  recentOvers: ['7', '9'],
  partnership: { runs: 30, balls: 22 },
  lastUpdated: 1,
  isPowerplay: false,
  powerplayOvers: 6,
  isFreehit: false,
  allBatsmen: [],
  allBowlers: [],
};

const correctedFirstInnings: Innings = {
  number: 1,
  battingTeamId: 'team-a',
  bowlingTeamId: 'team-b',
  totalRuns: 160,
  totalWickets: 8,
  totalOvers: 20,
  maxOvers: 20,
  extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  batsmen: [],
  bowlers: [],
  fallOfWickets: [],
  overs: [],
  isCompleted: true,
};

const correctedSecondInnings: Innings = {
  number: 2,
  battingTeamId: 'team-b',
  bowlingTeamId: 'team-a',
  totalRuns: 45,
  totalWickets: 1,
  totalOvers: 5.2,
  maxOvers: 20,
  extras: { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  batsmen: [
    { playerId: 'bat-1', playerName: 'Batter One', runs: 23, balls: 15, fours: 2, sixes: 0, strikeRate: 0, dismissal: 'not out', isOut: false, order: 1 },
    { playerId: 'bat-2', playerName: 'Batter Two', runs: 12, balls: 9, fours: 1, sixes: 0, strikeRate: 0, dismissal: 'not out', isOut: false, order: 2 },
  ],
  bowlers: [
    { playerId: 'bowl-1', playerName: 'Bowler One', overs: 2, maidens: 0, runs: 15, wickets: 1, economy: 0, wides: 0, noBalls: 0, dots: 4 },
  ],
  fallOfWickets: [],
  overs: [],
  isCompleted: false,
};

describe('reconcileEditedLiveScore', () => {
  it('recomputes the second-innings target, required rate and live figures from corrected innings', () => {
    const corrected = reconcileEditedLiveScore(liveScore, correctedSecondInnings, correctedFirstInnings);

    expect(corrected.target).toBe(161);
    expect(corrected.runs).toBe(45);
    expect(corrected.wickets).toBe(1);
    expect(corrected.overs).toBe(5.2);
    expect(corrected.runRate).toBe(8.44);
    expect(corrected.requiredRate).toBe(7.91);
    expect(corrected.currentBatsmen[0].strikeRate).toBe(153.33);
    expect(corrected.currentBatsmen[1].strikeRate).toBe(133.33);
    expect(corrected.currentBowler.playerId).toBe('bowl-1');
  });

  it('removes a stale target when reconciling the first innings', () => {
    const corrected = reconcileEditedLiveScore({ ...liveScore, currentInnings: 1 }, {
      ...correctedFirstInnings,
      totalRuns: 150,
      totalWickets: 4,
      totalOvers: 15,
      isCompleted: false,
    });

    expect(corrected.target).toBeUndefined();
    expect(corrected.requiredRate).toBeUndefined();
  });

  it('keeps a surviving batter in place when filling a dismissed striker slot', () => {
    const innings: Innings = {
      ...correctedSecondInnings,
      batsmen: [
        { ...correctedSecondInnings.batsmen[0], playerId: 'bat-2', playerName: 'Batter Two', order: 2 },
        { ...correctedSecondInnings.batsmen[1], playerId: 'bat-3', playerName: 'Batter Three', order: 3 },
      ],
    };
    const live: LiveScore = {
      ...liveScore,
      currentBatsmen: [
        { ...liveScore.currentBatsmen[0], playerId: PENDING_NEXT_BATSMAN_ID, playerName: 'Select next batter', isOnStrike: true },
        { ...liveScore.currentBatsmen[1], playerId: 'bat-2', playerName: 'Batter Two', isOnStrike: false },
      ],
    };

    const corrected = reconcileEditedLiveScore(live, innings);

    expect(corrected.currentBatsmen.map(batter => batter.playerId)).toEqual(['bat-3', 'bat-2']);
    expect(corrected.currentBatsmen[0].isOnStrike).toBe(true);
    expect(corrected.currentBatsmen[1].isOnStrike).toBe(false);
  });
});
