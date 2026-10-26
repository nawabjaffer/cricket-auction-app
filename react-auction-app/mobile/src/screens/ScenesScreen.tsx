import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowDown, ArrowUp, Camera, Copy, Eye, EyeOff, Globe, Image as ImageIcon, Pencil, Play, Plus, Radio, Sparkles, Trash2, X } from 'lucide-react-native';
import { MAX_STUDIO_SCENES, SCENE_ANIMATION_PRESETS, createScene, type SceneCamera, type StudioScene } from '../shared/scenes';
import { MAX_STUDIO_WIDGETS, isValidCameraSourceUrl, sanitizeWidgetUrl, type StudioWidget } from '../shared/studioProfile';
import { activateScene } from '../services/scenes';
import { triggerSceneAnimation } from '../services/sceneAnimations';
import { startPeerDiscovery } from '../services/peers';
import { useSettings } from '../store/settingsStore';
import { useStudio } from '../store/studioStore';
import { useNav } from '../store/navStore';
import { Banner, Btn, Field, H1, H2, IconButton, Pill, Row, Screen, Segmented, Slider, ToggleRow } from '../ui/primitives';
import { SceneThumbnail } from '../ui/SceneThumbnail';
import { colors, space } from '../ui/theme';

const POSITIONS: ReadonlyArray<{ value: StudioWidget['anchor']; label: string }> = [
  { value: 'full', label: 'Full' }, { value: 'top-left', label: 'Top left' }, { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' }, { value: 'bottom-center', label: 'Bottom' }, { value: 'bottom-right', label: 'Bottom right' },
];

export function ScenesScreen() {
  const scenes = useSettings(state => state.scenes);
  const activeId = useSettings(state => state.activeSceneId);
  const pairing = useSettings(state => state.pairing);
  const manualCameras = useSettings(state => state.manualCameras);
  const patch = useSettings(state => state.patch);
  const lanCameras = useStudio(state => state.lanCameras);
  const remoteSources = useStudio(state => state.remoteSources);
  const profile = useStudio(state => state.profile);
  const setTab = useNav(state => state.setTab);
  const [selectedId, setSelectedId] = useState(activeId);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lanUrl, setLanUrl] = useState('rtsp://');
  const [sourceModal, setSourceModal] = useState(false);
  const [sourceKind, setSourceKind] = useState<'web' | 'image' | 'animation'>('web');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('Web overlay');
  const [sourceUrl, setSourceUrl] = useState('https://');
  const [anchor, setAnchor] = useState<StudioWidget['anchor']>('full');
  const [sourceWidth, setSourceWidth] = useState(100);
  const [opacity, setOpacity] = useState(1);
  const [side, setSide] = useState<'A' | 'B'>('A');
  const scene = scenes.find(item => item.id === selectedId) ?? scenes[0];
  const [lanMode, setLanMode] = useState(scene.camera.kind === 'peer');
  const game = pairing?.game ?? 'cricket';
  const presets = SCENE_ANIMATION_PRESETS.filter(item => item.game === game);
  const index = scenes.findIndex(item => item.id === scene.id);
  const sourceCount = scene.widgets.length + (scene.profileOverlays ? profile?.widgets.length ?? 0 : 0) + useSettings(state => state.customWidgets.length);

  useEffect(() => startPeerDiscovery(), []);
  useEffect(() => setLanMode(scene.camera.kind === 'peer'), [scene.id, scene.camera.kind]);

  const update = (partial: Partial<StudioScene>) => patch({ scenes: useSettings.getState().scenes.map(item => item.id === scene.id ? { ...item, ...partial } : item) });
  const chooseCamera = (camera: SceneCamera) => { update({ camera }); setLanMode(camera.kind === 'peer'); setProblem(null); };
  const addScene = (copy = false) => {
    if (scenes.length >= MAX_STUDIO_SCENES) return;
    const next = createScene(copy ? `${scene.name} copy` : `Scene ${scenes.length + 1}`, copy ? scene.camera : undefined);
    const added = copy ? { ...next, profileOverlays: scene.profileOverlays, widgets: scene.widgets.map(widget => ({ ...widget })), animations: [...scene.animations] } : next;
    patch({ scenes: [...scenes, added] });
    setSelectedId(added.id);
  };
  const move = (direction: 1 | -1) => {
    const target = index + direction;
    if (target < 0 || target >= scenes.length) return;
    const reordered = [...scenes];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    patch({ scenes: reordered });
  };
  const remove = () => {
    if (scene.id === activeId) { setProblem('Take another scene to air before deleting this one.'); return; }
    Alert.alert(`Delete ${scene.name}?`, 'This removes its local scene sources.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { patch({ scenes: scenes.filter(item => item.id !== scene.id) }); setSelectedId(activeId); } },
    ]);
  };
  const take = async () => {
    setBusy(true);
    setProblem(null);
    try { await activateScene(scene.id); setTab('studio'); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const editWidget = (widget?: StudioWidget) => {
    setEditingId(widget?.id ?? null);
    setSourceKind(widget?.kind ?? 'web');
    setSourceName(widget?.label ?? 'Web overlay');
    setSourceUrl(widget?.url ?? 'https://');
    setAnchor(widget?.anchor ?? 'full');
    setSourceWidth(widget?.widthPct ?? 100);
    setOpacity(widget?.opacity ?? 1);
    setSourceModal(true);
  };
  const saveWidget = () => {
    const url = sanitizeWidgetUrl(sourceUrl.trim());
    if (!url || sourceKind === 'animation' || (!editingId && sourceCount >= MAX_STUDIO_WIDGETS)) return;
    const widget: StudioWidget = {
      id: editingId ?? `scene_widget_${Date.now().toString(36)}`, label: sourceName.trim() || 'Overlay', kind: sourceKind,
      url, enabled: true, anchor, widthPct: anchor === 'full' ? 100 : sourceWidth, opacity,
      pageWidth: 1920, pageHeight: 1080,
    };
    update({ widgets: editingId ? scene.widgets.map(item => item.id === editingId ? widget : item) : [...scene.widgets, widget] });
    setSourceModal(false);
  };
  const play = async (id: string) => {
    try { await triggerSceneAnimation(id, side); setProblem(null); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
  };

  const cameras = new Map<string, { name: string; remoteId?: string }>();
  for (const camera of lanCameras) cameras.set(camera.url, { name: camera.attrs.n || camera.name });
  for (const camera of remoteSources) if (camera.lanUrl) cameras.set(camera.lanUrl, { name: camera.name, remoteId: camera.id });
  for (const camera of manualCameras) if (!cameras.has(camera.url)) cameras.set(camera.url, { name: camera.name });

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}><H1>Scene Setup</H1><Pill label={`${scenes.length}/${MAX_STUDIO_SCENES}`} /></Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {scenes.map((item, position) => <SceneThumbnail key={item.id} scene={item} selected={item.id === scene.id} onAir={item.id === activeId}
          livePreview={position < 3} onPress={() => setSelectedId(item.id)} style={{ width: 108 }} />)}
      </ScrollView>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <IconButton icon={Plus} label="Create scene" onPress={() => addScene()} disabled={scenes.length >= MAX_STUDIO_SCENES} />
          <IconButton icon={Copy} label="Duplicate scene" onPress={() => addScene(true)} disabled={scenes.length >= MAX_STUDIO_SCENES} />
          <IconButton icon={ArrowUp} label="Move scene earlier" onPress={() => move(-1)} disabled={index === 0} />
          <IconButton icon={ArrowDown} label="Move scene later" onPress={() => move(1)} disabled={index === scenes.length - 1} />
          <IconButton icon={Trash2} label="Delete scene" onPress={remove} disabled={scenes.length < 2} />
        </Row>
      </Row>
      {problem && <Banner tone="danger" text={problem} onDismiss={() => setProblem(null)} />}
      <Field label="Scene name" value={scene.name} maxLength={28} onChangeText={name => update({ name })} autoCapitalize="sentences" />
      <Row style={{ justifyContent: 'space-between' }}><H2>Camera source</H2>{scene.id === activeId && <Pill label="Selected" tone="ok" />}</Row>
      <Segmented value={lanMode ? 'peer' : scene.camera.kind === 'local' ? scene.camera.facing : 'back'} options={[
        { value: 'back', label: 'Rear' }, { value: 'front', label: 'Front' }, { value: 'peer', label: 'LAN camera' },
      ]} onChange={value => { if (value !== 'peer') chooseCamera({ kind: 'local', facing: value }); else { setLanMode(true); if (cameras.size) { const [url, camera] = [...cameras][0]; chooseCamera({ kind: 'peer', url, ...camera }); } } }} />
      {lanMode && <><View style={s.cameraList}>
        {[...cameras].map(([url, camera]) => (
          <Row key={url} style={s.sourceRow}>
            <Radio color={colors.muted} size={17} />
            <Text style={s.sourceName} numberOfLines={1}>{camera.name}</Text>
            <IconButton icon={scene.camera.kind === 'peer' && scene.camera.url === url ? Eye : Camera} label={`Use ${camera.name}`}
              active={scene.camera.kind === 'peer' && scene.camera.url === url} onPress={() => chooseCamera({ kind: 'peer', url, ...camera })} />
          </Row>
        ))}
      </View>
      <Field label="RTSP / RTMP playback address" value={lanUrl} onChangeText={setLanUrl} keyboardType="url" placeholder="rtmp://relay/live/camera-1" />
      <Btn small label="Use camera address" disabled={!isValidCameraSourceUrl(lanUrl)} onPress={() => {
        const url = lanUrl.trim();
        chooseCamera({ kind: 'peer', url, name: 'LAN camera' });
        if (!manualCameras.some(item => item.url === url)) patch({ manualCameras: [...manualCameras, { name: 'LAN camera', url }].slice(-8) });
      }} />
      </>}

      <View style={s.section}>
        <Row style={{ justifyContent: 'space-between' }}><H2>Sources</H2><IconButton icon={Plus} label="Add scene source" onPress={() => editWidget()} /></Row>
        <ToggleRow label="Tournament overlays" value={scene.profileOverlays} onChange={profileOverlays => update({ profileOverlays })} />
        {scene.widgets.map(widget => (
          <View key={widget.id} style={s.sourceRow}>
            {widget.kind === 'web' ? <Globe color={colors.muted} size={17} /> : <ImageIcon color={colors.muted} size={17} />}
            <Text style={s.sourceName} numberOfLines={1}>{widget.label}</Text>
            <IconButton icon={widget.enabled ? Eye : EyeOff} label={`${widget.enabled ? 'Hide' : 'Show'} ${widget.label}`} active={widget.enabled}
              onPress={() => update({ widgets: scene.widgets.map(item => item.id === widget.id ? { ...item, enabled: !item.enabled } : item) })} />
            <IconButton icon={Pencil} label={`Edit ${widget.label}`} onPress={() => editWidget(widget)} />
            <IconButton icon={Trash2} label={`Remove ${widget.label}`} onPress={() => update({ widgets: scene.widgets.filter(item => item.id !== widget.id) })} />
          </View>
        ))}
        {scene.animations.length > 0 && <Segmented value={side} options={[{ value: 'A', label: 'Side A' }, { value: 'B', label: 'Side B' }]} onChange={setSide} />}
        {scene.animations.map(id => {
          const preset = SCENE_ANIMATION_PRESETS.find(item => item.id === id);
          return preset ? <View key={id} style={s.sourceRow}>
            <Sparkles color={colors.accent} size={17} /><Text style={s.sourceName}>{preset.label}</Text>
            <IconButton icon={Play} label={`Play ${preset.label}`} disabled={!pairing || preset.game !== game} onPress={() => void play(id)} />
            <IconButton icon={Trash2} label={`Remove ${preset.label}`} onPress={() => update({ animations: scene.animations.filter(item => item !== id) })} />
          </View> : null;
        })}
      </View>
      <Btn label={scene.id === activeId ? 'Apply scene' : 'Take to air'} variant="primary" onPress={() => void take()} busy={busy} />

      <Modal visible={sourceModal} transparent animationType="slide" onRequestClose={() => setSourceModal(false)} supportedOrientations={['portrait', 'landscape']}>
        <View style={s.modalBackdrop}><ScrollView style={s.modal} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
          <Row style={{ justifyContent: 'space-between' }}><H2>{editingId ? 'Edit source' : 'Add source'}</H2><IconButton icon={X} label="Close source editor" onPress={() => setSourceModal(false)} /></Row>
          {!editingId && <Segmented value={sourceKind} options={[{ value: 'web', label: 'Website' }, { value: 'image', label: 'Image' }, { value: 'animation', label: 'Animation' }]} onChange={setSourceKind} />}
          {sourceKind === 'animation' ? presets.map(preset => <Row key={preset.id} style={s.sourceRow}>
            <Sparkles size={17} color={colors.accent} /><Text style={s.sourceName}>{preset.label}</Text>
            <IconButton icon={scene.animations.includes(preset.id) ? Eye : Plus} label={`${scene.animations.includes(preset.id) ? 'Remove' : 'Add'} ${preset.label}`}
              active={scene.animations.includes(preset.id)} onPress={() => update({ animations: scene.animations.includes(preset.id) ? scene.animations.filter(id => id !== preset.id) : [...scene.animations, preset.id] })} />
          </Row>) : <>
            <Field label="Source name" value={sourceName} onChangeText={setSourceName} maxLength={40} />
            <Field label="Website or image URL" value={sourceUrl} onChangeText={setSourceUrl} keyboardType="url" error={sourceUrl.length > 8 && !sanitizeWidgetUrl(sourceUrl) ? 'Enter an HTTPS or HTTP address.' : null} />
            <View style={s.positions}>{POSITIONS.map(position => <Btn key={position.value} small label={position.label} variant={anchor === position.value ? 'primary' : 'secondary'} onPress={() => setAnchor(position.value)} />)}</View>
            {anchor !== 'full' && <><Text style={s.label}>Width {Math.round(sourceWidth)}%</Text><Slider value={sourceWidth} min={5} max={100} step={1} onChange={setSourceWidth} label="Source width" /></>}
            <Text style={s.label}>Opacity {Math.round(opacity * 100)}%</Text><Slider value={opacity} min={0} max={1} step={0.05} onChange={setOpacity} label="Source opacity" />
            <Btn label="Save source" variant="primary" disabled={!sanitizeWidgetUrl(sourceUrl) || !sourceName.trim() || (!editingId && sourceCount >= MAX_STUDIO_WIDGETS)} onPress={saveWidget} />
          </>}
        </ScrollView></View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  sourceName: { flex: 1, minWidth: 0, fontSize: 12, color: colors.text },
  cameraList: { gap: 3 },
  label: { fontSize: 12, color: colors.muted },
  modalBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  modal: { flexGrow: 0, maxHeight: '90%', backgroundColor: colors.card, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  modalContent: { padding: 16, gap: 12, paddingBottom: 28 },
  positions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});