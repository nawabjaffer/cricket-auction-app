import { DEFAULT_CAMERA_SETTINGS, emptyRecordingSession, pauseRecordingSession, recordedDurationMs, recordingBusy, resolveCameraOverlayRotation, resumeRecordingSession, startRecordingSession } from '../src/shared/cameraRecording';

describe('standalone camera recording', () => {
  it('defaults to automatic orientation and a mobile-sized overlay', () => {
    expect(DEFAULT_CAMERA_SETTINGS).toMatchObject({ orientation: 'auto', orientationConfigured: true, overlayScalePct: 45 });
  });
  it('auto-rotates overlay pages only when their aspect differs from the recording frame', () => {
    expect(resolveCameraOverlayRotation('auto', 1920, 1080, 'portrait')).toBe(90);
    expect(resolveCameraOverlayRotation('auto', 1080, 1920, 'portrait')).toBe(0);
    expect(resolveCameraOverlayRotation('auto', 1920, 1080, 'landscape')).toBe(0);
    expect(resolveCameraOverlayRotation(270, 1920, 1080, 'portrait')).toBe(270);
  });

  it('starts idle without acquiring camera or streaming resources', () => {
    expect(emptyRecordingSession()).toMatchObject({ status: 'idle', path: null });
    expect(recordingBusy(emptyRecordingSession())).toBe(false);
  });
  it('excludes pause intervals from the recorded duration', () => {
    const started = startRecordingSession('/private/video.mp4', 1000);
    const paused = pauseRecordingSession(started, 5000);
    expect(recordedDurationMs(paused, 9000)).toBe(4000);
    const resumed = resumeRecordingSession(paused, 10000);
    expect(recordedDurationMs(resumed, 13000)).toBe(7000);
    expect(resumed.pausedMs).toBe(5000);
  });
  it('does not double-count duplicate pause/resume commands', () => {
    const paused = pauseRecordingSession(startRecordingSession('/private/video.mp4', 1000), 2000);
    expect(pauseRecordingSession(paused, 4000)).toBe(paused);
    const resumed = resumeRecordingSession(paused, 5000);
    expect(resumeRecordingSession(resumed, 7000)).toBe(resumed);
    expect(recordingBusy(resumed)).toBe(true);
    expect(recordingBusy({ ...resumed, status: 'saving' })).toBe(true);
  });

  it('supports a zero start time and freezes the finalized duration while saving', () => {
    const session = startRecordingSession('/private/video.mp4', 0);
    expect(recordedDurationMs(session, 1000)).toBe(1000);
    expect(recordedDurationMs({ ...session, status: 'saving', pausedAt: 1500 }, 6000)).toBe(1500);
  });
});