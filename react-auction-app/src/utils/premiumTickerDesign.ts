import type { CSSProperties } from 'react';
import {
  DEFAULT_PREMIUM_TICKER_PART,
  PREMIUM_TICKER_LIMITS,
  PREMIUM_TICKER_PART_KEYS,
  createDefaultPremiumTickerDesign,
  type PremiumTickerDesign,
  type PremiumTickerPartKey,
  type PremiumTickerPartTransform,
} from '../types/premiumTicker';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function normalizePremiumTickerPart(raw: unknown): PremiumTickerPartTransform {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<PremiumTickerPartTransform>;
  const { offset, rotation, minScale, maxScale } = PREMIUM_TICKER_LIMITS;
  return {
    x: clamp(Math.round(finite(value.x, 0)), -offset, offset),
    y: clamp(Math.round(finite(value.y, 0)), -offset, offset),
    rotation: clamp(Math.round(finite(value.rotation, 0) * 10) / 10, -rotation, rotation),
    scale: clamp(Math.round(finite(value.scale, 1) * 100) / 100, minScale, maxScale),
    visible: value.visible !== false,
  };
}

export function normalizePremiumTickerDesign(raw: unknown): PremiumTickerDesign {
  const design = createDefaultPremiumTickerDesign();
  const source = raw && typeof raw === 'object' ? (raw as { parts?: Record<string, unknown> }).parts : undefined;
  if (!source || typeof source !== 'object') return design;
  PREMIUM_TICKER_PART_KEYS.forEach(key => { design.parts[key] = normalizePremiumTickerPart(source[key]); });
  return design;
}

export function isDefaultPremiumTickerPart(part: PremiumTickerPartTransform): boolean {
  const base = DEFAULT_PREMIUM_TICKER_PART;
  return part.x === base.x && part.y === base.y && part.rotation === base.rotation && part.scale === base.scale && part.visible === base.visible;
}

export function isPremiumTickerCustomized(design?: PremiumTickerDesign | null): boolean {
  return !!design && PREMIUM_TICKER_PART_KEYS.some(key => !isDefaultPremiumTickerPart(design.parts[key]));
}

export function premiumTickerTransform(part: PremiumTickerPartTransform): string {
  return `translate(${part.x}px, ${part.y}px) rotate(${part.rotation}deg) scale(${part.scale})`;
}

// Returns undefined for an untouched part so existing markup keeps its original styling.
export function getPremiumPartStyle(
  design: PremiumTickerDesign | undefined,
  key: Exclude<PremiumTickerPartKey, 'ticker'>,
  editing = false,
): CSSProperties | undefined {
  const part = design?.parts[key];
  if (!part || isDefaultPremiumTickerPart(part)) return undefined;
  const style: CSSProperties = { transform: premiumTickerTransform(part) };
  if (!part.visible) {
    if (editing) style.opacity = 0.25;
    else style.visibility = 'hidden';
  }
  return style;
}
