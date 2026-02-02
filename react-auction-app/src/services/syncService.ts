// ============================================================================
// CROSS-DEVICE SYNC SERVICE
// Real-time state synchronization between desktop and mobile devices
// Uses localStorage + BroadcastChannel for same-device, polling for cross-device
// ============================================================================

import type { Player, Team } from '../types';

// Sync state interface - what we broadcast across devices
export interface AuctionSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  auctionActive: boolean;
  lastUpdate: number;
  sessionId: string;
}

// Mobile bid event - sent from mobile to desktop
export interface MobileBidEvent {
  id: string;
  type: 'raise' | 'stop';
  teamId: string;
  teamName: string;
  amount: number;
  playerId: string;
  timestamp: number;
  clientId: string;
}

// Sync event types
type SyncEventType = 'state_update' | 'mobile_bid' | 'heartbeat';

interface SyncEvent {
  type: SyncEventType;
  payload: AuctionSyncState | MobileBidEvent;
  timestamp: number;
  source: 'desktop' | 'mobile';
}

// Listeners
type StateUpdateListener = (state: AuctionSyncState) => void;
type MobileBidListener = (bid: MobileBidEvent) => void;

// Storage keys
const SYNC_STATE_KEY = 'auction_sync_state';
const MOBILE_BIDS_KEY = 'auction_mobile_bids';
const HEARTBEAT_KEY = 'auction_heartbeat';

/**
 * Cross-Device Sync Service
 * 
 * Architecture:
 * - Desktop broadcasts state changes to localStorage
 * - Mobile polls localStorage for state updates
 * - Mobile writes bids to localStorage
 * - Desktop polls for mobile bids
 * - BroadcastChannel for same-origin tabs (bonus)
 */
class SyncService {
  private readonly sessionId: string;
  private broadcastChannel: BroadcastChannel | null = null;
  private readonly stateListeners = new Set<StateUpdateListener>();
  private readonly bidListeners = new Set<MobileBidListener>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastStateTimestamp = 0;
  private readonly processedBidIds = new Set<string>();
  private role: 'desktop' | 'mobile' = 'desktop';
  private isPolling = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initBroadcastChannel();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Initialize BroadcastChannel for same-origin tabs
   */
  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('auction-sync');
        this.broadcastChannel.onmessage = (event) => {
          this.handleBroadcastMessage(event.data);
        };
        console.log('[SyncService] BroadcastChannel initialized');
      } catch (error) {
        console.warn('[SyncService] BroadcastChannel not available:', error);
      }
    }
  }

  /**
   * Handle broadcast message (same-origin tabs)
   */
  private handleBroadcastMessage(data: SyncEvent): void {
    console.log('[SyncService] Broadcast received:', data.type);
    
    if (data.type === 'state_update') {
      const state = data.payload as AuctionSyncState;
      if (state.lastUpdate > this.lastStateTimestamp) {
        this.lastStateTimestamp = state.lastUpdate;
        this.notifyStateListeners(state);
      }
    } else if (data.type === 'mobile_bid') {
      const bid = data.payload as MobileBidEvent;
      if (!this.processedBidIds.has(bid.id)) {
        this.processedBidIds.add(bid.id);
        this.notifyBidListeners(bid);
      }
    }
  }

  /**
   * Initialize as desktop (broadcaster)
   */
  initAsDesktop(): void {
    this.role = 'desktop';
    console.log('[SyncService] Initialized as DESKTOP');
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Start polling for mobile bids
    this.startBidPolling();
    
    // Clear any stale mobile bids
    this.clearMobileBids();
  }

  /**
   * Initialize as mobile (receiver)
   */
  initAsMobile(): void {
    this.role = 'mobile';
    console.log('[SyncService] Initialized as MOBILE');
    
    // Start polling for state updates
    this.startStatePolling();
  }

  /**
   * Desktop: Broadcast auction state
   */
  broadcastState(state: AuctionSyncState): void {
    if (this.role !== 'desktop') {
      console.warn('[SyncService] Only desktop can broadcast state');
      return;
    }

    const syncState: AuctionSyncState = {
      ...state,
      lastUpdate: Date.now(),
      sessionId: this.sessionId,
    };

    // Save to localStorage
    try {
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(syncState));
      console.log('[SyncService] State saved to localStorage:', {
        player: syncState.currentPlayer?.name,
        bid: syncState.currentBid,
        team: syncState.selectedTeam?.name,
        timestamp: syncState.lastUpdate,
      });
    } catch (error) {
      console.error('[SyncService] Failed to save state:', error);
    }

    // Also broadcast via BroadcastChannel for same-origin tabs
    const event: SyncEvent = {
      type: 'state_update',
      payload: syncState,
      timestamp: Date.now(),
      source: 'desktop',
    };
    
    this.broadcastChannel?.postMessage(event);
  }

  /**
   * Mobile: Submit a bid
   */
  submitMobileBid(
    team: Team,
    amount: number,
    playerId: string,
    type: 'raise' | 'stop' = 'raise'
  ): MobileBidEvent {
    const bid: MobileBidEvent = {
      id: `mb_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type,
      teamId: team.id,
      teamName: team.name,
      amount,
      playerId,
      timestamp: Date.now(),
      clientId: this.sessionId,
    };

    // Save to localStorage queue
    try {
      const existingBids = this.getMobileBidsFromStorage();
      existingBids.push(bid);
      localStorage.setItem(MOBILE_BIDS_KEY, JSON.stringify(existingBids));
      console.log('[SyncService] Mobile bid queued:', bid);
    } catch (error) {
      console.error('[SyncService] Failed to queue bid:', error);
    }

    // Also broadcast via BroadcastChannel
    const event: SyncEvent = {
      type: 'mobile_bid',
      payload: bid,
      timestamp: Date.now(),
      source: 'mobile',
    };
    
    this.broadcastChannel?.postMessage(event);

    return bid;
  }

  /**
   * Get state from localStorage
   */
  getStateFromStorage(): AuctionSyncState | null {
    try {
      const stored = localStorage.getItem(SYNC_STATE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[SyncService] Failed to read state:', error);
    }
    return null;
  }

  /**
   * Get mobile bids from localStorage
   */
  private getMobileBidsFromStorage(): MobileBidEvent[] {
    try {
      const stored = localStorage.getItem(MOBILE_BIDS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  }

  /**
   * Clear mobile bids (called after processing)
   */
  clearMobileBids(): void {
    try {
      localStorage.removeItem(MOBILE_BIDS_KEY);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Desktop: Start heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      try {
        localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
      } catch {
        // Ignore errors
      }
    }, 1000);
  }

  /**
   * Desktop: Poll for mobile bids
   */
  private startBidPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(() => {
      const bids = this.getMobileBidsFromStorage();
      
      for (const bid of bids) {
        if (!this.processedBidIds.has(bid.id)) {
          this.processedBidIds.add(bid.id);
          console.log('[SyncService] Processing mobile bid:', bid);
          this.notifyBidListeners(bid);
        }
      }

      // Clear processed bids
      if (bids.length > 0) {
        this.clearMobileBids();
      }

      // Keep processed IDs list manageable - clear and add back last 500
      if (this.processedBidIds.size > 1000) {
        const ids = Array.from(this.processedBidIds).slice(-500);
        this.processedBidIds.clear();
        ids.forEach(id => this.processedBidIds.add(id));
      }
    }, 100); // Poll every 100ms for responsiveness
  }

  /**
   * Mobile: Poll for state updates
   */
  private startStatePolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = () => {
      if (!this.isPolling) return;

      const state = this.getStateFromStorage();
      
      if (state && state.lastUpdate > this.lastStateTimestamp) {
        this.lastStateTimestamp = state.lastUpdate;
        console.log('[SyncService] State update received:', {
          player: state.currentPlayer?.name,
          bid: state.currentBid,
          team: state.selectedTeam?.name,
        });
        this.notifyStateListeners(state);
      }

      // Continue polling
      requestAnimationFrame(poll);
    };

    poll();
  }

  /**
   * Subscribe to state updates (for mobile)
   */
  onStateUpdate(listener: StateUpdateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to mobile bids (for desktop)
   */
  onMobileBid(listener: MobileBidListener): () => void {
    this.bidListeners.add(listener);
    return () => this.bidListeners.delete(listener);
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(state: AuctionSyncState): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[SyncService] State listener error:', error);
      }
    });
  }

  /**
   * Notify bid listeners
   */
  private notifyBidListeners(bid: MobileBidEvent): void {
    this.bidListeners.forEach(listener => {
      try {
        listener(bid);
      } catch (error) {
        console.error('[SyncService] Bid listener error:', error);
      }
    });
  }

  /**
   * Check if desktop is active (heartbeat)
   */
  isDesktopActive(): boolean {
    try {
      const heartbeat = localStorage.getItem(HEARTBEAT_KEY);
      if (heartbeat) {
        const lastBeat = Number.parseInt(heartbeat, 10);
        return Date.now() - lastBeat < 3000; // Within 3 seconds
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.isPolling = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    
    this.stateListeners.clear();
    this.bidListeners.clear();
  }
}

// Singleton instance
export const syncService = new SyncService();
