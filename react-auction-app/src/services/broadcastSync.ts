// ============================================================================
// BROADCAST CHANNEL SYNC SERVICE
// Real-time state synchronization for same-browser tabs using BroadcastChannel
// This is instant and works without network - perfect for local testing
// ============================================================================

import type { Player, Team } from '../types';

// Sync state interface
export interface BroadcastSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  auctionActive: boolean;
  lastUpdate: number;
  sessionId: string;
}

// Mobile bid event
export interface BroadcastMobileBid {
  id: string;
  type: 'raise' | 'stop';
  teamId: string;
  teamName: string;
  amount: number;
  playerId: string;
  timestamp: number;
  clientId: string;
}

// Message types
interface SyncMessage {
  type: 'state_update' | 'mobile_bid' | 'heartbeat' | 'request_state';
  payload?: BroadcastSyncState | BroadcastMobileBid;
  timestamp: number;
  source: 'desktop' | 'mobile';
  sessionId: string;
}

// Listeners
type StateListener = (state: BroadcastSyncState) => void;
type BidListener = (bid: BroadcastMobileBid) => void;

const CHANNEL_NAME = 'auction-broadcast-sync';

/**
 * BroadcastChannel Sync Service
 * Provides instant real-time sync between browser tabs
 */
class BroadcastSyncService {
  private channel: BroadcastChannel | null = null;
  private readonly sessionId: string;
  private role: 'desktop' | 'mobile' = 'desktop';
  private readonly stateListeners = new Set<StateListener>();
  private readonly bidListeners = new Set<BidListener>();
  private currentState: BroadcastSyncState | null = null;
  private readonly processedBidIds = new Set<string>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat = 0;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.initChannel();
  }

  /**
   * Initialize BroadcastChannel
   */
  private initChannel(): void {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[BroadcastSync] BroadcastChannel not supported');
      return;
    }

    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => this.handleMessage(event.data);
      console.log('[BroadcastSync] Channel initialized');
    } catch (error) {
      console.error('[BroadcastSync] Failed to initialize:', error);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: SyncMessage): void {
    console.log('[BroadcastSync] Message received:', message.type, 'from', message.source);

    switch (message.type) {
      case 'state_update':
        if (this.role === 'mobile' && message.payload) {
          const state = message.payload as BroadcastSyncState;
          this.currentState = state;
          this.lastHeartbeat = Date.now();
          this.notifyStateListeners(state);
        }
        break;

      case 'mobile_bid':
        if (this.role === 'desktop' && message.payload) {
          const bid = message.payload as BroadcastMobileBid;
          if (!this.processedBidIds.has(bid.id)) {
            this.processedBidIds.add(bid.id);
            this.notifyBidListeners(bid);
            // Keep set manageable - clear and add back last 50
            if (this.processedBidIds.size > 100) {
              const ids = Array.from(this.processedBidIds).slice(-50);
              this.processedBidIds.clear();
              ids.forEach(id => this.processedBidIds.add(id));
            }
          }
        }
        break;

      case 'heartbeat':
        if (this.role === 'mobile') {
          this.lastHeartbeat = Date.now();
        }
        break;

      case 'request_state':
        if (this.role === 'desktop' && this.currentState) {
          // Respond with current state
          this.broadcastState(this.currentState);
        }
        break;
    }
  }

  /**
   * Initialize as Desktop (broadcaster)
   */
  initAsDesktop(): void {
    this.role = 'desktop';
    console.log('[BroadcastSync] Initialized as DESKTOP');
    
    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Initialize as Mobile (receiver)
   */
  initAsMobile(): void {
    this.role = 'mobile';
    console.log('[BroadcastSync] Initialized as MOBILE');
    
    // Request current state from desktop
    this.requestState();
  }

  /**
   * Request current state from desktop
   */
  private requestState(): void {
    if (!this.channel) return;

    const message: SyncMessage = {
      type: 'request_state',
      timestamp: Date.now(),
      source: 'mobile',
      sessionId: this.sessionId,
    };

    this.channel.postMessage(message);
  }

  /**
   * Start heartbeat (desktop only)
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.channel) return;

      const message: SyncMessage = {
        type: 'heartbeat',
        timestamp: Date.now(),
        source: 'desktop',
        sessionId: this.sessionId,
      };

      this.channel.postMessage(message);
    }, 1000);
  }

  /**
   * Broadcast state (desktop only)
   */
  broadcastState(state: BroadcastSyncState): void {
    if (!this.channel || this.role !== 'desktop') return;

    this.currentState = state;

    const message: SyncMessage = {
      type: 'state_update',
      payload: state,
      timestamp: Date.now(),
      source: 'desktop',
      sessionId: this.sessionId,
    };

    this.channel.postMessage(message);
    console.log('[BroadcastSync] State broadcasted:', {
      player: state.currentPlayer?.name,
      bid: state.currentBid,
      team: state.selectedTeam?.name,
    });
  }

  /**
   * Submit bid (mobile only)
   */
  submitMobileBid(
    team: Team,
    amount: number,
    playerId: string,
    type: 'raise' | 'stop' = 'raise'
  ): void {
    if (!this.channel) return;

    const bid: BroadcastMobileBid = {
      id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type,
      teamId: team.id,
      teamName: team.name,
      amount,
      playerId,
      timestamp: Date.now(),
      clientId: this.sessionId,
    };

    const message: SyncMessage = {
      type: 'mobile_bid',
      payload: bid,
      timestamp: Date.now(),
      source: 'mobile',
      sessionId: this.sessionId,
    };

    this.channel.postMessage(message);
    console.log('[BroadcastSync] Bid submitted:', bid);
  }

  /**
   * Check if desktop is active
   */
  isDesktopActive(): boolean {
    return Date.now() - this.lastHeartbeat < 3000;
  }

  /**
   * Get current state
   */
  getCurrentState(): BroadcastSyncState | null {
    return this.currentState;
  }

  /**
   * Subscribe to state updates
   */
  onStateUpdate(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    // Immediately call with current state if available
    if (this.currentState) {
      listener(this.currentState);
    }
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to mobile bids
   */
  onMobileBid(listener: BidListener): () => void {
    this.bidListeners.add(listener);
    return () => this.bidListeners.delete(listener);
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(state: BroadcastSyncState): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[BroadcastSync] Listener error:', error);
      }
    });
  }

  /**
   * Notify bid listeners
   */
  private notifyBidListeners(bid: BroadcastMobileBid): void {
    this.bidListeners.forEach(listener => {
      try {
        listener(bid);
      } catch (error) {
        console.error('[BroadcastSync] Listener error:', error);
      }
    });
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.channel) {
      this.channel.close();
    }
    this.stateListeners.clear();
    this.bidListeners.clear();
  }
}

// Singleton instance
export const broadcastSyncService = new BroadcastSyncService();
