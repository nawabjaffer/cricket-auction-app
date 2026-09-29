import { obsService } from './obsService';
import type { OBSReplayButton } from '../types/scoring';

export const CRICKET_STREAMING_COLLECTION = 'Cricket Match Streaming';
export const CRICKET_REPLAY_INPUT = 'Cricket Replay VLC';
export const CRICKET_REPLAY_SCENE = 'Cricket - Replay';
export const CRICKET_LIVE_SCENE = 'Cricket - Live';
export const CRICKET_REPLAY_MEDIA_INPUT = 'Cricket Replay Media';
export const CRICKET_REPLAY_VLC_INPUT = 'Cricket Replay VLC';
export const CRICKET_OVERLAY_WIDTH = 1920;
export const CRICKET_OVERLAY_HEIGHT = 1080;

export interface CricketStreamingPresetOptions {
  cameraCount: number;
  mobileCameraCount: number;
  microphoneCount: number;
  includeDesktopAudio: boolean;
  replayDurationSeconds: number;
  overlayUrl?: string;
  replayDirectory?: string;
}

export interface CricketStreamingPresetResult {
  collectionName: string;
  scenes: string[];
  warnings: string[];
  replaySourceName?: string;
  replaySourceNames: string[];
  replayDurationSeconds: number;
  replayDirectory?: string;
}

interface SceneListResponse {
  scenes: Array<{ sceneName: string }>;
}

interface InputListResponse {
  inputs: Array<{ inputName: string; inputKind: string }>;
}

interface InputKindListResponse {
  inputKinds: string[];
}

interface SceneItemsResponse {
  sceneItems: Array<{ sourceName: string; sceneItemId: number }>;
}

interface OBSVersionResponse {
  platform?: string;
}

interface OBSProfileParameterResponse {
  parameterValue?: string | null;
}

interface OBSRecordDirectoryResponse {
  recordDirectory?: string;
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))];
}

function availableKinds(kinds: Set<string>, candidates: string[]): string[] {
  const resolved: string[] = [];
  for (const candidate of candidates) {
    const exact = [...kinds].find(kind => kind === candidate || kind.startsWith(`${candidate}_v`));
    if (exact && !resolved.includes(exact)) resolved.push(exact);
  }
  return resolved;
}

function sameInputKind(existing: string, candidate: string): boolean {
  return existing === candidate || existing.startsWith(`${candidate}_v`) || candidate.startsWith(`${existing}_v`);
}

export function inferDesktopReplayDirectory(recordDirectory: string, platform: string): string | undefined {
  const normalized = recordDirectory.trim().replace(/\\/g, '/').replace(/\/$/, '');
  const os = platform.toLowerCase();
  const windowsHome = normalized.match(/^([a-z]:\/Users\/[^/]+)/i)?.[1];
  if (os.includes('win') && windowsHome && /\/(?:Videos|Documents|Desktop)$/i.test(normalized)) {
    return `${windowsHome}/Desktop/Cricket Replays`;
  }
  const macHome = normalized.match(/^(\/Users\/[^/]+)/)?.[1];
  if (os.includes('mac') && macHome && /\/(?:Movies|Documents|Desktop)$/i.test(normalized)) {
    return `${macHome}/Desktop/Cricket Replays`;
  }
  return undefined;
}

function availableKind(kinds: Set<string>, preferred: string, fallbacks: string[]): string | undefined {
  return availableKinds(kinds, [preferred, ...fallbacks])[0];
}

class OBSStreamingPresetService {
  private replayEventUnsubscribe: (() => void) | null = null;

  async createCricketMatchSetup(options: CricketStreamingPresetOptions): Promise<CricketStreamingPresetResult> {
    if (!obsService.isConnected()) throw new Error('Connect to OBS before creating the streaming setup.');

    const warnings: string[] = [];
    const sceneNames: string[] = [];
    const collections = await obsService.request<{ sceneCollections: string[]; currentSceneCollectionName: string }>('GetSceneCollectionList');
    if (collections.sceneCollections.includes(CRICKET_STREAMING_COLLECTION)) {
      if (collections.currentSceneCollectionName !== CRICKET_STREAMING_COLLECTION) {
        await obsService.request('SetCurrentSceneCollection', { sceneCollectionName: CRICKET_STREAMING_COLLECTION });
      }
    } else {
      await obsService.request('CreateSceneCollection', { sceneCollectionName: CRICKET_STREAMING_COLLECTION });
    }

    const [sceneList, inputList, kindList, version] = await Promise.all([
      obsService.request<SceneListResponse>('GetSceneList'),
      obsService.request<InputListResponse>('GetInputList'),
      obsService.request<InputKindListResponse>('GetInputKindList'),
      obsService.request<OBSVersionResponse>('GetVersion'),
    ]);
    const specialInputs = await obsService.request<Record<string, string>>('GetSpecialInputs').catch(() => ({} as Record<string, string>));
    const scenes = new Set(sceneList.scenes.map(scene => scene.sceneName));
    const inputs = new Map(inputList.inputs.map(input => [input.inputName, input.inputKind]));
    const kinds = new Set(kindList.inputKinds);
    const sceneItems = new Map<string, Set<string>>();
    let replayDurationSeconds = Math.max(1, Number(options.replayDurationSeconds) || 14);
    let replayDirectory: string | undefined;
    try {
      const outputMode = await obsService.request<OBSProfileParameterResponse>('GetProfileParameter', {
        parameterCategory: 'Output',
        parameterName: 'Mode',
      });
      const categories = outputMode.parameterValue?.toLowerCase() === 'advanced'
        ? ['AdvOut', 'SimpleOutput']
        : ['SimpleOutput', 'AdvOut'];
      for (const category of categories) {
        try {
          const setting = await obsService.request<OBSProfileParameterResponse>('GetProfileParameter', {
            parameterCategory: category,
            parameterName: 'RecRBTime',
          });
          const seconds = Number(setting.parameterValue);
          if (Number.isFinite(seconds) && seconds > 0) {
            replayDurationSeconds = seconds;
            break;
          }
        } catch { /* this output mode may not expose the replay setting */ }
      }
    } catch { /* preserve the configured app duration when the OBS version lacks profile requests */ }

    try {
      const current = await obsService.request<OBSRecordDirectoryResponse>('GetRecordDirectory');
      replayDirectory = current.recordDirectory;
      const requested = options.replayDirectory?.trim()
        || inferDesktopReplayDirectory(current.recordDirectory || '', version.platform || '');
      if (requested && requested !== current.recordDirectory) {
        await obsService.request('SetRecordDirectory', { recordDirectory: requested });
        replayDirectory = requested;
      } else if (!requested && current.recordDirectory) {
        warnings.push(`Could not infer OBS user's Desktop from its current folder; replay clips will stay in ${current.recordDirectory}. Enter the Desktop path in Match Setup to change it.`);
      }
    } catch (error) {
      warnings.push(`Could not read/set OBS's replay output folder: ${error instanceof Error ? error.message : String(error)}`);
    }

    const ensureScene = async (name: string) => {
      if (!scenes.has(name)) {
        await obsService.request('CreateScene', { sceneName: name });
        scenes.add(name);
      }
      sceneNames.push(name);
    };

    const ensureSceneItem = async (sceneName: string, sourceName: string) => {
      let existing = sceneItems.get(sceneName);
      if (!existing) {
        const response = await obsService.request<SceneItemsResponse>('GetSceneItemList', { sceneName });
        existing = new Set(response.sceneItems.map(item => item.sourceName));
        sceneItems.set(sceneName, existing);
      }
      if (existing.has(sourceName)) return;
      await obsService.request('CreateSceneItem', { sceneName, sourceName });
      existing.add(sourceName);
    };

    const removeManagedInput = async (inputName: string) => {
      if (!inputs.has(inputName)) return;
      try {
        await obsService.request('RemoveInput', { inputName });
        inputs.delete(inputName);
      } catch (error) {
        warnings.push(`Could not remove preset source ${inputName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const removeManagedScene = async (sceneName: string) => {
      if (!scenes.has(sceneName)) return;
      try {
        await obsService.request('RemoveScene', { sceneName });
        scenes.delete(sceneName);
      } catch (error) {
        warnings.push(`Could not remove preset scene ${sceneName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const removeSceneItem = async (sceneName: string, sourceName: string) => {
      const response = await obsService.request<SceneItemsResponse>('GetSceneItemList', { sceneName });
      const item = response.sceneItems.find(sceneItem => sceneItem.sourceName === sourceName);
      if (item) await obsService.request('RemoveSceneItem', { sceneName, sceneItemId: item.sceneItemId });
      sceneItems.delete(sceneName);
    };

    const ensureInput = async (sceneName: string, inputName: string, inputKinds: string | string[] | undefined, inputSettings?: Record<string, unknown>): Promise<boolean> => {
      const candidates = (Array.isArray(inputKinds) ? inputKinds : inputKinds ? [inputKinds] : []).filter(kind => kinds.has(kind));
      if (candidates.length === 0) {
        warnings.push(`No compatible OBS source type is available for ${inputName}. Check OBS version and installed plugins.`);
        return false;
      }
      const existingKind = inputs.get(inputName);
      if (existingKind) {
        const existingCandidate = candidates.find(candidate => sameInputKind(existingKind, candidate));
        if (!existingCandidate) {
          warnings.push(`${inputName} already exists with kind ${existingKind}, not a supported requested kind (${candidates.join(', ')}); left it unchanged.`);
          return false;
        }
        await ensureSceneItem(sceneName, inputName);
        if (inputSettings) {
          try {
            await obsService.request('SetInputSettings', { inputName, inputSettings, overlay: true });
          } catch (error) {
            warnings.push(`Could not update settings for ${inputName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        return true;
      }
      const rejected: string[] = [];
      for (const candidate of candidates) {
        try {
          await obsService.request('CreateInput', {
            sceneName,
            inputName,
            inputKind: candidate,
            ...(inputSettings ? { inputSettings } : {}),
          });
          inputs.set(inputName, candidate);
          const knownItems = sceneItems.get(sceneName);
          knownItems?.add(inputName);
          return true;
        } catch (error) {
          rejected.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      warnings.push(`OBS rejected every advertised source kind for ${inputName} (${rejected.join(' | ')}). That source was skipped; the rest of Match Setup continued.`);
      return false;
    };

    const platform = (version.platform || '').toLowerCase();
    const windows = platform.includes('win');
    const mac = platform.includes('mac');
    const videoKinds = availableKinds(kinds, windows
      ? ['dshow_input', 'av_capture_input', 'v4l2_input']
      : mac
        ? ['av_capture_input', 'dshow_input', 'v4l2_input']
        : ['v4l2_input', 'dshow_input', 'av_capture_input']);
    const audioInputKinds = availableKinds(kinds, windows
      ? ['wasapi_input_capture', 'coreaudio_input_capture', 'pulse_input_capture']
      : mac
        ? ['coreaudio_input_capture', 'wasapi_input_capture', 'pulse_input_capture']
        : ['pulse_input_capture', 'wasapi_input_capture', 'coreaudio_input_capture']);
    const audioOutputKinds = availableKinds(kinds, windows
      ? ['wasapi_output_capture', 'coreaudio_output_capture', 'pulse_output_capture']
      : mac
        ? ['coreaudio_output_capture', 'wasapi_output_capture', 'pulse_output_capture']
        : ['pulse_output_capture', 'wasapi_output_capture', 'coreaudio_output_capture']);

    const liveScene = CRICKET_LIVE_SCENE;
    const audioScene = 'Cricket - Audio';
    const startingSoonScene = 'Cricket - Starting Soon';
    await ensureScene(startingSoonScene);
    await ensureScene(liveScene);
    await ensureScene(audioScene);
    await ensureScene(CRICKET_REPLAY_SCENE);
    await ensureScene('Cricket - DRS');

    const desiredCameraCount = Math.min(8, Math.max(1, Math.floor(options.cameraCount)));
    const desiredMobileCameraCount = Math.min(4, Math.max(0, Math.floor(options.mobileCameraCount)));
    const desiredMicrophoneCount = Math.min(4, Math.max(0, Math.floor(options.microphoneCount)));
    const browserKind = availableKind(kinds, 'browser_source', []);
    const overlaySettings = options.overlayUrl ? {
      url: options.overlayUrl,
      width: CRICKET_OVERLAY_WIDTH,
      height: CRICKET_OVERLAY_HEIGHT,
      fps: 30,
      shutdown: false,
      restart_when_active: true,
    } : undefined;
    await obsService.request('SetCurrentProgramScene', { sceneName: liveScene });

    const startingSoonMediaKind = availableKind(kinds, 'ffmpeg_source', []);
    if (startingSoonMediaKind) {
      const created = await ensureInput(startingSoonScene, 'Cricket Starting Soon Media', startingSoonMediaKind, {
        is_local_file: true,
        local_file: '',
        loop: true,
        restart_on_activate: true,
        close_when_inactive: false,
      });
      if (created) warnings.push('Choose the intro/starting-soon clip in Cricket Starting Soon Media properties.');
    } else {
      warnings.push('OBS Media Source is unavailable for Starting Soon.');
    }

    if (windows) {
      const windowCaptureKind = availableKind(kinds, 'window_capture', []);
      if (windowCaptureKind) {
        const created = await ensureInput(startingSoonScene, 'Cricket Starting Soon Window Capture', windowCaptureKind);
        if (created) warnings.push('Choose the target window in Cricket Starting Soon Window Capture properties.');
      } else {
        warnings.push('OBS Window Capture source is unavailable for Starting Soon.');
      }
    }
    await ensureSceneItem(startingSoonScene, audioScene);

    for (let index = desiredCameraCount + 1; index <= 8; index += 1) {
      await removeManagedInput(`Cricket Camera ${index}`);
      await removeManagedInput(`Cricket Overlay Camera ${index}`);
      await removeManagedScene(`Cricket - Camera ${index}`);
    }
    for (let index = desiredMobileCameraCount + 1; index <= 4; index += 1) {
      await removeManagedInput(`Cricket DroidCam ${index}`);
      await removeManagedInput(`Cricket Overlay Mobile ${index}`);
      await removeManagedScene(`Cricket - Mobile Camera ${index}`);
    }
    for (let index = desiredMicrophoneCount + 1; index <= 4; index += 1) {
      await removeManagedInput(`Cricket Microphone ${index}`);
    }
    if (!options.includeDesktopAudio) {
      await removeManagedInput('Cricket Desktop Audio');
    }
    for (let index = 1; index <= 4; index += 1) {
      const specialMic = specialInputs[`mic${index}`];
      if (specialMic && index > desiredMicrophoneCount) await removeSceneItem(audioScene, specialMic);
      const specialDesktop = specialInputs[`desktop${index}`];
      if (specialDesktop && !options.includeDesktopAudio) await removeSceneItem(audioScene, specialDesktop);
    }
    if (!options.overlayUrl) {
      for (let index = 1; index <= 8; index += 1) await removeManagedInput(`Cricket Overlay Camera ${index}`);
      for (let index = 1; index <= 4; index += 1) await removeManagedInput(`Cricket Overlay Mobile ${index}`);
    }

    const cameraSceneNames: string[] = [];
    for (let index = 1; index <= desiredCameraCount; index += 1) {
      const sceneName = `Cricket - Camera ${index}`;
      const inputName = `Cricket Camera ${index}`;
      await ensureScene(sceneName);
      const videoAdded = await ensureInput(sceneName, inputName, videoKinds);
      const overlayAdded = overlaySettings && browserKind
        ? await ensureInput(sceneName, `Cricket Overlay Camera ${index}`, browserKind, overlaySettings)
        : false;
      if (overlaySettings && !browserKind && index === 1) warnings.push('OBS Browser Source is unavailable; install/enable the OBS browser source plugin to add the score overlay.');
      await ensureSceneItem(sceneName, audioScene);
      if (videoAdded || overlayAdded) cameraSceneNames.push(sceneName);
    }
    if (cameraSceneNames.length > 0) {
      await ensureSceneItem(liveScene, cameraSceneNames[0]);
      await ensureSceneItem(CRICKET_REPLAY_SCENE, cameraSceneNames[0]);
      await ensureSceneItem('Cricket - DRS', cameraSceneNames[0]);
    } else {
      await ensureSceneItem(liveScene, audioScene);
      await ensureSceneItem(CRICKET_REPLAY_SCENE, audioScene);
      await ensureSceneItem('Cricket - DRS', audioScene);
    }

    const mobileKind = [...kinds].find(kind => /droid.?cam/i.test(kind));
    for (let index = 1; index <= desiredMobileCameraCount; index += 1) {
      const sceneName = `Cricket - Mobile Camera ${index}`;
      await ensureScene(sceneName);
      await ensureSceneItem(sceneName, audioScene);
      if (!mobileKind) {
        warnings.push('DroidCam OBS source was not found. Install/enable the DroidCam OBS plugin, then run Match Setup again.');
      } else {
        await ensureInput(sceneName, `Cricket DroidCam ${index}`, mobileKind);
      }
      if (overlaySettings && browserKind) await ensureInput(sceneName, `Cricket Overlay Mobile ${index}`, browserKind, overlaySettings);
    }

    for (let index = 1; index <= 4; index += 1) {
      const specialName = specialInputs[`mic${index}`];
      if (specialName && index <= options.microphoneCount) {
        await ensureSceneItem(audioScene, specialName);
      } else if (index <= options.microphoneCount) {
        const created = await ensureInput(audioScene, `Cricket Microphone ${index}`, audioInputKinds);
        if (created) warnings.push(`Choose the device for Cricket Microphone ${index} in OBS source properties.`);
      }
      const desktopName = specialInputs[`desktop${index}`];
      if (options.includeDesktopAudio && desktopName) await ensureSceneItem(audioScene, desktopName);
    }
    if (options.includeDesktopAudio && !specialInputs.desktop1) {
      const created = await ensureInput(audioScene, 'Cricket Desktop Audio', audioOutputKinds);
      if (created) warnings.push('Choose the desktop audio device in OBS source properties.');
    }

    const replaySourceNames: string[] = [];
    let replaySourceName: string | undefined;
    const mediaKind = availableKind(kinds, 'ffmpeg_source', []);
    if (mediaKind && await ensureInput(CRICKET_REPLAY_SCENE, CRICKET_REPLAY_MEDIA_INPUT, mediaKind, {
      is_local_file: true,
      local_file: '',
      loop: false,
      restart_on_activate: true,
      close_when_inactive: false,
    })) {
      replaySourceNames.push(CRICKET_REPLAY_MEDIA_INPUT);
      replaySourceName = CRICKET_REPLAY_MEDIA_INPUT;
    } else if (!mediaKind) {
      warnings.push('OBS Media Source (ffmpeg_source) is unavailable.');
    }

    const vlcKind = availableKind(kinds, 'vlc_source', []);
    if (vlcKind) {
      if (await ensureInput(CRICKET_REPLAY_SCENE, CRICKET_REPLAY_VLC_INPUT, vlcKind, {
        playlist: [],
        loop: false,
        shuffle: false,
      })) {
        replaySourceNames.push(CRICKET_REPLAY_VLC_INPUT);
        replaySourceName = CRICKET_REPLAY_VLC_INPUT;
      }
    } else {
      warnings.push('VLC Video Source is unavailable. Install VLC and the OBS VLC source, then run Match Setup again.');
    }

    const instantReplayKind = [...kinds].find(kind => /(?:instant.*replay|replay.*source|source.*replay)/i.test(kind));
    if (instantReplayKind) await ensureInput(CRICKET_REPLAY_SCENE, 'Cricket Instant Replay Source', instantReplayKind);
    if (replaySourceNames.length > 0) this.configureLatestReplaySource(replaySourceNames);

    await obsService.request('SetCurrentProgramScene', { sceneName: liveScene });

    try {
      const replayStatus = await obsService.request<{ outputActive: boolean }>('GetReplayBufferStatus');
      if (!replayStatus.outputActive) await obsService.request('StartReplayBuffer');
    } catch (error) {
      warnings.push(`Replay Buffer could not be started. Enable it in OBS Output settings: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      collectionName: CRICKET_STREAMING_COLLECTION,
      scenes: uniqueNames(sceneNames),
      warnings: [...new Set(warnings)],
      replaySourceName,
      replaySourceNames,
      replayDurationSeconds,
      replayDirectory,
    };
  }

  configureLatestReplaySource(inputNames?: string | string[]): void {
    this.replayEventUnsubscribe?.();
    this.replayEventUnsubscribe = null;
    const names = Array.isArray(inputNames) ? inputNames.filter(Boolean) : inputNames ? [inputNames] : [];
    if (names.length === 0) return;
    this.replayEventUnsubscribe = obsService.onEvent((event, data) => {
      if (event !== 'ReplayBufferSaved') return;
      const savedReplayPath = (data as { savedReplayPath?: string } | null)?.savedReplayPath;
      if (savedReplayPath) void Promise.all(names.map(name => this.playLatestReplay(name, savedReplayPath)));
    });
  }

  getPresetReplayButtons(replayDurationSeconds: number): OBSReplayButton[] {
    const replaySteps = (prefix: string) => [
      { id: `${prefix}-save`, label: 'Save replay clip', action: 'replay_buffer_save' as const, delayMs: 0 },
      { id: `${prefix}-scene`, label: 'Show replay scene', action: 'scene_switch' as const, sceneName: CRICKET_REPLAY_SCENE, delayMs: 800 },
      { id: `${prefix}-return`, label: 'Return to live', action: 'scene_switch' as const, sceneName: CRICKET_LIVE_SCENE, delayMs: Math.max(5, replayDurationSeconds) * 1000 },
    ];
    return [
      { id: 'cricket-preset-buffer-start', label: 'Start Replay Buffer', icon: '⏺', color: '#22c55e', action: 'replay_buffer_start', order: 0, enabled: true },
      { id: 'cricket-preset-replay-save', label: 'Save Replay', icon: '💾', color: '#f59e0b', action: 'replay_buffer_save', order: 1, enabled: true },
      { id: 'cricket-preset-switch-replay', label: 'Replay Scene', icon: '📺', color: '#2563eb', action: 'scene_switch', sceneName: CRICKET_REPLAY_SCENE, order: 2, enabled: true },
      { id: 'cricket-preset-switch-drs', label: 'DRS Scene', icon: '🔍', color: '#f97316', action: 'scene_switch', sceneName: 'Cricket - DRS', order: 3, enabled: true },
      { id: 'cricket-preset-instant-replay', label: 'Instant Replay', icon: '↩', color: '#3b82f6', action: 'series', order: 4, enabled: true, series: replaySteps('cricket-replay') },
      { id: 'cricket-preset-test-replay', label: 'Test Replay', icon: '🧪', color: '#14b8a6', action: 'series', order: 5, enabled: true, series: replaySteps('cricket-test-replay') },
      { id: 'cricket-preset-buffer-stop', label: 'Stop Replay Buffer', icon: '⏹', color: '#ef4444', action: 'replay_buffer_stop', order: 6, enabled: true },
    ];
  }

  dispose(): void {
    this.replayEventUnsubscribe?.();
    this.replayEventUnsubscribe = null;
  }

  private async playLatestReplay(inputName: string, filePath: string): Promise<void> {
    try {
      const inputSettings = inputName === CRICKET_REPLAY_VLC_INPUT
        ? { playlist: [{ value: filePath }], loop: false, shuffle: false }
        : { local_file: filePath, is_local_file: true, loop: false, restart_on_activate: true, close_when_inactive: false };
      await obsService.request('SetInputSettings', { inputName, inputSettings, overlay: true });
      await obsService.request('TriggerMediaInputAction', {
        inputName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
    } catch (error) {
      console.error('[OBS Replay] Could not load the latest replay into VLC:', error);
    }
  }
}

export const obsStreamingPresetService = new OBSStreamingPresetService();
