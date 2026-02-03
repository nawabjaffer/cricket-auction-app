// ============================================================================
// USE AUCTION HOOK - Main Auction Logic Hook
// Provides auction operations and state management
// ============================================================================

import { useCallback } from 'react';
import { useAuctionStore } from '../store';
import { webhookService, audioService } from '../services';
import type { Player, Team, UnsoldPlayer } from '../types';

export function useAuction() {
  const store = useAuctionStore();

  // === Player Selection ===
  const selectPlayer = useCallback((player: Player) => {
    store.selectPlayer(player);
  }, [store]);

  const selectNextPlayer = useCallback(() => {
    store.selectNextPlayer();
  }, [store]);

  const selectRandomPlayer = useCallback(() => {
    return store.selectRandomPlayer();
  }, [store]);

  const clearCurrentPlayer = useCallback(() => {
    store.clearCurrentPlayer();
    store.setOverlay(null);
  }, [store]);

  // === Team Selection ===
  const selectTeam = useCallback((team: Team) => {
    store.selectTeam(team);
  }, [store]);

  const clearTeam = useCallback(() => {
    store.clearTeam();
  }, [store]);

  // === Bidding Operations ===
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

  // === Auction Outcomes ===
  const markAsSold = useCallback(async () => {
    const { currentPlayer, currentBid, selectedTeam } = store;

    if (!currentPlayer || !selectedTeam) {
      store.showNotification('error', 'Please select a team before marking as sold');
      return false;
    }

    // Update local state first
    store.markAsSold();
    
    // Play sound effect
    await audioService.playSold();

    // Send webhook to update Google Sheets
    try {
      await webhookService.updateSoldPlayer(currentPlayer, currentBid, selectedTeam);
    } catch (error) {
      console.error('[useAuction] Webhook error:', error);
      // Don't revert local state, just notify
      store.showNotification('warning', 'Player sold locally, but sync with sheets failed');
    }

    return true;
  }, [store]);

  const markAsUnsold = useCallback(async () => {
    const { currentPlayer, currentRound } = store;

    if (!currentPlayer) {
      store.showNotification('error', 'No player selected');
      return false;
    }

    // Update local state first
    store.markAsUnsold();
    
    // Play sound effect
    await audioService.playUnsold();

    // Send webhook to update Google Sheets
    try {
      await webhookService.updateUnsoldPlayer(currentPlayer, `Round ${currentRound}`);
    } catch (error) {
      console.error('[useAuction] Webhook error:', error);
      store.showNotification('warning', 'Player marked unsold locally, but sync with sheets failed');
    }

    return true;
  }, [store]);

  const moveUnsoldToSold = useCallback(async (player: UnsoldPlayer, team: Team, amount: number) => {
    // Update local state first
    store.moveUnsoldToSold(player, team, amount);
    
    // Play sound effect
    await audioService.playSold();

    // Send webhook to update Google Sheets
    try {
      await webhookService.moveUnsoldToSold(player, amount, team);
    } catch (error) {
      console.error('[useAuction] Webhook error:', error);
      store.showNotification('warning', 'Player moved locally, but sync with sheets failed');
    }

    return true;
  }, [store]);

  // === Round Management ===
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

  // === Overlay Management ===
  const closeOverlay = useCallback(() => {
    store.setOverlay(null);
    store.clearCurrentPlayer();
  }, [store]);

  const showEndScreen = useCallback(() => {
    store.setOverlay('end');
  }, [store]);

  // === Auction Reset ===
  const resetAuction = useCallback(async () => {
    store.resetAuction();
    
    try {
      await webhookService.clearAuction();
      store.showNotification('success', 'Auction reset successfully');
    } catch (error) {
      console.error('[useAuction] Reset error:', error);
      store.showNotification('warning', 'Local reset complete, but sheets sync failed');
    }
  }, [store]);

  // === Computed Values ===
  const getEligibleTeams = useCallback(() => {
    return store.getEligibleTeams();
  }, [store]);

  const getMaxBidForTeam = useCallback((team: Team) => {
    return store.getMaxBidForTeam(team);
  }, [store]);

  const getPlayerStats = useCallback(() => {
    return store.getPlayerStats();
  }, [store]);

  return {
    // State
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

    // Player Actions
    selectPlayer,
    selectNextPlayer,
    selectRandomPlayer,
    clearCurrentPlayer,

    // Team Actions
    selectTeam,
    clearTeam,

    // Bidding Actions
    incrementBid,
    decrementBid,
    resetBid,
    placeBid,
    raiseBidForTeam,

    // Outcome Actions
    markAsSold,
    markAsUnsold,
    moveUnsoldToSold,

    // Round Management
    startRound2,
    startNextRound,

    // Overlay Management
    closeOverlay,
    showEndScreen,

    // Bid State Management
    clearBidState: store.clearBidState,

    // Reset
    resetAuction,

    // Jump helpers
    jumpToPlayerIndex,
    jumpToPlayerId,

    // Computed
    getEligibleTeams,
    getMaxBidForTeam,
    getPlayerStats,

    // Mode Toggle
    toggleSelectionMode: store.toggleSelectionMode,
    setSelectionMode: store.setSelectionMode,

    // Notifications
    showNotification: store.showNotification,
    clearNotification: store.clearNotification,
  };
}
