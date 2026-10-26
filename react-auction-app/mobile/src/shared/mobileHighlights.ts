import { isSafeStudioId } from './studioProfile';

export interface MobileHighlightOptions {
  enabled: boolean;
  seconds: number;
  upload: boolean;
  maxClipsPerMatch: number;
}

export const DEFAULT_MOBILE_HIGHLIGHTS: MobileHighlightOptions = {
  enabled: false, seconds: 12, upload: false, maxClipsPerMatch: 40,
};

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(maximum, Math.max(minimum, value))) : fallback;
}

export function normalizeMobileHighlights(raw: unknown): MobileHighlightOptions {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    enabled: value.enabled === true,
    seconds: bounded(value.seconds, DEFAULT_MOBILE_HIGHLIGHTS.seconds, 5, 60),
    upload: value.upload === true,
    maxClipsPerMatch: bounded(value.maxClipsPerMatch, DEFAULT_MOBILE_HIGHLIGHTS.maxClipsPerMatch, 1, 100),
  };
}

export function mobileHighlightOptionsPath(tenantId: string): string {
  if (!isSafeStudioId(tenantId)) throw new Error('Invalid tournament.');
  return `tenants/${tenantId}/mobileStudio/cricket/highlightOptions`;
}

export function mobileHighlightsPath(tenantId: string, matchId: string): string {
  if (!isSafeStudioId(tenantId) || !isSafeStudioId(matchId)) throw new Error('Invalid tournament or match.');
  return `tenants/${tenantId}/scoring/matches/${matchId}/mobileHighlights`;
}

export interface MobileHighlight {
  id: string;
  matchId: string;
  deviceId: string;
  boundary: 4 | 6;
  createdAt: number;
  durationMs: number;
  bytes: number;
  storagePath: string;
  url: string;
  status?: 'uploading' | 'ready';
}

export function highlightStoragePath(tenantId: string, matchId: string, deviceId: string, id: string): string {
  if (![tenantId, matchId, deviceId, id].every(isSafeStudioId)) throw new Error('Invalid highlight path.');
  return `tenants/${tenantId}/highlights/${matchId}/${deviceId}/${id}.mp4`;
}

export interface BoundaryReplayTrigger { id: string; boundary: 4 | 6; timestamp: number }

export function parseBoundaryReplayTrigger(raw: unknown, recordingStartedAt: number, now: number): BoundaryReplayTrigger | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!isSafeStudioId(value.id) || (value.type !== 'four' && value.type !== 'six') || typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return null;
  if (value.timestamp < recordingStartedAt || value.timestamp > now + 2000 || now - value.timestamp > 10_000) return null;
  return { id: value.id, boundary: value.type === 'six' ? 6 : 4, timestamp: value.timestamp };
}