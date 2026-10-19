// Maps Bluetooth / HID remote key presses (clickers, gamepads, headset buttons) to studio actions.
import { StudioEngine, onStudioEvent, type RemoteKeyEvent } from '../native';
import { endLive, goLive, applyOverlays, UserFacingError } from './streamController';
import { log } from './logger';
import { useSettings, type RemoteAction } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';

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
      await StudioEngine.switchCamera();
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
  if (event.action !== 'down' || event.repeat > 0) return;
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
  return onStudioEvent('studio.remoteKey', handleRemoteKey);
}
