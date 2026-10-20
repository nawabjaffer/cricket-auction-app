export type OverlayRotation = 'auto' | 0 | 90 | 180 | 270;
export type FrameOrientation = 'portrait' | 'landscape';

export interface OverlayFramingSettings {
  scalePct: number;
  rotation: OverlayRotation;
  offsetXPct: number;
  offsetYPct: number;
}

export function orientedFrameDimensions(width: number, height: number, orientation: FrameOrientation) {
  return orientation === 'portrait' ? { frameWidth: height, frameHeight: width } : { frameWidth: width, frameHeight: height };
}

export const DEFAULT_OVERLAY_FRAMING: OverlayFramingSettings = {
  scalePct: 45,
  rotation: 'auto',
  offsetXPct: 0,
  offsetYPct: 0,
};

interface OverlayDimensions { pageWidth: number; pageHeight: number }

export function resolveOverlayRotation(mode: OverlayRotation, pageWidth: number, pageHeight: number, frameOrientation: FrameOrientation): number {
  if (mode !== 'auto') return mode;
  return (pageHeight > pageWidth) === (frameOrientation === 'portrait') ? 0 : 90;
}

export function applyOverlayFraming<T extends OverlayDimensions>(
  specs: readonly T[], framing: OverlayFramingSettings, frameOrientation: FrameOrientation,
): Array<T & { rotation: number; scalePct: number; offsetXPct: number; offsetYPct: number }> {
  return specs.map(spec => ({
    ...spec,
    rotation: resolveOverlayRotation(framing.rotation, spec.pageWidth, spec.pageHeight, frameOrientation),
    scalePct: framing.scalePct,
    offsetXPct: framing.offsetXPct,
    offsetYPct: framing.offsetYPct,
  }));
}