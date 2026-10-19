// Runtime (non-persisted) state: engine status, live stats, tournament data and device health.
import { create } from 'zustand';
import type {
  BatterySnapshot, DestinationState, DeviceCapabilities, EngineMode, EngineState, EngineStats, LanService, NetworkSnapshot,
} from '../native';
import type { EffectiveVideo } from '../services/effectiveConfig';
import type { ProgramState, RemoteCameraSource } from '../services/liveCam';
import type { TenantInfo } from '../services/tournament';
import type { StudioMatchSummary, StudioProfile } from '../shared/studioProfile';

export interface DestinationRuntime { state: DestinationState; reason?: string; attempt?: number }

export interface LiveSession {
  startedAt: number;
  watchUrls: string[];
  recordingPath?: string;
  youtube?: { broadcastId: string; streamId: string };
}

export interface LanCamera extends LanService {
  /** rtsp:// pull URL derived from host + port. */
  url: string;
}

export type ProgramSource = { kind: 'local' } | { kind: 'peer'; url: string; name: string };

export interface AppInfo { versionName: string; versionCode: number; packageName: string; sdk: number; model: string; developmentSigned?: boolean; signerSha256?: string }

export interface StudioRuntime {
  appInfo: AppInfo | null;
  engineState: EngineState;
  engineMode: EngineMode | 'none';
  engineMessage?: string;
  preparedSignature: string | null;
  capabilities: DeviceCapabilities | null;
  effective: EffectiveVideo | null;
  profile: StudioProfile | null;
  tenant: TenantInfo | null;
  matches: StudioMatchSummary[];
  activeMatchId: string | null;
  stats: EngineStats | null;
  destinations: Record<string, DestinationRuntime>;
  session: LiveSession | null;
  error: string | null;
  notice: string | null;
  network: NetworkSnapshot | null;
  battery: BatterySnapshot | null;
  thermal: number;
  lanCameras: LanCamera[];
  remoteSources: RemoteCameraSource[];
  program: ProgramState;
  programSource: ProgramSource;
  cameraServerUrl: string | null;
  cameraClients: number;
  scenePreviews: Record<string, string>;
  patch: (partial: Partial<StudioRuntime>) => void;
  setDestination: (id: string, value: DestinationRuntime) => void;
  clearDestinations: () => void;
}

export const useStudio = create<StudioRuntime>(set => ({
  appInfo: null,
  engineState: 'idle',
  engineMode: 'none',
  preparedSignature: null,
  capabilities: null,
  effective: null,
  profile: null,
  tenant: null,
  matches: [],
  activeMatchId: null,
  stats: null,
  destinations: {},
  session: null,
  error: null,
  notice: null,
  network: null,
  battery: null,
  thermal: 0,
  lanCameras: [],
  remoteSources: [],
  program: { activeSourceId: null, updatedAt: 0 },
  programSource: { kind: 'local' },
  cameraServerUrl: null,
  cameraClients: 0,
  scenePreviews: {},
  patch: partial => set(partial),
  setDestination: (id, value) => set(state => ({ destinations: { ...state.destinations, [id]: value } })),
  clearDestinations: () => set({ destinations: {} }),
}));

export const isLiveState = (state: EngineState): boolean => state === 'live' || state === 'connecting' || state === 'reconnecting';
