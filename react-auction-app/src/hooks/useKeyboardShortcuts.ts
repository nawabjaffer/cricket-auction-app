// ============================================================================
// USE KEYBOARD SHORTCUTS HOOK - Hotkey Management
// Handles keyboard shortcuts for auction operations
// ============================================================================

import { useEffect, useCallback, useState } from 'react';
import { activeConfig } from '../config';
import { useAuction } from './useAuction';

interface KeyboardShortcutOptions {
  enabled?: boolean;
  onCustomAction?: (key: string) => void;
  onViewToggle?: () => void;
  onEscape?: () => void;
  onHeaderToggle?: () => void;
  onBidMultiplierChange?: (multiplier: number) => void;
}

// Global bid multiplier state (1 = 100, 2 = 200, etc.)
let bidMultiplier = 1;

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const { enabled = true, onCustomAction, onViewToggle, onEscape, onHeaderToggle, onBidMultiplierChange } = options;
  const [currentMultiplier, setCurrentMultiplier] = useState(1);
  
  const auction = useAuction();
  const hotkeys = activeConfig.hotkeys;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't handle if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Don't handle if modifier keys are pressed (except for specific combos)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();

    // Q key - Increase bid multiplier by 1 (adds +100 to bid increment)
    if (key === 'q') {
      event.preventDefault();
      bidMultiplier = Math.min(bidMultiplier + 1, 10); // Max 10x (1000)
      setCurrentMultiplier(bidMultiplier);
      if (onBidMultiplierChange) {
        onBidMultiplierChange(bidMultiplier);
      }
      return;
    }

    // W key - Decrease bid multiplier by 1 (reduces -100 from bid increment)
    if (key === 'w') {
      event.preventDefault();
      bidMultiplier = Math.max(bidMultiplier - 1, 1); // Min 1x (100)
      setCurrentMultiplier(bidMultiplier);
      if (onBidMultiplierChange) {
        onBidMultiplierChange(bidMultiplier);
      }
      return;
    }

    // Z key - Undo last bid (decrement)
    if (key === 'z') {
      event.preventDefault();
      auction.decrementBid();
      return;
    }

    // Next Player - also works to dismiss overlay and go to next
    if (key === hotkeys.nextPlayer.toLowerCase()) {
      event.preventDefault();
      // If overlay is active, close it first then select next player
      if (auction.activeOverlay) {
        auction.closeOverlay();
        setTimeout(() => {
          auction.selectNextPlayer();
        }, 100);
      } else {
        auction.selectNextPlayer();
      }
      return;
    }

    // Mark as Sold
    if (key === hotkeys.markSold.toLowerCase()) {
      event.preventDefault();
      auction.markAsSold();
      return;
    }

    // Mark as Unsold
    if (key === hotkeys.markUnsold.toLowerCase()) {
      event.preventDefault();
      auction.markAsUnsold();
      return;
    }

    // Toggle Fullscreen
    if (key === hotkeys.toggleFullscreen) {
      event.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
      return;
    }

    // Escape - Close overlay and team panel
    if (key === hotkeys.closeOverlay.toLowerCase() || key === 'escape') {
      event.preventDefault();
      if (onEscape) {
        onEscape();
      }
      auction.closeOverlay();
      return;
    }

    // Space - Close overlay and select next player
    if (key === ' ') {
      event.preventDefault();
      // If overlay is active, close it and select next player
      if (auction.activeOverlay) {
        auction.closeOverlay();
        // Small delay to allow overlay animation to start
        setTimeout(() => {
          auction.selectNextPlayer();
        }, 100);
      }
      return;
    }

    // T key - Toggle between player and team view
    if (key === 't') {
      event.preventDefault();
      if (onViewToggle) {
        onViewToggle();
      }
      return;
    }

    // = key - Toggle header visibility
    if (key === '=') {
      event.preventDefault();
      if (onHeaderToggle) {
        onHeaderToggle();
      }
      return;
    }

    // Number keys 1-8 for team bidding - increases bid by 100 * multiplier
    if (/^[1-8]$/.test(key)) {
      event.preventDefault();
      const teams = auction.getEligibleTeams();
      const teamIndex = parseInt(key) - 1;
      if (teamIndex < teams.length) {
        // Select the team
        auction.selectTeam(teams[teamIndex]);
        // Increment bid by multiplier amount (each increment = 0.1L)
        for (let i = 0; i < bidMultiplier; i++) {
          auction.incrementBid();
        }
      }
      return;
    }

    // Custom action handler
    if (onCustomAction) {
      onCustomAction(key);
    }
  }, [auction, hotkeys, onCustomAction, onViewToggle, onEscape, onHeaderToggle, onBidMultiplierChange]);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return {
    // Expose hotkey configuration for UI display
    hotkeys,
    // Current bid multiplier
    bidMultiplier: currentMultiplier,
    // Method to check if a key is a registered hotkey
    isHotkey: (key: string) => {
      const lowerKey = key.toLowerCase();
      const simpleHotkeys = [
        hotkeys.nextPlayer,
        hotkeys.markSold,
        hotkeys.markUnsold,
        hotkeys.jumpToPlayer,
        hotkeys.showTeamsInfo,
        hotkeys.showTeamMenu,
        hotkeys.showHotkeyHelper,
        hotkeys.toggleFullscreen,
        hotkeys.closeOverlay,
      ];
      return simpleHotkeys.some(hk => hk.toLowerCase() === lowerKey);
    },
  };
}

/**
 * Hook for displaying hotkey help
 */
export function useHotkeyHelp() {
  const hotkeys = activeConfig.hotkeys;

  const hotkeyList = [
    { key: hotkeys.nextPlayer, description: 'Select next player' },
    { key: hotkeys.markSold, description: 'Mark as sold' },
    { key: hotkeys.markUnsold, description: 'Mark as unsold' },
    { key: hotkeys.toggleFullscreen, description: 'Toggle fullscreen' },
    { key: hotkeys.closeOverlay, description: 'Close overlay' },
    { key: '1-8', description: 'Team bid (+100 × multiplier)' },
    { key: 'Q', description: 'Increase bid multiplier (+100)' },
    { key: 'W', description: 'Decrease bid multiplier (-100)' },
    { key: 'Z', description: 'Undo last bid' },
    { key: 'T', description: 'Toggle team view' },
    { key: '=', description: 'Toggle header' },
  ];

  return hotkeyList;
}
