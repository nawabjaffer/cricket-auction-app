jest.mock('../src/native', () => ({
  StudioSecure: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(), clear: jest.fn() },
}));

import { DEFAULT_REMOTE_KEYS, defaultSettings, mergeDestinations, newLocalDestination, type LocalDestination } from '../src/store/settingsStore';
import { redactEndpoint } from '../src/services/logger';
import { StudioSecure } from '../src/native';
import { storage } from '../src/services/storage';

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

describe('redactEndpoint', () => {
  it('hides stream keys, SRT stream ids and passphrases', () => {
    expect(redactEndpoint('rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh-ijkl')).toBe('rtmps://a.rtmps.youtube.com:443/live2/••••');
    expect(redactEndpoint('rtmp://live.twitch.tv/app/live_123_secret')).toBe('rtmp://live.twitch.tv/app/••••');
    expect(redactEndpoint('srt://h.example.com:9000?streamid=abc&passphrase=hunter2hunter2')).toBe('srt://h.example.com:9000?streamid=••••&passphrase=••••');
  });
});
