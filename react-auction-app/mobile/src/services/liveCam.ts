// Multi-camera signalling shared with the web multi-camera host (services/camera/multiCamService.ts):
//   {liveCam}/sources/{id}   presence of each camera (this app adds transport 'rtsp' + lanUrl)
//   {liveCam}/program        { activeSourceId, updatedAt } — the angle that is on air
import { off, onDisconnect, onValue, ref, remove, set } from 'firebase/database';
import { getDb } from './firebase';
import { isValidRtspUrl, STUDIO_HEARTBEAT_MS, studioLiveCamPath, type StudioGameType } from '../shared/studioProfile';

export const SOURCE_STALE_MS = STUDIO_HEARTBEAT_MS * 3;

export interface RemoteCameraSource {
  id: string;
  name: string;
  facing?: 'environment' | 'user';
  joinedAt: number;
  lastSeen: number;
  transport?: 'webrtc' | 'rtsp';
  lanUrl?: string;
  streamInfo?: string;
  platform?: 'web' | 'android';
}

export interface ProgramState { activeSourceId: string | null; updatedAt: number }

interface Scope { tenantId: string; game: StudioGameType; matchId: string }

const path = (scope: Scope) => studioLiveCamPath(scope.tenantId, scope.game, scope.matchId);

/** Announces this phone as an RTSP camera and keeps the record fresh until `stop()` or disconnect. */
export async function publishSource(
  scope: Scope,
  source: { id: string; name: string; lanUrl: string; streamInfo: string; facing: 'environment' | 'user' },
): Promise<{ update: (patch: Partial<Pick<RemoteCameraSource, 'lanUrl' | 'streamInfo'>>) => void; stop: () => Promise<void> }> {
  const node = ref(getDb(), `${path(scope)}/sources/${source.id}`);
  const joinedAt = Date.now();
  let record: RemoteCameraSource = {
    id: source.id, name: source.name, facing: source.facing, joinedAt, lastSeen: joinedAt,
    transport: 'rtsp', lanUrl: source.lanUrl, streamInfo: source.streamInfo, platform: 'android',
  };
  await set(node, record);
  await onDisconnect(node).remove();
  const timer = setInterval(() => { set(node, { ...record, lastSeen: Date.now() }).catch(() => undefined); }, STUDIO_HEARTBEAT_MS);
  return {
    update: patch => { record = { ...record, ...patch }; },
    stop: async () => {
      clearInterval(timer);
      try { await onDisconnect(node).cancel(); } catch { /* ignore */ }
      await remove(node).catch(() => undefined);
    },
  };
}

export function subscribeSources(scope: Scope, onSources: (sources: RemoteCameraSource[]) => void): () => void {
  const node = ref(getDb(), `${path(scope)}/sources`);
  const handler = onValue(node, snapshot => {
    if (!snapshot.exists()) { onSources([]); return; }
    const now = Date.now();
    const list = Object.values(snapshot.val() as Record<string, RemoteCameraSource>)
      .filter((source): source is RemoteCameraSource => !!source?.id && now - (source.lastSeen || 0) < SOURCE_STALE_MS)
      .map(source => ({ ...source, lanUrl: isValidRtspUrl(source.lanUrl) ? source.lanUrl : undefined }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    onSources(list);
  });
  return () => off(node, 'value', handler);
}

export function subscribeProgram(scope: Scope, onProgram: (state: ProgramState) => void): () => void {
  const node = ref(getDb(), `${path(scope)}/program`);
  const handler = onValue(node, snapshot => {
    const value = snapshot.exists() ? (snapshot.val() as ProgramState) : null;
    onProgram(value ?? { activeSourceId: null, updatedAt: 0 });
  });
  return () => off(node, 'value', handler);
}

export async function setProgram(scope: Scope, sourceId: string | null): Promise<void> {
  await set(ref(getDb(), `${path(scope)}/program`), { activeSourceId: sourceId, updatedAt: Date.now() });
}
