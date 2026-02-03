// ============================================================================
// USE AUCTION CONTROLLER HOOK - Simplified Working Version
// MVC: Hook that provides controller-based auction operations
// DRY: Centralizes all auction business logic through controllers
// ============================================================================

import { useCallback, useMemo, useRef } from 'react';
import { useAuctionStore } from '../store';
import { AuctionController } from '../controllers/AuctionController';
import { BidController } from '../controllers/BidController';
import { PlayerController } from '../controllers/PlayerController';
import { TeamController } from '../controllers/TeamController';
import { audioService } from '../services';
import type { Player, Team } from '../types';

/**
 * Hook that provides controller-based auction operations
 */
export function useAuctionController() {
  const store = useAuctionStore();
  
  // Initialize controllers once (lazy initialization)
  const controllersRef = useRef<{
    auction: AuctionController;
    bid: BidController;
    player: PlayerController;
    team: TeamController;
  } | null>(null);

  // Initialize controllers on mount
  if (!controllersRef.current) {
    controllersRef.current = {
      auction: new AuctionController(),
      bid: new BidController(),
      player: new PlayerController(),
      team: new TeamController(),
    };
  }

  // ============================================================================
  // PLAYER OPERATIONS
  // ============================================================================

  const selectPlayer = useCallback((player: Player) => {
    store.selectPlayer(player);
  }, [store]);

  const selectNextPlayer = useCallback(() => {
    store.selectNextPlayer();
  }, [store]);

  const selectRandomPlayer = useCallback(() => {
    store.selectRandomPlayer();
  }, [store]);

  const clearCurrentPlayer = useCallback(() => {
    store.clearCurrentPlayer();
    store.setOverlay(null);
  }, [store]);

  // ============================================================================
  // TEAM OPERATIONS
  // ============================================================================

  const selectTeam = useCallback((team: Team) => {
    store.selectTeam(team);
  }, [store]);

  const clearTeam = useCallback(() => {
    store.clearTeam();
  }, [store]);

  // ============================================================================
  // BIDDING OPERATIONS
  // ============================================================================

  const incrementBid = useCallback(() => {
    store.incrementBid();
  }, [store]);

  const decrementBid = useCallback(() => {
    store.decrementBid();
  }, [store]);

  const resetBid = useCallback(() => {
    store.resetBid();
  }, [store]);

  const placeBid = useCallback((amount: number, team: Team) => {
    return store.placeBid(amount, team);
  }, [store]);

  const raiseBidForTeam = useCallback((team: Team, steps = 1) => {
    return store.raiseBidForTeam(team, steps);
  }, [store]);

  // ============================================================================
  // AUCTION OUTCOMES
  // ============================================================================

  const markAsSold = useCallback(async () => {
    const { currentPlayer, selectedTeam } = store;

    if (!currentPlayer || !selectedTeam) {
      store.showNotification('error', 'Please select a team before marking as sold');
      return false;
    }

    store.markAsSold();
    await audioService.playSold();
    return true;
  }, [store]);

  const markAsUnsold = useCallback(async () => {
    const { currentPlayer } = store;

    if (!currentPlayer) {
      store.showNotification('error', 'No player selected');
      return false;
    }

    store.markAsUnsold();
    await audioService.playUnsold();
    return true;
  }, [store]);

  // ============================================================================
  // ROUND MANAGEMENT
  // ============================================================================

  const startRound2 = useCallback(() => {
    store.startRound2();
  }, [store]);

  const startNextRound = useCallback(() => {
    store.startNextRound();
  }, [store]);

  const jumpToPlayerIndex = useCallback((index: number) => {
    return store.jumpToPlayerIndex(index);
  }, [store]);

  const jumpToPlayerId = useCallback((playerId: string) => {
    return store.jumpToPlayerId(playerId);
  }, [store]);

  // ============================================================================
  // OVERLAY MANAGEMENT
  // ============================================================================

  const closeOverlay = useCallback(() => {
    store.setOverlay(null);
    store.clearCurrentPlayer();
  }, [store]);

  const showEndScreen = useCallback(() => {
    store.setOverlay('end');
  }, [store]);

  // Memoized auction stats
  const auctionStats = useMemo(() => ({
    currentRound: store.currentRound,
    isRound2Active: store.isRound2Active,
  }), [store.currentRound, store.isRound2Active]);

  // ============================================================================
  // RETURN VALUE
  // ============================================================================

  return {
    // ===== STATE =====
    currentPlayer: store.currentPlayer,
    currentBid: store.currentBid,
    previousBid: store.previousBid,
    selectedTeam: store.selectedTeam,
    bidHistory: store.bidHistory,
    currentRound: store.currentRound,
    isRound2Active: store.isRound2Active,
    selectionMode: store.selectionMode,
    activeOverlay: store.activeOverlay,
    notification: store.notification,
    isLoading: store.isLoading,
    error: store.error,
    auctionStats,

    // ===== PLAYER ACTIONS =====
    selectPlayer,
    selectNextPlayer,
    selectRandomPlayer,
    clearCurrentPlayer,

    // ===== TEAM ACTIONS =====
    selectTeam,
    clearTeam,

    // ===== BIDDING ACTIONS =====
    incrementBid,
    decrementBid,
    resetBid,
    placeBid,
    raiseBidForTeam,

    // ===== OUTCOME ACTIONS =====
    markAsSold,
    markAsUnsold,

    // ===== ROUND MANAGEMENT =====
    startRound2,
    startNextRound,
    jumpToPlayerIndex,
    jumpToPlayerId,

    // ===== OVERLAY MANAGEMENT =====
    closeOverlay,
    showEndScreen,

    // ===== MODE TOGGLE =====
    toggleSelectionMode: store.toggleSelectionMode,
    setSelectionMode: store.setSelectionMode,

    // ===== NOTIFICATIONS =====
    showNotification: store.showNotification,
    clearNotification: store.clearNotification,
  };
}

/**
 * Hook specifically for player operations
 */
export function usePlayerController() {
  const controllerRef = useRef<PlayerController | null>(null);

  const getController = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new PlayerController();
    }
    return controllerRef.current;
  }, []);

  return {
    getPlayersGroupedByRole: useCallback(
      () => getController().getPlayersGroupedByRole(),
      [getController]
    ),
  };
}

/**
 * Hook specifically for team operations
 */
export function useTeamController() {
  const controllerRef = useRef<TeamController | null>(null);

  const getController = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new TeamController();
    }
    return controllerRef.current;
  }, []);

  return {
    getTeamRankings: useCallback(
      () => getController().getTeamRankings(),
      [getController]
    ),
  };
}

/**
 * Hook specifically for bidding operations
 */
export function useBidController() {
  const controllerRef = useRef<BidController | null>(null);

  const getController = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = new BidController();
    }
    return controllerRef.current;
  }, []);

  return {
    incrementBid: useCallback(() => getController().incrementBid(), [getController]),
    decrementBid: useCallback(() => getController().decrementBid(), [getController]),
    resetBid: useCallback(() => getController().resetBid(), [getController]),
  };
}
