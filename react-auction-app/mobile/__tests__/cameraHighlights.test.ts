const mockListeners = new Map<string, (snapshot: { val: () => unknown }) => void>();
const mockFiles = new Map<string, unknown>();
jest.mock('../src/native', () => ({
  StudioEngine: {
    configureReplay: jest.fn(async () => undefined),
    captureHighlight: jest.fn(async () => JSON.stringify({ path: '/private/highlight.mp4', durationMs: 10000, bytes: 12345 })),
    saveHighlightToGallery: jest.fn(async () => 'content://media/video/1'),
    uploadHighlight: jest.fn(async () => 'https://firebasestorage.googleapis.com/clip'),
    discardHighlight: jest.fn(async () => undefined),
  },
}));
jest.mock('../src/services/firebase', () => ({ getDb: () => ({}) }));
jest.mock('../src/services/storage', () => ({ storage: {
  getJson: jest.fn(async (key: string, fallback: unknown) => mockFiles.get(key) ?? fallback),
  setJson: jest.fn(async (key: string, value: unknown) => { mockFiles.set(key, JSON.parse(JSON.stringify(value))); }),
} }));
jest.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }), limitToLast: (count: number) => ({ count }), query: (source: unknown) => source,
  onValue: (source: { path: string }, callback: (snapshot: { val: () => unknown }) => void) => { mockListeners.set(source.path, callback); return () => mockListeners.delete(source.path); },
  get: jest.fn(async () => ({ val: () => null })),
  set: jest.fn(async () => undefined),
  runTransaction: jest.fn(async (_source, update: (value: unknown) => unknown) => { const value = update(null); return { committed: value !== undefined, snapshot: { val: () => value } }; }),
}));

import { StudioEngine } from '../src/native';
import { runTransaction } from 'firebase/database';
import { retryCameraHighlights, startBoundaryHighlights } from '../src/services/cameraHighlights';
import { useCamera } from '../src/store/cameraStore';
import { useSettings } from '../src/store/settingsStore';
import { startRecordingSession } from '../src/shared/cameraRecording';

const workspace = { tenantId: 'tenant_1', slug: 'league', origin: 'https://app.example', game: 'cricket' as const };
const optionsPath = 'tenants/tenant_1/mobileStudio/cricket/highlightOptions';
const triggerPath = 'tenants/tenant_1/scoring/matches/match_1/replayTrigger';
const emit = (path: string, value: unknown) => mockListeners.get(path)?.({ val: () => value });
async function flush() { for (let index = 0; index < 40; index++) await Promise.resolve(); }

beforeEach(() => {
  jest.useFakeTimers({ now: 20000 }); jest.clearAllMocks(); mockListeners.clear(); mockFiles.clear();
  useCamera.setState(useCamera.getInitialState()); useSettings.setState(useSettings.getInitialState());
  useSettings.setState({ camera: { ...useSettings.getState().camera, highlightCapture: true, highlightCloudUpload: true } });
  useCamera.setState({ activeMatchId: 'match_1', session: startRecordingSession('/private/full.mp4', 10000) });
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('Camera boundary replay capture', () => {
  it('does not enable replay or watch triggers until scorer admin enables it', () => {
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, null);
    expect(StudioEngine.configureReplay).toHaveBeenCalledWith(0);
    expect(mockListeners.has(triggerPath)).toBe(false);
    stop();
  });
  it('does not trust remote capture/upload settings without local phone consent', async () => {
    useSettings.setState({ camera: { ...useSettings.getState().camera, highlightCapture: false, highlightCloudUpload: false } });
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, { enabled: true, upload: true });
    expect(mockListeners.has(triggerPath)).toBe(false);
    expect(StudioEngine.configureReplay).toHaveBeenLastCalledWith(0);
    await flush();
    expect(StudioEngine.captureHighlight).not.toHaveBeenCalled();
    expect(StudioEngine.uploadHighlight).not.toHaveBeenCalled();
    stop();
  });
  it('captures one fresh boundary while recording continues and stores media outside RTDB', async () => {
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, { enabled: true, seconds: 20, upload: true });
    const boundary = { id: 'ball_1', type: 'four', timestamp: 19500 };
    emit(triggerPath, boundary); emit(triggerPath, { ...boundary, consumed: true });
    await flush();
    expect(StudioEngine.captureHighlight).toHaveBeenCalledTimes(1);
    expect(StudioEngine.captureHighlight).toHaveBeenCalledWith(20, 500, expect.any(String));
    expect(StudioEngine.saveHighlightToGallery).toHaveBeenCalledTimes(1);
    expect(StudioEngine.uploadHighlight).toHaveBeenCalledWith('/private/highlight.mp4', expect.stringContaining('tenants/tenant_1/highlights/match_1/'));
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(useCamera.getState().session.status).toBe('recording');
    expect(useCamera.getState().pendingHighlightUploads).toBe(0);
    stop();
  });
  it('ignores history, wickets and paused capture', async () => {
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, { enabled: true });
    emit(triggerPath, { id: 'old_ball', type: 'six', timestamp: 9000 });
    emit(triggerPath, { id: 'wicket', type: 'wicket', timestamp: 19000 });
    useCamera.setState({ session: { ...useCamera.getState().session, status: 'paused' } });
    emit(triggerPath, { id: 'ball_2', type: 'six', timestamp: 19500 });
    await flush();
    expect(StudioEngine.captureHighlight).not.toHaveBeenCalled();
    stop();
  });
  it('never subscribes across paths for a malformed on-air match id', () => {
    useCamera.setState({ activeMatchId: '../another_tenant' });
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, { enabled: true });
    expect([...mockListeners.keys()].some(path => path.includes('../'))).toBe(false);
    stop();
  });
  it('retains a Gallery-backed file on Storage failure and retries without capturing again', async () => {
    const stop = startBoundaryHighlights(workspace);
    emit(optionsPath, { enabled: true, upload: true });
    jest.mocked(StudioEngine.uploadHighlight).mockRejectedValueOnce(new Error('network unavailable'));
    emit(triggerPath, { id: 'ball_3', type: 'six', timestamp: 19500 });
    await flush();
    expect(useCamera.getState().pendingHighlightUploads).toBe(1);
    expect(StudioEngine.discardHighlight).not.toHaveBeenCalled();
    await retryCameraHighlights();
    expect(StudioEngine.captureHighlight).toHaveBeenCalledTimes(1);
    expect(StudioEngine.saveHighlightToGallery).toHaveBeenCalledTimes(1);
    expect(StudioEngine.discardHighlight).toHaveBeenCalledTimes(1);
    expect(useCamera.getState().pendingHighlightUploads).toBe(0);
    stop();
  });
});