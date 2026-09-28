import { describe, expect, it } from 'vitest';
import { isPowerplayOver } from '../utils/powerplay';

describe('isPowerplayOver', () => {
  it('matches selected individual overs and ranges', () => {
    expect(isPowerplayOver(0, true, '1-3, 7, 10-12', 6)).toBe(true);
    expect(isPowerplayOver(2.5, true, '1-3, 7, 10-12', 6)).toBe(true);
    expect(isPowerplayOver(3, true, '1-3, 7, 10-12', 6)).toBe(false);
    expect(isPowerplayOver(6, true, '1-3, 7, 10-12', 6)).toBe(true);
  });

  it('supports disabled rules and legacy first-N behavior', () => {
    expect(isPowerplayOver(0, false, '1-6', 6)).toBe(false);
    expect(isPowerplayOver(5.5, undefined, undefined, 6)).toBe(true);
    expect(isPowerplayOver(6, undefined, undefined, 6)).toBe(false);
  });
});