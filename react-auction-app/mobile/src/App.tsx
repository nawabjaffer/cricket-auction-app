import React, { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, Image, Pressable, StatusBar, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { Camera, Clapperboard, Home, Layers, Settings2, Trophy, type LucideIcon } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StudioSystem } from './native';
import { CamerasScreen } from './screens/CamerasScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StudioScreen } from './screens/StudioScreen';
import { ScenesScreen } from './screens/ScenesScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ScoringScreen } from './screens/ScoringScreen';
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

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'studio', label: 'Studio', icon: Clapperboard },
  { id: 'cameras', label: 'Cameras', icon: Camera },
  { id: 'scenes', label: 'Scene Setup', icon: Layers },
  { id: 'setup', label: 'Setup', icon: Settings2 },
  { id: 'tournament', label: 'Tournament', icon: Trophy },
];

function TabBar() {
  const insets = useSafeAreaInsets();
  const tab = useNav(state => state.tab);
  const setTab = useNav(state => state.setTab);
  const setWorkspace = useNav(state => state.setWorkspace);
  const clean = useNav(state => state.studioClean);
  const live = useStudio(state => isLiveState(state.engineState));
  if (tab === 'studio' && clean) return null;
  return (
    <View style={[styles.tabBar, tab === 'studio' && styles.overlayTabs, { paddingBottom: Math.max(insets.bottom, space.xs) }]}>
      {TABS.map(item => {
        const active = item.id === tab;
        const TabIcon = item.icon;
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }}
            onPress={() => setTab(item.id)} onLongPress={() => ToastAndroid.show(item.label, ToastAndroid.SHORT)} style={styles.tab}>
            <TabIcon size={18} strokeWidth={1.8} color={active ? colors.accent : colors.muted} />
            <Text style={[styles.tabLabel, active && { color: colors.accent }]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
            {live && item.id === 'studio' && <View style={styles.liveDot} />}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="Streaming and Scoring home" onPress={() => setWorkspace('home')} style={styles.homeTab}><Home size={17} color={colors.muted} /></Pressable>
    </View>
  );
}

function Content() {
  const insets = useSafeAreaInsets();
  const tab = useNav(state => state.tab);
  const workspace = useNav(state => state.workspace);
  const [scoringOpened, setScoringOpened] = useState(workspace === 'scoring');
  useEffect(() => { if (workspace === 'scoring') setScoringOpened(true); }, [workspace]);
  return (
    <View style={{ flex: 1 }}>
      {workspace === 'home' && <HomeScreen />}
      {workspace === 'streaming' && (tab === 'studio' ? <StudioScreen /> : <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.bg }}>
        {tab === 'cameras' && <CamerasScreen />}
        {tab === 'setup' && <SetupScreen />}
        {tab === 'tournament' && <TournamentScreen />}
        {tab === 'scenes' && <ScenesScreen />}
      </View>)}
      {(scoringOpened || workspace === 'scoring') && <View style={{ flex: 1, display: workspace === 'scoring' ? 'flex' : 'none' }}>
        <ScoringScreen active={workspace === 'scoring'} />
      </View>}
    </View>
  );
}

function Shell() {
  const hydrated = useSettings(state => state.hydrated);
  const pairing = useSettings(state => state.pairing);
  const role = useSettings(state => state.role);
  const activeMatchId = useStudio(state => state.activeMatchId);
  const setTab = useNav(state => state.setTab);
  const workspace = useNav(state => state.workspace);
  const live = useStudio(state => isLiveState(state.engineState));

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
    const stopHealth = startDeviceHealth();
    return () => { stopEngine(); stopHealth(); };
  }, []);

  useEffect(() => {
    if (!hydrated || (workspace !== 'streaming' && !live)) return undefined;
    return bindRemoteKeys();
  }, [hydrated, workspace, live]);

  const tenantId = pairing?.tenantId;
  const game = pairing?.game;
  useEffect(() => {
    if (!hydrated || !pairing || (workspace !== 'streaming' && !live)) return undefined;
    return startTournamentSync(pairing);
    // Re-subscribe only when the tournament or game changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, tenantId, game, workspace, live]);

  const matchId = pairing?.matchId ?? activeMatchId;
  useEffect(() => {
    if (!hydrated || !tenantId || !game || !matchId || role !== 'studio' || (workspace !== 'streaming' && !live)) return undefined;
    return startProgramSync({ tenantId, game, matchId: effectiveMatchId() ?? matchId });
  }, [hydrated, tenantId, game, matchId, role, workspace, live]);

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
      if (useNav.getState().workspace === 'home') {
        if (!isLiveState(useStudio.getState().engineState)) return false;
        Alert.alert('Streaming is live', 'Open Streaming and use End stream before leaving the app.');
        return true;
      }
      if (useNav.getState().workspace === 'scoring') { useNav.getState().setWorkspace('home'); return true; }
      if (tab !== 'studio') { go('studio'); return true; }
      if (useNav.getState().studioClean) { useNav.getState().setStudioClean(false); return true; }
      if (isLiveState(useStudio.getState().engineState)) {
        Alert.alert('Streaming is live', 'Use END STREAM to stop before leaving the app.');
        return true;
      }
      useNav.getState().setWorkspace('home');
      return true;
    });
    return () => subscription.remove();
  }, []);

  const statusBar = useMemo(() => <StatusBar barStyle="light-content" />, []);

  if (!hydrated) {
    return <View style={styles.splash}><Image source={require('./assets/njs-store.png')} style={styles.splashLogo} resizeMode="contain" /><Text style={styles.splashText}>NJS Live Studio</Text></View>;
  }
  return (
    <View style={styles.root}>
      {statusBar}
      <View style={{ flex: 1 }}><Content /></View>
      {workspace === 'streaming' && <TabBar />}
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
  splashLogo: { width: 64, height: 64, marginBottom: 14 },
  splashText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: '#10151b', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 3 },
  overlayTabs: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(12,15,19,0.92)' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 2, gap: 3 },
  tabLabel: { color: colors.muted, fontSize: 9, fontWeight: '600' },
  liveDot: { position: 'absolute', top: 3, right: '30%', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.live },
  homeTab: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
