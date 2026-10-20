jest.mock('../src/native', () => ({
  StudioSecure: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(), clear: jest.fn() },
}));

import { DEFAULT_REMOTE_KEYS, defaultSettings, mergeDestinations, newLocalDestination, useSettings, type LocalDestination } from '../src/store/settingsStore';
import { redactEndpoint } from '../src/services/logger';
import { StudioSecure } from '../src/native';
import { storage } from '../src/services/storage';
import { adjacentSceneId, createScene, defaultScenes, MAX_STUDIO_SCENES, normalizeScenes, SCENE_ANIMATION_PRESETS, sceneMatchPath } from '../src/shared/scenes';

const local = (patch: Partial<LocalDestination>): LocalDestination => ({ ...newLocalDestination('youtube'), ...patch });

describe('encrypted settings storage', () => {
  beforeEach(() => {
    jest.mocked(StudioSecure.getItem).mockReset().mockResolvedValue(null);
    jest.mocked(StudioSecure.setItem).mockClear();
  });

  it('encrypts settings including credential-bearing server URLs', async () => {
    const settings = { customUrl: 'srt://relay:9000?passphrase=test-secret' };
    await storage.setJson('settings', settings);
    expect(StudioSecure.setItem).toHaveBeenCalledWith('settings', JSON.stringify(settings), true);
  });

  it('reads encrypted settings without looking for a plain copy', async () => {
    jest.mocked(StudioSecure.getItem).mockResolvedValueOnce('{"deviceName":"Camera"}');
    await expect(storage.getJson('settings', {})).resolves.toEqual({ deviceName: 'Camera' });
    expect(StudioSecure.getItem).toHaveBeenCalledTimes(1);
    expect(StudioSecure.getItem).toHaveBeenCalledWith('settings', true);
  });

  it('migrates legacy plain settings to encrypted storage', async () => {
    const legacy = '{"customUrl":"rtmp://relay/live/test-key"}';
    jest.mocked(StudioSecure.getItem).mockResolvedValueOnce(null).mockResolvedValueOnce(legacy);
    await expect(storage.getJson('settings', {})).resolves.toEqual(JSON.parse(legacy));
    expect(StudioSecure.getItem).toHaveBeenNthCalledWith(2, 'settings', false);
    expect(StudioSecure.setItem).toHaveBeenCalledWith('settings', legacy, true);
  });

  it('preserves defaults when no settings exist', async () => {
    await expect(storage.getJson('settings', { deviceName: 'Phone' })).resolves.toEqual({ deviceName: 'Phone' });
    expect(StudioSecure.setItem).not.toHaveBeenCalled();
  });
});

describe('mergeDestinations', () => {
  it('adds profile destinations as enabled, API-mode YouTube', () => {
    const merged = mergeDestinations([], [{ id: 'yt', platform: 'youtube', label: 'Main channel', enabled: true }]);
    expect(merged).toEqual([expect.objectContaining({ id: 'yt', fromProfile: true, youtubeMode: 'api', youtubePrivacy: 'unlisted', enabled: true })]);
  });

  it('keeps local keys, URLs and the operator\'s own destinations', () => {
    const mine = local({ id: 'mine', fromProfile: false, platform: 'rtmp', customUrl: 'rtmp://relay/live' });
    const existing = local({ id: 'yt', fromProfile: true, youtubeMode: 'manual', enabled: true });
    const merged = mergeDestinations([mine, existing], [{ id: 'yt', platform: 'youtube', label: 'Renamed', enabled: false }]);
    expect(merged.find(item => item.id === 'mine')?.customUrl).toBe('rtmp://relay/live');
    expect(merged.find(item => item.id === 'yt')).toMatchObject({ label: 'Renamed', enabled: false, youtubeMode: 'manual' });
  });

  it('never touches the operator\'s own destinations', () => {
    const own = local({ id: 'own', fromProfile: false, enabled: false });
    expect(mergeDestinations([own], [])).toEqual([expect.objectContaining({ id: 'own', enabled: false })]);
  });

  it('drops profile destinations the admin removed but never local ones', () => {
    const merged = mergeDestinations(
      [local({ id: 'gone', fromProfile: true }), local({ id: 'mine', fromProfile: false })],
      [],
    );
    expect(merged.map(item => item.id)).toEqual(['mine']);
  });
});

describe('settings defaults', () => {
  it('starts un-paired with safe defaults', () => {
    const settings = defaultSettings();
    expect(settings.pairing).toBeNull();
    expect(settings.origin).toMatch(/^https:\/\//);
    expect(settings.overlayRender).toBe('software');
    expect(settings.cameraPort).toBe(8554);
    expect(settings.overlayFraming).toMatchObject({ scalePct: 45, rotation: 'auto', offsetXPct: 0, offsetYPct: 0 });
    expect(settings.remoteKeys).toEqual(DEFAULT_REMOTE_KEYS);
    expect(settings.remoteKeys).not.toBe(DEFAULT_REMOTE_KEYS);
    expect(settings.deviceId).toMatch(/^dev_/);
  });

  it('creates unique ids and preset labels for new destinations', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newLocalDestination('rtmp').id));
    expect(ids.size).toBeGreaterThan(15);
    expect(newLocalDestination('twitch').label).toBe('Twitch');
  });
});

describe('scene settings', () => {
  it('migrates older settings to two local camera scenes', () => {
    const scenes = normalizeScenes(undefined, 'front');
    expect(scenes.map(scene => scene.camera)).toEqual([{ kind: 'local', facing: 'front' }, { kind: 'local', facing: 'back' }]);
    expect(defaultSettings().activeSceneId).toBe('main');
    expect(defaultSettings().scenes).toHaveLength(2);
  });

  it('keeps scene-specific camera and overlay choices', () => {
    const scene = createScene('Wide', { kind: 'peer', url: 'rtsp://192.168.1.20:8554/', name: 'Wide camera' });
    scene.profileOverlays = false;
    scene.animations = ['carrom:queen', 'carrom:queen', 'javascript:alert(1)'];
    const normalized = normalizeScenes([scene]);
    expect(normalized[0].camera).toEqual(scene.camera);
    expect(normalized[0].profileOverlays).toBe(false);
    expect(normalized[0].animations).toEqual(['carrom:queen']);
  });

  it('sanitizes invalid sources, duplicate IDs and empty names', () => {
    const scenes = normalizeScenes([
      { id: 'same', name: '  ', camera: { kind: 'peer', url: 'javascript:alert(1)' } },
      { id: 'same', name: 'Rear', camera: { kind: 'local', facing: 'back' } },
    ]);
    expect(scenes[0].camera).toEqual({ kind: 'local', facing: 'back' });
    expect(scenes[0].name).toBe('Scene');
    expect(new Set(scenes.map(scene => scene.id)).size).toBe(2);
    expect(normalizeScenes(Array.from({ length: 30 }, () => createScene('Camera')))).toHaveLength(MAX_STUDIO_SCENES);
  });

  it('cycles scenes in both directions and recovers a missing selection', () => {
    const scenes = defaultScenes();
    expect(adjacentSceneId(scenes, 'main', 1)).toBe('second');
    expect(adjacentSceneId(scenes, 'main', -1)).toBe('second');
    expect(adjacentSceneId(scenes, 'second', 1)).toBe('main');
    expect(adjacentSceneId(scenes, 'missing', 1)).toBe('main');
    expect(adjacentSceneId([], null, 1)).toBeNull();
  });

  it('links animation presets to tenant-scoped match overlay paths', () => {
    expect(sceneMatchPath('tenant_1', 'cricket', 'match_1', 'overlay')).toBe('tenants/tenant_1/scoring/matches/match_1/overlay');
    expect(sceneMatchPath('tenant_2', 'carrom', 'match_2', 'overlay')).toBe('tenants/tenant_2/carrom/matches/match_2/overlay');
    expect(() => sceneMatchPath('../other', 'carrom', 'match_1', 'live')).toThrow('Invalid tournament');
    expect(SCENE_ANIMATION_PRESETS.find(item => item.id === 'cricket:four')?.type).toBe('boundary_four');
    expect(SCENE_ANIMATION_PRESETS.find(item => item.id === 'carrom:queen')?.type).toBe('queen_covered');
  });

  it('upgrades encrypted v1.0 settings without losing pairing or custom key bindings', async () => {
    useSettings.setState(useSettings.getInitialState());
    jest.mocked(StudioSecure.getItem).mockReset().mockResolvedValueOnce(JSON.stringify({
      deviceName: 'Original phone', facing: 'front',
      pairing: { tenantId: 'tenant_1', slug: 'league', game: 'carrom' },
      remoteKeys: { MEDIA_NEXT: 'none', PAGE_UP: 'toggleRecord' },
    }));
    await useSettings.getState().hydrate();
    const settings = useSettings.getState();
    expect(settings).toMatchObject({ hydrated: true, deviceName: 'Original phone', facing: 'front', activeSceneId: 'main', previewFill: true });
    expect(settings.pairing?.tenantId).toBe('tenant_1');
    expect(settings.scenes[0].camera).toEqual({ kind: 'local', facing: 'front' });
    expect(settings.remoteKeys).toMatchObject({ MEDIA_NEXT: 'none', MEDIA_PREVIOUS: 'previousScene', PAGE_UP: 'toggleRecord' });
    useSettings.setState(useSettings.getInitialState());
  });

  it('migrates the old default portrait setting to auto and preserves an explicit orientation choice', async () => {
    useSettings.setState(useSettings.getInitialState());
    jest.mocked(StudioSecure.getItem).mockReset().mockResolvedValueOnce(JSON.stringify({ camera: { orientation: 'portrait' } }));
    await useSettings.getState().hydrate();
    expect(useSettings.getState().camera).toMatchObject({ orientation: 'auto', orientationConfigured: true });
    jest.mocked(StudioSecure.getItem).mockResolvedValueOnce(JSON.stringify({ camera: { orientation: 'portrait', orientationConfigured: true } }));
    await useSettings.getState().hydrate();
    expect(useSettings.getState().camera).toMatchObject({ orientation: 'portrait', orientationConfigured: true });
    useSettings.setState(useSettings.getInitialState());
  });

  it('persists scoring selection independently and ignores malformed workspace data', async () => {
    useSettings.setState(useSettings.getInitialState());
    const pairing = { tenantId: 'stream_tenant', slug: 'streaming-league', game: 'cricket' };
    const scoringWorkspace = { origin: 'https://app.example.com', tenantId: 'score_tenant', slug: 'scoring-league', game: 'carrom' };
    jest.mocked(StudioSecure.getItem).mockReset().mockResolvedValueOnce(JSON.stringify({ pairing, scoringWorkspace }));
    await useSettings.getState().hydrate();
    expect(useSettings.getState().pairing).toEqual(pairing);
    expect(useSettings.getState().scoringWorkspace).toEqual(scoringWorkspace);
    jest.mocked(StudioSecure.getItem).mockResolvedValueOnce(JSON.stringify({ pairing, scoringWorkspace: { ...scoringWorkspace, origin: 'javascript:alert(1)' } }));
    await useSettings.getState().hydrate();
    expect(useSettings.getState().scoringWorkspace).toBeNull();
    expect(useSettings.getState().pairing).toEqual(pairing);
    useSettings.setState(useSettings.getInitialState());
  });
});

describe('redactEndpoint', () => {
  it('hides stream keys, SRT stream ids and passphrases', () => {
    expect(redactEndpoint('rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh-ijkl')).toBe('rtmps://a.rtmps.youtube.com:443/live2/••••');
    expect(redactEndpoint('rtmp://live.twitch.tv/app/live_123_secret')).toBe('rtmp://live.twitch.tv/app/••••');
    expect(redactEndpoint('srt://h.example.com:9000?streamid=abc&passphrase=hunter2hunter2')).toBe('srt://h.example.com:9000?streamid=••••&passphrase=••••');
  });
});
