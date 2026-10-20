import type { StudioCodec, StudioPairing, StudioWidget } from './studioProfile';

export type CameraOrientation = 'auto' | 'portrait' | 'landscape';
export type CameraOverlayRotation = 'auto' | 0 | 90 | 180 | 270;

export function resolveCameraOverlayRotation(
  mode: CameraOverlayRotation, pageWidth: number, pageHeight: number, frameOrientation: Exclude<CameraOrientation, 'auto'>,
): number {
  if (mode !== 'auto') return mode;
  const pagePortrait = pageHeight > pageWidth;
  return pagePortrait === (frameOrientation === 'portrait') ? 0 : 90;
}

export type CameraRecordStatus = 'idle' | 'recording' | 'paused' | 'saving';
export interface CameraRecordingSession {
  status: CameraRecordStatus;
  startedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  path: string | null;
}
export interface CameraRecordingSettings {
  presetId: string;
  codec: StudioCodec;
  orientation: CameraOrientation;
  orientationConfigured: boolean;
  overlays: boolean;
  grid: boolean;
  muted: boolean;
  facing: 'back' | 'front';
  stabilization: boolean;
  workspace: StudioPairing | null;
  widgets: StudioWidget[];
  packageUrl: string;
  captureMode: 'video' | 'raw';
  assetSync?: { files: number; bytes: number; syncedAt: number };
  lastGalleryUri?: string;
  overlayScalePct: number;
  overlayRotation: CameraOverlayRotation;
  overlayOffsetXPct: number;
  overlayOffsetYPct: number;
}
export const DEFAULT_CAMERA_SETTINGS: CameraRecordingSettings = {
  presetId: '1080p30', codec: 'h264', orientation: 'auto', overlays: true, grid: false, muted: false,
  orientationConfigured: true,
  facing: 'back', stabilization: true, workspace: null, widgets: [], packageUrl: '',
  captureMode: 'video',
  overlayScalePct: 60, overlayRotation: 'auto', overlayOffsetXPct: 0, overlayOffsetYPct: 0,
};
export function emptyRecordingSession(): CameraRecordingSession {
  return { status: 'idle', startedAt: 0, pausedAt: null, pausedMs: 0, path: null };
}
export function startRecordingSession(path: string, now = Date.now()): CameraRecordingSession {
  return { status: 'recording', startedAt: now, pausedAt: null, pausedMs: 0, path };
}
export function pauseRecordingSession(session: CameraRecordingSession, now = Date.now()): CameraRecordingSession {
  return session.status === 'recording' ? { ...session, status: 'paused', pausedAt: now } : session;
}
export function resumeRecordingSession(session: CameraRecordingSession, now = Date.now()): CameraRecordingSession {
  return session.status === 'paused' ? { ...session, status: 'recording', pausedMs: session.pausedMs + Math.max(0, now - (session.pausedAt ?? now)), pausedAt: null } : session;
}
export function recordedDurationMs(session: CameraRecordingSession, now = Date.now()): number {
  if (session.status === 'idle') return 0;
  return Math.max(0, (session.pausedAt ?? now) - session.startedAt - session.pausedMs);
}
export function recordingBusy(session: CameraRecordingSession): boolean {
  return session.status !== 'idle';
}