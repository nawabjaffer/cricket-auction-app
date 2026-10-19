// ============================================================================
// NJS LIVE STUDIO — SHARED CONTRACT
// Single source of truth for the data the web admin (Mobile Studio page) and the
// Android app exchange through RTDB, deep links and the release manifest.
//
// Keep this file dependency-free and `erasableSyntaxOnly`-compatible: it is
// compiled by Vite/tsc (web) and by Metro/Hermes (React Native).
//
// SECURITY: RTDB is world-readable/writable. Nothing in here may carry a secret:
//   • stream keys and OAuth tokens live only in the phone's encrypted storage;
//   • remote destinations carry no URL (ingest hosts come from fixed platform
//     presets or from what the operator types on the phone), so a tampered
//     profile can never redirect a stream key to another server;
//   • widget URLs are restricted to http(s).
// ============================================================================

export const STUDIO_PROFILE_VERSION = 1;
export const STUDIO_APP_ID = 'com.njsstore.livestudio';
export const STUDIO_DEEP_LINK_SCHEME = 'njslive';
export const STUDIO_APK_FILE = 'njs-live-studio.apk';
export const STUDIO_RELEASE_DIR = '/downloads/android';

// ── Games ────────────────────────────────────────────────────────────────────

export type StudioGameType = 'cricket' | 'football' | 'kabaddi' | 'carrom';

export const STUDIO_GAME_TYPES: readonly StudioGameType[] = ['cricket', 'football', 'kabaddi', 'carrom'];

export const STUDIO_GAME_LABELS: Record<StudioGameType, string> = {
  cricket: 'Cricket',
  football: 'Football',
  kabaddi: 'Kabaddi',
  carrom: 'Carrom',
};

export function isStudioGameType(value: unknown): value is StudioGameType {
  return typeof value === 'string' && (STUDIO_GAME_TYPES as readonly string[]).includes(value);
}

/** RTDB namespace of a sport under `tenants/{id}/` — cricket scoring lives in `scoring`. */
export function studioSportNamespace(game: StudioGameType): string {
  return game === 'cricket' ? 'scoring' : game;
}

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function isSafeStudioId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

// ── RTDB paths ───────────────────────────────────────────────────────────────

export function studioProfilePath(tenantId: string, game: StudioGameType): string {
  return `tenants/${tenantId}/mobileStudio/${game}/profile`;
}

export function studioDevicesPath(tenantId: string, game: StudioGameType): string {
  return `tenants/${tenantId}/mobileStudio/${game}/devices`;
}

export function studioMatchIndexPath(tenantId: string, game: StudioGameType): string {
  return `tenants/${tenantId}/${studioSportNamespace(game)}/matchIndex`;
}

export function studioMatchSetupPath(tenantId: string, game: StudioGameType, matchId: string): string {
  return `tenants/${tenantId}/${studioSportNamespace(game)}/matches/${matchId}/setup`;
}

export function studioActiveMatchPath(tenantId: string, game: StudioGameType): string {
  return `tenants/${tenantId}/${studioSportNamespace(game)}/activeMatch/matchId`;
}

/** Same node the web multi-camera host reads (`multiCamService`). */
export function studioLiveCamPath(tenantId: string, game: StudioGameType, matchId: string): string {
  return `tenants/${tenantId}/${studioSportNamespace(game)}/matches/${matchId}/liveCam`;
}

// ── Streaming platforms ──────────────────────────────────────────────────────

export type StudioPlatform = 'youtube' | 'facebook' | 'twitch' | 'rtmp' | 'srt';
export type StudioProtocol = 'rtmp' | 'rtmps' | 'srt';

export interface StudioPlatformPreset {
  id: StudioPlatform;
  label: string;
  protocol: StudioProtocol;
  /** Fixed ingest URL (without the stream key). Empty when the operator supplies it on the phone. */
  ingestUrl: string;
  /** The operator must type the full ingest URL on the phone (custom RTMP / SRT). */
  customUrl: boolean;
  /** Google account linking can create the broadcast and stream key automatically. */
  supportsAccountLink: boolean;
  keyHint: string;
  maxHeight: number;
}

export const STUDIO_PLATFORM_PRESETS: Record<StudioPlatform, StudioPlatformPreset> = {
  youtube: {
    id: 'youtube', label: 'YouTube Live', protocol: 'rtmps', ingestUrl: 'rtmps://a.rtmps.youtube.com:443/live2',
    customUrl: false, supportsAccountLink: true, keyHint: 'YouTube Studio → Go live → Stream key', maxHeight: 2160,
  },
  facebook: {
    id: 'facebook', label: 'Facebook Live', protocol: 'rtmps', ingestUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
    customUrl: false, supportsAccountLink: false, keyHint: 'Live Producer → Streaming software → Stream key', maxHeight: 1080,
  },
  twitch: {
    id: 'twitch', label: 'Twitch', protocol: 'rtmp', ingestUrl: 'rtmp://live.twitch.tv/app',
    customUrl: false, supportsAccountLink: false, keyHint: 'Creator Dashboard → Settings → Stream → Primary stream key', maxHeight: 1080,
  },
  rtmp: {
    id: 'rtmp', label: 'Custom RTMP / RTMPS', protocol: 'rtmp', ingestUrl: '',
    customUrl: true, supportsAccountLink: false, keyHint: 'Server URL + stream key from your provider (Restream, Castr, Instagram Live Producer, TikTok, Kick, LinkedIn…)', maxHeight: 2160,
  },
  srt: {
    id: 'srt', label: 'SRT', protocol: 'srt', ingestUrl: '',
    customUrl: true, supportsAccountLink: false, keyHint: 'srt://host:port?streamid=… (add &passphrase=… when the server requires encryption)', maxHeight: 2160,
  },
};

export const STUDIO_PLATFORMS: readonly StudioPlatform[] = ['youtube', 'facebook', 'twitch', 'rtmp', 'srt'];

export function isStudioPlatform(value: unknown): value is StudioPlatform {
  return typeof value === 'string' && (STUDIO_PLATFORMS as readonly string[]).includes(value);
}

/** Destination as stored in RTDB — deliberately free of any URL or key. */
export interface StudioDestination {
  id: string;
  platform: StudioPlatform;
  label: string;
  enabled: boolean;
}

export const MAX_STUDIO_DESTINATIONS = 4;

// ── Video / audio presets ────────────────────────────────────────────────────

export type StudioCodec = 'h264' | 'h265';

export interface StudioVideoPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  /** Default (and adaptive ceiling) in kbit/s. */
  bitrateKbps: number;
  minBitrateKbps: number;
  maxBitrateKbps: number;
}

// Bitrate ranges follow YouTube's recommended H.264 live ingest table.
export const STUDIO_VIDEO_PRESETS: readonly StudioVideoPreset[] = [
  { id: '720p30', label: '720p · 30 fps', width: 1280, height: 720, fps: 30, bitrateKbps: 3500, minBitrateKbps: 1500, maxBitrateKbps: 4000 },
  { id: '720p60', label: '720p · 60 fps', width: 1280, height: 720, fps: 60, bitrateKbps: 5000, minBitrateKbps: 2250, maxBitrateKbps: 6000 },
  { id: '1080p30', label: '1080p · 30 fps', width: 1920, height: 1080, fps: 30, bitrateKbps: 6000, minBitrateKbps: 3000, maxBitrateKbps: 9000 },
  { id: '1080p60', label: '1080p · 60 fps', width: 1920, height: 1080, fps: 60, bitrateKbps: 9000, minBitrateKbps: 4500, maxBitrateKbps: 13000 },
  { id: '1440p30', label: '1440p · 30 fps', width: 2560, height: 1440, fps: 30, bitrateKbps: 12000, minBitrateKbps: 6000, maxBitrateKbps: 16000 },
  { id: '2160p30', label: '4K · 30 fps', width: 3840, height: 2160, fps: 30, bitrateKbps: 20000, minBitrateKbps: 13000, maxBitrateKbps: 34000 },
  { id: '2160p60', label: '4K · 60 fps', width: 3840, height: 2160, fps: 60, bitrateKbps: 35000, minBitrateKbps: 20000, maxBitrateKbps: 51000 },
];

export const DEFAULT_STUDIO_VIDEO_PRESET_ID = '1080p30';

export function findStudioVideoPreset(id: unknown): StudioVideoPreset {
  return STUDIO_VIDEO_PRESETS.find(preset => preset.id === id)
    ?? STUDIO_VIDEO_PRESETS.find(preset => preset.id === DEFAULT_STUDIO_VIDEO_PRESET_ID)
    ?? STUDIO_VIDEO_PRESETS[0];
}

export interface StudioVideoSettings {
  presetId: string;
  codec: StudioCodec;
  /** Lower the bitrate automatically while the uplink is congested. */
  adaptiveBitrate: boolean;
  /** Keep a local MP4 copy while streaming. */
  recordLocal: boolean;
  stabilization: boolean;
  orientation: 'landscape' | 'portrait';
}

export interface StudioAudioSettings {
  bitrateKbps: number;
  sampleRate: 44100 | 48000;
  stereo: boolean;
  echoCanceler: boolean;
  noiseSuppressor: boolean;
}

// ── Overlay widgets ──────────────────────────────────────────────────────────

export type StudioWidgetKind = 'web' | 'image';
export type StudioWidgetAnchor =
  | 'full' | 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export const STUDIO_WIDGET_ANCHORS: readonly StudioWidgetAnchor[] = [
  'full', 'top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right',
];

export interface StudioWidget {
  id: string;
  label: string;
  kind: StudioWidgetKind;
  /** http(s) URL; may contain {origin} {slug} {tenantId} {game} {matchId} {matchQuery}. */
  url: string;
  enabled: boolean;
  anchor: StudioWidgetAnchor;
  /** Width of the widget as a percentage of the video frame (5–100). */
  widthPct: number;
  /** 0–1. */
  opacity: number;
  /** Size the page is laid out at before it is scaled into the frame. */
  pageWidth: number;
  pageHeight: number;
}

export const MAX_STUDIO_WIDGETS = 6;
export const DEFAULT_OVERLAY_URL_TEMPLATE = '{origin}/{slug}/{game}/scorer/obs-overlay{matchQuery}';

export interface StudioProfile {
  version: number;
  name: string;
  updatedAt: number;
  video: StudioVideoSettings;
  audio: StudioAudioSettings;
  widgets: StudioWidget[];
  destinations: StudioDestination[];
  /** Broadcast title; {teamA} {teamB} {tournament} {stage} {game} {date} are replaced. */
  titleTemplate: string;
}

export const DEFAULT_STUDIO_TITLE_TEMPLATE = '{teamA} vs {teamB} · {tournament} LIVE';

export function defaultStudioWidgets(): StudioWidget[] {
  return [{
    id: 'scoreboard',
    label: 'Scoreboard overlay',
    kind: 'web',
    url: DEFAULT_OVERLAY_URL_TEMPLATE,
    enabled: true,
    anchor: 'full',
    widthPct: 100,
    opacity: 1,
    pageWidth: 1920,
    pageHeight: 1080,
  }];
}

export function defaultStudioProfile(game: StudioGameType): StudioProfile {
  return {
    version: STUDIO_PROFILE_VERSION,
    name: `${STUDIO_GAME_LABELS[game]} studio`,
    updatedAt: 0,
    video: {
      presetId: DEFAULT_STUDIO_VIDEO_PRESET_ID,
      codec: 'h264',
      adaptiveBitrate: true,
      recordLocal: false,
      stabilization: true,
      orientation: 'landscape',
    },
    audio: { bitrateKbps: 128, sampleRate: 48000, stereo: true, echoCanceler: false, noiseSuppressor: false },
    widgets: defaultStudioWidgets(),
    destinations: [{ id: 'youtube', platform: 'youtube', label: 'YouTube Live', enabled: true }],
    titleTemplate: DEFAULT_STUDIO_TITLE_TEMPLATE,
  };
}

// ── Normalisation (RTDB drops empty arrays and may return arrays as objects) ──

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter(item => item !== null && item !== undefined);
  if (value !== null && typeof value === 'object') return Object.values(value as Record<string, unknown>).filter(item => item !== null && item !== undefined);
  return [];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanText(value: unknown, fallback: string, maxLength = 80): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

/** Returns the URL when it is http(s) (or contains tokens that expand to one), else null. */
export function sanitizeWidgetUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 600 || /[\u0000-\u001f\u007f\s]/.test(trimmed)) return null;
  if (/^\{origin\}/.test(trimmed)) return trimmed;
  return /^https?:\/\/[^/\s]+/i.test(trimmed) ? trimmed : null;
}

/** True when an editor draft has a widget the phone would refuse to load (bad URL or empty name). */
export function studioProfileHasErrors(profile: Pick<StudioProfile, 'widgets'>): boolean {
  return profile.widgets.some(widget => sanitizeWidgetUrl(widget.url) === null || !widget.label.trim());
}

function normalizeWidget(raw: unknown, index: number, seen: Set<string>): StudioWidget | null {
  const item = asRecord(raw);
  const url = sanitizeWidgetUrl(item.url);
  if (!url) return null;
  let id = isSafeStudioId(item.id) ? item.id : `widget${index + 1}`;
  while (seen.has(id)) id = `${id}_${index}`;
  seen.add(id);
  const anchor = (STUDIO_WIDGET_ANCHORS as readonly string[]).includes(item.anchor as string) ? item.anchor as StudioWidgetAnchor : 'full';
  const full = anchor === 'full';
  return {
    id,
    label: cleanText(item.label, 'Overlay', 40),
    kind: item.kind === 'image' ? 'image' : 'web',
    url,
    enabled: item.enabled !== false,
    anchor,
    widthPct: full ? 100 : clampNumber(item.widthPct, 5, 100, 25),
    opacity: clampNumber(item.opacity, 0, 1, 1),
    pageWidth: Math.round(clampNumber(item.pageWidth, 160, 3840, 1920)),
    pageHeight: Math.round(clampNumber(item.pageHeight, 90, 2160, 1080)),
  };
}

function normalizeDestination(raw: unknown, index: number, seen: Set<string>): StudioDestination | null {
  const item = asRecord(raw);
  if (!isStudioPlatform(item.platform)) return null;
  let id = isSafeStudioId(item.id) ? item.id : `${item.platform}${index + 1}`;
  while (seen.has(id)) id = `${id}_${index}`;
  seen.add(id);
  return {
    id,
    platform: item.platform,
    label: cleanText(item.label, STUDIO_PLATFORM_PRESETS[item.platform].label, 40),
    enabled: item.enabled !== false,
  };
}

export function normalizeStudioProfile(raw: unknown, game: StudioGameType): StudioProfile {
  const base = defaultStudioProfile(game);
  const input = asRecord(raw);
  if (Object.keys(input).length === 0) return base;

  const video = asRecord(input.video);
  const audio = asRecord(input.audio);
  const preset = findStudioVideoPreset(video.presetId);

  const widgetSeen = new Set<string>();
  const widgets = asList(input.widgets)
    .map((item, index) => normalizeWidget(item, index, widgetSeen))
    .filter((item): item is StudioWidget => item !== null)
    .slice(0, MAX_STUDIO_WIDGETS);

  const destinationSeen = new Set<string>();
  const destinations = asList(input.destinations)
    .map((item, index) => normalizeDestination(item, index, destinationSeen))
    .filter((item): item is StudioDestination => item !== null)
    .slice(0, MAX_STUDIO_DESTINATIONS);

  // RTDB drops empty arrays, so a saved profile (updatedAt > 0) with no `widgets` key means "none".
  const saved = Number(input.updatedAt) > 0;

  return {
    version: STUDIO_PROFILE_VERSION,
    name: cleanText(input.name, base.name, 60),
    updatedAt: clampNumber(input.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    video: {
      presetId: preset.id,
      codec: video.codec === 'h265' ? 'h265' : 'h264',
      adaptiveBitrate: video.adaptiveBitrate !== false,
      recordLocal: video.recordLocal === true,
      stabilization: video.stabilization !== false,
      orientation: video.orientation === 'portrait' ? 'portrait' : 'landscape',
    },
    audio: {
      bitrateKbps: Math.round(clampNumber(audio.bitrateKbps, 64, 320, 128)),
      sampleRate: audio.sampleRate === 44100 ? 44100 : 48000,
      stereo: audio.stereo !== false,
      echoCanceler: audio.echoCanceler === true,
      noiseSuppressor: audio.noiseSuppressor === true,
    },
    widgets: 'widgets' in input || saved ? widgets : base.widgets,
    destinations: 'destinations' in input || saved ? destinations : base.destinations,
    titleTemplate: cleanText(input.titleTemplate, DEFAULT_STUDIO_TITLE_TEMPLATE, 120),
  };
}

// ── Context + URL building ───────────────────────────────────────────────────

export interface StudioContext {
  origin: string;
  tenantId: string;
  slug: string;
  game: StudioGameType;
  matchId?: string;
}

/** Just enough of any sport's `matches/{id}/setup` to pick and title a match. */
export interface StudioMatchSummary {
  id: string;
  title: string;
  teamA: string;
  teamB: string;
  status: string;
  stage?: string;
  createdAt: number;
  scheduledAt?: number;
}

export function summarizeMatchSetup(id: string, raw: unknown): StudioMatchSummary | null {
  if (!isSafeStudioId(id)) return null;
  const setup = asRecord(raw);
  const teamA = cleanText(asRecord(setup.teamA).name, '', 60);
  const teamB = cleanText(asRecord(setup.teamB).name, '', 60);
  if (!teamA && !teamB) return null;
  const stage = cleanText(setup.stage ?? setup.competition, '', 40);
  return {
    id,
    title: `${teamA || 'TBD'} vs ${teamB || 'TBD'}`,
    teamA,
    teamB,
    status: typeof setup.status === 'string' ? setup.status : 'scheduled',
    stage: stage || undefined,
    createdAt: clampNumber(setup.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    scheduledAt: setup.scheduledAt === undefined ? undefined : clampNumber(setup.scheduledAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

const STATUS_RANK: Record<string, number> = { live: 0, scheduled: 1, completed: 2, abandoned: 3 };

/** Live first, then upcoming, then finished; newest first inside each group. */
export function sortMatchSummaries(matches: StudioMatchSummary[]): StudioMatchSummary[] {
  return [...matches].sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 4) - (STATUS_RANK[b.status] ?? 4);
    return rank !== 0 ? rank : (b.scheduledAt ?? b.createdAt) - (a.scheduledAt ?? a.createdAt);
  });
}

/** Trims to scheme://host[:port] and rejects anything that is not http(s). */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(https?):\/\/([^/?#\s]+)/i.exec(value.trim());
  return match ? `${match[1].toLowerCase()}://${match[2]}` : null;
}

/** Expands the {tokens} in a widget URL; returns null when the result is not an http(s) URL. */
export function resolveWidgetUrl(template: string, ctx: StudioContext): string | null {
  const origin = normalizeOrigin(ctx.origin);
  if (!origin) return null;
  const matchQuery = ctx.matchId && isSafeStudioId(ctx.matchId) ? `?matchId=${encodeURIComponent(ctx.matchId)}&pin=1` : '';
  const values: Record<string, string> = {
    origin,
    slug: encodeURIComponent(ctx.slug),
    tenantId: encodeURIComponent(ctx.tenantId),
    game: ctx.game,
    matchId: ctx.matchId && isSafeStudioId(ctx.matchId) ? encodeURIComponent(ctx.matchId) : '',
    matchQuery,
  };
  const url = template.replace(/\{(origin|slug|tenantId|game|matchId|matchQuery)\}/g, (_token, key: string) => values[key] ?? '');
  return /^https?:\/\/[^/\s]+/i.test(url) ? url : null;
}

export interface StudioTitleVars {
  teamA?: string;
  teamB?: string;
  tournament?: string;
  stage?: string;
  game?: string;
  date?: string;
}

export function resolveStudioTitle(template: string, vars: StudioTitleVars): string {
  // Without team names the "{teamA} vs {teamB}" pair would leave a dangling "vs".
  const hasTeams = Boolean(vars.teamA || vars.teamB);
  const source = hasTeams ? template : template.replace(/\{teamA\}\s*(?:vs\.?|v)\s*\{teamB\}/gi, '');
  const text = source
    .replace(/\{(teamA|teamB|tournament|stage|game|date)\}/g, (_token, key: keyof StudioTitleVars) => vars[key] ?? '')
    .replace(/\s+/g, ' ')
    // Collapse separator runs left behind by empty variables ("A · · LIVE" → "A · LIVE").
    .replace(/(?:\s*[·|–—-]\s*){2,}/g, ' · ')
    .replace(/^[\s·|–—-]+|[\s·|–—-]+$/g, '');
  return (text || 'Live match').slice(0, 100);
}

// ── Pairing deep link ────────────────────────────────────────────────────────

export interface StudioPairing {
  origin: string;
  /** Empty when parsed from the https page URL (only the slug is known); resolve it via the tenant registry. */
  tenantId: string;
  slug: string;
  game: StudioGameType;
  matchId?: string;
}

/** `njslive://pair?o=…&t=…&s=…&g=…[&m=…]` — opens the app straight into this tournament. */
export function buildPairingLink(pairing: StudioPairing): string {
  const params = [
    `o=${encodeURIComponent(pairing.origin)}`,
    `t=${encodeURIComponent(pairing.tenantId)}`,
    `s=${encodeURIComponent(pairing.slug)}`,
    `g=${pairing.game}`,
  ];
  if (pairing.matchId) params.push(`m=${encodeURIComponent(pairing.matchId)}`);
  return `${STUDIO_DEEP_LINK_SCHEME}://pair?${params.join('&')}`;
}

/** Page a phone lands on when it scans the QR without the app installed. */
export function buildPairingPageUrl(pairing: StudioPairing): string {
  const base = `${pairing.origin}/${encodeURIComponent(pairing.slug)}/${pairing.game}/scorer/mobile-app`;
  return pairing.matchId ? `${base}?matchId=${encodeURIComponent(pairing.matchId)}&pair=1` : `${base}?pair=1`;
}

function readQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decodeURIComponentSafe(eq === -1 ? part : part.slice(0, eq));
    const value = eq === -1 ? '' : decodeURIComponentSafe(part.slice(eq + 1).replace(/\+/g, ' '));
    if (key) out[key] = value;
  }
  return out;
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** Accepts the `njslive://pair` deep link or the https pairing page URL; returns null for anything malformed. */
export function parsePairingLink(link: string): StudioPairing | null {
  if (typeof link !== 'string') return null;
  const trimmed = link.trim();
  const deep = new RegExp(`^${STUDIO_DEEP_LINK_SCHEME}://pair\\?(.*)$`, 'i').exec(trimmed);
  if (deep) {
    const q = readQuery(deep[1].split('#')[0]);
    const origin = normalizeOrigin(q.o);
    if (!origin || !isSafeStudioId(q.t) || !isStudioGameType(q.g)) return null;
    const slug = isSafeStudioId(q.s) ? q.s : q.t;
    const matchId = q.m && isSafeStudioId(q.m) ? q.m : undefined;
    return { origin, tenantId: q.t, slug, game: q.g, matchId };
  }
  const page = /^(https?:\/\/[^/?#\s]+)\/([a-zA-Z0-9_-]{1,64})\/(cricket|football|kabaddi|carrom)\/scorer\/mobile-app(?:\?([^#]*))?/i.exec(trimmed);
  if (page) {
    const origin = normalizeOrigin(page[1]);
    if (!origin) return null;
    const q = readQuery(page[4] ?? '');
    const matchId = q.matchId && isSafeStudioId(q.matchId) ? q.matchId : undefined;
    // The https page only knows the slug; an empty tenantId tells the app to resolve it from the registry.
    return { origin, tenantId: '', slug: page[2], game: page[3].toLowerCase() as StudioGameType, matchId };
  }
  return null;
}

// ── Release manifest (public/downloads/android/latest.json) ──────────────────

export type StudioReleaseChannel = 'stable' | 'testing';

export interface StudioReleaseManifest {
  schema: 1;
  appId: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  file: string;
  size: number;
  sha256: string;
  builtAt: string;
  channel?: StudioReleaseChannel;
  signing?: 'release' | 'development';
  /** SHA-256 / SHA-1 of the APK signing certificate (register the SHA-1 for Google sign-in). */
  signerSha256?: string;
  signerSha1?: string;
  abis?: string[];
  notes?: string[];
}

const HEX_64 = /^[a-f0-9]{64}$/i;

export function parseReleaseManifest(raw: unknown): StudioReleaseManifest | null {
  const item = asRecord(raw);
  if (item.schema !== 1) return null;
  if (item.channel !== undefined && item.channel !== 'stable' && item.channel !== 'testing') return null;
  if (item.signing !== undefined && item.signing !== 'release' && item.signing !== 'development') return null;
  const versionCode = Number(item.versionCode);
  const size = Number(item.size);
  const minSdk = Number(item.minSdk);
  if (item.appId !== STUDIO_APP_ID || typeof item.versionName !== 'string') return null;
  if (typeof item.file !== 'string' || !/^[\w.-]+\.apk$/i.test(item.file)) return null;
  if (typeof item.sha256 !== 'string' || !HEX_64.test(item.sha256)) return null;
  if (!Number.isInteger(versionCode) || versionCode < 1 || !Number.isFinite(size) || size <= 0) return null;
  const optionalHex = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
  return {
    schema: 1,
    appId: item.appId,
    versionName: item.versionName.slice(0, 32),
    versionCode,
    minSdk: Number.isFinite(minSdk) && minSdk > 0 ? minSdk : 24,
    file: item.file,
    size,
    sha256: item.sha256.toLowerCase(),
    builtAt: typeof item.builtAt === 'string' ? item.builtAt : '',
    channel: item.channel === 'testing' ? 'testing' : 'stable',
    signing: item.signing === 'development' ? 'development' : item.signing === 'release' ? 'release' : undefined,
    signerSha256: optionalHex(item.signerSha256),
    signerSha1: optionalHex(item.signerSha1),
    abis: asList(item.abis).filter((abi): abi is string => typeof abi === 'string').slice(0, 8),
    notes: asList(item.notes).filter((note): note is string => typeof note === 'string').slice(0, 12),
  };
}

export function releaseManifestUrl(origin: string, channel: StudioReleaseChannel = 'stable'): string {
  return `${origin}${STUDIO_RELEASE_DIR}${channel === 'testing' ? '/testing' : ''}/latest.json`;
}

export function releaseApkUrl(origin: string, manifest: Pick<StudioReleaseManifest, 'file' | 'channel'>): string {
  return `${origin}${STUDIO_RELEASE_DIR}${manifest.channel === 'testing' ? '/testing' : ''}/${manifest.file}`;
}

/** Android 7.0 = API 24 … */
export function androidVersionLabel(minSdk: number): string {
  const names: Record<number, string> = {
    24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16',
  };
  return names[minSdk] ? `Android ${names[minSdk]}+` : `Android API ${minSdk}+`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

// ── LAN camera link (QR shown by a camera phone, scanned by the studio phone) ─

export const STUDIO_RTSP_PORT = 8554;

const RTSP_URL = /^rtsp:\/\/(?:[\w.~%-]+(?::[^@/\s]*)?@)?(?:(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9][a-z0-9.-]*|\[[0-9a-f:]+\])(?::\d{2,5})?(?:\/[\w./%~+=&?-]*)?$/i;

export function isValidRtspUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && RTSP_URL.test(value);
}

export interface StudioCameraLink {
  /** Pull URL, e.g. rtsp://192.168.1.20:8554/ */
  url: string;
  name: string;
  matchId?: string;
}

/** `njslive://camera?u=…&n=…[&m=…]` — what a camera phone shows as a QR for the studio phone to scan. */
export function buildCameraLink(link: StudioCameraLink): string {
  const params = [`u=${encodeURIComponent(link.url)}`, `n=${encodeURIComponent(link.name)}`];
  if (link.matchId) params.push(`m=${encodeURIComponent(link.matchId)}`);
  return `${STUDIO_DEEP_LINK_SCHEME}://camera?${params.join('&')}`;
}

/** Accepts the camera deep link or a bare rtsp:// URL (e.g. typed by hand or from an IP camera). */
export function parseCameraLink(raw: string): StudioCameraLink | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (isValidRtspUrl(trimmed)) {
    const host = /^rtsp:\/\/(?:[^@/]*@)?([^/:]+)/i.exec(trimmed)?.[1] ?? 'Camera';
    return { url: trimmed, name: cleanText(host, 'Camera', 40) };
  }
  const deep = new RegExp(`^${STUDIO_DEEP_LINK_SCHEME}://camera\\?(.*)$`, 'i').exec(trimmed);
  if (!deep) return null;
  const q = readQuery(deep[1].split('#')[0]);
  if (!isValidRtspUrl(q.u)) return null;
  return {
    url: q.u,
    name: cleanText(q.n, 'Camera', 40),
    matchId: q.m && isSafeStudioId(q.m) ? q.m : undefined,
  };
}

// ── Device presence (phones report here so the admin can see them) ───────────

export type StudioDeviceRole = 'studio' | 'camera';
export type StudioDeviceState = 'idle' | 'preview' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface StudioDevicePresence {
  id: string;
  name: string;
  role: StudioDeviceRole;
  state: StudioDeviceState;
  appVersion: string;
  lastSeen: number;
  battery?: number;
  charging?: boolean;
  resolution?: string;
  bitrateKbps?: number;
  matchId?: string;
  lanUrl?: string;
}

export const STUDIO_HEARTBEAT_MS = 5000;
export const STUDIO_DEVICE_STALE_MS = STUDIO_HEARTBEAT_MS * 4;

export function isDeviceOnline(device: Pick<StudioDevicePresence, 'lastSeen'>, now = Date.now()): boolean {
  return now - (device.lastSeen || 0) < STUDIO_DEVICE_STALE_MS;
}

const DEVICE_STATES: readonly StudioDeviceState[] = ['idle', 'preview', 'connecting', 'live', 'reconnecting', 'error'];

export function normalizeDevices(raw: unknown): StudioDevicePresence[] {
  return asList(raw)
    .map((entry): StudioDevicePresence | null => {
      const item = asRecord(entry);
      if (!isSafeStudioId(item.id)) return null;
      return {
        id: item.id,
        name: cleanText(item.name, 'Phone', 40),
        role: item.role === 'camera' ? 'camera' : 'studio',
        state: DEVICE_STATES.includes(item.state as StudioDeviceState) ? item.state as StudioDeviceState : 'idle',
        appVersion: cleanText(item.appVersion, '?', 20),
        lastSeen: clampNumber(item.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
        battery: item.battery === undefined ? undefined : Math.round(clampNumber(item.battery, 0, 100, 0)),
        charging: typeof item.charging === 'boolean' ? item.charging : undefined,
        resolution: typeof item.resolution === 'string' ? item.resolution.slice(0, 24) : undefined,
        bitrateKbps: item.bitrateKbps === undefined ? undefined : Math.round(clampNumber(item.bitrateKbps, 0, 200000, 0)),
        matchId: isSafeStudioId(item.matchId) ? item.matchId : undefined,
        lanUrl: isValidRtspUrl(item.lanUrl) ? item.lanUrl : undefined,
      };
    })
    .filter((device): device is StudioDevicePresence => device !== null)
    .sort((a, b) => b.lastSeen - a.lastSeen);
}
