import {
  buildEngineConfig, buildOverlaySpecs, pickSupportedPreset, presetSupport, requiredUplinkKbps, resolveEffectiveVideo,
  type LocalOverrides,
} from '../src/services/effectiveConfig';
import { defaultStudioProfile, type StudioWidget } from '../src/shared/studioProfile';
import type { DeviceCapabilities } from '../src/native';

const sizes = (list: Array<[number, number, number]>) => list.map(([w, h, maxFps]) => ({ w, h, maxFps }));

function caps(options: { h265?: boolean; fourK?: boolean; sixty?: boolean } = {}): DeviceCapabilities {
  const supported = ['1280x720@30', '1920x1080@30'];
  if (options.sixty) supported.push('1280x720@60', '1920x1080@60');
  if (options.fourK) supported.push('3840x2160@30');
  const encoder = { name: 'c2.test.avc.encoder', hardware: true, maxWidth: 3840, maxHeight: 2160, maxBitrate: 100_000_000, supported };
  return {
    device: { model: 'Test', manufacturer: 'Acme', sdk: 34, abis: ['arm64-v8a'] },
    cameras: [{
      id: '0', facing: 'back', zoomMax: 8, hasFlash: true, logicalMulti: false, physicalIds: [], stabilization: ['video'],
      sizes: sizes([[1280, 720, options.sixty ? 60 : 30], [1920, 1080, options.sixty ? 60 : 30], ...(options.fourK ? [[3840, 2160, 30] as [number, number, number]] : [])]),
    }, {
      id: '1', facing: 'front', zoomMax: 1, hasFlash: false, logicalMulti: false, physicalIds: [], stabilization: [],
      sizes: sizes([[1280, 720, 30], [1920, 1080, 30]]),
    }],
    encoders: { h264: encoder, h265: options.h265 ? { ...encoder, name: 'c2.test.hevc.encoder' } : null },
  };
}

const local = (overrides: Partial<LocalOverrides['video']> = {}, facing: 'back' | 'front' = 'back'): LocalOverrides => ({
  video: { presetId: null, codec: null, adaptive: null, record: null, stabilization: null, orientation: null, bitrateKbps: null, ...overrides },
  audio: { bitrateKbps: null, stereo: null, echo: null, noise: null },
  overlayRender: 'software',
  overlayFps: 15,
  facing,
});

const preset = (id: string) => require('../src/shared/studioProfile').findStudioVideoPreset(id);

describe('presetSupport', () => {
  it('accepts anything when capabilities are unknown', () => {
    expect(presetSupport(preset('2160p60'), 'h264', null)).toEqual({ ok: true });
  });

  it('rejects 4K on a phone without 4K video and explains why', () => {
    const result = presetSupport(preset('2160p30'), 'h264', caps());
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/encoder can't do|can't capture/i);
  });

  it('requires both the encoder and the camera to deliver the frame rate', () => {
    expect(presetSupport(preset('1080p60'), 'h264', caps()).ok).toBe(false);
    expect(presetSupport(preset('1080p60'), 'h264', caps({ sixty: true })).ok).toBe(true);
  });

  it('needs an HEVC encoder for h265 and checks the selected lens', () => {
    expect(presetSupport(preset('1080p30'), 'h265', caps()).reason).toMatch(/No H\.265/);
    expect(presetSupport(preset('1080p30'), 'h265', caps({ h265: true })).ok).toBe(true);
    expect(presetSupport(preset('1080p30'), 'h264', caps({ sixty: true }), 'front').ok).toBe(true);
    expect(presetSupport(preset('1080p60'), 'h264', caps({ sixty: true }), 'front').ok).toBe(false);
  });
});

describe('pickSupportedPreset', () => {
  it('keeps the requested preset when supported', () => {
    expect(pickSupportedPreset('1080p30', 'h264', caps())).toEqual({ preset: preset('1080p30') });
  });

  it('falls back to the best lower preset and says so', () => {
    const picked = pickSupportedPreset('2160p60', 'h264', caps({ sixty: true }));
    expect(picked.preset.id).toBe('1080p60');
    expect(picked.downgradeReason).toMatch(/Using 1080p · 60 fps/);
  });

  it('keeps 720p30 when supported or capabilities are unknown', () => {
    expect(pickSupportedPreset('720p30', 'h264', null).preset.id).toBe('720p30');
    expect(pickSupportedPreset('720p30', 'h264', caps()).preset.id).toBe('720p30');
  });

  it('does not invent 720p support when the encoder is missing', () => {
    expect(() => pickSupportedPreset('1080p30', 'h264', { ...caps(), encoders: { h264: null, h265: null } }))
      .toThrow(/No H\.264 encoder.*No compatible video quality/);
  });

  it('requires the selected camera to support even the lowest preset', () => {
    const unsupportedCamera = { ...caps(), cameras: [] };
    expect(() => pickSupportedPreset('720p30', 'h264', unsupportedCamera)).toThrow(/No compatible video quality/);
    expect(() => pickSupportedPreset('2160p30', 'h264', unsupportedCamera)).toThrow(/No compatible video quality/);
  });
});

describe('resolveEffectiveVideo / buildEngineConfig', () => {
  const profile = defaultStudioProfile('cricket');

  it('follows the tournament profile until the operator overrides it', () => {
    const effective = resolveEffectiveVideo(profile, local(), caps());
    expect(effective.preset.id).toBe('1080p30');
    expect(effective.bitrateKbps).toBe(6000);
    expect(effective.adaptive).toBe(true);
  });

  it('clamps a bitrate override to the preset range and ignores it for other presets', () => {
    expect(resolveEffectiveVideo(profile, local({ bitrateKbps: 99_000 }), caps()).bitrateKbps).toBe(9000);
    expect(resolveEffectiveVideo(profile, local({ bitrateKbps: 100 }), caps()).bitrateKbps).toBe(3000);
    // The override was chosen for 1080p30; a downgraded 720p30 must use its own default.
    const downgraded = resolveEffectiveVideo({ ...profile, video: { ...profile.video, presetId: '2160p30' } }, local({ bitrateKbps: 30_000 }), caps());
    expect(downgraded.preset.id).not.toBe('2160p30');
    expect(downgraded.bitrateKbps).toBeLessThanOrEqual(downgraded.preset.maxBitrateKbps);
  });

  it('builds a landscape engine config in bits per second', () => {
    const effective = resolveEffectiveVideo(profile, local(), caps());
    const config = buildEngineConfig(effective, profile, local());
    expect(config.video).toMatchObject({ width: 1920, height: 1080, fps: 30, bitrateBps: 6_000_000, rotation: 0, codec: 'h264', facing: 'back' });
    expect(config.audio).toMatchObject({ bitrateBps: 128_000, sampleRate: 48000, stereo: true });
    expect(config.overlayHardware).toBe(false);
  });

  it('keeps landscape dimensions for portrait and rotates the output', () => {
    const effective = resolveEffectiveVideo(profile, local({ orientation: 'portrait' }), caps());
    const config = buildEngineConfig(effective, profile, local({ orientation: 'portrait' }));
    expect(config.video).toMatchObject({ width: 1920, height: 1080, rotation: 90 });
  });
});

describe('buildOverlaySpecs', () => {
  const context = { origin: 'https://app.example.com', tenantId: 't_1', slug: 'pkl', game: 'cricket' as const, matchId: 'm_1' };
  const widget = (patch: Partial<StudioWidget>): StudioWidget => ({
    id: 'w1', label: 'Board', kind: 'web', url: '{origin}/{slug}/{game}/scorer/obs-overlay{matchQuery}', enabled: true,
    anchor: 'full', widthPct: 100, opacity: 1, pageWidth: 1920, pageHeight: 1080, ...patch,
  });

  it('resolves tokens and pins the match', () => {
    const [spec] = buildOverlaySpecs([widget({})], {}, context);
    expect(spec.url).toBe('https://app.example.com/pkl/cricket/scorer/obs-overlay?matchId=m_1&pin=1');
    expect(spec.enabled).toBe(true);
  });

  it('applies the local hide switch but never re-enables an admin-disabled widget', () => {
    const [hiddenSpec] = buildOverlaySpecs([widget({})], { w1: true }, context);
    expect(hiddenSpec.enabled).toBe(false);
    const [adminOff] = buildOverlaySpecs([widget({ enabled: false })], {}, context);
    expect(adminOff.enabled).toBe(false);
  });

  it('skips widgets whose URL cannot be resolved', () => {
    expect(buildOverlaySpecs([widget({ url: 'ftp://nope' })], {}, context)).toEqual([]);
    expect(buildOverlaySpecs([widget({})], {}, { ...context, origin: 'javascript:alert(1)' })).toEqual([]);
  });
});

describe('requiredUplinkKbps', () => {
  it('adds audio and 25% headroom per destination', () => {
    const effective = resolveEffectiveVideo(defaultStudioProfile('cricket'), local(), caps());
    expect(requiredUplinkKbps(effective, 128, 1)).toBe(Math.round((6000 + 128) * 1.25));
    expect(requiredUplinkKbps(effective, 128, 2)).toBe(Math.round((6000 + 128) * 2 * 1.25));
    expect(requiredUplinkKbps(effective, 128, 0)).toBe(Math.round((6000 + 128) * 1.25));
  });
});
