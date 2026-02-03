// ============================================================================
// AUCTION REPOSITORY - Data Access Layer for Auction State
// Handles auction state persistence and snapshots
// ============================================================================

import type { IAuctionState, IAuctionConfig, SelectionMode, OverlayType } from '../models/domain/Auction';
import type { AuctionStateSnapshotDTO, AuctionPersistenceDTO } from '../models/dto/AuctionStateDTO';
import { AuctionStateDTOTransformer } from '../models/dto/AuctionStateDTO';
import { getDefaultAuctionState, getDefaultAuctionConfig } from '../models/domain/Auction';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper } from '../models/responses/ApiResponse';
import type { IPlayer, ISoldPlayer, IUnsoldPlayer } from '../models/domain/Player';
import type { ITeam } from '../models/domain/Team';

/**
 * Auction repository interface
 */
export interface IAuctionRepository {
  // State operations
  getState(): Promise<ApiResponse<IAuctionState>>;
  getConfig(): Promise<ApiResponse<IAuctionConfig>>;
  setState(state: Partial<IAuctionState>): Promise<ApiResponse<void>>;
  setConfig(config: Partial<IAuctionConfig>): Promise<ApiResponse<void>>;
  
  // Snapshot operations
  createSnapshot(): Promise<ApiResponse<AuctionStateSnapshotDTO>>;
  restoreSnapshot(snapshot: AuctionStateSnapshotDTO): Promise<ApiResponse<void>>;
  
  // Persistence operations
  save(id?: string): Promise<ApiResponse<string>>;
  load(id: string): Promise<ApiResponse<AuctionPersistenceDTO | null>>;
  listSaved(): Promise<ApiResponse<{ id: string; timestamp: number }[]>>;
  deleteSaved(id: string): Promise<ApiResponse<void>>;
  
  // Round management
  getCurrentRound(): Promise<ApiResponse<number>>;
  setRound(round: number): Promise<ApiResponse<void>>;
  
  // Selection mode
  getSelectionMode(): Promise<ApiResponse<SelectionMode>>;
  setSelectionMode(mode: SelectionMode): Promise<ApiResponse<void>>;
  
  // Overlay
  getActiveOverlay(): Promise<ApiResponse<OverlayType>>;
  setActiveOverlay(overlay: OverlayType): Promise<ApiResponse<void>>;
}

/**
 * In-memory auction repository implementation
 */
export class AuctionRepository implements IAuctionRepository {
  private state: IAuctionState = getDefaultAuctionState();
  private config: IAuctionConfig = getDefaultAuctionConfig();
  private selectionMode: SelectionMode = 'sequential';
  private activeOverlay: OverlayType = null;
  private savedSnapshots: Map<string, AuctionPersistenceDTO> = new Map();

  // Store references for syncing
  private storeRef: {
    getState: () => {
      currentPlayer: IPlayer | null;
      currentBid: number;
      previousBid: number;
      selectedTeam: ITeam | null;
      bidHistory: { teamId: string; teamName: string; amount: number; timestamp: string }[];
      currentRound: number;
      selectionMode: SelectionMode;
      activeOverlay: OverlayType;
      availablePlayers: IPlayer[];
      soldPlayers: ISoldPlayer[];
      unsoldPlayers: IUnsoldPlayer[];
      teams: ITeam[];
    };
    setState: (state: Partial<{
      currentPlayer: IPlayer | null;
      currentBid: number;
      previousBid: number;
      selectedTeam: ITeam | null;
      bidHistory: { teamId: string; teamName: string; amount: number; timestamp: string }[];
      currentRound: number;
      selectionMode: SelectionMode;
      activeOverlay: OverlayType;
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
    const storeState = this.storeRef.getState();
    
    this.state = {
      currentPlayer: storeState.currentPlayer,
      currentBid: storeState.currentBid,
      previousBid: storeState.previousBid,
      selectedTeam: storeState.selectedTeam,
      bidHistory: storeState.bidHistory,
      isActive: storeState.currentPlayer !== null,
      isPaused: false,
      currentRound: storeState.currentRound,
    };
    
    this.selectionMode = storeState.selectionMode;
    this.activeOverlay = storeState.activeOverlay;
  }

  /**
   * Sync local cache to store
   */
  private syncToStore(): void {
    if (!this.storeRef) return;
    this.storeRef.setState({
      currentPlayer: this.state.currentPlayer,
      currentBid: this.state.currentBid,
      previousBid: this.state.previousBid,
      selectedTeam: this.state.selectedTeam,
      bidHistory: this.state.bidHistory,
      currentRound: this.state.currentRound,
      selectionMode: this.selectionMode,
      activeOverlay: this.activeOverlay,
    });
  }

  async getState(): Promise<ApiResponse<IAuctionState>> {
    this.syncFromStore();
    return ApiResponseHelper.success({ ...this.state });
  }

  async getConfig(): Promise<ApiResponse<IAuctionConfig>> {
    return ApiResponseHelper.success({ ...this.config });
  }

  async setState(state: Partial<IAuctionState>): Promise<ApiResponse<void>> {
    this.syncFromStore();
    this.state = { ...this.state, ...state };
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async setConfig(config: Partial<IAuctionConfig>): Promise<ApiResponse<void>> {
    this.config = { ...this.config, ...config };
    return ApiResponseHelper.success(undefined);
  }

  async createSnapshot(): Promise<ApiResponse<AuctionStateSnapshotDTO>> {
    this.syncFromStore();
    
    if (!this.storeRef) {
      return ApiResponseHelper.success(
        AuctionStateDTOTransformer.toSnapshot([], [], [], [], this.state, this.selectionMode)
      );
    }

    const storeState = this.storeRef.getState();
    const snapshot = AuctionStateDTOTransformer.toSnapshot(
      storeState.availablePlayers,
      storeState.soldPlayers,
      storeState.unsoldPlayers,
      storeState.teams,
      this.state,
      this.selectionMode
    );

    return ApiResponseHelper.success(snapshot);
  }

  async restoreSnapshot(snapshot: AuctionStateSnapshotDTO): Promise<ApiResponse<void>> {
    const validation = AuctionStateDTOTransformer.validateSnapshot(snapshot);
    if (!validation.valid) {
      return ApiResponseHelper.error(
        'VALIDATION_ERROR',
        `Invalid snapshot: ${validation.errors.join(', ')}`
      );
    }

    this.state = {
      currentPlayer: snapshot.currentPlayer,
      currentBid: snapshot.currentBid,
      previousBid: 0,
      selectedTeam: snapshot.selectedTeam,
      bidHistory: snapshot.bidHistory,
      isActive: snapshot.isActive,
      isPaused: snapshot.isPaused,
      currentRound: snapshot.currentRound,
    };
    
    this.selectionMode = snapshot.selectionMode;
    this.syncToStore();

    return ApiResponseHelper.success(undefined);
  }

  async save(id?: string): Promise<ApiResponse<string>> {
    const snapshotResponse = await this.createSnapshot();
    if (!snapshotResponse.success || !snapshotResponse.data) {
      return ApiResponseHelper.error('UNKNOWN_ERROR', 'Failed to create snapshot');
    }

    const saveId = id || `auction_${Date.now()}`;
    const persistence = AuctionStateDTOTransformer.toPersistenceDTO(saveId, snapshotResponse.data);
    
    this.savedSnapshots.set(saveId, persistence);

    // Also save to localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('auction_saves') || '{}');
      saved[saveId] = persistence;
      localStorage.setItem('auction_saves', JSON.stringify(saved));
    } catch (e) {
      console.warn('[AuctionRepository] Failed to save to localStorage:', e);
    }

    return ApiResponseHelper.success(saveId);
  }

  async load(id: string): Promise<ApiResponse<AuctionPersistenceDTO | null>> {
    // Try memory first
    let persistence = this.savedSnapshots.get(id);

    // Try localStorage
    if (!persistence) {
      try {
        const saved = JSON.parse(localStorage.getItem('auction_saves') || '{}');
        persistence = saved[id] || null;
      } catch (e) {
        console.warn('[AuctionRepository] Failed to load from localStorage:', e);
      }
    }

    return ApiResponseHelper.success(persistence || null);
  }

  async listSaved(): Promise<ApiResponse<{ id: string; timestamp: number }[]>> {
    const list: { id: string; timestamp: number }[] = [];

    // From memory
    this.savedSnapshots.forEach((persistence, id) => {
      list.push({ id, timestamp: persistence.updatedAt });
    });

    // From localStorage
    try {
      const saved = JSON.parse(localStorage.getItem('auction_saves') || '{}');
      Object.entries(saved).forEach(([id, persistence]) => {
        if (!this.savedSnapshots.has(id)) {
          list.push({ id, timestamp: (persistence as AuctionPersistenceDTO).updatedAt });
        }
      });
    } catch (e) {
      console.warn('[AuctionRepository] Failed to list from localStorage:', e);
    }

    return ApiResponseHelper.success(list.sort((a, b) => b.timestamp - a.timestamp));
  }

  async deleteSaved(id: string): Promise<ApiResponse<void>> {
    this.savedSnapshots.delete(id);

    try {
      const saved = JSON.parse(localStorage.getItem('auction_saves') || '{}');
      delete saved[id];
      localStorage.setItem('auction_saves', JSON.stringify(saved));
    } catch (e) {
      console.warn('[AuctionRepository] Failed to delete from localStorage:', e);
    }

    return ApiResponseHelper.success(undefined);
  }

  async getCurrentRound(): Promise<ApiResponse<number>> {
    this.syncFromStore();
    return ApiResponseHelper.success(this.state.currentRound);
  }

  async setRound(round: number): Promise<ApiResponse<void>> {
    this.syncFromStore();
    this.state = { ...this.state, currentRound: round };
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async getSelectionMode(): Promise<ApiResponse<SelectionMode>> {
    this.syncFromStore();
    return ApiResponseHelper.success(this.selectionMode);
  }

  async setSelectionMode(mode: SelectionMode): Promise<ApiResponse<void>> {
    this.selectionMode = mode;
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async getActiveOverlay(): Promise<ApiResponse<OverlayType>> {
    this.syncFromStore();
    return ApiResponseHelper.success(this.activeOverlay);
  }

  async setActiveOverlay(overlay: OverlayType): Promise<ApiResponse<void>> {
    this.activeOverlay = overlay;
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }
}

// Singleton instance
export const auctionRepository = new AuctionRepository();
