// ============================================================================
// SETTINGS STORE — what the operator chose on this phone (persisted).
// Everything here is either non-secret or a reference to a secret that lives in
// the encrypted store (stream keys are under keyName.streamKey(destinationId)).
// ============================================================================

import { create } from 'zustand';
import { DEFAULT_ORIGIN } from '../config';
import { storage } from '../services/storage';
import { log } from '../services/logger';
import type { LocalOverrides } from '../services/effectiveConfig';
import { defaultScenes, normalizeScenes, type StudioScene } from '../shared/scenes';
import { normalizeScoringWorkspace } from '../shared/scoringWorkspace';
import {
  MAX_STUDIO_DESTINATIONS, STUDIO_PLATFORM_PRESETS,
  type StudioDestination, type StudioGameType, type StudioPairing, type StudioPlatform, type StudioWidget,
} from '../shared/studioProfile';

export type RemoteAction =
  | 'none' | 'toggleLive' | 'toggleMute' | 'switchCamera' | 'toggleOverlays' | 'toggleTorch' | 'toggleRecord'
  | 'nextScene' | 'previousScene';

export const REMOTE_ACTIONS: ReadonlyArray<{ id: RemoteAction; label: string }> = [
  { id: 'none', label: 'Do nothing' },
  { id: 'toggleLive', label: 'Go live / end' },
  { id: 'toggleMute', label: 'Mute microphone' },
  { id: 'switchCamera', label: 'Switch camera' },
  { id: 'toggleOverlays', label: 'Show / hide overlays' },
  { id: 'toggleTorch', label: 'Torch' },
  { id: 'toggleRecord', label: 'Start / stop recording' },
  { id: 'nextScene', label: 'Next scene' },
  { id: 'previousScene', label: 'Previous scene' },
];

export const DEFAULT_REMOTE_KEYS: Record<string, RemoteAction> = {
  MEDIA_PLAY_PAUSE: 'toggleMute',
  HEADSETHOOK: 'toggleMute',
  CAMERA: 'switchCamera',
  BUTTON_A: 'toggleOverlays',
  BUTTON_B: 'toggleTorch',
  VOLUME_UP: 'none',
  VOLUME_DOWN: 'none',
  MEDIA_NEXT: 'nextScene',
  MEDIA_PREVIOUS: 'previousScene',
  BUTTON_R1: 'nextScene',
  BUTTON_L1: 'previousScene',
};

export interface LocalDestination {
  id: string;
  platform: StudioPlatform;
  label: string;
  enabled: boolean;
  /** Full ingest URL for custom RTMP / SRT targets (typed on the phone, never synced). */
  customUrl?: string;
  /** Came from the tournament profile (removed again when the profile drops it). */
  fromProfile: boolean;
  /** YouTube only: create the broadcast through the API, or use a manually pasted stream key. */
  youtubeMode?: 'api' | 'manual';
  youtubePrivacy?: 'public' | 'unlisted' | 'private';
}

export interface Pairing {
  tenantId: string;
  slug: string;
  game: StudioGameType;
  matchId?: string;
}

export interface SettingsData {
  hydrated: boolean;
  origin: string;
  pairing: Pairing | null;
  scoringWorkspace: StudioPairing | null;
  deviceId: string;
  deviceName: string;
  role: 'studio' | 'camera';
  facing: 'back' | 'front';
  video: LocalOverrides['video'];
  audio: LocalOverrides['audio'] & { inputId: number | null };
  overlayRender: 'software' | 'hardware';
  overlayFps: number;
  overlayHidden: Record<string, boolean>;
  overlaysEnabled: boolean;
  customWidgets: StudioWidget[];
  destinations: LocalDestination[];
  remoteKeys: Record<string, RemoteAction>;
  cameraPort: number;
  ytLinked: boolean;
  /** Cameras added by QR or by typing an RTSP address (IP cameras, other phones). */
  manualCameras: Array<{ name: string; url: string }>;
  scenes: StudioScene[];
  activeSceneId: string;
  previewFill: boolean;
}

interface SettingsActions {
  hydrate: () => Promise<void>;
  patch: (partial: Partial<SettingsData>) => void;
  setPairing: (pairing: Pairing | null) => void;
  upsertDestination: (destination: LocalDestination) => void;
  removeDestination: (id: string) => void;
  mergeProfileDestinations: (remote: StudioDestination[]) => void;
}

const STORAGE_KEY = 'settings.v1';

const randomId = () => `dev_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function defaultSettings(): SettingsData {
  return {
    hydrated: false,
    origin: DEFAULT_ORIGIN,
    pairing: null,
    scoringWorkspace: null,
    deviceId: randomId(),
    deviceName: 'Phone',
    role: 'studio',
    facing: 'back',
    video: { presetId: null, codec: null, adaptive: null, record: null, stabilization: null, orientation: null, bitrateKbps: null },
    audio: { bitrateKbps: null, stereo: null, echo: null, noise: null, inputId: null },
    overlayRender: 'software',
    overlayFps: 15,
    overlayHidden: {},
    overlaysEnabled: true,
    customWidgets: [],
    destinations: [],
    remoteKeys: { ...DEFAULT_REMOTE_KEYS },
    cameraPort: 8554,
    ytLinked: false,
    manualCameras: [],
    scenes: defaultScenes(),
    activeSceneId: 'main',
    previewFill: true,
  };
}

/**
 * Reconcile the tournament profile's destinations with the local list: keep local
 * keys/URLs, add new profile destinations, drop profile ones that were removed.
 */
export function mergeDestinations(local: LocalDestination[], remote: StudioDestination[]): LocalDestination[] {
  const remoteIds = new Set(remote.map(destination => destination.id));
  const kept = local.filter(destination => !destination.fromProfile || remoteIds.has(destination.id));
  const byId = new Map(kept.map(destination => [destination.id, destination]));
  for (const item of remote) {
    const existing = byId.get(item.id);
    if (existing) {
      byId.set(item.id, { ...existing, platform: item.platform, label: item.label, enabled: existing.fromProfile ? item.enabled : existing.enabled });
    } else {
      byId.set(item.id, {
        id: item.id, platform: item.platform, label: item.label, enabled: item.enabled, fromProfile: true,
        youtubeMode: item.platform === 'youtube' ? 'api' : undefined, youtubePrivacy: item.platform === 'youtube' ? 'unlisted' : undefined,
      });
    }
  }
  return [...byId.values()].slice(0, MAX_STUDIO_DESTINATIONS + 2);
}

export function newLocalDestination(platform: StudioPlatform): LocalDestination {
  return {
    id: `${platform}_${Math.random().toString(36).slice(2, 7)}`,
    platform,
    label: STUDIO_PLATFORM_PRESETS[platform].label,
    enabled: true,
    fromProfile: false,
    youtubeMode: platform === 'youtube' ? 'api' : undefined,
    youtubePrivacy: platform === 'youtube' ? 'unlisted' : undefined,
  };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettings = create<SettingsData & SettingsActions>((set, get) => {
  const persist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const data = Object.fromEntries(Object.entries(get()).filter(([key, value]) => key !== 'hydrated' && typeof value !== 'function'));
      storage.setJson(STORAGE_KEY, data).catch(error => log.warn('settings', error));
    }, 300);
  };

  return {
    ...defaultSettings(),

    hydrate: async () => {
      const stored = await storage.getJson<Partial<SettingsData> | null>(STORAGE_KEY, null);
      const base = defaultSettings();
      const scenes = normalizeScenes(stored?.scenes, stored?.facing ?? base.facing);
      set({
        ...base,
        ...(stored ?? {}),
        video: { ...base.video, ...(stored?.video ?? {}) },
        audio: { ...base.audio, ...(stored?.audio ?? {}) },
        remoteKeys: { ...DEFAULT_REMOTE_KEYS, ...(stored?.remoteKeys ?? {}) },
        deviceId: stored?.deviceId ?? base.deviceId,
        scenes,
        activeSceneId: scenes.some(scene => scene.id === stored?.activeSceneId) ? stored!.activeSceneId! : scenes[0].id,
        scoringWorkspace: normalizeScoringWorkspace(stored?.scoringWorkspace),
        hydrated: true,
      });
      if (!stored) persist();
    },

    patch: partial => { set(partial); persist(); },

    setPairing: pairing => { set({ pairing }); persist(); },

    upsertDestination: destination => {
      const current = get().destinations;
      const exists = current.some(item => item.id === destination.id);
      set({ destinations: exists ? current.map(item => (item.id === destination.id ? destination : item)) : [...current, destination] });
      persist();
    },

    removeDestination: id => { set({ destinations: get().destinations.filter(item => item.id !== id) }); persist(); },

    mergeProfileDestinations: remote => {
      const merged = mergeDestinations(get().destinations, remote);
      if (JSON.stringify(merged) !== JSON.stringify(get().destinations)) { set({ destinations: merged }); persist(); }
    },
  };
});
