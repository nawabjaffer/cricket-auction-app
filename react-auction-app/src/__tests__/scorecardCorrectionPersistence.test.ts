import { describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  update: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn(),
  remove: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('firebase/database', () => firebase);

import { ScoringService } from '../services/scoring/ScoringService';
import type { Innings, LiveScore, MatchScore } from '../types/scoring';

const innings = { number: 1 } as Innings;
const live = { matchId: 'match-1', runs: 12 } as LiveScore;
const final = { matchId: 'match-1', status: 'completed', innings: [innings] } as MatchScore;

describe('scorecard correction persistence', () => {
  it('atomically updates tenant innings and supplied live/final snapshots', async () => {
    const database = {} as never;
    const scoring = new ScoringService();
    scoring.initialize(database, 'tenants/ppl-2026/scoring');

    await scoring.saveScorecardCorrection('match-1', [innings], live, final);

    expect(firebase.ref).toHaveBeenCalledWith(database, 'tenants/ppl-2026/scoring/matches/match-1');
    expect(firebase.update).toHaveBeenCalledWith(
      { path: 'tenants/ppl-2026/scoring/matches/match-1' },
      { 'innings/1': innings, live, final },
    );
  });
});
