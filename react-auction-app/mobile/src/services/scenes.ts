import { StudioEngine } from '../native';
import { adjacentSceneId } from '../shared/scenes';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { presetSupport } from './effectiveConfig';
import { selectProgram } from './peers';
import { applyOverlays, prepareStudio, queueEngineTask, syncPreparedSignature, UserFacingError } from './streamController';

let sceneQueue: Promise<void> = Promise.resolve();

export async function rememberSceneFrame(id: string): Promise<void> {
  try {
    const frame = await StudioEngine.captureThumbnail();
    if (frame) useStudio.getState().patch({ scenePreviews: { ...useStudio.getState().scenePreviews, [id]: frame } });
  } catch {
    return;
  }
}

function enqueue(operation: () => Promise<void>): Promise<void> {
  const task = sceneQueue.then(operation);
  sceneQueue = task.catch(() => undefined);
  return task;
}

async function activateOnce(id: string): Promise<void> {
  const settings = useSettings.getState();
  const scene = settings.scenes.find(item => item.id === id);
  if (!scene) throw new UserFacingError('This scene no longer exists.');
  if (useStudio.getState().cameraServerUrl) throw new UserFacingError('Stop the LAN camera before switching scenes.');
  if (!(await prepareStudio())) throw new UserFacingError(useStudio.getState().error ?? 'Could not prepare the camera.');

  await queueEngineTask(async () => {
    const current = useSettings.getState();
    const studio = useStudio.getState();
    const previous = { id: current.activeSceneId, facing: current.facing, source: studio.programSource, sourceId: studio.program?.activeSourceId };
    await rememberSceneFrame(previous.id);
    const camera = scene.camera;
    if (camera.kind === 'local' && studio.effective) {
      const support = presetSupport(studio.effective.preset, studio.effective.codec, studio.capabilities, camera.facing);
      if (!support.ok) throw new UserFacingError(`${support.reason}. Choose a lower quality before switching.`);
    }
    let flipped = false;
    try {
      if (camera.kind === 'peer') {
        await selectProgram({ kind: 'peer', url: camera.url, name: camera.name }, camera.remoteId);
      } else {
        await selectProgram({ kind: 'local' });
        if (camera.facing !== current.facing) {
          await StudioEngine.switchCamera();
          flipped = true;
        }
      }
      current.patch({ activeSceneId: id, ...(camera.kind === 'local' ? { facing: camera.facing } : {}) });
      syncPreparedSignature();
      await applyOverlays(true);
      useStudio.getState().patch({ notice: null });
    } catch (error) {
      if (flipped) await StudioEngine.switchCamera().catch(() => undefined);
      current.patch({ activeSceneId: previous.id, facing: previous.facing });
      await selectProgram(previous.source, previous.sourceId).catch(() => undefined);
      await applyOverlays();
      syncPreparedSignature();
      throw error;
    }
  });
}

export function activateScene(id: string): Promise<void> {
  return enqueue(() => activateOnce(id));
}

export function switchScene(direction: 1 | -1): Promise<void> {
  return enqueue(async () => {
    const settings = useSettings.getState();
    const id = adjacentSceneId(settings.scenes, settings.activeSceneId, direction);
    if (id) await activateOnce(id);
  });
}