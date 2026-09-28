import { describe, expect, it } from 'vitest';
import { resolvePlayerImageUrl } from '../utils/playerImage';

describe('resolvePlayerImageUrl', () => {
  it('prefers the saved player image over the lineup copy', () => {
    expect(resolvePlayerImageUrl('player-1', 'old-lineup.jpg', { 'player-1': 'processed.png' }))
      .toBe('processed.png');
  });

  it('falls back to the lineup image when no saved player image exists', () => {
    expect(resolvePlayerImageUrl('player-1', 'lineup.jpg', {})).toBe('lineup.jpg');
  });
});