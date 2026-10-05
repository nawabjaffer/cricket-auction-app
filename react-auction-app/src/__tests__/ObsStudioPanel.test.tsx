import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OBSReplayConfig } from '../types/scoring';

const mocks = vi.hoisted(() => ({
  database: {},
  bridgeCallback: undefined as ((snapshot: unknown) => void) | undefined,
  connectionCallback: undefined as ((state: string) => void) | undefined,
  currentStatus: 'disconnected',
  startBridge: vi.fn(),
  updateReplayConfig: vi.fn(),
  replayConfig: { buttons: [{ id: 'replay', label: 'Replay' }] } as OBSReplayConfig,
}));

vi.mock('firebase/database', () => ({
  onValue: vi.fn((_reference: unknown, callback: (snapshot: unknown) => void) => {
    mocks.bridgeCallback = callback;
    return vi.fn();
  }),
  ref: (_database: unknown, path: string) => ({ path }),
}));
vi.mock('../services/obsService', () => ({
  obsService: {
    getConnectionState: () => mocks.currentStatus,
    onConnectionChange: (callback: (state: string) => void) => {
      mocks.connectionCallback = callback;
      callback(mocks.currentStatus);
      return vi.fn();
    },
    isConnected: () => mocks.currentStatus === 'connected',
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn(),
    getLastErrorDetail: () => '',
    getConnectionDiagnostics: () => ({ attemptedUrls: [], lastSuccessfulUrl: '', failures: [], lastErrorDetail: '', mixedContentLikely: false, logs: [] }),
    request: vi.fn(async (request: string) => {
      if (request === 'GetVersion') return { obsVersion: '31', obsWebSocketVersion: '5' };
      if (request === 'GetSceneList') return { currentProgramSceneName: 'Live', scenes: [{ sceneName: 'Live', sceneIndex: 0 }] };
      if (request === 'GetStats') return { cpuUsage: 0, memoryUsage: 0, availableDiskSpace: 0, activeFps: 0, averageFrameRenderTime: 0, renderSkippedFrames: 0, renderTotalFrames: 0 };
      return { outputActive: false, outputDuration: 0 };
    }),
    setScene: vi.fn(),
  },
}));
vi.mock('../services/obsConnectionBridgeService', () => ({
  obsConnectionBridgeService: {
    isAlive: (presence: { connected?: boolean } | null) => Boolean(presence?.connected),
    isOwner: () => false,
    isExpired: () => false,
    start: mocks.startBridge,
    updateReplayConfig: mocks.updateReplayConfig,
  },
}));
vi.mock('../services/realtimeSync', () => ({ realtimeSync: { ensureInitialized: vi.fn().mockResolvedValue(true), getDatabase: () => mocks.database } }));
vi.mock('../services/tenantPath', () => ({ getActiveTenant: () => 'tenant-1', tenantPath: (path: string) => `tenants/tenant-1/${path}` }));
vi.mock('../store/liveStreamingStore', () => ({ useLiveStreamingStore: () => ({ setOBSEnabled: vi.fn(), setOBSConnectionState: vi.fn() }) }));
vi.mock('../hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ isEnabled: () => true }) }));

import ObsStudioPanel from '../components/AdminPanel/ObsStudioPanel';

const presence = { ownerId: 'dock', ownerType: 'dock' as const, connected: true, lastSeen: Date.now(), host: '192.168.1.20', port: 4455 };

function renderPanel() {
  return render(<ObsStudioPanel sources={[]} replayConfig={mocks.replayConfig} />);
}

describe('OBS Studio connection panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentStatus = 'disconnected';
    mocks.bridgeCallback = undefined;
    mocks.connectionCallback = undefined;
  });
  afterEach(cleanup);

  it('shows the shared same-Wi-Fi OBS state while keeping direct connection explicit', async () => {
    renderPanel();
    await waitFor(() => expect(mocks.bridgeCallback).toBeTypeOf('function'));
    act(() => mocks.bridgeCallback?.({ exists: () => true, val: () => presence }));

    expect(await screen.findByText('Connected via OBS Dock')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect directly here' })).toBeTruthy();
    expect(screen.getByText(/replay actions over the same Wi-Fi/)).toBeTruthy();
  });

  it('publishes direct connections with the tenant replay configuration', async () => {
    renderPanel();
    await waitFor(() => expect(mocks.connectionCallback).toBeTypeOf('function'));
    act(() => {
      mocks.currentStatus = 'connected';
      mocks.connectionCallback?.('connected');
    });

    await waitFor(() => expect(mocks.startBridge).toHaveBeenCalledWith(mocks.database, 'tenants/tenant-1/scoring', mocks.replayConfig, 'admin'));
    expect(mocks.updateReplayConfig).toHaveBeenCalledWith(mocks.replayConfig);
  });
});
