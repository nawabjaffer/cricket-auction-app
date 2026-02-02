// ============================================================================
// BROADCAST SYNC HOOKS
// React hooks for instant same-browser tab synchronization
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuctionStore } from '../store';
import { 
  broadcastSyncService, 
  type BroadcastSyncState, 
  type BroadcastMobileBid 
} from '../services/broadcastSync';
import type { Player, Team } from '../types';

/**
 * Hook for Desktop: Broadcasts state changes via BroadcastChannel
 * Call this in the main App component
 */
export function useBroadcastDesktopSync(): void {
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
      broadcastSyncService.initAsDesktop();
      isInitialized.current = true;
      console.log('[useBroadcastDesktopSync] Desktop sync initialized');
    }

    // Subscribe to mobile bids
    const unsubscribe = broadcastSyncService.onMobileBid((bid: BroadcastMobileBid) => {
      console.log('[useBroadcastDesktopSync] Mobile bid received:', bid);
      
      if (bid.type === 'raise') {
        const team = teams.find(t => t.id === bid.teamId);
        if (team) {
          console.log('[useBroadcastDesktopSync] Applying bid from team:', team.name);
          raiseBidForTeam(team);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [teams, raiseBidForTeam]);

  // Broadcast state changes
  useEffect(() => {
    if (!isInitialized.current) return;

    const state: BroadcastSyncState = {
      currentPlayer,
      currentBid,
      selectedTeam,
      teams,
      auctionActive: auctionState.isAuctionActive,
      lastUpdate: Date.now(),
      sessionId: '',
    };

    broadcastSyncService.broadcastState(state);
  }, [currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);
}

/**
 * State interface returned by useBroadcastMobileSync hook
 */
export interface BroadcastMobileSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  auctionActive: boolean;
  isConnected: boolean;
  lastUpdate: number;
  submitBid: (teamId: string, amount: number, type?: 'raise' | 'stop') => void;
}

/**
 * Hook for Mobile: Receives state updates via BroadcastChannel
 */
export function useBroadcastMobileSync(): BroadcastMobileSyncState {
  const [syncState, setSyncState] = useState<BroadcastSyncState>({
    currentPlayer: null,
    currentBid: 0,
    selectedTeam: null,
    teams: [],
    auctionActive: false,
    lastUpdate: 0,
    sessionId: '',
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const isInitialized = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized.current) {
      broadcastSyncService.initAsMobile();
      isInitialized.current = true;
      console.log('[useBroadcastMobileSync] Mobile sync initialized');
    }

    // Subscribe to state updates
    const unsubscribe = broadcastSyncService.onStateUpdate((state) => {
      console.log('[useBroadcastMobileSync] State update received:', {
        player: state.currentPlayer?.name,
        bid: state.currentBid,
        team: state.selectedTeam?.name,
      });
      setSyncState(state);
      setIsConnected(true);
    });

    // Check connection status periodically
    const connectionCheck = setInterval(() => {
      setIsConnected(broadcastSyncService.isDesktopActive());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(connectionCheck);
    };
  }, []);

  // Submit bid handler
  const submitBid = useCallback((teamId: string, amount: number, type: 'raise' | 'stop' = 'raise') => {
    const team = syncState.teams.find(t => t.id === teamId);
    if (team && syncState.currentPlayer) {
      broadcastSyncService.submitMobileBid(team, amount, syncState.currentPlayer.id, type);
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
