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
import { getDockReplayButtons } from '../utils/obsReplayConfig';
import {
  CRICKET_REPLAY_INPUT,
  CRICKET_CAMERA_REPLAY_SCENE,
  CRICKET_REPLAY_SCENE,
  CRICKET_REPLAY_MEDIA_INPUT,
  CRICKET_DRS_MEDIA_INPUT,
  CRICKET_REPLAY_SPEED_PERCENT,
  CRICKET_REPLAY_VLC_SCENE,
  CRICKET_HIGHLIGHTS_SCENE,
  CRICKET_HIGHLIGHTS_INPUT,
  CRICKET_SUPER_MOVEMENTS_CONTROL,
  inferDesktopReplayDirectory,
  obsStreamingPresetService,
} from '../services/obsStreamingPresetService';

describe('OBS replay actions', () => {
  it('filters hidden/disabled dock buttons and resolves current DRS frame settings', () => {
    const buttons = obsStreamingPresetService.getPresetReplayButtons(20);
    buttons.find(button => button.id === 'cricket-preset-buffer-stop')!.showInDock = false;
    buttons.find(button => button.id === 'cricket-preset-replay-save')!.enabled = false;
    const config = { buttons, drsFrameStep: 5, drsFramesPerSecond: 60 };
    const main = getDockReplayButtons(config, 'main');
    expect(main.some(button => button.id === 'cricket-preset-buffer-stop')).toBe(false);
    expect(main.some(button => button.id === 'cricket-preset-replay-save')).toBe(false);
    expect(main.some(button => button.id.startsWith('cricket-preset-drs-'))).toBe(false);
    const review = getDockReplayButtons(config, 'drs');
    expect(review.find(button => button.id === 'cricket-preset-drs-back-frame')).toMatchObject({ mediaFrameOffset: -5, mediaFramesPerSecond: 60 });
  });

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

  it('can pause a selected OBS media input as a replay-series action', async () => {
    const result = await obsReplaySourceService.executeButton({
      id: 'pause-media', label: 'Pause replay media', icon: '⏸', color: '#000', action: 'media_input_action', order: 0, enabled: true,
      inputName: 'Cricket Replay Media',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
    });

    expect(result.success).toBe(true);
    expect(obs.request).toHaveBeenCalledWith('TriggerMediaInputAction', {
      inputName: 'Cricket Replay Media',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
    });
  });

  it('seeks a replay media cursor and clamps the target to the clip bounds', async () => {
    obs.request.mockResolvedValueOnce({ mediaCursor: 10, mediaDuration: 1000 }).mockResolvedValueOnce({});
    const result = await obsReplaySourceService.executeButton({
      id: 'drs-back', label: 'Back one frame', icon: '◀|', color: '#000', action: 'media_input_seek', order: 0, enabled: true,
      inputName: CRICKET_REPLAY_MEDIA_INPUT,
      mediaCursorOffset: -33,
    });

    expect(result.success).toBe(true);
    expect(obs.request).toHaveBeenNthCalledWith(1, 'GetMediaInputStatus', { inputName: CRICKET_REPLAY_MEDIA_INPUT });
    expect(obs.request).toHaveBeenNthCalledWith(2, 'SetMediaInputCursor', { inputName: CRICKET_REPLAY_MEDIA_INPUT, mediaCursor: 0 });
  });

  it('cancels a running replay series between steps and reports the completed step', async () => {
    const controller = new AbortController();
    const progress: string[] = [];
    const result = await obsReplaySourceService.executeButton({
      id: 'instant', label: 'Instant Replay', icon: '↩', color: '#000', action: 'series', order: 0, enabled: true,
      series: [
        { id: 'save', action: 'replay_buffer_save', delayMs: 0 },
        { id: 'wait', action: 'scene_switch', sceneName: 'Cricket - Live', delayMs: 10_000 },
        { id: 'play', action: 'hotkey_name', hotkeyName: 'ReplaySource.play', delayMs: 0 },
      ],
    }, {
      signal: controller.signal,
      onProgress: update => {
        progress.push(`${update.stepIndex}:${update.status}`);
        if (update.stepIndex === 1 && update.status === 'waiting') controller.abort();
      },
    });

    expect(result).toMatchObject({ success: false, cancelled: true, completedSteps: 1, totalSteps: 3 });
    expect(result.errors).toContain('Cancelled by user.');
    expect(progress).toContain('0:completed');
    expect(progress).toContain('1:cancelled');
    expect(obs.request).toHaveBeenCalledTimes(1);
    expect(obs.triggerHotkeyByName).not.toHaveBeenCalled();
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

  it('returns to live when a replay series is cancelled while on replay', async () => {
    const controller = new AbortController();
    obs.request.mockImplementation(async (type: string) => type === 'GetCurrentProgramScene'
      ? { currentProgramSceneName: 'Replay' } : {});
    const result = await obsReplaySourceService.executeButton({
      id: 'replay', label: 'Replay', icon: 'R', color: '#000', action: 'series', returnToLiveSceneName: 'Live', order: 0, enabled: true,
      series: [
        { id: 'replay', action: 'scene_switch', sceneName: 'Replay', delayMs: 0 },
        { id: 'live', action: 'scene_switch', sceneName: 'Live', delayMs: 10_000 },
      ],
    }, { signal: controller.signal, onProgress: progress => { if (progress.status === 'waiting') controller.abort(); } });
    expect(result.cancelled).toBe(true);
    expect(obs.request).toHaveBeenLastCalledWith('SetCurrentProgramScene', { sceneName: 'Live' });
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

  it('adds an opt-in highlights VLC scene and a Super Movements replay sequence', async () => {
    await obsStreamingPresetService.createCricketMatchSetup({
      cameraCount: 1, mobileCameraCount: 0, microphoneCount: 0, includeDesktopAudio: false,
      replayDurationSeconds: 20, matchHighlightsEnabled: true, saveSuperMovements: true,
    });
    expect(obs.request).toHaveBeenCalledWith('CreateScene', { sceneName: CRICKET_HIGHLIGHTS_SCENE });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_HIGHLIGHTS_SCENE, inputName: CRICKET_HIGHLIGHTS_INPUT, inputKind: 'vlc_source' }));
    const config = { buttons: [], saveSuperMovements: true, matchHighlightsEnabled: true };
    const buttons = obsStreamingPresetService.getPresetReplayButtons(20, config);
    expect(buttons.find(button => button.id === 'cricket-preset-super-movement')?.series?.[0].action).toBe('super_movement_save');
    expect(buttons.find(button => button.id === 'cricket-preset-match-highlights')?.enabled).toBe(true);
    expect(getDockReplayButtons({ ...config, saveSuperMovements: false, buttons }, 'main').some(button => button.id === 'cricket-preset-super-movement')).toBe(false);
    obsStreamingPresetService.dispose();
  });

  it('requires the local script and verifies its acknowledgement for Super Movements', async () => {
    const requestId = 'a6e4c001-b9d3-44ec-9820-bf188fcb701e';
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(requestId);
    let reads = 0;
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetInputSettings') return { inputSettings: { text: JSON.stringify(++reads === 1
        ? { saveEnabled: true, readyAt: Date.now() }
        : { requestId, status: 'saved', savedPath: '/Super Movements/replay.mkv' }) } };
      return {};
    });
    await obsStreamingPresetService.saveSuperMovement();
    expect(obs.request).toHaveBeenCalledWith('SaveReplayBuffer');
    expect(obs.request).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({ inputName: CRICKET_SUPER_MOVEMENTS_CONTROL }));
    obs.request.mockResolvedValue({ inputSettings: { text: JSON.stringify({ saveEnabled: true, readyAt: 0 }) } });
    await expect(obsStreamingPresetService.saveSuperMovement()).rejects.toThrow('Load the Super Movements Python script');
    vi.restoreAllMocks();
  });

  it('recovers only managed replay scenes after the fallback timeout', async () => {
    vi.useFakeTimers();
    let notify: ((event: string, data: unknown) => void) | undefined;
    obs.onEvent.mockImplementation(callback => { notify = callback; return vi.fn(); });
    obs.request.mockResolvedValue({ currentProgramSceneName: CRICKET_REPLAY_SCENE });
    obsStreamingPresetService.configureLatestReplaySource(CRICKET_REPLAY_MEDIA_INPUT, 10, { liveSceneName: 'Live Camera' });
    notify?.('CurrentProgramSceneChanged', { sceneName: CRICKET_REPLAY_SCENE });
    await vi.advanceTimersByTimeAsync(22_000);
    expect(obs.request).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Live Camera' });
    obs.request.mockClear();
    notify?.('CurrentProgramSceneChanged', { sceneName: CRICKET_HIGHLIGHTS_SCENE });
    await vi.advanceTimersByTimeAsync(22_000);
    expect(obs.request).not.toHaveBeenCalled();
    obsStreamingPresetService.dispose();
    vi.useRealTimers();
  });

  it('pauses before stepping X frames at the configured frame rate', async () => {
    obs.request.mockImplementation(async (type: string) => type === 'GetMediaInputStatus'
      ? { mediaCursor: 1000, mediaDuration: 40_000 } : {});
    const result = await obsReplaySourceService.executeButton({
      id: 'frames', label: 'Reverse 5 frames', icon: 'R', color: '#000', action: 'media_input_seek', order: 0, enabled: true,
      inputName: CRICKET_DRS_MEDIA_INPUT, mediaFrameOffset: -5, mediaFramesPerSecond: 50,
    });
    expect(result.success).toBe(true);
    expect(obs.request).toHaveBeenNthCalledWith(1, 'TriggerMediaInputAction', expect.objectContaining({ mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' }));
    expect(obs.request).toHaveBeenLastCalledWith('SetMediaInputCursor', { inputName: CRICKET_DRS_MEDIA_INPUT, mediaCursor: 900 });
  });

  it('loads DRS only after the saved-file event and leaves it paused', async () => {
    const handlers: Array<(event: string, data: unknown) => void> = [];
    obs.onEvent.mockImplementation(handler => { handlers.push(handler); return () => {}; });
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'SaveReplayBuffer') queueMicrotask(() => handlers.forEach(handler => handler('ReplayBufferSaved', { savedReplayPath: '/replays/drs.mkv' })));
      if (type === 'GetReplayBufferStatus') return { outputActive: true };
      if (type === 'GetProfileParameter') return { parameterValue: '40' };
      if (type === 'GetMediaInputStatus') return { mediaDuration: 40_000 };
      return {};
    });
    const result = await obsReplaySourceService.executeButton({
      id: 'drs', label: 'DRS', icon: 'D', color: '#000', action: 'drs_review', order: 0, enabled: true,
      inputName: CRICKET_DRS_MEDIA_INPUT, sceneName: 'Cricket - DRS',
    });
    expect(result.success).toBe(true);
    expect(obs.request).toHaveBeenCalledWith('SetInputSettings', expect.objectContaining({ inputName: CRICKET_DRS_MEDIA_INPUT, inputSettings: expect.objectContaining({ local_file: '/replays/drs.mkv' }) }));
    expect(obs.request).toHaveBeenCalledWith('TriggerMediaInputAction', { inputName: CRICKET_DRS_MEDIA_INPUT, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' });
    expect(obs.request).toHaveBeenLastCalledWith('SetMediaInputCursor', { inputName: CRICKET_DRS_MEDIA_INPUT, mediaCursor: 0 });
  });

  it('cancels DRS capture without changing the program scene', async () => {
    const controller = new AbortController();
    obs.request.mockImplementation(async () => { controller.abort(); return {}; });
    await expect(obsStreamingPresetService.openDRSReview(CRICKET_DRS_MEDIA_INPUT, 'Cricket - DRS', controller.signal)).rejects.toThrow('Cancelled');
    expect(obs.request).not.toHaveBeenCalledWith('SetCurrentProgramScene', expect.anything());
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
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: CRICKET_REPLAY_SCENE, sourceName: CRICKET_CAMERA_REPLAY_SCENE });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: 'Cricket - DRS', inputName: CRICKET_DRS_MEDIA_INPUT, inputKind: 'ffmpeg_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ inputName: 'Cricket DRS Instant Replay Source', inputSettings: expect.objectContaining({ duration: 40_000 }) }));
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: CRICKET_CAMERA_REPLAY_SCENE, sourceName: 'Cricket - Camera 1' });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({
      sceneName: CRICKET_CAMERA_REPLAY_SCENE,
      inputName: 'Cricket Replay Media',
      inputKind: 'ffmpeg_source',
      inputSettings: expect.objectContaining({ speed_percent: 60, loop: false }),
    }));
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_REPLAY_VLC_SCENE, inputName: CRICKET_REPLAY_INPUT, inputKind: 'vlc_source' }));
    expect(obs.request).toHaveBeenCalledWith('CreateSceneItem', { sceneName: CRICKET_REPLAY_VLC_SCENE, sourceName: 'Cricket - Camera 1' });
    expect(obs.request).toHaveBeenCalledWith('CreateInput', expect.objectContaining({ sceneName: CRICKET_CAMERA_REPLAY_SCENE, inputName: 'Cricket Instant Replay Source', inputKind: 'replay_source' }));
    expect(obs.request).toHaveBeenCalledWith('StartReplayBuffer');
    expect(obs.request).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'Cricket - Live' });
    expect(result.scenes).toContain('Cricket - Audio');
    expect(result.scenes).toContain(CRICKET_REPLAY_SCENE);
    expect(result.scenes).toContain(CRICKET_CAMERA_REPLAY_SCENE);
    expect(result.scenes).toContain(CRICKET_REPLAY_VLC_SCENE);
    expect(result.warnings).toContain('Choose the intro/starting-soon clip in Cricket Starting Soon Media properties.');
    expect(result.replaySourceName).toBe('Cricket Replay Media');
    expect(result.replaySourceNames).toEqual(['Cricket Replay Media', CRICKET_REPLAY_INPUT]);
    const instantReplay = obsStreamingPresetService.getPresetReplayButtons(20).find(button => button.id === 'cricket-preset-instant-replay');
    expect(instantReplay?.series).toHaveLength(4);
    expect(instantReplay?.series?.[2]).toMatchObject({
      action: 'media_input_action',
      inputName: 'Cricket Replay Media',
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
      delayMs: Math.ceil(20_000 * 100 / CRICKET_REPLAY_SPEED_PERCENT),
    });
    expect(instantReplay?.series?.[3]).toMatchObject({ action: 'scene_switch', sceneName: 'Cricket - Live', delayMs: 0 });
    for (const id of [
      'cricket-preset-drs-play',
      'cricket-preset-drs-pause',
      'cricket-preset-drs-restart',
      'cricket-preset-drs-back-frame',
      'cricket-preset-drs-forward-frame',
      'cricket-preset-drs-back-second',
      'cricket-preset-drs-forward-second',
    ]) {
      expect(obsStreamingPresetService.getPresetReplayButtons(20).some(button => button.id === id)).toBe(true);
    }
  });

  it('loads the newest Replay Buffer file into the VLC source and restarts playback', async () => {
    let eventHandler: ((event: string, data: unknown) => void) | undefined;
    obs.onEvent.mockImplementation(handler => {
      eventHandler = handler;
      return () => {};
    });
    obs.request.mockImplementation(async (type: string) => {
      if (type === 'GetInputSettings') return { inputSettings: { loop: true, playlist: [] } };
      if (type === 'GetMediaInputStatus') return { mediaDuration: 40_000 };
      return {};
    });

    obsStreamingPresetService.configureLatestReplaySource(['Cricket Replay Media', CRICKET_REPLAY_INPUT]);
    eventHandler?.('ReplayBufferSaved', { savedReplayPath: 'D:/OBS/Replays/replay-01.mkv' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(obs.request).toHaveBeenCalledWith('SetInputSettings', {
      inputName: 'Cricket Replay Media',
      inputSettings: { local_file: 'D:/OBS/Replays/replay-01.mkv', is_local_file: true, speed_percent: 60, loop: false, restart_on_activate: true, close_when_inactive: false },
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
    expect(result.replayDurationSeconds).toBe(30);
    expect(result.replayDirectory).toBe('C:/Users/Alex/Desktop/Cricket Replays');
    expect(obsStreamingPresetService.getPresetReplayButtons(result.replayDurationSeconds).find(button => button.id === 'cricket-preset-instant-replay')?.series?.[2].delayMs).toBe(Math.ceil(30_000 * 100 / CRICKET_REPLAY_SPEED_PERCENT));
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
