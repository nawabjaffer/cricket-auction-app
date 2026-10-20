// ============================================================================
// PEERS — the studio host discovers LAN cameras (mDNS + QR + tournament list),
// previews them and switches the program (the feed that is encoded and streamed).
// The on-air choice is mirrored to RTDB `liveCam/program`, so the web scorer and
// every phone stay in sync.
// ============================================================================

import { StudioEngine, StudioNetwork, onStudioEvent } from '../native';
import { isValidRtspUrl, type StudioCameraLink, type StudioGameType } from '../shared/studioProfile';
import { effectiveMatchId, studioContext } from './streamController';
import { setProgram, subscribeProgram, subscribeSources } from './liveCam';
import { log } from './logger';
import { useSettings } from '../store/settingsStore';
import { useStudio, type LanCamera, type ProgramSource } from '../store/studioStore';

const lanKey = (service: { host: string; port: number }) => `${service.host}:${service.port}`;

export function saveCameraPairing(camera: StudioCameraLink): void {
  if (!isValidRtspUrl(camera.url)) throw new Error('Invalid camera address.');
  const settings = useSettings.getState();
  settings.patch({ manualCameras: [...settings.manualCameras.filter(item => item.url !== camera.url), {
    url: camera.url, name: camera.name, ...(camera.control ? { control: camera.control } : {}),
  }].slice(-8) });
}

export function startPeerDiscovery(): () => void {
  StudioNetwork.startDiscovery().catch(error => log.warn('nsd', error));
  const unsubscribe = onStudioEvent('studio.lan', event => {
    const current = useStudio.getState().lanCameras;
    const camera: LanCamera = { ...event.service, url: `rtsp://${event.service.host}:${event.service.port}/` };
    if (event.type === 'found') {
      const others = current.filter(item => lanKey(item) !== lanKey(camera) && item.name !== camera.name);
      useStudio.getState().patch({ lanCameras: [...others, camera] });
    } else {
      useStudio.getState().patch({ lanCameras: current.filter(item => item.name !== camera.name) });
    }
  });
  return () => { unsubscribe(); StudioNetwork.stopDiscovery().catch(() => undefined); };
}

/** Switches what the encoder streams. `local` is this phone's own camera. */
export async function selectProgram(source: ProgramSource, remoteId?: string | null): Promise<void> {
  if (source.kind === 'peer' && !isValidRtspUrl(source.url)) throw new Error('That camera link is not a valid RTSP address.');
  if (source.kind === 'local') await StudioEngine.selectLocalSource();
  else await StudioEngine.selectPeerSource(source.url);
  useStudio.getState().patch({ programSource: source });

  const context = studioContext();
  const matchId = effectiveMatchId();
  if (context && matchId) {
    const id = source.kind === 'local' ? useSettings.getState().deviceId : remoteId ?? null;
    await setProgram({ tenantId: context.tenantId, game: context.game, matchId }, id).catch(error => log.warn('program', error));
  }
}

/**
 * Follows the tournament's cameras and on-air selection (changed by the web scorer or another
 * studio phone) while this phone is the studio host.
 */
export function startProgramSync(scope: { tenantId: string; game: StudioGameType; matchId: string }): () => void {
  let applying = false;
  const unsubSources = subscribeSources(scope, sources => useStudio.getState().patch({ remoteSources: sources }));
  const unsubProgram = subscribeProgram(scope, async program => {
    useStudio.getState().patch({ program });
    if (applying || !program.activeSourceId) return;
    const { deviceId } = useSettings.getState();
    const current = useStudio.getState().programSource;
    try {
      applying = true;
      if (program.activeSourceId === deviceId) {
        if (current.kind !== 'local') await selectProgram({ kind: 'local' }, null);
        return;
      }
      const remote = useStudio.getState().remoteSources.find(source => source.id === program.activeSourceId);
      if (remote?.lanUrl && !(current.kind === 'peer' && current.url === remote.lanUrl)) {
        await selectProgram({ kind: 'peer', url: remote.lanUrl, name: remote.name }, remote.id);
      }
    } catch (error) {
      log.warn('program', `could not follow the on-air camera: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      applying = false;
    }
  });
  const unsubSource = onStudioEvent('studio.source', event => {
    if (event.state === 'failed') {
      useStudio.getState().patch({ programSource: { kind: 'local' }, notice: `Camera feed lost${event.reason ? `: ${event.reason}` : ''} — back on this phone's camera.` });
    }
  });
  return () => { unsubSources(); unsubProgram(); unsubSource(); };
}
