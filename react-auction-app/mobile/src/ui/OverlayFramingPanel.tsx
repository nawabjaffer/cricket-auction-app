import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { X } from 'lucide-react-native';
import type { FrameOrientation, OverlayFramingSettings } from '../shared/overlayFraming';
import { IconButton, Row, Segmented, Slider } from './primitives';
import { colors } from './theme';

interface Props {
  value: OverlayFramingSettings;
  orientation: FrameOrientation;
  frameWidth: number;
  frameHeight: number;
  onChange: (value: Partial<OverlayFramingSettings>) => void;
  onClose: () => void;
}

export function OverlayFramingPanel({ value, orientation, frameWidth, frameHeight, onChange, onClose }: Readonly<Props>) {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <View accessibilityLabel="Overlay framing controls" style={[styles.panel, { width: Math.min(360, width - 28) }]}>
        <Row style={styles.header}>
          <Text style={styles.title}>Overlay framing</Text>
          <IconButton icon={X} label="Close overlay framing" onPress={onClose} style={styles.close} />
        </Row>
        <Text style={styles.resolution}>{frameWidth} x {frameHeight} · {orientation}</Text>
        <Row style={styles.valueRow}><Text style={styles.label}>Size</Text><Text style={styles.value}>{value.scalePct}%</Text></Row>
        <Slider label="Overlay size" min={20} max={100} step={1} value={value.scalePct} onChange={scalePct => onChange({ scalePct })} onComplete={scalePct => onChange({ scalePct })} />
        <Text style={styles.label}>Rotation</Text>
        <Segmented value={value.rotation} options={[
          { value: 'auto', label: 'Auto' }, { value: 0, label: '0°' }, { value: 90, label: '90°' },
          { value: 180, label: '180°' }, { value: 270, label: '270°' },
        ]} onChange={rotation => onChange({ rotation })} />
        <View style={styles.positionRow}>
          <View style={styles.positionControl}>
            <Row style={styles.valueRow}><Text style={styles.label}>Horizontal</Text><Text style={styles.value}>{value.offsetXPct}%</Text></Row>
            <Slider label="Overlay horizontal position" min={-30} max={30} step={1} value={value.offsetXPct} onChange={offsetXPct => onChange({ offsetXPct })} onComplete={offsetXPct => onChange({ offsetXPct })} />
          </View>
          <View style={styles.positionControl}>
            <Row style={styles.valueRow}><Text style={styles.label}>Vertical</Text><Text style={styles.value}>{value.offsetYPct}%</Text></Row>
            <Slider label="Overlay vertical position" min={-30} max={30} step={1} value={value.offsetYPct} onChange={offsetYPct => onChange({ offsetYPct })} onComplete={offsetYPct => onChange({ offsetYPct })} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, zIndex: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  panel: { zIndex: 1, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(10,14,18,0.96)', paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  header: { justifyContent: 'space-between', minHeight: 30 },
  title: { color: colors.text, fontSize: 13, fontWeight: '700' },
  close: { width: 30, height: 30 },
  resolution: { color: colors.muted, fontSize: 9 },
  label: { color: colors.text, fontSize: 10, fontWeight: '600' },
  value: { color: colors.text, fontSize: 10, fontVariant: ['tabular-nums'] },
  valueRow: { justifyContent: 'space-between', minHeight: 16 },
  positionRow: { flexDirection: 'row', gap: 12 },
  positionControl: { flex: 1, minWidth: 0 },
});