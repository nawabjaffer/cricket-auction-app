import { preflightBlocked, runPreflight, type PreflightInput } from '../src/services/preflight';
import { resolveEffectiveVideo } from '../src/services/effectiveConfig';
import { defaultStudioProfile } from '../src/shared/studioProfile';

const effective = resolveEffectiveVideo(
  defaultStudioProfile('cricket'),
  {
    video: { presetId: null, codec: null, adaptive: null, record: null, stabilization: null, orientation: null, bitrateKbps: null },
    audio: { bitrateKbps: null, stereo: null, echo: null, noise: null },
    overlayRender: 'software', overlayFps: 15, facing: 'back',
  },
  null,
);

const base = (overrides: Partial<PreflightInput> = {}): PreflightInput => ({
  hasPermissions: true,
  destinations: [{ label: 'YouTube Live', ready: true, note: 'Google account linked' }],
  network: { connected: true, type: 'wifi', metered: false, validated: true, addresses: [] },
  battery: { level: 80, charging: false, temperatureC: 30 },
  thermal: 0,
  freeStorageMb: 20_000,
  record: false,
  effective,
  audioKbps: 128,
  ...overrides,
});

const byId = (checks: ReturnType<typeof runPreflight>, id: string) => checks.find(check => check.id === id);

describe('runPreflight', () => {
  it('passes a healthy setup', () => {
    const checks = runPreflight(base());
    expect(checks.every(check => check.status === 'ok')).toBe(true);
    expect(preflightBlocked(checks)).toBe(false);
  });

  it('blocks without permissions, destinations or internet', () => {
    expect(preflightBlocked(runPreflight(base({ hasPermissions: false })))).toBe(true);
    expect(preflightBlocked(runPreflight(base({ destinations: [] })))).toBe(true);
    expect(byId(runPreflight(base({ network: { connected: false, type: 'none', metered: false, validated: false, addresses: [] } })), 'network')?.status).toBe('fail');
  });

  it('blocks a destination that is missing its key', () => {
    const checks = runPreflight(base({ destinations: [{ label: 'Twitch', ready: false, note: 'Add the stream key' }] }));
    expect(preflightBlocked(checks)).toBe(true);
    expect(checks.find(check => check.label === 'Twitch')?.detail).toBe('Add the stream key');
  });

  it('warns (but allows) on mobile data, low battery and heat', () => {
    const checks = runPreflight(base({
      network: { connected: true, type: 'cellular', metered: true, validated: true, addresses: [] },
      battery: { level: 20, charging: false, temperatureC: 40 },
      thermal: 3,
    }));
    expect(byId(checks, 'network')?.status).toBe('warn');
    expect(byId(checks, 'battery')?.status).toBe('warn');
    expect(byId(checks, 'thermal')?.status).toBe('warn');
    expect(preflightBlocked(checks)).toBe(false);
  });

  it('refuses a nearly empty battery unless charging, and critical heat', () => {
    expect(byId(runPreflight(base({ battery: { level: 8, charging: false, temperatureC: 30 } })), 'battery')?.status).toBe('fail');
    expect(byId(runPreflight(base({ battery: { level: 8, charging: true, temperatureC: 30 } })), 'battery')?.status).toBe('ok');
    expect(preflightBlocked(runPreflight(base({ thermal: 4 })))).toBe(true);
  });

  it('checks free storage only when recording locally', () => {
    expect(byId(runPreflight(base({ freeStorageMb: 100 })), 'storage')).toBeUndefined();
    expect(byId(runPreflight(base({ record: true, freeStorageMb: 100 })), 'storage')?.status).toBe('fail');
    expect(byId(runPreflight(base({ record: true, freeStorageMb: 800 })), 'storage')?.status).toBe('warn');
  });

  it('reports a downgraded quality as a warning', () => {
    const downgraded = { ...effective, downgradeReason: 'The H.264 encoder cannot do 4K. Using 1080p · 30 fps.' };
    expect(byId(runPreflight(base({ effective: downgraded })), 'quality')?.status).toBe('warn');
  });
});
