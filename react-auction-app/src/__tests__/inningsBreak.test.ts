import { describe, expect, it } from 'vitest';
import { isInningsBreak } from '../utils/inningsBreak';

describe('isInningsBreak', () => {
  it('is active only after the first innings completes and before the second begins', () => {
    expect(isInningsBreak({ firstInningsComplete: true, currentInnings: 1, secondInningsStarted: false })).toBe(true);
    expect(isInningsBreak({ firstInningsComplete: false, currentInnings: 1, secondInningsStarted: false })).toBe(false);
    expect(isInningsBreak({ firstInningsComplete: true, currentInnings: 2, secondInningsStarted: true })).toBe(false);
    expect(isInningsBreak({ firstInningsComplete: true, currentInnings: 1, secondInningsStarted: true })).toBe(false);
  });
});