import { StudioEngine, StudioSystem } from '../native';
import { useCamera } from '../store/cameraStore';
import { useSettings } from '../store/settingsStore';
import { useNav } from '../store/navStore';
import { isLiveState, useStudio } from '../store/studioStore';
import { emptyRecordingSession, pauseRecordingSession, recordingBusy, resumeRecordingSession, startRecordingSession } from '../shared/cameraRecording';
import { applyOverlayFraming } from '../shared/overlayFraming';
import { defaultStudioProfile, type StudioPairing } from '../shared/studioProfile';
import { buildEngineConfig, buildOverlaySpecs, resolveEffectiveVideo, type LocalOverrides } from './effectiveConfig';
import { queueEngineTask, refreshCapabilities } from './streamController';
import { requestGalleryPermission, requestMediaPermissions } from './permissions';
import { subscribeActiveMatch, subscribeProfile } from './tournament';

export function cameraOccupied(): boolean {
  return recordingBusy(useCamera.getState().session) || useCamera.getState().busy;
}

export async function applyCameraOverlays(): Promise<void> {
  if (useNav.getState().workspace !== 'recording' || !useCamera.getState().ready) return;
  const { camera } = useSettings.getState();
  const { profile, activeMatchId } = useCamera.getState();
  const workspace = camera.workspace;
  const matchId = workspace?.matchId ?? activeMatchId ?? undefined;
  const context = workspace ? { ...workspace, matchId } : { origin: useSettings.getState().origin, tenantId: '', slug: '', game: 'cricket' as const };
  const widgets = [...(workspace && matchId ? (profile ?? defaultStudioProfile(workspace.game)).widgets : []), ...camera.widgets];
  const frameOrientation = useCamera.getState().effective?.orientation ?? (camera.orientation === 'auto' ? useCamera.getState().screenOrientation : camera.orientation);
  const specs = camera.overlays ? applyOverlayFraming(buildOverlaySpecs(widgets, {}, context), {
    scalePct: camera.overlayScalePct,
    rotation: camera.overlayRotation,
    offsetXPct: camera.overlayOffsetXPct,
    offsetYPct: camera.overlayOffsetYPct,
  }, frameOrientation) : [];
  await StudioEngine.setOverlayOptions(20, false);
  await StudioEngine.setOverlays(JSON.stringify(specs));
}

export function startCameraSync(workspace: StudioPairing | null): () => void {
  const camera = useCamera.getState();
  camera.patch({ profile: null, activeMatchId: null });
  if (!workspace) return () => undefined;
  let stopped = false;
  const refresh = () => { if (!stopped) void applyCameraOverlays().catch(error => camera.patch({ error: String(error) })); };
  const stopProfile = subscribeProfile(workspace.tenantId, workspace.game, profile => {
    if (!stopped) { camera.patch({ profile }); refresh(); }
  }, error => { if (!stopped) camera.patch({ error: `Overlay sync: ${error.message}` }); });
  const stopMatch = subscribeActiveMatch(workspace.tenantId, workspace.game, activeMatchId => {
    if (!stopped) { camera.patch({ activeMatchId }); refresh(); }
  });
  return () => { stopped = true; stopProfile(); stopMatch(); };
}

export function prepareCamera(displayOrientation = useCamera.getState().screenOrientation): Promise<boolean> {
  return queueEngineTask(async () => {
    const state = useCamera.getState();
    if (recordingBusy(state.session)) return state.ready;
    const studio = useStudio.getState();
    if (isLiveState(studio.engineState) || studio.cameraServerUrl || studio.stats?.recording) {
      state.patch({ ready: false, error: 'Stop Streaming or the Connector before opening Camera.' });
      return false;
    }
    state.patch({ busy: true, error: null });
    try {
      const permission = await requestMediaPermissions();
      if (!permission.granted) throw new Error('Allow camera and microphone access in Android settings.');
      const capabilities = await refreshCapabilities();
      const { camera } = useSettings.getState();
      const profile = defaultStudioProfile(camera.workspace?.game ?? 'cricket');
      const local: LocalOverrides = {
        video: { presetId: camera.presetId, codec: camera.codec, orientation: camera.orientation === 'auto' ? displayOrientation : camera.orientation, stabilization: camera.stabilization, adaptive: false, record: true, bitrateKbps: null },
        audio: { bitrateKbps: 192, stereo: true, echo: false, noise: false },
        overlayRender: 'software', overlayFps: 20, facing: camera.facing,
      };
      const effective = resolveEffectiveVideo(profile, local, capabilities);
      const config = { ...buildEngineConfig(effective, profile, local), autoOrientation: camera.orientation === 'auto' };
      const signature = `camera:${JSON.stringify(config)}`;
      if (useStudio.getState().preparedSignature !== signature) {
        state.patch({ ready: false });
        await StudioEngine.prepare(JSON.stringify(config), 'studio');
        useStudio.getState().patch({ preparedSignature: signature });
      }
      await StudioEngine.setPreviewFill(false);
      await StudioEngine.setMuted(camera.muted);
      const [zoomRange, exposureRange] = await Promise.all([StudioEngine.getZoomRange(), StudioEngine.getExposureRange()]);
      state.patch({ ready: true, effective, preparedSignature: signature, zoomRange, exposureRange, notice: effective.downgradeReason ?? null, lastGalleryUri: state.lastGalleryUri ?? camera.lastGalleryUri ?? null });
      await StudioSystem.setKeepScreenOn(true);
      await applyCameraOverlays();
      const pending = await StudioEngine.getPendingCameraMedia();
      if (pending.length && useCamera.getState().session.status === 'idle') {
        state.patch({ session: { ...emptyRecordingSession(), status: 'saving', path: pending[0] }, notice: 'Recovered camera file' });
      }
      return true;
    } catch (error) {
      state.patch({ ready: false, error: error instanceof Error ? error.message : String(error) });
      return false;
    } finally { state.patch({ busy: false }); }
  });
}

export function releaseCamera(): Promise<void> {
  return queueEngineTask(async () => {
    if (cameraOccupied() || useNav.getState().workspace === 'recording') return;
    const studio = useStudio.getState();
    if (isLiveState(studio.engineState) || studio.cameraServerUrl || !studio.preparedSignature?.startsWith('camera:')) return;
    await StudioEngine.release();
    await StudioSystem.setKeepScreenOn(false);
    useCamera.getState().patch({ ready: false, preparedSignature: null });
    useStudio.getState().patch({ preparedSignature: null });
  });
}

export function startCameraRecording(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (cameraOccupied()) return;
    if (!camera.ready) throw new Error('The camera is not ready.');
    camera.patch({ busy: true, error: null });
    try {
      if (!(await requestGalleryPermission())) throw new Error('Allow storage access to save recordings to Gallery.');
      const freeMb = await StudioSystem.getFreeStorageMb();
      if (freeMb < 500) throw new Error('Free at least 500 MB of storage before recording.');
      const path = await StudioEngine.startRecording('Camera');
      camera.patch({ session: startRecordingSession(path), notice: null });
    } finally { camera.patch({ busy: false }); }
  });
}

export function pauseOrResumeCamera(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (camera.session.status === 'recording') {
      await StudioEngine.pauseRecording();
      camera.patch({ session: pauseRecordingSession(camera.session) });
    } else if (camera.session.status === 'paused') {
      await StudioEngine.resumeRecording();
      camera.patch({ session: resumeRecordingSession(camera.session) });
    }
  });
}

export function stopCameraRecording(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (camera.session.status === 'idle') return;
    if (camera.session.status !== 'saving') {
      const path = await StudioEngine.finishCameraRecording();
      camera.patch({ session: { ...camera.session, status: 'saving', path, pausedAt: camera.session.pausedAt ?? Date.now() } });
    }
    const path = useCamera.getState().session.path;
    if (!path) throw new Error('No recording is available to save.');
    camera.patch({ busy: true, error: null });
    try {
      const lastGalleryUri = await StudioEngine.saveRecordingToGallery(path);
      useSettings.getState().patch({ camera: { ...useSettings.getState().camera, lastGalleryUri } });
      camera.patch({ session: emptyRecordingSession(), lastGalleryUri, notice: 'Saved to Gallery' });
    } finally { camera.patch({ busy: false }); }
  });
}

export function takeCameraRaw(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (cameraOccupied() || !camera.ready) return;
    camera.patch({ busy: true, error: null });
    try {
      if (!(await requestGalleryPermission())) throw new Error('Allow storage access to save RAW photos.');
      if (await StudioSystem.getFreeStorageMb() < 500) throw new Error('Free at least 500 MB before capturing RAW.');
      const path = await StudioEngine.captureRawStill();
      camera.patch({ session: { ...emptyRecordingSession(), status: 'saving', path } });
      const lastGalleryUri = await StudioEngine.saveRecordingToGallery(path);
      useSettings.getState().patch({ camera: { ...useSettings.getState().camera, lastGalleryUri } });
      camera.patch({ session: emptyRecordingSession(), lastGalleryUri, notice: 'RAW photo saved to Gallery' });
      await applyCameraOverlays();
    } finally { camera.patch({ busy: false }); }
  });
}

export function discardPendingCameraMedia(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (camera.busy || camera.session.status !== 'saving' || !camera.session.path) return;
    camera.patch({ busy: true });
    try {
      await StudioEngine.discardCameraMedia(camera.session.path);
      camera.patch({ session: emptyRecordingSession(), error: null, notice: null });
    } finally { camera.patch({ busy: false }); }
  });
}

export function syncCameraAssets(): Promise<void> {
  return queueEngineTask(async () => {
    const camera = useCamera.getState();
    if (cameraOccupied()) throw new Error('Stop and save the recording before syncing assets.');
    camera.patch({ busy: true, error: null });
    try {
      const settings = useSettings.getState();
      const urls = new Set([
        settings.camera.workspace ? `${settings.camera.workspace.origin}/camera-overlay-manifest.json` : '',
        settings.camera.packageUrl.trim(),
      ].filter(Boolean));
      if (!urls.size) throw new Error('Select a tournament or enter an asset manifest URL first.');
      let files = 0;
      let bytes = 0;
      for (const url of urls) {
        const result = JSON.parse(await StudioEngine.syncOverlayAssets(url)) as { files: number; bytes: number };
        files += result.files;
        bytes += result.bytes;
      }
      settings.patch({ camera: { ...useSettings.getState().camera, assetSync: { files, bytes, syncedAt: Date.now() } } });
      camera.patch({ notice: 'Offline assets synced' });
      await StudioEngine.reloadOverlays();
    } finally { camera.patch({ busy: false }); }
  });
}