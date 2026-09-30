export const MIN_ANIMATION_PLAYBACK_SPEED = 0.5;
export const MAX_ANIMATION_PLAYBACK_SPEED = 4;

export function normalizeAnimationPlaybackSpeed(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  return Math.max(MIN_ANIMATION_PLAYBACK_SPEED, Math.min(MAX_ANIMATION_PLAYBACK_SPEED, value));
}

export function getGifFrameDelayMs(frameDelayMs: number | undefined, playbackSpeed: number): number {
  const frameDelay = frameDelayMs && Number.isFinite(frameDelayMs) ? frameDelayMs : 100;
  return Math.max(10, Math.max(20, frameDelay) / normalizeAnimationPlaybackSpeed(playbackSpeed));
}