// ============================================================================
// CAMERA ROLE — this phone becomes a LAN camera: an RTSP server other phones
// (the studio host) or OBS/VLC can pull from. The URL is announced three ways:
// shown as a QR / copyable link, advertised over mDNS (_njscam._tcp) and
// published to the tournament's liveCam node so web admins can see it.
// ============================================================================

import { StudioEngine, StudioNetwork, StudioSystem, type NetworkAddress } from '../native';
import { buildCameraLink, findStudioVideoPreset } from '../shared/studioProfile';
import { buildEngineConfig, resolveEffectiveVideo, type LocalOverrides } from './effectiveConfig';
import { effectiveMatchId, queueEngineTask, refreshCapabilities, studioContext } from './streamController';
import { requestMediaPermissions } from './permissions';
import { publishSource } from './liveCam';
import { log } from './logger';
import { useSettings } from '../store/settingsStore';
import { isLiveState, useStudio } from '../store/studioStore';
import { defaultStudioProfile } from '../shared/studioProfile';

let publisher: Awaited<ReturnType<typeof publishSource>> | null = null;
let controlSession: { port: number; token: string } | undefined;

/** Prefer Wi-Fi / hotspot / Ethernet addresses: that is where other phones on the venue network are. */
export function pickLanAddress(addresses: NetworkAddress[]): NetworkAddress | null {
  const rank: Record<NetworkAddress['kind'], number> = { wifi: 0, hotspot: 1, ethernet: 2, other: 3, cellular: 9 };
  return [...addresses].filter(address => address.kind !== 'cellular').sort((a, b) => rank[a.kind] - rank[b.kind])[0] ?? null;
}

export function cameraUrl(ip: string, port: number): string {
  return `rtsp://${ip}:${port}/`;
}

export function startCameraServer(): Promise<string> {
  return queueEngineTask(startCameraServerOnce);
}

async function startCameraServerOnce(): Promise<string> {
  const current = useStudio.getState();
  if (current.cameraServerUrl) return current.cameraServerUrl;
  if (isLiveState(current.engineState)) throw new Error('Stop the live stream before starting a LAN camera.');
  const permissions = await requestMediaPermissions();
  if (!permissions.granted) throw new Error('Camera and microphone permissions are required.');
  const settings = useSettings.getState();
  const caps = await refreshCapabilities();
  const profile = useStudio.getState().profile ?? defaultStudioProfile(settings.pairing?.game ?? 'cricket');

  // LAN feeds default to 1080p30 (≈8 Mbps) which several phones can pull at once over normal Wi-Fi.
  const local: LocalOverrides = {
    video: { ...settings.video, presetId: settings.video.presetId ?? '1080p30', codec: 'h264', adaptive: false, record: false },
    audio: settings.audio,
    overlayRender: settings.overlayRender,
    overlayFps: settings.overlayFps,
    facing: settings.facing,
  };
  const effective = resolveEffectiveVideo(profile, local, caps);
  const config = buildEngineConfig(effective, profile, local);
  await StudioEngine.prepare(JSON.stringify(config), 'camera');

  const network = await StudioNetwork.getSnapshot();
  const address = pickLanAddress(network.addresses);
  if (!address) throw new Error('Connect to Wi-Fi (or turn on the hotspot) so other phones can reach this camera.');

  const session = { port: settings.cameraPort === 65535 ? 65534 : settings.cameraPort + 1, token: await StudioSystem.createWorkspaceToken() };
  await StudioEngine.setOverlays('[]');
  const nativeUrl = await StudioEngine.startCameraServer(settings.cameraPort);
  try {
    await StudioNetwork.startConnectorControl(session.port, session.token);
    controlSession = session;
  } catch (error) {
    await StudioEngine.stopCameraServer().catch(() => undefined);
    throw error;
  }
  const url = cameraUrl(address.ip, settings.cameraPort);
  log.info('camera', `serving ${url} (native reported ${nativeUrl})`);

  const info = findStudioVideoPreset(effective.preset.id);
  const attrs = { n: settings.deviceName, w: String(info.width), h: String(info.height), f: String(info.fps), c: effective.codec };
  await StudioNetwork.registerService(settings.deviceName, settings.cameraPort, JSON.stringify(attrs)).catch(error => log.warn('nsd', error));

  const context = studioContext();
  const matchId = effectiveMatchId();
  if (context && matchId) {
    try {
      publisher = await publishSource(
        { tenantId: context.tenantId, game: context.game, matchId },
        { id: settings.deviceId, name: settings.deviceName, lanUrl: url, streamInfo: `${info.width}x${info.height} · ${info.fps} fps · ${effective.codec.toUpperCase()}`, facing: settings.facing === 'front' ? 'user' : 'environment' },
      );
    } catch (error) {
      log.warn('camera', `could not publish to the tournament: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  useStudio.getState().patch({ cameraServerUrl: url, effective, error: null });
  return url;
}

export function stopCameraServer(): Promise<void> {
  return queueEngineTask(async () => {
    await StudioNetwork.stopConnectorControl().catch(() => undefined);
    controlSession = undefined;
    await publisher?.stop().catch(() => undefined);
    publisher = null;
    await StudioNetwork.unregisterService().catch(() => undefined);
    await StudioEngine.stopCameraServer().catch(error => log.warn('camera', error));
    useStudio.getState().patch({ cameraServerUrl: null, cameraClients: 0 });
  });
}

/** Content of the QR code other phones scan to add this camera. */
export function cameraShareLink(): string | null {
  const { cameraServerUrl } = useStudio.getState();
  if (!cameraServerUrl) return null;
  return buildCameraLink({ url: cameraServerUrl, name: useSettings.getState().deviceName, matchId: effectiveMatchId() ?? undefined, control: controlSession });
}
