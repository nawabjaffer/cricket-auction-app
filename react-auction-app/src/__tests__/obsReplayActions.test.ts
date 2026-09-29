import { beforeEach, describe, expect, it, vi } from 'vitest';

const obs = vi.hoisted(() => ({
  isConnected: vi.fn(),
  request: vi.fn(),
  onEvent: vi.fn(),
  triggerHotkeyByName: vi.fn(),
  triggerHotkeyByKeySequence: vi.fn(),
}));

const firebase = vi.hoisted(() => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  push: vi.fn((parent: { path: string }) => ({ key: 'relay-command-1', path: `${parent.path}/relay-command-1` })),
  set: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn(() => () => {}),
  runTransaction: vi.fn(),
}));

vi.mock('../services/obsService', () => ({ obsService: obs }));
vi.mock('firebase/database', () => firebase);

import { obsReplaySourceService } from '../services/scoring/obsReplaySourceService';
import {
  CRICKET_REPLAY_INPUT,
  CRICKET_REPLAY_SCENE,
  inferDesktopReplayDirectory,
  obsStreamingPresetService,
} from '../services/obsStreamingPresetService';

describe('OBS replay actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obs.isConnected.mockReturnValue(true);
    obs.request.mockResolvedValue({});
    obs.onEvent.mockReturnValue(() => {});
    obs.triggerHotkeyByName.mockResolvedValue(true);
    obs.triggerHotkeyByKeySequence.mockResolvedValue(true);
  });

  it('continues a series after a failed OBS step and reports the partial result', async () => {
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'SetCurrentProgramScene') throw new Error('scene not found');
      return {};
    });

    const result = await obsReplaySourceService.executeButton({
      id: 'instant', label: 'Instant Replay', icon: '↩', color: '#000', action: 'series', order: 0, enabled: true,
      series: [
        { id: 'scene', action: 'scene_switch', sceneName: 'Missing Scene', delayMs: 0 },
        { id: 'save', action: 'replay_buffer_save', delayMs: 0 },
      ],
    });

    expect(result).toMatchObject({ success: false, completedSteps: 1, totalSteps: 2 });
    expect(result.errors[0]).toContain('Step 1');
    expect(obs.request.mock.calls.map(([type]) => type)).toEqual(['SetCurrentProgramScene', 'SaveReplayBuffer']);
  });

  it('sends key modifiers and surfaces replay-buffer errors instead of claiming success', async () => {
    const keyResult = await obsReplaySourceService.executeButton({
      id: 'key', label: 'Replay', icon: 'R', color: '#000', action: 'hotkey_sequence', order: 0, enabled: true,
      keySequence: { keyId: 'OBS_KEY_F1', shift: true },
    });
    expect(keyResult.success).toBe(true);
    expect(obs.triggerHotkeyByKeySequence).toHaveBeenCalledWith('OBS_KEY_F1', true, undefined, undefined);

    obs.request.mockRejectedValueOnce(new Error('Replay Buffer is disabled'));
    const bufferResult = await obsReplaySourceService.executeButton({
      id: 'save', label: 'Save', icon: 'S', color: '#000', action: 'replay_buffer_save', order: 0, enabled: true,
    });
    expect(bufferResult.success).toBe(false);
    expect(bufferResult.errors[0]).toContain('Replay Buffer is disabled');
  });

  it('sends relay commands to the shared tenant queue and retains the match id', async () => {
    obsReplaySourceService.initialize({} as never, 'tenants/ppl_2026/scoring');

    const commandId = await obsReplaySourceService.sendRelayCommand('match-42', 'cricket-preset-instant-replay');

    expect(commandId).toBe('relay-command-1');
    expect(firebase.ref).toHaveBeenCalledWith(expect.anything(), 'tenants/ppl_2026/scoring/obsRelayCommands');
    expect(firebase.set).toHaveBeenCalledWith(
      { key: commandId, path: `tenants/ppl_2026/scoring/obsRelayCommands/${commandId}` },
      expect.objectContaining({ id: commandId, matchId: 'match-42', buttonId: 'cricket-preset-instant-replay', status: 'pending' }),
    );
  });
});

describe('OBS Cricket Match Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obs.isConnected.mockReturnValue(true);
    obs.onEvent.mockReturnValue(() => {});
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetSceneCollectionList') return { sceneCollections: [], currentSceneCollectionName: 'Scene' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input', 'wasapi_input_capture', 'wasapi_output_capture', 'browser_source', 'ffmpeg_source', 'vlc_source', 'droidcam_obs', 'replay_source', 'window_capture'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return { mic1: 'Mic/Aux', desktop1: 'Desktop Audio' };
      if (type === 'GetReplayBufferStatus') return { outputActive: false };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });
  });

  it('infers Desktop replay folders from standard Windows/macOS OBS recording paths', () => {
    expect(inferDesktopReplayDirectory('C:\\Users\\Alex\\Videos', 'windows')).toBe('C:/Users/Alex/Desktop/Cricket Replays');
    expect(inferDesktopReplayDirectory('/Users/alex/Movies', 'macos')).toBe('/Users/alex/Desktop/Cricket Replays');
    expect(inferDesktopReplayDirectory('/Volumes/Media/Replays', 'macos')).toBeUndefined();
  });

  it('creates a scene collection, camera/audio/mobile/replay scenes and starts replay buffer', async () => {
    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 2,
      mobileCameraCount: 1,
      microphoneCount: 1,
      includeDesktopAudio: true,
      replayDurationSeconds: 20,
      overlayUrl: 'http://localhost:5173/epl_2026/cricket/scorer/obs-overlay',
    });

    expect(obs.request).toHaveBeenCalledWith('CreateSceneCollection', { sceneCollectionName: 'Cricket Match Streaming' });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - Camera 1', inputName: 'Cricket Camera 1', inputKind: 'dshow_input' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({
      sceneName: 'Cricket - Camera 1',
      inputName: 'Cricket Overlay Camera 1',
      inputKind: 'browser_source',
      inputSettings: { url: 'http://localhost:5173/epl_2026/cricket/scorer/obs-overlay', width: 1920, height: 1080, fps: 30, shutdown: false, restart_when_active: true },
    }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - Starting Soon', inputName: 'Cricket Starting Soon Media', inputKind: 'ffmpeg_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - Starting Soon', inputName: 'Cricket Starting Soon Window Capture', inputKind: 'window_capture' }));
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: 'Cricket - Starting Soon', sourceName: 'Cricket - Audio' });
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: 'Cricket - Camera 1', sourceName: 'Cricket - Audio' });
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: 'Cricket - Mobile Camera 1', sourceName: 'Cricket - Audio' });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - Mobile Camera 1', inputKind: 'droidcam_obs' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - Mobile Camera 1', inputName: 'Cricket Overlay Mobile 1', inputKind: 'browser_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_REPLAY_SCENE, inputName: CRICKET_REPLAY_INPUT, inputKind: 'vlc_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_REPLAY_SCENE, inputName: 'Cricket Replay Media', inputKind: 'ffmpeg_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_REPLAY_SCENE, inputName: 'Cricket Instant Replay Source', inputKind: 'replay_source' }));
    expect(obs.request).toHaveBeenCalledWith('StartReplayBuffer');
    expect(obs.request).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Cricket - Live' });
    expect(result.scenes).toContain('Cricket - Audio');
    expect(result.scenes).toContain(CRICKET_REPLAY_SCENE);
    expect(result.warnings).toContain('Choose the intro/starting-soon clip in Cricket Starting Soon Media properties.');
    expect(result.replaySourceName).toBe(CRICKET_REPLAY_INPUT);
    expect(result.replaySourceNames).toEqual(['Cricket Replay Media', CRICKET_REPLAY_INPUT]);
    const instantReplay = obsStreamingPresetService.getPresetReplayButtons(20).find(button => button.id === 'cricket-preset-instant-replay');
    expect(instantReplay?.series).toHaveLength(3);
    expect(instantReplay?.series?.[2].delayMs).toBe(20_000);
  });

  it('loads the newest Replay Buffer file into the VLC source and restarts playback', async () => {
    let eventHandler: ((event: string, data: unknown) => void) | undefined;
    obs.onEvent.mockImplementation(handler => {
      eventHandler = handler;
      return () => {};
    });
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetInputSettings') return { inputSettings: { loop: true, playlist: [] } };
      return {};
    });

    obsStreamingPresetService.configureLatestReplaySource(['Cricket Replay Media', CRICKET_REPLAY_INPUT]);
    eventHandler?.('ReplayBufferSaved', { savedReplayPath: 'D:/OBS/Replays/replay-01.mkv' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(obs.request).toHaveBeenCalledWith('SetInputSettings', {
      inputName: 'Cricket Replay Media',
      inputSettings: { local_file: 'D:/OBS/Replays/replay-01.mkv', is_local_file: true, loop: false, restart_on_activate: true, close_when_inactive: false },
      overlay: true,
    });
    expect(obs.request).toHaveBeenCalledWith('SetInputSettings', {
      inputName: CRICKET_REPLAY_INPUT,
      inputSettings: { playlist: [{ value: 'D:/OBS/Replays/replay-01.mkv' }], loop: false, shuffle: false },
      overlay: true,
    });
    expect(obs.request).toHaveBeenCalledWith('TriggerMediaInputAction', {
      inputName: CRICKET_REPLAY_INPUT,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
    obsStreamingPresetService.dispose();
  });

  it('reuses an existing named collection and reports missing optional plugins', async () => {
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Scene' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });

    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 1,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
    });

    expect(obs.request).toHaveBeenCalledWith('SetCurrentSceneCollection', { sceneCollectionName: 'Cricket Match Streaming' });
    expect(obs.request).not.toHaveBeenCalledWith('CreateSceneCollection', expect.anything());
    expect(result.warnings.some(warning => warning.includes('DroidCam OBS source was not found'))).toBe(true);
    expect(result.warnings.some(warning => warning.includes('VLC Video Source is unavailable'))).toBe(true);
  });

  it('reports an OBS-rejected capture kind but continues creating replay setup', async () => {
    obs.request.mockImplementation(async (type: string, data?: { inputName?: string }) => {
      if (type === 'CreateInput' && data?.inputName === 'Cricket Camera 1') {
        throw new Error('Your specified input kind is not supported by OBS.');
      }
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Cricket Match Streaming' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input', 'vlc_source'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: false };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });

    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 0,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
    });

    expect(result.warnings.some(warning => warning.includes('Cricket Camera 1') && warning.includes('input kind is not supported'))).toBe(true);
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputName: CRICKET_REPLAY_INPUT, inputKind: 'vlc_source' }));
    expect(obs.request).toHaveBeenCalledWith('StartReplayBuffer');
    expect(obs.request).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Cricket - Live' });
  });

  it('retries another advertised camera kind when OBS rejects the platform-preferred kind', async () => {
    const attemptedKinds: string[] = [];
    obs.request.mockImplementation(async (type: string, data?: { inputName?: string; inputKind?: string }) => {
      if (type === 'CreateInput' && data?.inputName === 'Cricket Camera 1') {
        attemptedKinds.push(data.inputKind || '');
        if (data.inputKind === 'dshow_input') throw new Error('input kind is not supported');
      }
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Cricket Match Streaming' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input', 'av_capture_input', 'vlc_source'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });

    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 0,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
    });

    expect(attemptedKinds).toEqual(['dshow_input', 'av_capture_input']);
    expect(result.warnings.some(warning => warning.includes('Cricket Camera 1'))).toBe(false);
  });

  it('uses OBS replay-buffer duration and applies an explicit Desktop replay folder', async () => {
    obs.request.mockImplementation(async (type: string, data?: Record<string, unknown>) => {
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Cricket Match Streaming' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetProfileParameter') return { parameterValue: data?.parameterName === 'Mode' ? 'Advanced' : '14' };
      if (type === 'GetRecordDirectory') return { recordDirectory: 'C:/Users/Alex/Videos' };
      if (type === 'SetRecordDirectory' || type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });

    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 0,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 30,
      replayDirectory: 'C:/Users/Alex/Desktop/Cricket Replays',
    });

    expect(obs.request).toHaveBeenCalledWith('GetProfileParameter', { parameterCategory: 'AdvOut', parameterName: 'RecRBTime' });
    expect(obs.request).toHaveBeenCalledWith('SetRecordDirectory', { recordDirectory: 'C:/Users/Alex/Desktop/Cricket Replays' });
    expect(result.replayDurationSeconds).toBe(14);
    expect(result.replayDirectory).toBe('C:/Users/Alex/Desktop/Cricket Replays');
    expect(obsStreamingPresetService.getPresetReplayButtons(result.replayDurationSeconds).find(button => button.id === 'cricket-preset-instant-replay')?.series?.[2].delayMs).toBe(14_000);
  });

  it('uses the exact versioned capture kind advertised by OBS', async () => {
    obs.request.mockImplementation(async (type: string, data?: Record<string, unknown>) => {
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Cricket Match Streaming' };
      if (type === 'GetSceneList') return { scenes: [] };
      if (type === 'GetInputList') return { inputs: [] };
      if (type === 'GetInputKindList') return { inputKinds: ['av_capture_input_v2'] };
      if (type === 'GetVersion') return { platform: 'macos' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      if (type === 'CreateInput' && data?.inputName === 'Cricket Camera 1') return {};
      return {};
    });

    const result = await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 0,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
    });

    expect(obs.request).toHaveBeenCalledWith('GetInputKindList');
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputName: 'Cricket Camera 1', inputKind: 'av_capture_input_v2' }));
    expect(result.warnings.some(warning => warning.includes('Cricket Camera 1'))).toBe(false);
  });

  it('removes stale generated camera/mobile sources and scenes when counts shrink', async () => {
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetSceneCollectionList') return { sceneCollections: ['Cricket Match Streaming'], currentSceneCollectionName: 'Cricket Match Streaming' };
      if (type === 'GetSceneList') return { scenes: [
        'Cricket - Camera 2',
        'Cricket - Mobile Camera 1',
        'Cricket - Live',
        'Cricket - Audio',
        'Cricket - Replay',
        'Cricket - DRS',
        'Cricket - Starting Soon',
      ].map(sceneName => ({ sceneName })) };
      if (type === 'GetInputList') return { inputs: [
        { inputName: 'Cricket Camera 2', inputKind: 'dshow_input' },
        { inputName: 'Cricket Overlay Camera 2', inputKind: 'browser_source' },
        { inputName: 'Cricket DroidCam 1', inputKind: 'droidcam_obs' },
        { inputName: 'Cricket Overlay Mobile 1', inputKind: 'browser_source' },
      ] };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input', 'browser_source', 'ffmpeg_source', 'vlc_source'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      return {};
    });

    await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1,
      mobileCameraCount: 0,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
      overlayUrl: 'http://localhost/tenant/cricket/scorer/obs-overlay',
    });

    expect(obs.request).toHaveBeenCalledWith('RemoveInput', { inputName: 'Cricket Camera 2' });
    expect(obs.request).toHaveBeenCalledWith('RemoveInput', { inputName: 'Cricket Overlay Camera 2' });
    expect(obs.request).toHaveBeenCalledWith('RemoveInput', { inputName: 'Cricket DroidCam 1' });
    expect(obs.request).toHaveBeenCalledWith('RemoveScene', { sceneName: 'Cricket - Camera 2' });
    expect(obs.request).toHaveBeenCalledWith('RemoveScene', { sceneName: 'Cricket - Mobile Camera 1' });
  });

  it('reconciles increased and decreased counts across repeated Match Setup runs', async () => {
    let collectionExists = false;
    const scenes = new Set<string>();
    const inputs = new Map<string, string>();
    const items = new Map<string, Set<string>>();
    obs.request.mockImplementation(async (type: string, data?: Record<string, unknown>) => {
      const sceneName = String(data?.sceneName || '');
      const inputName = String(data?.inputName || '');
      if (type === 'GetSceneCollectionList') return { sceneCollections: collectionExists ? ['Cricket Match Streaming'] : [], currentSceneCollectionName: collectionExists ? 'Cricket Match Streaming' : 'Scene' };
      if (type === 'CreateSceneCollection') { collectionExists = true; return {}; }
      if (type === 'GetSceneList') return { scenes: [...scenes].map(sceneName => ({ sceneName })) };
      if (type === 'CreateScene') { scenes.add(sceneName); return {}; }
      if (type === 'RemoveScene') { scenes.delete(sceneName); items.delete(sceneName); return {}; }
      if (type === 'GetInputList') return { inputs: [...inputs].map(([inputName, inputKind]) => ({ inputName, inputKind })) };
      if (type === 'GetInputKindList') return { inputKinds: ['dshow_input', 'browser_source', 'ffmpeg_source', 'vlc_source', 'droidcam_obs'] };
      if (type === 'GetVersion') return { platform: 'windows' };
      if (type === 'GetSpecialInputs') return {};
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetSceneItemList') return { sceneItems: [...(items.get(sceneName) || [])].map(sourceName => ({ sourceName, sceneItemId: sourceName.length })) };
      if (type === 'CreateInput') {
        inputs.set(inputName, String(data?.inputKind));
        if (sceneName) items.set(sceneName, new Set([...(items.get(sceneName) || []), inputName]));
        return {};
      }
      if (type === 'CreateSceneItem') {
        items.set(sceneName, new Set([...(items.get(sceneName) || []), String(data?.sourceName)]));
        return {};
      }
      if (type === 'RemoveInput') {
        inputs.delete(inputName);
        for (const sceneItems of items.values()) sceneItems.delete(inputName);
        return {};
      }
      if (type === 'SetInputSettings' || type === 'SetCurrentSceneCollection' || type === 'SetCurrentProgramScene') return {};
      return {};
    });

    const setup = (cameraCount: number, mobileCameraCount: number) => obsStreamingPresetService.createCricketMatchSetup({
      cameraCount,
      mobileCameraCount,
      microphoneCount: 0,
      includeDesktopAudio: false,
      replayDurationSeconds: 10,
      overlayUrl: 'http://localhost/tenant/cricket/scorer/obs-overlay',
    });

    await setup(1, 0);
    await setup(2, 1);
    expect(inputs.has('Cricket Camera 1')).toBe(true);
    expect(inputs.has('Cricket Camera 2')).toBe(true);
    expect(inputs.has('Cricket DroidCam 1')).toBe(true);
    expect(scenes.has('Cricket - Camera 2')).toBe(true);
    expect(obs.request.mock.calls.filter(([type, data]) => type === 'CreateInput' && (data as Record<string, unknown>).inputName === 'Cricket Camera 1')).toHaveLength(1);

    await setup(1, 0);
    expect(inputs.has('Cricket Camera 1')).toBe(true);
    expect(inputs.has('Cricket Camera 2')).toBe(false);
    expect(inputs.has('Cricket DroidCam 1')).toBe(false);
    expect(scenes.has('Cricket - Camera 2')).toBe(false);
    expect(scenes.has('Cricket - Mobile Camera 1')).toBe(false);
  });
});
