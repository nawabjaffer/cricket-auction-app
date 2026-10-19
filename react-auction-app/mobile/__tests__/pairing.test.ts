jest.mock('../src/native', () => ({
  StudioEngine: {
    getCapabilities: jest.fn(async () => 'null'),
    prepare: jest.fn(),
    release: jest.fn(async () => undefined),
    setOverlays: jest.fn(async () => undefined),
    startCameraServer: jest.fn(async () => 'rtsp://192.168.1.20:8554/'),
    stopCameraServer: jest.fn(async () => undefined),
    setOverlayOptions: jest.fn(async () => undefined),
    switchCamera: jest.fn(async () => undefined),
  },
  StudioNetwork: {
    getSnapshot: jest.fn(async () => ({ addresses: [{ iface: 'wlan0', ip: '192.168.1.20', kind: 'wifi' }] })),
    registerService: jest.fn(async () => undefined),
    unregisterService: jest.fn(async () => undefined),
  },
  StudioSecure: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(), clear: jest.fn() },
}));
jest.mock('../src/services/tournament', () => ({ resolveTenant: jest.fn() }));
jest.mock('../src/services/streamController', () => ({ ...jest.requireActual('../src/services/streamController'), effectiveMatchId: jest.fn(), queueEngineTask: jest.fn(), refreshCapabilities: jest.fn(), studioContext: jest.fn() }));
jest.mock('../src/services/peers', () => ({ selectProgram: jest.fn(async () => undefined) }));
jest.mock('../src/services/liveCam', () => ({ publishSource: jest.fn() }));
jest.mock('../src/services/permissions', () => ({ requestMediaPermissions: jest.fn() }));

import { cameraUrl, pickLanAddress, startCameraServer, stopCameraServer } from '../src/services/cameraRole';
import { StudioEngine } from '../src/native';
import { PairingError, applyPairing, classifyLink, validatePairing } from '../src/services/deepLink';
import { requestMediaPermissions } from '../src/services/permissions';
import { queueEngineTask, refreshCapabilities } from '../src/services/streamController';
import { resolveTenant } from '../src/services/tournament';
import { useSettings } from '../src/store/settingsStore';
import { useStudio } from '../src/store/studioStore';
import { activateScene, switchScene } from '../src/services/scenes';
import { selectProgram } from '../src/services/peers';
import { createScene } from '../src/shared/scenes';

describe('scene switching', () => {
  const actual = jest.requireActual<typeof import('../src/services/streamController')>('../src/services/streamController');

  beforeEach(() => {
    useSettings.setState(useSettings.getInitialState());
    useStudio.setState(useStudio.getInitialState());
    jest.mocked(queueEngineTask).mockImplementation(actual.queueEngineTask);
    jest.mocked(requestMediaPermissions).mockResolvedValue({ granted: true, denied: [], blocked: false });
    jest.mocked(StudioEngine.prepare).mockImplementation(async (_config, mode) => { useStudio.getState().patch({ engineState: 'preview', engineMode: mode }); });
    jest.mocked(StudioEngine.switchCamera).mockReset().mockResolvedValue(undefined);
    jest.mocked(StudioEngine.setOverlays).mockReset().mockResolvedValue(undefined);
    jest.mocked(selectProgram).mockReset().mockImplementation(async source => { useStudio.getState().patch({ programSource: source }); });
  });

  it('switches rear/front scenes without rebuilding the encoder', async () => {
    await activateScene('second');
    expect(StudioEngine.switchCamera).toHaveBeenCalledTimes(1);
    expect(useSettings.getState()).toMatchObject({ activeSceneId: 'second', facing: 'front' });
    const prepared = jest.mocked(StudioEngine.prepare).mock.calls.length;
    await activateScene('main');
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(prepared);
    expect(useSettings.getState()).toMatchObject({ activeSceneId: 'main', facing: 'back' });
  });

  it('switches a scene to a LAN source', async () => {
    const scene = createScene('Wide', { kind: 'peer', url: 'rtsp://192.168.1.20:8554/', name: 'Wide camera', remoteId: 'wide' });
    useSettings.getState().patch({ scenes: [...useSettings.getState().scenes, scene] });
    await activateScene(scene.id);
    expect(selectProgram).toHaveBeenCalledWith({ kind: 'peer', url: scene.camera.kind === 'peer' ? scene.camera.url : '', name: 'Wide camera' }, 'wide');
    expect(useSettings.getState().activeSceneId).toBe(scene.id);
  });

  it('serializes next/previous operations and keeps the queue usable after failure', async () => {
    await expect(activateScene('missing')).rejects.toThrow('no longer exists');
    await Promise.all([switchScene(1), switchScene(1)]);
    expect(useSettings.getState().activeSceneId).toBe('main');
  });

  it('restores the previous scene if overlay application fails', async () => {
    await actual.prepareStudio();
    jest.mocked(StudioEngine.setOverlays).mockRejectedValueOnce(new Error('Overlay unavailable'));
    await expect(activateScene('second')).rejects.toThrow('Overlay unavailable');
    expect(useSettings.getState()).toMatchObject({ activeSceneId: 'main', facing: 'back' });
  });

  it('does not interrupt a phone serving a LAN camera', async () => {
    useStudio.getState().patch({ cameraServerUrl: 'rtsp://192.168.1.20:8554/' });
    await expect(activateScene('second')).rejects.toThrow('Stop the LAN camera');
  });
});

describe('studio preparation', () => {
  const actual = jest.requireActual<typeof import('../src/services/streamController')>('../src/services/streamController');
  const { prepareStudio, releaseEngine } = actual;

  beforeEach(() => {
    useSettings.setState(useSettings.getInitialState());
    useStudio.setState(useStudio.getInitialState());
    jest.mocked(requestMediaPermissions).mockReset().mockResolvedValue({ granted: true, denied: [], blocked: false });
    jest.mocked(StudioEngine.prepare).mockReset().mockImplementation(async (_config, mode) => {
      useStudio.getState().patch({ engineState: 'prepared', engineMode: mode });
    });
    jest.mocked(StudioEngine.release).mockClear();
    jest.mocked(StudioEngine.startCameraServer).mockClear();
    jest.mocked(queueEngineTask).mockImplementation(actual.queueEngineTask);
    jest.mocked(refreshCapabilities).mockResolvedValue(null);
  });

  it('does not prepare the native camera twice for concurrent identical requests', async () => {
    await expect(Promise.all([prepareStudio(), prepareStudio()])).resolves.toEqual([true, true]);
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(1);
  });

  it('applies a settings change queued while the first preparation is pending', async () => {
    let started!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const pending = new Promise<void>(resolve => { finish = resolve; });
    jest.mocked(StudioEngine.prepare).mockImplementationOnce(async () => {
      started();
      await pending;
      useStudio.getState().patch({ engineState: 'prepared', engineMode: 'studio' });
    });
    const first = prepareStudio();
    await entered;
    useSettings.getState().patch({ video: { ...useSettings.getState().video, presetId: '720p30' } });
    const second = prepareStudio();
    finish();
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(2);
    expect(JSON.parse(jest.mocked(StudioEngine.prepare).mock.calls[1][0]).video.width).toBe(1280);
  });

  it('allows another preparation after a native failure', async () => {
    jest.mocked(StudioEngine.prepare).mockRejectedValueOnce(new Error('Camera unavailable'));
    await expect(prepareStudio()).resolves.toBe(false);
    await expect(prepareStudio()).resolves.toBe(true);
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(2);
    expect(useStudio.getState().error).toBeNull();
  });

  it('releases after pending preparation when leaving the studio', async () => {
    const prepared = prepareStudio();
    const released = releaseEngine();
    await Promise.all([prepared, released]);
    expect(StudioEngine.release).toHaveBeenCalledTimes(1);
    expect(jest.mocked(StudioEngine.prepare).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(StudioEngine.release).mock.invocationCallOrder[0]);
    expect(useStudio.getState()).toMatchObject({ engineState: 'idle', engineMode: 'none', preparedSignature: null });
  });

  it('can prepare again after a queued release', async () => {
    await Promise.all([prepareStudio(), releaseEngine(), prepareStudio()]);
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(2);
    expect(useStudio.getState()).toMatchObject({ engineState: 'prepared', engineMode: 'studio' });
  });

  it('reports a failed permission request without rejecting or poisoning the queue', async () => {
    jest.mocked(requestMediaPermissions).mockRejectedValueOnce(new Error('Activity unavailable'));
    await expect(prepareStudio()).resolves.toBe(false);
    expect(StudioEngine.prepare).not.toHaveBeenCalled();
    expect(useStudio.getState().error).toContain('Activity unavailable');
    await expect(prepareStudio()).resolves.toBe(true);
  });

  it('reports unsupported hardware without calling native prepare or keeping a stale quality', async () => {
    useStudio.getState().patch({ capabilities: {
      device: { model: 'Unsupported', manufacturer: 'Test', sdk: 34, abis: ['arm64-v8a'] },
      cameras: [], encoders: { h264: null, h265: null },
    } });
    await expect(prepareStudio()).resolves.toBe(false);
    expect(StudioEngine.prepare).not.toHaveBeenCalled();
    expect(useStudio.getState().error).toContain('No compatible video quality');
    expect(useStudio.getState().effective).toBeNull();
  });

  it('does not stop a LAN camera when late studio cleanup runs', async () => {
    await startCameraServer();
    await releaseEngine();
    expect(StudioEngine.release).not.toHaveBeenCalled();
    expect(useStudio.getState().cameraServerUrl).toBe('rtsp://192.168.1.20:8554/');
    await stopCameraServer();
  });

  it('starts a LAN camera only once for concurrent requests', async () => {
    await expect(Promise.all([startCameraServer(), startCameraServer()])).resolves.toEqual([
      'rtsp://192.168.1.20:8554/', 'rtsp://192.168.1.20:8554/',
    ]);
    expect(StudioEngine.startCameraServer).toHaveBeenCalledTimes(1);
    expect(StudioEngine.prepare).toHaveBeenCalledTimes(1);
    await stopCameraServer();
  });

  it('does not release a stream that became live before cleanup ran', async () => {
    useStudio.getState().patch({ engineState: 'live', engineMode: 'studio' });
    await releaseEngine();
    expect(StudioEngine.release).not.toHaveBeenCalled();
    await expect(startCameraServer()).rejects.toThrow('Stop the live stream');
    expect(StudioEngine.startCameraServer).not.toHaveBeenCalled();
  });
});

describe('studio match context', () => {
  const { studioContext } = jest.requireActual<typeof import('../src/services/streamController')>('../src/services/streamController');

  beforeEach(() => {
    useSettings.getState().patch({ pairing: { tenantId: 't_1', slug: 'pkl', game: 'carrom' } });
    useStudio.getState().patch({ activeMatchId: 'active_match' });
  });

  afterEach(() => {
    useSettings.getState().patch({ pairing: null });
    useStudio.getState().patch({ activeMatchId: null });
  });

  it('pins overlays to the active match when no match is selected', () => {
    expect(studioContext()).toMatchObject({ tenantId: 't_1', game: 'carrom', matchId: 'active_match' });
    useStudio.getState().patch({ activeMatchId: 'next_match' });
    expect(studioContext()?.matchId).toBe('next_match');
  });

  it('keeps an explicitly selected match pinned', () => {
    useSettings.getState().patch({ pairing: { tenantId: 't_1', slug: 'pkl', game: 'carrom', matchId: 'pinned_match' } });
    expect(studioContext()?.matchId).toBe('pinned_match');
  });

  it('does not create a tenant context for an unpaired device', () => {
    useSettings.getState().patch({ pairing: null });
    expect(studioContext()).toBeNull();
  });
});

describe('LAN camera address', () => {
  it('prefers Wi-Fi over hotspot and Ethernet, and never uses mobile data', () => {
    expect(pickLanAddress([
      { iface: 'rmnet0', ip: '100.64.1.2', kind: 'cellular' },
      { iface: 'ap0', ip: '192.168.43.1', kind: 'hotspot' },
      { iface: 'wlan0', ip: '192.168.1.20', kind: 'wifi' },
    ])?.ip).toBe('192.168.1.20');
    expect(pickLanAddress([
      { iface: 'eth0', ip: '10.0.0.8', kind: 'ethernet' },
      { iface: 'ap0', ip: '192.168.43.1', kind: 'hotspot' },
    ])?.ip).toBe('192.168.43.1');
    expect(pickLanAddress([{ iface: 'rmnet0', ip: '100.64.1.2', kind: 'cellular' }])).toBeNull();
    expect(pickLanAddress([])).toBeNull();
  });

  it('formats the pull URL', () => {
    expect(cameraUrl('192.168.1.20', 8554)).toBe('rtsp://192.168.1.20:8554/');
  });
});

describe('classifyLink', () => {
  it('routes pairing and camera links', () => {
    expect(classifyLink('njslive://pair?o=https%3A%2F%2Fapp.example.com&t=pkl_2026&s=pkl-2026&g=cricket'))
      .toEqual({ kind: 'pair', pairing: { origin: 'https://app.example.com', tenantId: 'pkl_2026', slug: 'pkl-2026', game: 'cricket', matchId: undefined } });
    expect(classifyLink('njslive://camera?u=rtsp%3A%2F%2F192.168.1.20%3A8554%2F&n=Cam%202'))
      .toEqual({ kind: 'camera', camera: { url: 'rtsp://192.168.1.20:8554/', name: 'Cam 2', matchId: undefined } });
    expect(classifyLink('rtsp://192.168.1.9:554/live').kind).toBe('camera');
    expect(classifyLink('https://e-auction-store.web.app/pkl/carrom/scorer/mobile-app?pair=1')).toMatchObject({ kind: 'pair', pairing: { slug: 'pkl', game: 'carrom', tenantId: '' } });
  });

  it('ignores anything else, including scripts and unknown schemes', () => {
    expect(classifyLink('https://evil.example.com').kind).toBe('unknown');
    expect(classifyLink('njslive://pair?o=javascript:alert(1)&t=x&g=cricket').kind).toBe('unknown');
    expect(classifyLink('njslive://camera?u=http%3A%2F%2Fexample.com').kind).toBe('unknown');
    expect(classifyLink('njslive://pair?o=https://a.example.com&t=x&g=golf').kind).toBe('unknown');
  });
});

describe('applyPairing', () => {
  const tenant = { id: 't_1', slug: 'pkl', name: 'PKL', isActive: true, sports: ['cricket', 'carrom'] };
  const pairing = { origin: 'https://app.example.com/some/path', tenantId: '', slug: 'pkl', game: 'carrom' as const };
  beforeEach(() => { (resolveTenant as jest.Mock).mockReset(); });

  it('resolves the tenant by slug, stores the pairing and normalises the origin', async () => {
    (resolveTenant as jest.Mock).mockResolvedValue(tenant);
    await expect(applyPairing(pairing)).resolves.toBe(tenant);
    expect(resolveTenant).toHaveBeenCalledWith('pkl');
    expect(useSettings.getState().pairing).toEqual({ tenantId: 't_1', slug: 'pkl', game: 'carrom', matchId: undefined });
    expect(useSettings.getState().origin).toBe('https://app.example.com');
  });

  it('validates a separate scoring workspace without changing the stream pairing', async () => {
    const existing = { tenantId: 'stream_tenant', slug: 'stream-league', game: 'cricket' as const };
    useSettings.getState().patch({ pairing: existing });
    (resolveTenant as jest.Mock).mockResolvedValue(tenant);
    await expect(validatePairing(pairing)).resolves.toMatchObject({ tenant, pairing: { origin: 'https://app.example.com', slug: 'pkl' } });
    expect(useSettings.getState().pairing).toEqual(existing);
  });

  it('refuses unknown, deactivated and sport-less tournaments', async () => {
    (resolveTenant as jest.Mock).mockResolvedValueOnce(null);
    await expect(applyPairing(pairing)).rejects.toThrow(/not found/);
    (resolveTenant as jest.Mock).mockResolvedValueOnce({ ...tenant, isActive: false });
    await expect(applyPairing(pairing)).rejects.toThrow(/deactivated/);
    (resolveTenant as jest.Mock).mockResolvedValueOnce({ ...tenant, sports: ['cricket'] });
    await expect(applyPairing(pairing)).rejects.toBeInstanceOf(PairingError);
  });

  it('rejects a non-http origin before any network call', async () => {
    await expect(applyPairing({ ...pairing, origin: 'file:///etc/passwd' })).rejects.toThrow(/invalid server address/);
    expect(resolveTenant).not.toHaveBeenCalled();
  });
});
