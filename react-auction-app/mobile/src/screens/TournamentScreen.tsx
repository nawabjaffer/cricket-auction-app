// ============================================================================
// TOURNAMENT — pair the phone with a tournament, pick the match, check for
// updates and read device diagnostics.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { StudioScanner, StudioSystem } from '../native';
import { STUDIO_GAME_LABELS, STUDIO_GAME_TYPES, normalizeOrigin, type StudioGameType } from '../shared/studioProfile';
import { applyPairing, classifyLink, PairingError } from '../services/deepLink';
import { checkForUpdate, type UpdateInfo } from '../services/updateCheck';
import { getLogs, subscribeLogs } from '../services/logger';
import { log } from '../services/logger';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { Banner, Btn, Card, Field, H1, H2, Muted, Pill, Row, Screen, Segmented } from '../ui/primitives';
import { colors, radius, space } from '../ui/theme';

export function useLogs(): readonly ReturnType<typeof getLogs>[number][] {
  const [, force] = useState(0);
  useEffect(() => subscribeLogs(() => force(value => value + 1)), []);
  return getLogs();
}

export function confirmPairing(origin: string, slug: string, game: string, accept: () => void): void {
  Alert.alert('Pair with this tournament?', `${slug} · ${game}\n${origin}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Pair', onPress: accept },
  ]);
}

export function TournamentScreen() {
  const pairing = useSettings(state => state.pairing);
  const origin = useSettings(state => state.origin);
  const deviceName = useSettings(state => state.deviceName);
  const patch = useSettings(state => state.patch);
  const setPairing = useSettings(state => state.setPairing);
  const tenant = useStudio(state => state.tenant);
  const matches = useStudio(state => state.matches);
  const activeMatchId = useStudio(state => state.activeMatchId);
  const appInfo = useStudio(state => state.appInfo);
  const caps = useStudio(state => state.capabilities);
  const network = useStudio(state => state.network);
  const battery = useStudio(state => state.battery);
  const thermal = useStudio(state => state.thermal);
  const logs = useLogs();

  const [originInput, setOriginInput] = useState(origin);
  const [slugInput, setSlugInput] = useState(pairing?.slug ?? '');
  const [gameInput, setGameInput] = useState<StudioGameType>(pairing?.game ?? 'cricket');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const pair = async (input: { origin: string; tenantId: string; slug: string; game: StudioGameType; matchId?: string }) => {
    setBusy(true);
    setProblem(null);
    try {
      await applyPairing(input);
    } catch (error) {
      setProblem(error instanceof PairingError || error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setProblem(null);
    try {
      const raw = await StudioScanner.scanQr();
      const link = classifyLink(raw);
      if (link.kind === 'pair') {
        const { pairing: incoming } = link;
        confirmPairing(incoming.origin, incoming.slug, STUDIO_GAME_LABELS[incoming.game], () => { void pair(incoming); });
      } else setProblem('That QR code is not a pairing code. Open the Mobile Studio page on the tournament admin and scan the pairing QR.');
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (!/cancel/i.test(text)) setProblem(text);
    }
  };

  const manual = () => {
    const normalized = normalizeOrigin(originInput);
    if (!normalized) { setProblem('Enter the server address, e.g. https://e-auction-store.web.app'); return; }
    if (!slugInput.trim()) { setProblem('Enter the tournament name (the part of the URL after the server address).'); return; }
    void pair({ origin: normalized, tenantId: '', slug: slugInput.trim(), game: gameInput, matchId: pairing?.matchId });
  };

  const check = async () => {
    setChecking(true);
    setUpdateError(null);
    setUpdate(null);
    try {
      const installed = appInfo ?? await StudioSystem.getAppInfo();
      if (!appInfo) useStudio.getState().patch({ appInfo: installed });
      setUpdate(await checkForUpdate(origin, installed.versionCode, {
        channel: installed.developmentSigned ? 'testing' : 'stable', sdk: installed.sdk, signerSha256: installed.signerSha256,
      }));
    } catch (error) {
      log.warn('update', error);
      setUpdateError(error instanceof Error ? error.message : 'Could not check for updates. Try again.');
    } finally {
      setChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (!update?.available || !update.apkUrl) return;
    setDownloading(true);
    setUpdateError(null);
    try { await Linking.openURL(update.apkUrl); }
    catch { setUpdateError('Could not open the APK download. Check that a browser is enabled on this phone.'); }
    finally { setDownloading(false); }
  };

  const chooseMatch = (matchId: string | undefined) => { if (pairing) setPairing({ ...pairing, matchId }); };

  const bestBack = caps?.cameras.find(camera => camera.facing === 'back');
  const max = bestBack?.sizes.reduce((best, size) => (size.w * size.h > best.w * best.h ? size : best), { w: 0, h: 0, maxFps: 0 });

  return (
    <Screen>
      <H1>Tournament</H1>

      <Card>
        <H2>{pairing ? 'Paired' : 'Not paired'}</H2>
        {pairing ? (
          <>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{tenant?.name ?? pairing.slug}</Text>
            <Row style={{ flexWrap: 'wrap' }}>
              <Pill label={STUDIO_GAME_LABELS[pairing.game]} tone="ok" />
              <Pill label={origin.replace(/^https?:\/\//, '')} />
            </Row>
          </>
        ) : (
          <Muted>Pair with your tournament to load its scoreboard overlay, quality settings and match list. You can still stream without pairing by using Setup › Platforms.</Muted>
        )}
        <Btn label="Scan pairing QR" variant="primary" onPress={() => void scan()} busy={busy} />
        {problem && <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />}
      </Card>

      <Card>
        <H2>Pair manually</H2>
        <Field label="Server" value={originInput} onChangeText={setOriginInput} keyboardType="url" />
        <Field label="Tournament" value={slugInput} onChangeText={setSlugInput} placeholder="e.g. pkl-2026" hint="The name in the web address: server/<tournament>/…" />
        <Segmented options={STUDIO_GAME_TYPES.map(game => ({ value: game, label: STUDIO_GAME_LABELS[game] }))} value={gameInput} onChange={setGameInput} />
        <Btn label="Connect" onPress={manual} busy={busy} />
        {pairing && <Btn label="Unpair" variant="ghost" onPress={() => { setPairing(null); useStudio.getState().patch({ tenant: null, profile: null, matches: [], activeMatchId: null }); }} />}
      </Card>

      {pairing && (
        <Card>
          <H2>Match</H2>
          <MatchOption label="Follow the on-air match" subtitle="Overlay and cameras switch automatically" selected={!pairing.matchId} onPress={() => chooseMatch(undefined)} />
          {matches.map(match => (
            <MatchOption
              key={match.id}
              label={match.title}
              subtitle={`${match.status}${match.stage ? ` · ${match.stage}` : ''}${match.id === activeMatchId ? ' · on air' : ''}`}
              selected={pairing.matchId === match.id}
              onPress={() => chooseMatch(match.id)}
            />
          ))}
          {matches.length === 0 && <Muted>No matches yet. Create fixtures in the scorer admin.</Muted>}
        </Card>
      )}

      <Card>
        <H2>This phone</H2>
        <Field label="Name shown to the admin and on LAN" value={deviceName} onChangeText={value => patch({ deviceName: value.slice(0, 30) })} autoCapitalize="words" />
      </Card>

      <Card>
        <H2>App</H2>
        <Text style={{ color: colors.text }}>NJS Live Studio {appInfo?.versionName ?? '—'} (build {appInfo?.versionCode ?? '—'})</Text>
        {appInfo && <Pill label={appInfo.developmentSigned ? 'Testing updates' : 'Production updates'} tone={appInfo.developmentSigned ? 'warn' : 'neutral'} />}
        <Btn label="Check for updates" onPress={() => void check()} busy={checking} />
        {updateError && <Banner tone="warn" text={updateError} onDismiss={() => setUpdateError(null)} />}
        {update && !update.available && <Muted>{update.manifest ? 'No newer version is available on this update channel.' : 'No release has been published on this update channel yet.'}</Muted>}
        {update?.available && update.manifest && update.apkUrl && (
          <>
            <Banner tone="info" text={`Version ${update.manifest.versionName} is available${update.manifest.channel === 'testing' ? ' (testing build)' : ''}.`} />
            <Btn label="Download update" variant="primary" onPress={() => void downloadUpdate()} busy={downloading} />
          </>
        )}
      </Card>

      <Card>
        <H2>Diagnostics</H2>
        <Muted>
          {appInfo ? `${appInfo.model} · Android API ${appInfo.sdk}` : ''}{'\n'}
          {max && max.w > 0 ? `Camera up to ${max.w}×${max.h} @ ${max.maxFps} fps\n` : ''}
          {caps ? `H.264 ${caps.encoders.h264 ? (caps.encoders.h264.hardware ? 'hardware' : 'software') : 'n/a'} · HEVC ${caps.encoders.h265 ? (caps.encoders.h265.hardware ? 'hardware' : 'software') : 'n/a'}\n` : ''}
          {network ? `Network ${network.connected ? network.type : 'offline'}${network.metered ? ' (metered)' : ''} · ${network.addresses.map(address => address.ip).join(', ') || 'no address'}\n` : ''}
          {battery ? `Battery ${Math.round(battery.level)}%${battery.charging ? ' charging' : ''} · ${battery.temperatureC.toFixed(0)}°C · thermal ${thermal}` : ''}
        </Muted>
        <Btn small variant="ghost" label={showLogs ? 'Hide log' : 'Show log'} onPress={() => setShowLogs(value => !value)} />
        {showLogs && (
          <View style={{ backgroundColor: '#020617', borderRadius: radius.md, padding: space.sm, gap: 2 }}>
            {logs.slice(-40).map((entry, index) => (
              <Pressable key={`${entry.at}-${index}`}>
                <Text style={{ color: entry.level === 'error' ? colors.danger : entry.level === 'warn' ? colors.warn : colors.muted, fontSize: 11, fontFamily: 'monospace' }}>
                  {new Date(entry.at).toLocaleTimeString()} [{entry.tag}] {entry.message}
                </Text>
              </Pressable>
            ))}
            {logs.length === 0 && <Text style={{ color: colors.muted, fontSize: 11 }}>No events yet.</Text>}
          </View>
        )}
        <Btn small variant="ghost" label="Android app settings" onPress={() => { void StudioSystem.openAppSettings(); }} />
      </Card>
    </Screen>
  );
}

function MatchOption({ label, subtitle, selected, onPress }: Readonly<{ label: string; subtitle: string; selected: boolean; onPress: () => void }>) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? 'rgba(61,220,132,0.1)' : 'transparent' }}
    >
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{subtitle}</Text>
    </Pressable>
  );
}
