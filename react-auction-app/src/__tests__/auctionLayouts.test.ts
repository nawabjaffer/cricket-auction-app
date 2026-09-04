import { describe, it, expect } from 'vitest';
import { withAlpha, darken, type AuctionLayoutStyle } from '../components/AuctionLayouts/types';

describe('withAlpha', () => {
  it('converts hex colors to rgba with the given alpha', () => {
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(withAlpha('#3b82f6', 0.4)).toBe('rgba(59, 130, 246, 0.4)');
  });

  it('accepts hex values without the leading hash', () => {
    expect(withAlpha('d4ff00', 0.28)).toBe('rgba(212, 255, 0, 0.28)');
  });

  it('returns the input unchanged for unparsable colors', () => {
    expect(withAlpha('', 0.5)).toBe('');
    expect(withAlpha('red', 0.5)).toBe('red');
    expect(withAlpha('#fff', 0.5)).toBe('#fff');
    expect(withAlpha('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
  });
});

describe('darken', () => {
  it('darkens a color by the given ratio', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#ffffff', 1)).toBe('#000000');
    expect(darken('#ffffff', 0)).toBe('#ffffff');
  });

  it('keeps output as a valid 6-digit hex', () => {
    const result = darken('#3b82f6', 0.85);
    expect(result).toMatch(/^#[\da-f]{6}$/);
  });

  it('never produces negative channel values', () => {
    expect(darken('#010101', 0.99)).toBe('#000000');
  });

  it('returns the input unchanged for unparsable colors', () => {
    expect(darken('not-a-color', 0.5)).toBe('not-a-color');
    expect(darken('', 0.5)).toBe('');
  });
});

describe('AuctionLayoutStyle', () => {
  it('supports the three selectable presentation styles', () => {
    const styles: AuctionLayoutStyle[] = ['classic', 'spotlight', 'vibrant'];
    expect(styles).toHaveLength(3);
    expect(styles).toContain('classic');
    expect(styles).toContain('spotlight');
    expect(styles).toContain('vibrant');
  });

  it('falls back to classic when no layout is configured', () => {
    const resolve = (v?: AuctionLayoutStyle) => v ?? 'classic';
    expect(resolve(undefined)).toBe('classic');
    expect(resolve('spotlight')).toBe('spotlight');
    expect(resolve('vibrant')).toBe('vibrant');
  });
});

describe('spotlight stat column split', () => {
  // The spotlight layout flanks the player with stats; left column takes the ceiling.
  const split = (rows: unknown[]) => {
    const half = Math.ceil(rows.length / 2);
    return { left: rows.slice(0, half), right: rows.slice(half) };
  };

  it('splits an even number of stats evenly', () => {
    const { left, right } = split([1, 2, 3, 4, 5, 6]);
    expect(left).toHaveLength(3);
    expect(right).toHaveLength(3);
  });

  it('gives the extra stat to the left column when odd', () => {
    const { left, right } = split([1, 2, 3, 4, 5]);
    expect(left).toHaveLength(3);
    expect(right).toHaveLength(2);
  });

  it('handles empty and single stat sets', () => {
    expect(split([]).left).toHaveLength(0);
    expect(split([]).right).toHaveLength(0);
    expect(split([1]).left).toHaveLength(1);
    expect(split([1]).right).toHaveLength(0);
  });
});
