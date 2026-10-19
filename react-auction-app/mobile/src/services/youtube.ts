// ============================================================================
// YouTube Live (Data API v3) — creates the broadcast + reusable stream for a
// linked Google account so the operator never has to copy a stream key.
// Auth comes from the native Google Authorization API (no refresh token is
// stored; a fresh access token is requested silently whenever we need one).
// ============================================================================

import { YOUTUBE_SCOPE, YOUTUBE_STREAM_TITLE } from '../config';
import { StudioAuth } from '../native';

const API = 'https://www.googleapis.com/youtube/v3';

export type YouTubePrivacy = 'public' | 'unlisted' | 'private';

export class YouTubeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'YouTubeError';
    this.code = code;
    this.status = status;
  }
}

export interface YouTubeBroadcast {
  broadcastId: string;
  streamId: string;
  /** Ingest address WITHOUT the stream name (RTMPS preferred). */
  ingestUrl: string;
  streamName: string;
  watchUrl: string;
}

const FRIENDLY: Record<string, string> = {
  liveStreamingNotEnabled: 'Live streaming is not enabled on this YouTube channel. Enable it in YouTube Studio (activation can take up to 24 hours).',
  insufficientPermissions: 'YouTube did not grant live-streaming access. Link the account again and accept all permissions.',
  quotaExceeded: 'The YouTube API quota for this app is exhausted for today. Paste a stream key manually instead.',
  channelNotFound: 'This Google account has no YouTube channel.',
  invalidScheduledStartTime: 'YouTube rejected the start time; check the phone clock is set automatically.',
};

type Fetch = typeof fetch;

async function call<T>(
  token: string, method: 'GET' | 'POST', path: string, query: Record<string, string>, body?: unknown, fetchImpl: Fetch = fetch,
): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(query).toString()}`;
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  if (!response.ok) {
    const error = (json as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null)?.error;
    const reason = error?.errors?.[0]?.reason ?? (response.status === 401 ? 'unauthorized' : 'unknown');
    const message = response.status === 401
      ? 'The YouTube session expired. Link your account again.'
      : FRIENDLY[reason] ?? error?.message ?? `YouTube request failed (${response.status})`;
    throw new YouTubeError(message, reason, response.status);
  }
  return json as T;
}

/** Prompts for consent the first time; afterwards returns a fresh token without UI. */
export async function authorizeYouTube(): Promise<string> {
  const { accessToken, grantedScopes } = await StudioAuth.authorizeGoogle([YOUTUBE_SCOPE]);
  if (!grantedScopes.includes(YOUTUBE_SCOPE)) {
    throw new YouTubeError(FRIENDLY.insufficientPermissions, 'insufficientPermissions', 403);
  }
  return accessToken;
}

interface LiveStreamResource {
  id: string;
  snippet?: { title?: string };
  cdn?: { ingestionType?: string; ingestionInfo?: { ingestionAddress?: string; rtmpsIngestionAddress?: string; streamName?: string } };
  contentDetails?: { isReusable?: boolean };
}

/** One reusable stream per channel keeps the stream key stable across events and reconnects. */
export async function ensureReusableStream(token: string, fetchImpl: Fetch = fetch): Promise<LiveStreamResource> {
  const existing = await call<{ items?: LiveStreamResource[] }>(
    token, 'GET', '/liveStreams', { part: 'id,snippet,cdn,contentDetails', mine: 'true', maxResults: '50' }, undefined, fetchImpl,
  );
  const reusable = existing.items?.find(item => item.snippet?.title === YOUTUBE_STREAM_TITLE && item.cdn?.ingestionType === 'rtmp');
  if (reusable) return reusable;
  return call<LiveStreamResource>(
    token, 'POST', '/liveStreams', { part: 'id,snippet,cdn,contentDetails' },
    {
      snippet: { title: YOUTUBE_STREAM_TITLE },
      cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
      contentDetails: { isReusable: true },
    },
    fetchImpl,
  );
}

export interface CreateBroadcastInput {
  title: string;
  description?: string;
  privacy: YouTubePrivacy;
  /** Low latency suits live scoring; "normal" is more tolerant of weak uplinks. */
  latency?: 'normal' | 'low' | 'ultraLow';
}

export async function createBroadcast(token: string, input: CreateBroadcastInput, fetchImpl: Fetch = fetch): Promise<YouTubeBroadcast> {
  const stream = await ensureReusableStream(token, fetchImpl);
  const info = stream.cdn?.ingestionInfo;
  const ingestUrl = info?.rtmpsIngestionAddress ?? info?.ingestionAddress;
  if (!ingestUrl || !info?.streamName) throw new YouTubeError('YouTube did not return an ingest address.', 'noIngest', 502);

  const broadcast = await call<{ id: string }>(
    token, 'POST', '/liveBroadcasts', { part: 'snippet,contentDetails,status' },
    {
      snippet: {
        title: input.title.slice(0, 100),
        description: (input.description ?? '').slice(0, 4000),
        scheduledStartTime: new Date(Date.now() + 10_000).toISOString(),
      },
      status: { privacyStatus: input.privacy, selfDeclaredMadeForKids: false },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        enableDvr: true,
        recordFromStart: true,
        enableEmbed: true,
        latencyPreference: input.latency ?? 'low',
      },
    },
    fetchImpl,
  );

  await call(token, 'POST', '/liveBroadcasts/bind', { part: 'id,contentDetails', id: broadcast.id, streamId: stream.id }, undefined, fetchImpl);

  return {
    broadcastId: broadcast.id,
    streamId: stream.id,
    ingestUrl,
    streamName: info.streamName,
    watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`,
  };
}

export interface BroadcastStatus { lifeCycleStatus: string; streamStatus?: string; health?: string }

export async function getBroadcastStatus(
  token: string, broadcastId: string, streamId: string, fetchImpl: Fetch = fetch,
): Promise<BroadcastStatus> {
  const [broadcasts, streams] = await Promise.all([
    call<{ items?: Array<{ status?: { lifeCycleStatus?: string } }> }>(token, 'GET', '/liveBroadcasts', { part: 'status', id: broadcastId }, undefined, fetchImpl),
    call<{ items?: Array<{ status?: { streamStatus?: string; healthStatus?: { status?: string } } }> }>(token, 'GET', '/liveStreams', { part: 'status', id: streamId }, undefined, fetchImpl),
  ]);
  return {
    lifeCycleStatus: broadcasts.items?.[0]?.status?.lifeCycleStatus ?? 'unknown',
    streamStatus: streams.items?.[0]?.status?.streamStatus,
    health: streams.items?.[0]?.status?.healthStatus?.status,
  };
}

/** `live` is only needed when auto-start did not fire; `complete` ends the event and publishes the recording. */
export async function transitionBroadcast(
  token: string, broadcastId: string, status: 'live' | 'complete', fetchImpl: Fetch = fetch,
): Promise<void> {
  await call(token, 'POST', '/liveBroadcasts/transition', { part: 'status', id: broadcastId, broadcastStatus: status }, undefined, fetchImpl);
}
