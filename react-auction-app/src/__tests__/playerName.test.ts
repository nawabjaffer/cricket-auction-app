import { describe, expect, it } from 'vitest';
import { normalizePlayerName } from '../utils/playerName';

describe('normalizePlayerName', () => {
  it('normalizes mixed-case names and repeated whitespace', () => {
    expect(normalizePlayerName('  sACHIN   tendULKAR ')).toBe('Sachin Tendulkar');
    expect(normalizePlayerName('VIRAT kohLI')).toBe('Virat Kohli');
  });

  it('capitalizes parts of hyphenated and apostrophe-separated names', () => {
    expect(normalizePlayerName("jean-luc o'NEIL")).toBe("Jean-Luc O'Neil");
  });
});