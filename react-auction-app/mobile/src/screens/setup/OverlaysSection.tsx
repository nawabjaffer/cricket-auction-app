import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { StudioEngine } from '../../native';
import {
  MAX_STUDIO_WIDGETS, STUDIO_WIDGET_ANCHORS, resolveWidgetUrl, sanitizeWidgetUrl,
  type StudioWidget,
} from '../../shared/studioProfile';
import { allWidgets, applyOverlays, studioContext } from '../../services/streamController';
import { useSettings } from '../../store/settingsStore';
import { useStudio } from '../../store/studioStore';
import { Btn, Card, Field, H2, Muted, Pill, Row, Segmented, Slider, ToggleRow } from '../../ui/primitives';
import { colors, space } from '../../ui/theme';

const ANCHOR_LABEL: Record<string, string> = {
  full: 'Full', 'top-left': 'Top ◤', 'top-center': 'Top', 'top-right': 'Top ◥', center: 'Center',
  'bottom-left': 'Bottom ◣', 'bottom-center': 'Bottom', 'bottom-right': 'Bottom ◢',
};

export function OverlaysSection() {
  const overlaysEnabled = useSettings(state => state.overlaysEnabled);
  const hidden = useSettings(state => state.overlayHidden);
  const customWidgets = useSettings(state => state.customWidgets);
  const overlayRender = useSettings(state => state.overlayRender);
  const overlayFps = useSettings(state => state.overlayFps);
  const patch = useSettings(state => state.patch);
  // Subscribe so the list below refreshes when the tournament's widget set changes.
  useStudio(state => state.profile);
  const pairing = useSettings(state => state.pairing);
  const origin = useSettings(state => state.origin);

  const [url, setUrl] = useState('https://');
  const [label, setLabel] = useState('Custom overlay');
  const [anchor, setAnchor] = useState<StudioWidget['anchor']>('top-right');
  const [width, setWidth] = useState(18);
  const [kind, setKind] = useState<StudioWidget['kind']>('image');
  const urlProblem = url.length > 8 && sanitizeWidgetUrl(url) === null ? 'Use an http(s) URL.' : null;

  const widgets = allWidgets();
  const context = studioContext();

  const apply = (partial: Parameters<typeof patch>[0]) => { patch(partial); void applyOverlays(); };

  const addCustom = () => {
    if (!sanitizeWidgetUrl(url)) return;
    const widget: StudioWidget = {
      id: `local_${Date.now().toString(36)}`,
      label: label.trim() || 'Custom overlay',
      kind, url: url.trim(), enabled: true, anchor, widthPct: anchor === 'full' ? 100 : width, opacity: 1,
      pageWidth: kind === 'image' ? 600 : 1920, pageHeight: kind === 'image' ? 338 : 1080,
    };
    apply({ customWidgets: [...customWidgets, widget] });
    setUrl('https://');
  };

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <ToggleRow label="Show overlays on the stream" hint="Overlays are composited by the encoder, so the stream and the preview match exactly." value={overlaysEnabled} onChange={enabled => apply({ overlaysEnabled: enabled })} />
        <Row>
          <Btn small label="Reload overlays" onPress={() => { void StudioEngine.reloadOverlays(); }} />
          {!pairing && <Muted>Pair with a tournament to get its scoreboard overlay.</Muted>}
        </Row>
      </Card>

      {widgets.length === 0 && <Card><Muted>No overlay widgets. The tournament admin can add them (Mobile Studio page), or add your own below.</Muted></Card>}
      {widgets.map(widget => {
        const local = widget.id.startsWith('local_');
        const resolved = context ? resolveWidgetUrl(widget.url, context) : null;
        return (
          <Card key={widget.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <H2>{widget.label}</H2>
                <Row style={{ marginTop: 4 }}>
                  <Pill label={widget.kind === 'image' ? 'Image' : 'Web page'} />
                  <Pill label={ANCHOR_LABEL[widget.anchor] ?? widget.anchor} />
                  <Pill label={local ? 'This phone' : 'Tournament'} tone={local ? 'warn' : 'ok'} />
                </Row>
              </View>
            </Row>
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>{resolved ?? 'Pair with a tournament to resolve this URL.'}</Text>
            <ToggleRow
              label="Visible on this phone"
              value={widget.enabled && !hidden[widget.id]}
              disabled={!widget.enabled}
              onChange={visible => apply({ overlayHidden: { ...hidden, [widget.id]: !visible } })}
            />
            {!widget.enabled && <Muted>Switched off by the tournament admin.</Muted>}
            {local && <Btn small variant="ghost" label="Remove" onPress={() => apply({ customWidgets: customWidgets.filter(item => item.id !== widget.id) })} />}
          </Card>
        );
      })}

      <Card>
        <H2>Add an overlay on this phone</H2>
        <Segmented options={[{ value: 'image', label: 'Logo / image' }, { value: 'web', label: 'Web page' }]} value={kind} onChange={setKind} />
        <Field label="Name" value={label} onChangeText={setLabel} maxLength={40} autoCapitalize="sentences" />
        <Field label="URL" value={url} onChangeText={setUrl} keyboardType="url" error={urlProblem} hint={`Tokens: {origin} = ${origin}, {slug}, {game}, {matchId}`} />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>Position</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {STUDIO_WIDGET_ANCHORS.map(item => (
            <Btn key={item} small label={ANCHOR_LABEL[item]} variant={anchor === item ? 'primary' : 'secondary'} onPress={() => setAnchor(item)} />
          ))}
        </Row>
        {anchor !== 'full' && (
          <>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>Width {width}%</Text>
            <Slider value={width} min={5} max={60} step={1} onChange={setWidth} label="Overlay width" />
          </>
        )}
        <Btn label="Add overlay" variant="primary" onPress={addCustom} disabled={!sanitizeWidgetUrl(url) || widgets.length >= MAX_STUDIO_WIDGETS} />
      </Card>

      <Card>
        <H2>Rendering</H2>
        <Muted>Compatibility draws web overlays on the CPU and works on every phone. GPU is lighter on the CPU but not supported by every device — switch back if the overlay looks blank.</Muted>
        <Segmented options={[{ value: 'software', label: 'Compatibility' }, { value: 'hardware', label: 'GPU' }]} value={overlayRender} onChange={value => apply({ overlayRender: value })} />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700' }}>Overlay refresh</Text>
        <Segmented options={[10, 15, 24, 30].map(value => ({ value, label: `${value} fps` }))} value={overlayFps} onChange={value => apply({ overlayFps: value })} />
      </Card>
    </View>
  );
}
