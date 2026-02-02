// ============================================================================
// FIREBASE FIRESTORE REAL-TIME SYNC SERVICE
// Production-ready cross-device synchronization for auction bidding
// ============================================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore';
import type { Player, Team } from '../types';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBazxXTsWddS3r_i-0VhUaC2QqknheEzpQ',
  authDomain: 'e-auction-store.firebaseapp.com',
  projectId: 'e-auction-store',
  storageBucket: 'e-auction-store.firebasestorage.app',
  messagingSenderId: '830797180032',
  appId: '1:830797180032:web:a0f0a92678ecc36fedca65',
  measurementId: 'G-FER452EYST',
};

// Document paths
const AUCTION_STATE_DOC = 'auction/currentState';
const MOBILE_BIDS_COLLECTION = 'auction/currentState/mobileBids';

// Auction state stored in Firestore
export interface FirestoreAuctionState {
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
  lastUpdate: Timestamp | null;
  sessionId: string;
}

// Mobile bid event
export interface MobileBidEvent {
  id?: string;
  type: 'raise' | 'stop';
  teamId: string;
  teamName: string;
  amount: number;
  playerId: string;
  timestamp: Timestamp | null;
  clientId: string;
  processed: boolean;
}

// Listeners
type StateListener = (state: FirestoreAuctionState) => void;
type BidListener = (bid: MobileBidEvent) => void;

/**
 * Firebase Sync Service
 * Provides real-time cross-device synchronization using Firestore
 */
class FirebaseSyncService {
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private isInitialized = false;
  private readonly sessionId: string;
  private role: 'desktop' | 'mobile' = 'desktop';
  
  // Listeners
  private readonly stateListeners = new Set<StateListener>();
  private readonly bidListeners = new Set<BidListener>();
  private unsubscribers: Unsubscribe[] = [];
  
  // Local state cache
  private currentState: FirestoreAuctionState | null = null;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Initialize Firebase
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      this.app = initializeApp(firebaseConfig);
      this.db = getFirestore(this.app);
      this.isInitialized = true;
      console.log('[FirebaseSync] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[FirebaseSync] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Initialize as Desktop (broadcaster)
   * Desktop writes auction state to Firestore
   */
  async initAsDesktop(): Promise<void> {
    await this.initialize();
    this.role = 'desktop';
    console.log('[FirebaseSync] Initialized as DESKTOP');
    
    // Listen for mobile bids
    this.listenForMobileBids();
  }

  /**
   * Initialize as Mobile (receiver)
   * Mobile reads auction state and can submit bids
   */
  async initAsMobile(): Promise<void> {
    await this.initialize();
    this.role = 'mobile';
    console.log('[FirebaseSync] Initialized as MOBILE');
    
    // Listen for state changes
    this.listenForStateChanges();
  }

  /**
   * Desktop: Broadcast current auction state to Firestore
   */
  async broadcastState(
    currentPlayer: Player | null,
    currentBid: number,
    selectedTeam: Team | null,
    teams: Team[],
    auctionActive: boolean
  ): Promise<void> {
    if (!this.db || this.role !== 'desktop') {
      console.warn('[FirebaseSync] Cannot broadcast - not initialized as desktop');
      return;
    }

    const state: FirestoreAuctionState = {
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
      lastUpdate: serverTimestamp() as Timestamp,
      sessionId: this.sessionId,
    };

    try {
      await setDoc(doc(this.db, AUCTION_STATE_DOC), state);
      console.log('[FirebaseSync] State broadcasted:', {
        player: currentPlayer?.name,
        bid: currentBid,
        team: selectedTeam?.name,
      });
    } catch (error) {
      console.error('[FirebaseSync] Failed to broadcast state:', error);
    }
  }

  /**
   * Mobile: Listen for auction state changes
   */
  private listenForStateChanges(): void {
    if (!this.db) return;

    const unsubscribe = onSnapshot(
      doc(this.db, AUCTION_STATE_DOC),
      (snapshot) => {
        if (snapshot.exists()) {
          const state = snapshot.data() as FirestoreAuctionState;
          this.currentState = state;
          console.log('[FirebaseSync] State received:', {
            player: state.currentPlayer?.name,
            bid: state.currentBid,
            team: state.selectedTeam?.name,
          });
          this.notifyStateListeners(state);
        }
      },
      (error) => {
        console.error('[FirebaseSync] State listener error:', error);
      }
    );

    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Desktop: Listen for mobile bids
   */
  private listenForMobileBids(): void {
    if (!this.db) return;

    const bidsQuery = query(
      collection(this.db, MOBILE_BIDS_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      bidsQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const bid = { id: change.doc.id, ...change.doc.data() } as MobileBidEvent;
            if (!bid.processed) {
              console.log('[FirebaseSync] Mobile bid received:', bid);
              this.notifyBidListeners(bid);
            }
          }
        });
      },
      (error) => {
        console.error('[FirebaseSync] Bid listener error:', error);
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
  ): Promise<void> {
    if (!this.db) {
      console.warn('[FirebaseSync] Cannot submit bid - not initialized');
      return;
    }

    const bid: Omit<MobileBidEvent, 'id'> = {
      type,
      teamId: team.id,
      teamName: team.name,
      amount,
      playerId,
      timestamp: serverTimestamp() as Timestamp,
      clientId: this.sessionId,
      processed: false,
    };

    try {
      const docRef = await addDoc(collection(this.db, MOBILE_BIDS_COLLECTION), bid);
      console.log('[FirebaseSync] Bid submitted:', docRef.id);
    } catch (error) {
      console.error('[FirebaseSync] Failed to submit bid:', error);
    }
  }

  /**
   * Get current cached state
   */
  getCurrentState(): FirestoreAuctionState | null {
    return this.currentState;
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
    
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Subscribe to mobile bids (for desktop)
   */
  onMobileBid(listener: BidListener): () => void {
    this.bidListeners.add(listener);
    return () => this.bidListeners.delete(listener);
  }

  /**
   * Notify state listeners
   */
  private notifyStateListeners(state: FirestoreAuctionState): void {
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[FirebaseSync] State listener error:', error);
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
        console.error('[FirebaseSync] Bid listener error:', error);
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
  }
}

// Singleton instance
export const firebaseSyncService = new FirebaseSyncService();
