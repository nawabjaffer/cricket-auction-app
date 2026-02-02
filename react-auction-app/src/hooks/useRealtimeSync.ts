// ============================================================================
// REALTIME DATABASE SYNC HOOKS
// React hooks for Firebase Realtime Database cross-device synchronization
// Works across different devices over internet
// ============================================================================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuctionStore } from '../store';
import { 
  realtimeSyncService, 
  type RealtimeAuctionState, 
  type RealtimeMobileBid 
} from '../services/realtimeSync';
import type { Player, Team } from '../types';

/**
 * Hook for Desktop: Broadcasts state changes via Firebase Realtime Database
 * Call this in the main App component
 */
export function useRealtimeDesktopSync(): void {
  const currentPlayer = useAuctionStore(state => state.currentPlayer);
  const currentBid = useAuctionStore(state => state.currentBid);
  const selectedTeam = useAuctionStore(state => state.selectedTeam);
  const teams = useAuctionStore(state => state.teams);
  const raiseBidForTeam = useAuctionStore(state => state.raiseBidForTeam);
  const auctionState = useAuctionStore(state => state.auctionState);
  
  const isInitialized = useRef(false);
  const teamsRef = useRef(teams);
  const currentPlayerRef = useRef(currentPlayer);
  const currentBidRef = useRef(currentBid);
  const selectedTeamRef = useRef(selectedTeam);
  const auctionActiveRef = useRef(auctionState.isAuctionActive);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  
  // Keep teams ref updated
  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  // Keep state refs updated for heartbeat broadcasts
  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
    currentBidRef.current = currentBid;
    selectedTeamRef.current = selectedTeam;
    auctionActiveRef.current = auctionState.isAuctionActive;
  }, [currentPlayer, currentBid, selectedTeam, auctionState.isAuctionActive]);

  // Initialize as desktop on mount - ensure it completes
  useEffect(() => {
    if (!isInitialized.current && !initPromiseRef.current) {
      isInitialized.current = true;
      
      initPromiseRef.current = realtimeSyncService.initAsDesktop().then(() => {
        console.log('[useRealtimeDesktopSync] ✅ Desktop sync initialized and ready');
        
        // Force an immediate state broadcast after initialization
        setTimeout(() => {
          console.log('[useRealtimeDesktopSync] 📡 Broadcasting initial state...');
          realtimeSyncService.broadcastState(
            currentPlayer,
            currentBid,
            selectedTeam,
            teams,
            auctionState.isAuctionActive
          );
        }, 500);
      }).catch(error => {
        console.error('[useRealtimeDesktopSync] ❌ Failed to initialize:', error);
      });
    }

    // Subscribe to mobile bids
    const unsubscribe = realtimeSyncService.onMobileBid((bid: RealtimeMobileBid) => {
      console.log('[useRealtimeDesktopSync] 📱 Mobile bid received:', bid);
      
      if (bid.type === 'raise') {
        const team = teamsRef.current.find(t => t.id === bid.teamId);
        if (team) {
          console.log('[useRealtimeDesktopSync] ✅ Applying bid from team:', team.name);
          raiseBidForTeam(team);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [raiseBidForTeam, currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);

  // Broadcast state changes
  useEffect(() => {
    if (!isInitialized.current) return;
    if (!realtimeSyncService.isReady()) {
      console.log('[useRealtimeDesktopSync] ⏳ Service not ready yet, waiting...');
      return;
    }

    console.log('[useRealtimeDesktopSync] 📡 Broadcasting state update...', {
      player: currentPlayer?.name,
      bid: currentBid,
      team: selectedTeam?.name,
      active: auctionState.isAuctionActive,
    });

    realtimeSyncService.broadcastState(
      currentPlayer,
      currentBid,
      selectedTeam,
      teams,
      auctionState.isAuctionActive
    );
  }, [currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);

  // Heartbeat broadcast to ensure mobile receives state even if no changes
  useEffect(() => {
    if (!isInitialized.current) return;

    const interval = setInterval(() => {
      if (!realtimeSyncService.isReady()) return;

      const hasAuctionData = !!currentPlayerRef.current || auctionActiveRef.current;
      if (!hasAuctionData) return;

      realtimeSyncService.broadcastState(
        currentPlayerRef.current,
        currentBidRef.current,
        selectedTeamRef.current,
        teamsRef.current,
        auctionActiveRef.current
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);
}

/**
 * State interface returned by useRealtimeMobileSync hook
 */
export interface RealtimeMobileSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  auctionActive: boolean;
  isConnected: boolean;
  lastUpdate: number;
  lastSessionReset: number;
  submitBid: (teamId: string, amount: number, type?: 'raise' | 'stop') => Promise<boolean>;
}

/**
 * Hook for Mobile: Receives state updates via Firebase Realtime Database
 */
export function useRealtimeMobileSync(): RealtimeMobileSyncState {
  const [syncState, setSyncState] = useState<RealtimeAuctionState>({
    currentPlayer: null,
    currentBid: 0,
    selectedTeam: null,
    teams: [],
    auctionActive: false,
    lastUpdate: 0,
    sessionId: '',
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [lastSessionReset, setLastSessionReset] = useState(0);
  const isInitialized = useRef(false);
  const syncStateRef = useRef(syncState);
  
  // Keep ref updated
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      
      realtimeSyncService.initAsMobile().then(() => {
        console.log('[useRealtimeMobileSync] Mobile sync initialized');
      });
    }

    // Subscribe to state updates
    const unsubscribe = realtimeSyncService.onStateChange((state) => {
      console.log('[useRealtimeMobileSync] State update received:', {
        player: state.currentPlayer?.name,
        bid: state.currentBid,
        team: state.selectedTeam?.name,
        active: state.auctionActive,
      });
      setSyncState(state);
      setIsConnected(true);
    });

    // Check connection status periodically
    const connectionCheck = setInterval(() => {
      setIsConnected(realtimeSyncService.isDesktopConnected());
    }, 2000);

    // Subscribe to session reset events
    const unsubscribeReset = realtimeSyncService.onSessionReset((reset) => {
      setLastSessionReset(reset.timestamp);
    });

    return () => {
      unsubscribe();
      unsubscribeReset();
      clearInterval(connectionCheck);
    };
  }, []);

  // Submit bid handler
  const submitBid = useCallback(async (
    teamId: string, 
    amount: number, 
    type: 'raise' | 'stop' = 'raise'
  ): Promise<boolean> => {
    const currentState = syncStateRef.current;
    const team = currentState.teams.find(t => t.id === teamId);
    
    if (!team) {
      console.warn('[useRealtimeMobileSync] Team not found:', teamId);
      return false;
    }
    
    if (!currentState.currentPlayer) {
      console.warn('[useRealtimeMobileSync] No current player');
      return false;
    }
    
    if (!currentState.auctionActive) {
      console.warn('[useRealtimeMobileSync] Auction not active');
      return false;
    }
    
    return realtimeSyncService.submitMobileBid(
      team,
      amount,
      currentState.currentPlayer.id,
      type
    );
  }, []);

  // Convert state to Player/Team types
  // Note: Using partial data from Firebase - missing fields will use defaults
  const currentPlayer: Player | null = syncState.currentPlayer ? {
    id: syncState.currentPlayer.id,
    name: syncState.currentPlayer.name,
    role: syncState.currentPlayer.role as Player['role'],
    imageUrl: syncState.currentPlayer.imageUrl,
    basePrice: syncState.currentPlayer.basePrice,
    age: null,
    matches: '',
    runs: '',
    wickets: '',
    battingBestFigures: '',
    bowlingBestFigures: '',
  } : null;

  const selectedTeam: Team | null = syncState.selectedTeam ? {
    id: syncState.selectedTeam.id,
    name: syncState.selectedTeam.name,
    logoUrl: syncState.selectedTeam.logoUrl,
    remainingPurse: 0,
    playersBought: 0,
    totalPlayerThreshold: 0,
    remainingPlayers: 0,
    allocatedAmount: 0,
    highestBid: 0,
    captain: '',
    underAgePlayers: 0,
    primaryColor: syncState.selectedTeam.primaryColor,
    secondaryColor: syncState.selectedTeam.secondaryColor,
  } : null;

  const teams: Team[] = (syncState.teams || []).map(t => ({
    id: t.id,
    name: t.name,
    logoUrl: t.logoUrl,
    remainingPurse: t.remainingPurse,
    playersBought: t.playersBought,
    totalPlayerThreshold: t.totalPlayerThreshold,
    remainingPlayers: 0,
    allocatedAmount: 0,
    highestBid: 0,
    captain: '',
    underAgePlayers: 0,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
  }));

  return {
    currentPlayer,
    currentBid: syncState.currentBid,
    selectedTeam,
    teams,
    auctionActive: syncState.auctionActive,
    isConnected,
    lastUpdate: syncState.lastUpdate,
    lastSessionReset,
    submitBid,
  };
}
