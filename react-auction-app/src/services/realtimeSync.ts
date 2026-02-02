// ============================================================================
// FIREBASE REALTIME DATABASE SYNC SERVICE
// Production-ready cross-device synchronization using Firebase Realtime Database
// Works across different devices over internet (not limited to same browser)
// ============================================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  push,
  type Database,
  type Unsubscribe,
} from 'firebase/database';
import type { Player, Team } from '../types';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  databaseURL:
    'https://e-auction-store-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  messagingSenderId: '830797180032',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
  measurementId: 'G-FER452EYST',
};

// Database paths
const AUCTION_STATE_PATH = 'auction/currentState';
const MOBILE_BIDS_PATH = 'auction/mobileBids';
const SESSION_RESET_PATH = 'auction/sessionReset';

// Simplified auction state for real-time sync
export interface RealtimeAuctionState {
  currentPlayer: {
    id: string;
    name: string;
    role: string;
    imageUrl: string;
    basePrice: number;
  } | null;
  currentBid: number;
  selectedTeam: {
    id: string;
    name: string;
    logoUrl: string;
    primaryColor?: string;
    secondaryColor?: string;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    logoUrl: string;
    remainingPurse: number;
    playersBought: number;
    totalPlayerThreshold: number;
    primaryColor?: string;
    secondaryColor?: string;
  }>;
  auctionActive: boolean;
  lastUpdate: number;
  sessionId: string;
}

// Mobile bid event
export interface RealtimeMobileBid {
  id?: string;
  type: 'raise' | 'stop';
  teamId: string;
  teamName: string;
  amount: number;
  playerId: string;
  timestamp: number;
  clientId: string;
  processed: boolean;
}

// Session reset event
export interface RealtimeSessionReset {
  timestamp: number;
  sessionId: string;
  reason?: string;
}

// Listeners
type StateListener = (state: RealtimeAuctionState) => void;
type BidListener = (bid: RealtimeMobileBid) => void;
type SessionResetListener = (reset: RealtimeSessionReset) => void;

/**
 * Firebase Realtime Database Sync Service
 * Provides instant cross-device synchronization
 */
class RealtimeSyncService {
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  private isInitialized = false;
  private readonly sessionId: string;
  private role: 'desktop' | 'mobile' = 'desktop';
  
  // Listeners
  private readonly stateListeners = new Set<StateListener>();
  private readonly bidListeners = new Set<BidListener>();
  private readonly sessionResetListeners = new Set<SessionResetListener>();
  private unsubscribers: Unsubscribe[] = [];
  
  // Local state cache
  private currentState: RealtimeAuctionState | null = null;
  private readonly processedBidIds = new Set<string>();
  private lastStateUpdate = 0;
  private lastSessionReset = 0;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Initialize Firebase Realtime Database
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      console.log('[RealtimeSync] Initializing Firebase...');
      this.app = initializeApp(firebaseConfig, 'realtime-sync');
      this.db = getDatabase(this.app);
      this.isInitialized = true;
      console.log('[RealtimeSync] Firebase initialized successfully');
      return true;
    } catch (error) {
      // App might already be initialized
      try {
        const { getApp } = await import('firebase/app');
        this.app = getApp('realtime-sync');
        this.db = getDatabase(this.app);
        this.isInitialized = true;
        console.log('[RealtimeSync] Using existing Firebase app');
        return true;
      } catch {
        console.error('[RealtimeSync] Initialization failed:', error);
        return false;
      }
    }
  }

  /**
   * Initialize as Desktop (broadcaster)
   * Desktop writes auction state to Firebase
   */
  async initAsDesktop(): Promise<void> {
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('[RealtimeSync] Failed to initialize as desktop');
      return;
    }
    
    this.role = 'desktop';
    console.log('[RealtimeSync] Initialized as DESKTOP');
    
    // Listen for mobile bids
    this.listenForMobileBids();
  }

  /**
   * Initialize as Mobile (receiver)
   * Mobile reads auction state and can submit bids
   */
  async initAsMobile(): Promise<void> {
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('[RealtimeSync] Failed to initialize as mobile');
      return;
    }
    
    this.role = 'mobile';
    console.log('[RealtimeSync] Initialized as MOBILE');
    
    // Listen for state changes
    this.listenForStateChanges();

    // Listen for session reset
    this.listenForSessionReset();
  }

  /**
   * Desktop: Broadcast current auction state to Firebase
   */
  async broadcastState(
    currentPlayer: Player | null,
    currentBid: number,
    selectedTeam: Team | null,
    teams: Team[],
    auctionActive: boolean
  ): Promise<void> {
    if (!this.db || this.role !== 'desktop') {
      return;
    }

    // Throttle updates to prevent excessive writes
    const now = Date.now();
    if (now - this.lastStateUpdate < 100) {
      return;
    }
    this.lastStateUpdate = now;

    const state: RealtimeAuctionState = {
      currentPlayer: currentPlayer ? {
        id: currentPlayer.id,
        name: currentPlayer.name,
        role: currentPlayer.role,
        imageUrl: currentPlayer.imageUrl,
        basePrice: currentPlayer.basePrice,
      } : null,
      currentBid,
      selectedTeam: selectedTeam ? {
        id: selectedTeam.id,
        name: selectedTeam.name,
        logoUrl: selectedTeam.logoUrl,
        primaryColor: selectedTeam.primaryColor,
        secondaryColor: selectedTeam.secondaryColor,
      } : null,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl,
        remainingPurse: t.remainingPurse,
        playersBought: t.playersBought,
        totalPlayerThreshold: t.totalPlayerThreshold,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
      })),
      auctionActive,
      lastUpdate: now,
      sessionId: this.sessionId,
    };

    try {
      await set(ref(this.db, AUCTION_STATE_PATH), state);
      this.currentState = state;
    } catch (error) {
      console.error('[RealtimeSync] Failed to broadcast state:', error);
    }
  }

  /**
   * Mobile: Listen for auction state changes
   */
  private listenForStateChanges(): void {
    if (!this.db) return;

    console.log('[RealtimeSync] Starting state listener...');
    
    const stateRef = ref(this.db, AUCTION_STATE_PATH);
    const unsubscribe = onValue(
      stateRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const state = snapshot.val() as RealtimeAuctionState;
          this.currentState = state;
          console.log('[RealtimeSync] State received:', {
            player: state.currentPlayer?.name,
            bid: state.currentBid,
            team: state.selectedTeam?.name,
            active: state.auctionActive,
          });
          this.notifyStateListeners(state);
        } else {
          console.log('[RealtimeSync] No auction state found');
        }
      },
      (error) => {
        console.error('[RealtimeSync] State listener error:', error);
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Desktop: Listen for mobile bids
   */
  private listenForMobileBids(): void {
    if (!this.db) return;

    console.log('[RealtimeSync] Starting bid listener...');
    
    const bidsRef = ref(this.db, MOBILE_BIDS_PATH);
    const unsubscribe = onValue(
      bidsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          snapshot.forEach((childSnapshot) => {
            const bid = { 
              id: childSnapshot.key, 
              ...childSnapshot.val() 
            } as RealtimeMobileBid;
            
            // Only process unprocessed bids that we haven't seen
            if (!bid.processed && bid.id && !this.processedBidIds.has(bid.id)) {
              this.processedBidIds.add(bid.id);
              console.log('[RealtimeSync] Mobile bid received:', bid);
              this.notifyBidListeners(bid);
              
              // Mark as processed
              if (bid.id) {
                set(ref(this.db!, `${MOBILE_BIDS_PATH}/${bid.id}/processed`), true)
                  .catch(err => console.warn('[RealtimeSync] Failed to mark bid processed:', err));
              }
            }
          });
          
          // Keep processed IDs set manageable
          if (this.processedBidIds.size > 100) {
            const ids = Array.from(this.processedBidIds);
            this.processedBidIds.clear();
            ids.slice(-50).forEach(id => this.processedBidIds.add(id));
          }
        }
      },
      (error) => {
        console.error('[RealtimeSync] Bid listener error:', error);
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Mobile: Listen for session reset events
   */
  private listenForSessionReset(): void {
    if (!this.db) return;

    const resetRef = ref(this.db, SESSION_RESET_PATH);
    const unsubscribe = onValue(
      resetRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const reset = snapshot.val() as RealtimeSessionReset;
          if (reset.timestamp && reset.timestamp > this.lastSessionReset) {
            this.lastSessionReset = reset.timestamp;
            this.notifySessionResetListeners(reset);
          }
        }
      },
      (error) => {
        console.error('[RealtimeSync] Session reset listener error:', error);
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Mobile: Submit a bid
   */
  async submitMobileBid(
    team: { id: string; name: string },
    amount: number,
    playerId: string,
    type: 'raise' | 'stop' = 'raise'
  ): Promise<boolean> {
    if (!this.db) {
      console.warn('[RealtimeSync] Cannot submit bid - not initialized');
      return false;
    }

    const bid: Omit<RealtimeMobileBid, 'id'> = {
      type,
      teamId: team.id,
      teamName: team.name,
      amount,
      playerId,
      timestamp: Date.now(),
      clientId: this.sessionId,
      processed: false,
    };

    try {
      const newBidRef = push(ref(this.db, MOBILE_BIDS_PATH));
      await set(newBidRef, bid);
      console.log('[RealtimeSync] Bid submitted:', newBidRef.key);
      return true;
    } catch (error) {
      console.error('[RealtimeSync] Failed to submit bid:', error);
      return false;
    }
  }

  /**
   * Desktop: Broadcast session reset event (forces mobile logout)
   */
  async broadcastSessionReset(reason?: string): Promise<void> {
    if (!this.db || this.role !== 'desktop') {
      return;
    }

    const reset: RealtimeSessionReset = {
      timestamp: Date.now(),
      sessionId: this.sessionId,
      reason,
    };

    try {
      await set(ref(this.db, SESSION_RESET_PATH), reset);
      this.lastSessionReset = reset.timestamp;
    } catch (error) {
      console.error('[RealtimeSync] Failed to broadcast session reset:', error);
    }
  }

  /**
   * Get current cached state
   */
  getCurrentState(): RealtimeAuctionState | null {
    return this.currentState;
  }

  /**
   * Check if auction is active
   */
  isAuctionActive(): boolean {
    return this.currentState?.auctionActive ?? false;
  }

  /**
   * Check if desktop is connected (has recent state update)
   */
  isDesktopConnected(): boolean {
    if (!this.currentState) return false;
    const now = Date.now();
    // Consider connected if last update was within 10 seconds
    return (now - this.currentState.lastUpdate) < 10000;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    
    // Immediately notify with current state if available
    if (this.currentState) {
      listener(this.currentState);
    }
    
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Subscribe to mobile bids (for desktop)
   */
  onMobileBid(listener: BidListener): () => void {
    this.bidListeners.add(listener);
    return () => {
      this.bidListeners.delete(listener);
    };
  }

  /**
   * Subscribe to session reset events (mobile)
   */
  onSessionReset(listener: SessionResetListener): () => void {
    this.sessionResetListeners.add(listener);

    if (this.lastSessionReset > 0) {
      listener({
        timestamp: this.lastSessionReset,
        sessionId: this.sessionId,
      });
    }

    return () => {
      this.sessionResetListeners.delete(listener);
    };
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(state: RealtimeAuctionState): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[RealtimeSync] State listener error:', error);
      }
    });
  }

  /**
   * Notify bid listeners
   */
  private notifyBidListeners(bid: RealtimeMobileBid): void {
    this.bidListeners.forEach(listener => {
      try {
        listener(bid);
      } catch (error) {
        console.error('[RealtimeSync] Bid listener error:', error);
      }
    });
  }

  /**
   * Notify session reset listeners
   */
  private notifySessionResetListeners(reset: RealtimeSessionReset): void {
    this.sessionResetListeners.forEach(listener => {
      try {
        listener(reset);
      } catch (error) {
        console.error('[RealtimeSync] Session reset listener error:', error);
      }
    });
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    this.stateListeners.clear();
    this.bidListeners.clear();
    this.sessionResetListeners.clear();
    this.processedBidIds.clear();
  }
}

// Singleton instance
export const realtimeSyncService = new RealtimeSyncService();
