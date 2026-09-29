import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_database: unknown, path: string) => ({ path })),
  set: vi.fn().mockResolvedValue(undefined),
  runTransaction: vi.fn().mockResolvedValue(undefined),
}));
const replay = vi.hoisted(() => ({ initialize: vi.fn(), watchRelayCommands: vi.fn(), stopRelayWatch: vi.fn() }));
const obs = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getConfig: vi.fn(),
  onConnectionChange: vi.fn(),
}));

vi.mock('firebase/database', () => firebase);
vi.mock('../services/scoring/obsReplaySourceService', () => ({ obsReplaySourceService: replay }));
vi.mock('../services/obsService', () => ({ obsService: obs }));

import { obsConnectionBridgeService } from '../services/obsConnectionBridgeService';
import type { OBSReplayConfig } from '../types/scoring';

describe('OBS connection bridge', () => {
  beforeEach(() => {
    obsConnectionBridgeService.stop();
    vi.clearAllMocks();
    firebase.set.mockResolvedValue(undefined);
    firebase.runTransaction.mockResolvedValue(undefined);
    obs.isConnected.mockReturnValue(true);
    obs.getConfig.mockReturnValue({ host: '192.168.1.3', port: 4455 });
    obs.onConnectionChange.mockImplementation((listener: (state: string) => void) => {
      listener('connected');
      return vi.fn();
    });
  });

  it('publishes an active owner and makes the owner watch the shared tenant command queue', async () => {
    const replayConfig: OBSReplayConfig = { buttons: [] };
    const database = {} as never;
    obsConnectionBridgeService.start(database, 'tenants/epl_2026/scoring', replayConfig);
    await Promise.resolve();

    expect(replay.initialize).toHaveBeenCalledWith(database, 'tenants/epl_2026/scoring');
    expect(replay.watchRelayCommands).toHaveBeenCalledWith(null, replayConfig);
    expect(firebase.ref).toHaveBeenCalledWith(database, 'tenants/epl_2026/scoring/obsConnectionBridge');
    expect(firebase.set).toHaveBeenCalledWith(
      { path: 'tenants/epl_2026/scoring/obsConnectionBridge' },
      expect.objectContaining({ connected: true, host: '192.168.1.3', port: 4455 }),
    );

    obsConnectionBridgeService.stop();
  });

  it('expires stale owners so docks can return to direct connection mode', () => {
    const now = 10_000;
    expect(obsConnectionBridgeService.isAlive({ ownerId: 'owner', connected: true, lastSeen: 9_000, host: 'obs', port: 4455 }, now)).toBe(true);
    expect(obsConnectionBridgeService.isAlive({ ownerId: 'owner', connected: true, lastSeen: -10_000, host: 'obs', port: 4455 }, now)).toBe(false);
    expect(obsConnectionBridgeService.isAlive({ ownerId: 'owner', connected: false, lastSeen: 9_000, host: 'obs', port: 4455 }, now)).toBe(false);
  });
});
