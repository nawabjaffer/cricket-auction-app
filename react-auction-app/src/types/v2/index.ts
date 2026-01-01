// ============================================================================
// AUCTION APP V2 - TYPE DEFINITIONS
// Enhanced type system with discriminated unions, generics, and strict typing
// ============================================================================

// ============================================================================
// CORE ENTITY TYPES
// ============================================================================

/** Player role enumeration for strict type checking */
export const PlayerRoles = {
  BATSMAN: 'Batsman',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-Rounder',
  WICKET_KEEPER: 'Wicket-Keeper',
  WICKET_KEEPER_BATSMAN: 'Wicket Keeper Batsman',
} as const;

export type PlayerRole = typeof PlayerRoles[keyof typeof PlayerRoles];

/** Base player interface with all cricket statistics */
export interface BasePlayer {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly role: PlayerRole;
  readonly age: number | null;
  readonly dateOfBirth?: string;
  readonly basePrice: number;
  // Cricket stats
  readonly stats: PlayerStats;
}

export interface PlayerStats {
  readonly matches: number | null;
  readonly runs: number | null;
  readonly wickets: number | null;
  readonly battingAverage: number | null;
  readonly bowlingAverage: number | null;
  readonly strikeRate: number | null;
  readonly economy: number | null;
  readonly highestScore: string;
  readonly bestBowling: string;
}

/** Player status discriminated union */
export type PlayerStatus = 'available' | 'bidding' | 'sold' | 'unsold';

/** Available player ready for auction */
export interface AvailablePlayer extends BasePlayer {
  readonly status: 'available';
}

/** Player currently being auctioned */
export interface BiddingPlayer extends BasePlayer {
  readonly status: 'bidding';
  readonly currentBid: number;
  readonly biddingTeam: string | null;
  readonly startTime: number;
}

/** Sold player with transaction details */
export interface SoldPlayer extends BasePlayer {
  readonly status: 'sold';
  readonly soldAmount: number;
  readonly teamId: string;
  readonly teamName: string;
  readonly soldAt: number;
  readonly round: number;
}

/** Unsold player with round tracking */
export interface UnsoldPlayer extends BasePlayer {
  readonly status: 'unsold';
  readonly round: number;
  readonly unsoldAt: number;
  readonly canRetry: boolean;
}

/** Union type for all player states */
export type Player = AvailablePlayer | BiddingPlayer | SoldPlayer | UnsoldPlayer;

// ============================================================================
// TEAM TYPES
// ============================================================================

export interface TeamConfig {
  readonly maxPlayers: number;
  readonly minPlayers: number;
  readonly maxUnderAge: number;
  readonly underAgeThreshold: number;
  readonly totalBudget: number;
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly logoUrl: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly config: TeamConfig;
  readonly captain: string;
  // Dynamic state
  players: SoldPlayer[];
  remainingBudget: number;
  isEligible: boolean;
}

export interface TeamStats {
  readonly totalSpent: number;
  readonly averageSpend: number;
  readonly highestBid: number;
  readonly lowestBid: number;
  readonly playerCount: number;
  readonly roleDistribution: Record<PlayerRole, number>;
}

// ============================================================================
// BID TYPES
// ============================================================================

export interface Bid {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly playerId: string;
  readonly isWinning: boolean;
}

export interface BidIncrement {
  readonly threshold: number;
  readonly increment: number;
}

export interface BidValidation {
  readonly isValid: boolean;
  readonly reason?: string;
  readonly maxAllowed?: number;
  readonly minRequired?: number;
}

// ============================================================================
// AUCTION STATE TYPES
// ============================================================================

export const AuctionPhases = {
  SETUP: 'setup',
  ROUND_1: 'round_1',
  ROUND_2: 'round_2',
  COMPLETED: 'completed',
  PAUSED: 'paused',
} as const;

export type AuctionPhase = typeof AuctionPhases[keyof typeof AuctionPhases];

export const SelectionModes = {
  SEQUENTIAL: 'sequential',
  RANDOM: 'random',
  MANUAL: 'manual',
} as const;

export type SelectionMode = typeof SelectionModes[keyof typeof SelectionModes];

export interface AuctionConfig {
  readonly basePrice: number;
  readonly maxBidTime: number;
  readonly bidIncrements: BidIncrement[];
  readonly selectionMode: SelectionMode;
  readonly enableUndo: boolean;
  readonly maxUndos: number;
}

export interface AuctionSession {
  readonly id: string;
  readonly startedAt: number;
  readonly phase: AuctionPhase;
  readonly config: AuctionConfig;
  readonly currentPlayerIndex: number;
  readonly totalPlayers: number;
  readonly round: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export const OverlayTypes = {
  NONE: null,
  SOLD: 'sold',
  UNSOLD: 'unsold',
  END: 'end',
  TEAM_VIEW: 'team_view',
  TEAM_SQUAD: 'team_squad',
  SETTINGS: 'settings',
  HELP: 'help',
} as const;

export type OverlayType = typeof OverlayTypes[keyof typeof OverlayTypes];

export const NotificationTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
} as const;

export type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];

export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly message: string;
  readonly duration: number;
  readonly dismissible: boolean;
  readonly createdAt: number;
}

export interface UIState {
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly activeOverlay: OverlayType;
  readonly viewingTeamId: string | null;
  readonly notifications: Notification[];
  readonly showHeader: boolean;
  readonly showTeamPanel: boolean;
  readonly bidMultiplier: number;
  readonly theme: ThemeMode;
}

// ============================================================================
// THEME TYPES
// ============================================================================

export const ThemeModes = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type ThemeMode = typeof ThemeModes[keyof typeof ThemeModes];

export interface ThemeColors {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly background: string;
  readonly surface: string;
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
  };
  readonly success: string;
  readonly error: string;
  readonly warning: string;
}

export interface Theme {
  readonly id: string;
  readonly name: string;
  readonly mode: ThemeMode;
  readonly colors: ThemeColors;
  readonly backgroundImage?: string;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export type AuctionEvent =
  | { type: 'PLAYER_SELECTED'; payload: { playerId: string } }
  | { type: 'BID_PLACED'; payload: { bid: Bid } }
  | { type: 'BID_WITHDRAWN'; payload: { teamId: string } }
  | { type: 'PLAYER_SOLD'; payload: { player: SoldPlayer } }
  | { type: 'PLAYER_UNSOLD'; payload: { player: UnsoldPlayer } }
  | { type: 'ROUND_STARTED'; payload: { round: number } }
  | { type: 'ROUND_ENDED'; payload: { round: number } }
  | { type: 'AUCTION_PAUSED'; payload: { reason: string } }
  | { type: 'AUCTION_RESUMED'; payload: Record<string, never> }
  | { type: 'UNDO_ACTION'; payload: { actionId: string } }
  | { type: 'SETTINGS_CHANGED'; payload: Partial<AuctionConfig> };

// ============================================================================
// ACTION HISTORY FOR UNDO
// ============================================================================

export interface ActionRecord {
  readonly id: string;
  readonly type: AuctionEvent['type'];
  readonly payload: unknown;
  readonly timestamp: number;
  readonly canUndo: boolean;
  readonly undone: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
  readonly timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Makes all properties of T mutable */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/** Deep partial type */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Extract type from array */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/** Require at least one property */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

/** Brand type for type-safe IDs */
export type Brand<T, B> = T & { __brand: B };
export type PlayerId = Brand<string, 'PlayerId'>;
export type TeamId = Brand<string, 'TeamId'>;
export type BidId = Brand<string, 'BidId'>;

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

export interface KeyboardShortcut {
  readonly key: string;
  readonly description: string;
  readonly action: string;
  readonly modifiers?: {
    readonly ctrl?: boolean;
    readonly shift?: boolean;
    readonly alt?: boolean;
    readonly meta?: boolean;
  };
}

export interface KeyboardConfig {
  readonly enabled: boolean;
  readonly shortcuts: KeyboardShortcut[];
}
