// ============================================================================
// REAL-TIME BIDDING SERVICE
// Event-driven architecture for handling concurrent bids with millisecond precision
// ============================================================================

import type { Team, Player } from '../types';

// Bid event interface
export interface BidEvent {
  id: string;
  teamId: string;
  teamName: string;
  amount: number;
  playerId: string;
  timestamp: number; // Millisecond precision for ordering
  type: 'raise' | 'stop';
  source: 'keyboard' | 'mobile';
  clientId: string;
}

// Bid queue for handling concurrent bids
interface BidQueueItem extends BidEvent {
  processed: boolean;
  result?: 'accepted' | 'rejected';
  rejectReason?: string;
}

// Bidding state
interface BiddingState {
  currentPlayerId: string | null;
  currentBid: number;
  currentTeamId: string | null;
  isActive: boolean;
  bidHistory: BidEvent[];
  lastProcessedTimestamp: number;
}

// Listeners type
type BidListener = (event: BidEvent, result: 'accepted' | 'rejected', reason?: string) => void;
type StateListener = (state: BiddingState) => void;

/**
 * Real-Time Bidding Service
 * Implements event-driven architecture with:
 * - Millisecond timestamp ordering for concurrent bids
 * - Queue-based processing to handle multiple bids
 * - Broadcast capability for real-time updates
 */
class BiddingService {
  private state: BiddingState = {
    currentPlayerId: null,
    currentBid: 0,
    currentTeamId: null,
    isActive: false,
    bidHistory: [],
    lastProcessedTimestamp: 0,
  };

  private bidQueue: BidQueueItem[] = [];
  private bidListeners: Set<BidListener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Initialize BroadcastChannel for cross-tab communication
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('auction-bidding');
      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };
    }

    // Start processing queue
    this.startQueueProcessing();
  }

  /**
   * Generate unique bid ID
   */
  private generateBidId(): string {
    return `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start the player auction
   */
  startAuction(player: Player, basePrice: number): void {
    this.state = {
      currentPlayerId: player.id,
      currentBid: basePrice,
      currentTeamId: null,
      isActive: true,
      bidHistory: [],
      lastProcessedTimestamp: Date.now(),
    };
    
    this.notifyStateListeners();
    this.broadcast({ type: 'auction_started', player, basePrice });
  }

  /**
   * Stop the current auction
   */
  stopAuction(): void {
    this.state.isActive = false;
    this.notifyStateListeners();
    this.broadcast({ type: 'auction_stopped' });
  }

  /**
   * Submit a bid - main entry point
   * Bids are queued and processed in timestamp order
   */
  submitBid(
    team: Team,
    amount: number,
    source: 'keyboard' | 'mobile',
    clientId: string
  ): string {
    if (!this.state.isActive || !this.state.currentPlayerId) {
      console.warn('[Bidding] Cannot submit bid - auction not active');
      return '';
    }

    const bidEvent: BidEvent = {
      id: this.generateBidId(),
      teamId: team.id,
      teamName: team.name,
      amount,
      playerId: this.state.currentPlayerId,
      timestamp: Date.now(),
      type: 'raise',
      source,
      clientId,
    };

    // Add to queue
    this.bidQueue.push({
      ...bidEvent,
      processed: false,
    });

    // Broadcast to other tabs/windows
    this.broadcast({ type: 'bid_submitted', bid: bidEvent });

    console.log('[Bidding] Bid queued:', bidEvent.id, 'at', bidEvent.timestamp);
    return bidEvent.id;
  }

  /**
   * Submit a stop bidding signal
   */
  submitStopBidding(
    team: Team,
    source: 'keyboard' | 'mobile',
    clientId: string
  ): void {
    const stopEvent: BidEvent = {
      id: this.generateBidId(),
      teamId: team.id,
      teamName: team.name,
      amount: this.state.currentBid,
      playerId: this.state.currentPlayerId || '',
      timestamp: Date.now(),
      type: 'stop',
      source,
      clientId,
    };

    // Broadcast stop signal
    this.broadcast({ type: 'stop_bidding', event: stopEvent });
    this.notifyBidListeners(stopEvent, 'accepted');
  }

  /**
   * Process bid queue - handles concurrent bids with timestamp ordering
   */
  private processQueue(): void {
    if (this.bidQueue.length === 0) return;

    // Sort by timestamp (earlier bids have priority)
    const pendingBids = this.bidQueue
      .filter(b => !b.processed)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (pendingBids.length === 0) return;

    for (const bid of pendingBids) {
      this.processBid(bid);
    }

    // Clean up processed bids (keep last 100 for history)
    this.bidQueue = this.bidQueue.filter(b => b.processed).slice(-100);
  }

  /**
   * Process individual bid
   */
  private processBid(bid: BidQueueItem): void {
    bid.processed = true;

    // Validation checks
    if (bid.playerId !== this.state.currentPlayerId) {
      bid.result = 'rejected';
      bid.rejectReason = 'Player changed';
      this.notifyBidListeners(bid, 'rejected', bid.rejectReason);
      return;
    }

    if (!this.state.isActive) {
      bid.result = 'rejected';
      bid.rejectReason = 'Auction not active';
      this.notifyBidListeners(bid, 'rejected', bid.rejectReason);
      return;
    }

    // Check if bid amount is higher than current
    if (bid.amount <= this.state.currentBid) {
      bid.result = 'rejected';
      bid.rejectReason = 'Bid too low';
      this.notifyBidListeners(bid, 'rejected', bid.rejectReason);
      return;
    }

    // Check for duplicate bid from same team at higher amount (concurrent safety)
    if (bid.teamId === this.state.currentTeamId && bid.amount <= this.state.currentBid) {
      bid.result = 'rejected';
      bid.rejectReason = 'Duplicate bid';
      this.notifyBidListeners(bid, 'rejected', bid.rejectReason);
      return;
    }

    // Accept the bid
    bid.result = 'accepted';
    this.state.currentBid = bid.amount;
    this.state.currentTeamId = bid.teamId;
    this.state.lastProcessedTimestamp = bid.timestamp;
    this.state.bidHistory.push(bid);

    console.log('[Bidding] Bid accepted:', bid.id, 'Amount:', bid.amount, 'Team:', bid.teamName);
    
    this.notifyBidListeners(bid, 'accepted');
    this.notifyStateListeners();
    this.broadcast({ type: 'bid_accepted', bid });
  }

  /**
   * Start queue processing interval
   */
  private startQueueProcessing(): void {
    if (this.processingInterval) return;
    
    // Process queue every 50ms for responsive handling
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 50);
  }

  /**
   * Stop queue processing
   */
  stopQueueProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Broadcast message to other tabs/windows
   */
  private broadcast(message: Record<string, unknown>): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (error) {
        console.warn('[Bidding] Broadcast failed:', error);
      }
    }
  }

  /**
   * Handle broadcast messages from other tabs
   */
  private handleBroadcastMessage(data: Record<string, unknown>): void {
    const messageType = data.type as string;
    
    switch (messageType) {
      case 'bid_submitted':
        // Another tab submitted a bid - add to our queue if not duplicate
        const bid = data.bid as BidEvent;
        if (!this.bidQueue.find(b => b.id === bid.id)) {
          this.bidQueue.push({ ...bid, processed: false });
        }
        break;
      
      case 'bid_accepted':
        // Sync state from another tab
        const acceptedBid = data.bid as BidEvent;
        if (acceptedBid.timestamp > this.state.lastProcessedTimestamp) {
          this.state.currentBid = acceptedBid.amount;
          this.state.currentTeamId = acceptedBid.teamId;
          this.state.lastProcessedTimestamp = acceptedBid.timestamp;
          this.notifyStateListeners();
        }
        break;
      
      case 'auction_started':
        this.state.isActive = true;
        this.state.currentPlayerId = (data.player as Player).id;
        this.state.currentBid = data.basePrice as number;
        this.notifyStateListeners();
        break;
      
      case 'auction_stopped':
        this.state.isActive = false;
        this.notifyStateListeners();
        break;
    }
  }

  /**
   * Subscribe to bid events
   */
  onBid(listener: BidListener): () => void {
    this.bidListeners.add(listener);
    return () => this.bidListeners.delete(listener);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Notify bid listeners
   */
  private notifyBidListeners(event: BidEvent, result: 'accepted' | 'rejected', reason?: string): void {
    this.bidListeners.forEach(listener => {
      try {
        listener(event, result, reason);
      } catch (error) {
        console.error('[Bidding] Listener error:', error);
      }
    });
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(): void {
    this.stateListeners.forEach(listener => {
      try {
        listener({ ...this.state });
      } catch (error) {
        console.error('[Bidding] State listener error:', error);
      }
    });
  }

  /**
   * Get current state
   */
  getState(): BiddingState {
    return { ...this.state };
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.stopQueueProcessing();
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    this.bidListeners.clear();
    this.stateListeners.clear();
  }
}

// Singleton instance
export const biddingService = new BiddingService();
