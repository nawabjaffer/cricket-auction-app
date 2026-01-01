// ============================================================================
// CRICKET AUCTION APP - TYPE DEFINITIONS
// Following TypeScript best practices for type safety and documentation
// ============================================================================

// Player Types
export interface Player {
  id: string;
  name: string;
  imageUrl: string;
  role: PlayerRole;
  age: number | null;
  matches: string;
  runs: string;
  wickets: string;
  battingBestFigures: string;
  bowlingBestFigures: string;
  basePrice: number;
  dateOfBirth?: string;
}

export type PlayerRole =
  | 'Batsman'
  | 'Bowler'
  | 'All-Rounder'
  | 'Wicket-Keeper'
  | 'Wicket Keeper'
  | 'Wicket Keeper Batsman'
  | 'Player';

export interface SoldPlayer extends Player {
  soldAmount: number;
  teamName: string;
  soldDate: string;
}

export interface UnsoldPlayer extends Player {
  round: string;
  unsoldDate: string;
}

// Team Types
export interface Team {
  id: string;
  name: string;
  logoUrl: string;
  playersBought: number;
  totalPlayerThreshold: number;
  remainingPlayers: number;
  allocatedAmount: number;
  remainingPurse: number;
  highestBid: number;
  captain: string;
  underAgePlayers: number;
}

export interface TeamStats {
  name: string;
  playersBought: number;
  remainingPlayers: number;
  remainingPurse: number;
  highestBid: number;
  underAgePlayers: number;
}

export interface TeamStatus {
  status: 'safe' | 'warning' | 'danger';
  isFull: boolean;
  hasUnderAgeLimit: boolean;
  maxBid: number;
}

// Auction State Types
export interface AuctionState {
  currentPlayer: Player | null;
  currentBid: number;
  selectedTeam: Team | null;
  bidHistory: BidHistory[];
  isAuctionActive: boolean;
  isPaused: boolean;
}

export interface BidHistory {
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: string;
}

// Selection Mode
export type SelectionMode = 'sequential' | 'random';

// Validation Types
export type ValidationSeverity = 'critical' | 'warning' | 'info';

export type AuctionRuleId =
  | 'RULE_001'
  | 'RULE_002'
  | 'RULE_003'
  | 'RULE_004'
  | 'RULE_005'
  | 'RULE_006'
  | 'RULE_009';

export interface ValidationResult {
  valid: boolean;
  severity: ValidationSeverity;
  message: string;
  ruleId: AuctionRuleId | null;
  isWarning?: boolean;
}

// Theme Types
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  text: string;
  textSecondary: string;
}

export interface ThemeAnimations {
  enabled: boolean;
  cornerGifs?: {
    leftTop?: string;
    rightTop?: string;
    leftBottom?: string;
    rightBottom?: string;
  };
  waveGifs?: {
    topRight?: string;
    arrows?: string;
  };
}

export interface ThemeTableStyles {
  headerGradient: string;
  rowBackground: string;
  rowBackgroundHover: string;
  borderColor: string;
  glowEffect?: string;
}

export interface Theme {
  name: string;
  background?: string;
  seasonLogo?: string;
  colors: ThemeColors;
  animations?: ThemeAnimations;
  table?: ThemeTableStyles;
}

// Configuration Types
export interface GoogleSheetsConfig {
  sheetId: string;
  apiKey: string;
  ranges: {
    players: string;
    teams: string;
    soldPlayers: string;
    unsoldPlayers: string;
  };
}

export interface WebhookConfig {
  url: string;
  updateDelay: number;
}

export interface BidIncrementsConfig {
  default: number;
  adjustmentStep: number;
  minimum: number;
  maximum: number;
}

export interface AuctionRulesConfig {
  minimumPlayerBasePrice: number;
  safeFundBufferPercent: number;
  underAgeLimit: number;
  maxUnderAgePlayers: number;
}

export interface UndoConfig {
  historySize: number;
  enabled: boolean;
}

export interface AuctionConfig {
  basePrice: number;
  bidIncrements: BidIncrementsConfig;
  rules: AuctionRulesConfig;
  undo: UndoConfig;
}

export interface AudioFilesConfig {
  sold: string;
  unsold: string;
  coinShake: string;
}

export interface AudioConfig {
  volume: number;
  files: AudioFilesConfig;
}

export interface NotificationsConfig {
  showTopNotifications: boolean;
  showBidIncrementInfo: boolean;
  useColorFeedback: boolean;
}

export interface SelectionModeAnimationConfig {
  coinJarShakeDuration: number;
  coinRevealDuration: number;
  totalAnimationTime: number;
}

export interface SelectionModeConfig {
  type: SelectionMode;
  animation: SelectionModeAnimationConfig;
}

export interface AssetsConfig {
  backgroundImage: string;
  placeholderMan: string;
}

export interface SoldOverlayAnimationConfig {
  showDelay: number;
  hammerStrike: number;
  impactDelay: number;
  impactDuration: number;
  totalDuration: number;
}

export interface UnsoldOverlayAnimationConfig {
  xAnimationDelay: number;
  textAnimationDelay: number;
  subtextDelay: number;
  totalDuration: number;
  inputDelay: number;
}

export interface ImagePreloadConfig {
  startDelay: number;
}

export interface UIAnimationsConfig {
  soldOverlay: SoldOverlayAnimationConfig;
  unsoldOverlay: UnsoldOverlayAnimationConfig;
  imagePreload: ImagePreloadConfig;
}

export interface AvatarPlaceholderConfig {
  baseUrl: string;
  cardSize: number;
  teamSlotSize: number;
  teamStatusSize: number;
  background: string;
  color: string;
  bold: boolean;
  fontSize: number;
  teamStatusFontSize: number;
}

export interface BreakpointsConfig {
  desktop: number;
  laptop: number;
  tablet: number;
  mobile: number;
  small: number;
}

export interface TeamSlotsGridConfig {
  maxPlayersPer6Cols: number;
}

export interface ThresholdConfig {
  warning: number;
  danger: number;
}

export interface TeamStatsThresholdsConfig {
  purseSpent: ThresholdConfig;
  remainingPurse: ThresholdConfig;
  remainingPlayers: ThresholdConfig;
}

export interface UIConfig {
  animations: UIAnimationsConfig;
  avatarPlaceholder: AvatarPlaceholderConfig;
  breakpoints: BreakpointsConfig;
  teamSlotsGrid: TeamSlotsGridConfig;
  teamStatsThresholds: TeamStatsThresholdsConfig;
}

export interface TeamSlotsConfig {
  team1: string;
  team2: string;
  team3: string;
  team4: string;
  team5: string;
  team6: string;
  team7: string;
  team8: string;
}

export interface TeamBiddingConfig {
  team1: string;
  team2: string;
  team3: string;
  team4: string;
  team5: string;
  team6: string;
  team7: string;
  team8: string;
  team9: string;
}

export interface BidIncrementsHotkeysConfig {
  small: string;
  large: string;
}

export interface HotkeysConfig {
  nextPlayer: string;
  markSold: string;
  markUnsold: string;
  jumpToPlayer: string;
  showTeamsInfo: string;
  showTeamMenu: string;
  showHotkeyHelper: string;
  toggleFullscreen: string;
  closeOverlay: string;
  teamSlotsPrefix: string;
  teamSlots: TeamSlotsConfig;
  teamBidding: TeamBiddingConfig;
  bidIncrements: BidIncrementsHotkeysConfig;
}

export interface PlayerColumnMappings {
  timestamp: number;
  basePrice: number;
  id: number;
  imageUrl: number;
  name: number;
  dateOfBirth: number;
  bloodGroup: number;
  phoneNumber: number;
  jerseySize: number;
  shoeSize: number;
  role: number;
  batsmanType: number;
  battingOrder: number;
  bowlingHand: number;
  battingTypeAR: number;
  battingOrderAR: number;
  bowlingStyleAR: number;
  bowlingHandAR: number;
  cricHeroesLink: number;
  matches: number;
  wickets: number;
  runs: number;
  battingBest: number;
  bowlingBest: number;
  declaration: number;
  stats: {
    matches: number;
    innings: number;
    runs: number;
    wickets: number;
    average: number;
  };
}

export interface TeamColumnMappings {
  name: number;
  logoUrl: number;
  playersBought: number;
  underAgePlayers: number;
  remainingPlayers: number;
  totalPlayerThreshold: number;
  allocatedAmount: number;
  remainingPurse: number;
  highestBid: number;
  captain: number;
}

export interface SoldPlayerColumnMappings {
  id: number;
  name: number;
  role: number;
  age: number;
  matches: number;
  bestFigures: number;
  teamName: number;
  soldAmount: number;
  basePrice: number;
  imageUrl: number;
}

export interface UnsoldPlayerColumnMappings {
  id: number;
  name: number;
  role: number;
  age: number;
  matches: number;
  bestFigures: number;
  basePrice: number;
  round: number;
  unsoldDate: number;
  imageUrl: number;
}

export interface ColumnMappings {
  players: PlayerColumnMappings;
  teams: TeamColumnMappings;
  soldPlayers: SoldPlayerColumnMappings;
  unsoldPlayers: UnsoldPlayerColumnMappings;
}

// Theme map type for multi-theme support
export interface ThemeMap {
  active: string;
  [key: string]: Theme | string;
}

// Complete App Configuration
export interface AppConfig {
  googleSheets: GoogleSheetsConfig;
  webhook: WebhookConfig;
  auction: AuctionConfig;
  audio: AudioConfig;
  notifications: NotificationsConfig;
  selectionMode: SelectionModeConfig;
  assets: AssetsConfig;
  theme: ThemeMap;
  ui: UIConfig;
  hotkeys: HotkeysConfig;
  defaultTeams: Team[];
  columnMappings: ColumnMappings;
}

// Tournament/Venue Configuration for Multi-tenancy
export interface TournamentConfig {
  id: string;
  name: string;
  season?: string;
  venue?: string;
  logoUrl?: string;
  theme: string;
  googleSheets: GoogleSheetsConfig;
  webhook: WebhookConfig;
  auction: AuctionConfig;
}

// Notification Types
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

// Overlay Types
export type OverlayType = 'sold' | 'unsold' | 'end' | 'coin-jar';

// Event Types for Component Communication
export interface BidEvent {
  teamIndex: number;
  bidAmount: number;
  team: Team;
}

export interface PlayerSelectionEvent {
  playerId: string;
  player: Player;
}

export interface SaleConfirmationEvent {
  player: Player;
  team: Team;
  soldAmount: number;
}
