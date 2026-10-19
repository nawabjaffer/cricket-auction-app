// Turns a configured destination into the endpoint handed to the native encoder.
// Stream keys are read from the encrypted store at the last moment and only ever
// live in memory and in the native socket — they are never logged or synced.
import {
  STUDIO_PLATFORM_PRESETS, STUDIO_VIDEO_PRESETS,
} from '../shared/studioProfile';
import type { LocalDestination } from '../store/settingsStore';
import { keyName, secrets } from './storage';
import {
  authorizeYouTube, createBroadcast, type YouTubeBroadcast, type YouTubePrivacy,
} from './youtube';

export class DestinationError extends Error {
  readonly destinationId: string;

  constructor(destinationId: string, message: string) {
    super(message);
    this.name = 'DestinationError';
    this.destinationId = destinationId;
  }
}

export interface ResolvedDestination {
  id: string;
  label: string;
  protocol: 'rtmp' | 'srt';
  /** Full endpoint including the key. Treat as secret. */
  url: string;
  broadcast?: YouTubeBroadcast;
}

const RTMP_URL = /^rtmps?:\/\/[^\s/]+(?::\d{2,5})?(?:\/[^\s]*)?$/i;
const SRT_URL = /^srt:\/\/[^\s/]+:\d{2,5}(?:\?[^\s]*)?$/i;
const KEY_PATTERN = /^[^\s\u0000-\u001f]{4,512}$/;

export function validateCustomUrl(platform: LocalDestination['platform'], url: string | undefined): string | null {
  const value = (url ?? '').trim();
  if (!value) return 'Enter the server URL.';
  if (platform === 'srt') return SRT_URL.test(value) ? null : 'SRT URLs look like srt://host:port?streamid=…';
  return RTMP_URL.test(value) ? null : 'RTMP URLs look like rtmp://host/app or rtmps://host:443/app';
}

export function validateStreamKey(key: string): string | null {
  return KEY_PATTERN.test(key.trim()) ? null : 'The stream key looks invalid (no spaces, at least 4 characters).';
}

export function joinKey(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key.trim()}`;
}

export interface ResolveContext {
  title: string;
  description: string;
  /** Provide when any destination uses the YouTube API so one consent flow serves all. */
  youtubeToken?: () => Promise<string>;
}

export async function resolveDestination(destination: LocalDestination, context: ResolveContext): Promise<ResolvedDestination> {
  const preset = STUDIO_PLATFORM_PRESETS[destination.platform];
  const fail = (message: string) => new DestinationError(destination.id, `${destination.label}: ${message}`);

  if (destination.platform === 'youtube' && (destination.youtubeMode ?? 'api') === 'api') {
    try {
      const token = await (context.youtubeToken ?? authorizeYouTube)();
      const privacy: YouTubePrivacy = destination.youtubePrivacy ?? 'unlisted';
      const broadcast = await createBroadcast(token, { title: context.title, description: context.description, privacy });
      return { id: destination.id, label: destination.label, protocol: 'rtmp', url: joinKey(broadcast.ingestUrl, broadcast.streamName), broadcast };
    } catch (error) {
      throw fail(error instanceof Error ? error.message : 'could not create the YouTube broadcast');
    }
  }

  if (preset.protocol === 'srt') {
    const problem = validateCustomUrl('srt', destination.customUrl);
    if (problem) throw fail(problem);
    return { id: destination.id, label: destination.label, protocol: 'srt', url: (destination.customUrl ?? '').trim() };
  }

  const key = (await secrets.get(keyName.streamKey(destination.id)))?.trim() ?? '';
  let base = preset.ingestUrl;
  if (preset.customUrl) {
    const problem = validateCustomUrl(destination.platform, destination.customUrl);
    if (problem) throw fail(problem);
    base = (destination.customUrl ?? '').trim();
    // Some providers hand out the full URL with the key already included.
    if (!key) return { id: destination.id, label: destination.label, protocol: 'rtmp', url: base };
  }
  if (!key) throw fail('add its stream key first.');
  const problem = validateStreamKey(key);
  if (problem) throw fail(problem);
  return { id: destination.id, label: destination.label, protocol: 'rtmp', url: joinKey(base, key) };
}

/** Human summary of what the operator still has to do before this destination can go live. */
export async function destinationReadiness(destination: LocalDestination, googleLinked: boolean): Promise<{ ready: boolean; note: string }> {
  if (destination.platform === 'youtube' && (destination.youtubeMode ?? 'api') === 'api') {
    return googleLinked ? { ready: true, note: 'Google account linked' } : { ready: false, note: 'Link your Google account' };
  }
  if (STUDIO_PLATFORM_PRESETS[destination.platform].protocol === 'srt') {
    return validateCustomUrl('srt', destination.customUrl) ? { ready: false, note: 'Add the SRT URL' } : { ready: true, note: 'SRT URL saved' };
  }
  const hasKey = await secrets.has(keyName.streamKey(destination.id));
  if (STUDIO_PLATFORM_PRESETS[destination.platform].customUrl) {
    if (validateCustomUrl(destination.platform, destination.customUrl)) return { ready: false, note: 'Add the server URL' };
    return { ready: true, note: hasKey ? 'URL and key saved' : 'URL saved' };
  }
  return hasKey ? { ready: true, note: 'Stream key saved' } : { ready: false, note: 'Add the stream key' };
}

/** Upload needed (kbit/s) for all enabled destinations at the chosen preset — shown in the pre-flight sheet. */
export function presetBitrateHint(presetId: string): string {
  const preset = STUDIO_VIDEO_PRESETS.find(item => item.id === presetId);
  return preset ? `${(preset.bitrateKbps / 1000).toFixed(preset.bitrateKbps % 1000 ? 1 : 0)} Mbps` : '';
}
