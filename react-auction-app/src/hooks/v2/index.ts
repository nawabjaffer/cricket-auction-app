// ============================================================================
// AUCTION APP V2 - CUSTOM HOOKS
// Modern React hooks with better patterns and TypeScript support
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuctionStoreV2 } from '../../store/v2/auctionStoreV2';
import type { Team, NotificationType } from '../../types/v2';

// ============================================================================
// AUCTION OPERATIONS HOOK
// ============================================================================

export function useAuctionV2() {
  const store = useAuctionStoreV2();
  
  const selectNextPlayer = useCallback(() => {
    store.selectNextPlayer();
  }, [store]);

  const selectRandomPlayer = useCallback(() => {
    store.selectRandomPlayer();
  }, [store]);

  const placeBid = useCallback((team: Team) => {
    // IMPORTANT: `store` here is a snapshot; use getState() for current values in the same tick.
    const { currentBid } = useAuctionStoreV2.getState();
    const maxBid = store.getMaxBidForTeam(team);
    if (currentBid > maxBid) {
      store.addNotification('error', 'Invalid Bid', `${team.name} cannot afford this bid`);
      return false;
    }
    store.placeBid(team.id, team.name, currentBid);
    store.selectTeam(team);
    store.recordAction({ type: 'BID_PLACED', payload: { bid: { teamId: team.id, amount: currentBid } } });
    return true;
  }, [store]);

  const incrementBid = useCallback(() => {
    store.incrementBid();
  }, [store]);

  const decrementBid = useCallback(() => {
    store.decrementBid();
  }, [store]);

  const markAsSold = useCallback(async () => {
    const { currentPlayer, selectedTeam, currentBid } = store;
    
    if (!currentPlayer || !selectedTeam) {
      store.addNotification('error', 'Cannot Sell', 'Please select a team first');
      return false;
    }

    store.markAsSold(selectedTeam.id, selectedTeam.name, currentBid);
    store.setOverlay('sold');
    store.recordAction({ 
      type: 'PLAYER_SOLD', 
      payload: { 
        player: { 
          id: currentPlayer.id, 
          name: currentPlayer.name,
          teamId: selectedTeam.id,
          amount: currentBid 
        } 
      } 
    });
    
    store.addNotification('success', 'Player Sold!', `${currentPlayer.name} sold to ${selectedTeam.name} for ₹${currentBid}L`);
    return true;
  }, [store]);

  const markAsUnsold = useCallback(async () => {
    const { currentPlayer } = store;
    
    if (!currentPlayer) {
      store.addNotification('error', 'Cannot Mark Unsold', 'No player selected');
      return false;
    }

    store.markAsUnsold();
    store.setOverlay('unsold');
    store.recordAction({ 
      type: 'PLAYER_UNSOLD', 
      payload: { player: { id: currentPlayer.id, name: currentPlayer.name } } 
    });
    
    store.addNotification('info', 'Player Unsold', `${currentPlayer.name} marked as unsold`);
    return true;
  }, [store]);

  const undoLastAction = useCallback(() => {
    const action = store.undoAction();
    if (!action) return;

    if (action.type === 'BID_PLACED') {
      store.undoLastBid();
      store.addNotification('info', 'Action Undone', `Undid: ${action.type}`);
      return;
    }

    // Prevent incorrect state changes (previously this always popped bid history)
    store.addNotification('warning', 'Undo Not Supported', `Cannot undo: ${action.type}`);
  }, [store]);

  const closeOverlay = useCallback(() => {
    store.setOverlay(null);
    store.clearCurrentPlayer();
    store.clearTeam();
    store.resetBid();
  }, [store]);

  const startRound2 = useCallback(() => {
    store.startRound2();
  }, [store]);

  const selectTeam = useCallback((team: Team) => {
    store.selectTeam(team);
  }, [store]);

  return {
    // State
    currentPlayer: store.currentPlayer,
    selectedTeam: store.selectedTeam,
    currentBid: store.currentBid,
    bidHistory: store.bidHistory,
    teams: store.teams,
    soldPlayers: store.soldPlayers,
    unsoldPlayers: store.unsoldPlayers,
    phase: store.phase,
    round: store.round,
    bidMultiplier: store.bidMultiplier,
    
    // Actions
    selectNextPlayer,
    selectRandomPlayer,
    placeBid,
    incrementBid,
    decrementBid,
    markAsSold,
    markAsUnsold,
    undoLastAction,
    closeOverlay,
    startRound2,
    selectTeam,
    
    // Computed
    getEligibleTeams: store.getEligibleTeams,
    getMaxBidForTeam: store.getMaxBidForTeam,
  };
}

// ============================================================================
// KEYBOARD SHORTCUTS HOOK
// ============================================================================

interface KeyboardOptions {
  enabled?: boolean;
  onViewToggle?: () => void;
  onEscape?: () => void;
  onHeaderToggle?: () => void;
  onBidMultiplierChange?: (multiplier: number) => void;
}

export function useKeyboardShortcutsV2(options: KeyboardOptions = {}) {
  const { 
    enabled = true, 
    onViewToggle, 
    onEscape, 
    onHeaderToggle,
    onBidMultiplierChange,
  } = options;
  
  const auction = useAuctionV2();
  const store = useAuctionStoreV2();

  const computeNextBidAmount = useCallback((currentBid: number, multiplier: number) => {
    let increment = 0.1;
    if (currentBid >= 20) increment = 1;
    else if (currentBid >= 10) increment = 0.5;
    else if (currentBid >= 5) increment = 0.25;

    return Math.round((currentBid + increment * multiplier) * 100) / 100;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();

      // Team bid (1-8) - increments bid and records bid for that team
      if (/^[1-8]$/.test(key)) {
        const teamIndex = Number.parseInt(key, 10) - 1;
        const state = useAuctionStoreV2.getState();
        const team = state.teams[teamIndex];
        if (!team || !state.currentPlayer) return;

        const nextBid = computeNextBidAmount(state.currentBid, state.bidMultiplier);
        const maxBid = state.getMaxBidForTeam(team);
        if (nextBid > maxBid) {
          state.addNotification('error', 'Invalid Bid', `${team.name} cannot afford ₹${nextBid}L`);
          return;
        }

        state.selectTeam(team);
        state.placeBid(team.id, team.name, nextBid);
        state.recordAction({ type: 'BID_PLACED', payload: { bid: { teamId: team.id, amount: nextBid } } });
        return;
      }

      // Bid multiplier
      if (key === 'q') {
        const newMultiplier = store.bidMultiplier === 1 ? 2 : 1;
        store.setBidMultiplier(newMultiplier);
        onBidMultiplierChange?.(newMultiplier);
        return;
      }
      if (key === 'w') {
        const newMultiplier = store.bidMultiplier === 1 ? 5 : 1;
        store.setBidMultiplier(newMultiplier);
        onBidMultiplierChange?.(newMultiplier);
        return;
      }

      switch (key) {
        case 'n':
          auction.selectNextPlayer();
          break;
        case 'r':
          auction.selectRandomPlayer();
          break;
        case 's':
          auction.markAsSold();
          break;
        case 'u':
          auction.markAsUnsold();
          break;
        case 'z':
          auction.undoLastAction();
          break;
        case 'arrowup':
          e.preventDefault();
          auction.incrementBid();
          break;
        case 'arrowdown':
          e.preventDefault();
          auction.decrementBid();
          break;
        case 'v':
          onViewToggle?.();
          break;
        case 'h':
          onHeaderToggle?.();
          break;
        case 'escape':
          onEscape?.();
          auction.closeOverlay();
          break;
        case ' ':
          e.preventDefault();
          if (store.activeOverlay) {
            auction.closeOverlay();
          }
          break;
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [enabled, auction, store, onViewToggle, onEscape, onHeaderToggle, onBidMultiplierChange, computeNextBidAmount]);

  return {
    shortcuts: [
      { key: 'N', description: 'Next Player' },
      { key: 'R', description: 'Random Player' },
      { key: '1-8', description: 'Select Team & Bid' },
      { key: 'S', description: 'Mark as Sold' },
      { key: 'U', description: 'Mark as Unsold' },
      { key: 'Z', description: 'Undo Last Action' },
      { key: '↑/↓', description: 'Increment/Decrement Bid' },
      { key: 'Q', description: '2x Bid Multiplier' },
      { key: 'W', description: '5x Bid Multiplier' },
      { key: 'V', description: 'Toggle Team View' },
      { key: 'H', description: 'Toggle Header' },
      { key: 'ESC', description: 'Close Overlay' },
    ],
  };
}

// ============================================================================
// PLAYER STATS HOOK
// ============================================================================

export function usePlayerStats() {
  const store = useAuctionStoreV2();
  
  return useMemo(() => ({
    total: store.availablePlayers.length + store.soldPlayers.length + store.unsoldPlayers.length,
    available: store.availablePlayers.length,
    sold: store.soldPlayers.length,
    unsold: store.unsoldPlayers.length,
    currentRound: store.round,
  }), [store.availablePlayers.length, store.soldPlayers.length, store.unsoldPlayers.length, store.round]);
}

// ============================================================================
// TEAM STATS HOOK
// ============================================================================

export function useTeamStats(team: Team | null) {
  return useMemo(() => {
    if (!team) return null;
    
    const players = team.players;
    const amounts = players.map(p => p.soldAmount);
    
    return {
      totalSpent: team.config.totalBudget - team.remainingBudget,
      remainingBudget: team.remainingBudget,
      averageSpend: amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0,
      highestBid: amounts.length > 0 ? Math.max(...amounts) : 0,
      lowestBid: amounts.length > 0 ? Math.min(...amounts) : 0,
      playerCount: players.length,
      remainingSlots: team.config.maxPlayers - players.length,
    };
  }, [team]);
}

// ============================================================================
// NOTIFICATION HOOK
// ============================================================================

export function useNotificationV2() {
  const store = useAuctionStoreV2();
  
  const notify = useCallback((type: NotificationType, title: string, message: string) => {
    store.addNotification(type, title, message);
  }, [store]);

  const dismiss = useCallback((id: string) => {
    store.removeNotification(id);
  }, [store]);

  const clear = useCallback(() => {
    store.clearNotifications();
  }, [store]);

  return {
    notifications: store.notifications,
    notify,
    dismiss,
    clear,
  };
}

// ============================================================================
// THEME HOOK
// ============================================================================

export function useThemeV2() {
  const store = useAuctionStoreV2();
  
  const setTheme = useCallback((theme: 'light' | 'dark' | 'system') => {
    store.setTheme(theme);
    document.documentElement.dataset.theme = theme;
  }, [store]);

  useEffect(() => {
    document.documentElement.dataset.theme = store.theme;
  }, [store.theme]);

  return {
    theme: store.theme,
    setTheme,
    isDark: store.theme === 'dark',
  };
}

// ============================================================================
// INTERVAL HOOK
// ============================================================================

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// LOCAL STORAGE HOOK
// ============================================================================

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = globalThis.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      globalThis.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [key]);

  return [storedValue, setValue];
}

// ============================================================================
// MEDIA QUERY HOOK
// ============================================================================

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// ============================================================================
// PREVIOUS VALUE HOOK
// ============================================================================

export function usePrevious<T>(value: T): T | undefined {
  const [previous, setPrevious] = useState<T | undefined>(undefined);
  const currentRef = useRef<T>(value);

  useEffect(() => {
    setPrevious(currentRef.current);
    currentRef.current = value;
  }, [value]);

  return previous;
}

// ============================================================================
// HELP MODAL HOOK
// ============================================================================

export function useHotkeyHelpV2() {
  const { shortcuts } = useKeyboardShortcutsV2({ enabled: false });
  return shortcuts;
}
