const mockData = new Map<string, unknown>();
jest.mock('../src/services/firebase', () => ({ getDb: () => ({}) }));
jest.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  query: jest.fn((source: unknown) => source),
  limitToLast: jest.fn((count: number) => ({ count })),
  onValue: jest.fn(),
  get: jest.fn(async (source: { path: string }) => ({ exists: () => mockData.has(source.path), val: () => mockData.get(source.path) ?? null })),
}));

import { get, limitToLast } from 'firebase/database';
import { listMatches } from '../src/services/tournament';

beforeEach(() => { mockData.clear(); jest.clearAllMocks(); });

describe('bounded mobile match list', () => {
  it('queries a limited id index plus the on-air match rather than every historical match', async () => {
    const base = 'tenants/tenant_1/scoring';
    mockData.set(`${base}/matchIndex`, { match_new: true });
    mockData.set(`${base}/activeMatch/matchId`, 'match_old');
    mockData.set(`${base}/matches/match_new/setup`, { teamA: { name: 'A' }, teamB: { name: 'B' }, status: 'scheduled' });
    mockData.set(`${base}/matches/match_old/setup`, { teamA: { name: 'C' }, teamB: { name: 'D' }, status: 'live' });
    const matches = await listMatches('tenant_1', 'cricket');
    expect(limitToLast).toHaveBeenCalledWith(40);
    expect(matches.map(item => item.id)).toEqual(['match_old', 'match_new']);
    expect(get).toHaveBeenCalledTimes(4);
  });
  it('caps requested pages and rejects an unsafe on-air id', async () => {
    mockData.set('tenants/tenant_1/scoring/activeMatch/matchId', '../other');
    expect(await listMatches('tenant_1', 'cricket', 5000)).toEqual([]);
    expect(limitToLast).toHaveBeenCalledWith(120);
    expect(get).toHaveBeenCalledTimes(2);
  });
});