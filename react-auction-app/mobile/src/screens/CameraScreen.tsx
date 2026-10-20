import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, Download, FlipHorizontal2, Image as ImageIcon, Layers, Mic, MicOff, Pause, Play, RefreshCw, Settings2, SlidersHorizontal, Zap, ZapOff, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioEngine } from '../native';
import { StudioPreview } from '../native/views';
import { applyCameraOverlays, cameraOccupied, discardPendingCameraMedia, pauseOrResumeCamera, prepareCamera, releaseCamera, startCameraRecording, startCameraSync, stopCameraRecording, syncCameraAssets, takeCameraRaw } from '../services/cameraController';
import { validatePairing } from '../services/deepLink';
import { useCamera } from '../store/cameraStore';
import { useSettings } from '../store/settingsStore';
import { useNav } from '../store/navStore';
import { recordedDurationMs, type CameraRecordingSettings } from '../shared/cameraRecording';
import { STUDIO_GAME_LABELS, STUDIO_GAME_TYPES, STUDIO_VIDEO_PRESETS, type StudioGameType } from '../shared/studioProfile';
import { presetSupport } from '../services/effectiveConfig';
import { useStudio } from '../store/studioStore';
import { Banner, Btn, Field, IconButton, Row, Segmented, Slider, ToggleRow } from '../ui/primitives';
import { colors } from '../ui/theme';

const elapsed = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function CameraSettings({ close, onOverlaySetup, run }: Readonly<{ close: () => void; onOverlaySetup: () => void; run: (task: () => Promise<unknown>) => void }>) {
  const insets = useSafeAreaInsets();
  const camera = useSettings(state => state.camera);
  const capabilities = useStudio(state => state.capabilities);
  const busy = useCamera(state => state.busy);
  const [slug, setSlug] = useState(camera.workspace?.slug ?? '');
  const [game, setGame] = useState<StudioGameType>(camera.workspace?.game ?? 'cricket');
  const [origin, setOrigin] = useState(camera.workspace?.origin ?? useSettings.getState().origin);
  const update = (partial: Partial<CameraRecordingSettings>) => {
    if (!cameraOccupied()) {
      const current = useSettings.getState().camera;
      useSettings.getState().patch({ camera: { ...current, ...partial, orientationConfigured: partial.orientation === undefined ? current.orientationConfigured : true } });
    }
  };
  const connect = async () => {
    useCamera.getState().patch({ busy: true });
    try {
      const result = await validatePairing({ origin, slug, game, tenantId: slug });
      useSettings.getState().patch({ camera: { ...useSettings.getState().camera, workspace: { ...result.pairing, matchId: undefined }, assetSync: undefined } });
    } finally { useCamera.getState().patch({ busy: false }); }
    await syncCameraAssets();
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy) close(); }} supportedOrientations={['portrait', 'landscape']}>
    <View style={[s.settings, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <Row style={s.sheetHeader}><Text style={s.heading}>Camera settings</Text><IconButton icon={X} label="Close settings" disabled={busy} onPress={close} /></Row>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 10, paddingBottom: 28, paddingHorizontal: 20, gap: 20 }}>
      <Text style={s.label}>Video</Text>
      <View style={s.qualityList}>{STUDIO_VIDEO_PRESETS.map(preset => <Pressable key={preset.id} accessibilityRole="radio" accessibilityState={{ checked: camera.presetId === preset.id, disabled: !presetSupport(preset, camera.codec, capabilities, camera.facing).ok }} disabled={!presetSupport(preset, camera.codec, capabilities, camera.facing).ok} onPress={() => update({ presetId: preset.id })} style={[s.quality, camera.presetId === preset.id && s.selected, !presetSupport(preset, camera.codec, capabilities, camera.facing).ok && s.disabled]}><Text style={s.text}>{preset.label}</Text></Pressable>)}</View>
      <Segmented value={camera.codec} options={[{ value: 'h264', label: 'H.264' }, { value: 'h265', label: 'HEVC', disabled: capabilities?.encoders.h265 == null }]} onChange={codec => update({ codec })} />
      <Segmented value={camera.orientation} options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} onChange={orientation => update({ orientation })} />
      <ToggleRow label="Stabilization" value={camera.stabilization} onChange={stabilization => update({ stabilization })} />
      <ToggleRow label="Grid" value={camera.grid} onChange={grid => update({ grid })} />
      <ToggleRow label="Microphone" value={!camera.muted} onChange={enabled => update({ muted: !enabled })} />
      <Text style={s.label}>Scoreboard and animations</Text>
      <ToggleRow label="Overlays" value={camera.overlays} onChange={overlays => update({ overlays })} />
      <Btn label="Adjust overlay framing in preview" disabled={!camera.overlays} onPress={() => { close(); onOverlaySetup(); }} />
      {camera.workspace && <Row style={{ justifyContent: 'space-between' }}><Text style={[s.text, { flex: 1 }]}>{camera.workspace.slug} / {STUDIO_GAME_LABELS[camera.workspace.game]}</Text><Btn small label="Disconnect" onPress={() => update({ workspace: null })} /></Row>}
      {useSettings.getState().scoringWorkspace && <Btn disabled={busy} label="Use scoring tournament" onPress={() => run(async () => {
        const workspace = useSettings.getState().scoringWorkspace;
        if (workspace) { update({ workspace: { ...workspace, matchId: undefined }, assetSync: undefined }); await syncCameraAssets(); }
      })} />}
      <Field label="Tournament" editable={!busy} value={slug} onChangeText={setSlug} placeholder="tournament-slug" />
      <Segmented value={game} options={STUDIO_GAME_TYPES.map(value => ({ value, label: STUDIO_GAME_LABELS[value] }))} onChange={setGame} />
      <Field label="Web address" editable={!busy} value={origin} onChangeText={setOrigin} keyboardType="url" />
      <Btn label="Follow on-air match" busy={busy} onPress={() => run(connect)} />
      <Field label="Custom overlay URL" editable={!busy} keyboardType="url" value={camera.widgets[0]?.url ?? ''} onChangeText={url => update({ widgets: url.trim() ? [{ id: 'camera-custom', label: 'Custom overlay', kind: 'web', url: url.trim(), enabled: true, anchor: 'full', widthPct: 100, opacity: 1, pageWidth: 1920, pageHeight: 1080 }] : [] })} />
      <Field label="Offline asset manifest URL" editable={!busy} keyboardType="url" value={camera.packageUrl} onChangeText={packageUrl => update({ packageUrl, assetSync: undefined })} />
      <Row><IconButton icon={Download} label="Sync offline overlay assets" disabled={busy} onPress={() => run(syncCameraAssets)} /><Text style={s.caption}>{busy ? 'Syncing...' : camera.assetSync ? `${camera.assetSync.files} files / ${(camera.assetSync.bytes / 1024 / 1024).toFixed(1)} MB` : 'Not synced'}</Text></Row>
      <Btn label="Remove downloaded assets" disabled={busy} variant="ghost" onPress={() => Alert.alert('Remove offline assets?', 'The downloaded graphics will need to be synced again.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => run(async () => { await StudioEngine.clearOverlayAssets(); update({ assetSync: undefined }); }) }])} />
      </ScrollView>
    </View>
  </Modal>;
}

export function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const screenOrientation = landscape ? 'landscape' : 'portrait';
  const camera = useSettings(state => state.camera);
  const capability = useStudio(state => state.capabilities?.cameras.find(item => item.facing === camera.facing));
  const runtime = useCamera();
  const [settings, setSettings] = useState(false);
  const [tools, setTools] = useState(false);
  const [overlayTools, setOverlayTools] = useState(false);
  const [zoom, setZoom] = useState(1);
  const zoomValue = useRef(1);
  const zoomFrame = useRef<number | null>(null);
  const lastZoomFrameAt = useRef<number | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exposure, setExposure] = useState(0);
  const [torch, setTorch] = useState(false);
  const [focusLock, setFocusLock] = useState(false);
  const [focus, setFocus] = useState(0);
  const [manual, setManual] = useState(false);
  const [iso, setIso] = useState(400);
  const [shutter, setShutter] = useState(120);
  const [whiteBalance, setWhiteBalance] = useState(1);
  const [now, setNow] = useState(Date.now());
  const active = runtime.session.status === 'recording' || runtime.session.status === 'paused';
  const occupied = active || runtime.session.status === 'saving' || runtime.busy;
  const raw = camera.captureMode === 'raw' && capability?.raw === true;
  const update = (partial: Partial<CameraRecordingSettings>) => useSettings.getState().patch({ camera: { ...useSettings.getState().camera, ...partial } });
  const run = (task: () => Promise<unknown>) => { void task().catch(error => useCamera.getState().patch({ error: error instanceof Error ? error.message : String(error) })); };
  const setLiveZoom = (value: number) => {
    zoomValue.current = value;
    setZoom(value);
    if (zoomFrame.current !== null) return;
    zoomFrame.current = requestAnimationFrame(timestamp => {
      zoomFrame.current = null;
      if (lastZoomFrameAt.current !== null && timestamp - lastZoomFrameAt.current < 33) return;
      lastZoomFrameAt.current = timestamp;
      run(() => StudioEngine.setZoom(zoomValue.current));
    });
  };
  const finishZoom = (value: number) => {
    zoomValue.current = value;
    setZoom(value);
    if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
    zoomFrame.current = null;
    lastZoomFrameAt.current = null;
    run(() => StudioEngine.setZoom(value));
  };
  const updateOverlayTransform = (partial: Partial<CameraRecordingSettings>) => {
    const current = useSettings.getState().camera;
    useSettings.getState().patch({ camera: { ...current, ...partial } });
    if (overlayTimer.current !== null) return;
    overlayTimer.current = setTimeout(() => {
      overlayTimer.current = null;
      void applyCameraOverlays().catch(error => useCamera.getState().patch({ error: error instanceof Error ? error.message : String(error) }));
    }, 80);
  };
  const captureOrientation = camera.orientation === 'auto' ? screenOrientation : camera.orientation;
  const configKey = JSON.stringify([camera.presetId, camera.codec, camera.facing, camera.orientation, captureOrientation, camera.stabilization]);
  const workspaceKey = JSON.stringify(camera.workspace);
  const pro = async (overrides: Partial<{ manual: boolean; iso: number; shutter: number; focusLock: boolean; focus: number; whiteBalance: number }> = {}) => {
    const values = { manual, iso, shutter, focusLock, focus, whiteBalance, ...overrides };
    await StudioEngine.setCameraProControls(JSON.stringify({
      iso: values.manual ? values.iso : null, exposureNs: values.manual ? Math.round(1_000_000_000 / values.shutter) : null,
      focusDiopters: values.focusLock ? values.focus : null, whiteBalance: values.whiteBalance,
    }));
  };
  const shutterOptions = [30, 60, 120, 250, 500, 1000].filter(value => value >= (runtime.effective?.preset.fps ?? 30) && 1_000_000_000 / value >= (capability?.exposureNs?.min ?? 0) && 1_000_000_000 / value <= (capability?.exposureNs?.max ?? Infinity));

  useEffect(() => { useCamera.getState().patch({ screenOrientation }); }, [screenOrientation]);
  useEffect(() => {
    setManual(false); setFocusLock(false); setWhiteBalance(1); setExposure(0); setZoom(1); setTorch(false);
    run(() => prepareCamera(captureOrientation));
    return () => { void releaseCamera(); };
  }, [configKey, captureOrientation]);
  useEffect(() => startCameraSync(camera.workspace), [workspaceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(applyCameraOverlays); }, [camera.overlays, camera.widgets]);
  useEffect(() => { if (runtime.ready) run(() => StudioEngine.setMuted(camera.muted)); }, [camera.muted, runtime.ready]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !cameraOccupied()) run(prepareCamera);
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  useEffect(() => () => {
    if (zoomFrame.current !== null) cancelAnimationFrame(zoomFrame.current);
    if (overlayTimer.current !== null) clearTimeout(overlayTimer.current);
  }, []);

  return <View style={s.root}>
    <StudioPreview style={s.preview} />
    {camera.grid && <View style={s.grid} pointerEvents="none"><View style={[s.gridLine, { left: '33.333%' }]} /><View style={[s.gridLine, { left: '66.666%' }]} /><View style={[s.gridRow, { top: '33.333%' }]} /><View style={[s.gridRow, { top: '66.666%' }]} /></View>}
    <View style={[s.top, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
      <IconButton icon={ArrowLeft} label="Home" disabled={occupied} onPress={() => useNav.getState().setWorkspace('home')} />
      {landscape && <Row><IconButton icon={torch ? Zap : ZapOff} label="Torch" active={torch} disabled={!runtime.ready || camera.facing === 'front'} onPress={() => run(async () => setTorch(await StudioEngine.setTorch(!torch)))} /><IconButton icon={Layers} label="Scoreboard overlays" active={camera.overlays} onPress={() => update({ overlays: !camera.overlays })} /></Row>}
      <View style={s.status}><Text style={[s.timer, active && { color: runtime.session.status === 'paused' ? '#ffd166' : '#ff5b64' }]}>{active || runtime.session.status === 'saving' ? elapsed(recordedDurationMs(runtime.session, now)) : raw ? 'RAW / DNG' : 'CAMERA'}</Text><Text style={s.caption}>{runtime.session.status === 'paused' ? 'PAUSED' : runtime.session.status === 'saving' ? 'SAVE PENDING' : raw ? 'DNG' : runtime.effective?.preset.label ?? ''}</Text></View>
      {landscape && <IconButton icon={camera.muted ? MicOff : Mic} label="Microphone" active={!camera.muted} disabled={!runtime.ready} onPress={() => update({ muted: !camera.muted })} />}
      <IconButton icon={Settings2} label="Camera settings" disabled={occupied} onPress={() => setSettings(true)} />
    </View>
    {!landscape && <View style={[s.side, { right: insets.right + 12, top: insets.top + 92 }]}>
      <IconButton icon={torch ? Zap : ZapOff} label="Torch" active={torch} disabled={!runtime.ready || camera.facing === 'front'} onPress={() => run(async () => setTorch(await StudioEngine.setTorch(!torch)))} />
      <IconButton icon={Layers} label="Scoreboard overlays" active={camera.overlays} onPress={() => update({ overlays: !camera.overlays })} />
      <IconButton icon={camera.muted ? MicOff : Mic} label="Microphone" active={!camera.muted} disabled={!runtime.ready} onPress={() => update({ muted: !camera.muted })} />
    </View>}
    {!runtime.ready && runtime.busy && <View style={s.center}><ActivityIndicator color="#fff" size="large" /></View>}
    <View style={[s.bottom, { paddingBottom: insets.bottom + 10, paddingLeft: insets.left + 14, paddingRight: insets.right + 14 }]}>
      {runtime.error && <Banner tone="danger" text={runtime.error} onDismiss={() => runtime.patch({ error: null })} />}
      {runtime.notice && <Text style={s.notice}>{runtime.notice}</Text>}
      {runtime.session.status === 'saving' && !runtime.busy && <Btn small label="Discard private file" variant="ghost" onPress={() => Alert.alert('Discard unsaved file?', 'This permanently removes the private camera file.', [{ text: 'Keep' }, { text: 'Discard', style: 'destructive', onPress: () => run(discardPendingCameraMedia) }])} />}
      <Row style={s.shutterBar}>
        <IconButton icon={ImageIcon} label="Open last Gallery item" disabled={!runtime.lastGalleryUri || occupied} onPress={() => run(() => StudioEngine.openGalleryItem(runtime.lastGalleryUri!))} />
        <IconButton icon={runtime.ready ? FlipHorizontal2 : RefreshCw} label={runtime.ready ? 'Flip camera' : 'Retry camera'} disabled={occupied} onPress={() => { if (!runtime.ready) { run(prepareCamera); return; } setZoom(1); setTorch(false); update({ facing: camera.facing === 'back' ? 'front' : 'back', captureMode: 'video' }); }} />
        <Pressable testID="camera-shutter" accessibilityRole="button" accessibilityLabel={active ? 'Stop recording and save to Gallery' : runtime.session.status === 'saving' ? 'Retry Gallery save' : raw ? 'Capture RAW photo' : 'Record video'} disabled={runtime.busy || (!runtime.ready && !active && runtime.session.status !== 'saving')} onPress={() => run(active || runtime.session.status === 'saving' ? stopCameraRecording : raw ? takeCameraRaw : startCameraRecording)} style={[s.shutter, (runtime.busy || !runtime.ready) && s.disabled]}>{runtime.busy ? <ActivityIndicator color="#fff" /> : runtime.session.status === 'saving' ? <Download color="#fff" size={30} /> : <View style={active ? s.stop : raw ? s.raw : s.record} />}</Pressable>
        <IconButton icon={runtime.session.status === 'paused' ? Play : Pause} label={runtime.session.status === 'paused' ? 'Resume recording' : 'Pause recording'} disabled={!active || runtime.busy} onPress={() => run(pauseOrResumeCamera)} />
        <IconButton icon={SlidersHorizontal} label="Camera controls" active={tools} disabled={!runtime.ready || runtime.busy} onPress={() => setTools(!tools)} />
      </Row>
    </View>
    {overlayTools && <View style={[s.overlayPanel, { bottom: insets.bottom + 104, maxHeight: Math.min(420, height * 0.46) }]}>
      <Row style={s.panelHeader}><Text style={s.heading}>Overlay framing</Text><IconButton icon={X} label="Close overlay framing" onPress={() => setOverlayTools(false)} /></Row>
      {runtime.effective && <Text style={s.caption}>{runtime.effective.orientation === 'portrait' ? `${runtime.effective.preset.height} x ${runtime.effective.preset.width}` : `${runtime.effective.preset.width} x ${runtime.effective.preset.height}`} · {runtime.effective.orientation}</Text>}
      <ScrollView contentContainerStyle={s.panelContent}>
        <Row style={s.controlLabel}><Text style={s.text}>Size</Text><Text style={s.text}>{camera.overlayScalePct}%</Text></Row>
        <Slider label="Overlay size" min={20} max={100} step={1} value={camera.overlayScalePct} onChange={value => updateOverlayTransform({ overlayScalePct: value })} onComplete={value => updateOverlayTransform({ overlayScalePct: value })} />
        <Text style={s.caption}>Rotation</Text>
        <Segmented value={camera.overlayRotation} options={[{ value: 'auto', label: 'Auto' }, { value: 0, label: '0°' }, { value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }]} onChange={overlayRotation => updateOverlayTransform({ overlayRotation })} />
        <Row style={s.controlLabel}><Text style={s.text}>Horizontal</Text><Text style={s.text}>{camera.overlayOffsetXPct}%</Text></Row>
        <Slider label="Overlay horizontal position" min={-25} max={25} step={1} value={camera.overlayOffsetXPct} onChange={value => updateOverlayTransform({ overlayOffsetXPct: value })} onComplete={value => updateOverlayTransform({ overlayOffsetXPct: value })} />
        <Row style={s.controlLabel}><Text style={s.text}>Vertical</Text><Text style={s.text}>{camera.overlayOffsetYPct}%</Text></Row>
        <Slider label="Overlay vertical position" min={-25} max={25} step={1} value={camera.overlayOffsetYPct} onChange={value => updateOverlayTransform({ overlayOffsetYPct: value })} onComplete={value => updateOverlayTransform({ overlayOffsetYPct: value })} />
      </ScrollView>
    </View>}
    {tools && <Modal visible animationType="slide" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setTools(false)}><View style={[s.settings, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <Row style={s.sheetHeader}><Text style={s.heading}>Camera controls</Text><IconButton icon={X} label="Close camera controls" onPress={() => setTools(false)} /></Row>
      <ScrollView contentContainerStyle={{ paddingTop: 10, paddingBottom: 24, paddingHorizontal: 20, gap: 18 }}>
      <Text style={s.caption}>Capture mode</Text>
      <Segmented value={raw ? 'raw' : 'video'} options={[{ value: 'video', label: 'Video' }, { value: 'raw', label: 'RAW / DNG', disabled: !capability?.raw }]} onChange={captureMode => useSettings.getState().patch({ camera: { ...useSettings.getState().camera, captureMode } })} />
      {runtime.zoomRange.max > 1 && <Row style={s.zoom}><Text style={s.text}>{zoom.toFixed(1)}x</Text><View style={{ flex: 1 }}><Slider label="Camera zoom" min={runtime.zoomRange.min} max={Math.min(10, runtime.zoomRange.max)} value={zoom} onChange={setLiveZoom} onComplete={finishZoom} /></View></Row>}
      <Text style={s.caption}>Exposure {(exposure * runtime.exposureRange.step).toFixed(1)} EV</Text><Slider label="Exposure compensation" min={runtime.exposureRange.min} max={runtime.exposureRange.max} step={1} value={exposure} onChange={setExposure} onComplete={value => run(() => StudioEngine.setExposure(value))} />
      {capability?.manualSensor && capability.iso && shutterOptions.length > 0 && <>
        <ToggleRow label="Manual exposure" value={manual} onChange={value => run(async () => { const nextIso = Math.min(capability.iso!.max, Math.max(capability.iso!.min, iso)); const nextShutter = shutterOptions.includes(shutter) ? shutter : shutterOptions[0]; await pro({ manual: value, iso: nextIso, shutter: nextShutter }); setIso(nextIso); setShutter(nextShutter); setManual(value); })} />
        {manual && <><Text style={s.caption}>ISO {iso}</Text><Slider label="ISO" min={capability.iso.min} max={capability.iso.max} step={1} value={iso} onChange={setIso} onComplete={value => run(() => pro({ iso: value }))} /><Text style={s.caption}>Shutter</Text><Segmented value={shutter} options={shutterOptions.map(value => ({ value, label: `1/${value}` }))} onChange={value => run(async () => { await pro({ shutter: value }); setShutter(value); })} /></>}
      </>}
      {(capability?.focusDiopters ?? 0) > 0 && <><ToggleRow label="Manual focus" value={focusLock} onChange={value => run(async () => { await pro({ focusLock: value }); setFocusLock(value); })} />{focusLock && <Slider label="Focus distance" min={0} max={capability!.focusDiopters!} value={focus} onChange={setFocus} onComplete={value => run(() => pro({ focus: value }))} />}</>}
      <Text style={s.caption}>White balance</Text><View style={s.qualityList}>{[{ value: 1, label: 'Auto' }, { value: 5, label: 'Day' }, { value: 6, label: 'Cloud' }, { value: 2, label: 'Tungsten' }, { value: 3, label: 'Fluor' }].filter(option => capability?.whiteBalanceModes?.includes(option.value)).map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: whiteBalance === option.value }} onPress={() => run(async () => { await pro({ whiteBalance: option.value }); setWhiteBalance(option.value); })} style={[s.quality, whiteBalance === option.value && s.selected]}><Text style={s.text}>{option.label}</Text></Pressable>)}</View>
      </ScrollView>
    </View></Modal>}
    {settings && <CameraSettings close={() => setSettings(false)} onOverlaySetup={() => setOverlayTools(true)} run={task => { void task().catch(error => Alert.alert('Camera settings', error instanceof Error ? error.message : String(error))); }} />}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' }, preview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.52)', paddingBottom: 10 },
  status: { flex: 1, alignItems: 'center', minWidth: 0 }, timer: { color: '#fff', fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  caption: { color: '#c8cdd2', fontSize: 11 }, side: { position: 'absolute', gap: 12 }, center: { position: 'absolute', top: '45%', alignSelf: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: 8, paddingTop: 10, backgroundColor: 'rgba(0,0,0,0.68)' },
  shutterBar: { justifyContent: 'space-evenly', minHeight: 86 }, shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  record: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#f44752' }, stop: { width: 30, height: 30, borderRadius: 5, backgroundColor: '#f44752' },
  raw: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 13 }, notice: { color: '#a7e8c1', fontSize: 12, textAlign: 'center' }, zoom: { maxWidth: 290, alignSelf: 'center', width: '80%', gap: 12 },
  overlayPanel: { position: 'absolute', left: 12, right: 12, backgroundColor: 'rgba(10,14,18,0.94)', borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  panelHeader: { justifyContent: 'space-between' }, panelContent: { gap: 7, paddingBottom: 4 }, controlLabel: { justifyContent: 'space-between' },
  settings: { flex: 1, backgroundColor: colors.bg }, heading: { color: '#fff', fontSize: 20, fontWeight: '600' }, label: { color: '#b1b7be', fontSize: 12, fontWeight: '600' },
  sheetHeader: { justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 20 },
  qualityList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, quality: { padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.line }, selected: { borderColor: colors.accent }, disabled: { opacity: 0.35 },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' }, gridRow: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
});