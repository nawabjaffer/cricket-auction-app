import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getAllMatches: vi.fn(),
  ready: vi.fn(),
  transaction: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../services/realtimeSync', () => ({ realtimeSync: { ensureInitialized: vi.fn().mockResolvedValue(undefined), getDatabase: () => ({}) } }));
vi.mock('../services/tenantPath', () => ({ tenantPath: (path: string) => `tenants/test/${path}` }));
vi.mock('../services/scoring', () => ({ scoringService: { initialize: vi.fn(), getAllMatches: mocks.getAllMatches, subscribeMatches: () => () => {} } }));
vi.mock('../services/obsService', () => ({ obsService: { isConnected: () => true, onConnectionChange: () => () => {} } }));
vi.mock('../services/obsConnectionBridgeService', () => ({ obsConnectionBridgeService: { assertBroadcastReady: mocks.ready, isAlive: () => false, startYouTubeBroadcast: vi.fn() } }));
vi.mock('firebase/database', () => ({
  ref: (_database: unknown, path: string) => ({ path }),
  set: mocks.set,
  runTransaction: mocks.transaction,
  onValue: (_ref: unknown, callback: (snapshot: unknown) => void) => {
    callback({ exists: () => false, val: () => null });
    return () => {};
  },
}));

import BroadcastScheduleManager from '../components/AdminPanel/BroadcastScheduleManager';

describe('broadcast scheduling controls', () => {
  const kickoff = Date.now() + 3_600_000;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ready.mockResolvedValue(undefined);
    mocks.set.mockResolvedValue(undefined);
    mocks.getAllMatches.mockResolvedValue([{ id: 'match-1', status: 'scheduled', date: new Date(kickoff).toISOString(), teamA: { name: 'A' }, teamB: { name: 'B' } }]);
    mocks.transaction.mockImplementation(async (_ref: unknown, update: (current: unknown) => unknown) => ({ committed: update(null) !== undefined }));
  });
  afterEach(cleanup);

  it('reports a disconnected or unconfigured OBS without writing schedules', async () => {
    mocks.ready.mockRejectedValue(new Error('Connect OBS and YouTube first.'));
    render(<BroadcastScheduleManager compact />);
    const button = screen.getByRole('button', { name: 'Broadcast schedules' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText(/Connect OBS and YouTube first/)).toBeInTheDocument();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('creates kickoff-minus-ten-minute schedules but preserves all existing statuses', async () => {
    const preserved: unknown[] = [];
    mocks.transaction.mockImplementation(async (reference: { path: string }, update: (current: unknown) => unknown) => {
      expect(reference.path).toBe('tenants/test/scoring/broadcastSchedule/match-1');
      expect(update(null)).toMatchObject({ matchId: 'match-1', startAt: kickoff - 600_000, leadMinutes: 10 });
      for (const status of ['scheduled', 'starting', 'started', 'failed']) preserved.push(update({ status, startAt: 1 }));
      return { committed: false };
    });
    render(<BroadcastScheduleManager compact />);
    const button = screen.getByRole('button', { name: 'Broadcast schedules' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText(/Existing schedules were kept/)).toBeInTheDocument();
    expect(preserved).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('persists Time default and automatically creates missing schedules at minus ten minutes', async () => {
    render(<BroadcastScheduleManager compact />);
    const checkbox = screen.getByRole('checkbox', { name: /Time default/ });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(mocks.set).toHaveBeenCalledWith({ path: 'tenants/test/scoring/broadcastScheduleSettings/timeDefault' }, true));
    await waitFor(() => expect(mocks.transaction).toHaveBeenCalled());
    const update = mocks.transaction.mock.calls[0][1] as (current: unknown) => unknown;
    expect(update(null)).toMatchObject({ startAt: kickoff - 600_000, leadMinutes: 10 });
  });
});