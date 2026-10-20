import React from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowRight, Camera, Clapperboard, ClipboardList, Download } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNav } from '../store/navStore';
import { useSettings } from '../store/settingsStore';
import { isLiveState, useStudio } from '../store/studioStore';
import { IconButton, Pill, Row } from '../ui/primitives';
import { colors } from '../ui/theme';
import { STUDIO_GAME_LABELS } from '../shared/studioProfile';

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const setWorkspace = useNav(state => state.setWorkspace);
  const setTab = useNav(state => state.setTab);
  const live = useStudio(state => state.engineMode === 'studio' && isLiveState(state.engineState));
  const serving = useStudio(state => !!state.cameraServerUrl);
  const version = useStudio(state => state.appInfo?.versionName);
  const scoring = useSettings(state => state.scoringWorkspace);
  const pairing = useSettings(state => state.pairing);
  return (
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
      <View style={s.inner}>
        <Row style={s.header}>
          <Image source={require('../assets/njs-store.png')} style={s.logo} resizeMode="contain" />
          <View style={{ flex: 1 }}><Text style={s.brand}>NJS Live Studio</Text>{version && <Text style={s.version}>v{version}</Text>}</View>
          <IconButton icon={Download} label="App updates" onPress={() => setTab('tournament')} />
        </Row>
        <View style={[s.choices, width > height && s.landscape]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Camera" onPress={() => { if (live || serving || useStudio.getState().stats?.recording) Alert.alert('Camera is in use', 'Stop Streaming or the Connector before opening Camera.'); else setWorkspace('recording'); }} style={({ pressed }) => [s.choice, pressed && s.pressed]}>
            <Camera size={29} strokeWidth={1.5} color="#ff9b9b" />
            <View style={s.choiceText}><Text style={s.title}>Camera</Text></View>
            <ArrowRight size={20} color={colors.muted} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Streaming" onPress={() => { if (serving) setWorkspace('connector'); else if (live) setTab('studio'); else setWorkspace('streaming-role'); }} style={({ pressed }) => [s.choice, pressed && s.pressed]}>
            <Clapperboard size={29} strokeWidth={1.5} color={colors.accent} />
            <View style={s.choiceText}><Text style={s.title}>Streaming</Text>{pairing && <Text style={s.detail} numberOfLines={1}>{pairing.slug}</Text>}</View>
            {live || serving ? <Pill label={serving ? 'CAMERA' : 'LIVE'} tone={serving ? 'ok' : 'live'} /> : <ArrowRight size={20} color={colors.muted} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Scoring" onPress={() => setWorkspace('scoring')} style={({ pressed }) => [s.choice, pressed && s.pressed]}>
            <ClipboardList size={29} strokeWidth={1.5} color="#7ac6ea" />
            <View style={s.choiceText}><Text style={s.title}>Scoring</Text>{scoring && <Text style={s.detail} numberOfLines={1}>{scoring.slug} · {STUDIO_GAME_LABELS[scoring.game]}</Text>}</View>
            <ArrowRight size={20} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center' },
  inner: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 28 },
  header: { gap: 12 },
  logo: { width: 46, height: 46 },
  brand: { color: colors.text, fontSize: 18, fontWeight: '700' },
  version: { color: colors.muted, fontSize: 11, marginTop: 3 },
  choices: { gap: 12 },
  landscape: { flexDirection: 'row' },
  choice: { flexDirection: 'row', flex: 1, minHeight: 100, padding: 14, gap: 12, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  pressed: { backgroundColor: colors.card2 },
  choiceText: { flex: 1, minWidth: 0, gap: 6 },
  title: { color: colors.text, fontSize: 19, fontWeight: '600' },
  detail: { color: colors.muted, fontSize: 11 },
});