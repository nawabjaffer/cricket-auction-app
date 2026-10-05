import { describe, expect, it } from 'vitest';
import { isScoringAdminTabVisible } from '../utils/scoringAdminTabs';

describe('scoring admin tabs', () => {
  it('keeps animation, pre-match, and OBS settings available in Match Type configuration', () => {
    expect(isScoringAdminTabVisible('animations', true)).toBe(true);
    expect(isScoringAdminTabVisible('prematch', true)).toBe(true);
    expect(isScoringAdminTabVisible('obs', true)).toBe(true);
    expect(isScoringAdminTabVisible('ticker', true)).toBe(false);
    expect(isScoringAdminTabVisible('ads', true)).toBe(false);
  });
});
