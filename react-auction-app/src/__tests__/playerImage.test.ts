import { describe, expect, it } from 'vitest';
import { preferMigratedPlayerImageUrl, resolvePlayerImageUrl } from '../utils/playerImage';

describe('resolvePlayerImageUrl', () => {
  it('prefers the saved player image over the lineup copy', () => {
    expect(resolvePlayerImageUrl('player-1', 'old-lineup.jpg', { 'player-1': 'processed.png' }))
      .toBe('processed.png');
  });

  it('falls back to the lineup image when no saved player image exists', () => {
    expect(resolvePlayerImageUrl('player-1', 'lineup.jpg', {})).toBe('lineup.jpg');
  });

  it('prefers a migrated Firebase Storage image over a stale Drive lineup image', () => {
    const storageUrl = 'https://firebasestorage.googleapis.com/v0/b/league/o/player.jpg?alt=media';
    const driveUrl = 'https://drive.google.com/uc?export=view&id=old-player';
    expect(resolvePlayerImageUrl('player-1', driveUrl, { 'player-1': storageUrl })).toBe(storageUrl);
    expect(preferMigratedPlayerImageUrl(driveUrl, storageUrl)).toBe(storageUrl);
  });
});