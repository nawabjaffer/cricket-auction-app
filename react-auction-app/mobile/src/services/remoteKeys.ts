// Maps Bluetooth / HID remote key presses (clickers, gamepads, headset buttons) to studio actions.
import { StudioBluetooth, StudioEngine, onStudioEvent, type RemoteKeyEvent } from '../native';
import { endLive, goLive, applyOverlays, syncPreparedSignature, UserFacingError } from './streamController';
import { log } from './logger';
import { useSettings, type RemoteAction } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { switchScene } from './scenes';

const DEBOUNCE_MS = 400;
let lastRun = 0;

async function run(action: RemoteAction): Promise<void> {
  const studio = useStudio.getState();
  const stats = studio.stats;
  switch (action) {
    case 'toggleLive':
      if (studio.engineState === 'live' || studio.engineState === 'connecting' || studio.engineState === 'reconnecting') await endLive();
      else await goLive();
      break;
    case 'toggleMute':
      await StudioEngine.setMuted(!(stats?.muted ?? false));
      break;
    case 'switchCamera':
      if (studio.programSource.kind === 'peer') throw new UserFacingError('Select a local camera scene before flipping the camera.');
      await StudioEngine.switchCamera();
      {
        const settings = useSettings.getState();
        const facing = settings.facing === 'back' ? 'front' : 'back';
        settings.patch({ facing, scenes: settings.scenes.map(scene => scene.id === settings.activeSceneId ? { ...scene, camera: { kind: 'local', facing } } : scene) });
        syncPreparedSignature();
      }
      break;
    case 'nextScene':
      await switchScene(1);
      break;
    case 'previousScene':
      await switchScene(-1);
      break;
    case 'toggleOverlays': {
      const { overlaysEnabled, patch } = useSettings.getState();
      patch({ overlaysEnabled: !overlaysEnabled });
      await applyOverlays();
      break;
    }
    case 'toggleTorch':
      await StudioEngine.setTorch(!(stats?.torch ?? false));
      break;
    case 'toggleRecord':
      if (stats?.recording) await StudioEngine.stopRecording();
      else await StudioEngine.startRecording('remote');
      break;
    default:
      break;
  }
}

export function handleRemoteKey(event: RemoteKeyEvent): void {
  if (event.learning || event.action !== 'down' || event.repeat > 0) return;
  useStudio.getState().patch({ notice: null });
  const action = useSettings.getState().remoteKeys[event.key] ?? 'none';
  if (action === 'none') return;
  const now = Date.now();
  if (now - lastRun < DEBOUNCE_MS) return;
  lastRun = now;
  run(action).catch(error => {
    const text = error instanceof UserFacingError || error instanceof Error ? error.message : String(error);
    log.warn('remote', `${event.key} → ${action} failed: ${text}`);
    useStudio.getState().patch({ notice: text });
  });
}

export function bindRemoteKeys(): () => void {
  let previous = '';
  const synchronize = () => {
    const keys = JSON.stringify(Object.entries(useSettings.getState().remoteKeys).filter(([, action]) => action !== 'none').map(([key]) => key).sort());
    if (keys === previous) return;
    previous = keys;
    StudioBluetooth.setRemoteKeyBindings(keys).catch(error => log.warn('remote', error));
  };
  synchronize();
  const stopSettings = useSettings.subscribe(synchronize);
  const stopEvents = onStudioEvent('studio.remoteKey', handleRemoteKey);
  return () => {
    stopSettings();
    stopEvents();
    StudioBluetooth.setRemoteKeyBindings('[]').catch(() => undefined);
  };
}
