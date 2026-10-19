jest.mock('../src/native', () => ({
  StudioAuth: { authorizeGoogle: jest.fn(), clearGoogleToken: jest.fn() },
}));

import { StudioAuth } from '../src/native';
import {
  YouTubeError, authorizeYouTube, createBroadcast, ensureReusableStream, getBroadcastStatus, transitionBroadcast,
} from '../src/services/youtube';

type Call = { url: string; method: string; body?: unknown };

function fakeFetch(handlers: Array<(call: Call) => { status?: number; body: unknown } | null>) {
  const calls: Call[] = [];
  const impl = jest.fn(async (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const call: Call = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    for (const handler of handlers) {
      const result = handler(call);
      if (result) {
        const status = result.status ?? 200;
        return { ok: status < 400, status, text: async () => JSON.stringify(result.body) } as unknown as Response;
      }
    }
    throw new Error(`unexpected request ${call.method} ${call.url}`);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const streamResource = {
  id: 'st1',
  snippet: { title: 'NJS Live Studio' },
  cdn: { ingestionType: 'rtmp', ingestionInfo: { ingestionAddress: 'rtmp://a.rtmp.youtube.com/live2', rtmpsIngestionAddress: 'rtmps://a.rtmps.youtube.com:443/live2', streamName: 'key-1234' } },
};

describe('authorizeYouTube', () => {
  it('returns the access token when the scope was granted', async () => {
    (StudioAuth.authorizeGoogle as jest.Mock).mockResolvedValueOnce({ accessToken: 'tok', grantedScopes: ['https://www.googleapis.com/auth/youtube'] });
    await expect(authorizeYouTube()).resolves.toBe('tok');
  });

  it('refuses a token that lacks the live-streaming scope', async () => {
    (StudioAuth.authorizeGoogle as jest.Mock).mockResolvedValueOnce({ accessToken: 'tok', grantedScopes: ['email'] });
    await expect(authorizeYouTube()).rejects.toMatchObject({ code: 'insufficientPermissions' });
  });
});

describe('createBroadcast', () => {
  it('reuses the channel stream, creates a broadcast and binds them', async () => {
    const { impl, calls } = fakeFetch([
      call => (call.url.includes('/liveStreams?') && call.method === 'GET' ? { body: { items: [streamResource] } } : null),
      call => (call.url.includes('/liveBroadcasts?') && call.method === 'POST' ? { body: { id: 'bc1' } } : null),
      call => (call.url.includes('/liveBroadcasts/bind') ? { body: {} } : null),
    ]);
    const result = await createBroadcast('tok', { title: 'Lions vs Tigers', privacy: 'unlisted' }, impl);
    expect(result).toMatchObject({
      broadcastId: 'bc1', streamId: 'st1', streamName: 'key-1234',
      ingestUrl: 'rtmps://a.rtmps.youtube.com:443/live2', watchUrl: 'https://www.youtube.com/watch?v=bc1',
    });
    const insert = calls.find(call => call.method === 'POST' && call.url.includes('/liveBroadcasts?'));
    expect(insert?.body).toMatchObject({
      snippet: { title: 'Lions vs Tigers' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true, latencyPreference: 'low' },
    });
    const bind = calls.find(call => call.url.includes('/liveBroadcasts/bind'));
    expect(bind?.url).toContain('id=bc1');
    expect(bind?.url).toContain('streamId=st1');
  });

  it('creates the reusable stream the first time', async () => {
    const { impl, calls } = fakeFetch([
      call => (call.url.includes('/liveStreams?') && call.method === 'GET' ? { body: { items: [] } } : null),
      call => (call.url.includes('/liveStreams?') && call.method === 'POST' ? { body: streamResource } : null),
    ]);
    const stream = await ensureReusableStream('tok', impl);
    expect(stream.id).toBe('st1');
    expect(calls[1].body).toMatchObject({ contentDetails: { isReusable: true }, cdn: { ingestionType: 'rtmp' } });
  });

  it('truncates long titles to the YouTube limit', async () => {
    const { impl, calls } = fakeFetch([
      call => (call.url.includes('/liveStreams?') ? { body: { items: [streamResource] } } : null),
      call => (call.url.includes('/liveBroadcasts?') ? { body: { id: 'bc2' } } : null),
      call => (call.url.includes('/bind') ? { body: {} } : null),
    ]);
    await createBroadcast('tok', { title: 'x'.repeat(300), privacy: 'public' }, impl);
    const insert = calls.find(call => call.method === 'POST' && call.url.includes('/liveBroadcasts?'));
    expect((insert?.body as { snippet: { title: string } }).snippet.title).toHaveLength(100);
  });

  it('maps API failures to actionable messages', async () => {
    const notEnabled = fakeFetch([() => ({ status: 403, body: { error: { message: 'x', errors: [{ reason: 'liveStreamingNotEnabled' }] } } })]);
    await expect(createBroadcast('tok', { title: 't', privacy: 'public' }, notEnabled.impl)).rejects.toThrow(/not enabled on this YouTube channel/);

    const expired = fakeFetch([() => ({ status: 401, body: { error: { message: 'Invalid Credentials' } } })]);
    const error = await createBroadcast('tok', { title: 't', privacy: 'public' }, expired.impl).catch(cause => cause);
    expect(error).toBeInstanceOf(YouTubeError);
    expect(error.message).toMatch(/Link your account again/);

    const quota = fakeFetch([() => ({ status: 403, body: { error: { errors: [{ reason: 'quotaExceeded' }] } } })]);
    await expect(createBroadcast('tok', { title: 't', privacy: 'public' }, quota.impl)).rejects.toThrow(/quota/);
  });

  it('fails clearly when YouTube returns no ingest address', async () => {
    const { impl } = fakeFetch([call => (call.url.includes('/liveStreams?') ? { body: { items: [{ ...streamResource, cdn: { ingestionType: 'rtmp', ingestionInfo: {} } }] } } : null)]);
    await expect(createBroadcast('tok', { title: 't', privacy: 'public' }, impl)).rejects.toMatchObject({ code: 'noIngest' });
  });
});

describe('status + transitions', () => {
  it('reads lifecycle and stream health together', async () => {
    const { impl } = fakeFetch([
      call => (call.url.includes('/liveBroadcasts?') ? { body: { items: [{ status: { lifeCycleStatus: 'live' } }] } } : null),
      call => (call.url.includes('/liveStreams?') ? { body: { items: [{ status: { streamStatus: 'active', healthStatus: { status: 'good' } } }] } } : null),
    ]);
    await expect(getBroadcastStatus('tok', 'bc1', 'st1', impl)).resolves.toEqual({ lifeCycleStatus: 'live', streamStatus: 'active', health: 'good' });
  });

  it('completes a broadcast', async () => {
    const { impl, calls } = fakeFetch([call => (call.url.includes('/liveBroadcasts/transition') ? { body: {} } : null)]);
    await transitionBroadcast('tok', 'bc1', 'complete', impl);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('broadcastStatus=complete');
    expect(calls[0].url).toContain('id=bc1');
  });
});
