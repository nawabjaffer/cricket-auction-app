/// <reference types="node" />

import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReleaseCard from '../components/MobileStudio/ReleaseCard';
import { MAX_WORKSPACE_EXPORT_BYTES, scoringBrowserScript } from '../../mobile/src/services/scoringBrowser';
import { DEFAULT_MOBILE_SCORING_OPTIONS, mobileScoringOptionsPath, mobileScoringPageVisible, mobileScoringTabVisible, normalizeMobileScoringOptions } from '../../mobile/src/shared/mobileScoring';
import ScoringOptionsCard from '../components/MobileStudio/ScoringOptionsCard';
import { mobileStudioService } from '../services/mobileStudioService';
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
const mobileAdmin = vi.hoisted(() => ({ allowed: true }));
vi.mock('../hooks/useAdminAuth', () => ({ useAdminAuth: () => ({ isAuthenticated: mobileAdmin.allowed }) }));

describe('admin mobile scoring controls', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); mobileAdmin.allowed = true; });
  it('saves optional features from the admin control card', async () => {
    vi.spyOn(mobileStudioService, 'subscribeScoringOptions').mockImplementation((_game, callback) => { callback({ ...DEFAULT_MOBILE_SCORING_OPTIONS }); return () => undefined; });
    const save = vi.spyOn(mobileStudioService, 'saveScoringOptions').mockResolvedValue(undefined);
    render(createElement(ScoringOptionsCard, { gameType: 'cricket' }));
    fireEvent.click(screen.getByLabelText('Broadcast and animations'));
    fireEvent.click(screen.getByRole('button', { name: 'Save mobile options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('cricket', expect.objectContaining({ broadcast: true, tournamentAdmin: false })));
    expect(await screen.findByText('Mobile scoring options saved.')).toBeTruthy();
  });
  it('does not expose admin controls to an unsigned-in visitor', () => {
    mobileAdmin.allowed = false;
    const subscribe = vi.spyOn(mobileStudioService, 'subscribeScoringOptions');
    render(createElement(ScoringOptionsCard, { gameType: 'carrom' }));
    expect(screen.queryByText('Mobile scoring options')).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('mobile scoring visibility', () => {
  it('keeps scheduling visible and hides unrelated advanced options by default', () => {
    expect(mobileScoringTabVisible('matches', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(true);
    expect(mobileScoringTabVisible('obs', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(false);
    expect(mobileScoringTabVisible('provider', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(false);
    expect(DEFAULT_MOBILE_SCORING_OPTIONS.scoreboard).toBe(true);
    expect(DEFAULT_MOBILE_SCORING_OPTIONS.tournamentAdmin).toBe(false);
    expect(mobileScoringPageVisible('matches', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(true);
    expect(mobileScoringPageVisible('score', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(true);
    expect(mobileScoringPageVisible('admin', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(false);
    expect(mobileScoringPageVisible('designer', DEFAULT_MOBILE_SCORING_OPTIONS)).toBe(false);
  });
  it('lets admin controls enable specific optional features without trusting arbitrary input', () => {
    const options = normalizeMobileScoringOptions({ teams: true, provider: true, broadcast: true, ads: 'true' });
    expect(mobileScoringTabVisible('teams', options)).toBe(true);
    expect(mobileScoringTabVisible('provider', options)).toBe(true);
    expect(mobileScoringTabVisible('obs', options)).toBe(true);
    expect(options.ads).toBe(false);
    expect(mobileScoringOptionsPath('tenant_1', 'carrom')).toBe('tenants/tenant_1/mobileStudio/carrom/scoringOptions');
  });
});

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

  it('rejects a release manifest for a different application', () => {
    expect(parseReleaseManifest({ ...valid, appId: 'com.other.application' })).toBeNull();
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

    it('downloads the immutable APK filename supplied by the release manifest', async () => {
      const file = `njs-live-studio-3-${'a'.repeat(64)}.apk`;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...valid, file }) }));
      render(createElement(ReleaseCard, { origin: CTX.origin }));
      expect(await screen.findByRole('link', { name: /Download APK/ })).toHaveAttribute('href', `${CTX.origin}/downloads/android/${file}`);
    });

    it('never presents a testing or development-signed manifest as a production download', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...valid, channel: 'testing', signing: 'development' }) }));
      render(createElement(ReleaseCard, { origin: CTX.origin, autoDownload: true }));
      expect(await screen.findByText('The Android app has not been published to this site yet.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Download APK/ })).not.toBeInTheDocument();
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

describe('APK publication', () => {
  const fixtures: string[] = [];

  afterEach(() => {
    for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function publisherFixture() {
    const root = mkdtempSync(join(tmpdir(), 'njs-apk-publish-'));
    fixtures.push(root);
    const script = join(root, 'scripts/publish-android-app.mjs');
    const sdk = join(root, 'sdk');
    const tools = join(sdk, 'build-tools/37.0.0');
    const output = join(root, 'public/downloads/android');
    const apk = join(root, 'app-release.apk');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(tools, { recursive: true });
    copyFileSync(join(process.cwd(), 'scripts/publish-android-app.mjs'), script);
    writeFileSync(apk, 'first APK fixture');

    const tool = (name: string, stdout: string, exitCode = 0) => {
      writeFileSync(join(tools, name), `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(${exitCode});\n`, { mode: 0o755 });
    };
    const packageInfo = (versionCode = 42, appId = 'com.njsstore.livestudio', debuggable = false) => {
      tool('aapt2', `package: name='${appId}' versionCode='${versionCode}' versionName='1.0.0'\nsdkVersion:'24'\nnative-code: 'arm64-v8a' 'armeabi-v7a'\n${debuggable ? 'application-debuggable\n' : ''}`);
    };
    packageInfo();
    tool('apksigner', `Signer #1 certificate DN: CN=NJS Release\nSigner #1 certificate SHA-256 digest: ${'b'.repeat(64)}\nSigner #1 certificate SHA-1 digest: ${'c'.repeat(40)}\n`);

    return {
      apk, output, tool, packageInfo,
      publish: (...args: string[]) => spawnSync(process.execPath, [script, '--apk', apk, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
      }),
    };
  }

  it('publishes a checksum-addressed APK rather than overwriting the download filename', () => {
    const fixture = publisherFixture();
    const result = fixture.publish('--notes', 'First release | Device validated');
    expect(result.status, result.stderr).toBe(0);
    const bytes = readFileSync(fixture.apk);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const manifest = parseReleaseManifest(JSON.parse(readFileSync(join(fixture.output, 'latest.json'), 'utf8')));
    expect(manifest?.file).toBe(`njs-live-studio-42-${digest}.apk`);
    expect(manifest?.sha256).toBe(digest);
    expect(manifest).toMatchObject({
      versionCode: 42, minSdk: 24, size: bytes.length, signerSha256: 'b'.repeat(64),
      abis: ['arm64-v8a', 'armeabi-v7a'], notes: ['First release', 'Device validated'],
    });
    expect(readFileSync(join(fixture.output, manifest!.file))).toEqual(bytes);
    expect(readdirSync(fixture.output).sort()).toEqual(['latest.json', manifest!.file].sort());
  });

  it('retains the previous APK when a newer release is published', () => {
    const fixture = publisherFixture();
    expect(fixture.publish().status).toBe(0);
    const previous = JSON.parse(readFileSync(join(fixture.output, 'latest.json'), 'utf8'));
    const previousBytes = readFileSync(join(fixture.output, previous.file));
    fixture.packageInfo(43);
    writeFileSync(fixture.apk, 'second APK fixture');

    const result = fixture.publish();
    expect(result.status, result.stderr).toBe(0);
    const latest = JSON.parse(readFileSync(join(fixture.output, 'latest.json'), 'utf8'));
    expect(latest.versionCode).toBe(43);
    expect(latest.file).not.toBe(previous.file);
    expect(readFileSync(join(fixture.output, previous.file))).toEqual(previousBytes);
    expect(readFileSync(join(fixture.output, latest.file))).toEqual(readFileSync(fixture.apk));
  });

  it('does not rewrite an identical APK or manifest when publishing twice', () => {
    const fixture = publisherFixture();
    expect(fixture.publish('--source-fingerprint', 'd'.repeat(64)).status).toBe(0);
    const catalog = join(fixture.output, 'latest.json');
    const previous = readFileSync(catalog, 'utf8');
    const file = join(fixture.output, JSON.parse(previous).file);
    const times = [statSync(catalog).mtimeMs, statSync(file).mtimeMs];
    const result = fixture.publish('--source-fingerprint', 'd'.repeat(64));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('No files rewritten');
    expect(readFileSync(catalog, 'utf8')).toBe(previous);
    expect([statSync(catalog).mtimeMs, statSync(file).mtimeMs]).toEqual(times);
  });

  it('rejects debug signing before creating any public release files', () => {
    const fixture = publisherFixture();
    fixture.tool('apksigner', 'Signer #1 certificate DN: CN=Android Debug, O=Android\n');
    const result = fixture.publish();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('signed with the Android debug key');
    expect(existsSync(fixture.output)).toBe(false);
  });

  it('rejects an APK for a different application', () => {
    const fixture = publisherFixture();
    fixture.packageInfo(42, 'com.other.application');
    const result = fixture.publish();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unexpected package');
    expect(existsSync(fixture.output)).toBe(false);
  });

  it('publishes development signing only in the explicit testing channel', () => {
    const fixture = publisherFixture();
    fixture.tool('apksigner', `Signer #1 certificate DN: CN=Android Debug, O=Android\nSigner #1 certificate SHA-256 digest: ${'b'.repeat(64)}\n`);
    const result = fixture.publish('--channel', 'testing', '--allow-debug');
    expect(result.status, result.stderr).toBe(0);
    const testing = join(fixture.output, 'testing');
    const manifest = parseReleaseManifest(JSON.parse(readFileSync(join(testing, 'latest.json'), 'utf8')));
    expect(manifest).toMatchObject({ channel: 'testing', signing: 'development' });
    expect(releaseManifestUrl(CTX.origin, 'testing')).toBe(`${CTX.origin}/downloads/android/testing/latest.json`);
    expect(releaseApkUrl(CTX.origin, manifest!)).toBe(`${CTX.origin}/downloads/android/testing/${manifest!.file}`);
    expect(existsSync(join(fixture.output, 'latest.json'))).toBe(false);
  });

  it('does not allow the test-signing override on the production channel', () => {
    const fixture = publisherFixture();
    const result = fixture.publish('--allow-debug');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires --channel testing');
    expect(existsSync(fixture.output)).toBe(false);
  });

  it('rejects a debuggable APK even with the test-signing override', () => {
    const fixture = publisherFixture();
    fixture.packageInfo(42, 'com.njsstore.livestudio', true);
    const result = fixture.publish('--allow-debug');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('debuggable');
    expect(existsSync(fixture.output)).toBe(false);
  });

  it('preserves the last release when signature verification fails', () => {
    const fixture = publisherFixture();
    expect(fixture.publish().status).toBe(0);
    const previous = readFileSync(join(fixture.output, 'latest.json'), 'utf8');
    const previousFile = JSON.parse(previous).file;
    const previousBytes = readFileSync(join(fixture.output, previousFile));
    fixture.tool('apksigner', 'Signature verification failed', 1);
    const result = fixture.publish();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not verify the APK signature');
    expect(readFileSync(join(fixture.output, 'latest.json'), 'utf8')).toBe(previous);
    expect(readFileSync(join(fixture.output, previousFile))).toEqual(previousBytes);
  });

  it('preserves the last manifest and cleans staging files if APK publication fails', () => {
    const fixture = publisherFixture();
    expect(fixture.publish().status).toBe(0);
    const previous = readFileSync(join(fixture.output, 'latest.json'), 'utf8');
    fixture.packageInfo(43);
    writeFileSync(fixture.apk, 'second APK fixture');
    const digest = createHash('sha256').update(readFileSync(fixture.apk)).digest('hex');
    mkdirSync(join(fixture.output, `njs-live-studio-43-${digest}.apk`));

    const result = fixture.publish();
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(fixture.output, 'latest.json'), 'utf8')).toBe(previous);
    expect(readdirSync(fixture.output).some(name => name.startsWith('.publish-'))).toBe(false);
  });
});

describe('embedded scoring browser compatibility', () => {
  function adapter(origin = CTX.origin) {
    const messages: Array<Record<string, unknown>> = [];
    const readers: Array<{ blob?: unknown; result: string; onload?: () => void }> = [];
    const listeners = new Map<string, (event: unknown) => void>();
    const browser = {
      location: { origin, pathname: `/${CTX.slug}/cricket/scorer/admin` },
      ReactNativeWebView: { postMessage: (message: string) => messages.push(JSON.parse(message)) },
      print: vi.fn(),
    };
    const clipboard = {} as { clipboard?: { writeText: (value: string) => Promise<void> } };
    const urls = { createObjectURL: vi.fn<(blob: unknown) => string>(() => 'blob:scoring-export'), revokeObjectURL: vi.fn() };
    class Reader {
      blob?: unknown;
      result = 'data:text/csv;base64,YSwx';
      onload?: () => void;
      constructor() { readers.push(this); }
      readAsDataURL(blob: unknown) { this.blob = blob; }
    }
    runInNewContext(scoringBrowserScript(CTX, 'workspace-token'), {
      window: browser, navigator: clipboard, URL: urls, FileReader: Reader,
      document: { addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener) },
    });
    return { messages, readers, listeners, browser, clipboard, urls };
  }

  it('supports native clipboard and print actions without injecting a login session', async () => {
    const frame = adapter();
    await frame.clipboard.clipboard?.writeText('https://app.example.com/scorecard');
    frame.browser.print();
    expect(frame.messages).toEqual([
      { type: 'clipboard', token: 'workspace-token', text: 'https://app.example.com/scorecard' },
      { type: 'print', token: 'workspace-token' },
    ]);
  });

  it('preserves a programmatic CSV Blob after its object URL is revoked', () => {
    const frame = adapter();
    const blob = { size: 4, type: 'text/csv' };
    const url = frame.urls.createObjectURL(blob);
    const preventDefault = vi.fn();
    frame.listeners.get('click')?.({ target: { closest: () => ({ href: url, download: 'fixtures.csv' }) }, preventDefault, stopImmediatePropagation: vi.fn() });
    frame.urls.revokeObjectURL(url);
    expect(preventDefault).toHaveBeenCalled();
    expect(frame.readers[0].blob).toBe(blob);
    frame.readers[0].onload?.();
    expect(frame.messages[0]).toEqual({ type: 'download', token: 'workspace-token', name: 'fixtures.csv', dataUrl: 'data:text/csv;base64,YSwx' });
  });

  it('does not install the native adapter on another origin', () => {
    const frame = adapter('https://other.example.com');
    expect(frame.clipboard.clipboard).toBeUndefined();
    expect(frame.listeners.size).toBe(0);
    expect(frame.messages).toHaveLength(0);
  });

  it('bounds exports before moving their bytes across the native bridge', () => {
    const frame = adapter();
    const url = frame.urls.createObjectURL({ size: MAX_WORKSPACE_EXPORT_BYTES + 1 });
    frame.listeners.get('click')?.({ target: { closest: () => ({ href: url, download: 'large.zip' }) }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() });
    expect(frame.readers).toHaveLength(0);
    expect(frame.messages[0]).toMatchObject({ type: 'error' });
  });
});

describe('LAN camera links', () => {
  it('carries private camera-control pairing only in the scanned link', () => {
    const camera = { url: 'rtsp://192.168.1.20:8554/', name: 'Connector', control: { port: 8555, token: 'a'.repeat(36) } };
    expect(parseCameraLink(buildCameraLink(camera))).toEqual(camera);
    expect(parseCameraLink('njslive://camera?u=rtsp%3A%2F%2F192.168.1.20%3A8554%2F&cp=8555&ct=short')?.control).toBeUndefined();
  });
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
