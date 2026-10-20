// ============================================================================
// CAMERAS — multi-camera over the same Wi-Fi.
//   Studio host : discover / scan / add LAN cameras, preview them (hardware
//                 decoded) and take one to air; the encoder transcodes it
//                 (decode → overlay → encode) in hardware.
//   LAN camera  : serve this phone's camera as RTSP and share the URL by QR.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { FlipHorizontal2, Settings2, Zap } from 'lucide-react-native';
import { StudioScanner, StudioSystem } from '../native';
import { PeerPreview, StudioPreview } from '../native/views';
import { parseCameraLink, isValidRtspUrl, type StudioCameraLink } from '../shared/studioProfile';
import { cameraShareLink, startCameraServer, stopCameraServer } from '../services/cameraRole';
import { saveCameraPairing, selectProgram, startPeerDiscovery } from '../services/peers';
import { controlConnector, type ConnectorState } from '../services/connectorControl';
import { prepareStudio } from '../services/streamController';
import { log } from '../services/logger';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { Banner, Btn, Card, Field, H1, H2, IconButton, Muted, Pill, Row, Screen, Slider } from '../ui/primitives';
import { QrCode } from '../ui/QrCode';
import { colors, radius, space } from '../ui/theme';

interface PeerEntry { key: string; name: string; url: string; info?: string; source: 'LAN' | 'Tournament' | 'Added' }

export function CameraRolePanel() {
  const deviceName = useSettings(state => state.deviceName);
  const cameraPort = useSettings(state => state.cameraPort);
  const patch = useSettings(state => state.patch);
  const url = useStudio(state => state.cameraServerUrl);
  const clients = useStudio(state => state.cameraClients);
  const effective = useStudio(state => state.effective);
  const error = useStudio(state => state.error);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = url ? cameraShareLink() : null;

  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (url) await stopCameraServer();
      else await startCameraServer();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><H2>Connector camera</H2><Pill label={`RTSP ${cameraPort}`} /></Row>
        <Field label="Camera name" value={deviceName} onChangeText={name => patch({ deviceName: name.slice(0, 30) })} autoCapitalize="words" editable={!url} />
        <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' }}>
          <StudioPreview style={{ flex: 1 }} />
        </View>
        <Btn label={url ? 'Stop connector' : 'Start connector'} variant={url ? 'danger' : 'primary'} onPress={() => void toggle()} busy={busy} />
        {(problem || error) && <Banner tone="danger" text={problem ?? error ?? ''} />}
      </Card>

      {url && link && (
        <Card>
          <H2>Pair with host</H2>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <QrCode value={link} size={220} />
            <Text selectable style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{url}</Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Pill label={`${clients} viewer${clients === 1 ? '' : 's'}`} tone={clients > 0 ? 'ok' : 'neutral'} />
              {effective && <Pill label={`${effective.preset.width}×${effective.preset.height} · ${effective.preset.fps} fps`} />}
            </Row>
            <Row style={{ flexWrap: 'wrap' }}><Btn small label="Copy RTSP URL" onPress={() => { void StudioSystem.copyText(url); }} />
              <Btn small label="Copy pairing link" onPress={() => { void StudioSystem.copyText(link); }} /></Row>
          </View>
        </Card>
      )}
    </View>
  );
}

function StudioHostPanel() {
  const lanCameras = useStudio(state => state.lanCameras);
  const remoteSources = useStudio(state => state.remoteSources);
  const programSource = useStudio(state => state.programSource);
  const engineState = useStudio(state => state.engineState);
  const manualCameras = useSettings(state => state.manualCameras);
  const deviceId = useSettings(state => state.deviceId);
  const patch = useSettings(state => state.patch);
  const [urlInput, setUrlInput] = useState('rtsp://');
  const [problem, setProblem] = useState<string | null>(null);
  const [previewOff, setPreviewOff] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => startPeerDiscovery(), []);

  const entries = useMemo<PeerEntry[]>(() => {
    const byUrl = new Map<string, PeerEntry>();
    for (const camera of lanCameras) byUrl.set(camera.url, { key: camera.url, name: camera.attrs.n || camera.name, url: camera.url, info: camera.attrs.w ? `${camera.attrs.w}×${camera.attrs.h} · ${camera.attrs.f} fps` : undefined, source: 'LAN' });
    for (const source of remoteSources) {
      if (source.id !== deviceId && source.lanUrl && !byUrl.has(source.lanUrl)) byUrl.set(source.lanUrl, { key: source.lanUrl, name: source.name, url: source.lanUrl, info: source.streamInfo, source: 'Tournament' });
    }
    for (const camera of manualCameras) if (!byUrl.has(camera.url)) byUrl.set(camera.url, { key: camera.url, name: camera.name, url: camera.url, source: 'Added' });
    return [...byUrl.values()];
  }, [lanCameras, remoteSources, manualCameras, deviceId]);

  const addCamera = useCallback((name: string, url: string) => {
    if (!isValidRtspUrl(url)) { setProblem('That is not a valid RTSP address (rtsp://host:port/path).'); return; }
    setProblem(null);
    if (!manualCameras.some(camera => camera.url === url)) patch({ manualCameras: [...manualCameras, { name, url }].slice(-8) });
  }, [manualCameras, patch]);

  const scan = async () => {
    try {
      const raw = await StudioScanner.scanQr();
      const camera = parseCameraLink(raw);
      if (!camera) { setProblem('That QR code is not a camera link.'); return; }
      saveCameraPairing(camera);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (!/cancel/i.test(text)) setProblem(text);
    }
  };

  const take = async (entry: PeerEntry) => {
    setBusyKey(entry.key);
    setProblem(null);
    try {
      if (engineState === 'idle' || engineState === 'error') await prepareStudio();
      const remote = remoteSources.find(source => source.lanUrl === entry.url);
      await selectProgram({ kind: 'peer', url: entry.url, name: entry.name }, remote?.id ?? null);
    } catch (error) {
      log.warn('peers', error);
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  };

  const onAir = (url: string) => programSource.kind === 'peer' && programSource.url === url;

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <H2>On air</H2>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pill label={programSource.kind === 'local' ? 'This phone' : programSource.name} tone="live" />
          {programSource.kind === 'peer' && <Btn small label="Back to this phone" onPress={() => { void selectProgram({ kind: 'local' }); }} />}
        </Row>
      </Card>

      {problem && <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />}

      {entries.length === 0 && (
        <Card><Muted>No connectors online.</Muted></Card>
      )}
      {entries.map((entry, index) => (
        <Card key={entry.key}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <H2>{entry.name}</H2>
              <Muted>{entry.info ? `${entry.info} · ` : ''}{entry.source}</Muted>
            </View>
            {onAir(entry.url) && <Pill label="ON AIR" tone="live" />}
          </Row>
          <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' }}>
            {!previewOff[entry.key] && !onAir(entry.url) && index < 4
              ? <PeerPreview url={entry.url} style={{ flex: 1 }} />
              : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted }}>{onAir(entry.url) ? 'On air — see the Studio tab' : 'Preview off'}</Text></View>}
          </View>
          <Row>
            <Btn label={onAir(entry.url) ? 'On air' : 'Take to air'} variant={onAir(entry.url) ? 'secondary' : 'primary'} disabled={onAir(entry.url)} busy={busyKey === entry.key} onPress={() => void take(entry)} style={{ flex: 1 }} />
            <Btn small variant="ghost" label={previewOff[entry.key] ? 'Preview' : 'Hide'} onPress={() => setPreviewOff(current => ({ ...current, [entry.key]: !current[entry.key] }))} />
            {entry.source === 'Added' && <Btn small variant="ghost" label="Remove" onPress={() => patch({ manualCameras: manualCameras.filter(camera => camera.url !== entry.url) })} />}
          </Row>
          {manualCameras.find(camera => camera.url === entry.url)?.control && <RemoteCameraControls key={entry.url}
            camera={manualCameras.find(camera => camera.url === entry.url)!} />}
        </Card>
      ))}

      <Card>
        <H2>Connect camera</H2>
        <Btn label="Scan connector QR" variant="primary" onPress={() => void scan()} />
        <Field label="Connection URL" value={urlInput} onChangeText={setUrlInput} keyboardType="url" />
        <Btn label="Connect camera" onPress={() => {
          const camera = parseCameraLink(urlInput);
          if (!camera) return;
          if (camera.control) saveCameraPairing(camera);
          else addCamera(camera.name, camera.url);
        }} disabled={!parseCameraLink(urlInput.trim())} />
      </Card>
    </View>
  );
}

export function CamerasScreen() {
  return (
    <Screen>
      <H1>Cameras</H1>
      <StudioHostPanel />
    </Screen>
  );
}

function RemoteCameraControls({ camera }: Readonly<{ camera: StudioCameraLink }>) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ConnectorState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let closed = false;
    setBusy(true);
    void controlConnector(camera, 'status').then(result => { if (!closed) { setState(result); setProblem(null); } })
      .catch(error => { if (!closed) setProblem(error instanceof Error ? error.message : 'Connector did not respond.'); })
      .finally(() => { if (!closed) setBusy(false); });
    return () => { closed = true; };
  }, [camera, open]);
  const command = async (action: 'flip' | 'torch' | 'zoom', value = 0) => {
    setBusy(true);
    try { setState(await controlConnector(camera, action, value)); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Connector did not respond.'); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 8 }}>
    <Row><IconButton icon={Settings2} label="Connector camera controls" active={open} onPress={() => setOpen(value => !value)} /></Row>
    {open && <>
      <Row><IconButton icon={FlipHorizontal2} label="Flip connector camera" disabled={busy} onPress={() => void command('flip')} />
        <IconButton icon={Zap} label="Connector torch" disabled={busy || !state?.flash} active={state?.torch} onPress={() => void command('torch', state?.torch ? 0 : 1)} />
        {state && <Pill label={`${state.zoom.toFixed(1)}x`} />}</Row>
      {state && state.maxZoom > state.minZoom && <Slider value={state.zoom} min={state.minZoom} max={state.maxZoom} step={0.1} label="Connector zoom"
        onChange={zoom => setState(current => current ? { ...current, zoom } : current)} onComplete={zoom => { void command('zoom', zoom); }} />}
      {problem && <Banner tone="warn" text={problem} />}
    </>}
  </View>;
}
