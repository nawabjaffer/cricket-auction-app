const mockSecretStore: Record<string, string> = {};

jest.mock('../src/native', () => ({
  StudioSecure: {
    getItem: jest.fn(async (key: string) => mockSecretStore[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockSecretStore[key] = value; }),
    removeItem: jest.fn(async (key: string) => { delete mockSecretStore[key]; }),
    clear: jest.fn(),
  },
  StudioAuth: { authorizeGoogle: jest.fn(), clearGoogleToken: jest.fn() },
}));

jest.mock('../src/services/youtube', () => ({
  authorizeYouTube: jest.fn(async () => 'token-1'),
  createBroadcast: jest.fn(async () => ({
    broadcastId: 'bc1', streamId: 'st1', ingestUrl: 'rtmps://a.rtmps.youtube.com:443/live2', streamName: 'abcd-efgh-ijkl', watchUrl: 'https://www.youtube.com/watch?v=bc1',
  })),
}));

import {
  DestinationError, destinationReadiness, joinKey, resolveDestination, validateCustomUrl, validateStreamKey,
} from '../src/services/destinations';
import { createBroadcast } from '../src/services/youtube';
import { keyName, secrets } from '../src/services/storage';
import { newLocalDestination, type LocalDestination } from '../src/store/settingsStore';

const context = { title: 'Lions vs Tigers · PKL LIVE', description: 'desc' };

const destination = (platform: LocalDestination['platform'], patch: Partial<LocalDestination> = {}): LocalDestination => ({
  ...newLocalDestination(platform), id: `${platform}_t`, ...patch,
});

beforeEach(() => { for (const key of Object.keys(mockSecretStore)) delete mockSecretStore[key]; jest.clearAllMocks(); });

describe('validation', () => {
  it('accepts RTMP(S) and SRT urls and rejects the rest', () => {
    expect(validateCustomUrl('rtmp', 'rtmp://live.example.com/app')).toBeNull();
    expect(validateCustomUrl('rtmp', 'rtmps://live.example.com:443/app')).toBeNull();
    expect(validateCustomUrl('rtmp', 'http://live.example.com/app')).not.toBeNull();
    expect(validateCustomUrl('rtmp', '')).not.toBeNull();
    expect(validateCustomUrl('srt', 'srt://ingest.example.com:9000?streamid=abc')).toBeNull();
    expect(validateCustomUrl('srt', 'srt://ingest.example.com')).not.toBeNull();
  });

  it('rejects keys with whitespace or control characters', () => {
    expect(validateStreamKey('live_123_abcdefgh')).toBeNull();
    expect(validateStreamKey('has space')).not.toBeNull();
    expect(validateStreamKey('ab')).not.toBeNull();
    expect(validateStreamKey('bad\nkey')).not.toBeNull();
  });

  it('joins base and key with exactly one slash', () => {
    expect(joinKey('rtmp://host/app/', ' key ')).toBe('rtmp://host/app/key');
    expect(joinKey('rtmp://host/app', 'key')).toBe('rtmp://host/app/key');
  });
});

describe('resolveDestination', () => {
  it('builds preset endpoints from the secure key without exposing it elsewhere', async () => {
    await secrets.set(keyName.streamKey('twitch_t'), 'live_123_abcdefgh');
    const resolved = await resolveDestination(destination('twitch'), context);
    expect(resolved).toMatchObject({ id: 'twitch_t', protocol: 'rtmp', url: 'rtmp://live.twitch.tv/app/live_123_abcdefgh' });
  });

  it('uses RTMPS for Facebook', async () => {
    await secrets.set(keyName.streamKey('facebook_t'), 'FB-123-0-AbCdEf');
    expect((await resolveDestination(destination('facebook'), context)).url).toBe('rtmps://live-api-s.facebook.com:443/rtmp/FB-123-0-AbCdEf');
  });

  it('explains what is missing instead of failing silently', async () => {
    await expect(resolveDestination(destination('twitch'), context)).rejects.toThrow(/Twitch: add its stream key first/);
    await expect(resolveDestination(destination('rtmp'), context)).rejects.toBeInstanceOf(DestinationError);
    await expect(resolveDestination(destination('srt', { customUrl: 'nope' }), context)).rejects.toThrow(/SRT URLs look like/);
  });

  it('supports custom RTMP with and without a separate key', async () => {
    const custom = destination('rtmp', { customUrl: 'rtmp://relay.example.com/live' });
    expect((await resolveDestination(custom, context)).url).toBe('rtmp://relay.example.com/live');
    await secrets.set(keyName.streamKey('rtmp_t'), 'abcd1234');
    expect((await resolveDestination(custom, context)).url).toBe('rtmp://relay.example.com/live/abcd1234');
  });

  it('passes SRT urls through untouched', async () => {
    const srt = destination('srt', { customUrl: 'srt://ingest.example.com:9000?streamid=abc&passphrase=secretsecret' });
    expect(await resolveDestination(srt, context)).toMatchObject({ protocol: 'srt', url: srt.customUrl });
  });

  it('creates a YouTube broadcast in api mode and keeps the watch url', async () => {
    const resolved = await resolveDestination(destination('youtube', { youtubeMode: 'api', youtubePrivacy: 'public' }), context);
    expect(resolved.url).toBe('rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh-ijkl');
    expect(resolved.broadcast?.watchUrl).toContain('bc1');
    expect(createBroadcast).toHaveBeenCalledWith('token-1', expect.objectContaining({ title: context.title, privacy: 'public' }));
  });

  it('falls back to a manual YouTube key', async () => {
    await secrets.set(keyName.streamKey('youtube_t'), 'abcd-efgh-ijkl-mnop');
    const resolved = await resolveDestination(destination('youtube', { youtubeMode: 'manual' }), context);
    expect(resolved.url).toBe('rtmps://a.rtmps.youtube.com:443/live2/abcd-efgh-ijkl-mnop');
    expect(createBroadcast).not.toHaveBeenCalled();
  });

  it('wraps YouTube API failures with the destination name', async () => {
    (createBroadcast as jest.Mock).mockRejectedValueOnce(new Error('Live streaming is not enabled on this YouTube channel.'));
    await expect(resolveDestination(destination('youtube'), context)).rejects.toThrow(/YouTube Live: Live streaming is not enabled/);
  });
});

describe('destinationReadiness', () => {
  it('reflects the key / url / account state', async () => {
    expect((await destinationReadiness(destination('twitch'), false)).ready).toBe(false);
    await secrets.set(keyName.streamKey('twitch_t'), 'live_123_abcdefgh');
    expect((await destinationReadiness(destination('twitch'), false)).ready).toBe(true);
    expect((await destinationReadiness(destination('youtube'), false)).ready).toBe(false);
    expect((await destinationReadiness(destination('youtube'), true)).ready).toBe(true);
    expect((await destinationReadiness(destination('srt', { customUrl: 'srt://h.example.com:9000' }), false)).ready).toBe(true);
    expect((await destinationReadiness(destination('rtmp'), false)).ready).toBe(false);
  });
});
