// ============================================================================
// FIREBASE FIRESTORE SERVICE
// Real-time bidding sync across devices
// ============================================================================

// Firebase configuration - Replace with your Firebase project credentials
const firebaseConfig = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  messagingSenderId: '830797180032',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
  measurementId: 'G-FER452EYST',
};



// Types for Firestore data
export interface FirestoreBid {
  id: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: number;
  clientId: string;
  source: 'keyboard' | 'mobile';
  status: 'pending' | 'accepted' | 'rejected';
}

export interface FirestoreAuctionState {
  currentPlayerId: string | null;
  currentPlayerName: string | null;
  currentBid: number;
  leadingTeamId: string | null;
  leadingTeamName: string | null;
  auctionStatus: 'idle' | 'bidding' | 'sold' | 'unsold';
  round: number;
  lastUpdated: number;
}

export interface FirestorePlayer {
  id: string;
  name: string;
  role: string;
  basePrice: number;
  status: 'available' | 'sold' | 'unsold';
  soldAmount?: number;
  soldToTeamId?: string;
  soldToTeamName?: string;
  imageUrl?: string;
}

export interface FirestoreTeam {
  id: string;
  name: string;
  remainingPurse: number;
  playersBought: number;
  totalPlayerThreshold: number;
  primaryColor: string;
  secondaryColor: string;
}

// Listeners map for cleanup
type UnsubscribeFn = () => void;
const listeners: Map<string, UnsubscribeFn> = new Map();

/**
 * Firebase Service - Simulated for local development
 * In production, replace with actual Firebase SDK calls
 */
class FirebaseService {
  private isInitialized = false;
  private broadcastChannel: BroadcastChannel | null = null;
  private auctionState: FirestoreAuctionState = {
    currentPlayerId: null,
    currentPlayerName: null,
    currentBid: 0,
    leadingTeamId: null,
    leadingTeamName: null,
    auctionStatus: 'idle',
    round: 1,
    lastUpdated: Date.now(),
  };
  private bids: FirestoreBid[] = [];
  private stateListeners: Set<(state: FirestoreAuctionState) => void> = new Set();
  private bidListeners: Set<(bid: FirestoreBid) => void> = new Set();

  constructor() {
    console.log('[Firebase] Service created with config:', {
      projectId: firebaseConfig.projectId,
    });
  }

  /**
   * Initialize Firebase connection
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // In production, initialize Firebase SDK here
      // const app = initializeApp(firebaseConfig);
      // const db = getFirestore(app);
      
      console.log('[Firebase] Initialized successfully');
      this.isInitialized = true;
      
      // Start broadcasting state changes via BroadcastChannel for local sync
      this.setupBroadcastChannel();
      
      return true;
    } catch (error) {
      console.error('[Firebase] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Setup BroadcastChannel for cross-tab sync (local fallback for Firebase)
   */
  private setupBroadcastChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return;

    if (this.broadcastChannel) return;

    const channel = new BroadcastChannel('auction_firebase_sync');

    channel.onmessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'state_update':
          this.auctionState = data;
          this.notifyStateListeners();
          break;
        case 'new_bid':
          this.bids.push(data);
          this.notifyBidListeners(data);
          break;
      }
    };

    this.broadcastChannel = channel;

    // Store for cleanup
    listeners.set('broadcast', () => {
      this.broadcastChannel?.close();
      this.broadcastChannel = null;
    });
  }

  /**
   * Broadcast state update to other tabs/windows
   */
  private broadcastStateUpdate(): void {
    if (typeof BroadcastChannel === 'undefined') return;

    if (!this.broadcastChannel) {
      this.setupBroadcastChannel();
    }

    this.broadcastChannel?.postMessage({
      type: 'state_update',
      data: this.auctionState,
    });
  }

  /**
   * Broadcast new bid to other tabs/windows
   */
  private broadcastNewBid(bid: FirestoreBid): void {
    if (typeof BroadcastChannel === 'undefined') return;

    if (!this.broadcastChannel) {
      this.setupBroadcastChannel();
    }

    this.broadcastChannel?.postMessage({
      type: 'new_bid',
      data: bid,
    });
  }

  /**
   * Update auction state in Firestore
   */
  async updateAuctionState(state: Partial<FirestoreAuctionState>): Promise<void> {
    this.auctionState = {
      ...this.auctionState,
      ...state,
      lastUpdated: Date.now(),
    };
    
    // In production, update Firestore
    // await updateDoc(doc(db, 'auction', 'state'), this.auctionState);
    
    this.broadcastStateUpdate();
    this.notifyStateListeners();
  }

  /**
   * Submit a bid to Firestore
   */
  async submitBid(bid: Omit<FirestoreBid, 'id' | 'timestamp' | 'status'>): Promise<FirestoreBid> {
    const newBid: FirestoreBid = {
      ...bid,
      id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.bids.push(newBid);
    
    // In production, add to Firestore
    // await addDoc(collection(db, 'bids'), newBid);
    
    this.broadcastNewBid(newBid);
    this.notifyBidListeners(newBid);
    
    return newBid;
  }

  /**
   * Accept a bid and update state
   */
  async acceptBid(bidId: string): Promise<void> {
    const bid = this.bids.find(b => b.id === bidId);
    if (!bid) return;

    bid.status = 'accepted';

    await this.updateAuctionState({
      currentBid: bid.amount,
      leadingTeamId: bid.teamId,
      leadingTeamName: bid.teamName,
      auctionStatus: 'bidding',
    });
  }

  /**
   * Get current auction state
   */
  getAuctionState(): FirestoreAuctionState {
    return { ...this.auctionState };
  }

  /**
   * Get all bids for current player
   */
  getCurrentPlayerBids(): FirestoreBid[] {
    return this.bids.filter(b => b.playerId === this.auctionState.currentPlayerId);
  }

  /**
   * Subscribe to auction state changes
   */
  onStateChange(callback: (state: FirestoreAuctionState) => void): UnsubscribeFn {
    this.stateListeners.add(callback);
    
    // Immediately call with current state
    callback(this.auctionState);
    
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  /**
   * Subscribe to new bids
   */
  onBid(callback: (bid: FirestoreBid) => void): UnsubscribeFn {
    this.bidListeners.add(callback);
    
    return () => {
      this.bidListeners.delete(callback);
    };
  }

  /**
   * Notify all state listeners
   */
  private notifyStateListeners(): void {
    this.stateListeners.forEach(callback => {
      try {
        callback(this.auctionState);
      } catch (error) {
        console.error('[Firebase] State listener error:', error);
      }
    });
  }

  /**
   * Notify all bid listeners
   */
  private notifyBidListeners(bid: FirestoreBid): void {
    this.bidListeners.forEach(callback => {
      try {
        callback(bid);
      } catch (error) {
        console.error('[Firebase] Bid listener error:', error);
      }
    });
  }

  /**
   * Mark player as sold
   */
  async markPlayerSold(_playerId: string, playerName: string, _teamId: string, teamName: string, amount: number): Promise<void> {
    await this.updateAuctionState({
      auctionStatus: 'sold',
    });
    
    // In production, update player document
    // await updateDoc(doc(db, 'players', playerId), {
    //   status: 'sold',
    //   soldAmount: amount,
    //   soldToTeamId: teamId,
    //   soldToTeamName: teamName,
    // });
    
    console.log(`[Firebase] Player ${playerName} sold to ${teamName} for ₹${amount}L`);
  }

  /**
   * Mark player as unsold
   */
  async markPlayerUnsold(_playerId: string, playerName: string): Promise<void> {
    await this.updateAuctionState({
      auctionStatus: 'unsold',
    });
    
    console.log(`[Firebase] Player ${playerName} marked as unsold`);
  }

  /**
   * Set current player for bidding
   */
  async setCurrentPlayer(playerId: string | null, playerName: string | null, basePrice: number = 0): Promise<void> {
    // Clear previous bids when new player is set
    if (playerId !== this.auctionState.currentPlayerId) {
      this.bids = this.bids.filter(b => b.playerId !== this.auctionState.currentPlayerId);
    }

    await this.updateAuctionState({
      currentPlayerId: playerId,
      currentPlayerName: playerName,
      currentBid: basePrice,
      leadingTeamId: null,
      leadingTeamName: null,
      auctionStatus: playerId ? 'bidding' : 'idle',
    });
  }

  /**
   * Get auction analytics
   */
  getAnalytics(): {
    totalBids: number;
    avgBidAmount: number;
    topBid: FirestoreBid | null;
    bidsByTeam: Record<string, number>;
  } {
    const acceptedBids = this.bids.filter(b => b.status === 'accepted');
    
    const bidsByTeam: Record<string, number> = {};
    acceptedBids.forEach(bid => {
      bidsByTeam[bid.teamName] = (bidsByTeam[bid.teamName] || 0) + 1;
    });

    const topBid = acceptedBids.length > 0 
      ? acceptedBids.reduce((max, bid) => bid.amount > max.amount ? bid : max)
      : null;

    return {
      totalBids: acceptedBids.length,
      avgBidAmount: acceptedBids.length > 0 
        ? acceptedBids.reduce((sum, b) => sum + b.amount, 0) / acceptedBids.length 
        : 0,
      topBid,
      bidsByTeam,
    };
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    listeners.forEach((unsubscribe) => unsubscribe());
    listeners.clear();
    this.stateListeners.clear();
    this.bidListeners.clear();
  }
}

// Export singleton instance
export const firebaseService = new FirebaseService();
export default firebaseService;
