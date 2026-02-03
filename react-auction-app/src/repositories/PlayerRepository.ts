// ============================================================================
// PLAYER REPOSITORY - Data Access Layer for Players
// Handles all player data operations with caching and sync
// ============================================================================

import type { IPlayer, ISoldPlayer, IUnsoldPlayer, IPlayerStats } from '../models/domain/Player';
import type { PlayerFilterDTO } from '../models/dto/PlayerDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper } from '../models/responses/ApiResponse';

/**
 * Player repository interface
 */
export interface IPlayerRepository {
  // Read operations
  getAll(): Promise<ApiResponse<IPlayer[]>>;
  getById(id: string): Promise<ApiResponse<IPlayer | null>>;
  getAvailable(): Promise<ApiResponse<IPlayer[]>>;
  getSold(): Promise<ApiResponse<ISoldPlayer[]>>;
  getUnsold(): Promise<ApiResponse<IUnsoldPlayer[]>>;
  filter(filter: PlayerFilterDTO): Promise<ApiResponse<IPlayer[]>>;
  
  // Write operations
  setPlayers(players: IPlayer[]): Promise<ApiResponse<void>>;
  markAsSold(player: IPlayer, teamName: string, teamId: string, amount: number): Promise<ApiResponse<ISoldPlayer>>;
  markAsUnsold(player: IPlayer, round: string): Promise<ApiResponse<IUnsoldPlayer>>;
  moveUnsoldToSold(player: IUnsoldPlayer, teamName: string, teamId: string, amount: number): Promise<ApiResponse<ISoldPlayer>>;
  moveSoldToAvailable(player: ISoldPlayer): Promise<ApiResponse<IPlayer>>;
  
  // Stats
  getStats(): Promise<ApiResponse<IPlayerStats>>;
  
  // Sync
  sync(): Promise<ApiResponse<void>>;
}

/**
 * In-memory player repository implementation
 * Uses Zustand store as the data source
 */
export class PlayerRepository implements IPlayerRepository {
  private availablePlayers: IPlayer[] = [];
  private soldPlayers: ISoldPlayer[] = [];
  private unsoldPlayers: IUnsoldPlayer[] = [];
  private originalPlayers: IPlayer[] = [];

  // Store reference for syncing with Zustand
  private storeRef: {
    getState: () => {
      availablePlayers: IPlayer[];
      soldPlayers: ISoldPlayer[];
      unsoldPlayers: IUnsoldPlayer[];
      originalPlayers: IPlayer[];
    };
    setState: (state: Partial<{
      availablePlayers: IPlayer[];
      soldPlayers: ISoldPlayer[];
      unsoldPlayers: IUnsoldPlayer[];
      originalPlayers: IPlayer[];
    }>) => void;
  } | null = null;

  /**
   * Connect to Zustand store
   */
  connectStore(store: typeof this.storeRef): void {
    this.storeRef = store;
    this.syncFromStore();
  }

  /**
   * Sync local cache from store
   */
  private syncFromStore(): void {
    if (!this.storeRef) return;
    const state = this.storeRef.getState();
    this.availablePlayers = [...state.availablePlayers];
    this.soldPlayers = [...state.soldPlayers];
    this.unsoldPlayers = [...state.unsoldPlayers];
    this.originalPlayers = [...state.originalPlayers];
  }

  /**
   * Sync local cache to store
   */
  private syncToStore(): void {
    if (!this.storeRef) return;
    this.storeRef.setState({
      availablePlayers: this.availablePlayers,
      soldPlayers: this.soldPlayers,
      unsoldPlayers: this.unsoldPlayers,
      originalPlayers: this.originalPlayers,
    });
  }

  async getAll(): Promise<ApiResponse<IPlayer[]>> {
    this.syncFromStore();
    return ApiResponseHelper.success([
      ...this.availablePlayers,
      ...this.soldPlayers,
      ...this.unsoldPlayers,
    ]);
  }

  async getById(id: string): Promise<ApiResponse<IPlayer | null>> {
    this.syncFromStore();
    const player = this.originalPlayers.find(p => p.id === id) || null;
    return ApiResponseHelper.success(player);
  }

  async getAvailable(): Promise<ApiResponse<IPlayer[]>> {
    this.syncFromStore();
    return ApiResponseHelper.success([...this.availablePlayers]);
  }

  async getSold(): Promise<ApiResponse<ISoldPlayer[]>> {
    this.syncFromStore();
    return ApiResponseHelper.success([...this.soldPlayers]);
  }

  async getUnsold(): Promise<ApiResponse<IUnsoldPlayer[]>> {
    this.syncFromStore();
    return ApiResponseHelper.success([...this.unsoldPlayers]);
  }

  async filter(filterDto: PlayerFilterDTO): Promise<ApiResponse<IPlayer[]>> {
    this.syncFromStore();
    let filtered = [...this.availablePlayers];

    if (filterDto.roles?.length) {
      filtered = filtered.filter(p => filterDto.roles!.includes(p.role));
    }
    if (filterDto.minAge !== undefined) {
      filtered = filtered.filter(p => p.age !== null && p.age >= filterDto.minAge!);
    }
    if (filterDto.maxAge !== undefined) {
      filtered = filtered.filter(p => p.age !== null && p.age <= filterDto.maxAge!);
    }
    if (filterDto.minBasePrice !== undefined) {
      filtered = filtered.filter(p => p.basePrice >= filterDto.minBasePrice!);
    }
    if (filterDto.maxBasePrice !== undefined) {
      filtered = filtered.filter(p => p.basePrice <= filterDto.maxBasePrice!);
    }
    if (filterDto.searchTerm) {
      const term = filterDto.searchTerm.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(term));
    }

    return ApiResponseHelper.success(filtered);
  }

  async setPlayers(players: IPlayer[]): Promise<ApiResponse<void>> {
    this.availablePlayers = [...players];
    this.originalPlayers = [...players];
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async markAsSold(
    player: IPlayer,
    teamName: string,
    teamId: string,
    amount: number
  ): Promise<ApiResponse<ISoldPlayer>> {
    this.syncFromStore();

    // Remove from available
    this.availablePlayers = this.availablePlayers.filter(p => p.id !== player.id);

    // Create sold player
    const soldPlayer: ISoldPlayer = {
      ...player,
      soldAmount: amount,
      teamName,
      teamId,
      soldDate: new Date().toISOString(),
    };

    this.soldPlayers = [...this.soldPlayers, soldPlayer];
    this.syncToStore();

    return ApiResponseHelper.success(soldPlayer);
  }

  async markAsUnsold(player: IPlayer, round: string): Promise<ApiResponse<IUnsoldPlayer>> {
    this.syncFromStore();

    // Remove from available
    this.availablePlayers = this.availablePlayers.filter(p => p.id !== player.id);

    // Create unsold player
    const unsoldPlayer: IUnsoldPlayer = {
      ...player,
      round,
      unsoldDate: new Date().toISOString(),
    };

    this.unsoldPlayers = [...this.unsoldPlayers, unsoldPlayer];
    this.syncToStore();

    return ApiResponseHelper.success(unsoldPlayer);
  }

  async moveUnsoldToSold(
    player: IUnsoldPlayer,
    teamName: string,
    teamId: string,
    amount: number
  ): Promise<ApiResponse<ISoldPlayer>> {
    this.syncFromStore();

    // Remove from unsold
    this.unsoldPlayers = this.unsoldPlayers.filter(p => p.id !== player.id);

    // Create sold player
    const soldPlayer: ISoldPlayer = {
      id: player.id,
      name: player.name,
      imageUrl: player.imageUrl,
      role: player.role,
      age: player.age,
      matches: player.matches,
      runs: player.runs,
      wickets: player.wickets,
      battingBestFigures: player.battingBestFigures,
      bowlingBestFigures: player.bowlingBestFigures,
      basePrice: player.basePrice,
      dateOfBirth: player.dateOfBirth,
      soldAmount: amount,
      teamName,
      teamId,
      soldDate: new Date().toISOString(),
    };

    this.soldPlayers = [...this.soldPlayers, soldPlayer];
    this.syncToStore();

    return ApiResponseHelper.success(soldPlayer);
  }

  async moveSoldToAvailable(player: ISoldPlayer): Promise<ApiResponse<IPlayer>> {
    this.syncFromStore();

    // Remove from sold
    this.soldPlayers = this.soldPlayers.filter(p => p.id !== player.id);

    // Create available player (remove sold-specific fields)
    const availablePlayer: IPlayer = {
      id: player.id,
      name: player.name,
      imageUrl: player.imageUrl,
      role: player.role,
      age: player.age,
      matches: player.matches,
      runs: player.runs,
      wickets: player.wickets,
      battingBestFigures: player.battingBestFigures,
      bowlingBestFigures: player.bowlingBestFigures,
      basePrice: player.basePrice,
      dateOfBirth: player.dateOfBirth,
    };

    this.availablePlayers = [...this.availablePlayers, availablePlayer];
    this.syncToStore();

    return ApiResponseHelper.success(availablePlayer);
  }

  async getStats(): Promise<ApiResponse<IPlayerStats>> {
    this.syncFromStore();

    const total = this.originalPlayers.length;
    const sold = this.soldPlayers.length;
    const unsold = this.unsoldPlayers.length;
    const available = this.availablePlayers.length;
    const totalRevenue = this.soldPlayers.reduce((sum, p) => sum + p.soldAmount, 0);

    return ApiResponseHelper.success({
      total,
      available,
      sold,
      unsold,
      percentageSold: total > 0 ? (sold / total) * 100 : 0,
      totalRevenue,
      averageSalePrice: sold > 0 ? totalRevenue / sold : 0,
    });
  }

  async sync(): Promise<ApiResponse<void>> {
    this.syncFromStore();
    return ApiResponseHelper.success(undefined);
  }
}

// Singleton instance
export const playerRepository = new PlayerRepository();
