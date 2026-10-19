import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Camera, Radio } from 'lucide-react-native';
import { PeerPreview } from '../native/views';
import type { StudioScene } from '../shared/scenes';
import { useStudio } from '../store/studioStore';
import { colors } from './theme';

export function SceneThumbnail({ scene, selected, onAir, livePreview = false, onPress, style }: Readonly<{
  scene: StudioScene; selected?: boolean; onAir?: boolean; livePreview?: boolean; onPress: () => void; style?: StyleProp<ViewStyle>;
}>) {
  const frame = useStudio(state => state.scenePreviews[scene.id]);
  const remote = scene.camera.kind === 'peer';
  const CameraIcon = remote ? Radio : Camera;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Scene ${scene.name}`} accessibilityState={{ selected: !!selected }}
      style={[s.root, selected && s.selected, style]}>
      <View style={s.preview}>
        {remote && livePreview && !onAir && scene.camera.kind === 'peer'
          ? <PeerPreview url={scene.camera.url} style={StyleSheet.absoluteFill} />
          : frame
            ? <Image source={{ uri: frame }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={s.placeholder}><CameraIcon color={colors.muted} size={20} /></View>}
        <View style={[s.badge, onAir && s.badgeOn]}><Text style={[s.badgeText, onAir && { color: colors.accent }]}>
          {onAir ? 'PGM' : remote ? 'LAN' : scene.camera.kind === 'local' && scene.camera.facing === 'front' ? 'FRONT' : 'REAR'}
        </Text></View>
      </View>
      <Text style={[s.name, selected && { color: colors.accent }]} numberOfLines={1}>{scene.name}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { borderRadius: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, overflow: 'hidden' },
  selected: { borderColor: colors.accent },
  preview: { aspectRatio: 16 / 9, backgroundColor: '#080b0f', overflow: 'hidden' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 10, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 5 },
  badge: { position: 'absolute', left: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  badgeOn: { backgroundColor: '#063721' },
  badgeText: { color: '#fff', fontSize: 8, fontWeight: '700' },
});