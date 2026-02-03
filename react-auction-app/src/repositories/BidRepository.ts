// ============================================================================
// BID REPOSITORY - Data Access Layer for Bids
// Handles bid history, validation, and real-time sync
// ============================================================================

import type { IBid } from '../models/domain/Bid';
import { validateBid } from '../models/domain/Bid';
import type { BidHistoryResponseDTO, RealtimeBidDTO } from '../models/dto/BidDTO';
import { BidDTOTransformer } from '../models/dto/BidDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper } from '../models/responses/ApiResponse';
import type { IPlayer } from '../models/domain/Player';
import type { ITeam } from '../models/domain/Team';

/**
 * Bid repository interface
 */
export interface IBidRepository {
  // Read operations
  getHistory(playerId: string): Promise<ApiResponse<BidHistoryResponseDTO>>;
  getCurrentBid(playerId: string): Promise<ApiResponse<IBid | null>>;
  getWinningBid(playerId: string): Promise<ApiResponse<IBid | null>>;
  getAllBidsForPlayer(playerId: string): Promise<ApiResponse<IBid[]>>;
  
  // Write operations
  addBid(bid: IBid): Promise<ApiResponse<IBid>>;
  clearBidsForPlayer(playerId: string): Promise<ApiResponse<void>>;
  clearAllBids(): Promise<ApiResponse<void>>;
  
  // Validation
  validateBid(bid: IBid, team: ITeam, player: IPlayer, currentBid: number, config: { minimumBid: number; bidIncrement: number }): Promise<ApiResponse<{ valid: boolean; errors: string[]; warnings: string[] }>>;
  
  // Real-time sync
  subscribeToBids(playerId: string, callback: (bid: RealtimeBidDTO) => void): () => void;
  broadcastBid(bid: IBid): Promise<ApiResponse<void>>;
}

/**
 * In-memory bid repository implementation
 */
export class BidRepository implements IBidRepository {
  private bidsByPlayer: Map<string, IBid[]> = new Map();
  private bidListeners: Map<string, Set<(bid: RealtimeBidDTO) => void>> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Initialize broadcast channel for cross-tab communication
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('auction-bids');
      this.broadcastChannel.onmessage = (event) => {
        this.handleBroadcastMessage(event.data);
      };
    }
  }

  /**
   * Handle incoming broadcast messages
   */
  private handleBroadcastMessage(data: { type: string; bid?: RealtimeBidDTO }): void {
    if (data.type === 'new_bid' && data.bid) {
      const listeners = this.bidListeners.get(data.bid.playerId);
      listeners?.forEach(callback => callback(data.bid!));
    }
  }

  async getHistory(playerId: string): Promise<ApiResponse<BidHistoryResponseDTO>> {
    const bids = this.bidsByPlayer.get(playerId) || [];
    const sortedBids = [...bids].sort((a, b) => b.timestamp - a.timestamp);
    const winningBid = sortedBids.length > 0 ? sortedBids[0] : null;

    return ApiResponseHelper.success({
      playerId,
      bids: sortedBids,
      total: sortedBids.length,
      winningBid,
    });
  }

  async getCurrentBid(playerId: string): Promise<ApiResponse<IBid | null>> {
    const bids = this.bidsByPlayer.get(playerId) || [];
    if (bids.length === 0) {
      return ApiResponseHelper.success(null);
    }

    const sortedBids = [...bids].sort((a, b) => b.amount - a.amount);
    return ApiResponseHelper.success(sortedBids[0]);
  }

  async getWinningBid(playerId: string): Promise<ApiResponse<IBid | null>> {
    return this.getCurrentBid(playerId);
  }

  async getAllBidsForPlayer(playerId: string): Promise<ApiResponse<IBid[]>> {
    const bids = this.bidsByPlayer.get(playerId) || [];
    return ApiResponseHelper.success([...bids].sort((a, b) => a.timestamp - b.timestamp));
  }

  async addBid(bid: IBid): Promise<ApiResponse<IBid>> {
    const existingBids = this.bidsByPlayer.get(bid.playerId) || [];
    this.bidsByPlayer.set(bid.playerId, [...existingBids, bid]);

    // Notify local listeners
    const listeners = this.bidListeners.get(bid.playerId);
    const realtimeBid = BidDTOTransformer.toRealtimeBidDTO(bid);
    listeners?.forEach(callback => callback(realtimeBid));

    return ApiResponseHelper.success(bid);
  }

  async clearBidsForPlayer(playerId: string): Promise<ApiResponse<void>> {
    this.bidsByPlayer.delete(playerId);
    return ApiResponseHelper.success(undefined);
  }

  async clearAllBids(): Promise<ApiResponse<void>> {
    this.bidsByPlayer.clear();
    return ApiResponseHelper.success(undefined);
  }

  async validateBid(
    bid: IBid,
    team: ITeam,
    player: IPlayer,
    currentBid: number,
    config: { minimumBid: number; bidIncrement: number }
  ): Promise<ApiResponse<{ valid: boolean; errors: string[]; warnings: string[] }>> {
    const validation = validateBid(
      bid,
      team,
      player,
      currentBid,
      config.minimumBid,
      config.bidIncrement
    );

    return ApiResponseHelper.success(validation);
  }

  subscribeToBids(playerId: string, callback: (bid: RealtimeBidDTO) => void): () => void {
    if (!this.bidListeners.has(playerId)) {
      this.bidListeners.set(playerId, new Set());
    }

    this.bidListeners.get(playerId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.bidListeners.get(playerId);
      listeners?.delete(callback);
      if (listeners?.size === 0) {
        this.bidListeners.delete(playerId);
      }
    };
  }

  async broadcastBid(bid: IBid): Promise<ApiResponse<void>> {
    const realtimeBid = BidDTOTransformer.toRealtimeBidDTO(bid);

    // Broadcast to other tabs
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'new_bid',
        bid: realtimeBid,
      });
    }

    return ApiResponseHelper.success(undefined);
  }

  /**
   * Get bid statistics for a player
   */
  getBidStats(playerId: string): {
    totalBids: number;
    highestBid: number;
    lowestBid: number;
    averageBid: number;
    uniqueTeams: number;
  } {
    const bids = this.bidsByPlayer.get(playerId) || [];
    
    if (bids.length === 0) {
      return {
        totalBids: 0,
        highestBid: 0,
        lowestBid: 0,
        averageBid: 0,
        uniqueTeams: 0,
      };
    }

    const amounts = bids.map(b => b.amount);
    const uniqueTeamIds = new Set(bids.map(b => b.teamId));

    return {
      totalBids: bids.length,
      highestBid: Math.max(...amounts),
      lowestBid: Math.min(...amounts),
      averageBid: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      uniqueTeams: uniqueTeamIds.size,
    };
  }
}

// Singleton instance
export const bidRepository = new BidRepository();
