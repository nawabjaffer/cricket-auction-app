// ============================================================================
// STUDIO SCREEN — full-screen preview (the encoder's own GL output, overlays
// included) with live HUD, camera controls and the Go Live flow.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioEngine, StudioSystem } from '../native';
import { StudioPreview } from '../native/views';
import {
  applyOverlays, endLive, goLive, prepareStudio, releaseEngine, syncPreparedSignature, UserFacingError,
} from '../services/streamController';
import { destinationReadiness } from '../services/destinations';
import { hasMediaPermissions } from '../services/permissions';
import { preflightBlocked, runPreflight, type PreflightCheck } from '../services/preflight';
import { log } from '../services/logger';
import { useSettings } from '../store/settingsStore';
import { isLiveState, useStudio } from '../store/studioStore';
import { useNav } from '../store/navStore';
import { Banner, Btn, Pill, Row, Slider } from '../ui/primitives';
import { colors, radius, space } from '../ui/theme';

function useTick(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

const formatElapsed = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const STATE_LABEL: Record<string, { label: string; tone: 'neutral' | 'live' | 'ok' | 'warn' | 'danger' }> = {
  idle: { label: 'OFFLINE', tone: 'neutral' },
  prepared: { label: 'READY', tone: 'ok' },
  preview: { label: 'READY', tone: 'ok' },
  connecting: { label: 'CONNECTING', tone: 'warn' },
  live: { label: 'LIVE', tone: 'live' },
  reconnecting: { label: 'RECONNECTING', tone: 'warn' },
  stopping: { label: 'STOPPING', tone: 'warn' },
  error: { label: 'ERROR', tone: 'danger' },
};

function PreflightSheet({ visible, onClose, onConfirm }: Readonly<{ visible: boolean; onClose: () => void; onConfirm: () => Promise<void> }>) {
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setChecks(null);
    setProblem(null);
    (async () => {
      const settings = useSettings.getState();
      const studio = useStudio.getState();
      const [permissions, storage] = await Promise.all([hasMediaPermissions(), StudioSystem.getFreeStorageMb().catch(() => null)]);
      const destinations = await Promise.all(settings.destinations.filter(item => item.enabled).map(async destination => ({
        label: destination.label, ...(await destinationReadiness(destination, settings.ytLinked)),
      })));
      if (cancelled) return;
      setChecks(runPreflight({
        hasPermissions: permissions,
        destinations,
        network: studio.network,
        battery: studio.battery,
        thermal: studio.thermal,
        freeStorageMb: storage,
        record: studio.effective?.record ?? false,
        effective: studio.effective,
        audioKbps: studio.profile?.audio.bitrateKbps ?? 128,
      }));
    })().catch(error => { if (!cancelled) setProblem(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [visible]);

  const blocked = !checks || preflightBlocked(checks);
  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      setProblem(error instanceof UserFacingError || error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={s.sheetBackdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Ready to go live?</Text>
          {!checks && !problem && <Text style={s.sheetMuted}>Running checks…</Text>}
          {checks?.map(check => (
            <Row key={check.id} style={{ alignItems: 'flex-start' }}>
              <Text style={[s.checkIcon, { color: check.status === 'ok' ? colors.accent : check.status === 'warn' ? colors.warn : colors.danger }]}>
                {check.status === 'ok' ? '●' : check.status === 'warn' ? '▲' : '✕'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={s.checkLabel}>{check.label}</Text>
                <Text style={s.sheetMuted}>{check.detail}</Text>
              </View>
            </Row>
          ))}
          {problem && <Banner tone="danger" text={problem} />}
          <Row style={{ marginTop: space.md }}>
            <Btn label="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} disabled={busy} />
            <Btn label="Go live" onPress={() => void confirm()} variant="danger" style={{ flex: 2 }} disabled={blocked} busy={busy} testID="confirm-go-live" />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

export function StudioScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const openSetup = useNav(state => state.openSetup);
  const engineState = useStudio(state => state.engineState);
  const stats = useStudio(state => state.stats);
  const effective = useStudio(state => state.effective);
  const session = useStudio(state => state.session);
  const error = useStudio(state => state.error);
  const notice = useStudio(state => state.notice);
  const battery = useStudio(state => state.battery);
  const thermal = useStudio(state => state.thermal);
  const runtimeDestinations = useStudio(state => state.destinations);
  const programSource = useStudio(state => state.programSource);
  const destinations = useSettings(state => state.destinations);
  const overlaysEnabled = useSettings(state => state.overlaysEnabled);
  const facing = useSettings(state => state.facing);
  const settingsKey = useSettings(state => JSON.stringify([state.video, state.audio, state.facing, state.overlayRender, state.overlayFps]));
  const profileKey = useStudio(state => JSON.stringify([state.profile?.video, state.profile?.audio]));
  const patchSettings = useSettings(state => state.patch);
  const patchStudio = useStudio(state => state.patch);

  const [showPreflight, setShowPreflight] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [exposure, setExposure] = useState(0);
  const [exposureRange, setExposureRange] = useState({ min: 0, max: 0, step: 1 });
  const [showTuning, setShowTuning] = useState(false);

  const live = isLiveState(engineState);
  const now = useTick(1000, live);

  // Bring the camera up when the screen opens; hand it back when leaving unless streaming.
  useEffect(() => {
    void prepareStudio();
    return () => {
      if (!isLiveState(useStudio.getState().engineState)) void releaseEngine();
    };
  }, []);

  // Re-configure (only while idle) when quality or audio settings change.
  useEffect(() => {
    if (!isLiveState(useStudio.getState().engineState)) void prepareStudio();
  }, [settingsKey, profileKey]);

  // Read camera limits once the preview is up.
  useEffect(() => {
    if (engineState !== 'preview' && engineState !== 'live') return;
    StudioEngine.getZoomRange().then(range => { setZoomRange(range); setZoom(current => Math.min(range.max, Math.max(range.min, current))); }).catch(() => undefined);
    StudioEngine.getExposureRange().then(setExposureRange).catch(() => undefined);
  }, [engineState]);

  const statusInfo = STATE_LABEL[engineState] ?? STATE_LABEL.idle;
  const elapsed = session ? now - session.startedAt : 0;

  const flip = useCallback(async () => {
    try {
      await StudioEngine.switchCamera();
      patchSettings({ facing: facing === 'back' ? 'front' : 'back' });
      syncPreparedSignature();
    } catch (cause) { patchStudio({ notice: `Could not switch camera: ${cause instanceof Error ? cause.message : String(cause)}` }); }
  }, [facing, patchSettings, patchStudio]);

  const toggleTorch = useCallback(() => {
    StudioEngine.setTorch(!(stats?.torch ?? false)).catch(() => patchStudio({ notice: 'This camera has no torch.' }));
  }, [stats?.torch, patchStudio]);

  const toggleOverlays = useCallback(() => {
    patchSettings({ overlaysEnabled: !overlaysEnabled });
    void applyOverlays();
  }, [overlaysEnabled, patchSettings]);

  const toggleRecord = useCallback(async () => {
    try {
      if (stats?.recording) await StudioEngine.stopRecording();
      else await StudioEngine.startRecording('studio');
    } catch (cause) { patchStudio({ notice: `Recording: ${cause instanceof Error ? cause.message : String(cause)}` }); }
  }, [stats?.recording, patchStudio]);

  const confirmEnd = useCallback(() => {
    Alert.alert('End the live stream?', 'Viewers will see the stream stop.', [
      { text: 'Keep streaming', style: 'cancel' },
      { text: 'End stream', style: 'destructive', onPress: () => { endLive().catch(cause => log.warn('live', cause)); } },
    ]);
  }, []);

  const destinationChips = useMemo(() => destinations.filter(item => item.enabled).map(item => ({
    id: item.id, label: item.label, state: runtimeDestinations[item.id]?.state,
  })), [destinations, runtimeDestinations]);

  const hot = thermal >= 3;
  return (
    <View style={s.root}>
      <StudioPreview style={StyleSheet.absoluteFill} />

      <View style={[s.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
        <Row style={{ flexWrap: 'wrap' }}>
          <Pill label={statusInfo.label} tone={statusInfo.tone} />
          {live && <Text style={s.hud}>{formatElapsed(elapsed)}</Text>}
          {stats && live && <Text style={s.hud}>{Math.round(stats.bitrateKbps)} kbps · {stats.fps} fps{stats.dropped ? ` · ${stats.dropped} dropped` : ''}</Text>}
          {effective && <Text style={s.hudMuted}>{effective.preset.label}{effective.codec === 'h265' ? ' · HEVC' : ''}</Text>}
          {programSource.kind === 'peer' && <Pill label={`CAM: ${programSource.name}`} tone="warn" />}
          {battery && <Text style={s.hudMuted}>{battery.charging ? '⚡' : '🔋'} {Math.round(battery.level)}%</Text>}
          {hot && <Pill label="HOT" tone="danger" />}
        </Row>
        {destinationChips.length > 0 && (
          <Row style={{ flexWrap: 'wrap', marginTop: space.xs }}>
            {destinationChips.map(chip => (
              <Pill
                key={chip.id}
                label={`${chip.label}${chip.state ? ` · ${chip.state}` : ''}`}
                tone={chip.state === 'live' ? 'ok' : chip.state === 'failed' ? 'danger' : chip.state ? 'warn' : 'neutral'}
              />
            ))}
          </Row>
        )}
        {error && <View style={{ marginTop: space.sm }}><Banner tone="danger" text={error} onDismiss={() => patchStudio({ error: null })} /></View>}
        {!error && notice && <View style={{ marginTop: space.sm }}><Banner tone="info" text={notice} onDismiss={() => patchStudio({ notice: null })} /></View>}
        {session && session.watchUrls.length > 0 && live && (
          <Text style={s.watch} numberOfLines={1}>▶ {session.watchUrls[0]}</Text>
        )}
      </View>

      {engineState === 'idle' && !error && (
        <View style={s.center} pointerEvents="none"><Text style={s.centerText}>Starting camera…</Text></View>
      )}

      <View style={[s.rail, landscape && s.railLandscape, { top: insets.top + 64, right: insets.right + space.md }]} pointerEvents="box-none">
        <RailButton icon="🔄" label="Flip camera" onPress={() => void flip()} />
        <RailButton icon="🔦" label="Torch" active={stats?.torch} onPress={toggleTorch} />
        <RailButton icon={stats?.muted ? '🔇' : '🎙️'} label={stats?.muted ? 'Unmute' : 'Mute'} active={stats?.muted} onPress={() => { void StudioEngine.setMuted(!(stats?.muted ?? false)); }} />
        <RailButton icon="🖼️" label="Overlays" active={overlaysEnabled} onPress={toggleOverlays} />
        <RailButton icon="⏺️" label="Record" active={stats?.recording} onPress={() => void toggleRecord()} />
        <RailButton icon="🎚️" label="Zoom and exposure" active={showTuning} onPress={() => setShowTuning(value => !value)} />
      </View>

      {showTuning && (
        <View style={s.tuning}>
          <Text style={s.tuneLabel}>Zoom {zoom.toFixed(1)}×</Text>
          <Slider value={zoom} min={zoomRange.min} max={Math.max(zoomRange.max, zoomRange.min + 0.01)} step={0.1} label="Zoom"
            onChange={value => { setZoom(value); void StudioEngine.setZoom(value); }} />
          <Text style={s.tuneLabel}>Exposure {exposure > 0 ? '+' : ''}{exposure}</Text>
          <Slider value={exposure} min={exposureRange.min} max={Math.max(exposureRange.max, exposureRange.min + 1)} step={1} label="Exposure"
            onChange={value => { setExposure(value); void StudioEngine.setExposure(value); }} />
          <Row>
            <Btn small label="Lock exposure" onPress={() => { void StudioEngine.setExposureLock(true); }} />
            <Btn small label="Auto" onPress={() => { void StudioEngine.setExposureLock(false); void StudioEngine.setAutoFocus(true); }} />
          </Row>
        </View>
      )}

      <View style={[s.bottom, { paddingBottom: insets.bottom + space.md }]} pointerEvents="box-none">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }} gap={space.md}>
          <Btn small label="Setup" onPress={() => openSetup('destinations')} />
          {live ? (
            <Btn label="END STREAM" variant="danger" onPress={confirmEnd} style={s.goBtn} testID="end-live" />
          ) : (
            <Btn label="GO LIVE" variant="primary" onPress={() => setShowPreflight(true)} style={s.goBtn} disabled={engineState === 'idle' || engineState === 'error'} testID="go-live" />
          )}
          <Btn small label="Video" onPress={() => openSetup('video')} />
        </Row>
      </View>

      <PreflightSheet visible={showPreflight} onClose={() => setShowPreflight(false)} onConfirm={goLive} />
    </View>
  );
}

function RailButton({ icon, label, onPress, active }: Readonly<{ icon: string; label: string; onPress: () => void; active?: boolean }>) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.railBtn, active && s.railBtnActive]}>
      <Text style={s.railIcon}>{icon}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.md },
  hud: { color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  hudMuted: { color: 'rgba(255,255,255,0.8)', fontSize: 12, textShadowColor: '#000', textShadowRadius: 4 },
  watch: { color: '#bfdbfe', fontSize: 12, marginTop: space.xs, textShadowColor: '#000', textShadowRadius: 4 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centerText: { color: colors.muted, fontSize: 15 },
  rail: { position: 'absolute', right: space.md, gap: space.sm },
  railLandscape: { flexDirection: 'row' },
  railBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(2,6,23,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  railBtnActive: { backgroundColor: 'rgba(61,220,132,0.35)', borderColor: colors.accent },
  railIcon: { fontSize: 20 },
  tuning: { position: 'absolute', right: 70, top: 120, width: 240, padding: space.md, gap: 4, borderRadius: radius.lg, backgroundColor: 'rgba(2,6,23,0.82)', borderWidth: 1, borderColor: colors.line },
  tuneLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  goBtn: { minWidth: 168, minHeight: 56, borderRadius: 28 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space.lg, gap: space.sm, maxHeight: '90%' },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: space.xs },
  sheetMuted: { color: colors.muted, fontSize: 13 },
  checkIcon: { fontSize: 16, width: 20, marginTop: 1 },
  checkLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
