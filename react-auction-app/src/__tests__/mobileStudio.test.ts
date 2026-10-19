import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import ReleaseCard from '../components/MobileStudio/ReleaseCard';
import { DEFAULT_TENANT_ID, tenantPath } from '../services/tenantPath';
import {
  DEFAULT_OVERLAY_URL_TEMPLATE, MAX_STUDIO_DESTINATIONS, MAX_STUDIO_WIDGETS, STUDIO_DEVICE_STALE_MS, STUDIO_PLATFORM_PRESETS,
  STUDIO_RTSP_PORT, STUDIO_VIDEO_PRESETS, androidVersionLabel, buildCameraLink, buildPairingLink, buildPairingPageUrl,
  defaultStudioProfile, findStudioVideoPreset, formatBytes, isDeviceOnline, isStudioGameType, isValidRtspUrl, normalizeDevices,
  normalizeOrigin, normalizeStudioProfile, parseCameraLink, parsePairingLink,
  parseReleaseManifest, releaseApkUrl, releaseManifestUrl, resolveStudioTitle, resolveWidgetUrl, sanitizeWidgetUrl,
  sortMatchSummaries, studioActiveMatchPath, studioDevicesPath, studioLiveCamPath, studioMatchIndexPath, studioMatchSetupPath,
  studioProfileHasErrors, studioProfilePath, studioSportNamespace, summarizeMatchSetup,
} from '../types/mobileStudio';

const CTX = { origin: 'https://app.example.com', tenantId: 'pkl_2026', slug: 'pkl-2026', game: 'cricket' as const };

describe('studio paths', () => {
  it('stay in lock-step with tenantPath so the web admin and the phone read the same nodes', () => {
    expect(studioProfilePath(DEFAULT_TENANT_ID, 'carrom')).toBe(tenantPath('mobileStudio/carrom/profile'));
    expect(studioDevicesPath(DEFAULT_TENANT_ID, 'kabaddi')).toBe(tenantPath('mobileStudio/kabaddi/devices'));
    expect(studioMatchIndexPath(DEFAULT_TENANT_ID, 'cricket')).toBe(tenantPath('scoring/matchIndex'));
    expect(studioMatchSetupPath(DEFAULT_TENANT_ID, 'football', 'm1')).toBe(tenantPath('football/matches/m1/setup'));
    expect(studioActiveMatchPath(DEFAULT_TENANT_ID, 'carrom')).toBe(tenantPath('carrom/activeMatch/matchId'));
    expect(studioLiveCamPath(DEFAULT_TENANT_ID, 'cricket', 'm9')).toBe(tenantPath('scoring/matches/m9/liveCam'));
  });

  it('maps cricket to the scoring namespace only', () => {
    expect(studioSportNamespace('cricket')).toBe('scoring');
    expect(studioSportNamespace('carrom')).toBe('carrom');
    expect(isStudioGameType('football')).toBe(true);
    expect(isStudioGameType('volleyball')).toBe(false);
  });
});

describe('video presets', () => {
  it('offers 1080p and 4K with sane, ordered bitrate bounds', () => {
    expect(STUDIO_VIDEO_PRESETS.some(preset => preset.height === 1080)).toBe(true);
    expect(STUDIO_VIDEO_PRESETS.some(preset => preset.height === 2160)).toBe(true);
    for (const preset of STUDIO_VIDEO_PRESETS) {
      expect(preset.minBitrateKbps).toBeLessThanOrEqual(preset.bitrateKbps);
      expect(preset.bitrateKbps).toBeLessThanOrEqual(preset.maxBitrateKbps);
      expect(preset.width % 2).toBe(0);
      expect(preset.height % 2).toBe(0);
    }
  });

  it('falls back to 1080p30 for unknown ids', () => {
    expect(findStudioVideoPreset('nope').id).toBe('1080p30');
    expect(findStudioVideoPreset('2160p60').height).toBe(2160);
  });
});

describe('profile normalisation', () => {
  it('returns the default profile for empty input', () => {
    expect(normalizeStudioProfile(null, 'carrom')).toEqual(defaultStudioProfile('carrom'));
    expect(normalizeStudioProfile({}, 'cricket').widgets[0].url).toBe(DEFAULT_OVERLAY_URL_TEMPLATE);
  });

  it('accepts RTDB-style objects-as-arrays and clamps values', () => {
    const profile = normalizeStudioProfile({
      updatedAt: 5,
      video: { presetId: '2160p30', codec: 'h265', adaptiveBitrate: false, recordLocal: true, orientation: 'portrait' },
      audio: { bitrateKbps: 9999, sampleRate: 44100, stereo: false },
      widgets: {
        0: { id: 'sb', label: 'Board', kind: 'web', url: '{origin}/x', anchor: 'bottom-center', widthPct: 500, opacity: 7 },
        1: { id: 'logo', label: 'Logo', kind: 'image', url: 'https://cdn.example.com/l.png', anchor: 'top-right', widthPct: 1 },
      },
      destinations: { 0: { id: 'yt', platform: 'youtube', label: 'Main', enabled: true } },
    }, 'cricket');
    expect(profile.video).toMatchObject({ presetId: '2160p30', codec: 'h265', adaptiveBitrate: false, recordLocal: true, orientation: 'portrait' });
    expect(profile.audio.bitrateKbps).toBe(320);
    expect(profile.audio.sampleRate).toBe(44100);
    expect(profile.widgets).toHaveLength(2);
    expect(profile.widgets[0]).toMatchObject({ widthPct: 100, opacity: 1 });
    expect(profile.widgets[1]).toMatchObject({ kind: 'image', widthPct: 5 });
    expect(profile.destinations).toEqual([{ id: 'yt', platform: 'youtube', label: 'Main', enabled: true }]);
  });

  it('drops widgets with unsafe URLs and destinations with unknown platforms', () => {
    const profile = normalizeStudioProfile({
      updatedAt: 1,
      widgets: [
        { id: 'a', label: 'bad', url: 'javascript:alert(1)' },
        { id: 'b', label: 'file', url: 'file:///data/data/x' },
        { id: 'c', label: 'ok', url: 'https://ok.example.com/o' },
      ],
      destinations: [{ platform: 'myspace' }, { platform: 'twitch' }],
    }, 'cricket');
    expect(profile.widgets.map(widget => widget.id)).toEqual(['c']);
    expect(profile.destinations.map(destination => destination.platform)).toEqual(['twitch']);
  });

  it('never carries a destination URL or key, even if one is injected', () => {
    const profile = normalizeStudioProfile({
      updatedAt: 1,
      destinations: [{ platform: 'rtmp', label: 'evil', url: 'rtmp://attacker.example/live', streamKey: 'secret' }],
    }, 'cricket');
    expect(JSON.stringify(profile.destinations)).not.toMatch(/attacker|secret|url|streamKey/i);
  });

  it('de-duplicates ids and enforces the widget / destination caps', () => {
    const many = Array.from({ length: 12 }, () => ({ id: 'same', label: 'W', url: 'https://x.example.com/' }));
    const profile = normalizeStudioProfile({
      updatedAt: 1,
      widgets: many,
      destinations: Array.from({ length: 9 }, () => ({ id: 'd', platform: 'rtmp' })),
    }, 'cricket');
    expect(profile.widgets).toHaveLength(MAX_STUDIO_WIDGETS);
    expect(new Set(profile.widgets.map(widget => widget.id)).size).toBe(MAX_STUDIO_WIDGETS);
    expect(profile.destinations).toHaveLength(MAX_STUDIO_DESTINATIONS);
    expect(new Set(profile.destinations.map(destination => destination.id)).size).toBe(MAX_STUDIO_DESTINATIONS);
  });

  it('keeps an intentionally empty widget list once the profile has been saved', () => {
    expect(normalizeStudioProfile({ updatedAt: 100 }, 'cricket').widgets).toEqual([]);
    expect(normalizeStudioProfile({ name: 'x' }, 'cricket').widgets).toHaveLength(1);
  });

  it('flags editor drafts the phone could not load', () => {
    const base = defaultStudioProfile('cricket');
    expect(studioProfileHasErrors(base)).toBe(false);
    expect(studioProfileHasErrors({ widgets: [{ ...base.widgets[0], url: 'ftp://nope' }] })).toBe(true);
    expect(studioProfileHasErrors({ widgets: [{ ...base.widgets[0], label: '  ' }] })).toBe(true);
  });
});

describe('URL building', () => {
  it('accepts only http(s) and {origin} widget URLs', () => {
    expect(sanitizeWidgetUrl('https://a.example.com/x')).toBe('https://a.example.com/x');
    expect(sanitizeWidgetUrl('{origin}/x')).toBe('{origin}/x');
    expect(sanitizeWidgetUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeWidgetUrl('https://a.example.com/has space')).toBeNull();
    expect(sanitizeWidgetUrl('')).toBeNull();
    expect(sanitizeWidgetUrl(42)).toBeNull();
  });

  it('expands tokens and pins the match when one is selected', () => {
    expect(resolveWidgetUrl(DEFAULT_OVERLAY_URL_TEMPLATE, CTX)).toBe('https://app.example.com/pkl-2026/cricket/scorer/obs-overlay');
    // An unsafe match id is ignored rather than injected into the URL.
    expect(resolveWidgetUrl(DEFAULT_OVERLAY_URL_TEMPLATE, { ...CTX, matchId: 'm 1&x=1' })).toBe('https://app.example.com/pkl-2026/cricket/scorer/obs-overlay');
    expect(resolveWidgetUrl(DEFAULT_OVERLAY_URL_TEMPLATE, { ...CTX, matchId: 'match_7' }))
      .toBe('https://app.example.com/pkl-2026/cricket/scorer/obs-overlay?matchId=match_7&pin=1');
    expect(resolveWidgetUrl('{origin}/{tenantId}/{game}?m={matchId}', { ...CTX, matchId: 'abc' })).toBe('https://app.example.com/pkl_2026/cricket?m=abc');
  });

  it('refuses non-http origins', () => {
    expect(resolveWidgetUrl('{origin}/x', { ...CTX, origin: 'javascript:alert(1)' })).toBeNull();
    expect(normalizeOrigin('https://a.example.com/path?q=1')).toBe('https://a.example.com');
    expect(normalizeOrigin('HTTP://192.168.1.5:5173/')).toBe('http://192.168.1.5:5173');
    expect(normalizeOrigin('ftp://a.example.com')).toBeNull();
  });
});

describe('broadcast titles', () => {
  it('fills the template', () => {
    expect(resolveStudioTitle('{teamA} vs {teamB} · {tournament} LIVE', { teamA: 'Lions', teamB: 'Tigers', tournament: 'PKL 2026' }))
      .toBe('Lions vs Tigers · PKL 2026 LIVE');
  });

  it('tidies separators when variables are missing', () => {
    expect(resolveStudioTitle('{teamA} vs {teamB} · {tournament} · {stage}', { tournament: 'PKL 2026' })).toBe('PKL 2026');
    expect(resolveStudioTitle('{tournament} · {stage} · LIVE', { tournament: 'PKL', stage: '' })).toBe('PKL · LIVE');
    expect(resolveStudioTitle('{teamA}', {})).toBe('Live match');
  });

  it('caps the title at 100 characters', () => {
    expect(resolveStudioTitle('{teamA}', { teamA: 'x'.repeat(300) })).toHaveLength(100);
  });
});

describe('pairing links', () => {
  const pairing = { origin: 'https://app.example.com', tenantId: 'pkl_2026', slug: 'pkl-2026', game: 'carrom' as const, matchId: 'm_1' };

  it('round-trips through the njslive:// deep link', () => {
    const link = buildPairingLink(pairing);
    expect(link.startsWith('njslive://pair?')).toBe(true);
    expect(parsePairingLink(link)).toEqual(pairing);
  });

  it('parses the https pairing page and leaves the tenant id for the app to resolve', () => {
    const url = buildPairingPageUrl(pairing);
    expect(url).toBe('https://app.example.com/pkl-2026/carrom/scorer/mobile-app?matchId=m_1&pair=1');
    expect(parsePairingLink(url)).toEqual({ origin: 'https://app.example.com', tenantId: '', slug: 'pkl-2026', game: 'carrom', matchId: 'm_1' });
  });

  it('rejects malformed or hostile links', () => {
    expect(parsePairingLink('njslive://pair?o=javascript:alert(1)&t=x&g=cricket')).toBeNull();
    expect(parsePairingLink('njslive://pair?o=https://a.example.com&t=../../etc&g=cricket')).toBeNull();
    expect(parsePairingLink('njslive://pair?o=https://a.example.com&t=ok&g=chess')).toBeNull();
    expect(parsePairingLink('https://evil.example.com/not-a-pairing-page')).toBeNull();
    expect(parsePairingLink('')).toBeNull();
    expect(parsePairingLink('njslive://pair?o=https://a.example.com&t=ok&g=cricket&m=bad id')?.matchId).toBeUndefined();
  });
});

describe('release manifest', () => {
  const valid = {
    schema: 1, appId: 'com.njsstore.livestudio', versionName: '1.0.0', versionCode: 3, minSdk: 24,
    file: 'njs-live-studio.apk', size: 55_000_000, sha256: 'A'.repeat(64), builtAt: '2026-10-14T00:00:00Z', notes: ['First release'],
  };

  it('parses a valid manifest and lower-cases the checksum', () => {
    const manifest = parseReleaseManifest(valid);
    expect(manifest?.sha256).toBe('a'.repeat(64));
    expect(manifest?.versionCode).toBe(3);
    expect(releaseManifestUrl('https://x.example.com')).toBe('https://x.example.com/downloads/android/latest.json');
    expect(manifest && releaseApkUrl('https://x.example.com', manifest)).toBe('https://x.example.com/downloads/android/njs-live-studio.apk');
  });

  it('rejects anything that is not a trustworthy manifest (e.g. the SPA index.html fallback)', () => {
    expect(parseReleaseManifest(null)).toBeNull();
    expect(parseReleaseManifest('<!doctype html>')).toBeNull();
    expect(parseReleaseManifest({ ...valid, schema: 2 })).toBeNull();
    expect(parseReleaseManifest({ ...valid, sha256: 'xyz' })).toBeNull();
    expect(parseReleaseManifest({ ...valid, file: '../../etc/passwd' })).toBeNull();
    expect(parseReleaseManifest({ ...valid, file: 'app.exe' })).toBeNull();
    expect(parseReleaseManifest({ ...valid, versionCode: 0 })).toBeNull();
    expect(parseReleaseManifest({ ...valid, size: -1 })).toBeNull();
  });

  it('formats sizes and Android versions for the download card', () => {
    expect(formatBytes(55_000_000)).toBe('52.5 MB');
    expect(formatBytes(0)).toBe('—');
    expect(androidVersionLabel(24)).toBe('Android 7.0+');
    expect(androidVersionLabel(99)).toBe('Android API 99+');
  });

  describe('download card', () => {
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('does not offer a download for the SPA fallback or recommend bypassing security warnings', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('HTML fallback'); } }));
      render(createElement(ReleaseCard, { origin: CTX.origin, autoDownload: true }));
      expect(await screen.findByText('The Android app has not been published to this site yet.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Download APK/ })).not.toBeInTheDocument();
      expect(screen.queryByText(/install anyway|download anyway/i)).not.toBeInTheDocument();
    });

    it('offers the expected APK only after a valid manifest loads', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => valid }));
      render(createElement(ReleaseCard, { origin: CTX.origin }));
      expect(await screen.findByRole('link', { name: /Download APK/ })).toHaveAttribute('href', `${CTX.origin}/downloads/android/njs-live-studio.apk`);
      expect(screen.getByText('Android 7.0+')).toBeInTheDocument();
    });

    it('starts the Quick link download once after validating the manifest', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => valid }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      const view = render(createElement(ReleaseCard, { origin: CTX.origin, autoDownload: true }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      const link = click.mock.instances[0];
      if (!(link instanceof HTMLAnchorElement)) throw new Error('Expected an APK download link');
      expect(link.href).toBe(`${CTX.origin}/downloads/android/njs-live-studio.apk`);
      expect(link.download).toBe('njs-live-studio.apk');
      view.rerender(createElement(ReleaseCard, { origin: CTX.origin, autoDownload: true }));
      expect(click).toHaveBeenCalledTimes(1);
    });
  });
});

describe('LAN camera links', () => {
  it('round-trips a camera QR link', () => {
    const link = buildCameraLink({ url: 'rtsp://192.168.1.20:8554/', name: 'Cam 2 · Square leg', matchId: 'm_1' });
    expect(link.startsWith('njslive://camera?')).toBe(true);
    expect(parseCameraLink(link)).toEqual({ url: 'rtsp://192.168.1.20:8554/', name: 'Cam 2 · Square leg', matchId: 'm_1' });
  });

  it('accepts a bare RTSP url from an IP camera or VLC', () => {
    expect(parseCameraLink('rtsp://admin:pw@10.0.0.9:554/stream1')?.url).toBe('rtsp://admin:pw@10.0.0.9:554/stream1');
    expect(parseCameraLink('rtsp://cam.local/live')?.name).toBe('cam.local');
    expect(STUDIO_RTSP_PORT).toBe(8554);
  });

  it('rejects other schemes and malformed links', () => {
    expect(isValidRtspUrl('http://192.168.1.20:8554/')).toBe(false);
    expect(isValidRtspUrl('rtsp://')).toBe(false);
    expect(isValidRtspUrl('rtsp://host with space/')).toBe(false);
    expect(parseCameraLink('njslive://camera?u=javascript:alert(1)')).toBeNull();
    expect(parseCameraLink('njslive://camera?u=http://evil.example.com')).toBeNull();
    expect(parseCameraLink('')).toBeNull();
    expect(parseCameraLink('njslive://camera?u=rtsp://10.0.0.2:8554/&m=bad id')?.matchId).toBeUndefined();
  });
});

describe('device presence', () => {
  const now = 1_700_000_000_000;

  it('normalises records and sorts the freshest first', () => {
    const devices = normalizeDevices({
      a: { id: 'a', name: 'Cam A', role: 'camera', state: 'live', appVersion: '1.0.0', lastSeen: now - 1000, battery: 140, lanUrl: 'rtsp://192.168.1.20:8554/' },
      b: { id: 'b', name: 'Studio', role: 'studio', state: 'weird', appVersion: '1.0.0', lastSeen: now },
      bad: { name: 'no id' },
    });
    expect(devices.map(device => device.id)).toEqual(['b', 'a']);
    expect(devices[0].state).toBe('idle');
    expect(devices[1]).toMatchObject({ battery: 100, lanUrl: 'rtsp://192.168.1.20:8554/' });
  });

  it('ignores non-RTSP LAN urls and marks stale devices offline', () => {
    const [device] = normalizeDevices([{ id: 'x', lastSeen: now, lanUrl: 'http://evil.example.com' }]);
    expect(device.lanUrl).toBeUndefined();
    expect(isDeviceOnline({ lastSeen: now - 1000 }, now)).toBe(true);
    expect(isDeviceOnline({ lastSeen: now - STUDIO_DEVICE_STALE_MS - 1 }, now)).toBe(false);
  });
});

describe('match summaries', () => {
  it('reads any sport setup and orders live matches first', () => {
    const live = summarizeMatchSetup('m_live', { teamA: { name: 'Lions' }, teamB: { name: 'Tigers' }, status: 'live', createdAt: 1, stage: 'Final' });
    const done = summarizeMatchSetup('m_done', { teamA: { name: 'A' }, teamB: { name: 'B' }, status: 'completed', createdAt: 9 });
    const later = summarizeMatchSetup('m_sched', { teamA: { name: 'C' }, teamB: { name: 'D' }, status: 'scheduled', createdAt: 5, competition: 'Group' });
    expect(live).toMatchObject({ title: 'Lions vs Tigers', stage: 'Final' });
    expect(later?.stage).toBe('Group');
    expect(sortMatchSummaries([done!, later!, live!]).map(match => match.id)).toEqual(['m_live', 'm_sched', 'm_done']);
    expect(summarizeMatchSetup('bad id', { teamA: { name: 'A' } })).toBeNull();
    expect(summarizeMatchSetup('m1', {})).toBeNull();
  });
});

describe('platform presets', () => {
  it('keeps keys out of the presets and demands a custom URL for generic targets', () => {
    for (const preset of Object.values(STUDIO_PLATFORM_PRESETS)) {
      expect(preset.ingestUrl).not.toMatch(/key|token/i);
      if (preset.customUrl) expect(preset.ingestUrl).toBe('');
      else expect(preset.ingestUrl).toMatch(/^rtmps?:\/\//);
    }
    expect(STUDIO_PLATFORM_PRESETS.youtube.supportsAccountLink).toBe(true);
  });
});
