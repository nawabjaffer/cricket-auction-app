// ============================================================================
// BID DTO - Data Transfer Objects for Bid operations
// Used for API requests/responses and data transformations
// ============================================================================

import type { IBid, BidEventType, BidSource } from '../domain/Bid';

/**
 * DTO for placing a new bid
 */
export interface PlaceBidDTO {
  playerId: string;
  teamId: string;
  amount: number;
  source?: BidSource;
  clientId?: string;
}

/**
 * DTO for bid response
 */
export interface BidResponseDTO {
  bid: IBid;
  accepted: boolean;
  currentBid: number;
  currentTeamId: string | null;
  message?: string;
  errors?: string[];
}

/**
 * DTO for bid history request
 */
export interface BidHistoryRequestDTO {
  playerId: string;
  limit?: number;
  offset?: number;
}

/**
 * DTO for bid history response
 */
export interface BidHistoryResponseDTO {
  playerId: string;
  bids: IBid[];
  total: number;
  winningBid: IBid | null;
}

/**
 * DTO for realtime bid sync
 */
export interface RealtimeBidDTO {
  playerId: string;
  teamId: string;
  teamName: string;
  amount: number;
  timestamp: number;
  type: BidEventType;
  source: BidSource;
}

/**
 * DTO for mobile bid submission
 */
export interface MobileBidDTO {
  teamId: string;
  teamName: string;
  amount: number;
  deviceId: string;
  timestamp?: number;
}

/**
 * Transform functions for Bid DTOs
 */
export const BidDTOTransformer = {
  /**
   * Transform PlaceBidDTO to IBid
   */
  fromPlaceBidDTO(dto: PlaceBidDTO, teamName: string): IBid {
    return {
      id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      playerId: dto.playerId,
      teamId: dto.teamId,
      teamName,
      amount: dto.amount,
      timestamp: Date.now(),
      type: 'raise',
      source: dto.source || 'keyboard',
      clientId: dto.clientId || 'default',
    };
  },

  /**
   * Transform IBid to RealtimeBidDTO
   */
  toRealtimeBidDTO(bid: IBid): RealtimeBidDTO {
    return {
      playerId: bid.playerId,
      teamId: bid.teamId,
      teamName: bid.teamName,
      amount: bid.amount,
      timestamp: bid.timestamp,
      type: bid.type,
      source: bid.source,
    };
  },

  /**
   * Transform MobileBidDTO to IBid
   */
  fromMobileBidDTO(dto: MobileBidDTO, playerId: string): IBid {
    return {
      id: `bid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      playerId,
      teamId: dto.teamId,
      teamName: dto.teamName,
      amount: dto.amount,
      timestamp: dto.timestamp || Date.now(),
      type: 'raise',
      source: 'mobile',
      clientId: dto.deviceId,
    };
  },

  /**
   * Transform raw Firebase bid to IBid
   */
  fromFirebaseBid(data: Record<string, unknown>, playerId: string): IBid {
    return {
      id: String(data.id || `bid_${Date.now()}`),
      playerId,
      teamId: String(data.teamId || ''),
      teamName: String(data.teamName || ''),
      amount: Number(data.amount || 0),
      timestamp: Number(data.timestamp || Date.now()),
      type: (data.type || 'raise') as BidEventType,
      source: (data.source || 'mobile') as BidSource,
      clientId: String(data.clientId || data.deviceId || 'unknown'),
    };
  },

  /**
   * Create bid response
   */
  toBidResponseDTO(
    bid: IBid,
    accepted: boolean,
    currentBid: number,
    currentTeamId: string | null,
    message?: string,
    errors?: string[]
  ): BidResponseDTO {
    return {
      bid,
      accepted,
      currentBid,
      currentTeamId,
      message,
      errors,
    };
  },
};
