import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Camera, Home, Link, Radio, Video, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNav } from '../store/navStore';
import { useSettings } from '../store/settingsStore';
import { isLiveState, useStudio } from '../store/studioStore';
import { Banner, Field, H1, IconButton, Row, Screen } from '../ui/primitives';
import { colors } from '../ui/theme';
import { CameraRolePanel } from './CamerasScreen';
import { VideoSection } from './setup/VideoSection';
import { TournamentScreen } from './TournamentScreen';

export function StreamingRoleScreen() {
  const insets = useSafeAreaInsets();
  const setWorkspace = useNav(state => state.setWorkspace);
  const patch = useSettings(state => state.patch);
  const serving = useStudio(state => !!state.cameraServerUrl);
  const live = useStudio(state => state.engineMode === 'studio' && isLiveState(state.engineState));
  return <ScrollView style={s.root} contentContainerStyle={{ padding: 18, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18, gap: 18 }}>
    <Row><IconButton icon={Home} label="Back to home" onPress={() => setWorkspace('home')} /><H1>Streaming</H1></Row>
    {serving && <Banner text="Stop this connector camera before starting a host stream." />}
    <Pressable accessibilityRole="button" accessibilityLabel="Host" disabled={serving} onPress={() => { patch({ role: 'studio' }); setWorkspace('streaming'); }} style={[s.choice, serving && s.disabled]}>
      <Video size={28} color={colors.accent} /><View style={s.text}><Text style={s.title}>Host</Text><Text style={s.subtitle}>Scenes, overlays, YouTube and multistream</Text></View><ArrowRight size={20} color={colors.muted} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Connector" disabled={live} onPress={() => { patch({ role: 'camera' }); setWorkspace('connector'); }} style={[s.choice, live && s.disabled]}>
      <Camera size={28} color="#7ac6ea" /><View style={s.text}><Text style={s.title}>Connector</Text><Text style={s.subtitle}>Share this camera with the host</Text></View><ArrowRight size={20} color={colors.muted} />
    </Pressable>
  </ScrollView>;
}

export function ConnectorScreen() {
  const insets = useSafeAreaInsets();
  const setWorkspace = useNav(state => state.setWorkspace);
  const [panel, setPanel] = useState<'quality' | 'pairing' | null>(null);
  const cameraPort = useSettings(state => state.cameraPort);
  const patch = useSettings(state => state.patch);
  const serving = useStudio(state => !!state.cameraServerUrl);
  return <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <Row style={{ padding: 10 }}><IconButton icon={Home} label="Host or connector" onPress={() => setWorkspace('streaming-role')} /><Radio size={18} color={colors.accent} /><Text style={s.title}>Connector</Text>
      <View style={{ flex: 1 }} /><IconButton icon={Camera} label="Connector quality and camera settings" onPress={() => setPanel('quality')} />
      <IconButton icon={Link} label="Tournament pairing" onPress={() => setPanel('pairing')} />
    </Row>
    <Screen><CameraRolePanel /></Screen>
    <Modal visible={panel !== null} animationType="slide" onRequestClose={() => setPanel(null)} supportedOrientations={['portrait', 'landscape']}>
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Row style={{ padding: 12, justifyContent: 'space-between' }}><Text style={s.title}>{panel === 'quality' ? 'Camera settings' : 'Tournament'}</Text><IconButton icon={X} label="Close connector settings" onPress={() => setPanel(null)} /></Row>
        {panel === 'quality' ? <Screen><Field label="Camera port" value={String(cameraPort)} editable={!serving} keyboardType="number-pad" onChangeText={text => { const port = Number(text); if (Number.isInteger(port) && port >= 1024 && port <= 65535) patch({ cameraPort: port }); }} /><VideoSection /></Screen> : <TournamentScreen />}
      </View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 110, padding: 16, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  text: { flex: 1, minWidth: 0, gap: 7 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 12 },
  disabled: { opacity: 0.4 },
});