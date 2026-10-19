// ============================================================================
// Pure helpers that turn (studio profile + local overrides + device capabilities)
// into the concrete engine configuration. Kept free of React Native imports so
// they are unit-testable and reusable.
// ============================================================================

import {
  STUDIO_VIDEO_PRESETS, findStudioVideoPreset, resolveWidgetUrl,
  type StudioCodec, type StudioContext, type StudioProfile, type StudioVideoPreset, type StudioWidget,
} from '../shared/studioProfile';
import type { DeviceCapabilities, EngineConfig, OverlaySpec } from '../native';

export interface LocalOverrides {
  video: {
    presetId: string | null; codec: StudioCodec | null; adaptive: boolean | null; record: boolean | null;
    stabilization: boolean | null; orientation: 'landscape' | 'portrait' | null; bitrateKbps: number | null;
  };
  audio: { bitrateKbps: number | null; stereo: boolean | null; echo: boolean | null; noise: boolean | null };
  overlayRender: 'software' | 'hardware';
  overlayFps: number;
  facing: 'back' | 'front';
}

export interface EffectiveVideo {
  preset: StudioVideoPreset;
  requestedPresetId: string;
  codec: StudioCodec;
  bitrateKbps: number;
  adaptive: boolean;
  record: boolean;
  stabilization: boolean;
  orientation: 'landscape' | 'portrait';
  /** Set when the device cannot do the requested preset and a lower one was chosen. */
  downgradeReason?: string;
}

export interface PresetSupport { ok: boolean; reason?: string }

export function presetSupport(
  preset: StudioVideoPreset, codec: StudioCodec, caps: DeviceCapabilities | null, facing: 'back' | 'front' = 'back',
): PresetSupport {
  if (!caps) return { ok: true };
  const encoder = caps.encoders[codec];
  const codecName = codec === 'h265' ? 'H.265' : 'H.264';
  if (!encoder) return { ok: false, reason: `No ${codecName} encoder on this phone` };
  if (!encoder.supported.includes(`${preset.width}x${preset.height}@${preset.fps}`)) {
    return { ok: false, reason: `The ${codecName} encoder can't do ${preset.label}` };
  }
  const cameras = caps.cameras.filter(camera => camera.facing === facing);
  const capturable = cameras.some(camera => camera.sizes.some(size => size.w === preset.width && size.h === preset.height && size.maxFps >= preset.fps));
  if (!capturable) return { ok: false, reason: `The ${facing} camera can't capture ${preset.label}` };
  return { ok: true };
}

/** Highest-quality preset the phone can really deliver, never above the one requested. */
export function pickSupportedPreset(
  requestedId: string, codec: StudioCodec, caps: DeviceCapabilities | null, facing: 'back' | 'front' = 'back',
): { preset: StudioVideoPreset; downgradeReason?: string } {
  const requested = findStudioVideoPreset(requestedId);
  const first = presetSupport(requested, codec, caps, facing);
  if (first.ok) return { preset: requested };
  const lower = [...STUDIO_VIDEO_PRESETS]
    .filter(preset => preset.height < requested.height || (preset.height === requested.height && preset.fps < requested.fps))
    .sort((a, b) => b.height - a.height || b.fps - a.fps);
  const fallback = lower.find(preset => presetSupport(preset, codec, caps, facing).ok);
  if (!fallback) throw new Error(`${first.reason}. No compatible video quality is available. Choose another codec or camera in Setup.`);
  return { preset: fallback, downgradeReason: `${first.reason}. Using ${fallback.label}.` };
}

export function resolveEffectiveVideo(
  profile: StudioProfile, local: LocalOverrides, caps: DeviceCapabilities | null,
): EffectiveVideo {
  const codec = local.video.codec ?? profile.video.codec;
  const requestedPresetId = local.video.presetId ?? profile.video.presetId;
  const { preset, downgradeReason } = pickSupportedPreset(requestedPresetId, codec, caps, local.facing);
  const requested = findStudioVideoPreset(requestedPresetId);
  // A bitrate override only applies to the preset it was chosen for.
  const bitrateKbps = Math.min(
    preset.maxBitrateKbps,
    Math.max(preset.minBitrateKbps, local.video.bitrateKbps != null && preset.id === requested.id ? local.video.bitrateKbps : preset.bitrateKbps),
  );
  return {
    preset,
    requestedPresetId,
    codec,
    bitrateKbps,
    adaptive: local.video.adaptive ?? profile.video.adaptiveBitrate,
    record: local.video.record ?? profile.video.recordLocal,
    stabilization: local.video.stabilization ?? profile.video.stabilization,
    orientation: local.video.orientation ?? profile.video.orientation,
    downgradeReason,
  };
}

export function buildEngineConfig(effective: EffectiveVideo, profile: StudioProfile, local: LocalOverrides): EngineConfig {
  const { preset } = effective;
  return {
    video: {
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      bitrateBps: effective.bitrateKbps * 1000,
      minBitrateBps: preset.minBitrateKbps * 1000,
      codec: effective.codec,
      iFrameInterval: 2,
      rotation: effective.orientation === 'portrait' ? 90 : 0,
      stabilization: effective.stabilization,
      adaptive: effective.adaptive,
      facing: local.facing,
    },
    audio: {
      sampleRate: profile.audio.sampleRate,
      stereo: local.audio.stereo ?? profile.audio.stereo,
      bitrateBps: (local.audio.bitrateKbps ?? profile.audio.bitrateKbps) * 1000,
      echoCanceler: local.audio.echo ?? profile.audio.echoCanceler,
      noiseSuppressor: local.audio.noise ?? profile.audio.noiseSuppressor,
    },
    overlayFps: local.overlayFps,
    overlayHardware: local.overlayRender === 'hardware',
  };
}

/** Profile widgets + operator-added ones, minus the ones hidden on this phone, with URLs resolved. */
export function buildOverlaySpecs(
  widgets: StudioWidget[], hidden: Record<string, boolean>, context: StudioContext,
): OverlaySpec[] {
  const specs: OverlaySpec[] = [];
  for (const widget of widgets) {
    const url = resolveWidgetUrl(widget.url, context);
    if (!url) continue;
    specs.push({
      id: widget.id,
      kind: widget.kind,
      url,
      enabled: widget.enabled && !hidden[widget.id],
      anchor: widget.anchor,
      widthPct: widget.widthPct,
      opacity: widget.opacity,
      pageWidth: widget.pageWidth,
      pageHeight: widget.pageHeight,
    });
  }
  return specs;
}

/** Recommended upload headroom: the encoder bitrate should stay well under measured uplink. */
export function requiredUplinkKbps(effective: EffectiveVideo, audioKbps: number, destinations: number): number {
  return Math.round((effective.bitrateKbps + audioKbps) * Math.max(1, destinations) * 1.25);
}
