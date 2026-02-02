// ============================================================================
// FIREBASE SYNC HOOKS
// React hooks for real-time cross-device synchronization using Firestore
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuctionStore } from '../store';
import { firebaseSyncService, type FirestoreAuctionState, type MobileBidEvent } from '../services/firebaseSync';
import type { Player, Team } from '../types';

/**
 * Hook for Desktop: Broadcasts state changes to Firebase
 * Call this in the main App component on the desktop
 */
export function useFirebaseDesktopSync(): void {
  const currentPlayer = useAuctionStore(state => state.currentPlayer);
  const currentBid = useAuctionStore(state => state.currentBid);
  const selectedTeam = useAuctionStore(state => state.selectedTeam);
  const teams = useAuctionStore(state => state.teams);
  const raiseBidForTeam = useAuctionStore(state => state.raiseBidForTeam);
  const auctionState = useAuctionStore(state => state.auctionState);
  
  const isInitialized = useRef(false);
  const processedBidIds = useRef<Set<string>>(new Set());

  // Initialize Firebase as desktop on mount
  useEffect(() => {
    if (!isInitialized.current) {
      firebaseSyncService.initAsDesktop();
      isInitialized.current = true;
      console.log('[useFirebaseDesktopSync] Desktop sync initialized');
    }

    // Subscribe to mobile bids
    const unsubscribe = firebaseSyncService.onMobileBid((bid: MobileBidEvent) => {
      // Prevent processing same bid twice
      if (bid.id && processedBidIds.current.has(bid.id)) {
        return;
      }
      if (bid.id) {
        processedBidIds.current.add(bid.id);
      }

      console.log('[useFirebaseDesktopSync] Mobile bid received:', bid);
      
      if (bid.type === 'raise') {
        // Find the team and apply the bid
        const team = teams.find(t => t.id === bid.teamId);
        if (team) {
          console.log('[useFirebaseDesktopSync] Applying bid from team:', team.name);
          raiseBidForTeam(team);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [teams, raiseBidForTeam]);

  // Broadcast state changes to Firebase
  useEffect(() => {
    if (!isInitialized.current) return;

    firebaseSyncService.broadcastState(
      currentPlayer,
      currentBid,
      selectedTeam,
      teams,
      auctionState.isAuctionActive
    );
    
    console.log('[useFirebaseDesktopSync] State broadcasted:', {
      player: currentPlayer?.name,
      bid: currentBid,
      team: selectedTeam?.name,
      active: auctionState.isAuctionActive,
    });
  }, [currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't dispose to allow reconnection
    };
  }, []);
}

/**
 * State interface returned by useFirebaseMobileSync hook
 */
export interface FirebaseMobileSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  auctionActive: boolean;
  isConnected: boolean;
  lastUpdate: Date | null;
  submitBid: (teamId: string, amount: number, type?: 'raise' | 'stop') => void;
}

/**
 * Hook for Mobile: Receives state updates from Firebase
 * Returns the synced auction state for mobile bidding UI
 */
export function useFirebaseMobileSync(): FirebaseMobileSyncState {
  const [syncState, setSyncState] = useState<{
    currentPlayer: Player | null;
    currentBid: number;
    selectedTeam: Team | null;
    teams: Team[];
    auctionActive: boolean;
    lastUpdate: Date | null;
  }>({
    currentPlayer: null,
    currentBid: 0,
    selectedTeam: null,
    teams: [],
    auctionActive: false,
    lastUpdate: null,
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const isInitialized = useRef(false);

  // Initialize Firebase as mobile on mount
  useEffect(() => {
    if (!isInitialized.current) {
      firebaseSyncService.initAsMobile();
      isInitialized.current = true;
      console.log('[useFirebaseMobileSync] Mobile sync initialized');
    }

    // Subscribe to state updates
    const unsubscribe = firebaseSyncService.onStateChange((state: FirestoreAuctionState) => {
      console.log('[useFirebaseMobileSync] State update received:', state);
      
      // Convert Firestore state to local state
      const currentPlayer: Player | null = state.currentPlayer ? {
        id: state.currentPlayer.id,
        name: state.currentPlayer.name,
        role: state.currentPlayer.role as Player['role'],
        imageUrl: state.currentPlayer.imageUrl,
        basePrice: state.currentPlayer.basePrice,
        age: null,
        matches: '',
        runs: '',
        wickets: '',
        battingBestFigures: '',
        bowlingBestFigures: '',
      } : null;

      const selectedTeam: Team | null = state.selectedTeam ? {
        id: state.selectedTeam.id,
        name: state.selectedTeam.name,
        logoUrl: state.selectedTeam.logoUrl,
        primaryColor: state.selectedTeam.primaryColor,
        secondaryColor: state.selectedTeam.secondaryColor,
        playersBought: 0,
        totalPlayerThreshold: 25,
        remainingPlayers: 25,
        allocatedAmount: 12000,
        remainingPurse: 12000,
        highestBid: 0,
        captain: '',
        underAgePlayers: 0,
      } : null;

      const teams: Team[] = state.teams.map(t => ({
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        playersBought: t.playersBought,
        totalPlayerThreshold: t.totalPlayerThreshold,
        remainingPlayers: t.totalPlayerThreshold - t.playersBought,
        allocatedAmount: 12000,
        remainingPurse: t.remainingPurse,
        highestBid: 0,
        captain: '',
        underAgePlayers: 0,
      }));

      setSyncState({
        currentPlayer,
        currentBid: state.currentBid,
        selectedTeam,
        teams,
        auctionActive: state.auctionActive,
        lastUpdate: state.lastUpdate ? state.lastUpdate.toDate() : new Date(),
      });
      
      setIsConnected(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Submit bid handler
  const submitBid = useCallback((teamId: string, amount: number, type: 'raise' | 'stop' = 'raise') => {
    const team = syncState.teams.find(t => t.id === teamId);
    if (team && syncState.currentPlayer) {
      firebaseSyncService.submitMobileBid(
        { id: team.id, name: team.name },
        amount,
        syncState.currentPlayer.id,
        type
      );
    }
  }, [syncState.teams, syncState.currentPlayer]);

  return {
    currentPlayer: syncState.currentPlayer,
    currentBid: syncState.currentBid,
    selectedTeam: syncState.selectedTeam,
    teams: syncState.teams,
    auctionActive: syncState.auctionActive,
    isConnected,
    lastUpdate: syncState.lastUpdate,
    submitBid,
  };
}
