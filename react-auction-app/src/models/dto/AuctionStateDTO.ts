// ============================================================================
// AUCTION STATE DTO - Data Transfer Objects for Auction State
// Used for persistence, sync, and state snapshots
// ============================================================================

import type { IPlayer, ISoldPlayer, IUnsoldPlayer } from '../domain/Player';
import type { ITeam } from '../domain/Team';
import type { IAuctionState, IBidHistoryEntry, SelectionMode, OverlayType } from '../domain/Auction';

/**
 * DTO for complete auction state snapshot
 */
export interface AuctionStateSnapshotDTO {
  // Player pools
  availablePlayers: IPlayer[];
  soldPlayers: ISoldPlayer[];
  unsoldPlayers: IUnsoldPlayer[];
  
  // Teams
  teams: ITeam[];
  
  // Current state
  currentPlayer: IPlayer | null;
  currentBid: number;
  selectedTeam: ITeam | null;
  bidHistory: IBidHistoryEntry[];
  
  // Auction status
  isActive: boolean;
  isPaused: boolean;
  currentRound: number;
  selectionMode: SelectionMode;
  
  // Metadata
  timestamp: number;
  version: string;
}

/**
 * DTO for partial state updates
 */
export interface AuctionStateUpdateDTO {
  currentPlayer?: IPlayer | null;
  currentBid?: number;
  selectedTeam?: ITeam | null;
  bidHistory?: IBidHistoryEntry[];
  isActive?: boolean;
  isPaused?: boolean;
  currentRound?: number;
  selectionMode?: SelectionMode;
  activeOverlay?: OverlayType;
}

/**
 * DTO for Firebase/Realtime sync state
 */
export interface RealtimeSyncStateDTO {
  currentPlayer: {
    id: string;
    name: string;
    imageUrl: string;
    role: string;
    basePrice: number;
  } | null;
  currentBid: number;
  selectedTeam: {
    id: string;
    name: string;
    logoUrl: string;
  } | null;
  isActive: boolean;
  round: number;
  lastUpdated: number;
}

/**
 * DTO for persistence storage
 */
export interface AuctionPersistenceDTO {
  id: string;
  state: AuctionStateSnapshotDTO;
  createdAt: number;
  updatedAt: number;
  checksum?: string;
}

/**
 * DTO for auction reset options
 */
export interface AuctionResetOptionsDTO {
  resetPlayers: boolean;
  resetTeams: boolean;
  resetRound: boolean;
  preserveSold: boolean;
  preserveUnsold: boolean;
}

/**
 * Transform functions for Auction State DTOs
 */
export const AuctionStateDTOTransformer = {
  /**
   * Create snapshot from current state
   */
  toSnapshot(
    availablePlayers: IPlayer[],
    soldPlayers: ISoldPlayer[],
    unsoldPlayers: IUnsoldPlayer[],
    teams: ITeam[],
    state: IAuctionState,
    selectionMode: SelectionMode
  ): AuctionStateSnapshotDTO {
    return {
      availablePlayers,
      soldPlayers,
      unsoldPlayers,
      teams,
      currentPlayer: state.currentPlayer,
      currentBid: state.currentBid,
      selectedTeam: state.selectedTeam,
      bidHistory: state.bidHistory,
      isActive: state.isActive,
      isPaused: state.isPaused,
      currentRound: state.currentRound,
      selectionMode,
      timestamp: Date.now(),
      version: '1.0.0',
    };
  },

  /**
   * Transform to realtime sync format (lightweight)
   */
  toRealtimeSyncDTO(state: IAuctionState, round: number): RealtimeSyncStateDTO {
    return {
      currentPlayer: state.currentPlayer ? {
        id: state.currentPlayer.id,
        name: state.currentPlayer.name,
        imageUrl: state.currentPlayer.imageUrl,
        role: state.currentPlayer.role,
        basePrice: state.currentPlayer.basePrice,
      } : null,
      currentBid: state.currentBid,
      selectedTeam: state.selectedTeam ? {
        id: state.selectedTeam.id,
        name: state.selectedTeam.name,
        logoUrl: state.selectedTeam.logoUrl,
      } : null,
      isActive: state.isActive,
      round,
      lastUpdated: Date.now(),
    };
  },

  /**
   * Create persistence DTO
   */
  toPersistenceDTO(
    id: string,
    snapshot: AuctionStateSnapshotDTO
  ): AuctionPersistenceDTO {
    return {
      id,
      state: snapshot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: AuctionStateDTOTransformer.generateChecksum(snapshot),
    };
  },

  /**
   * Generate checksum for state verification
   */
  generateChecksum(snapshot: AuctionStateSnapshotDTO): string {
    const str = JSON.stringify({
      players: snapshot.availablePlayers.length,
      sold: snapshot.soldPlayers.length,
      unsold: snapshot.unsoldPlayers.length,
      teams: snapshot.teams.length,
      round: snapshot.currentRound,
      timestamp: snapshot.timestamp,
    });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  },

  /**
   * Validate snapshot integrity
   */
  validateSnapshot(snapshot: AuctionStateSnapshotDTO): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(snapshot.availablePlayers)) {
      errors.push('Invalid availablePlayers array');
    }
    if (!Array.isArray(snapshot.soldPlayers)) {
      errors.push('Invalid soldPlayers array');
    }
    if (!Array.isArray(snapshot.unsoldPlayers)) {
      errors.push('Invalid unsoldPlayers array');
    }
    if (!Array.isArray(snapshot.teams)) {
      errors.push('Invalid teams array');
    }
    if (typeof snapshot.currentRound !== 'number' || snapshot.currentRound < 1) {
      errors.push('Invalid currentRound');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
