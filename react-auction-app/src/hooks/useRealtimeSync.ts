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
export function useRealtimeDesktopSync(enabled = true): void {
  const currentPlayer = useAuctionStore(state => state.currentPlayer);
  const currentBid = useAuctionStore(state => state.currentBid);
  const selectedTeam = useAuctionStore(state => state.selectedTeam);
  const teams = useAuctionStore(state => state.teams);
  const bidHistory = useAuctionStore(state => state.bidHistory);
  const raiseBidForTeam = useAuctionStore(state => state.raiseBidForTeam);
  const markAsSold = useAuctionStore(state => state.markAsSold);
  const markAsUnsold = useAuctionStore(state => state.markAsUnsold);
  const decrementBid = useAuctionStore(state => state.decrementBid);
  const jumpToPlayerId = useAuctionStore(state => state.jumpToPlayerId);
  const auctionState = useAuctionStore(state => state.auctionState);
  const storeActiveOverlay = useAuctionStore(state => state.activeOverlay);
  
  const isInitialized = useRef(false);
  const teamsRef = useRef(teams);
  const currentPlayerRef = useRef(currentPlayer);
  const currentBidRef = useRef(currentBid);
  const selectedTeamRef = useRef(selectedTeam);
  const bidHistoryRef = useRef(bidHistory);
  const auctionActiveRef = useRef(auctionState.isAuctionActive);
  const activeOverlayRef = useRef<'sold' | 'unsold' | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  
  // Keep teams ref updated
  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  // Keep bidHistory ref updated
  useEffect(() => {
    bidHistoryRef.current = bidHistory;
  }, [bidHistory]);

  // Keep state refs updated for heartbeat broadcasts
  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
    currentBidRef.current = currentBid;
    selectedTeamRef.current = selectedTeam;
    auctionActiveRef.current = auctionState.isAuctionActive;
    // Only broadcast sold/unsold — other overlay types (end, team) are UI-only
    activeOverlayRef.current = (storeActiveOverlay === 'sold' || storeActiveOverlay === 'unsold')
      ? storeActiveOverlay
      : null;
  }, [currentPlayer, currentBid, selectedTeam, auctionState.isAuctionActive, storeActiveOverlay]);

  // Initialize as desktop on mount - ensure it completes
  useEffect(() => {
    if (!enabled) return;
    if (!isInitialized.current && !initPromiseRef.current) {
      isInitialized.current = true;
      
      initPromiseRef.current = realtimeSyncService.initAsDesktop().then(() => {
        if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] ✅ Desktop sync initialized and ready');
        
        // Force an immediate state broadcast after initialization
        if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] 📡 Broadcasting initial state...');
        realtimeSyncService.broadcastState(
          currentPlayer,
          currentBid,
          selectedTeam,
          teams,
          auctionState.isAuctionActive,
          activeOverlayRef.current,
          bidHistory
        );
      }).catch((err: unknown) => {
        console.error('[useRealtimeDesktopSync] ❌ Failed to initialize:', err);
      });
    }

    // Subscribe to mobile bids
    const unsubscribe = realtimeSyncService.onMobileBid((bid: RealtimeMobileBid) => {
      if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] 📱 Mobile bid received:', bid);
      
      if (bid.type === 'raise') {
        const team = teamsRef.current.find(t => t.id === bid.teamId);
        if (team) {
          if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] ✅ Applying bid from team:', team.name);
          raiseBidForTeam(team);
        }
      }
    });

    // Subscribe to Super Admin remote commands (sold/unsold/undo/jumpToPlayer)
    const unsubscribeAdminCommand = realtimeSyncService.onAdminCommand((command) => {
      if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] 🛡️ Admin command received:', command);

      switch (command.type) {
        case 'sold':
          markAsSold();
          break;
        case 'unsold':
          markAsUnsold();
          break;
        case 'undo':
          decrementBid();
          break;
        case 'jumpToPlayer':
          if (command.playerId) jumpToPlayerId(command.playerId);
          break;
      }
    });

    return () => {
      unsubscribe();
      unsubscribeAdminCommand();
    };
  }, [enabled, raiseBidForTeam, markAsSold, markAsUnsold, decrementBid, jumpToPlayerId, currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive]);

  // Broadcast state changes
  useEffect(() => {
    if (!enabled) return;
    if (!isInitialized.current) return;
    if (!realtimeSyncService.isReady()) {
      if (import.meta.env.DEV) console.log('[useRealtimeDesktopSync] ⏳ Service not ready yet, waiting...');
      return;
    }

    if (import.meta.env.DEV) {
      console.log('[useRealtimeDesktopSync] 📡 Broadcasting state update...', {
        player: currentPlayer?.name,
        bid: currentBid,
        team: selectedTeam?.name,
        active: auctionState.isAuctionActive,
      });
    }

    realtimeSyncService.broadcastState(
      currentPlayer,
      currentBid,
      selectedTeam,
      teams,
      auctionState.isAuctionActive,
      (storeActiveOverlay === 'sold' || storeActiveOverlay === 'unsold') ? storeActiveOverlay : null,
      bidHistory
    );
  }, [enabled, currentPlayer, currentBid, selectedTeam, teams, auctionState.isAuctionActive, storeActiveOverlay, bidHistory]);

  // Heartbeat broadcast to ensure mobile receives state even if no changes
  useEffect(() => {
    if (!enabled) return;
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
        auctionActiveRef.current,
        activeOverlayRef.current,
        bidHistoryRef.current
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [enabled]);
}

/**
 * State interface returned by useRealtimeMobileSync hook
 */
export interface RealtimeMobileSyncState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  teams: Team[];
  bidHistory: Array<{
    teamId: string;
    teamName: string;
    teamLogoUrl?: string;
    amount: number;
    timestamp: string;
  }>;
  auctionActive: boolean;
  activeOverlay: 'sold' | 'unsold' | null;
  isConnected: boolean;
  lastUpdate: number;
  lastSessionReset: number;
  submitBid: (teamId: string, amount: number, type?: 'raise' | 'stop') => Promise<boolean>;
  /** Super Admin Mode: send a remote sold/unsold/undo/jumpToPlayer command to the desktop */
  submitAdminCommand: (type: 'sold' | 'unsold' | 'undo' | 'jumpToPlayer', playerId?: string) => Promise<boolean>;
  mobileBiddingConfig: {
    maxStatsToShow: number;
    enableRaiseBid: boolean;
    enableStopBidding: boolean;
  };
}

/**
 * Hook for Mobile: Receives state updates via Firebase Realtime Database
 */
export function useRealtimeMobileSync(enabled = true): RealtimeMobileSyncState {
  const [syncState, setSyncState] = useState<RealtimeAuctionState>({
    currentPlayer: null,
    currentBid: 0,
    selectedTeam: null,
    teams: [],
    auctionActive: false,
    activeOverlay: null,
    bidHistory: [],
    lastUpdate: 0,
    sessionId: '',
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [lastSessionReset, setLastSessionReset] = useState(0);
  const isInitialized = useRef(false);
  const syncStateRef = useRef(syncState);
  const lastStateEventAtRef = useRef(0);
  const disconnectCandidateAtRef = useRef<number | null>(null);
  
  // Keep ref updated
  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  // Initialize on mount
  useEffect(() => {
    if (!enabled) return;
    if (!isInitialized.current) {
      isInitialized.current = true;
      
      realtimeSyncService.initAsMobile().then(() => {
        if (import.meta.env.DEV) console.log('[useRealtimeMobileSync] Mobile sync initialized');
      });
    }

    // Subscribe to state updates
    const unsubscribe = realtimeSyncService.onStateChange((state) => {
      if (import.meta.env.DEV) {
        console.log('[useRealtimeMobileSync] State update received:', {
          player: state.currentPlayer?.name,
          bid: state.currentBid,
          team: state.selectedTeam?.name,
          active: state.auctionActive,
        });
      }
      setSyncState(state);
      lastStateEventAtRef.current = Date.now();
      disconnectCandidateAtRef.current = null;
      setIsConnected(true);
    });

    // Check connection status periodically
    const connectionCheck = setInterval(() => {
      const now = Date.now();
      const connectedByService = realtimeSyncService.isDesktopConnected();
      const connectedByRecentEvent = (now - lastStateEventAtRef.current) < 14000;

      if (connectedByService || connectedByRecentEvent) {
        disconnectCandidateAtRef.current = null;
        setIsConnected(true);
        return;
      }

      if (disconnectCandidateAtRef.current === null) {
        disconnectCandidateAtRef.current = now;
        return;
      }

      // Require sustained stale state before flipping to offline to avoid flicker.
      if ((now - disconnectCandidateAtRef.current) > 6000) {
        setIsConnected(false);
      }
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
  }, [enabled]);

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

  // Super Admin Mode: submit a remote sold/unsold/undo/jumpToPlayer command
  const submitAdminCommand = useCallback(async (
    type: 'sold' | 'unsold' | 'undo' | 'jumpToPlayer',
    playerId?: string,
  ): Promise<boolean> => {
    return realtimeSyncService.submitAdminCommand(type, playerId);
  }, []);

  // Convert state to Player/Team types
  // Note: Using full data from Firebase including stats
  const currentPlayer: Player | null = syncState.currentPlayer ? {
    id: syncState.currentPlayer.id,
    name: syncState.currentPlayer.name,
    role: syncState.currentPlayer.role as Player['role'],
    imageUrl: syncState.currentPlayer.imageUrl,
    basePrice: syncState.currentPlayer.basePrice,
    age: syncState.currentPlayer.age ?? null,
    matches: syncState.currentPlayer.matches || '',
    runs: syncState.currentPlayer.runs || '',
    wickets: syncState.currentPlayer.wickets || '',
    battingBestFigures: syncState.currentPlayer.battingBestFigures || '',
    bowlingBestFigures: syncState.currentPlayer.bowlingBestFigures || '',
    battingStats: syncState.currentPlayer.battingStats,
    bowlingStats: syncState.currentPlayer.bowlingStats,
  } : null;

  const selectedTeamRecord = syncState.selectedTeam
    ? syncState.teams.find((team) => team.id === syncState.selectedTeam?.id)
    : null;

  const selectedTeam: Team | null = syncState.selectedTeam ? {
    id: syncState.selectedTeam.id,
    name: syncState.selectedTeam.name,
    logoUrl: syncState.selectedTeam.logoUrl,
    remainingPurse: selectedTeamRecord?.remainingPurse || 0,
    playersBought: selectedTeamRecord?.playersBought || 0,
    totalPlayerThreshold: selectedTeamRecord?.totalPlayerThreshold || 0,
    remainingPlayers: Math.max(
      0,
      (selectedTeamRecord?.totalPlayerThreshold || 0) - (selectedTeamRecord?.playersBought || 0),
    ),
    allocatedAmount: selectedTeamRecord?.allocatedAmount || 0,
    highestBid: selectedTeamRecord?.highestBid || 0,
    captain: selectedTeamRecord?.captain || '',
    underAgePlayers: selectedTeamRecord?.underAgePlayers || 0,
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
    remainingPlayers: Math.max(
      0,
      (t.totalPlayerThreshold || 0) - (t.playersBought || 0),
    ),
    allocatedAmount: t.allocatedAmount || 0,
    highestBid: t.highestBid || 0,
    captain: t.captain || '',
    underAgePlayers: t.underAgePlayers || 0,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    authUsername: t.authUsername,
    authPassword: t.authPassword,
  }));

  // Extract mobile bidding config
  const mobileBiddingConfig = syncState.mobileBiddingConfig || {
    maxStatsToShow: 6,
    enableRaiseBid: true,
    enableStopBidding: true,
  };

  return {
    currentPlayer,
    currentBid: syncState.currentBid,
    selectedTeam,
    teams,
    bidHistory: syncState.bidHistory || [],
    auctionActive: syncState.auctionActive,
    activeOverlay: (syncState.activeOverlay === 'sold' || syncState.activeOverlay === 'unsold')
      ? syncState.activeOverlay
      : null,
    isConnected,
    lastUpdate: syncState.lastUpdate,
    lastSessionReset,
    submitBid,
    submitAdminCommand,
    mobileBiddingConfig,
  };
}
