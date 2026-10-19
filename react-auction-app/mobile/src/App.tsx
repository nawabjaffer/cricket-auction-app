import React, { useEffect, useMemo } from 'react';
import { Alert, BackHandler, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioSystem } from './native';
import { CamerasScreen } from './screens/CamerasScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StudioScreen } from './screens/StudioScreen';
import { TournamentScreen, confirmPairing } from './screens/TournamentScreen';
import { applyPairing, classifyLink, subscribeIncomingLinks } from './services/deepLink';
import { startProgramSync } from './services/peers';
import { bindRemoteKeys } from './services/remoteKeys';
import { bindEngineEvents, effectiveMatchId } from './services/streamController';
import { startDeviceHealth, startTournamentSync } from './services/sync';
import { log } from './services/logger';
import { STUDIO_GAME_LABELS, isValidRtspUrl } from './shared/studioProfile';
import { useNav, type Tab } from './store/navStore';
import { useSettings } from './store/settingsStore';
import { isLiveState, useStudio } from './store/studioStore';
import { colors, space } from './ui/theme';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: string }> = [
  { id: 'studio', label: 'Studio', icon: '🎥' },
  { id: 'cameras', label: 'Cameras', icon: '📡' },
  { id: 'setup', label: 'Setup', icon: '⚙️' },
  { id: 'tournament', label: 'Tournament', icon: '🏆' },
];

function TabBar() {
  const insets = useSafeAreaInsets();
  const tab = useNav(state => state.tab);
  const setTab = useNav(state => state.setTab);
  const live = useStudio(state => isLiveState(state.engineState));
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {TABS.map(item => {
        const active = item.id === tab;
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.id)} style={styles.tab}>
            <Text style={[styles.tabIcon, !active && { opacity: 0.55 }]}>{item.icon}</Text>
            <Text style={[styles.tabLabel, active && { color: colors.accent }]}>{item.label}</Text>
            {live && item.id === 'studio' && <View style={styles.liveDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function Content() {
  const insets = useSafeAreaInsets();
  const tab = useNav(state => state.tab);
  if (tab === 'studio') return <StudioScreen />;
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
      {tab === 'cameras' && <CamerasScreen />}
      {tab === 'setup' && <SetupScreen />}
      {tab === 'tournament' && <TournamentScreen />}
    </View>
  );
}

function Shell() {
  const hydrated = useSettings(state => state.hydrated);
  const pairing = useSettings(state => state.pairing);
  const role = useSettings(state => state.role);
  const activeMatchId = useStudio(state => state.activeMatchId);
  const setTab = useNav(state => state.setTab);

  useEffect(() => {
    useSettings.getState().hydrate()
      .then(() => StudioSystem.getAppInfo())
      .then(info => {
        useStudio.getState().patch({ appInfo: info });
        const settings = useSettings.getState();
        if (settings.deviceName === 'Phone' && info.model) settings.patch({ deviceName: info.model.slice(0, 30) });
      })
      .catch(error => log.error('boot', error));
    const stopEngine = bindEngineEvents();
    const stopKeys = bindRemoteKeys();
    const stopHealth = startDeviceHealth();
    return () => { stopEngine(); stopKeys(); stopHealth(); };
  }, []);

  const tenantId = pairing?.tenantId;
  const game = pairing?.game;
  useEffect(() => {
    if (!hydrated || !pairing) return undefined;
    return startTournamentSync(pairing);
    // Re-subscribe only when the tournament or game changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tenantId, game]);

  const matchId = pairing?.matchId ?? activeMatchId;
  useEffect(() => {
    if (!hydrated || !tenantId || !game || !matchId || role !== 'studio') return undefined;
    return startProgramSync({ tenantId, game, matchId: effectiveMatchId() ?? matchId });
  }, [hydrated, tenantId, game, matchId, role]);

  useEffect(() => subscribeIncomingLinks(url => {
    const link = classifyLink(url);
    if (link.kind === 'pair') {
      const { pairing: incoming } = link;
      confirmPairing(incoming.origin, incoming.slug, STUDIO_GAME_LABELS[incoming.game], () => {
        applyPairing(incoming).then(() => setTab('studio')).catch(error => Alert.alert('Could not pair', error instanceof Error ? error.message : String(error)));
      });
    } else if (link.kind === 'camera' && isValidRtspUrl(link.camera.url)) {
      const settings = useSettings.getState();
      if (!settings.manualCameras.some(camera => camera.url === link.camera.url)) {
        settings.patch({ manualCameras: [...settings.manualCameras, { name: link.camera.name, url: link.camera.url }].slice(-8), role: 'studio' });
      }
      setTab('cameras');
    }
  }), [setTab]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const { tab, setTab: go } = useNav.getState();
      if (tab !== 'studio') { go('studio'); return true; }
      if (isLiveState(useStudio.getState().engineState)) {
        Alert.alert('Streaming is live', 'Use END STREAM to stop before leaving the app.');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, []);

  const statusBar = useMemo(() => <StatusBar barStyle="light-content" />, []);

  if (!hydrated) {
    return <View style={[styles.splash]}><Text style={styles.splashText}>NJS Live Studio</Text></View>;
  }
  return (
    <View style={styles.root}>
      {statusBar}
      <View style={{ flex: 1 }}><Content /></View>
      <TabBar />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  splashText: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  tabBar: { flexDirection: 'row', backgroundColor: '#0a1022', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.xs },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space.xs, gap: 2 },
  tabIcon: { fontSize: 20 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  liveDot: { position: 'absolute', top: 2, right: '28%', width: 9, height: 9, borderRadius: 5, backgroundColor: colors.live },
});
