import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {},
  values: {} as Record<string, unknown>,
  updates: vi.fn(),
}));

vi.mock('firebase/database', () => ({
  get: vi.fn(async (reference: { path: string }) => {
    const value = mocks.values[reference.path];
    return { exists: () => value !== undefined, val: () => value };
  }),
  ref: (_db: unknown, path = '') => ({ path }),
  set: vi.fn(),
  update: mocks.updates,
}));
vi.mock('../services/realtimeSync', () => ({
  realtimeSync: {
    ensureInitialized: vi.fn().mockResolvedValue(true),
    getDatabase: () => mocks.db,
  },
}));

import { tenantService } from '../services/tenantService';

describe('tenant active session cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values = {
      'platform/tenants/tenant-1': { id: 'tenant-1', slug: 'tenant-1', name: 'Tenant 1' },
      'tenants/tenant-1/scoring/matchIndex': { cricketLive: true, cricketComplete: true },
      'tenants/tenant-1/scoring/activeMatch/matchId': 'cricketLive',
      'tenants/tenant-1/scoring/matches/cricketLive/setup': { id: 'cricketLive', status: 'live' },
      'tenants/tenant-1/scoring/matches/cricketComplete/setup': { id: 'cricketComplete', status: 'completed' },
      'tenants/tenant-1/football/matchIndex': { footballLive: true },
      'tenants/tenant-1/football/matches/footballLive/setup': { id: 'footballLive', status: 'live' },
      'tenants/tenant-1/kabaddi/matchIndex': { kabaddiLive: true },
      'tenants/tenant-1/kabaddi/activeMatch/matchId': 'kabaddiLive',
      'tenants/tenant-1/kabaddi/matches/kabaddiLive/setup': { id: 'kabaddiLive', status: 'live' },
    };
  });

  it('closes active matches and clears transient state without deleting match history', async () => {
    const result = await tenantService.clearActiveSessionState('tenant-1');
    const [reference, updates] = mocks.updates.mock.calls[0];

    expect(reference.path).toBe('');
    expect(result).toEqual({ matchesScanned: 4, matchesClosed: 3 });
    expect(updates['tenants/tenant-1/scoring/activeMatch']).toBeNull();
    expect(updates['tenants/tenant-1/kabaddi/activeMatch']).toBeNull();
    expect(updates['tenants/tenant-1/scoring/matches/cricketLive/setup/status']).toBe('abandoned');
    expect(updates['tenants/tenant-1/scoring/matches/cricketLive/setup/interruption']).toMatchObject({
      kind: 'abandoned',
      reason: 'Closed by Platform Admin',
    });
    expect(updates['tenants/tenant-1/football/matches/footballLive/setup/status']).toBe('abandoned');
    expect(updates['tenants/tenant-1/kabaddi/matches/kabaddiLive/setup/status']).toBe('abandoned');
    expect(updates['tenants/tenant-1/scoring/matches/cricketLive/liveCam']).toBeNull();
    expect(updates['tenants/tenant-1/scoring/matches/cricketLive/replayTrigger']).toBeNull();
    expect(updates['tenants/tenant-1/football/matches/footballLive/overlay']).toBeNull();
    expect(updates['tenants/tenant-1/auction/currentState']).toBeNull();
    expect(updates['tenants/tenant-1/auction/mobileBids']).toBeNull();
    expect(updates['tenants/tenant-1/auction/sessionReset']).toMatchObject({ reason: 'platform-admin-clear-active-sessions' });
    expect(updates['tenants/tenant-1/scoring/matches/cricketComplete/setup/status']).toBeUndefined();
    expect(updates['tenants/tenant-1/scoring/matches/cricketComplete/final']).toBeUndefined();
    expect(updates['tenants/tenant-1/football/matches/footballLive/live']).toBeUndefined();
  });

  it('scans legacy match records when the index is absent, even if an active pointer exists', async () => {
    mocks.values['tenants/tenant-1/scoring/matchIndex'] = undefined;
    mocks.values['tenants/tenant-1/scoring/matches'] = {
      cricketLive: { setup: { id: 'cricketLive', status: 'live' } },
      cricketComplete: { setup: { id: 'cricketComplete', status: 'completed' } },
      cricketLegacy: { setup: { id: 'cricketLegacy', status: 'scheduled' } },
    };
    mocks.values['tenants/tenant-1/scoring/matches/cricketLegacy/setup'] = { id: 'cricketLegacy', status: 'scheduled' };

    const result = await tenantService.clearActiveSessionState('tenant-1');
    const updates = mocks.updates.mock.calls[0][1];

    expect(result.matchesScanned).toBe(5);
    expect(updates['tenants/tenant-1/scoring/matches/cricketLegacy/overlay']).toBeNull();
    expect(updates['tenants/tenant-1/scoring/matches/cricketLegacy/liveCam']).toBeNull();
  });
});
