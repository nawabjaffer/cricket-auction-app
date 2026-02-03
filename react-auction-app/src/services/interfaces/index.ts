// ============================================================================
// SERVICE INTERFACES - Contracts for all services
// DRY: Defines contracts that services must implement
// ============================================================================

import type { ApiResponse } from '../../models/responses/ApiResponse';

// ============================================================================
// DATA SERVICE INTERFACE
// ============================================================================

/**
 * Interface for player data operations
 */
export interface IPlayerDataService {
  fetchPlayers(excludeSoldIds?: string[]): Promise<ApiResponse<IPlayerData[]>>;
  refreshPlayers(): Promise<ApiResponse<IPlayerData[]>>;
}

/**
 * Interface for team data operations
 */
export interface ITeamDataService {
  fetchTeams(): Promise<ApiResponse<ITeamData[]>>;
  refreshTeams(): Promise<ApiResponse<ITeamData[]>>;
}

/**
 * Interface for auction data operations
 */
export interface IAuctionDataService {
  fetchSoldPlayers(): Promise<ApiResponse<ISoldPlayerData[]>>;
  fetchUnsoldPlayers(): Promise<ApiResponse<IUnsoldPlayerData[]>>;
  saveSoldPlayer(data: ISoldPlayerData): Promise<ApiResponse<void>>;
  saveUnsoldPlayer(data: IUnsoldPlayerData): Promise<ApiResponse<void>>;
}

// ============================================================================
// NOTIFICATION SERVICE INTERFACE
// ============================================================================

export interface INotificationPayload {
  type: 'sold' | 'unsold' | 'bid' | 'info' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

export interface INotificationService {
  send(payload: INotificationPayload): Promise<ApiResponse<void>>;
  sendBatch(payloads: INotificationPayload[]): Promise<ApiResponse<void>>;
}

// ============================================================================
// STORAGE SERVICE INTERFACE
// ============================================================================

export interface IStorageService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
  keys(): string[];
}

// ============================================================================
// CACHE SERVICE INTERFACE
// ============================================================================

export interface ICacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface ICacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  isExpired(key: string): boolean;
}

// ============================================================================
// AUTH SERVICE INTERFACE
// ============================================================================

export interface IAuthCredentials {
  username: string;
  password: string;
}

export interface IAuthSession {
  userId: string;
  teamId?: string;
  role: 'admin' | 'captain' | 'viewer';
  token: string;
  expiresAt: number;
}

export interface IAuthService {
  login(credentials: IAuthCredentials): Promise<ApiResponse<IAuthSession>>;
  logout(): Promise<ApiResponse<void>>;
  validateSession(token: string): Promise<ApiResponse<IAuthSession>>;
  refreshSession(): Promise<ApiResponse<IAuthSession>>;
  getCurrentSession(): IAuthSession | null;
  isAuthenticated(): boolean;
}

// ============================================================================
// SYNC SERVICE INTERFACE
// ============================================================================

export interface ISyncEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  source: string;
}

export interface ISyncService {
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(eventType: string, callback: (event: ISyncEvent) => void): () => void;
  publish(event: ISyncEvent): Promise<void>;
  isConnected(): boolean;
}

// ============================================================================
// AUDIO SERVICE INTERFACE
// ============================================================================

export interface IAudioService {
  play(soundName: string): Promise<void>;
  stop(soundName: string): void;
  setVolume(volume: number): void;
  mute(): void;
  unmute(): void;
  isMuted(): boolean;
  preload(soundNames: string[]): Promise<void>;
}

// ============================================================================
// IMAGE SERVICE INTERFACE
// ============================================================================

export interface IImageService {
  preload(urls: string[]): Promise<void>;
  getFromCache(url: string): string | null;
  clearCache(): void;
  getCacheStats(): { hits: number; misses: number; size: number };
}

// ============================================================================
// DATA TYPES (Used across services)
// ============================================================================

export interface IPlayerData {
  id: string;
  name: string;
  role: string;
  age: number | null;
  basePrice: number;
  imageUrl: string;
  matches?: string;
  runs?: string;
  wickets?: string;
  battingBestFigures?: string;
  bowlingBestFigures?: string;
  dateOfBirth?: string;
}

export interface ITeamData {
  id: string;
  name: string;
  shortName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  initialPurse: number;
  remainingPurse: number;
  playersBought: number;
  totalPlayerThreshold: number;
  underAgePlayers: number;
}

export interface ISoldPlayerData {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  soldPrice: number;
  round: number;
  soldAt: string;
}

export interface IUnsoldPlayerData {
  playerId: string;
  playerName: string;
  round: number;
  unsoldAt: string;
}
