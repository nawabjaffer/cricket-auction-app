import { onValue, ref, runTransaction, set } from 'firebase/database';
import { StudioEngine } from '../native';
import { useCamera } from '../store/cameraStore';
import { useSettings } from '../store/settingsStore';
import {
  DEFAULT_MOBILE_HIGHLIGHTS, highlightStoragePath, mobileHighlightOptionsPath, mobileHighlightsPath,
  normalizeMobileHighlights, parseBoundaryReplayTrigger, type MobileHighlight, type MobileHighlightOptions,
} from '../shared/mobileHighlights';
import { isSafeStudioId, type StudioPairing } from '../shared/studioProfile';
import { getDb } from './firebase';
import { storage } from './storage';

interface PendingHighlight {
  tenantId: string;
  clip: Omit<MobileHighlight, 'url'>;
  path: string;
  galleryUri?: string;
  url?: string;
  upload: boolean;
  limit: number;
}

const JOB_KEY = 'camera.highlightJobs.v1';
let jobsLock = Promise.resolve();
let uploadQueue = Promise.resolve();
let retrying = false;

async function updateJobs(change: (jobs: PendingHighlight[]) => PendingHighlight[]): Promise<void> {
  const next = jobsLock.then(async () => {
    const jobs = await storage.getJson<PendingHighlight[]>(JOB_KEY, []);
    const changed = change(Array.isArray(jobs) ? jobs : []);
    await storage.setJson(JOB_KEY, changed);
    useCamera.getState().patch({ pendingHighlightUploads: changed.length });
  });
  jobsLock = next.catch(() => undefined);
  return next;
}

function notice(error: unknown): void {
  useCamera.getState().patch({ notice: `Highlight retained on this phone: ${error instanceof Error ? error.message : String(error)}` });
}

async function processJob(job: PendingHighlight): Promise<void> {
  try {
    if (!job.galleryUri) {
      job.galleryUri = await StudioEngine.saveHighlightToGallery(job.path);
      await updateJobs(jobs => jobs.map(item => item.clip.id === job.clip.id ? job : item));
    }
    if (job.upload) {
      if (!useSettings.getState().camera.highlightCloudUpload) throw new Error('Cloud highlight upload is disabled on this phone. Enable it locally before retrying.');
      const source = ref(getDb(), mobileHighlightsPath(job.tenantId, job.clip.matchId));
      const reservation = await runTransaction(source, raw => {
        const clips = raw && typeof raw === 'object' ? raw as Record<string, MobileHighlight> : {};
        if (clips[job.clip.id]) return clips;
        if (Object.keys(clips).length >= job.limit) return undefined;
        return { ...clips, [job.clip.id]: { ...job.clip, status: 'uploading', url: '' } };
      }, { applyLocally: false });
      if (!reservation.committed) throw new Error('The cloud clip limit for this match is reached. Delete older clips in scorer admin before retrying.');
      const existing = reservation.snapshot.val() as Record<string, MobileHighlight>;
      if (existing[job.clip.id]?.url) job.url = existing[job.clip.id].url;
      if (!job.url) {
        job.url = await StudioEngine.uploadHighlight(job.path, job.clip.storagePath);
        await updateJobs(jobs => jobs.map(item => item.clip.id === job.clip.id ? job : item));
      }
      const published: MobileHighlight = { ...job.clip, url: job.url, status: 'ready' };
      await set(ref(getDb(), `${mobileHighlightsPath(job.tenantId, job.clip.matchId)}/${job.clip.id}`), published);
    }
    await StudioEngine.discardHighlight(job.path);
    await updateJobs(jobs => jobs.filter(item => item.clip.id !== job.clip.id));
    useCamera.getState().patch({ notice: job.upload ? 'Boundary highlight saved to Gallery and scorer admin' : 'Boundary highlight saved to Gallery' });
  } catch (error) { notice(error); }
}

export async function retryCameraHighlights(): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    await jobsLock;
    const jobs = await storage.getJson<PendingHighlight[]>(JOB_KEY, []);
    if (!Array.isArray(jobs)) return;
    for (const job of jobs) {
      uploadQueue = uploadQueue.then(() => processJob(job));
      await uploadQueue;
    }
  } finally { retrying = false; }
}

export function startBoundaryHighlights(workspace: StudioPairing): () => void {
  if (workspace.game !== 'cricket') return () => undefined;
  let options: MobileHighlightOptions = { ...DEFAULT_MOBILE_HIGHLIGHTS };
  let stopTrigger: (() => void) | undefined;
  let currentBinding = '';
  let serverOffset = 0;
  let closed = false;
  let capturing = 0;
  let replayWindow = -1;
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  void updateJobs(jobs => jobs);

  const bind = () => {
    const state = useCamera.getState();
    const matchId = workspace.matchId ?? state.activeMatchId;
    const binding = options.enabled && useSettings.getState().camera.highlightCapture && isSafeStudioId(matchId) && state.session.status === 'recording' ? `${matchId}:${state.session.startedAt}` : '';
    if (binding === currentBinding) return;
    stopTrigger?.(); currentBinding = binding;
    if (!binding || !matchId) return;
    const startedAt = state.session.startedAt;
    const countKey = `camera.highlightCount:${workspace.tenantId}:${matchId}`;
    if (!counts.has(matchId)) {
      counts.set(matchId, 0);
      void storage.getJson<number>(countKey, 0).then(value => { counts.set(matchId, Math.max(counts.get(matchId) ?? 0, Number.isFinite(value) ? value : 0)); });
    }
    stopTrigger = onValue(ref(getDb(), `tenants/${workspace.tenantId}/scoring/matches/${matchId}/replayTrigger`), snapshot => {
      if (closed) return;
      const now = Date.now() + serverOffset;
      const event = parseBoundaryReplayTrigger(snapshot.val(), startedAt + serverOffset, now);
      if (!event || seen.has(`${matchId}:${event.id}`)) return;
      seen.add(`${matchId}:${event.id}`);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      if (capturing >= 2 || (counts.get(matchId) ?? 0) + capturing >= options.maxClipsPerMatch || useCamera.getState().pendingHighlightUploads >= 8) {
        useCamera.getState().patch({ notice: 'Highlight limit reached. Save/retry existing clips before capturing more.' });
        return;
      }
      const settings = useSettings.getState();
      const id = `${event.timestamp.toString(36)}_${settings.deviceId}`.slice(0, 64);
      const upload = options.upload && settings.camera.highlightCloudUpload;
      const limit = options.maxClipsPerMatch;
      capturing++;
      void StudioEngine.captureHighlight(options.seconds, Math.max(0, now - event.timestamp), id).then(async raw => {
        const clip = JSON.parse(raw) as { path: string; durationMs: number; bytes: number };
        if (!clip.path || !Number.isFinite(clip.durationMs) || !Number.isFinite(clip.bytes) || clip.durationMs <= 0) throw new Error('Recorder returned an invalid highlight.');
        const job: PendingHighlight = {
          tenantId: workspace.tenantId, path: clip.path, upload, limit,
          clip: { id, matchId, deviceId: settings.deviceId, boundary: event.boundary, createdAt: event.timestamp, durationMs: clip.durationMs, bytes: clip.bytes, storagePath: highlightStoragePath(workspace.tenantId, matchId, settings.deviceId, id) },
        };
        const count = (counts.get(matchId) ?? 0) + 1;
        counts.set(matchId, count);
        await storage.setJson(countKey, count);
        await updateJobs(jobs => [...jobs.filter(item => item.clip.id !== id), job]);
        uploadQueue = uploadQueue.then(() => processJob(job));
      }).catch(notice).finally(() => { capturing--; });
    }, error => notice(error));
  };

  const refreshConsent = () => {
    const window = options.enabled && useSettings.getState().camera.highlightCapture ? options.seconds : 0;
    if (window !== replayWindow) { replayWindow = window; void StudioEngine.configureReplay(window).catch(notice); }
    bind();
  };
  const stopClock = onValue(ref(getDb(), '.info/serverTimeOffset'), snapshot => { serverOffset = Number(snapshot.val()) || 0; });
  const stopOptions = onValue(ref(getDb(), mobileHighlightOptionsPath(workspace.tenantId)), snapshot => {
    options = normalizeMobileHighlights(snapshot.val());
    useCamera.getState().patch({ highlightOptions: options });
    refreshConsent();
  }, error => notice(error));
  const stopCamera = useCamera.subscribe(bind);
  const stopSettings = useSettings.subscribe((current, previous) => {
    if (current.camera.highlightCapture !== previous.camera.highlightCapture || current.camera.highlightCloudUpload !== previous.camera.highlightCloudUpload) refreshConsent();
  });
  refreshConsent();
  return () => {
    closed = true; stopTrigger?.(); stopClock(); stopOptions(); stopCamera(); stopSettings();
    void StudioEngine.configureReplay(0).catch(() => undefined);
  };
}