// ============================================================================
// TOURNAMENT SYNC — keeps the phone "in sync" with the web admin:
//   • subscribes to the studio profile (overlays, quality, destinations, title)
//   • follows the on-air match and keeps the match list fresh
//   • reports presence so the admin sees this phone, its state and battery
// ============================================================================

import { StudioSystem, type EngineState } from '../native';
import { listMatches, subscribeActiveMatch, subscribeProfile, resolveTenant } from './tournament';
import { startPresence } from './presence';
import { applyOverlays, effectiveMatchId, prepareStudio } from './streamController';
import { log } from './logger';
import { useSettings, type Pairing } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import type { StudioDeviceState } from '../shared/studioProfile';

const STATE_MAP: Record<EngineState, StudioDeviceState> = {
  idle: 'idle', prepared: 'idle', preview: 'preview', connecting: 'connecting', live: 'live',
  reconnecting: 'reconnecting', stopping: 'live', error: 'error',
};

export function startTournamentSync(pairing: Pairing): () => void {
  const studio = useStudio.getState();
  let disposed = false;

  void resolveTenant(pairing.tenantId).then(tenant => { if (!disposed && tenant) studio.patch({ tenant }); }).catch(error => log.warn('sync', error));

  const refreshMatches = () => {
    listMatches(pairing.tenantId, pairing.game)
      .then(matches => { if (!disposed) useStudio.getState().patch({ matches }); })
      .catch(error => log.warn('sync', `match list: ${error instanceof Error ? error.message : String(error)}`));
  };
  refreshMatches();
  const matchTimer = setInterval(refreshMatches, 30_000);

  const unsubProfile = subscribeProfile(
    pairing.tenantId,
    pairing.game,
    profile => {
      useStudio.getState().patch({ profile });
      useSettings.getState().mergeProfileDestinations(profile.destinations);
      // Overlay and quality changes made in the web admin apply immediately while idle or previewing.
      void applyOverlays();
      const state = useStudio.getState().engineState;
      if (state === 'preview' || state === 'prepared') void prepareStudio();
    },
    error => log.warn('sync', `profile: ${error.message}`),
  );
  const unsubActive = subscribeActiveMatch(pairing.tenantId, pairing.game, matchId => {
    useStudio.getState().patch({ activeMatchId: matchId });
    if (!useSettings.getState().pairing?.matchId) void applyOverlays();
  });

  const stopPresence = startPresence(
    { tenantId: pairing.tenantId, game: pairing.game, deviceId: useSettings.getState().deviceId },
    () => {
      const runtime = useStudio.getState();
      const settings = useSettings.getState();
      const effective = runtime.effective;
      return {
        name: settings.deviceName,
        role: settings.role === 'camera' ? 'camera' : 'studio',
        state: STATE_MAP[runtime.engineState],
        appVersion: runtime.appInfo?.versionName ?? '?',
        battery: runtime.battery ? Math.round(runtime.battery.level) : undefined,
        charging: runtime.battery?.charging,
        resolution: effective ? `${effective.preset.width}x${effective.preset.height}@${effective.preset.fps}` : undefined,
        bitrateKbps: runtime.stats?.bitrateKbps || undefined,
        matchId: effectiveMatchId() ?? undefined,
        lanUrl: runtime.cameraServerUrl ?? undefined,
      };
    },
  );

  return () => {
    disposed = true;
    clearInterval(matchTimer);
    unsubProfile();
    unsubActive();
    stopPresence();
  };
}

/** Battery, thermal and storage are polled — cheap and good enough for an operator HUD. */
export function startDeviceHealth(): () => void {
  let stopped = false;
  const tick = async () => {
    try {
      const [battery, thermal] = await Promise.all([StudioSystem.getBattery(), StudioSystem.getThermalStatus()]);
      if (!stopped) useStudio.getState().patch({ battery, thermal });
    } catch { /* best effort */ }
  };
  void tick();
  const timer = setInterval(tick, 15_000);
  return () => { stopped = true; clearInterval(timer); };
}
