import { describe, expect, it } from 'vitest';
import {
  getPremiumPartStyle,
  isPremiumTickerCustomized,
  normalizePremiumTickerDesign,
  normalizePremiumTickerPart,
} from '../utils/premiumTickerDesign';

describe('premium ticker design', () => {
  it('fills defaults for missing or invalid data', () => {
    const design = normalizePremiumTickerDesign({ parts: { score: { x: 'bad', scale: null } } });
    expect(design.parts.score).toEqual({ x: 0, y: 0, rotation: 0, scale: 1, visible: true });
    expect(design.parts.ticker.scale).toBe(1);
    expect(isPremiumTickerCustomized(design)).toBe(false);
  });

  it('clamps offsets, rotation and allows scale up to 5x', () => {
    const part = normalizePremiumTickerPart({ x: 99999, y: -99999, rotation: 400, scale: 9 });
    expect(part).toMatchObject({ x: 1920, y: -1920, rotation: 180, scale: 5 });
    expect(normalizePremiumTickerPart({ scale: 0.01 }).scale).toBe(0.2);
  });

  it('returns no style for untouched parts and a transform for edited ones', () => {
    const design = normalizePremiumTickerDesign({ parts: { matchup: { x: 12, y: -4, rotation: 3, scale: 2 }, overs: { visible: false } } });
    expect(getPremiumPartStyle(design, 'score')).toBeUndefined();
    expect(getPremiumPartStyle(design, 'matchup')?.transform).toBe('translate(12px, -4px) rotate(3deg) scale(2)');
    expect(getPremiumPartStyle(design, 'overs')?.visibility).toBe('hidden');
    expect(getPremiumPartStyle(design, 'overs', true)?.opacity).toBe(0.25);
    expect(isPremiumTickerCustomized(design)).toBe(true);
  });
});
