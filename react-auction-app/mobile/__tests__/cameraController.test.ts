jest.mock('../src/native', () => ({
  StudioEngine: {
    prepare: jest.fn(async () => undefined), release: jest.fn(async () => undefined),
    setPreviewFill: jest.fn(async () => undefined), setMuted: jest.fn(async () => undefined),
    setOverlays: jest.fn(async () => undefined), setOverlayOptions: jest.fn(async () => undefined),
    getZoomRange: jest.fn(async () => ({ min: 1, max: 8 })), getExposureRange: jest.fn(async () => ({ min: -3, max: 3, step: 1 })),
    setZoom: jest.fn(async () => undefined),
    startRecording: jest.fn(async () => '/private/Camera.mp4'), pauseRecording: jest.fn(async () => undefined), resumeRecording: jest.fn(async () => undefined),
    finishCameraRecording: jest.fn(async () => '/private/Camera.mp4'), saveRecordingToGallery: jest.fn(async () => 'content://media/external/video/1'),
    captureRawStill: jest.fn(async () => '/private/RAW.dng'), syncOverlayAssets: jest.fn(async () => JSON.stringify({ files: 4, bytes: 1000 })), reloadOverlays: jest.fn(async () => undefined),
    getPendingCameraMedia: jest.fn(async () => []), discardCameraMedia: jest.fn(async () => undefined),
  },
  StudioSystem: { getFreeStorageMb: jest.fn(async () => 2000), setKeepScreenOn: jest.fn(async () => undefined) },
  StudioSecure: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));
jest.mock('../src/services/streamController', () => ({
  queueEngineTask: (operation: () => Promise<unknown>) => operation(), refreshCapabilities: jest.fn(async () => null),
}));
jest.mock('../src/services/permissions', () => ({ requestGalleryPermission: jest.fn(async () => true), requestMediaPermissions: jest.fn(async () => ({ granted: true })) }));
jest.mock('../src/services/tournament', () => ({ subscribeProfile: jest.fn(() => jest.fn()), subscribeActiveMatch: jest.fn(() => jest.fn()) }));
jest.mock('../src/services/cameraHighlights', () => ({ startBoundaryHighlights: jest.fn(() => jest.fn()), retryCameraHighlights: jest.fn(async () => undefined) }));
jest.mock('../src/native/views', () => ({ StudioPreview: 'StudioPreview' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('lucide-react-native', () => Object.fromEntries(['ArrowLeft', 'Download', 'FlipHorizontal2', 'Grid3X3', 'Image', 'Layers', 'Mic', 'MicOff', 'Pause', 'Play', 'RefreshCw', 'Settings2', 'SlidersHorizontal', 'Zap', 'ZapOff', 'X'].map(name => [name, name])));

import { StudioEngine, StudioSystem } from '../src/native';
import { applyCameraOverlays, discardPendingCameraMedia, pauseOrResumeCamera, prepareCamera, startCameraRecording, startCameraSync, stopCameraRecording, syncCameraAssets, takeCameraRaw } from '../src/services/cameraController';
import { subscribeActiveMatch, subscribeProfile } from '../src/services/tournament';
import { useCamera } from '../src/store/cameraStore';
import { useNav } from '../src/store/navStore';
import { useSettings } from '../src/store/settingsStore';
import { useStudio } from '../src/store/studioStore';
import { defaultStudioProfile } from '../src/shared/studioProfile';
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CameraScreen } from '../src/screens/CameraScreen';
import { sliderShouldCaptureGesture, sliderValueFromOffset } from '../src/ui/primitives';
import { PanResponder, ScrollView, Text } from 'react-native';

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  useCamera.setState(useCamera.getInitialState()); useNav.setState(useNav.getInitialState());
  useSettings.setState(useSettings.getInitialState()); useStudio.setState(useStudio.getInitialState());
  useNav.getState().setWorkspace('recording');
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

describe('Camera controller', () => {
  it('maps slider drags to the current range and respects exact endpoints and steps', () => {
    expect(sliderValueFromOffset(0, 100, 1, 8)).toBe(1);
    expect(sliderValueFromOffset(100, 100, 1, 8)).toBe(8);
    expect(sliderValueFromOffset(50, 100, 1, 8, 0.5)).toBe(4.5);
    expect(sliderValueFromOffset(25, 0, 1, 8)).toBe(1);
  });
  it('lets vertical scrolling win while taking predominantly horizontal slider drags', () => {
    expect(sliderShouldCaptureGesture(2, 14)).toBe(false);
    expect(sliderShouldCaptureGesture(20, 5)).toBe(true);
    expect(sliderShouldCaptureGesture(3, 0)).toBe(false);
  });

  it('uses recording settings without changing Host settings or destinations', async () => {
    const previous = useSettings.getState();
    expect(await prepareCamera()).toBe(true);
    const config = JSON.parse(jest.mocked(StudioEngine.prepare).mock.calls[0][0]);
    expect(config.video).toMatchObject({ adaptive: false, rotation: 90, codec: 'h264' });
    expect(useSettings.getState().video).toEqual(previous.video);
    expect(useSettings.getState().destinations).toEqual(previous.destinations);
  });
  it('chooses the current screen frame automatically for portrait and landscape capture', async () => {
    expect(await prepareCamera('landscape')).toBe(true);
    expect(JSON.parse(jest.mocked(StudioEngine.prepare).mock.calls.at(-1)![0])).toMatchObject({ video: { rotation: 0 }, autoOrientation: true });
    useCamera.setState({ ready: false, preparedSignature: null });
    useStudio.setState({ preparedSignature: null });
    expect(await prepareCamera('portrait')).toBe(true);
    expect(JSON.parse(jest.mocked(StudioEngine.prepare).mock.calls.at(-1)![0])).toMatchObject({ video: { rotation: 90 }, autoOrientation: true });
  });
  it.each([{ engineState: 'live' as const }, { cameraServerUrl: 'rtsp://phone:8554/live' }])('does not acquire an active Host or Connector camera', async state => {
    useStudio.setState(state);
    expect(await prepareCamera()).toBe(false);
    expect(StudioEngine.prepare).not.toHaveBeenCalled();
  });
  it('records, pauses/resumes and saves exactly one finalized clip', async () => {
    useCamera.setState({ ready: true });
    await startCameraRecording(); await pauseOrResumeCamera();
    expect(useCamera.getState().session.status).toBe('paused');
    await pauseOrResumeCamera(); await stopCameraRecording();
    expect(StudioEngine.pauseRecording).toHaveBeenCalledTimes(1);
    expect(StudioEngine.resumeRecording).toHaveBeenCalledTimes(1);
    expect(StudioEngine.finishCameraRecording).toHaveBeenCalledTimes(1);
    expect(useCamera.getState()).toMatchObject({ session: { status: 'idle' }, lastGalleryUri: 'content://media/external/video/1' });
  });
  it('retains a finalized clip on Gallery failure and retries without stopping twice', async () => {
    useCamera.setState({ ready: true }); await startCameraRecording();
    jest.mocked(StudioEngine.saveRecordingToGallery).mockRejectedValueOnce(new Error('storage full'));
    await expect(stopCameraRecording()).rejects.toThrow('storage full');
    expect(useCamera.getState().session).toMatchObject({ status: 'saving', path: '/private/Camera.mp4' });
    await stopCameraRecording();
    expect(StudioEngine.finishCameraRecording).toHaveBeenCalledTimes(1);
    expect(StudioEngine.saveRecordingToGallery).toHaveBeenCalledTimes(2);
  });
  it('blocks reconfiguration and asset downloads while paused', async () => {
    useCamera.setState({ ready: true }); await startCameraRecording(); await pauseOrResumeCamera();
    await prepareCamera();
    await expect(syncCameraAssets()).rejects.toThrow('Stop and save');
    expect(StudioEngine.prepare).not.toHaveBeenCalled(); expect(StudioEngine.syncOverlayAssets).not.toHaveBeenCalled();
  });
  it('rejects low storage before starting the encoder', async () => {
    useCamera.setState({ ready: true }); jest.mocked(StudioSystem.getFreeStorageMb).mockResolvedValueOnce(100);
    await expect(startCameraRecording()).rejects.toThrow('500 MB');
    expect(StudioEngine.startRecording).not.toHaveBeenCalled(); expect(useCamera.getState().busy).toBe(false);
  });
  it('follows Camera on-air changes without using the Host match', async () => {
    const workspace = { origin: 'https://app.example', tenantId: 'camera_tenant', slug: 'league', game: 'cricket' as const };
    useSettings.setState({ camera: { ...useSettings.getState().camera, workspace }, pairing: { tenantId: 'host_tenant', slug: 'other', game: 'football', matchId: 'host_match' } });
    useCamera.setState({ ready: true });
    const stop = startCameraSync(workspace);
    jest.mocked(subscribeProfile).mock.calls[0][2](defaultStudioProfile('cricket'));
    jest.mocked(subscribeActiveMatch).mock.calls[0][2]('match_2');
    await applyCameraOverlays();
    const specs = JSON.parse(jest.mocked(StudioEngine.setOverlays).mock.calls.at(-1)![0]);
    expect(specs[0].url).toContain('/league/'); expect(specs[0].url).toContain('match_2'); expect(specs[0].url).not.toContain('host_match');
    stop();
  });
  it('sends the live portrait transform and reduced overlay size to the compositor', async () => {
    const workspace = { origin: 'https://app.example', tenantId: 'camera_tenant', slug: 'league', game: 'cricket' as const };
    useSettings.setState({ camera: { ...useSettings.getState().camera, workspace, overlayScalePct: 60, overlayRotation: 'auto' } });
    await prepareCamera('portrait');
    useCamera.setState({ activeMatchId: 'match_2' });
    await applyCameraOverlays();
    const specs = JSON.parse(jest.mocked(StudioEngine.setOverlays).mock.calls.at(-1)![0]);
    expect(specs[0]).toMatchObject({ rotation: 90, scalePct: 60, offsetXPct: 0, offsetYPct: 0 });
  });
  it('saves a genuine RAW photo separately from the video recorder', async () => {
    useCamera.setState({ ready: true }); await takeCameraRaw();
    expect(StudioEngine.captureRawStill).toHaveBeenCalledTimes(1);
    expect(StudioEngine.startRecording).not.toHaveBeenCalled();
    expect(StudioEngine.saveRecordingToGallery).toHaveBeenCalledWith('/private/RAW.dng');
  });

  it('recovers an interrupted private file and supports explicit discard', async () => {
    jest.mocked(StudioEngine.getPendingCameraMedia).mockResolvedValueOnce(['/private/Camera_interrupted.mp4']);
    expect(await prepareCamera()).toBe(true);
    expect(useCamera.getState().session).toMatchObject({ status: 'saving', path: '/private/Camera_interrupted.mp4' });
    await discardPendingCameraMedia();
    expect(StudioEngine.discardCameraMedia).toHaveBeenCalledWith('/private/Camera_interrupted.mp4');
    expect(useCamera.getState().session.status).toBe('idle');
  });

  it('does not discard a live recording', async () => {
    useCamera.setState({ ready: true }); await startCameraRecording(); await discardPendingCameraMedia();
    expect(StudioEngine.discardCameraMedia).not.toHaveBeenCalled();
  });

  it('syncs the Camera origin and custom package without downloading twice for duplicate URLs', async () => {
    const workspace = { origin: 'https://app.example', tenantId: 'tenant_1', slug: 'league', game: 'cricket' as const };
    useSettings.setState({ camera: { ...useSettings.getState().camera, workspace, packageUrl: 'https://app.example/camera-overlay-manifest.json' } });
    await syncCameraAssets();
    expect(StudioEngine.syncOverlayAssets).toHaveBeenCalledTimes(1);
    expect(useSettings.getState().camera.assetSync).toMatchObject({ files: 4, bytes: 1000 });
  });

  it('renders a recording-only shutter and pause/resume controls', async () => {
    let screen: renderer.ReactTestRenderer;
    await act(async () => { screen = renderer.create(React.createElement(CameraScreen)); });
    const shutter = () => screen!.root.findByProps({ testID: 'camera-shutter' });
    expect(shutter().props.accessibilityLabel).toBe('Record video');
    expect(JSON.stringify(screen!.toJSON())).not.toContain('RAW');
    expect(screen!.root.findAllByProps({ accessibilityLabel: 'Camera zoom' })).toHaveLength(0);
    await act(async () => { shutter().props.onPress(); });
    expect(shutter().props.accessibilityLabel).toBe('Stop recording and save to Gallery');
    await act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Pause recording' }).props.onPress(); });
    expect(screen!.root.findByProps({ accessibilityLabel: 'Resume recording' })).toBeTruthy();
    await act(async () => { shutter().props.onPress(); });
    expect(useCamera.getState().lastGalleryUri).toBe('content://media/external/video/1');
    await act(async () => screen!.unmount());
  });

  it('opens one centered framing panel with all transform controls and no scrolling', async () => {
    let screen: renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => { screen = renderer.create(React.createElement(CameraScreen)); });
      await act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Camera settings' }).props.onPress(); });
      const framingButton = screen!.root.findAll(node => node.props.accessibilityRole === 'button')
        .find(node => node.findAllByType(Text).some(item => item.props.children === 'Adjust overlay framing in preview'));
      expect(framingButton).toBeTruthy();
      await act(async () => { framingButton!.props.onPress(); });
      const panel = screen!.root.findByProps({ accessibilityLabel: 'Overlay framing controls' });
      expect(panel.findByProps({ accessibilityLabel: 'Overlay size' })).toBeTruthy();
      expect(panel.findByProps({ accessibilityLabel: 'Overlay horizontal position' })).toBeTruthy();
      expect(panel.findByProps({ accessibilityLabel: 'Overlay vertical position' })).toBeTruthy();
      expect(screen!.root.findAllByType(ScrollView)).toHaveLength(0);
    } finally { if (screen) await act(async () => screen!.unmount()); }
  });

  it('keeps overlay framing available from the selected preset when camera permission is unavailable', async () => {
    jest.mocked(StudioEngine.prepare).mockRejectedValueOnce(new Error('Camera permission denied'));
    let screen: renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => { screen = renderer.create(React.createElement(CameraScreen)); });
      await act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Camera settings' }).props.onPress(); });
      const framingButton = screen!.root.findAll(node => node.props.accessibilityRole === 'button')
        .find(node => node.findAllByType(Text).some(item => item.props.children === 'Adjust overlay framing in preview'));
      expect(framingButton).toBeTruthy();
      await act(async () => { framingButton!.props.onPress(); });
      expect(screen!.root.findByProps({ accessibilityLabel: 'Overlay framing controls' })).toBeTruthy();
      expect(screen!.root.findAllByProps({ accessibilityLabel: 'Overlay size' }).length).toBeGreaterThan(0);
    } finally { if (screen) await act(async () => screen!.unmount()); }
  });

  it('hides zoom until Camera controls open and applies zoom while dragging', async () => {
    const frames: Array<(timestamp: number) => void> = [];
    const requestFrame = globalThis.requestAnimationFrame;
    const responderFactory = jest.spyOn(PanResponder, 'create').mockImplementation(handlers => ({
      panHandlers: {
        onStartShouldSetResponder: handlers.onStartShouldSetPanResponder,
        onMoveShouldSetResponder: handlers.onMoveShouldSetPanResponder,
        onResponderGrant: (event: { nativeEvent: { locationX: number; pageX: number } }) => handlers.onPanResponderGrant?.(event as never, { dx: 0, dy: 0 } as never),
        onResponderMove: (event: { nativeEvent: { pageX: number } }) => handlers.onPanResponderMove?.(event as never, { dx: event.nativeEvent.pageX - 100, dy: 0 } as never),
        onResponderRelease: (event: { nativeEvent: { pageX: number } }) => handlers.onPanResponderRelease?.(event as never, { dx: event.nativeEvent.pageX - 100, dy: 0 } as never),
        onResponderTerminate: () => undefined,
        onResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => true,
      },
      getInteractionHandle: () => undefined,
    } as unknown as ReturnType<typeof PanResponder.create>));
    globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    let screen: renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => { screen = renderer.create(React.createElement(CameraScreen)); });
      expect(screen!.root.findAllByProps({ accessibilityLabel: 'Camera zoom' })).toHaveLength(0);
      await act(async () => { screen!.root.findByProps({ accessibilityLabel: 'Camera controls' }).props.onPress(); });
      let zoomSlider = screen!.root.findByProps({ accessibilityLabel: 'Camera zoom' });
      act(() => zoomSlider.props.onLayout({ nativeEvent: { layout: { width: 100 } } }));
      await act(async () => {
        zoomSlider.props.onResponderGrant({ nativeEvent: { locationX: 0, pageX: 100 } });
        zoomSlider.props.onResponderMove({ nativeEvent: { pageX: 150 } });
      });
      expect(frames).toHaveLength(1);
      await act(async () => { while (frames.length) frames.shift()!(16); });
      expect(StudioEngine.setZoom).toHaveBeenCalledWith(4.5);
      zoomSlider = screen!.root.findByProps({ accessibilityLabel: 'Camera zoom' });
      expect(zoomSlider.props.accessibilityValue.now).toBe(4.5);
    } finally {
      if (screen) await act(async () => screen!.unmount());
      responderFactory.mockRestore(); globalThis.requestAnimationFrame = requestFrame;
    }
  });
});