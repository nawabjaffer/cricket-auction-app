// ============================================================================
// STREAM CONTROLLER — orchestrates the native engine from the JS side:
// permissions → capabilities → engine configuration → go live → end live.
// Native retries/reconnects; this layer owns policy (what to start, titles,
// YouTube broadcast lifecycle) and mirrors native events into the store.
// ============================================================================

import {
  StudioEngine, StudioNetwork, StudioSystem, onStudioEvent,
  type DeviceCapabilities, type EngineConfig, type EngineDestination,
} from '../native';
import {
  buildEngineConfig, buildOverlaySpecs, resolveEffectiveVideo, type LocalOverrides,
} from './effectiveConfig';
import {
  DestinationError, resolveDestination, type ResolvedDestination,
} from './destinations';
import { authorizeYouTube, transitionBroadcast } from './youtube';
import { requestMediaPermissions } from './permissions';
import { log, redactEndpoint } from './logger';
import { useSettings, type SettingsData } from '../store/settingsStore';
import { isLiveState, useStudio } from '../store/studioStore';
import {
  defaultStudioProfile, resolveStudioTitle, STUDIO_GAME_LABELS,
  type StudioContext, type StudioWidget,
} from '../shared/studioProfile';

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function studioContext(): StudioContext | null {
  const { pairing, origin } = useSettings.getState();
  if (!pairing) return null;
  return { origin, tenantId: pairing.tenantId, slug: pairing.slug, game: pairing.game, matchId: effectiveMatchId() ?? undefined };
}

/** The match the app is working on: the one chosen at pairing, else whatever is on air. */
export function effectiveMatchId(): string | null {
  const { pairing } = useSettings.getState();
  return pairing?.matchId ?? useStudio.getState().activeMatchId ?? null;
}

function localOverrides(settings: SettingsData): LocalOverrides {
  return {
    video: settings.video,
    audio: settings.audio,
    overlayRender: settings.overlayRender,
    overlayFps: settings.overlayFps,
    facing: settings.facing,
  };
}

export function allWidgets(): StudioWidget[] {
  const { profile } = useStudio.getState();
  const settings = useSettings.getState();
  const scene = settings.scenes.find(item => item.id === settings.activeSceneId);
  return [...(scene?.profileOverlays === false ? [] : profile?.widgets ?? []), ...settings.customWidgets, ...(scene?.widgets ?? [])];
}

// ── Capabilities ─────────────────────────────────────────────────────────────

export async function refreshCapabilities(): Promise<DeviceCapabilities | null> {
  const cached = useStudio.getState().capabilities;
  if (cached) return cached;
  try {
    const caps = JSON.parse(await StudioEngine.getCapabilities()) as DeviceCapabilities;
    useStudio.getState().patch({ capabilities: caps });
    return caps;
  } catch (error) {
    log.warn('engine', `capabilities unavailable: ${message(error)}`);
    return null;
  }
}

// ── Preview / prepare ────────────────────────────────────────────────────────

interface PlannedEngine { config: EngineConfig; signature: string }

let lifecycleQueue: Promise<void> = Promise.resolve();

export function queueEngineTask<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = lifecycleQueue.then(operation);
  lifecycleQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function planEngine(): PlannedEngine {
  const settings = useSettings.getState();
  const studio = useStudio.getState();
  const profile = studio.profile ?? defaultStudioProfile(settings.pairing?.game ?? 'cricket');
  const local = localOverrides(settings);
  const effective = resolveEffectiveVideo(profile, local, studio.capabilities);
  const config = buildEngineConfig(effective, profile, local);
  useStudio.getState().patch({ effective });
  return { config, signature: JSON.stringify(config) };
}

/** After a live camera flip the engine already matches the settings; record that so it is not re-prepared. */
export function syncPreparedSignature(): void {
  useStudio.getState().patch({ preparedSignature: planEngine().signature });
}

/** (Re)configures the encoder for the studio role. A no-op when nothing relevant changed. */
export function prepareStudio(force = false): Promise<boolean> {
  return queueEngineTask(() => prepareStudioOnce(force));
}

async function prepareStudioOnce(force: boolean): Promise<boolean> {
  try {
    const studio = useStudio.getState();
    if (studio.engineState === 'live' || studio.engineState === 'connecting' || studio.engineState === 'reconnecting') return true;
    if (studio.cameraServerUrl) {
      studio.patch({ error: 'This phone is serving a LAN camera. Stop it in Cameras to use the studio on this phone.' });
      return false;
    }
    const permissions = await requestMediaPermissions();
    if (!permissions.granted) {
      studio.patch({ error: permissions.blocked
        ? 'Camera / microphone access is blocked. Open Android settings and allow it for NJS Live Studio.'
        : 'Camera and microphone permissions are required to stream.' });
      return false;
    }
    await refreshCapabilities();
    const { config, signature } = planEngine();
    const current = useStudio.getState();
    if (!force && current.preparedSignature === signature && current.engineMode === 'studio' && current.engineState !== 'idle' && current.engineState !== 'error') return true;
    await StudioEngine.prepare(JSON.stringify(config), 'studio');
    useStudio.getState().patch({ preparedSignature: signature, error: null });
    await applyOverlays();
    const { audio } = useSettings.getState();
    if (audio.inputId != null) await StudioEngine.setAudioInput(audio.inputId).catch(() => false);
    return true;
  } catch (error) {
    log.error('engine', `prepare failed: ${message(error)}`);
    useStudio.getState().patch({ error: `Could not start the camera: ${message(error)}`, preparedSignature: null, effective: null });
    return false;
  }
}

export function releaseEngine(): Promise<void> {
  return queueEngineTask(async () => {
    const current = useStudio.getState();
    if (current.cameraServerUrl || current.engineMode === 'camera' || isLiveState(current.engineState)) return;
    try { await StudioEngine.release(); } catch (error) { log.warn('engine', message(error)); }
    useStudio.getState().patch({ preparedSignature: null, engineState: 'idle', engineMode: 'none', stats: null });
  });
}

export async function applyOverlays(strict = false): Promise<void> {
  const settings = useSettings.getState();
  const context = studioContext() ?? { origin: settings.origin, tenantId: '', slug: '', game: 'cricket' as const };
  const specs = settings.overlaysEnabled ? buildOverlaySpecs(allWidgets(), settings.overlayHidden, context) : [];
  try {
    await StudioEngine.setOverlayOptions(settings.overlayFps, settings.overlayRender === 'hardware');
    await StudioEngine.setOverlays(JSON.stringify(specs));
  } catch (error) {
    if (strict) throw error;
    log.warn('overlay', message(error));
  }
}

// ── Go live / end live ───────────────────────────────────────────────────────

export function broadcastTitle(): { title: string; description: string } {
  const { profile, tenant, matches } = useStudio.getState();
  const context = studioContext();
  const match = matches.find(item => item.id === effectiveMatchId());
  const gameLabel = context ? STUDIO_GAME_LABELS[context.game] : 'Live';
  const title = resolveStudioTitle(profile?.titleTemplate ?? '{teamA} vs {teamB} · {tournament} LIVE', {
    teamA: match?.teamA, teamB: match?.teamB, tournament: tenant?.name, stage: match?.stage, game: gameLabel,
    date: new Date().toLocaleDateString(),
  });
  return { title, description: `${match ? `${match.title}\n` : ''}${tenant?.name ?? ''} ${gameLabel} live stream — NJS Live Studio`.trim() };
}

export async function goLive(): Promise<void> {
  const studio = useStudio.getState();
  if (studio.engineState === 'live' || studio.engineState === 'connecting') return;
  const settings = useSettings.getState();
  const enabled = settings.destinations.filter(destination => destination.enabled);
  if (enabled.length === 0) throw new UserFacingError('Add and enable at least one destination in Setup › Destinations.');

  if (!(await prepareStudio())) throw new UserFacingError(useStudio.getState().error ?? 'The camera could not be started.');

  useStudio.getState().patch({ error: null, notice: null });
  useStudio.getState().clearDestinations();

  const { title, description } = broadcastTitle();
  let sharedToken: string | null = null;
  const youtubeToken = async () => {
    sharedToken ??= await authorizeYouTube();
    return sharedToken;
  };

  const resolved: ResolvedDestination[] = [];
  try {
    for (const destination of enabled) resolved.push(await resolveDestination(destination, { title, description, youtubeToken }));
  } catch (error) {
    // A broadcast created for an earlier destination is left in "ready"; it auto-completes unused.
    throw error instanceof DestinationError ? new UserFacingError(error.message) : error;
  }

  const payload: EngineDestination[] = resolved.map(({ id, protocol, url }) => ({ id, protocol, url }));
  log.info('live', `starting ${payload.map(item => `${item.id}→${redactEndpoint(item.url)}`).join(', ')}`);
  try {
    await StudioEngine.startStream(JSON.stringify(payload));
  } catch (error) {
    throw new UserFacingError(`Could not start streaming: ${message(error)}`);
  }

  const youtube = resolved.find(item => item.broadcast)?.broadcast;
  let recordingPath: string | undefined;
  if (useStudio.getState().effective?.record) {
    try { recordingPath = await StudioEngine.startRecording(title); } catch (error) { log.warn('record', message(error)); }
  }
  await StudioSystem.setKeepScreenOn(true).catch(() => undefined);
  useStudio.getState().patch({
    session: {
      startedAt: Date.now(),
      watchUrls: resolved.map(item => item.broadcast?.watchUrl).filter((url): url is string => !!url),
      recordingPath,
      youtube: youtube ? { broadcastId: youtube.broadcastId, streamId: youtube.streamId } : undefined,
    },
  });
}

export async function endLive(): Promise<void> {
  const { session } = useStudio.getState();
  try { await StudioEngine.stopStream(); } catch (error) { log.warn('live', message(error)); }
  if (useStudio.getState().stats?.recording) {
    try { await StudioEngine.stopRecording(); } catch (error) { log.warn('record', message(error)); }
  }
  if (session?.youtube) {
    try {
      await transitionBroadcast(await authorizeYouTube(), session.youtube.broadcastId, 'complete');
    } catch (error) {
      // The broadcast also auto-stops when ingest ends (enableAutoStop); only report.
      log.warn('youtube', `could not complete the broadcast: ${message(error)}`);
    }
  }
  await StudioSystem.setKeepScreenOn(false).catch(() => undefined);
  useStudio.getState().patch({ session: null });
  useStudio.getState().clearDestinations();
}

export async function toggleLive(): Promise<void> {
  const state = useStudio.getState().engineState;
  if (state === 'live' || state === 'connecting' || state === 'reconnecting') await endLive();
  else await goLive();
}

// ── Engine events → store ────────────────────────────────────────────────────

/** Subscribes once for the life of the app; returns the unsubscribe function. */
export function bindEngineEvents(): () => void {
  const patch = useStudio.getState().patch;
  const subscriptions = [
    onStudioEvent('studio.state', event => {
      patch({ engineState: event.state, engineMode: event.mode, engineMessage: event.message });
      if (event.state === 'idle' || event.state === 'error') patch({ stats: null });
    }),
    onStudioEvent('studio.destination', event => {
      useStudio.getState().setDestination(event.id, { state: event.state, reason: event.reason, attempt: event.attempt });
    }),
    onStudioEvent('studio.stats', stats => patch({ stats, cameraClients: stats.clients })),
    onStudioEvent('studio.error', event => {
      log.error('engine', `${event.code}: ${event.message}`);
      patch({ error: event.message });
    }),
    onStudioEvent('studio.record', event => {
      if (event.state === 'error') patch({ notice: `Recording problem: ${event.message ?? 'unknown'}` });
      if (event.state === 'stopped' && event.path) patch({ notice: `Recording saved: ${event.path}` });
    }),
    onStudioEvent('studio.network', snapshot => {
      const previous = useStudio.getState().network;
      patch({ network: snapshot });
      const live = useStudio.getState().engineState === 'live';
      if (live && previous && previous.type !== snapshot.type) {
        patch({ notice: snapshot.connected ? `Network changed to ${snapshot.type}` : 'Network lost — reconnecting…' });
      }
    }),
    onStudioEvent('studio.thermal', event => patch({ thermal: event.status })),
  ];
  StudioNetwork.startMonitor().catch(() => undefined);
  StudioNetwork.getSnapshot().then(snapshot => patch({ network: snapshot })).catch(() => undefined);
  return () => {
    subscriptions.forEach(unsubscribe => unsubscribe());
    StudioNetwork.stopMonitor().catch(() => undefined);
  };
}
