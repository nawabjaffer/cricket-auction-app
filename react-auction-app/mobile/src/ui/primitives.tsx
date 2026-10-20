// Small design-system layer: every screen is built from these so the app stays visually consistent.
import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, ToastAndroid, View,
  type LayoutChangeEvent, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { colors, radius, space } from './theme';
import type { LucideIcon } from 'lucide-react-native';

export function IconButton({ icon: Icon, label, onPress, active, disabled, style }: Readonly<{
  icon: LucideIcon; label: string; onPress: () => void; active?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}>) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, disabled: !!disabled }}
      onPress={onPress} disabled={disabled} hitSlop={4} onLongPress={() => ToastAndroid.show(label, ToastAndroid.SHORT)}
      style={[s.iconBtn, active && { borderColor: colors.accent, backgroundColor: 'rgba(61,220,132,0.18)' }, disabled && { opacity: 0.35 }, style]}>
      <Icon size={18} strokeWidth={1.8} color={active ? colors.accent : colors.text} />
    </Pressable>
  );
}

export function Card({ children, style }: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H1({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={s.h1} accessibilityRole="header">{children}</Text>;
}

export function H2({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={s.h2} accessibilityRole="header">{children}</Text>;
}

export function Muted({ children, style }: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  return <Text style={[s.muted, style as never]}>{children}</Text>;
}

export function Body({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={s.body}>{children}</Text>;
}

export function Row({ children, style, gap = space.sm }: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }>) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Screen({ children, scroll = true }: Readonly<{ children: ReactNode; scroll?: boolean }>) {
  if (!scroll) return <View style={s.screen}>{children}</View>;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface BtnProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Btn({ label, onPress, variant = 'secondary', disabled, busy, small, style, testID }: Readonly<BtnProps>) {
  const palette = {
    primary: { bg: colors.accent, fg: colors.accentInk, border: 'transparent' },
    secondary: { bg: 'rgba(255,255,255,0.07)', fg: colors.text, border: colors.line },
    danger: { bg: colors.live, fg: '#fff', border: 'transparent' },
    ghost: { bg: 'transparent', fg: colors.muted, border: colors.line },
  }[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={inactive ? undefined : onPress}
      hitSlop={small ? 5 : 2}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[s.btnLabel, small && s.btnLabelSmall, { color: palette.fg }]}>{busy ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone = 'neutral' }: Readonly<{ label: string; tone?: 'neutral' | 'live' | 'ok' | 'warn' | 'danger' }>) {
  const bg = { neutral: 'rgba(148,163,184,0.2)', live: colors.live, ok: 'rgba(61,220,132,0.2)', warn: 'rgba(245,158,11,0.25)', danger: 'rgba(239,68,68,0.3)' }[tone];
  const fg = { neutral: colors.text, live: '#fff', ok: colors.accent, warn: '#fcd34d', danger: '#fecaca' }[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'warn', onDismiss }: Readonly<{ text: string; tone?: 'warn' | 'danger' | 'info'; onDismiss?: () => void }>) {
  const border = { warn: colors.warn, danger: colors.danger, info: colors.blue }[tone];
  return (
    <Pressable onPress={onDismiss} style={[s.banner, { borderColor: border }]} accessibilityRole="alert">
      <Text style={s.bannerText}>{text}</Text>
    </Pressable>
  );
}

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
}

export function Field({ label, hint, error, ...input }: Readonly<FieldProps>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        {...input}
        style={[s.input, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: Readonly<{
  label: string; hint?: string; value: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}>) {
  return (
    <Row style={{ justifyContent: 'space-between', opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.body}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: '#334155', true: colors.accent }}
        thumbColor="#fff"
        accessibilityLabel={label}
      />
    </Row>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: Readonly<{
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}>) {
  return (
    <View style={s.segmented}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!option.disabled }}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={[s.segment, active && { backgroundColor: colors.accent }, option.disabled && { opacity: 0.35 }]}
          >
            <Text style={[s.segmentText, active && { color: colors.accentInk }]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onComplete?: (value: number) => void;
  label?: string;
}

export function sliderValueFromOffset(offset: number, width: number, min: number, max: number, step = 0): number {
  if (!(width > 0) || !(max > min)) return min;
  const ratio = Math.min(1, Math.max(0, offset / width));
  const raw = min + ratio * (max - min);
  const stepped = step > 0 ? min + Math.round((raw - min) / step) * step : raw;
  return Math.min(max, Math.max(min, stepped));
}

/** Minimal horizontal slider (React Native ships none). */
export function Slider({ value, min, max, step = 0, onChange, onComplete, label }: Readonly<SliderProps>) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const latest = useRef(value);
  const bounds = useRef({ min, max, step });
  const originX = useRef(0);
  bounds.current = { min, max, step };

  const toValue = useCallback((x: number) => {
    const current = bounds.current;
    return sliderValueFromOffset(x, widthRef.current, current.min, current.max, current.step);
  }, []);

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event, gesture) => {
      originX.current = gesture.moveX - event.nativeEvent.locationX;
      latest.current = toValue(gesture.moveX - originX.current);
      onChange(latest.current);
    },
    onPanResponderMove: (_event, gesture) => { latest.current = toValue(gesture.moveX - originX.current); onChange(latest.current); },
    onPanResponderRelease: () => onComplete?.(latest.current),
    onPanResponderTerminate: () => onComplete?.(latest.current),
  })).current;

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = Math.max(1, event.nativeEvent.layout.width);
    setWidth(widthRef.current);
  };
  const ratio = max > min ? (value - min) / (max - min) : 0;
  return (
    <View
      style={s.sliderHit}
      onLayout={onLayout}
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: Math.round(value * 100) / 100 }}
    >
      <View style={s.sliderTrack} pointerEvents="none">
        <View style={[s.sliderFill, { width: Math.max(0, Math.min(1, ratio)) * width }]} />
      </View>
      <View style={[s.sliderThumb, { left: Math.max(0, Math.min(1, ratio)) * width - 11 }]} pointerEvents="none" />
    </View>
  );
}

export function SectionTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <Text style={s.section}>{children}</Text>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: space.lg, gap: space.md, paddingBottom: 96 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.md },
  h1: { color: colors.text, fontSize: 18, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 14, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  body: { color: colors.text, fontSize: 13, lineHeight: 18 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
  section: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase', marginTop: space.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: 'rgba(13,17,22,0.86)', alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: 42, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 34, paddingHorizontal: space.md, borderRadius: radius.sm },
  btnLabel: { fontSize: 13, fontWeight: '700' },
  btnLabelSmall: { fontSize: 12 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md, backgroundColor: 'rgba(15,23,42,0.9)' },
  bannerText: { color: colors.text, fontSize: 12, lineHeight: 17 },
  input: { minHeight: 42, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space.md, color: colors.text, backgroundColor: 'rgba(2,6,23,0.55)', fontSize: 13 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  segment: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmentText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  sliderHit: { height: 40, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(148,163,184,0.3)', overflow: 'hidden' },
  sliderFill: { height: 6, backgroundColor: colors.accent },
  sliderThumb: { position: 'absolute', top: 9, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', borderWidth: 3, borderColor: colors.accent },
});
