import { describe, expect, it } from 'vitest';
import { getAnimationActionDelayMs, shouldShowAnimation } from '../utils/animationAction';
import type { AnimationConfig } from '../types/scoring';

const animation: AnimationConfig = { type: 'css', enabled: true, durationMs: 3000 };

describe('animation OBS action settings', () => {
  it('does not schedule an OBS action in animation-only mode', () => {
    expect(getAnimationActionDelayMs(animation)).toBeNull();
    expect(shouldShowAnimation(animation)).toBe(true);
  });

  it('waits for the animation plus configured delay in combined mode', () => {
    expect(getAnimationActionDelayMs({ ...animation, actionMode: 'animation_and_obs', obsActionDelayMs: 500 })).toBe(3500);
    expect(shouldShowAnimation({ ...animation, actionMode: 'animation_and_obs' })).toBe(true);
  });

  it('supports delayed OBS-only actions without showing an animation', () => {
    const config = { ...animation, actionMode: 'obs_only' as const, obsActionDelayMs: 250 };
    expect(getAnimationActionDelayMs(config)).toBe(250);
    expect(shouldShowAnimation(config)).toBe(false);
  });

  it('does not wait for a disabled animation in combined mode', () => {
    const config = { ...animation, enabled: false, actionMode: 'animation_and_obs' as const, obsActionDelayMs: 250 };
    expect(getAnimationActionDelayMs(config)).toBe(250);
    expect(shouldShowAnimation(config)).toBe(false);
  });
});