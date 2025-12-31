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

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface AuctionStore {
  // === State ===
  // Player pools
  availablePlayers: Player[];
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
  
  // Auction state
  auctionState: AuctionState;
  
  // === Actions ===
  // Data loading
  setPlayers: (players: Player[]) => void;
  setTeams: (teams: Team[]) => void;
  setSoldPlayers: (players: SoldPlayer[]) => void;
  setUnsoldPlayers: (players: UnsoldPlayer[]) => void;
  
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
        soldPlayers: [],
        unsoldPlayers: [],
        teams: [],
        selectedTeam: null,
        currentPlayer: null,
        currentBid: activeConfig.auction.basePrice,
        previousBid: 0,
        bidHistory: [],
        isLoading: false,
        error: null,
        notification: null,
        activeOverlay: null,
        selectionMode: 'sequential',
        currentRound: 1,
        isRound2Active: false,
        auctionState: initialAuctionState,

        // === Data Loading Actions ===
        setPlayers: (players) => set({ availablePlayers: players }),
        
        setTeams: (teams) => set({ teams }),
        
        setSoldPlayers: (players) => set({ soldPlayers: players }),
        
        setUnsoldPlayers: (players) => set({ unsoldPlayers: players }),

        // === Player Selection Actions ===
        selectPlayer: (player) => {
          set({
            currentPlayer: player,
            currentBid: player.basePrice,
            previousBid: 0,
            selectedTeam: null,
            bidHistory: [],
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
          const { availablePlayers, selectionMode } = get();
          
          if (availablePlayers.length === 0) {
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
          const { currentPlayer, currentBid, bidHistory } = get();
          
          if (!currentPlayer) return false;

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

          set({
            previousBid: currentBid,
            currentBid: amount,
            selectedTeam: team,
            bidHistory: [...bidHistory, newBidEntry],
            auctionState: {
              ...get().auctionState,
              currentBid: amount,
              selectedTeam: team,
              bidHistory: [...bidHistory, newBidEntry],
            },
          });

          return true;
        },

        incrementBid: () => {
          const { currentBid, selectedTeam, currentPlayer, bidHistory } = get();
          const increment = activeConfig.auction.bidIncrements.default;
          const newBid = currentBid + increment;

          // Check if selected team can afford the new bid
          if (selectedTeam && currentPlayer) {
            const rulesService = new AuctionRulesService();
            const maxBid = rulesService.calculateMaxBid(selectedTeam);
            
            if (newBid > maxBid) {
              set({ 
                notification: {
                  type: 'warning', 
                  message: `${selectedTeam.name} cannot bid more than ₹${maxBid.toFixed(2)}L` 
                } 
              });
              return;
            }

            // Add to bid history when team is selected
            const newBidEntry: BidHistory = {
              teamId: selectedTeam.id,
              teamName: selectedTeam.name,
              amount: newBid,
              timestamp: new Date().toISOString(),
            };

            set({
              previousBid: currentBid,
              currentBid: newBid,
              bidHistory: [...bidHistory, newBidEntry],
              auctionState: {
                ...get().auctionState,
                currentBid: newBid,
                bidHistory: [...bidHistory, newBidEntry],
              },
            });
          } else {
            // No team selected, just increment without history
            set({
              previousBid: currentBid,
              currentBid: newBid,
              auctionState: {
                ...get().auctionState,
                currentBid: newBid,
              },
            });
          }
        },

        decrementBid: () => {
          const { currentBid, currentPlayer, bidHistory, teams } = get();
          const decrement = activeConfig.auction.bidIncrements.default;
          const minBid = currentPlayer?.basePrice || activeConfig.auction.basePrice;
          const newBid = Math.max(minBid, currentBid - decrement);

          // Pop last bid from history and restore that team
          let newHistory = [...bidHistory];
          let previousTeam = null;
          
          if (newHistory.length > 0) {
            newHistory.pop(); // Remove the current bid
            // Get the previous bid's team (if any)
            if (newHistory.length > 0) {
              const prevBid = newHistory[newHistory.length - 1];
              previousTeam = teams.find(t => t.id === prevBid.teamId) || null;
            }
          }

          set({
            previousBid: currentBid,
            currentBid: newBid,
            selectedTeam: previousTeam,
            bidHistory: newHistory,
            auctionState: {
              ...get().auctionState,
              currentBid: newBid,
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
            auctionState: {
              ...get().auctionState,
              currentBid: basePrice,
              selectedTeam: null,
            },
          });
        },

        // === Auction Outcome Actions ===
        markAsSold: () => {
          const { currentPlayer, currentBid, selectedTeam, availablePlayers, soldPlayers, teams } = get();

          if (!currentPlayer || !selectedTeam) {
            set({ 
              notification: { 
                type: 'error', 
                message: 'Please select a team before marking as sold' 
              } 
            });
            return;
          }

          // Create sold player record
          const soldPlayer: SoldPlayer = {
            ...currentPlayer,
            soldAmount: currentBid,
            teamName: selectedTeam.name,
            soldDate: new Date().toISOString(),
          };

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

          // Remove from available players
          const updatedAvailable = availablePlayers.filter(p => p.id !== currentPlayer.id);

          set({
            availablePlayers: updatedAvailable,
            soldPlayers: [...soldPlayers, soldPlayer],
            teams: updatedTeams,
            activeOverlay: 'sold',
            notification: { 
              type: 'success', 
              message: `${currentPlayer.name} sold to ${selectedTeam.name} for ₹${currentBid}L` 
            },
          });
        },

        markAsUnsold: () => {
          const { currentPlayer, availablePlayers, unsoldPlayers, currentRound } = get();

          if (!currentPlayer) {
            set({ 
              notification: { 
                type: 'error', 
                message: 'No player selected' 
              } 
            });
            return;
          }

          // Create unsold player record
          const unsoldPlayer: UnsoldPlayer = {
            ...currentPlayer,
            round: `Round ${currentRound}`,
            unsoldDate: new Date().toISOString(),
          };

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
          const { unsoldPlayers, soldPlayers, teams } = get();

          // Create sold player record
          const soldPlayer: SoldPlayer = {
            ...player,
            soldAmount: amount,
            teamName: team.name,
            soldDate: new Date().toISOString(),
          };

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

          set({
            unsoldPlayers: updatedUnsold,
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
        startRound2: () => {
          const { unsoldPlayers } = get();
          
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

          set({
            availablePlayers: round2Players,
            unsoldPlayers: [],
            currentRound: 2,
            isRound2Active: true,
            notification: { 
              type: 'info', 
              message: `Round 2 started with ${round2Players.length} players` 
            },
          });
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
          });
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
export const useSoldPlayers = () => useAuctionStore((state) => state.soldPlayers);
export const useUnsoldPlayers = () => useAuctionStore((state) => state.unsoldPlayers);
export const useNotification = () => useAuctionStore((state) => state.notification);
export const useActiveOverlay = () => useAuctionStore((state) => state.activeOverlay);
export const useSelectionMode = () => useAuctionStore((state) => state.selectionMode);
export const useIsLoading = () => useAuctionStore((state) => state.isLoading);
