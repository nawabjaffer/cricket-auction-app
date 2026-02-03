// ============================================================================
// CONSTANTS - Shared constants
// DRY: Single source of truth for all magic values
// ============================================================================

/**
 * Auction configuration defaults
 */
export const AUCTION_CONFIG = {
  MINIMUM_BID: 2000000, // ₹20 Lakhs
  BID_INCREMENT: 500000, // ₹5 Lakhs
  MAX_UNDER_AGE_PLAYERS: 2,
  MAX_ROUNDS: 3,
  DEFAULT_PLAYER_THRESHOLD: 25,
  DEFAULT_TEAM_BUDGET: 120000000, // ₹12 Crores
} as const;

/**
 * Player roles
 */
export const PLAYER_ROLES = {
  BATSMAN: 'Batsman',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-Rounder',
  WICKET_KEEPER: 'Wicket-Keeper',
  WICKET_KEEPER_ALT: 'Wicket Keeper',
  WICKET_KEEPER_BATSMAN: 'Wicket Keeper Batsman',
  PLAYER: 'Player',
} as const;

/**
 * Player role short forms
 */
export const PLAYER_ROLE_SHORT = {
  [PLAYER_ROLES.BATSMAN]: 'BAT',
  [PLAYER_ROLES.BOWLER]: 'BOWL',
  [PLAYER_ROLES.ALL_ROUNDER]: 'AR',
  [PLAYER_ROLES.WICKET_KEEPER]: 'WK',
  [PLAYER_ROLES.WICKET_KEEPER_ALT]: 'WK',
  [PLAYER_ROLES.WICKET_KEEPER_BATSMAN]: 'WK',
  [PLAYER_ROLES.PLAYER]: 'PLR',
} as const;

/**
 * Under-age threshold
 */
export const UNDER_AGE_THRESHOLD = 19;

/**
 * Selection modes
 */
export const SELECTION_MODES = {
  SEQUENTIAL: 'sequential',
  RANDOM: 'random',
} as const;

/**
 * Overlay types
 */
export const OVERLAY_TYPES = {
  SOLD: 'sold',
  UNSOLD: 'unsold',
  END: 'end',
  TEAMS: 'teams',
} as const;

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  AUCTION_STATE: 'auction_state',
  AUCTION_SAVES: 'auction_saves',
  THEME_PREFERENCE: 'theme_preference',
  ADMIN_SESSION: 'admin_session',
  FEATURE_FLAGS: 'feature_flags',
  PREMIUM_STATUS: 'premium_status',
} as const;

/**
 * API endpoints (for future use)
 */
export const API_ENDPOINTS = {
  PLAYERS: '/api/players',
  TEAMS: '/api/teams',
  AUCTION: '/api/auction',
  WEBHOOK: '/api/webhook',
  AUTH: '/api/auth',
} as const;

/**
 * Event names for broadcasting
 */
export const BROADCAST_EVENTS = {
  BID_PLACED: 'bid_placed',
  PLAYER_SOLD: 'player_sold',
  PLAYER_UNSOLD: 'player_unsold',
  AUCTION_RESET: 'auction_reset',
  PLAYER_SELECTED: 'player_selected',
  ROUND_CHANGED: 'round_changed',
} as const;

/**
 * Keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
  // Bidding
  TEAM_1: '1',
  TEAM_2: '2',
  TEAM_3: '3',
  TEAM_4: '4',
  TEAM_5: '5',
  TEAM_6: '6',
  TEAM_7: '7',
  TEAM_8: '8',
  
  // Bid multiplier
  INCREASE_MULTIPLIER: 'q',
  DECREASE_MULTIPLIER: 'w',
  
  // Actions
  SOLD: 's',
  UNSOLD: 'u',
  NEXT_PLAYER: 'n',
  UNDO: 'z',
  SHOW_TEAMS: 't',
  
  // Navigation
  INCREMENT_BID: 'ArrowUp',
  DECREMENT_BID: 'ArrowDown',
  
  // UI
  TOGGLE_MENU: '=',
  TOGGLE_MARQUEE: '-',
  TOGGLE_DEBUG: '0',
  ESCAPE: 'Escape',
} as const;

/**
 * Animation durations (ms)
 */
export const ANIMATION_DURATIONS = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
  SOLD_ANIMATION: 3500,
  NOTIFICATION: 3000,
  OVERLAY_TRANSITION: 200,
} as const;

/**
 * Z-index layers
 */
export const Z_INDEX = {
  BASE: 1,
  OVERLAY: 100,
  MODAL: 200,
  NOTIFICATION: 300,
  TOOLTIP: 400,
  MAX: 9999,
} as const;

/**
 * Breakpoints for responsive design
 */
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  XXL: 1536,
} as const;

/**
 * Color palette
 */
export const COLORS = {
  SUCCESS: '#22c55e',
  ERROR: '#ef4444',
  WARNING: '#f59e0b',
  INFO: '#3b82f6',
  GOLD: '#ffd700',
  PREMIUM: 'linear-gradient(135deg, #ffd700, #ff9500)',
} as const;

/**
 * Default avatar URLs
 */
export const DEFAULT_AVATARS = {
  PLAYER: (name: string) => 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D1117&color=FFFFFF&size=256`,
  TEAM: (name: string) => 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a2e&color=fff&size=64`,
} as const;
