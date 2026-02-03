// ============================================================================
// PLAYER CONTROLLER - Business Logic for Player Operations
// Orchestrates player management with filtering and stats
// ============================================================================

import type { IPlayer, ISoldPlayer, IUnsoldPlayer, IPlayerStats } from '../models/domain/Player';
import type { PlayerFilterDTO } from '../models/dto/PlayerDTO';
import { PlayerDTOTransformer } from '../models/dto/PlayerDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper } from '../models/responses/ApiResponse';
import { getPlayerRepository } from '../repositories';

/**
 * Player controller interface
 */
export interface IPlayerController {
  // Query operations
  getAllPlayers(): Promise<ApiResponse<IPlayer[]>>;
  getAvailablePlayers(): Promise<ApiResponse<IPlayer[]>>;
  getSoldPlayers(): Promise<ApiResponse<ISoldPlayer[]>>;
  getUnsoldPlayers(): Promise<ApiResponse<IUnsoldPlayer[]>>;
  getPlayerById(id: string): Promise<ApiResponse<IPlayer | null>>;
  filterPlayers(filter: PlayerFilterDTO): Promise<ApiResponse<IPlayer[]>>;
  searchPlayers(term: string): Promise<ApiResponse<IPlayer[]>>;
  
  // Stats
  getStats(): Promise<ApiResponse<IPlayerStats>>;
  getPlayersByRole(role: string): Promise<ApiResponse<IPlayer[]>>;
  getUnderAgePlayers(): Promise<ApiResponse<IPlayer[]>>;
  
  // Data management
  setPlayers(players: IPlayer[]): Promise<ApiResponse<void>>;
  loadFromApi(data: Record<string, unknown>[]): Promise<ApiResponse<IPlayer[]>>;
  
  // Utilities
  getPlayerAvatarUrl(player: IPlayer): string;
  formatPlayerStats(player: IPlayer): { matches: number; runs: number; wickets: number };
}

/**
 * Player controller implementation
 */
export class PlayerController implements IPlayerController {
  private get playerRepo() { return getPlayerRepository(); }

  async getAllPlayers(): Promise<ApiResponse<IPlayer[]>> {
    return this.playerRepo.getAll();
  }

  async getAvailablePlayers(): Promise<ApiResponse<IPlayer[]>> {
    return this.playerRepo.getAvailable();
  }

  async getSoldPlayers(): Promise<ApiResponse<ISoldPlayer[]>> {
    return this.playerRepo.getSold();
  }

  async getUnsoldPlayers(): Promise<ApiResponse<IUnsoldPlayer[]>> {
    return this.playerRepo.getUnsold();
  }

  async getPlayerById(id: string): Promise<ApiResponse<IPlayer | null>> {
    return this.playerRepo.getById(id);
  }

  async filterPlayers(filter: PlayerFilterDTO): Promise<ApiResponse<IPlayer[]>> {
    return this.playerRepo.filter(filter);
  }

  async searchPlayers(term: string): Promise<ApiResponse<IPlayer[]>> {
    return this.playerRepo.filter({ searchTerm: term });
  }

  async getStats(): Promise<ApiResponse<IPlayerStats>> {
    return this.playerRepo.getStats();
  }

  async getPlayersByRole(role: string): Promise<ApiResponse<IPlayer[]>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return availableResponse;
    }

    const filtered = availableResponse.data.filter(
      (p: IPlayer) => p.role.toLowerCase() === role.toLowerCase()
    );

    return ApiResponseHelper.success(filtered);
  }

  async getUnderAgePlayers(): Promise<ApiResponse<IPlayer[]>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return availableResponse;
    }

    const filtered = availableResponse.data.filter(
      (p: IPlayer) => p.age !== null && p.age < 19
    );

    return ApiResponseHelper.success(filtered);
  }

  async setPlayers(players: IPlayer[]): Promise<ApiResponse<void>> {
    return this.playerRepo.setPlayers(players);
  }

  async loadFromApi(data: Record<string, unknown>[]): Promise<ApiResponse<IPlayer[]>> {
    const players = data.map(item => PlayerDTOTransformer.fromApiResponse(item));
    await this.playerRepo.setPlayers(players);
    return ApiResponseHelper.success(players);
  }

  getPlayerAvatarUrl(player: IPlayer): string {
    if (player.imageUrl?.trim()) {
      return player.imageUrl;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=0D1117&color=FFFFFF&size=256`;
  }

  formatPlayerStats(player: IPlayer): { matches: number; runs: number; wickets: number } {
    return {
      matches: parseInt(player.matches, 10) || 0,
      runs: parseInt(player.runs, 10) || 0,
      wickets: parseInt(player.wickets, 10) || 0,
    };
  }

  /**
   * Get player summary for display
   */
  getPlayerSummary(player: IPlayer): {
    name: string;
    role: string;
    age: string;
    basePrice: string;
    avatar: string;
  } {
    return {
      name: player.name,
      role: player.role,
      age: player.age !== null ? `${player.age} yrs` : 'N/A',
      basePrice: this.formatCurrency(player.basePrice),
      avatar: this.getPlayerAvatarUrl(player),
    };
  }

  /**
   * Group players by role
   */
  async getPlayersGroupedByRole(): Promise<ApiResponse<Record<string, IPlayer[]>>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return ApiResponseHelper.error('UNKNOWN_ERROR', 'Failed to get players');
    }

    const grouped: Record<string, IPlayer[]> = {};
    availableResponse.data.forEach((player: IPlayer) => {
      const role = player.role || 'Unknown';
      if (!grouped[role]) {
        grouped[role] = [];
      }
      grouped[role].push(player);
    });

    return ApiResponseHelper.success(grouped);
  }

  /**
   * Get top performers (by runs or wickets)
   */
  async getTopPerformers(type: 'runs' | 'wickets', limit: number = 10): Promise<ApiResponse<IPlayer[]>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return availableResponse;
    }

    const sorted = [...availableResponse.data].sort((a, b) => {
      const aValue = parseInt(type === 'runs' ? a.runs : a.wickets, 10) || 0;
      const bValue = parseInt(type === 'runs' ? b.runs : b.wickets, 10) || 0;
      return bValue - aValue;
    });

    return ApiResponseHelper.success(sorted.slice(0, limit));
  }

  /**
   * Format currency helper
   */
  private formatCurrency(amount: number): string {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  }
}

// Singleton instance
export const playerController = new PlayerController();
