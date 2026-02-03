// ============================================================================
// BID CONTROLLER - Business Logic for Bidding Operations
// Orchestrates bidding flow with validation and real-time sync
// ============================================================================

import type { ITeam } from '../models/domain/Team';
import type { IBid } from '../models/domain/Bid';
import { formatBidCurrency } from '../models/domain/Bid';
import type { PlaceBidDTO, BidResponseDTO } from '../models/dto/BidDTO';
import { BidDTOTransformer } from '../models/dto/BidDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper, ApiErrorCodes } from '../models/responses/ApiResponse';
import { ValidationHelper, type BidValidationResponse } from '../models/responses/ValidationResponse';
import { 
  getTeamRepository, 
  getAuctionRepository,
  getBidRepository 
} from '../repositories';

/**
 * Bid controller interface
 */
export interface IBidController {
  // Bidding operations
  placeBid(dto: PlaceBidDTO, team: ITeam): Promise<ApiResponse<BidResponseDTO>>;
  raiseBid(team: ITeam, multiplier?: number): Promise<ApiResponse<BidResponseDTO>>;
  incrementBid(): Promise<ApiResponse<number>>;
  decrementBid(): Promise<ApiResponse<number>>;
  resetBid(): Promise<ApiResponse<number>>;
  
  // Query operations
  getCurrentBid(): Promise<ApiResponse<number>>;
  getCurrentTeam(): Promise<ApiResponse<ITeam | null>>;
  getBidHistory(): Promise<ApiResponse<IBid[]>>;
  getMaxBidForTeam(team: ITeam): Promise<ApiResponse<number>>;
  getEligibleTeams(): Promise<ApiResponse<ITeam[]>>;
  
  // Validation
  validateBid(amount: number, team: ITeam): Promise<BidValidationResponse>;
  canTeamBid(team: ITeam): Promise<ApiResponse<boolean>>;
}

/**
 * Bid controller implementation
 */
export class BidController implements IBidController {
  // Config defaults
  private minimumBid = 2000000;
  private bidIncrement = 500000;
  private maxUnderAge = 2;

  // Repositories
  private get teamRepo() { return getTeamRepository(); }
  private get auctionRepo() { return getAuctionRepository(); }
  private get bidRepo() { return getBidRepository(); }

  /**
   * Set bid configuration
   */
  configure(config: { minimumBid?: number; bidIncrement?: number; maxUnderAge?: number }): void {
    if (config.minimumBid) this.minimumBid = config.minimumBid;
    if (config.bidIncrement) this.bidIncrement = config.bidIncrement;
    if (config.maxUnderAge) this.maxUnderAge = config.maxUnderAge;
  }

  async placeBid(dto: PlaceBidDTO, team: ITeam): Promise<ApiResponse<BidResponseDTO>> {
    // Get current state
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get auction state');
    }

    const state = stateResponse.data;
    if (!state.currentPlayer) {
      return ApiResponseHelper.error(ApiErrorCodes.AUCTION_NOT_ACTIVE, 'No player is being auctioned');
    }

    // Validate bid
    const validation = await this.validateBid(dto.amount, team);
    if (!validation.valid) {
      return ApiResponseHelper.success(
        BidDTOTransformer.toBidResponseDTO(
          BidDTOTransformer.fromPlaceBidDTO(dto, team.name),
          false,
          state.currentBid,
          state.selectedTeam?.id || null,
          undefined,
          ValidationHelper.getErrorMessages(validation)
        )
      );
    }

    // Create bid
    const bid = BidDTOTransformer.fromPlaceBidDTO(dto, team.name);

    // Record bid
    await this.bidRepo.addBid(bid);

    // Update auction state
    const newBidHistory = [
      ...state.bidHistory,
      {
        teamId: team.id,
        teamName: team.name,
        amount: dto.amount,
        timestamp: new Date().toISOString(),
      },
    ];

    await this.auctionRepo.setState({
      currentBid: dto.amount,
      previousBid: state.currentBid,
      selectedTeam: team,
      bidHistory: newBidHistory,
    });

    // Broadcast bid
    await this.bidRepo.broadcastBid(bid);

    return ApiResponseHelper.success(
      BidDTOTransformer.toBidResponseDTO(
        bid,
        true,
        dto.amount,
        team.id,
        'Bid accepted'
      )
    );
  }

  async raiseBid(team: ITeam, multiplier: number = 1): Promise<ApiResponse<BidResponseDTO>> {
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get auction state');
    }

    const state = stateResponse.data;
    if (!state.currentPlayer) {
      return ApiResponseHelper.error(ApiErrorCodes.AUCTION_NOT_ACTIVE, 'No player is being auctioned');
    }

    // Calculate new bid amount
    const increment = this.bidIncrement * multiplier;
    const newAmount = state.currentBid + increment;

    // Create bid DTO
    const dto: PlaceBidDTO = {
      playerId: state.currentPlayer.id,
      teamId: team.id,
      amount: newAmount,
      source: 'keyboard',
    };

    return this.placeBid(dto, team);
  }

  async incrementBid(): Promise<ApiResponse<number>> {
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get auction state');
    }

    const newBid = stateResponse.data.currentBid + this.bidIncrement;
    
    await this.auctionRepo.setState({
      previousBid: stateResponse.data.currentBid,
      currentBid: newBid,
    });

    return ApiResponseHelper.success(newBid);
  }

  async decrementBid(): Promise<ApiResponse<number>> {
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get auction state');
    }

    const state = stateResponse.data;
    const playerBasePrice = state.currentPlayer?.basePrice || this.minimumBid;
    const newBid = Math.max(playerBasePrice, state.currentBid - this.bidIncrement);

    await this.auctionRepo.setState({
      previousBid: state.currentBid,
      currentBid: newBid,
    });

    return ApiResponseHelper.success(newBid);
  }

  async resetBid(): Promise<ApiResponse<number>> {
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get auction state');
    }

    const basePrice = stateResponse.data.currentPlayer?.basePrice || this.minimumBid;

    await this.auctionRepo.setState({
      currentBid: basePrice,
      previousBid: stateResponse.data.currentBid,
      selectedTeam: null,
      bidHistory: [],
    });

    return ApiResponseHelper.success(basePrice);
  }

  async getCurrentBid(): Promise<ApiResponse<number>> {
    const stateResponse = await this.auctionRepo.getState();
    return ApiResponseHelper.success(stateResponse.data?.currentBid || 0);
  }

  async getCurrentTeam(): Promise<ApiResponse<ITeam | null>> {
    const stateResponse = await this.auctionRepo.getState();
    return ApiResponseHelper.success(stateResponse.data?.selectedTeam || null);
  }

  async getBidHistory(): Promise<ApiResponse<IBid[]>> {
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data?.currentPlayer) {
      return ApiResponseHelper.success([]);
    }

    const historyResponse = await this.bidRepo.getAllBidsForPlayer(
      stateResponse.data.currentPlayer.id
    );
    return historyResponse;
  }

  async getMaxBidForTeam(team: ITeam): Promise<ApiResponse<number>> {
    const reserveNeeded = (team.remainingPlayers - 1) * this.minimumBid;
    const maxBid = Math.max(0, team.remainingPurse - reserveNeeded);
    return ApiResponseHelper.success(maxBid);
  }

  async getEligibleTeams(): Promise<ApiResponse<ITeam[]>> {
    return this.teamRepo.getEligible(this.minimumBid);
  }

  async validateBid(amount: number, team: ITeam): Promise<BidValidationResponse> {
    const results = [];

    // Get current state
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      results.push(ValidationHelper.critical('Failed to get auction state', 'RULE_007'));
      return {
        ...ValidationHelper.aggregate(results),
        suggestedAmount: this.minimumBid,
      };
    }

    const state = stateResponse.data;
    const player = state.currentPlayer;

    if (!player) {
      results.push(ValidationHelper.critical('No player is being auctioned', 'RULE_007'));
    }

    // Check minimum bid
    if (amount < this.minimumBid) {
      results.push(ValidationHelper.critical(
        `Bid must be at least ${formatBidCurrency(this.minimumBid)}`,
        'RULE_001'
      ));
    }

    // Check if higher than current
    if (amount <= state.currentBid) {
      results.push(ValidationHelper.critical(
        `Bid must be higher than current bid of ${formatBidCurrency(state.currentBid)}`,
        'RULE_005'
      ));
    }

    // Check team capacity
    if (team.playersBought >= team.totalPlayerThreshold) {
      results.push(ValidationHelper.critical(
        `${team.name} has reached maximum player limit`,
        'RULE_002'
      ));
    }

    // Check team purse
    const maxBid = (await this.getMaxBidForTeam(team)).data || 0;
    if (amount > maxBid) {
      results.push(ValidationHelper.critical(
        `${team.name} cannot afford this bid. Max: ${formatBidCurrency(maxBid)}`,
        'RULE_003'
      ));
    }

    // Check under-age limit
    if (player && player.age !== null && player.age < 19) {
      if (team.underAgePlayers >= this.maxUnderAge) {
        results.push(ValidationHelper.critical(
          `${team.name} has reached under-age player limit`,
          'RULE_004'
        ));
      }
    }

    // Check same team consecutive bid (warning only)
    if (state.selectedTeam?.id === team.id) {
      results.push(ValidationHelper.warning(
        `${team.name} is already the highest bidder`,
        'RULE_010'
      ));
    }

    const response = ValidationHelper.aggregate(
      results.length > 0 ? results : [ValidationHelper.valid()]
    ) as BidValidationResponse;

    // Add suggested amounts
    response.suggestedAmount = state.currentBid + this.bidIncrement;
    response.maxAllowedBid = maxBid;
    response.minRequiredBid = state.currentBid + this.bidIncrement;

    return response;
  }

  async canTeamBid(team: ITeam): Promise<ApiResponse<boolean>> {
    // Check if team is full
    if (team.playersBought >= team.totalPlayerThreshold) {
      return ApiResponseHelper.success(false);
    }

    // Check if team has budget
    const maxBid = (await this.getMaxBidForTeam(team)).data || 0;
    if (maxBid <= 0) {
      return ApiResponseHelper.success(false);
    }

    // Get current state
    const stateResponse = await this.auctionRepo.getState();
    if (!stateResponse.success || !stateResponse.data) {
      return ApiResponseHelper.success(false);
    }

    // Check if team can afford next bid
    const state = stateResponse.data;
    const nextBid = state.currentBid + this.bidIncrement;
    
    return ApiResponseHelper.success(maxBid >= nextBid);
  }

  /**
   * Quick bid for team (used by keyboard shortcuts)
   */
  async quickBid(teamIndex: number, multiplier: number = 1): Promise<ApiResponse<BidResponseDTO>> {
    const teamsResponse = await this.getEligibleTeams();
    if (!teamsResponse.success || !teamsResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.TEAM_NOT_FOUND, 'Failed to get teams');
    }

    const teams = teamsResponse.data;
    if (teamIndex < 0 || teamIndex >= teams.length) {
      return ApiResponseHelper.error(ApiErrorCodes.TEAM_NOT_FOUND, 'Invalid team index');
    }

    return this.raiseBid(teams[teamIndex], multiplier);
  }
}

// Singleton instance
export const bidController = new BidController();
