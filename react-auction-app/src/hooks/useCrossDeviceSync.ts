// ============================================================================
// CROSS-DEVICE SYNC HOOK
// Integrates syncService with Zustand store for real-time cross-device updates
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { useAuctionStore } from '../store';
import { syncService, type AuctionSyncState, type MobileBidEvent } from '../services/syncService';

/**
 * Hook for Desktop: Broadcasts state changes to mobile devices
 * Call this in the main App component on the desktop
 */
export function useDesktopSync(): void {
  const currentPlayer = useAuctionStore(state => state.currentPlayer);
  const currentBid = useAuctionStore(state => state.currentBid);
  const selectedTeam = useAuctionStore(state => state.selectedTeam);
  const teams = useAuctionStore(state => state.teams);
  const raiseBidForTeam = useAuctionStore(state => state.raiseBidForTeam);
  const auctionState = useAuctionStore(state => state.auctionState);
  
  const isInitialized = useRef(false);

  // Initialize as desktop on mount
  useEffect(() => {
    if (!isInitialized.current) {
      syncService.initAsDesktop();
      isInitialized.current = true;
      console.log('[useDesktopSync] Desktop sync initialized');
    }

    // Subscribe to mobile bids
    const unsubscribe = syncService.onMobileBid((bid: MobileBidEvent) => {
      console.log('[useDesktopSync] Mobile bid received:', bid);
      
      if (bid.type === 'raise') {
        // Find the team and apply the bid
        const team = teams.find(t => t.id === bid.teamId);
        if (team) {
          console.log('[useDesktopSync] Applying bid from team:', team.name);
          raiseBidForTeam(team);
        }
      }
      // 'stop' type bids are informational only
    });

    return () => {
      unsubscribe();
    };
  }, [teams, raiseBidForTeam]);

  // Broadcast state changes
  useEffect(() => {
    if (!isInitialized.current) return;

    const state: AuctionSyncState = {
      currentPlayer,
      currentBid,
      selectedTeam,
      teams,
      auctionActive: auctionState.isAuctionActive,
      lastUpdate: Date.now(),
      sessionId: '',
    };

    syncService.broadcastState(state);
    
    console.log('[useDesktopSync] State broadcasted:', {
      player: currentPlayer?.name,
      bid: currentBid,
      team: selectedTeam?.name,
      active: auctionState.isAuctionActive,
    });
  }, [currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't dispose on unmount to allow reconnection
    };
  }, []);
}

/**
 * State interface returned by useMobileSync hook
 */
export interface MobileSyncState {
  currentPlayer: AuctionSyncState['currentPlayer'];
  currentBid: number;
  selectedTeam: AuctionSyncState['selectedTeam'];
  teams: AuctionSyncState['teams'];
  auctionActive: boolean;
  isConnected: boolean;
  lastUpdate: number;
  submitBid: (teamId: string, amount: number, type?: 'raise' | 'stop') => void;
  refresh: () => void;
}

/**
 * Hook for Mobile: Receives state updates from desktop
 * Returns the synced auction state for mobile bidding UI
 */
export function useMobileSync(): MobileSyncState {
  const [syncState, setSyncState] = React.useState<AuctionSyncState>({
    currentPlayer: null,
    currentBid: 0,
    selectedTeam: null,
    teams: [],
    auctionActive: false,
    lastUpdate: 0,
    sessionId: '',
  });
  
  const [isConnected, setIsConnected] = React.useState(false);
  const isInitialized = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized.current) {
      syncService.initAsMobile();
      isInitialized.current = true;
      console.log('[useMobileSync] Mobile sync initialized');

      // Load initial state from storage
      const initialState = syncService.getStateFromStorage();
      if (initialState) {
        setSyncState(initialState);
        setIsConnected(true);
        console.log('[useMobileSync] Initial state loaded:', initialState);
      }
    }

    // Subscribe to state updates
    const unsubscribe = syncService.onStateUpdate((state) => {
      console.log('[useMobileSync] State update received:', state);
      setSyncState(state);
      setIsConnected(true);
    });

    // Check connection status periodically
    const connectionCheck = setInterval(() => {
      setIsConnected(syncService.isDesktopActive());
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(connectionCheck);
    };
  }, []);

  // Submit bid handler
  const submitBid = useCallback((teamId: string, amount: number, type: 'raise' | 'stop' = 'raise') => {
    const team = syncState.teams.find(t => t.id === teamId);
    if (team && syncState.currentPlayer) {
      syncService.submitMobileBid(team, amount, syncState.currentPlayer.id, type);
    }
  }, [syncState.teams, syncState.currentPlayer]);

  // Manual refresh
  const refresh = useCallback(() => {
    const state = syncService.getStateFromStorage();
    if (state) {
      setSyncState(state);
      setIsConnected(true);
    }
  }, []);

  return {
    currentPlayer: syncState.currentPlayer,
    currentBid: syncState.currentBid,
    selectedTeam: syncState.selectedTeam,
    teams: syncState.teams,
    auctionActive: syncState.auctionActive,
    isConnected,
    lastUpdate: syncState.lastUpdate,
    submitBid,
    refresh,
  };
}

// Need to import React for useState
import * as React from 'react';
