// ============================================================================
// AUCTION STORE - Central State Management with Zustand
// Single source of truth for auction application state
// ============================================================================

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { 
  Player, 
  Team, 
  AuctionState, 
  BidHistory, 
  SoldPlayer, 
  UnsoldPlayer,
  SelectionMode,
  OverlayType,
  NotificationType 
} from '../types';
import { activeConfig } from '../config';
import { AuctionRulesService } from '../services/auctionRules';
import { auctionPersistence } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { premiumService } from '../services/premiumService';

// Initialize persistence with database when available
const initializePersistence = async () => {
  // Wait for realtime sync to initialize
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const db = realtimeSync.getDatabase();
    if (db) {
      auctionPersistence.initialize(db);
      premiumService.initialize(db);
      console.log('[Store] Auction persistence initialized');
      console.log('[Store] Premium service initialized');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }
  
  console.warn('[Store] Could not initialize auction persistence - database not ready');
};

// Start initialization
initializePersistence();

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface AuctionStore {
  // === State ===
  // Player pools
  availablePlayers: Player[];
  originalPlayers: Player[]; // Track original list for jump-to-player functionality
  soldPlayers: SoldPlayer[];
  unsoldPlayers: UnsoldPlayer[];
  
  // Teams
  teams: Team[];
  selectedTeam: Team | null;
  
  // Current auction state
  currentPlayer: Player | null;
  currentBid: number;
  previousBid: number;
  bidHistory: BidHistory[];
  lastBidTeamId: string | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  notification: { type: NotificationType; message: string } | null;
  activeOverlay: OverlayType | null;
  
  // Selection mode
  selectionMode: SelectionMode;
  
  // Round tracking
  currentRound: number;
  isRound2Active: boolean;
  maxUnsoldRounds: number;
  
  // Auction state
  auctionState: AuctionState;
  
  // === Actions ===
  // Data loading
  setPlayers: (players: Player[]) => void;
  setTeams: (teams: Team[]) => void;
  setSoldPlayers: (players: SoldPlayer[]) => void;
  setUnsoldPlayers: (players: UnsoldPlayer[]) => void;
  reconcilePlayerPools: () => void;
  
  // Player selection
  selectPlayer: (player: Player) => void;
  selectNextPlayer: () => void;
  selectRandomPlayer: () => Player | null;
  clearCurrentPlayer: () => void;
  
  // Team selection
  selectTeam: (team: Team) => void;
  clearTeam: () => void;
  
  // Bidding
  placeBid: (amount: number, team: Team) => boolean;
  incrementBid: () => void;
  decrementBid: () => void;
  resetBid: () => void;
  raiseBidForTeam: (team: Team, steps?: number) => boolean;
  jumpToPlayerIndex: (index: number) => boolean;
  jumpToPlayerId: (playerId: string) => boolean;
  
  // Auction outcomes
  markAsSold: () => void;
  markAsUnsold: () => void;
  moveUnsoldToSold: (player: UnsoldPlayer, team: Team, amount: number) => void;
  
  // UI state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  showNotification: (type: NotificationType, message: string) => void;
  clearNotification: () => void;
  setOverlay: (overlay: OverlayType | null) => void;
  
  // Selection mode
  setSelectionMode: (mode: SelectionMode) => void;
  toggleSelectionMode: () => void;
  
  // Round management
  startRound2: () => void;
  startNextRound: () => void;
  setMaxUnsoldRounds: (value: number) => void;
  
  // State management
  setAuctionState: (state: Partial<AuctionState>) => void;
  resetAuction: () => void;
  
  // Computed values
  getEligibleTeams: () => Team[];
  getMaxBidForTeam: (team: Team) => number;
  getPlayerStats: () => { total: number; available: number; sold: number; unsold: number };
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialAuctionState: AuctionState = {
  currentPlayer: null,
  currentBid: activeConfig.auction.basePrice,
  selectedTeam: null,
  bidHistory: [],
  isAuctionActive: false,
  isPaused: false,
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useAuctionStore = create<AuctionStore>()(
  devtools(
    persist(
      (set, get) => ({
        // === Initial State ===
        availablePlayers: [],
        originalPlayers: [],
        soldPlayers: [],
        unsoldPlayers: [],
        teams: [],
        selectedTeam: null,
        currentPlayer: null,
        currentBid: activeConfig.auction.basePrice,
        previousBid: 0,
        bidHistory: [],
        lastBidTeamId: null,
        isLoading: false,
        error: null,
        notification: null,
        activeOverlay: null,
        selectionMode: 'sequential',
        currentRound: 1,
        isRound2Active: false,
        maxUnsoldRounds: 1,
        auctionState: initialAuctionState,

        // === Data Loading Actions ===
        setPlayers: (players) => {
          const { soldPlayers, unsoldPlayers, teams } = get();
          const blockedIds = new Set([
            ...soldPlayers.map(p => p.id),
            ...unsoldPlayers.map(p => p.id),
          ]);
          const captainNames = new Set(
            teams
              .map(t => (t.captain || '').trim().toLowerCase())
              .filter(Boolean)
          );
          const filtered = players.filter(
            p => !blockedIds.has(p.id) && !captainNames.has(p.name.trim().toLowerCase())
          );
          set({ availablePlayers: filtered, originalPlayers: players });
        },
        
        setTeams: (teams) => set({ teams }),
        
        setSoldPlayers: (players) => set({ soldPlayers: players }),
        
        setUnsoldPlayers: (players) => set({ unsoldPlayers: players }),

        reconcilePlayerPools: () => {
          const { availablePlayers, soldPlayers, unsoldPlayers, currentPlayer, teams } = get();
          const blockedIds = new Set([
            ...soldPlayers.map(p => p.id),
            ...unsoldPlayers.map(p => p.id),
          ]);
          const captainNames = new Set(
            teams
              .map(t => (t.captain || '').trim().toLowerCase())
              .filter(Boolean)
          );

          const updatedAvailable = availablePlayers.filter(
            p => !blockedIds.has(p.id) && !captainNames.has(p.name.trim().toLowerCase())
          );

          const shouldClearCurrent = currentPlayer
            ? blockedIds.has(currentPlayer.id) || captainNames.has(currentPlayer.name.trim().toLowerCase())
            : false;

          set({
            availablePlayers: updatedAvailable,
            ...(shouldClearCurrent
              ? {
                  currentPlayer: null,
                  currentBid: activeConfig.auction.basePrice,
                  previousBid: 0,
                  selectedTeam: null,
                  bidHistory: [],
                  lastBidTeamId: null,
                }
              : {}),
          });
        },

        // === Player Selection Actions ===
        selectPlayer: (player) => {
          console.log('[Auction] Player Selected:', {
            id: player.id,
            name: player.name,
            role: player.role,
            imageUrl: player.imageUrl,
            basePrice: player.basePrice,
          });
          set({
            currentPlayer: player,
            currentBid: player.basePrice,
            previousBid: 0,
            selectedTeam: null,
            bidHistory: [],
            lastBidTeamId: null,
            auctionState: {
              ...get().auctionState,
              currentPlayer: player,
              currentBid: player.basePrice,
              selectedTeam: null,
              bidHistory: [],
              isAuctionActive: true,
            },
          });
        },

        selectNextPlayer: () => {
          const { availablePlayers, selectionMode, bidHistory, selectedTeam, currentBid, currentPlayer } = get();
          
          // Prevent skipping if there's active bidding
          if (currentPlayer && (bidHistory.length > 0 || selectedTeam || currentBid > currentPlayer.basePrice)) {
            console.log('[Auction] Cannot skip player during active bidding');
            set({ 
              notification: { 
                type: 'warning', 
                message: 'Cannot skip player during active bidding. Mark as Sold (S) or Unsold (U) first.' 
              }
            });
            return;
          }
          
          if (availablePlayers.length === 0) {
            console.log('[Auction] No more players available');
            set({ 
              notification: { type: 'info', message: 'No more players available' },
              activeOverlay: 'end',
            });
            return;
          }

          let nextPlayer: Player;
          
          if (selectionMode === 'sequential') {
            nextPlayer = availablePlayers[0];
          } else {
            const randomIndex = Math.floor(Math.random() * availablePlayers.length);
            nextPlayer = availablePlayers[randomIndex];
          }

          console.log('[Auction] Next Player Selected:', {
            id: nextPlayer.id,
            name: nextPlayer.name,
            role: nextPlayer.role,
            imageUrl: nextPlayer.imageUrl,
            basePrice: nextPlayer.basePrice,
            selectionMode,
          });

          get().selectPlayer(nextPlayer);
        },

        selectRandomPlayer: () => {
          const { availablePlayers } = get();
          
          if (availablePlayers.length === 0) {
            return null;
          }

          const randomIndex = Math.floor(Math.random() * availablePlayers.length);
          const player = availablePlayers[randomIndex];
          get().selectPlayer(player);
          return player;
        },

        clearCurrentPlayer: () => {
          set({
            currentPlayer: null,
            currentBid: activeConfig.auction.basePrice,
            previousBid: 0,
            selectedTeam: null,
            bidHistory: [],
            lastBidTeamId: null,
            auctionState: initialAuctionState,
          });
        },

        // === Team Selection Actions ===
        selectTeam: (team) => {
          const { currentBid, currentPlayer } = get();
          
          // Validate team can bid
          if (currentPlayer) {
            const rulesService = new AuctionRulesService();
            const validation = rulesService.validateBid(team, currentBid, currentPlayer.basePrice, currentPlayer.age);
            
            if (!validation.valid) {
              set({ 
                notification: { 
                  type: 'error', 
                  message: validation.message 
                } 
              });
              return;
            }
          }

          set({ 
            selectedTeam: team,
            auctionState: {
              ...get().auctionState,
              selectedTeam: team,
            }
          });
        },

        clearTeam: () => {
          set({ 
            selectedTeam: null,
            auctionState: {
              ...get().auctionState,
              selectedTeam: null,
            }
          });
        },

        // === Bidding Actions ===
        placeBid: (amount, team) => {
          const { currentPlayer, currentBid, bidHistory, lastBidTeamId } = get();
          
          if (!currentPlayer) return false;

          if (lastBidTeamId === team.id && bidHistory.length > 0) {
            set({
              notification: {
                type: 'warning',
                message: `${team.name} must wait for another team to bid before bidding again`,
              },
            });
            return false;
          }

          // Validate bid using rules service
          const rulesService = new AuctionRulesService();
          const validation = rulesService.validateBid(team, amount, currentPlayer.basePrice, currentPlayer.age);
          
          if (!validation.valid) {
            set({ 
              notification: { 
                type: 'error', 
                message: validation.message 
              } 
            });
            return false;
          }

          // Record bid history
          const newBidEntry: BidHistory = {
            teamId: team.id,
            teamName: team.name,
            amount,
            timestamp: new Date().toISOString(),
          };

          const maxHistory = Math.max(0, Math.floor(activeConfig.auction.undo.historySize || 0));
          const nextHistory = maxHistory > 0 ? [...bidHistory, newBidEntry].slice(-maxHistory) : [...bidHistory, newBidEntry];

          set({
            previousBid: currentBid,
            currentBid: amount,
            selectedTeam: team,
            bidHistory: nextHistory,
            lastBidTeamId: team.id,
            auctionState: {
              ...get().auctionState,
              currentBid: amount,
              selectedTeam: team,
              bidHistory: nextHistory,
            },
          });

          return true;
        },

        raiseBidForTeam: (team, steps = 1) => {
          const { currentBid, currentPlayer, bidHistory, lastBidTeamId } = get();

          if (!currentPlayer) {
            set({
              notification: {
                type: 'warning',
                message: 'Select a player before bidding',
              },
            });
            return false;
          }

          if (lastBidTeamId === team.id && bidHistory.length > 0) {
            set({
              notification: {
                type: 'warning',
                message: `${team.name} must wait for another team to bid before bidding again`,
              },
            });
            return false;
          }

          const increment = activeConfig.auction.bidIncrements.default;
          const safeSteps = Math.max(1, Math.floor(steps));
          const newBid = currentBid + increment * safeSteps;

          const rulesService = new AuctionRulesService();
          const maxBid = rulesService.calculateMaxBid(team);

          if (newBid > maxBid) {
            set({
              notification: {
                type: 'warning',
                message: `${team.name} cannot bid more than ₹${maxBid.toFixed(2)}L`,
              },
            });
            return false;
          }

          const newBidEntry: BidHistory = {
            teamId: team.id,
            teamName: team.name,
            amount: newBid,
            timestamp: new Date().toISOString(),
          };

          const maxHistory = Math.max(0, Math.floor(activeConfig.auction.undo.historySize || 0));
          const nextHistory = maxHistory > 0 ? [...bidHistory, newBidEntry].slice(-maxHistory) : [...bidHistory, newBidEntry];

          set({
            previousBid: currentBid,
            currentBid: newBid,
            selectedTeam: team,
            bidHistory: nextHistory,
            lastBidTeamId: team.id,
            auctionState: {
              ...get().auctionState,
              currentBid: newBid,
              selectedTeam: team,
              bidHistory: nextHistory,
            },
          });

          return true;
        },

        incrementBid: () => {
          const { selectedTeam } = get();

          if (selectedTeam) {
            get().raiseBidForTeam(selectedTeam, 1);
            return;
          }

          const { currentBid } = get();
          const increment = activeConfig.auction.bidIncrements.default;
          const newBid = currentBid + increment;

          set({
            previousBid: currentBid,
            currentBid: newBid,
            auctionState: {
              ...get().auctionState,
              currentBid: newBid,
            },
          });
        },

        decrementBid: () => {
          const { currentPlayer, bidHistory, teams } = get();
          const minBid = currentPlayer?.basePrice || activeConfig.auction.basePrice;

          // True undo: pop last bid entry and restore the previous bid/team.
          const newHistory = [...bidHistory];
          if (newHistory.length > 0) newHistory.pop();

          let previousTeam = null;
          let restoredBid = minBid;
          if (newHistory.length > 0) {
            const prevBid = newHistory[newHistory.length - 1];
            restoredBid = prevBid.amount;
            previousTeam = teams.find((t) => t.id === prevBid.teamId) || null;
          }

          set({
            previousBid: get().currentBid,
            currentBid: restoredBid,
            selectedTeam: previousTeam,
            bidHistory: newHistory,
            lastBidTeamId: previousTeam?.id || null,
            auctionState: {
              ...get().auctionState,
              currentBid: restoredBid,
              selectedTeam: previousTeam,
              bidHistory: newHistory,
            },
          });
        },

        resetBid: () => {
          const { currentPlayer } = get();
          const basePrice = currentPlayer?.basePrice || activeConfig.auction.basePrice;

          set({
            previousBid: get().currentBid,
            currentBid: basePrice,
            selectedTeam: null,
            lastBidTeamId: null,
            auctionState: {
              ...get().auctionState,
              currentBid: basePrice,
              selectedTeam: null,
            },
          });
        },

        // === Auction Outcome Actions ===
        markAsSold: () => {
          const { currentPlayer, currentBid, selectedTeam, availablePlayers, soldPlayers, unsoldPlayers, teams } = get();

          if (!currentPlayer || !selectedTeam) {
            set({ 
              notification: { 
                type: 'error', 
                message: 'Please select a team before marking as sold' 
              } 
            });
            return;
          }

          if (soldPlayers.some(p => p.id === currentPlayer.id)) {
            set({
              notification: {
                type: 'error',
                message: `${currentPlayer.name} is already sold. Please select the next player.`,
              },
            });
            return;
          }

          // Create sold player record
          const soldPlayer: SoldPlayer = {
            ...currentPlayer,
            soldAmount: currentBid,
            teamName: selectedTeam.name,
            teamId: selectedTeam.id,
            soldDate: new Date().toISOString(),
          };

          // Save to Firebase (async, non-blocking)
          auctionPersistence.saveSoldPlayer(soldPlayer, selectedTeam.name).catch(err => {
            console.error('[Store] Failed to save sold player to Firebase:', err);
          });

          // If player was unsold earlier, remove unsold record
          if (unsoldPlayers.some(p => p.id === currentPlayer.id)) {
            auctionPersistence.removeUnsoldPlayer(currentPlayer.id).catch(err => {
              console.error('[Store] Failed to remove unsold player from Firebase:', err);
            });
          }

          // Update team stats
          const updatedTeams = teams.map(team => {
            if (team.name === selectedTeam.name) {
              const newPlayersBought = team.playersBought + 1;
              const newRemainingPurse = team.remainingPurse - currentBid;
              const newHighestBid = Math.max(team.highestBid, currentBid);
              const newUnderAgePlayers = currentPlayer.age && currentPlayer.age < activeConfig.auction.rules.underAgeLimit
                ? team.underAgePlayers + 1
                : team.underAgePlayers;

              return {
                ...team,
                playersBought: newPlayersBought,
                remainingPlayers: team.totalPlayerThreshold - newPlayersBought,
                remainingPurse: newRemainingPurse,
                highestBid: newHighestBid,
                underAgePlayers: newUnderAgePlayers,
              };
            }
            return team;
          });

          // Save updated teams to Firebase (async, non-blocking)
          auctionPersistence.saveTeams(updatedTeams).catch(err => {
            console.error('[Store] Failed to save teams to Firebase:', err);
          });

          // Remove from available players
          const updatedAvailable = availablePlayers.filter(p => p.id !== currentPlayer.id);

          const updatedUnsold = unsoldPlayers.filter(p => p.id !== currentPlayer.id);

          set({
            availablePlayers: updatedAvailable,
            soldPlayers: [...soldPlayers, soldPlayer],
            unsoldPlayers: updatedUnsold,
            teams: updatedTeams,
            activeOverlay: 'sold',
            notification: { 
              type: 'success', 
              message: `${currentPlayer.name} sold to ${selectedTeam.name} for ₹${currentBid}L` 
            },
          });
        },

        markAsUnsold: () => {
          const { currentPlayer, availablePlayers, unsoldPlayers, soldPlayers, currentRound } = get();

          if (!currentPlayer) {
            set({ 
              notification: { 
                type: 'error', 
                message: 'No player selected' 
              } 
            });
            return;
          }

          if (soldPlayers.some(p => p.id === currentPlayer.id)) {
            set({
              notification: {
                type: 'error',
                message: `${currentPlayer.name} is already sold. Cannot mark as unsold.`,
              },
            });
            return;
          }

          if (unsoldPlayers.some(p => p.id === currentPlayer.id)) {
            set({
              notification: {
                type: 'info',
                message: `${currentPlayer.name} is already marked unsold.`,
              },
            });
            return;
          }

          const roundLabel = `Round ${currentRound}`;

          // Create unsold player record
          const unsoldPlayer: UnsoldPlayer = {
            ...currentPlayer,
            round: roundLabel,
            unsoldDate: new Date().toISOString(),
          };

          // Save to Firebase (async, non-blocking)
          auctionPersistence.saveUnsoldPlayer(currentPlayer, roundLabel).catch(err => {
            console.error('[Store] Failed to save unsold player to Firebase:', err);
          });

          // Remove from available players
          const updatedAvailable = availablePlayers.filter(p => p.id !== currentPlayer.id);

          set({
            availablePlayers: updatedAvailable,
            unsoldPlayers: [...unsoldPlayers, unsoldPlayer],
            activeOverlay: 'unsold',
            notification: { 
              type: 'info', 
              message: `${currentPlayer.name} marked as unsold` 
            },
          });
        },

        moveUnsoldToSold: (player, team, amount) => {
          const { unsoldPlayers, soldPlayers, teams, availablePlayers } = get();

          if (soldPlayers.some(p => p.id === player.id)) {
            set({
              notification: {
                type: 'error',
                message: `${player.name} is already sold.`,
              },
            });
            return;
          }

          // Create sold player record
          const soldPlayer: SoldPlayer = {
            ...player,
            soldAmount: amount,
            teamName: team.name,
            teamId: team.id,
            soldDate: new Date().toISOString(),
          };

          // Save to Firebase (async, non-blocking)
          auctionPersistence.saveSoldPlayer(soldPlayer, team.name).catch(err => {
            console.error('[Store] Failed to save sold player to Firebase:', err);
          });

          // Remove unsold record from Firebase
          auctionPersistence.removeUnsoldPlayer(player.id).catch(err => {
            console.error('[Store] Failed to remove unsold player from Firebase:', err);
          });

          // Update team stats
          const updatedTeams = teams.map(t => {
            if (t.name === team.name) {
              const newPlayersBought = t.playersBought + 1;
              return {
                ...t,
                playersBought: newPlayersBought,
                remainingPlayers: t.totalPlayerThreshold - newPlayersBought,
                remainingPurse: t.remainingPurse - amount,
                highestBid: Math.max(t.highestBid, amount),
              };
            }
            return t;
          });

          // Remove from unsold players
          const updatedUnsold = unsoldPlayers.filter(p => p.id !== player.id);
          const updatedAvailable = availablePlayers.filter(p => p.id !== player.id);

          set({
            unsoldPlayers: updatedUnsold,
            availablePlayers: updatedAvailable,
            soldPlayers: [...soldPlayers, soldPlayer],
            teams: updatedTeams,
            notification: { 
              type: 'success', 
              message: `${player.name} moved to ${team.name} for ₹${amount}L` 
            },
          });
        },

        // === UI State Actions ===
        setLoading: (loading) => set({ isLoading: loading }),
        
        setError: (error) => set({ error }),
        
        showNotification: (type, message) => set({ notification: { type, message } }),
        
        clearNotification: () => set({ notification: null }),
        
        setOverlay: (overlay) => set({ activeOverlay: overlay }),

        // === Selection Mode Actions ===
        setSelectionMode: (mode) => set({ selectionMode: mode }),
        
        toggleSelectionMode: () => {
          const currentMode = get().selectionMode;
          set({ selectionMode: currentMode === 'sequential' ? 'random' : 'sequential' });
        },

        // === Round Management ===
        setMaxUnsoldRounds: (value) => {
          const sanitized = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 1;
          set({ maxUnsoldRounds: sanitized });
        },

        startNextRound: () => {
          const { unsoldPlayers, currentRound, maxUnsoldRounds } = get();
          const maxRound = 1 + maxUnsoldRounds;

          if (currentRound >= maxRound) {
            set({
              notification: {
                type: 'info',
                message: `Max rounds reached (${maxRound}). Auction completed.`,
              },
            });
            return;
          }

          if (unsoldPlayers.length === 0) {
            set({
              notification: {
                type: 'info',
                message: 'No unsold players available for the next round.',
              },
            });
            return;
          }
          
          // Convert unsold players back to available players for Round 2
          const round2Players: Player[] = unsoldPlayers.map(p => ({
            id: p.id,
            imageUrl: p.imageUrl,
            name: p.name,
            role: p.role,
            age: p.age,
            matches: p.matches,
            runs: p.runs || 'N/A',
            wickets: p.wickets || 'N/A',
            battingBestFigures: p.battingBestFigures,
            bowlingBestFigures: p.bowlingBestFigures,
            basePrice: p.basePrice,
            dateOfBirth: '',
          }));

          // Clear unsold list in Firebase for clean Round 2 state
          auctionPersistence.clearUnsoldPlayers().catch(err => {
            console.error('[Store] Failed to clear unsold players in Firebase:', err);
          });

          const nextRound = currentRound + 1;

          set({
            availablePlayers: round2Players,
            unsoldPlayers: [],
            currentRound: nextRound,
            isRound2Active: nextRound > 1,
            notification: { 
              type: 'info', 
              message: `Round ${nextRound} started with ${round2Players.length} players` 
            },
            lastBidTeamId: null,
          });
        },

        // Backward compatibility alias
        startRound2: () => {
          get().startNextRound();
        },

        // === State Management ===
        setAuctionState: (state) => {
          set({
            auctionState: {
              ...get().auctionState,
              ...state,
            },
          });
        },

        resetAuction: () => {
          set({
            availablePlayers: [],
            originalPlayers: [],
            soldPlayers: [],
            unsoldPlayers: [],
            currentPlayer: null,
            currentBid: activeConfig.auction.basePrice,
            previousBid: 0,
            selectedTeam: null,
            bidHistory: [],
            activeOverlay: null,
            notification: null,
            currentRound: 1,
            isRound2Active: false,
            auctionState: initialAuctionState,
            lastBidTeamId: null,
          });
        },

        jumpToPlayerIndex: (index) => {
          const { availablePlayers, originalPlayers } = get();

          if (!Number.isFinite(index) || index < 1 || index > originalPlayers.length) {
            set({
              notification: {
                type: 'error',
                message: `Enter a player number between 1 and ${originalPlayers.length}`,
              },
            });
            return false;
          }

          // Find the player by their original position in originalPlayers (not availablePlayers)
          // This ensures we always jump to the SAME player ID regardless of queue state
          const targetPlayer = originalPlayers[index - 1];
          
          if (!targetPlayer) {
            return false;
          }

          console.log('[Store] Jump to player index:', {
            requestedIndex: index,
            targetPlayerId: targetPlayer.id,
            targetPlayerName: targetPlayer.name,
            availablePlayerCount: availablePlayers.length,
            totalPlayerCount: originalPlayers.length,
          });

          // Find this player in the current available queue
          const currentPosition = availablePlayers.findIndex(p => p.id === targetPlayer.id);
          
          if (currentPosition === -1) {
            // Player not in available queue (already sold)
            set({
              notification: {
                type: 'error',
                message: `Player "${targetPlayer.name}" is not available (already sold)`,
              },
            });
            return false;
          }

          // Reorder: Move this player to front
          const reordered = [
            ...availablePlayers.slice(currentPosition),
            ...availablePlayers.slice(0, currentPosition),
          ];

          set({
            availablePlayers: reordered,
            lastBidTeamId: null,
          });

          get().selectPlayer(targetPlayer);
          return true;
        },

        jumpToPlayerId: (playerId) => {
          const { availablePlayers } = get();

          if (!playerId || typeof playerId !== 'string') {
            set({
              notification: {
                type: 'error',
                message: 'Invalid player ID',
              },
            });
            return false;
          }

          console.log('[Store] Jump to player by ID:', playerId);

          // Find player in available queue
          const currentPosition = availablePlayers.findIndex(p => p.id === playerId);
          
          if (currentPosition === -1) {
            // Player not found in available queue
            set({
              notification: {
                type: 'error',
                message: `Player ID "${playerId}" not available`,
              },
            });
            return false;
          }

          const targetPlayer = availablePlayers[currentPosition];

          console.log('[Store] Found player:', {
            playerId: targetPlayer.id,
            playerName: targetPlayer.name,
            currentPosition,
            availableCount: availablePlayers.length,
          });

          // Reorder: Move this player to front
          const reordered = [
            ...availablePlayers.slice(currentPosition),
            ...availablePlayers.slice(0, currentPosition),
          ];

          set({
            availablePlayers: reordered,
            lastBidTeamId: null,
          });

          get().selectPlayer(targetPlayer);
          return true;
        },

        // === Computed Values ===
        getEligibleTeams: () => {
          const { teams, currentBid, currentPlayer } = get();
          
          if (!currentPlayer) return teams;

          const rulesService = new AuctionRulesService();
          return teams.filter(team => {
            const validation = rulesService.validateBid(team, currentBid, currentPlayer.basePrice, currentPlayer.age);
            return validation.valid;
          });
        },

        getMaxBidForTeam: (team) => {
          const rulesService = new AuctionRulesService();
          return rulesService.calculateMaxBid(team);
        },

        getPlayerStats: () => {
          const { availablePlayers, soldPlayers, unsoldPlayers } = get();
          return {
            total: availablePlayers.length + soldPlayers.length + unsoldPlayers.length,
            available: availablePlayers.length,
            sold: soldPlayers.length,
            unsold: unsoldPlayers.length,
          };
        },
      }),
      {
        name: 'auction-storage',
        // Only persist specific fields
        partialize: (state) => ({
          soldPlayers: state.soldPlayers,
          unsoldPlayers: state.unsoldPlayers,
          currentRound: state.currentRound,
          isRound2Active: state.isRound2Active,
          maxUnsoldRounds: state.maxUnsoldRounds,
        }),
      }
    ),
    { name: 'AuctionStore' }
  )
);

// Export selectors for common access patterns
export const useCurrentPlayer = () => useAuctionStore((state) => state.currentPlayer);
export const useCurrentBid = () => useAuctionStore((state) => state.currentBid);
export const useSelectedTeam = () => useAuctionStore((state) => state.selectedTeam);
export const useTeams = () => useAuctionStore((state) => state.teams);
export const useAvailablePlayers = () => useAuctionStore((state) => state.availablePlayers);
export const useOriginalPlayers = () => useAuctionStore((state) => state.originalPlayers);
export const useSoldPlayers = () => useAuctionStore((state) => state.soldPlayers);
export const useUnsoldPlayers = () => useAuctionStore((state) => state.unsoldPlayers);
export const useNotification = () => useAuctionStore((state) => state.notification);
export const useActiveOverlay = () => useAuctionStore((state) => state.activeOverlay);
export const useSelectionMode = () => useAuctionStore((state) => state.selectionMode);
export const useIsLoading = () => useAuctionStore((state) => state.isLoading);
export const useCurrentRound = () => useAuctionStore((state) => state.currentRound);
export const useMaxUnsoldRounds = () => useAuctionStore((state) => state.maxUnsoldRounds);
