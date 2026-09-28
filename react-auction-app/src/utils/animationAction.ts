import type { AnimationConfig } from '../types/scoring';

export function getAnimationActionDelayMs(config: AnimationConfig): number | null {
  const mode = config.actionMode || 'animation';
  if (mode === 'animation') return null;
  const configuredDelay = Math.max(0, Number(config.obsActionDelayMs) || 0);
  const animationDuration = mode === 'animation_and_obs' && config.enabled
    ? Math.max(0, Number(config.durationMs) || 0)
    : 0;
  return animationDuration + configuredDelay;
}

export function shouldShowAnimation(config?: AnimationConfig): boolean {
  return config?.actionMode !== 'obs_only' && config?.enabled !== false;
}