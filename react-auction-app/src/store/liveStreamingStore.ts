// ============================================================================
// LIVE STREAMING STORE - V3 Broadcast State Management
// Manages live streaming, camera, and overlay state with Zustand
// ============================================================================

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { 
  LiveBroadcastState, 
  LiveOverlayState, 
  CameraSource,
  CameraLayout,
  OBSConnectionState,
  SuccessAnimationType,
} from '../types/streaming';
import {
  DEFAULT_PLAYER_OVERLAY,
  DEFAULT_BID_OVERLAY,
  DEFAULT_SUCCESS_ANIMATION,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_OBS_CONFIG,
  DEFAULT_RTMP_CONFIG,
} from '../types/streaming';
import type { Player, Team, BidHistory } from '../types';

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface LiveStreamingStore {
  // === Broadcast State ===
  broadcast: LiveBroadcastState;
  
  // === Overlay State ===
  overlay: LiveOverlayState;
  
  // === Current Auction Data (synced from main store) ===
  currentPlayer: Player | null;
  currentBid: number;
  currentTeam: Team | null;
  bidHistory: BidHistory[];
  
  // === Animation State ===
  showSuccessAnimation: boolean;
  
  // === Premium State ===
  isPremium: boolean;
  maxCameras: number;

  // === Broadcast Actions ===
  setLive: (isLive: boolean) => void;
  setViewerCount: (count: number) => void;
  
  // === Camera Actions ===
  setCameraSources: (sources: CameraSource[]) => void;
  setPrimaryCamera: (cameraId: string | null) => void;
  setCameraLayout: (layout: CameraLayout) => void;
  
  // === OBS Actions ===
  setOBSEnabled: (enabled: boolean) => void;
  setOBSConnectionState: (state: OBSConnectionState) => void;
  setOBSScenes: (scenes: string[]) => void;
  setCurrentScene: (scene: string) => void;
  
  // === RTMP Actions ===
  setRTMPEnabled: (enabled: boolean) => void;
  setRTMPConfig: (serverUrl: string, streamKey: string) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  
  // === Overlay Actions ===
  setPlayerOverlayVisible: (visible: boolean) => void;
  setBidOverlayVisible: (visible: boolean) => void;
  setSuccessAnimationType: (type: SuccessAnimationType) => void;
  
  // === Auction Sync Actions ===
  syncPlayer: (player: Player | null) => void;
  syncBid: (amount: number, team: Team | null, history: BidHistory[]) => void;
  
  // === Animation Actions ===
  triggerSuccessAnimation: () => void;
  hideSuccessAnimation: () => void;
  
  // === Premium Actions ===
  setPremiumStatus: (isPremium: boolean, maxCameras: number) => void;
  
  // === Reset ===
  reset: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialBroadcastState: LiveBroadcastState = {
  isLive: false,
  startedAt: null,
  viewerCount: 0,
  cameras: { ...DEFAULT_CAMERA_CONFIG },
  obs: { ...DEFAULT_OBS_CONFIG },
  rtmp: { ...DEFAULT_RTMP_CONFIG },
};

const initialOverlayState: LiveOverlayState = {
  player: { ...DEFAULT_PLAYER_OVERLAY },
  bid: { ...DEFAULT_BID_OVERLAY },
  successAnimation: { ...DEFAULT_SUCCESS_ANIMATION },
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useLiveStreamingStore = create<LiveStreamingStore>()(
  devtools(
    (set, get) => ({
      // === Initial State ===
      broadcast: initialBroadcastState,
      overlay: initialOverlayState,
      currentPlayer: null,
      currentBid: 0,
      currentTeam: null,
      bidHistory: [],
      showSuccessAnimation: false,
      isPremium: false,
      maxCameras: 0,

      // === Broadcast Actions ===
      setLive: (isLive) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          isLive,
          startedAt: isLive ? Date.now() : null,
        }
      }), false, 'setLive'),

      setViewerCount: (count) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          viewerCount: count,
        }
      }), false, 'setViewerCount'),

      // === Camera Actions ===
      setCameraSources: (sources) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          cameras: {
            ...state.broadcast.cameras,
            sources,
          }
        }
      }), false, 'setCameraSources'),

      setPrimaryCamera: (cameraId) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          cameras: {
            ...state.broadcast.cameras,
            primaryCamera: cameraId,
          }
        }
      }), false, 'setPrimaryCamera'),

      setCameraLayout: (layout) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          cameras: {
            ...state.broadcast.cameras,
            layout,
          }
        }
      }), false, 'setCameraLayout'),

      // === OBS Actions ===
      setOBSEnabled: (enabled) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          obs: {
            ...state.broadcast.obs,
            enabled,
          }
        }
      }), false, 'setOBSEnabled'),

      setOBSConnectionState: (connectionState) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          obs: {
            ...state.broadcast.obs,
            connectionState,
          }
        }
      }), false, 'setOBSConnectionState'),

      setOBSScenes: (scenes) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          obs: {
            ...state.broadcast.obs,
            scenes,
          }
        }
      }), false, 'setOBSScenes'),

      setCurrentScene: (scene) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          obs: {
            ...state.broadcast.obs,
            currentScene: scene,
          }
        }
      }), false, 'setCurrentScene'),

      // === RTMP Actions ===
      setRTMPEnabled: (enabled) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          rtmp: {
            ...state.broadcast.rtmp,
            enabled,
          }
        }
      }), false, 'setRTMPEnabled'),

      setRTMPConfig: (serverUrl, streamKey) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          rtmp: {
            ...state.broadcast.rtmp,
            serverUrl,
            streamKey,
          }
        }
      }), false, 'setRTMPConfig'),

      setIsStreaming: (isStreaming) => set((state) => ({
        broadcast: {
          ...state.broadcast,
          rtmp: {
            ...state.broadcast.rtmp,
            isStreaming,
          }
        }
      }), false, 'setIsStreaming'),

      // === Overlay Actions ===
      setPlayerOverlayVisible: (visible) => set((state) => ({
        overlay: {
          ...state.overlay,
          player: {
            ...state.overlay.player,
            visible,
          }
        }
      }), false, 'setPlayerOverlayVisible'),

      setBidOverlayVisible: (visible) => set((state) => ({
        overlay: {
          ...state.overlay,
          bid: {
            ...state.overlay.bid,
            visible,
          }
        }
      }), false, 'setBidOverlayVisible'),

      setSuccessAnimationType: (type) => set((state) => ({
        overlay: {
          ...state.overlay,
          successAnimation: {
            ...state.overlay.successAnimation,
            type,
          }
        }
      }), false, 'setSuccessAnimationType'),

      // === Auction Sync Actions ===
      syncPlayer: (player) => set({ currentPlayer: player }, false, 'syncPlayer'),

      syncBid: (amount, team, history) => set({
        currentBid: amount,
        currentTeam: team,
        bidHistory: history,
      }, false, 'syncBid'),

      // === Animation Actions ===
      triggerSuccessAnimation: () => {
        set({ showSuccessAnimation: true }, false, 'triggerSuccessAnimation');
        
        // Auto-hide after duration
        const duration = get().overlay.successAnimation.duration;
        setTimeout(() => {
          set({ showSuccessAnimation: false }, false, 'hideSuccessAnimation');
        }, duration);
      },

      hideSuccessAnimation: () => set({ showSuccessAnimation: false }, false, 'hideSuccessAnimation'),

      // === Premium Actions ===
      setPremiumStatus: (isPremium, maxCameras) => set({
        isPremium,
        maxCameras,
        broadcast: {
          ...get().broadcast,
          cameras: {
            ...get().broadcast.cameras,
            maxSources: maxCameras,
          }
        }
      }, false, 'setPremiumStatus'),

      // === Reset ===
      reset: () => set({
        broadcast: initialBroadcastState,
        overlay: initialOverlayState,
        currentPlayer: null,
        currentBid: 0,
        currentTeam: null,
        bidHistory: [],
        showSuccessAnimation: false,
      }, false, 'reset'),
    }),
    { name: 'LiveStreamingStore' }
  )
);
