import { describe, expect, it } from 'vitest';
import {
  fingerprintImageUrls,
  PREMATCH_IMAGE_WARM_TTL_MS,
  shouldWarmPreMatchImages,
} from '../utils/preMatchImageWarmup';

describe('pre-match image warmup cache policy', () => {
  it('fingerprints a stable, deduplicated set of URLs', () => {
    expect(fingerprintImageUrls(['/a.png', '/b.png', '/a.png']))
      .toBe(fingerprintImageUrls(['/b.png', '/a.png']));
  });

  it('warms missing or changed image sets immediately', () => {
    expect(shouldWarmPreMatchImages(null, 'next-match')).toBe(true);
    expect(shouldWarmPreMatchImages({ fingerprint: 'old-match', warmedAt: 100 }, 'next-match', 101)).toBe(true);
  });

  it('reuses a fresh matching cache record and refreshes it after the TTL', () => {
    const warmedAt = 10_000;
    const record = { fingerprint: 'same-images', warmedAt };
    expect(shouldWarmPreMatchImages(record, 'same-images', warmedAt + 100)).toBe(false);
    expect(shouldWarmPreMatchImages(record, 'same-images', warmedAt + PREMATCH_IMAGE_WARM_TTL_MS)).toBe(true);
  });

  it('refreshes records with invalid or future timestamps', () => {
    expect(shouldWarmPreMatchImages({ fingerprint: 'same', warmedAt: Number.NaN }, 'same', 500)).toBe(true);
    expect(shouldWarmPreMatchImages({ fingerprint: 'same', warmedAt: 600 }, 'same', 500)).toBe(true);
  });
});
