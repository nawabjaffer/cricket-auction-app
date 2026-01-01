// ============================================================================
// AUCTION APP V2 - ZUSTAND STORE WITH SLICES PATTERN
// Modular state management with better separation of concerns
// ============================================================================

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { activeConfig } from '../../config';
import type {
  Player,
  AvailablePlayer,
  SoldPlayer,
  UnsoldPlayer,
  Team,
  Bid,
  AuctionPhase,
  AuctionSession,
  SelectionMode,
  OverlayType,
  Notification,
  NotificationType,
  ThemeMode,
  ActionRecord,
  AuctionEvent,
} from '../../types/v2';

type StateCreator<
  T,
  Mis extends [keyof import('zustand').StoreMutators<unknown, unknown>, unknown][] = [],
  Mos extends [keyof import('zustand').StoreMutators<unknown, unknown>, unknown][] = [],
  U = T,
> = import('zustand').StateCreator<T, Mis, Mos, U>;

function createStableId(prefix: string): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}_${uuid}`;
  } catch {
    // ignore
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getUndoHistoryLimit(): number {
  const configured = activeConfig?.auction?.undo?.historySize;
  const limit = typeof configured === 'number' ? configured : 50;
  return Math.max(0, Math.floor(limit));
}

// ============================================================================
// SLICE TYPES
// ============================================================================

/** Player slice state and actions */
interface PlayerSlice {
  // State
  availablePlayers: AvailablePlayer[];
  soldPlayers: SoldPlayer[];
  unsoldPlayers: UnsoldPlayer[];
  currentPlayer: Player | null;
  playerIndex: number;
  
  // Actions
  setPlayers: (players: AvailablePlayer[]) => void;
  selectPlayer: (player: AvailablePlayer) => void;
  selectNextPlayer: () => void;
  selectRandomPlayer: () => void;
  markAsSold: (teamId: string, teamName: string, amount: number) => void;
  markAsUnsold: () => void;
  moveUnsoldToSold: (playerId: string, teamId: string, teamName: string, amount: number) => void;
  clearCurrentPlayer: () => void;
  resetPlayers: () => void;
}

/** Team slice state and actions */
interface TeamSlice {
  // State
  teams: Team[];
  selectedTeam: Team | null;
  
  // Actions
  setTeams: (teams: Team[]) => void;
  selectTeam: (team: Team) => void;
  clearTeam: () => void;
  updateTeamBudget: (teamId: string, amount: number) => void;
  addPlayerToTeam: (teamId: string, player: SoldPlayer) => void;
  getEligibleTeams: () => Team[];
  getMaxBidForTeam: (team: Team) => number;
  resetTeams: () => void;
}

/** Bidding slice state and actions */
interface BidSlice {
  // State
  currentBid: number;
  basePrice: number;
  bidHistory: Bid[];
  bidMultiplier: number;
  
  // Actions
  setBasePrice: (price: number) => void;
  placeBid: (teamId: string, teamName: string, amount: number) => void;
  incrementBid: () => void;
  decrementBid: () => void;
  setBidMultiplier: (multiplier: number) => void;
  resetBid: () => void;
  undoLastBid: () => void;
}

/** Auction session slice state and actions */
interface SessionSlice {
  // State
  session: AuctionSession | null;
  phase: AuctionPhase;
  round: number;
  selectionMode: SelectionMode;
  isRound2Active: boolean;
  
  // Actions
  startSession: (config?: Partial<AuctionSession>) => void;
  endSession: () => void;
  setPhase: (phase: AuctionPhase) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  startRound2: () => void;
  pauseAuction: () => void;
  resumeAuction: () => void;
}

/** UI slice state and actions */
interface UISlice {
  // State
  isLoading: boolean;
  error: Error | null;
  activeOverlay: OverlayType;
  notifications: Notification[];
  showHeader: boolean;
  showTeamPanel: boolean;
  theme: ThemeMode;
  
  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  setOverlay: (overlay: OverlayType) => void;
  toggleHeader: () => void;
  toggleTeamPanel: () => void;
  setTheme: (theme: ThemeMode) => void;
  addNotification: (type: NotificationType, title: string, message: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

/** History slice for undo/redo */
interface HistorySlice {
  // State
  actionHistory: ActionRecord[];
  maxHistory: number;
  
  // Actions
  recordAction: (event: { type: AuctionEvent['type']; payload: unknown }) => void;
  undoAction: () => ActionRecord | null;
  clearHistory: () => void;
}

// ============================================================================
// COMBINED STORE TYPE
// ============================================================================

export type AuctionStoreV2 = PlayerSlice & TeamSlice & BidSlice & SessionSlice & UISlice & HistorySlice;

// ============================================================================
// SLICE CREATORS
// ============================================================================

const createPlayerSlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  PlayerSlice
> = (set, get) => ({
  // Initial state
  availablePlayers: [],
  soldPlayers: [],
  unsoldPlayers: [],
  currentPlayer: null,
  playerIndex: 0,

  // Actions
  setPlayers: (players) =>
    set((state) => {
      state.availablePlayers = players;
      state.playerIndex = 0;
    }),

  selectPlayer: (player) =>
    set((state) => {
      state.currentPlayer = {
        ...player,
        status: 'bidding' as const,
        currentBid: player.basePrice,
        biddingTeam: null,
        startTime: Date.now(),
      };
      // Remove from available
      state.availablePlayers = state.availablePlayers.filter((p) => p.id !== player.id);
    }),

  selectNextPlayer: () => {
    const { availablePlayers, selectionMode, playerIndex } = get();
    if (availablePlayers.length === 0) {
      get().setOverlay('end');
      return;
    }

    let nextPlayer: AvailablePlayer;
    if (selectionMode === 'random') {
      const randomIndex = Math.floor(Math.random() * availablePlayers.length);
      nextPlayer = availablePlayers[randomIndex];
    } else {
      nextPlayer = availablePlayers[playerIndex % availablePlayers.length];
      set((state) => {
        state.playerIndex = playerIndex + 1;
      });
    }

    get().selectPlayer(nextPlayer);
    get().resetBid();
    get().setBasePrice(nextPlayer.basePrice);
  },

  selectRandomPlayer: () => {
    const { availablePlayers } = get();
    if (availablePlayers.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * availablePlayers.length);
    const player = availablePlayers[randomIndex];
    get().selectPlayer(player);
    get().resetBid();
    get().setBasePrice(player.basePrice);
  },

  markAsSold: (teamId, teamName, amount) =>
    set((state) => {
      if (!state.currentPlayer) return;
      
      const soldPlayer: SoldPlayer = {
        ...state.currentPlayer,
        status: 'sold',
        soldAmount: amount,
        teamId,
        teamName,
        soldAt: Date.now(),
        round: state.round,
      };
      
      state.soldPlayers.push(soldPlayer);
      state.currentPlayer = null;
      
      // Update team
      const team = state.teams.find((t) => t.id === teamId);
      if (team) {
        team.players.push(soldPlayer);
        team.remainingBudget -= amount;
      }
    }),

  markAsUnsold: () =>
    set((state) => {
      if (!state.currentPlayer) return;
      
      const unsoldPlayer: UnsoldPlayer = {
        ...state.currentPlayer,
        status: 'unsold',
        round: state.round,
        unsoldAt: Date.now(),
        canRetry: state.round === 1,
      };
      
      state.unsoldPlayers.push(unsoldPlayer);
      state.currentPlayer = null;
    }),

  moveUnsoldToSold: (playerId, teamId, teamName, amount) =>
    set((state) => {
      const playerIndex = state.unsoldPlayers.findIndex((p) => p.id === playerId);
      if (playerIndex === -1) return;
      
      const player = state.unsoldPlayers[playerIndex];
      const soldPlayer: SoldPlayer = {
        ...player,
        status: 'sold',
        soldAmount: amount,
        teamId,
        teamName,
        soldAt: Date.now(),
        round: state.round,
      };
      
      state.unsoldPlayers.splice(playerIndex, 1);
      state.soldPlayers.push(soldPlayer);
      
      // Update team
      const team = state.teams.find((t) => t.id === teamId);
      if (team) {
        team.players.push(soldPlayer);
        team.remainingBudget -= amount;
      }
    }),

  clearCurrentPlayer: () =>
    set((state) => {
      state.currentPlayer = null;
    }),

  resetPlayers: () =>
    set((state) => {
      state.availablePlayers = [];
      state.soldPlayers = [];
      state.unsoldPlayers = [];
      state.currentPlayer = null;
      state.playerIndex = 0;
    }),
});

const createTeamSlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  TeamSlice
> = (set, get) => ({
  // Initial state
  teams: [],
  selectedTeam: null,

  // Actions
  setTeams: (teams) =>
    set((state) => {
      state.teams = teams;
    }),

  selectTeam: (team) =>
    set((state) => {
      state.selectedTeam = team;
    }),

  clearTeam: () =>
    set((state) => {
      state.selectedTeam = null;
    }),

  updateTeamBudget: (teamId, amount) =>
    set((state) => {
      const team = state.teams.find((t) => t.id === teamId);
      if (team) {
        team.remainingBudget -= amount;
      }
    }),

  addPlayerToTeam: (teamId, player) =>
    set((state) => {
      const team = state.teams.find((t) => t.id === teamId);
      if (team) {
        team.players.push(player);
      }
    }),

  getEligibleTeams: () => {
    const { teams, currentPlayer } = get();
    if (!currentPlayer) return [];
    
    const minBid = 'basePrice' in currentPlayer ? currentPlayer.basePrice : 0;
    
    return teams.filter((team) => {
      const maxBid = get().getMaxBidForTeam(team);
      const hasCapacity = team.players.length < team.config.maxPlayers;
      const hasBudget = maxBid >= minBid;
      return hasCapacity && hasBudget;
    });
  },

  getMaxBidForTeam: (team) => {
    const remainingSlots = team.config.maxPlayers - team.players.length - 1;
    const reserveAmount = remainingSlots * 0.5; // 50L base per remaining player
    return Math.max(0, team.remainingBudget - reserveAmount);
  },

  resetTeams: () =>
    set((state) => {
      state.teams.forEach((team) => {
        team.players = [];
        team.remainingBudget = team.config.totalBudget;
      });
      state.selectedTeam = null;
    }),
});

const createBidSlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  BidSlice
> = (set) => ({
  // Initial state
  currentBid: 0.5,
  basePrice: 0.5,
  bidHistory: [],
  bidMultiplier: 1,

  // Actions
  setBasePrice: (price) =>
    set((state) => {
      state.basePrice = price;
      state.currentBid = price;
    }),

  placeBid: (teamId, teamName, amount) =>
    set((state) => {
      const bid: Bid = {
        id: createStableId('bid'),
        teamId,
        teamName,
        amount,
        timestamp: Date.now(),
        playerId: state.currentPlayer?.id ?? '',
        isWinning: true,
      };
      
      // Mark previous bids as not winning
      state.bidHistory.forEach((b) => {
        b.isWinning = false;
      });
      
      state.bidHistory.push(bid);
      const limit = getUndoHistoryLimit();
      if (limit > 0 && state.bidHistory.length > limit) {
        state.bidHistory = state.bidHistory.slice(-limit);
      }
      state.currentBid = amount;
    }),

  incrementBid: () =>
    set((state) => {
      const { currentBid, bidMultiplier } = state;
      let increment = 0.1; // Default 10L increment
      
      // Dynamic increment based on current bid
      if (currentBid >= 5) increment = 0.25;
      if (currentBid >= 10) increment = 0.5;
      if (currentBid >= 20) increment = 1;
      
      state.currentBid = Math.round((currentBid + increment * bidMultiplier) * 100) / 100;
    }),

  decrementBid: () =>
    set((state) => {
      const { currentBid, basePrice } = state;
      let decrement = 0.1;
      
      if (currentBid >= 20) decrement = 1;
      else if (currentBid >= 10) decrement = 0.5;
      else if (currentBid >= 5) decrement = 0.25;
      
      const newBid = Math.round((currentBid - decrement) * 100) / 100;
      state.currentBid = Math.max(basePrice, newBid);
    }),

  setBidMultiplier: (multiplier) =>
    set((state) => {
      state.bidMultiplier = multiplier;
    }),

  resetBid: () =>
    set((state) => {
      state.currentBid = state.basePrice;
      state.bidHistory = [];
    }),

  undoLastBid: () =>
    set((state) => {
      if (state.bidHistory.length === 0) return;
      
      const lastBid = state.bidHistory.pop();
      if (lastBid && state.bidHistory.length > 0) {
        const prevBid = state.bidHistory.at(-1);
        if (!prevBid) {
          state.currentBid = state.basePrice;
          return;
        }
        prevBid.isWinning = true;
        state.currentBid = prevBid.amount;
      } else {
        state.currentBid = state.basePrice;
      }
    }),
});

const createSessionSlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  SessionSlice
> = (set, get) => ({
  // Initial state
  session: null,
  phase: 'setup',
  round: 1,
  selectionMode: 'sequential',
  isRound2Active: false,

  // Actions
  startSession: (config) =>
    set((state) => {
      const maxUndos = getUndoHistoryLimit();
      state.session = {
        id: createStableId('session'),
        startedAt: Date.now(),
        phase: 'round_1',
        config: {
          basePrice: 0.5,
          maxBidTime: 0,
          bidIncrements: [],
          selectionMode: 'sequential',
          enableUndo: true,
          maxUndos,
          ...config?.config,
        },
        currentPlayerIndex: 0,
        totalPlayers: state.availablePlayers.length,
        round: 1,
      };
      state.phase = 'round_1';
      state.round = 1;
    }),

  endSession: () =>
    set((state) => {
      state.session = null;
      state.phase = 'completed';
    }),

  setPhase: (phase) =>
    set((state) => {
      state.phase = phase;
    }),

  setSelectionMode: (mode) =>
    set((state) => {
      state.selectionMode = mode;
    }),

  startRound2: () => {
    const { unsoldPlayers } = get();
    const retryPlayers = unsoldPlayers.filter((p) => p.canRetry);
    
    set((state) => {
      state.round = 2;
      state.isRound2Active = true;
      state.phase = 'round_2';
      // Move retry-eligible unsold players back to available
      state.availablePlayers = retryPlayers.map((p) => ({
        ...p,
        status: 'available' as const,
      }));
      state.unsoldPlayers = unsoldPlayers.filter((p) => !p.canRetry);
      state.playerIndex = 0;
    });
    
    get().addNotification('info', 'Round 2 Started', `${retryPlayers.length} players available for retry`);
  },

  pauseAuction: () =>
    set((state) => {
      state.phase = 'paused';
    }),

  resumeAuction: () =>
    set((state) => {
      state.phase = state.round === 1 ? 'round_1' : 'round_2';
    }),
});

const createUISlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  UISlice
> = (set, get) => ({
  // Initial state
  isLoading: false,
  error: null,
  activeOverlay: null,
  notifications: [],
  showHeader: false,
  showTeamPanel: false,
  theme: 'dark',

  // Actions
  setLoading: (loading) =>
    set((state) => {
      state.isLoading = loading;
    }),

  setError: (error) =>
    set((state) => {
      state.error = error;
    }),

  setOverlay: (overlay) =>
    set((state) => {
      state.activeOverlay = overlay;
    }),

  toggleHeader: () =>
    set((state) => {
      state.showHeader = !state.showHeader;
    }),

  toggleTeamPanel: () =>
    set((state) => {
      state.showTeamPanel = !state.showTeamPanel;
    }),

  setTheme: (theme) =>
    set((state) => {
      state.theme = theme;
    }),

  addNotification: (type, title, message) =>
    set((state) => {
      const notification: Notification = {
        id: `notif_${Date.now()}`,
        type,
        title,
        message,
        duration: type === 'error' ? 5000 : 3000,
        dismissible: true,
        createdAt: Date.now(),
      };
      state.notifications.push(notification);
      
      // Auto-remove after duration
      setTimeout(() => {
        get().removeNotification(notification.id);
      }, notification.duration);
    }),

  removeNotification: (id) =>
    set((state) => {
      state.notifications = state.notifications.filter((n) => n.id !== id);
    }),

  clearNotifications: () =>
    set((state) => {
      state.notifications = [];
    }),
});

const createHistorySlice: StateCreator<
  AuctionStoreV2,
  [['zustand/immer', never]],
  [],
  HistorySlice
> = (set, get) => ({
  // Initial state
  actionHistory: [],
  maxHistory: getUndoHistoryLimit(),

  // Actions
  recordAction: (event) =>
    set((state) => {
      const record: ActionRecord = {
        id: createStableId('action'),
        type: event.type,
        payload: event.payload,
        timestamp: Date.now(),
        canUndo: ['BID_PLACED', 'PLAYER_SOLD', 'PLAYER_UNSOLD'].includes(event.type),
        undone: false,
      };
      
      state.actionHistory.push(record);

      // Keep config-driven limit up-to-date (in case config changed at runtime)
      state.maxHistory = getUndoHistoryLimit();
      
      // Trim history if too long
      if (state.actionHistory.length > state.maxHistory) {
        state.actionHistory = state.actionHistory.slice(-state.maxHistory);
      }
    }),

  undoAction: () => {
    const { actionHistory } = get();
    const lastUndoable = [...actionHistory].reverse().find((a) => a.canUndo && !a.undone);
    
    if (lastUndoable) {
      set((state) => {
        const action = state.actionHistory.find((a) => a.id === lastUndoable.id);
        if (action) action.undone = true;
      });
      return lastUndoable;
    }
    return null;
  },

  clearHistory: () =>
    set((state) => {
      state.actionHistory = [];
    }),
});

// ============================================================================
// COMBINED STORE
// ============================================================================

export const useAuctionStoreV2 = create<AuctionStoreV2>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((...args) => ({
          ...createPlayerSlice(...args),
          ...createTeamSlice(...args),
          ...createBidSlice(...args),
          ...createSessionSlice(...args),
          ...createUISlice(...args),
          ...createHistorySlice(...args),
        }))
      ),
      {
        name: 'auction-store-v2',
        partialize: (state) => ({
          // Only persist essential data
          soldPlayers: state.soldPlayers,
          unsoldPlayers: state.unsoldPlayers,
          teams: state.teams,
          round: state.round,
          theme: state.theme,
          selectionMode: state.selectionMode,
        }),
      }
    ),
    { name: 'AuctionStoreV2' }
  )
);

// ============================================================================
// SELECTOR HOOKS
// ============================================================================

export const useCurrentPlayerV2 = () => useAuctionStoreV2((state) => state.currentPlayer);
export const useTeamsV2 = () => useAuctionStoreV2((state) => state.teams);
export const useSelectedTeamV2 = () => useAuctionStoreV2((state) => state.selectedTeam);
export const useSoldPlayersV2 = () => useAuctionStoreV2((state) => state.soldPlayers);
export const useUnsoldPlayersV2 = () => useAuctionStoreV2((state) => state.unsoldPlayers);
export const useBidHistoryV2 = () => useAuctionStoreV2((state) => state.bidHistory);
export const useCurrentBidV2 = () => useAuctionStoreV2((state) => state.currentBid);
export const useAuctionPhaseV2 = () => useAuctionStoreV2((state) => state.phase);
export const useNotificationsV2 = () => useAuctionStoreV2((state) => state.notifications);
export const useOverlayV2 = () => useAuctionStoreV2((state) => state.activeOverlay);
export const useThemeV2 = () => useAuctionStoreV2((state) => state.theme);
