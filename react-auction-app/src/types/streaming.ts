// ============================================================================
// STREAMING TYPES - V3 Live Streaming Type Definitions
// Multi-camera, OBS integration, and broadcast overlay types
// ============================================================================

import type { Player, Team, BidHistory } from './index';

// Camera source configuration
export interface CameraSource {
  id: string;
  deviceId: string;
  label: string;
  stream: MediaStream | null;
  isActive: boolean;
  position: CameraPosition;
  zIndex: number;
}

// Camera position presets
export type CameraPosition = 'fullscreen' | 'pip-top-left' | 'pip-top-right' | 'pip-bottom-left' | 'pip-bottom-right' | 'grid-1' | 'grid-2' | 'grid-3' | 'grid-4';

// Camera layout modes
export type CameraLayout = 'single' | 'pip' | 'split' | 'quad';

// Multi-camera configuration
export interface CameraConfig {
  layout: CameraLayout;
  primaryCamera: string | null;
  sources: CameraSource[];
  maxSources: number;
}

// OBS WebSocket connection state
export type OBSConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// OBS configuration
export interface OBSConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  connectionState: OBSConnectionState;
  currentScene?: string;
  scenes?: string[];
}

// RTMP streaming configuration
export interface RTMPConfig {
  enabled: boolean;
  serverUrl: string;
  streamKey: string;
  isStreaming: boolean;
}

// Live broadcast state
export interface LiveBroadcastState {
  isLive: boolean;
  startedAt: number | null;
  viewerCount: number;
  cameras: CameraConfig;
  obs: OBSConfig;
  rtmp: RTMPConfig;
}

// Player overlay configuration
export interface PlayerOverlayConfig {
  visible: boolean;
  position: 'bottom-left' | 'bottom-center' | 'bottom-right';
  width: number; // percentage
  height: number; // percentage
  opacity: number;
  showImage: boolean;
  showName: boolean;
  showRole: boolean;
  showBasePrice: boolean;
  showStats: boolean;
}

// Bid overlay configuration
export interface BidOverlayConfig {
  visible: boolean;
  position: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  showAmount: boolean;
  showTeamLogo: boolean;
  showTeamName: boolean;
  showHistory: boolean;
  historyCount: number;
}

// Success animation types
export type SuccessAnimationType = 'stamp' | 'confetti' | 'fireworks' | 'glow' | 'none';

// Success animation configuration
export interface SuccessAnimationConfig {
  type: SuccessAnimationType;
  duration: number; // milliseconds
  soundEnabled: boolean;
  stampText: string;
  stampColor: string;
}

// Live overlay state (combines all overlays)
export interface LiveOverlayState {
  player: PlayerOverlayConfig;
  bid: BidOverlayConfig;
  successAnimation: SuccessAnimationConfig;
}

// Current bid display data
export interface CurrentBidDisplay {
  amount: number;
  team: Team | null;
  history: BidHistory[];
  isSuccessful: boolean;
}

// Live page state
export interface LivePageState {
  broadcast: LiveBroadcastState;
  overlay: LiveOverlayState;
  currentPlayer: Player | null;
  currentBid: CurrentBidDisplay;
  showSuccessAnimation: boolean;
}

// Keyboard shortcut mappings for live page
export interface LiveKeyboardShortcuts {
  camera1: string;
  camera2: string;
  camera3: string;
  camera4: string;
  toggleOverlay: string;
  toggleBidDisplay: string;
  cycleLayout: string;
}

// Default configurations
export const DEFAULT_PLAYER_OVERLAY: PlayerOverlayConfig = {
  visible: true,
  position: 'bottom-left',
  width: 60,
  height: 20,
  opacity: 0.95,
  showImage: true,
  showName: true,
  showRole: true,
  showBasePrice: true,
  showStats: true,
};

export const DEFAULT_BID_OVERLAY: BidOverlayConfig = {
  visible: true,
  position: 'bottom-right',
  showAmount: true,
  showTeamLogo: true,
  showTeamName: true,
  showHistory: true,
  historyCount: 3,
};

export const DEFAULT_SUCCESS_ANIMATION: SuccessAnimationConfig = {
  type: 'stamp',
  duration: 2000,
  soundEnabled: true,
  stampText: 'SOLD!',
  stampColor: '#22c55e',
};

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  layout: 'single',
  primaryCamera: null,
  sources: [],
  maxSources: 4,
};

export const DEFAULT_OBS_CONFIG: OBSConfig = {
  enabled: false,
  host: 'localhost',
  port: 4455,
  connectionState: 'disconnected',
};

export const DEFAULT_RTMP_CONFIG: RTMPConfig = {
  enabled: false,
  serverUrl: '',
  streamKey: '',
  isStreaming: false,
};
