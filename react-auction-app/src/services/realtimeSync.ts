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
import { tenantPath } from './tenantPath';

const IS_DEV = import.meta.env.DEV;

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

// Tenant-scoped database paths. All paths are resolved lazily so that switching
// the active tenant at runtime immediately reroutes reads/writes to the new
// tournament namespace.
const AUCTION_STATE_PATH          = () => tenantPath('auction/currentState');
const MOBILE_BIDS_PATH            = () => tenantPath('auction/mobileBids');
const SESSION_RESET_PATH          = () => tenantPath('auction/sessionReset');
const BROADCAST_CONTROL_PATH      = () => tenantPath('auction/broadcastControl');
const CAMERA_CONFIG_PATH          = () => tenantPath('auction/cameraConfig');
const MOBILE_BIDDING_CONFIG_PATH  = () => tenantPath('auction/mobileBiddingConfig');

// Broadcast control state (synced from /live-admin to /live)
export type BroadcastMode = 'auction' | 'break' | 'ad' | 'standings' | 'teamSquad';
export type BroadcastTransition = 'cut' | 'fade' | 'slide' | 'zoom';
export type CameraLayoutMode = 'single' | 'pip' | 'split' | 'quad';

export interface BroadcastControlState {
  mode: BroadcastMode;
  breakDuration?: number;
  breakStartedAt?: number;
  activeSponsorId?: string;
  sponsorDisplayDuration?: number; // seconds per sponsor in center (10-60)
  transition?: BroadcastTransition;
  cameraLayout?: CameraLayoutMode;
  // Team stats panel (mode === 'standings'): which team is focused.
  selectedTeamId?: string | null;
  // Team squad view (mode === 'teamSquad'): which team's squad is shown.
  teamSquadTeamId?: string | null;
  lastUpdate: number;
}

// Persisted camera configuration (saved from /live-admin, consumed by /live)
export interface PersistedCameraConfig {
  deviceIds: string[];
  layout: CameraLayoutMode;
  primaryDeviceId?: string;
  lastUpdate: number;
}

// Mobile bidding configuration (saved from /live-admin, consumed by /connect-bidding)
export interface MobileBiddingConfig {
  maxStatsToShow: number;
  enableRaiseBid: boolean;
  enableStopBidding: boolean;
}

// Simplified auction state for real-time sync
export interface RealtimeAuctionState {
  currentPlayer: {
    id: string;
    name: string;
    role: string;
    imageUrl: string;
    basePrice: number;
    age?: number | null;
    matches?: string;
    runs?: string;
    wickets?: string;
    battingBestFigures?: string;
    bowlingBestFigures?: string;
    battingStats?: {
      matches: string; innings: string; notOut: string; runs: string;
      highestScore: string; average: string; strikeRate: string;
      thirties: string; fifties: string; hundreds: string; fours: string; sixes: string;
    };
    bowlingStats?: {
      matches: string; innings: string; overs: string; maidens: string;
      runs: string; wickets: string; bestBowling: string;
      threeWickets: string; fiveWickets: string;
      economy: string; strikeRate: string; average: string;
    };
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
    allocatedAmount?: number;
    highestBid?: number;
    captain?: string;
    underAgePlayers?: number;
  }>;
  auctionActive: boolean;
  activeOverlay: 'sold' | 'unsold' | null;
  bidHistory: Array<{
    teamId: string;
    teamName: string;
    teamLogoUrl?: string;
    amount: number;
    timestamp: string;
  }>;
  lastUpdate: number;
  sessionId: string;
  // Mobile bidding configuration
  mobileBiddingConfig?: {
    maxStatsToShow: number;
    enableRaiseBid: boolean;
    enableStopBidding: boolean;
  };
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
  // Guards: ensure each Firebase subscription is attached at most once even if
  // `initAsDesktop` / `initAsMobile` are called multiple times across pages.
  private _stateListenerAttached = false;
  private _bidListenerAttached = false;
  private _sessionResetListenerAttached = false;
  
  // Local state cache
  private currentState: RealtimeAuctionState | null = null;
  private readonly processedBidIds = new Set<string>();
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
      if (IS_DEV) console.log('[RealtimeSync] Initializing Firebase...');
      this.app = initializeApp(firebaseConfig, 'realtime-sync');
      this.db = getDatabase(this.app);
      this.isInitialized = true;
      if (IS_DEV) console.log('[RealtimeSync] Firebase initialized successfully');
      return true;
    } catch (error) {
      // App might already be initialized
      try {
        const { getApp } = await import('firebase/app');
        this.app = getApp('realtime-sync');
        this.db = getDatabase(this.app);
        this.isInitialized = true;
        if (IS_DEV) console.log('[RealtimeSync] Using existing Firebase app');
        return true;
      } catch {
        console.error('[RealtimeSync] Initialization failed:', error);
        return false;
      }
    }
  }

  /**
   * Ensure Firebase is initialized (for admin/services use)
   */
  async ensureInitialized(): Promise<boolean> {
    return this.initialize();
  }

  /**
   * Initialize as Desktop (broadcaster)
   * Desktop writes auction state to Firebase.
   * NOTE: Desktop role is "sticky" — once set we never downgrade to 'mobile'.
   * This protects the broadcaster singleton from being clobbered when another
   * page (e.g. /live) incidentally calls `initAsMobile()`.
   */
  async initAsDesktop(): Promise<void> {
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('[RealtimeSync] Failed to initialize as desktop');
      return;
    }

    this.role = 'desktop';
    if (IS_DEV) console.log('[RealtimeSync] Initialized as DESKTOP');

    // Listen for mobile bids
    this.listenForMobileBids();
  }

  /**
   * Initialize as Mobile (receiver)
   * Mobile reads auction state and can submit bids.
   * If this instance is already acting as desktop (same tab), we do NOT flip
   * the role — mobile-only listeners are still attached so state/reset
   * subscriptions work, but desktop broadcasts keep flowing.
   */
  async initAsMobile(): Promise<void> {
    const initialized = await this.initialize();
    if (!initialized) {
      console.error('[RealtimeSync] Failed to initialize as mobile');
      return;
    }

    if (this.role !== 'desktop') {
      this.role = 'mobile';
    }
    if (IS_DEV) console.log('[RealtimeSync] Initialized as MOBILE (role =', this.role, ')');

    // Listen for state changes (idempotent)
    this.listenForStateChanges();

    // Listen for session reset (idempotent)
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
    auctionActive: boolean,
    activeOverlay?: 'sold' | 'unsold' | null,
    bidHistory?: Array<{ teamId: string; teamName: string; teamLogoUrl?: string; amount: number; timestamp: string }>
  ): Promise<void> {
    if (!this.db || this.role !== 'desktop') {
      return;
    }

    const now = Date.now();

    const state: RealtimeAuctionState = {
      currentPlayer: currentPlayer ? {
        id: currentPlayer.id,
        name: currentPlayer.name,
        role: currentPlayer.role,
        imageUrl: currentPlayer.imageUrl,
        basePrice: currentPlayer.basePrice,
        age: currentPlayer.age ?? null,
        matches: currentPlayer.matches,
        runs: currentPlayer.runs,
        wickets: currentPlayer.wickets,
        battingBestFigures: currentPlayer.battingBestFigures,
        bowlingBestFigures: currentPlayer.bowlingBestFigures,
        ...(currentPlayer.battingStats ? { battingStats: currentPlayer.battingStats } : {}),
        ...(currentPlayer.bowlingStats ? { bowlingStats: currentPlayer.bowlingStats } : {}),
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
        allocatedAmount: t.allocatedAmount,
        highestBid: t.highestBid,
        captain: t.captain,
        underAgePlayers: t.underAgePlayers,
      })),
      auctionActive,
      activeOverlay: activeOverlay ?? null,
      bidHistory: (bidHistory ?? []).map(b => ({
        teamId: b.teamId,
        teamName: b.teamName,
        teamLogoUrl: b.teamLogoUrl ?? '',
        amount: b.amount,
        timestamp: b.timestamp,
      })),
      lastUpdate: now,
      sessionId: this.sessionId,
    };

    try {
      await set(ref(this.db, AUCTION_STATE_PATH()), state);
      this.currentState = state;
    } catch (error) {
      console.error('[RealtimeSync] Failed to broadcast state:', error);
    }
  }

  /**
   * Mobile: Listen for auction state changes
   */
  private listenForStateChanges(): void {
    if (!this.db || this._stateListenerAttached) return;
    this._stateListenerAttached = true;

    if (IS_DEV) console.log('[RealtimeSync] Starting state listener...');
    
    const stateRef = ref(this.db, AUCTION_STATE_PATH());
    const unsubscribe = onValue(
      stateRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const state = snapshot.val() as RealtimeAuctionState;
          this.currentState = state;
          if (IS_DEV) {
            console.log('[RealtimeSync] State received:', {
              player: state.currentPlayer?.name,
              bid: state.currentBid,
              team: state.selectedTeam?.name,
              active: state.auctionActive,
            });
          }
          this.notifyStateListeners(state);
        } else {
          if (IS_DEV) console.log('[RealtimeSync] No auction state found');
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
    if (!this.db || this._bidListenerAttached) return;
    this._bidListenerAttached = true;

    if (IS_DEV) console.log('[RealtimeSync] Starting bid listener...');
    
    const bidsRef = ref(this.db, MOBILE_BIDS_PATH());
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
              if (IS_DEV) console.log('[RealtimeSync] Mobile bid received:', bid);
              this.notifyBidListeners(bid);
              
              // Mark as processed
              if (bid.id) {
                set(ref(this.db!, `${MOBILE_BIDS_PATH()}/${bid.id}/processed`), true)
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
    if (!this.db || this._sessionResetListenerAttached) return;
    this._sessionResetListenerAttached = true;

    const resetRef = ref(this.db, SESSION_RESET_PATH());
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
      const newBidRef = push(ref(this.db, MOBILE_BIDS_PATH()));
      await set(newBidRef, bid);
      if (IS_DEV) console.log('[RealtimeSync] Bid submitted:', newBidRef.key);
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
      await set(ref(this.db, SESSION_RESET_PATH()), reset);
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

  /**   * Get database instance (for use by other services)
   */
  getDatabase(): Database | null {
    return this.db;
  }

  /**   * Cleanup
   */
  dispose(): void {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
    this.stateListeners.clear();
    this.bidListeners.clear();
    this.sessionResetListeners.clear();
    this.processedBidIds.clear();
  }

  /**
   * Set broadcast control state (from /live-admin)
   */
  async setBroadcastControl(control: BroadcastControlState): Promise<void> {
    if (!this.db) {
      await this.ensureInitialized();
    }
    if (!this.db) return;

    try {
      await set(ref(this.db, BROADCAST_CONTROL_PATH()), control);
    } catch (error) {
      console.error('[RealtimeSync] Failed to set broadcast control:', error);
    }
  }

  /**
   * Subscribe to broadcast control changes (on /live page)
   */
  subscribeBroadcastControl(callback: (control: BroadcastControlState | null) => void): () => void {
    let unsubRef: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      if (!this.db) {
        await this.ensureInitialized();
      }
      if (!this.db || cancelled) return;

      const controlRef = ref(this.db, BROADCAST_CONTROL_PATH());
      unsubRef = onValue(controlRef, (snapshot) => {
        callback(snapshot.exists() ? snapshot.val() as BroadcastControlState : null);
      });
      this.unsubscribers.push(unsubRef);
    };

    setup();

    return () => {
      cancelled = true;
      unsubRef?.();
    };
  }

  /**
   * Subscribe to auction state changes directly from RTDB.
   * Unlike onStateChange(), this creates its own Firebase listener on
   * `auction/currentState` — safe for any page/role without calling
   * initAsMobile() or initAsDesktop().
   */
  subscribeAuctionState(callback: (state: RealtimeAuctionState | null) => void): () => void {
    let unsubRef: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      if (!this.db) {
        await this.ensureInitialized();
      }
      if (!this.db || cancelled) return;

      const stateRef = ref(this.db, AUCTION_STATE_PATH());
      unsubRef = onValue(stateRef, (snapshot) => {
        callback(snapshot.exists() ? snapshot.val() as RealtimeAuctionState : null);
      });
      this.unsubscribers.push(unsubRef);
    };

    setup();

    return () => {
      cancelled = true;
      unsubRef?.();
    };
  }

  /**
   * Save camera configuration to Firebase (from /live-admin)
   */
  async saveCameraConfig(config: PersistedCameraConfig): Promise<void> {
    if (!this.db) {
      await this.ensureInitialized();
    }
    if (!this.db) return;

    try {
      await set(ref(this.db, CAMERA_CONFIG_PATH()), config);
    } catch (error) {
      console.error('[RealtimeSync] Failed to save camera config:', error);
    }
  }

  /**
   * Subscribe to camera config changes (on /live page)
   */
  subscribeCameraConfig(callback: (config: PersistedCameraConfig | null) => void): () => void {
    let unsubRef: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      if (!this.db) {
        await this.ensureInitialized();
      }
      if (!this.db || cancelled) return;

      const configRef = ref(this.db, CAMERA_CONFIG_PATH());
      unsubRef = onValue(configRef, (snapshot) => {
        callback(snapshot.exists() ? snapshot.val() as PersistedCameraConfig : null);
      });
      this.unsubscribers.push(unsubRef);
    };

    setup();

    return () => {
      cancelled = true;
      unsubRef?.();
    };
  }

  /**
   * Save mobile bidding config (from /live-admin)
   */
  async saveMobileBiddingConfig(config: MobileBiddingConfig): Promise<void> {
    if (!this.db) {
      await this.ensureInitialized();
    }
    if (!this.db) return;

    try {
      await set(ref(this.db, MOBILE_BIDDING_CONFIG_PATH()), config);
    } catch (error) {
      console.error('[RealtimeSync] Failed to save mobile bidding config:', error);
    }
  }

  /**
   * Subscribe to mobile bidding config changes
   */
  subscribeMobileBiddingConfig(callback: (config: MobileBiddingConfig | null) => void): () => void {
    let unsubRef: (() => void) | null = null;
    let cancelled = false;

    const setup = async () => {
      if (!this.db) {
        await this.ensureInitialized();
      }
      if (!this.db || cancelled) return;

      const configRef = ref(this.db, MOBILE_BIDDING_CONFIG_PATH());
      unsubRef = onValue(configRef, (snapshot) => {
        callback(snapshot.exists() ? snapshot.val() as MobileBiddingConfig : null);
      });
      this.unsubscribers.push(unsubRef);
    };

    setup();

    return () => {
      cancelled = true;
      unsubRef?.();
    };
  }
}

// Singleton instance
export const realtimeSync = new RealtimeSyncService();

// Legacy export for backwards compatibility
export const realtimeSyncService = realtimeSync;
