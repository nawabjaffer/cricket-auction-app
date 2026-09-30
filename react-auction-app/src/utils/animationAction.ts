import type { AnimationConfig } from '../types/scoring';

export function getAnimationActionDelayMs(config: AnimationConfig): number | null {
  const mode = config.actionMode || 'animation';
  if (mode === 'animation') return null;
  if (mode === 'obs_only' || !config.enabled) return 0;
  return Math.max(0, Number(config.durationMs) || 0);
}

export function shouldShowAnimation(config?: AnimationConfig): boolean {
  return config?.actionMode !== 'obs_only' && config?.enabled !== false;
}