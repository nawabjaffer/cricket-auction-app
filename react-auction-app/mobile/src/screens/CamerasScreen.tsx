// ============================================================================
// CAMERAS — multi-camera over the same Wi-Fi.
//   Studio host : discover / scan / add LAN cameras, preview them (hardware
//                 decoded) and take one to air; the encoder transcodes it
//                 (decode → overlay → encode) in hardware.
//   LAN camera  : serve this phone's camera as RTSP and share the URL by QR.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { StudioScanner, StudioSystem } from '../native';
import { PeerPreview, StudioPreview } from '../native/views';
import { parseCameraLink, isValidRtspUrl } from '../shared/studioProfile';
import { cameraShareLink, startCameraServer, stopCameraServer } from '../services/cameraRole';
import { selectProgram, startPeerDiscovery } from '../services/peers';
import { prepareStudio } from '../services/streamController';
import { log } from '../services/logger';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { Banner, Btn, Card, Field, H1, H2, Muted, Pill, Row, Screen, Segmented } from '../ui/primitives';
import { QrCode } from '../ui/QrCode';
import { colors, radius, space } from '../ui/theme';

interface PeerEntry { key: string; name: string; url: string; info?: string; source: 'LAN' | 'Tournament' | 'Added' }

function CameraRolePanel() {
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
        <H2>Use this phone as a LAN camera</H2>
        <Muted>Other phones on the same Wi-Fi (or hotspot) — and OBS or VLC — can pull this camera as an RTSP stream. Start it, then scan the QR from the studio phone.</Muted>
        <Field label="Camera name" value={deviceName} onChangeText={name => patch({ deviceName: name.slice(0, 30) })} autoCapitalize="words" editable={!url} />
        <Field label="Port" value={String(cameraPort)} keyboardType="number-pad" editable={!url} onChangeText={value => { const port = Number(value.replace(/\D/g, '')); if (port >= 1024 && port <= 65535) patch({ cameraPort: port }); }} />
        <View style={{ aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' }}>
          <StudioPreview style={{ flex: 1 }} />
        </View>
        <Btn label={url ? 'Stop LAN camera' : 'Start LAN camera'} variant={url ? 'danger' : 'primary'} onPress={() => void toggle()} busy={busy} />
        {(problem || error) && <Banner tone="danger" text={problem ?? error ?? ''} />}
      </Card>

      {url && link && (
        <Card>
          <H2>Share this camera</H2>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <QrCode value={link} size={220} />
            <Text selectable style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>{url}</Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Pill label={`${clients} viewer${clients === 1 ? '' : 's'}`} tone={clients > 0 ? 'ok' : 'neutral'} />
              {effective && <Pill label={`${effective.preset.width}×${effective.preset.height} · ${effective.preset.fps} fps`} />}
            </Row>
            <Btn small label="Copy RTSP URL" onPress={() => { void StudioSystem.copyText(url); }} />
          </View>
          <Muted>On the studio phone open Cameras › Scan camera QR. For OBS/VLC add a media source with the RTSP URL above.</Muted>
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
      addCamera(camera.name, camera.url);
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
        <Muted>The camera on air is decoded and re-encoded in hardware together with your overlays, so every viewer sees one seamless stream. Open the Studio tab to watch it.</Muted>
      </Card>

      {problem && <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />}

      {entries.length === 0 && (
        <Card><Muted>No cameras found yet. On each camera phone choose Cameras › LAN camera › Start, then scan its QR here. Phones on the same Wi-Fi appear automatically.</Muted></Card>
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
        </Card>
      ))}

      <Card>
        <H2>Add a camera</H2>
        <Btn label="Scan camera QR" variant="primary" onPress={() => void scan()} />
        <Field label="Or enter an RTSP address" value={urlInput} onChangeText={setUrlInput} keyboardType="url" hint="Another phone, an IP camera or any RTSP source on your network." />
        <Btn label="Add camera" onPress={() => { addCamera(parseCameraLink(urlInput)?.name ?? 'Camera', urlInput.trim()); }} disabled={!isValidRtspUrl(urlInput.trim())} />
      </Card>
    </View>
  );
}

export function CamerasScreen() {
  const role = useSettings(state => state.role);
  const patch = useSettings(state => state.patch);
  const serving = useStudio(state => state.cameraServerUrl);
  return (
    <Screen>
      <H1>Cameras</H1>
      <Segmented
        options={[{ value: 'studio', label: 'Studio host' }, { value: 'camera', label: 'LAN camera' }]}
        value={role}
        onChange={next => { if (!(serving && next === 'studio')) patch({ role: next }); }}
      />
      {serving && role === 'camera' && <Banner tone="info" text="This phone is serving a LAN camera. Stop it to use the studio on this phone." />}
      {role === 'camera' ? <CameraRolePanel /> : <StudioHostPanel />}
    </Screen>
  );
}
