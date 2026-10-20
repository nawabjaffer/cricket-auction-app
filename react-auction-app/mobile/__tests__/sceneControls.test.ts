jest.mock('../src/native', () => ({
  StudioEngine: { switchCamera: jest.fn(async () => undefined) },
  StudioBluetooth: { setRemoteKeyBindings: jest.fn(async () => undefined) },
  StudioNetwork: { sendConnectorCommand: jest.fn(async () => JSON.stringify({ zoom: 2, minZoom: 1, maxZoom: 8, torch: false, flash: true })) },
  StudioSecure: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
  onStudioEvent: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/scenes', () => ({ switchScene: jest.fn(async () => undefined) }));
jest.mock('../src/services/streamController', () => ({
  effectiveMatchId: jest.fn(() => 'match_1'), applyOverlays: jest.fn(async () => undefined),
  syncPreparedSignature: jest.fn(), goLive: jest.fn(), endLive: jest.fn(), UserFacingError: class extends Error {},
}));
jest.mock('../src/services/firebase', () => ({ getDb: jest.fn(() => ({})) }));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db, path: string) => ({ toString: () => path })),
  get: jest.fn(async () => ({ val: () => ({}) })),
  set: jest.fn(async () => undefined),
  runTransaction: jest.fn(async () => ({ committed: true })),
}));

import { get, ref, runTransaction, set } from 'firebase/database';
import { StudioBluetooth, StudioEngine, StudioNetwork } from '../src/native';
import { bindRemoteKeys, handleRemoteKey } from '../src/services/remoteKeys';
import { triggerSceneAnimation } from '../src/services/sceneAnimations';
import { switchScene } from '../src/services/scenes';
import { useSettings } from '../src/store/settingsStore';
import { useStudio } from '../src/store/studioStore';
import { controlConnector } from '../src/services/connectorControl';
import { saveCameraPairing } from '../src/services/peers';

beforeEach(() => {
  jest.useFakeTimers({ now: Date.now() + 1000 });
  jest.clearAllMocks();
  useSettings.setState(useSettings.getInitialState());
  useStudio.setState(useStudio.getInitialState());
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

describe('Bluetooth scene controls', () => {
  it('maps media next/previous keys to scene switching and debounces held keys', () => {
    handleRemoteKey({ keyCode: 87, key: 'MEDIA_NEXT', action: 'down', repeat: 0 });
    expect(switchScene).toHaveBeenCalledWith(1);
    jest.advanceTimersByTime(500);
    handleRemoteKey({ keyCode: 88, key: 'MEDIA_PREVIOUS', action: 'down', repeat: 0 });
    expect(switchScene).toHaveBeenLastCalledWith(-1);
    handleRemoteKey({ keyCode: 87, key: 'MEDIA_NEXT', action: 'down', repeat: 1 });
    expect(switchScene).toHaveBeenCalledTimes(2);
  });

  it('does not execute scene actions while a remote key is being learned', () => {
    handleRemoteKey({ keyCode: 87, key: 'MEDIA_NEXT', action: 'down', repeat: 0, learning: true });
    expect(switchScene).not.toHaveBeenCalled();
  });

  it('registers custom learned key codes and unregisters them on cleanup', () => {
    const stop = bindRemoteKeys();
    useSettings.getState().patch({ remoteKeys: { ...useSettings.getState().remoteKeys, PAGE_UP: 'nextScene' } });
    expect(JSON.parse(jest.mocked(StudioBluetooth.setRemoteKeyBindings).mock.calls.at(-1)![0])).toContain('PAGE_UP');
    stop();
    expect(StudioBluetooth.setRemoteKeyBindings).toHaveBeenLastCalledWith('[]');
  });

  it('keeps local scene facing in sync after a hardware camera flip', async () => {
    jest.advanceTimersByTime(1000);
    handleRemoteKey({ keyCode: 27, key: 'CAMERA', action: 'down', repeat: 0 });
    await Promise.resolve();
    expect(StudioEngine.switchCamera).toHaveBeenCalled();
    expect(useSettings.getState().facing).toBe('front');
    expect(useSettings.getState().scenes[0].camera).toEqual({ kind: 'local', facing: 'front' });
  });
});

describe('linked scene animations', () => {
  it('writes only the paired match overlay and includes the chosen side', async () => {
    useSettings.getState().patch({ pairing: { tenantId: 'tenant_1', slug: 'test', game: 'carrom' } });
    (get as jest.Mock).mockResolvedValueOnce({ val: () => ({ teamB: { id: 'team_b', name: 'Visitors' } }) });
    (get as jest.Mock).mockResolvedValueOnce({ val: () => ({ currentGame: 2, board: { number: 4 } }) });
    await triggerSceneAnimation('carrom:queen', 'B');
    expect(ref).toHaveBeenCalledWith({}, 'tenants/tenant_1/carrom/matches/match_1/overlay');
    expect(set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      activeOverlay: 'queen_covered', activeEvent: expect.objectContaining({ side: 'B', teamId: 'team_b', game: 2, board: 4 }),
    }));
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('rejects unpaired phones and animations for another sport without writing', async () => {
    await expect(triggerSceneAnimation('carrom:queen')).rejects.toThrow('Pair a tournament');
    useSettings.getState().patch({ pairing: { tenantId: 'tenant_1', slug: 'test', game: 'cricket' } });
    await expect(triggerSceneAnimation('carrom:queen')).rejects.toThrow('another sport');
    expect(set).not.toHaveBeenCalled();
  });

  it('does not clear a newer event published by the scorer', async () => {
    useSettings.getState().patch({ pairing: { tenantId: 'tenant_1', slug: 'test', game: 'football' } });
    await triggerSceneAnimation('football:goal');
    const control = jest.mocked(set).mock.calls[0][1] as { lastUpdated: number };
    jest.advanceTimersByTime(6000);
    const updater = jest.mocked(runTransaction).mock.calls[0][1];
    expect(updater({ lastUpdated: control.lastUpdated + 1 })).toBeUndefined();
    expect(updater({ lastUpdated: control.lastUpdated })).toMatchObject({ activeOverlay: 'none' });
  });
});

describe('paired connector controls', () => {
  const camera = { url: 'rtsp://192.168.1.20:8554/', name: 'Wide', control: { port: 8555, token: 'a'.repeat(36) } };
  it('sends only explicit commands through the paired session', async () => {
    await expect(controlConnector(camera, 'zoom', 3)).resolves.toMatchObject({ minZoom: 1, maxZoom: 8, flash: true });
    expect(StudioNetwork.sendConnectorCommand).toHaveBeenCalledWith(camera.url, 8555, camera.control.token, 'zoom', 3);
  });
  it('requires QR pairing before sending camera commands', async () => {
    await expect(controlConnector({ url: camera.url, name: 'Unpaired' }, 'flip')).rejects.toThrow('Scan this connector QR');
    expect(StudioNetwork.sendConnectorCommand).not.toHaveBeenCalled();
  });
  it('replaces an expired session when a connector is paired again', () => {
    saveCameraPairing(camera);
    saveCameraPairing({ ...camera, control: { port: 8555, token: 'b'.repeat(36) } });
    expect(useSettings.getState().manualCameras).toHaveLength(1);
    expect(useSettings.getState().manualCameras[0].control?.token).toBe('b'.repeat(36));
  });
});