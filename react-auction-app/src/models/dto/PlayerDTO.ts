// ============================================================================
// PLAYER DTO - Data Transfer Objects for Player operations
// Used for API requests/responses and data transformations
// ============================================================================

import type { PlayerRole } from '../../types';
import type { IPlayer, ISoldPlayer, IUnsoldPlayer } from '../domain/Player';

/**
 * DTO for creating a new player
 */
export interface CreatePlayerDTO {
  name: string;
  imageUrl?: string;
  role: PlayerRole;
  age?: number | null;
  matches?: string;
  runs?: string;
  wickets?: string;
  battingBestFigures?: string;
  bowlingBestFigures?: string;
  basePrice: number;
  dateOfBirth?: string;
}

/**
 * DTO for updating player information
 */
export interface UpdatePlayerDTO {
  id: string;
  name?: string;
  imageUrl?: string;
  role?: PlayerRole;
  age?: number | null;
  matches?: string;
  runs?: string;
  wickets?: string;
  battingBestFigures?: string;
  bowlingBestFigures?: string;
  basePrice?: number;
}

/**
 * DTO for marking a player as sold
 */
export interface SoldPlayerDTO {
  playerId: string;
  teamId: string;
  teamName: string;
  soldAmount: number;
  soldDate?: string;
}

/**
 * DTO for marking a player as unsold
 */
export interface UnsoldPlayerDTO {
  playerId: string;
  round: string;
  unsoldDate?: string;
}

/**
 * DTO for player list response with pagination
 */
export interface PlayerListDTO {
  players: IPlayer[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * DTO for player filter options
 */
export interface PlayerFilterDTO {
  roles?: PlayerRole[];
  minAge?: number;
  maxAge?: number;
  minBasePrice?: number;
  maxBasePrice?: number;
  searchTerm?: string;
}

/**
 * Transform functions for Player DTOs
 */
export const PlayerDTOTransformer = {
  /**
   * Transform raw API data to Player interface
   */
  fromApiResponse(data: Record<string, unknown>): IPlayer {
    return {
      id: String(data.id || ''),
      name: String(data.name || ''),
      imageUrl: String(data.imageUrl || data.image_url || ''),
      role: (data.role || 'Player') as PlayerRole,
      age: data.age ? Number(data.age) : null,
      matches: String(data.matches || '0'),
      runs: String(data.runs || '0'),
      wickets: String(data.wickets || '0'),
      battingBestFigures: String(data.battingBestFigures || data.batting_best || '-'),
      bowlingBestFigures: String(data.bowlingBestFigures || data.bowling_best || '-'),
      basePrice: Number(data.basePrice || data.base_price || 0),
      dateOfBirth: data.dateOfBirth ? String(data.dateOfBirth) : undefined,
    };
  },

  /**
   * Transform Player to sold player
   */
  toSoldPlayer(player: IPlayer, teamName: string, teamId: string, amount: number): ISoldPlayer {
    return {
      ...player,
      soldAmount: amount,
      teamName,
      teamId,
      soldDate: new Date().toISOString(),
    };
  },

  /**
   * Transform Player to unsold player
   */
  toUnsoldPlayer(player: IPlayer, round: string): IUnsoldPlayer {
    return {
      ...player,
      round,
      unsoldDate: new Date().toISOString(),
    };
  },

  /**
   * Transform to API request format
   */
  toApiRequest(player: IPlayer): Record<string, unknown> {
    return {
      id: player.id,
      name: player.name,
      image_url: player.imageUrl,
      role: player.role,
      age: player.age,
      matches: player.matches,
      runs: player.runs,
      wickets: player.wickets,
      batting_best: player.battingBestFigures,
      bowling_best: player.bowlingBestFigures,
      base_price: player.basePrice,
      date_of_birth: player.dateOfBirth,
    };
  },
};
