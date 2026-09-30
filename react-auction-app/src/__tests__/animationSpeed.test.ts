import { describe, expect, it } from 'vitest';
import { getGifFrameDelayMs, normalizeAnimationPlaybackSpeed } from '../components/AnimatedGif/animationSpeed';

describe('animation playback speed', () => {
  it('clamps configured speeds to the supported range', () => {
    expect(normalizeAnimationPlaybackSpeed(0.1)).toBe(0.5);
    expect(normalizeAnimationPlaybackSpeed(8)).toBe(4);
    expect(normalizeAnimationPlaybackSpeed(undefined)).toBe(1);
  });

  it('shortens GIF frame delays by the requested speed multiplier', () => {
    expect(getGifFrameDelayMs(200, 2)).toBe(100);
    expect(getGifFrameDelayMs(200, 4)).toBe(50);
    expect(getGifFrameDelayMs(0, 1)).toBe(100);
  });
});