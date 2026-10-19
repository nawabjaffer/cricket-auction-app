// ============================================================================
// STUDIO SCREEN — full-screen preview (the encoder's own GL output, overlays
// included) with live HUD, camera controls and the Go Live flow.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Battery, BatteryCharging, ChevronLeft, ChevronRight, Circle, CircleStop, FlipHorizontal2, Layers, Maximize, Mic, MicOff, PanelLeft, Plus, ScanLine, Settings2, SlidersHorizontal, Sparkles, Video, X, Zap, ZapOff } from 'lucide-react-native';
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
import { Banner, Btn, IconButton, Pill, Row, Slider } from '../ui/primitives';
import { colors, radius, space } from '../ui/theme';
import { SceneThumbnail } from '../ui/SceneThumbnail';
import { activateScene, rememberSceneFrame, switchScene } from '../services/scenes';
import { triggerSceneAnimation } from '../services/sceneAnimations';
import { SCENE_ANIMATION_PRESETS } from '../shared/scenes';
import { startPeerDiscovery } from '../services/peers';

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
  const setTab = useNav(state => state.setTab);
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
  const scenes = useSettings(state => state.scenes);
  const activeSceneId = useSettings(state => state.activeSceneId);
  const pairing = useSettings(state => state.pairing);
  const previewFill = useSettings(state => state.previewFill);
  const activeScene = scenes.find(scene => scene.id === activeSceneId) ?? scenes[0];

  const [showPreflight, setShowPreflight] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [exposure, setExposure] = useState(0);
  const [exposureRange, setExposureRange] = useState({ min: 0, max: 0, step: 1 });
  const [showTuning, setShowTuning] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [showAnimations, setShowAnimations] = useState(false);
  const clean = useNav(state => state.studioClean);
  const setClean = useNav(state => state.setStudioClean);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [animationSide, setAnimationSide] = useState<'A' | 'B'>('A');
  const [hudBottom, setHudBottom] = useState(insets.top + 54);

  const live = isLiveState(engineState);
  const now = useTick(1000, live);

  // Bring the camera up when the screen opens; hand it back when leaving unless streaming.
  useEffect(() => {
    void prepareStudio().then(ready => {
      if (ready) return activateScene(useSettings.getState().activeSceneId);
      return undefined;
    }).catch(cause => patchStudio({ notice: cause instanceof Error ? cause.message : String(cause) }));
    return () => {
      if (!isLiveState(useStudio.getState().engineState)) void releaseEngine();
    };
  }, [patchStudio]);

  useEffect(() => showScenes ? startPeerDiscovery() : undefined, [showScenes]);

  useEffect(() => {
    if (!showScenes || (engineState !== 'preview' && engineState !== 'live')) return undefined;
    void rememberSceneFrame(activeSceneId);
    const timer = setInterval(() => { void rememberSceneFrame(activeSceneId); }, 2500);
    return () => clearInterval(timer);
  }, [showScenes, activeSceneId, engineState]);

  const sceneKey = JSON.stringify(activeScene);
  useEffect(() => { void applyOverlays(); }, [sceneKey]);

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

  useEffect(() => {
    if (engineState === 'preview' || isLiveState(engineState)) void StudioEngine.setPreviewFill(previewFill).catch(() => undefined);
  }, [previewFill, engineState]);

  const statusInfo = STATE_LABEL[engineState] ?? STATE_LABEL.idle;
  const elapsed = session ? now - session.startedAt : 0;

  const flip = useCallback(async () => {
    try {
      await StudioEngine.switchCamera();
      const nextFacing = facing === 'back' ? 'front' : 'back';
      const settings = useSettings.getState();
      patchSettings({ facing: nextFacing, scenes: settings.scenes.map(scene => scene.id === settings.activeSceneId
        ? { ...scene, camera: { kind: 'local', facing: nextFacing } } : scene) });
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
  const drawerWidth = width * 0.15;
  const drawerBottom = insets.bottom + 124;
  const scenePresets = SCENE_ANIMATION_PRESETS.filter(preset => activeScene.animations.includes(preset.id) && preset.game === pairing?.game);
  const report = (cause: unknown) => patchStudio({ notice: cause instanceof Error ? cause.message : String(cause) });
  const takeScene = async (id: string) => {
    setSceneBusy(true);
    try { await activateScene(id); } catch (cause) { report(cause); }
    finally { setSceneBusy(false); }
  };
  return (
    <View style={s.root}>
      <StudioPreview style={StyleSheet.absoluteFill} />

      {!clean && <View style={[s.top, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none"
        onLayout={event => setHudBottom(event.nativeEvent.layout.height + 8)}>
        <Row style={s.hudBar}>
          <Row style={{ flex: 1, minWidth: 0 }}>
          <Image source={require('../assets/njs-store.png')} style={s.logo} resizeMode="contain" />
          <Pill label={statusInfo.label} tone={statusInfo.tone} />
          {live && <Text style={s.hud}>{formatElapsed(elapsed)}</Text>}
          {effective && (!live || landscape) && <Text style={s.hudMuted} numberOfLines={1}>{effective.preset.height}p{effective.preset.fps}</Text>}
          {stats && live && landscape && <Text style={s.hudMuted}>{(stats.bitrateKbps / 1000).toFixed(1)}M · {stats.fps} fps</Text>}
          </Row>
          <Row>
          {battery && <>{battery.charging ? <BatteryCharging size={14} color={colors.text} /> : <Battery size={14} color={colors.text} />}<Text style={s.hudMuted}>{Math.round(battery.level)}%</Text></>}
          {hot && <Pill label="HOT" tone="danger" />}
          <IconButton icon={Maximize} label="Hide studio controls" onPress={() => setClean(true)} />
          </Row>
        </Row>
        {destinationChips.length > 0 && live && (
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
      </View>}

      {engineState === 'idle' && !error && (
        <View style={s.center} pointerEvents="none"><Text style={s.centerText}>Starting camera…</Text></View>
      )}

      {!clean && <View style={[s.leftTools, { top: hudBottom, left: insets.left + 8 + (showScenes ? drawerWidth + 6 : 0), bottom: drawerBottom }]} pointerEvents="box-none">
        <IconButton icon={showTools ? X : SlidersHorizontal} label={showTools ? 'Collapse camera tools' : 'Camera tools'} active={showTools} onPress={() => setShowTools(value => !value)} />
        {showTools && <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.toolList}>
          <IconButton icon={FlipHorizontal2} label="Flip this phone camera" disabled={programSource.kind === 'peer'} onPress={() => void flip()} />
          <IconButton icon={stats?.torch ? ZapOff : Zap} label="Flashlight" disabled={programSource.kind === 'peer'} active={stats?.torch} onPress={toggleTorch} />
          <IconButton icon={stats?.muted ? MicOff : Mic} label={stats?.muted ? 'Unmute' : 'Mute'} active={stats?.muted} onPress={() => { void StudioEngine.setMuted(!(stats?.muted ?? false)).catch(report); }} />
          <IconButton icon={Layers} label="Show or hide overlays" active={overlaysEnabled} onPress={toggleOverlays} />
          <IconButton icon={stats?.recording ? CircleStop : Circle} label={stats?.recording ? 'Stop recording' : 'Record'} active={stats?.recording} onPress={() => void toggleRecord()} />
          <IconButton icon={Settings2} label="Zoom and exposure" active={showTuning} onPress={() => setShowTuning(value => !value)} />
          <IconButton icon={ScanLine} label={previewFill ? 'Fit entire output frame' : 'Fill preview screen'} active={!previewFill} onPress={() => patchSettings({ previewFill: !previewFill })} />
        </ScrollView>}
      </View>}

      {showScenes && !clean && <View style={[s.sceneRail, { width: drawerWidth, top: hudBottom, left: insets.left + 6, bottom: drawerBottom }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sceneList}>
          {scenes.map((scene, index) => <SceneThumbnail key={scene.id} scene={scene} selected={scene.id === activeSceneId} onAir={scene.id === activeSceneId}
            livePreview={index < 3 && !sceneBusy} onPress={() => { if (!sceneBusy) void takeScene(scene.id); }} />)}
        </ScrollView>
        <IconButton icon={Plus} label="Edit scenes and sources" onPress={() => setTab('scenes')} style={{ alignSelf: 'center' }} />
      </View>}

      {showTuning && showTools && !clean && (
        <ScrollView style={[s.tuning, { left: insets.left + 52 + (showScenes ? drawerWidth + 6 : 0), width: Math.min(192, width - insets.left - insets.right - 62 - (showScenes ? drawerWidth + 6 : 0)), top: hudBottom, maxHeight: height - hudBottom - drawerBottom }]} contentContainerStyle={{ padding: 10, gap: 4 }}>
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
        </ScrollView>
      )}

      {!clean && <View style={[s.bottom, { bottom: insets.bottom + 62 }]} pointerEvents="box-none">
        <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
          <View style={{ width: 62, alignItems: 'center', gap: 2 }}><IconButton icon={PanelLeft} label="Setup scene previews" active={showScenes} onPress={() => setShowScenes(value => !value)} /><Text style={s.controlCaption}>Setup</Text></View>
          <View style={{ flex: 1, alignItems: 'center', gap: 7 }}>
          <Row gap={3}>
            <IconButton icon={ChevronLeft} label="Previous scene" onPress={() => { void switchScene(-1).catch(report); }} disabled={sceneBusy} />
            <Text style={s.sceneTitle} numberOfLines={1}>{activeScene.name}</Text>
            <IconButton icon={ChevronRight} label="Next scene" onPress={() => { void switchScene(1).catch(report); }} disabled={sceneBusy} />
          </Row>
          {live ? (
            <Btn small label="End stream" variant="danger" onPress={confirmEnd} style={s.goBtn} testID="end-live" />
          ) : (
            <Btn small label="Go live" variant="primary" onPress={() => setShowPreflight(true)} style={s.goBtn} disabled={engineState === 'idle' || engineState === 'error'} testID="go-live" />
          )}
          </View>
          <View style={{ width: 62, alignItems: 'center', gap: 2 }}>
            <IconButton icon={scenePresets.length ? Sparkles : Video} label={scenePresets.length ? 'Scene animations' : 'Video quality'} active={showAnimations}
              onPress={() => { if (scenePresets.length) setShowAnimations(value => !value); else openSetup('video'); }} />
            <Text style={s.controlCaption}>{scenePresets.length ? 'Animate' : 'Quality'}</Text>
          </View>
        </Row>
        {showAnimations && scenePresets.length > 0 && <View style={s.animations}>
          <Row><Btn small label="Side A" variant={animationSide === 'A' ? 'primary' : 'secondary'} onPress={() => setAnimationSide('A')} /><Btn small label="Side B" variant={animationSide === 'B' ? 'primary' : 'secondary'} onPress={() => setAnimationSide('B')} /></Row>
          <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>
            {scenePresets.map(preset => <Btn key={preset.id} small label={preset.label} onPress={() => { void triggerSceneAnimation(preset.id, animationSide).catch(report); }} />)}
          </ScrollView>
        </View>}
      </View>}

      {clean && <View style={{ position: 'absolute', top: insets.top + 10, right: insets.right + 10 }}><IconButton icon={Maximize} label="Show studio controls" onPress={() => setClean(false)} /></View>}

      <PreflightSheet visible={showPreflight} onClose={() => setShowPreflight(false)} onConfirm={goLive} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: space.md },
  logo: { width: 22, height: 22 },
  hudBar: { justifyContent: 'space-between', minHeight: 38, paddingHorizontal: 6, borderRadius: 6, backgroundColor: 'rgba(8,11,15,0.74)' },
  hud: { color: '#fff', fontSize: 11, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  hudMuted: { color: 'rgba(255,255,255,0.85)', fontSize: 10, textShadowColor: '#000', textShadowRadius: 4 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  centerText: { color: colors.muted, fontSize: 15 },
  leftTools: { position: 'absolute', width: 36, gap: 6 },
  toolList: { gap: 7, paddingTop: 7, paddingBottom: 5 },
  sceneRail: { position: 'absolute', borderRadius: 8, padding: 4, gap: 5, backgroundColor: 'rgba(12,15,19,0.9)', borderWidth: 1, borderColor: colors.line },
  sceneList: { gap: 7, paddingBottom: 5 },
  sceneTitle: { color: '#fff', fontSize: 11, fontWeight: '600', width: 86, textAlign: 'center' },
  controlCaption: { color: '#fff', fontSize: 10 },
  animations: { position: 'absolute', bottom: 91, left: 0, right: 0, backgroundColor: 'rgba(12,15,19,0.94)', padding: 10, borderRadius: 8, gap: 7 },
  tuning: { position: 'absolute', width: 192, borderRadius: radius.lg, backgroundColor: 'rgba(12,15,19,0.94)', borderWidth: 1, borderColor: colors.line },
  tuneLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  bottom: { position: 'absolute', left: 10, right: 10 },
  goBtn: { width: 132, minHeight: 36, borderRadius: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 8, borderTopRightRadius: 8, padding: space.lg, gap: space.sm, maxHeight: '90%' },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: space.xs },
  sheetMuted: { color: colors.muted, fontSize: 13 },
  checkIcon: { fontSize: 16, width: 20, marginTop: 1 },
  checkLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
