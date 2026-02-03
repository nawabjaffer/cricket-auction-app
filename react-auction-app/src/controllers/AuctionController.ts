// ============================================================================
// AUCTION CONTROLLER - Business Logic for Auction Operations
// Orchestrates auction flow using repositories and services
// ============================================================================

import type { IPlayer, ISoldPlayer, IUnsoldPlayer } from '../models/domain/Player';
import type { ITeam } from '../models/domain/Team';
import type { IAuctionState, SelectionMode, OverlayType, IAuctionConfig } from '../models/domain/Auction';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper, ApiErrorCodes } from '../models/responses/ApiResponse';
import { ValidationHelper, type ValidationResponse } from '../models/responses/ValidationResponse';
import { 
  getPlayerRepository, 
  getTeamRepository, 
  getAuctionRepository,
  getBidRepository 
} from '../repositories';

/**
 * Auction controller interface
 */
export interface IAuctionController {
  // State
  getState(): Promise<ApiResponse<IAuctionState>>;
  getConfig(): Promise<ApiResponse<IAuctionConfig>>;
  
  // Player selection
  selectPlayer(player: IPlayer): Promise<ApiResponse<void>>;
  selectNextPlayer(): Promise<ApiResponse<IPlayer | null>>;
  selectRandomPlayer(): Promise<ApiResponse<IPlayer | null>>;
  clearCurrentPlayer(): Promise<ApiResponse<void>>;
  jumpToPlayer(playerId: string): Promise<ApiResponse<IPlayer | null>>;
  
  // Auction outcomes
  markAsSold(player: IPlayer, team: ITeam, amount: number): Promise<ApiResponse<ISoldPlayer>>;
  markAsUnsold(player: IPlayer): Promise<ApiResponse<IUnsoldPlayer>>;
  moveUnsoldToSold(player: IUnsoldPlayer, team: ITeam, amount: number): Promise<ApiResponse<ISoldPlayer>>;
  undoLastAction(): Promise<ApiResponse<void>>;
  
  // Round management
  getCurrentRound(): Promise<ApiResponse<number>>;
  startNextRound(): Promise<ApiResponse<void>>;
  startRound2(): Promise<ApiResponse<void>>;
  
  // Selection mode
  getSelectionMode(): Promise<ApiResponse<SelectionMode>>;
  setSelectionMode(mode: SelectionMode): Promise<ApiResponse<void>>;
  toggleSelectionMode(): Promise<ApiResponse<SelectionMode>>;
  
  // Overlay
  setOverlay(overlay: OverlayType): Promise<ApiResponse<void>>;
  closeOverlay(): Promise<ApiResponse<void>>;
  
  // Auction lifecycle
  reset(): Promise<ApiResponse<void>>;
  saveSnapshot(): Promise<ApiResponse<string>>;
  restoreSnapshot(id: string): Promise<ApiResponse<void>>;
  
  // Validation
  validateSell(player: IPlayer, team: ITeam, amount: number): Promise<ValidationResponse>;
  canSelectNextPlayer(): Promise<ApiResponse<boolean>>;
}

/**
 * Auction controller implementation
 */
export class AuctionController implements IAuctionController {
  private playerIndex = 0;
  private lastAction: { type: string; data: unknown } | null = null;

  // Repositories
  private get playerRepo() { return getPlayerRepository(); }
  private get teamRepo() { return getTeamRepository(); }
  private get auctionRepo() { return getAuctionRepository(); }
  private get bidRepo() { return getBidRepository(); }

  async getState(): Promise<ApiResponse<IAuctionState>> {
    return this.auctionRepo.getState();
  }

  async getConfig(): Promise<ApiResponse<IAuctionConfig>> {
    return this.auctionRepo.getConfig();
  }

  async selectPlayer(player: IPlayer): Promise<ApiResponse<void>> {
    // Clear previous bid history
    await this.bidRepo.clearBidsForPlayer(player.id);

    // Update state
    await this.auctionRepo.setState({
      currentPlayer: player,
      currentBid: player.basePrice,
      previousBid: 0,
      selectedTeam: null,
      bidHistory: [],
    });

    return ApiResponseHelper.success(undefined);
  }

  async selectNextPlayer(): Promise<ApiResponse<IPlayer | null>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get available players');
    }

    const available = availableResponse.data;
    if (available.length === 0) {
      return ApiResponseHelper.success(null);
    }

    const modeResponse = await this.getSelectionMode();
    const mode = modeResponse.data || 'sequential';

    let nextPlayer: IPlayer;

    if (mode === 'random') {
      const randomIndex = Math.floor(Math.random() * available.length);
      nextPlayer = available[randomIndex];
    } else {
      // Sequential
      if (this.playerIndex >= available.length) {
        this.playerIndex = 0;
      }
      nextPlayer = available[this.playerIndex];
      this.playerIndex++;
    }

    await this.selectPlayer(nextPlayer);
    return ApiResponseHelper.success(nextPlayer);
  }

  async selectRandomPlayer(): Promise<ApiResponse<IPlayer | null>> {
    const availableResponse = await this.playerRepo.getAvailable();
    if (!availableResponse.success || !availableResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'Failed to get available players');
    }

    const available = availableResponse.data;
    if (available.length === 0) {
      return ApiResponseHelper.success(null);
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const player = available[randomIndex];
    
    await this.selectPlayer(player);
    return ApiResponseHelper.success(player);
  }

  async clearCurrentPlayer(): Promise<ApiResponse<void>> {
    await this.auctionRepo.setState({
      currentPlayer: null,
      currentBid: 0,
      previousBid: 0,
      selectedTeam: null,
      bidHistory: [],
    });
    
    return ApiResponseHelper.success(undefined);
  }

  async jumpToPlayer(playerId: string): Promise<ApiResponse<IPlayer | null>> {
    const playerResponse = await this.playerRepo.getById(playerId);
    if (!playerResponse.success) {
      return ApiResponseHelper.error(ApiErrorCodes.PLAYER_NOT_FOUND, 'Player not found');
    }

    const player = playerResponse.data || null;
    if (player) {
      await this.selectPlayer(player);
    }

    return ApiResponseHelper.success(player);
  }

  async markAsSold(
    player: IPlayer,
    team: ITeam,
    amount: number
  ): Promise<ApiResponse<ISoldPlayer>> {
    // Validate sale
    const validation = await this.validateSell(player, team, amount);
    if (!validation.valid) {
      return ApiResponseHelper.error(
        ApiErrorCodes.VALIDATION_ERROR,
        ValidationHelper.getErrorMessages(validation).join(', ')
      );
    }

    // Store last action for undo
    this.lastAction = {
      type: 'sold',
      data: { player, team, amount },
    };

    // Mark player as sold
    const isUnderAge = player.age !== null && player.age < 19;
    const soldResponse = await this.playerRepo.markAsSold(player, team.name, team.id, amount);
    if (!soldResponse.success) {
      return soldResponse as ApiResponse<ISoldPlayer>;
    }

    // Update team
    await this.teamRepo.updateAfterPurchase(team.id, amount, isUnderAge);

    // Clear current player
    await this.clearCurrentPlayer();

    // Set overlay
    await this.setOverlay('sold');

    return soldResponse;
  }

  async markAsUnsold(player: IPlayer): Promise<ApiResponse<IUnsoldPlayer>> {
    const roundResponse = await this.getCurrentRound();
    const round = `Round ${roundResponse.data || 1}`;

    // Store last action for undo
    this.lastAction = {
      type: 'unsold',
      data: { player, round },
    };

    // Mark player as unsold
    const unsoldResponse = await this.playerRepo.markAsUnsold(player, round);
    if (!unsoldResponse.success) {
      return unsoldResponse as ApiResponse<IUnsoldPlayer>;
    }

    // Clear current player
    await this.clearCurrentPlayer();

    // Set overlay
    await this.setOverlay('unsold');

    return unsoldResponse;
  }

  async moveUnsoldToSold(
    player: IUnsoldPlayer,
    team: ITeam,
    amount: number
  ): Promise<ApiResponse<ISoldPlayer>> {
    // Validate sale
    const validation = await this.validateSell(player, team, amount);
    if (!validation.valid) {
      return ApiResponseHelper.error(
        ApiErrorCodes.VALIDATION_ERROR,
        ValidationHelper.getErrorMessages(validation).join(', ')
      );
    }

    // Store last action
    this.lastAction = {
      type: 'moveUnsoldToSold',
      data: { player, team, amount },
    };

    // Move player
    const isUnderAge = player.age !== null && player.age < 19;
    const soldResponse = await this.playerRepo.moveUnsoldToSold(player, team.name, team.id, amount);
    if (!soldResponse.success) {
      return soldResponse as ApiResponse<ISoldPlayer>;
    }

    // Update team
    await this.teamRepo.updateAfterPurchase(team.id, amount, isUnderAge);

    return soldResponse;
  }

  async undoLastAction(): Promise<ApiResponse<void>> {
    if (!this.lastAction) {
      return ApiResponseHelper.error(ApiErrorCodes.UNKNOWN_ERROR, 'No action to undo');
    }

    // For now, just close the overlay
    // Full undo would require more complex state management
    await this.closeOverlay();
    this.lastAction = null;

    return ApiResponseHelper.success(undefined);
  }

  async getCurrentRound(): Promise<ApiResponse<number>> {
    return this.auctionRepo.getCurrentRound();
  }

  async startNextRound(): Promise<ApiResponse<void>> {
    const currentRound = (await this.getCurrentRound()).data || 1;
    await this.auctionRepo.setRound(currentRound + 1);

    // Move unsold players back to available (implementation would depend on business rules)
    // For now, just increment round

    return ApiResponseHelper.success(undefined);
  }

  async startRound2(): Promise<ApiResponse<void>> {
    await this.auctionRepo.setRound(2);
    
    // Get unsold players and move to available
    const unsoldResponse = await this.playerRepo.getUnsold();
    if (unsoldResponse.success && unsoldResponse.data) {
      // Logic to move unsold back to available would go here
    }

    return ApiResponseHelper.success(undefined);
  }

  async getSelectionMode(): Promise<ApiResponse<SelectionMode>> {
    return this.auctionRepo.getSelectionMode();
  }

  async setSelectionMode(mode: SelectionMode): Promise<ApiResponse<void>> {
    return this.auctionRepo.setSelectionMode(mode);
  }

  async toggleSelectionMode(): Promise<ApiResponse<SelectionMode>> {
    const currentMode = (await this.getSelectionMode()).data || 'sequential';
    const newMode: SelectionMode = currentMode === 'sequential' ? 'random' : 'sequential';
    await this.setSelectionMode(newMode);
    return ApiResponseHelper.success(newMode);
  }

  async setOverlay(overlay: OverlayType): Promise<ApiResponse<void>> {
    return this.auctionRepo.setActiveOverlay(overlay);
  }

  async closeOverlay(): Promise<ApiResponse<void>> {
    return this.auctionRepo.setActiveOverlay(null);
  }

  async reset(): Promise<ApiResponse<void>> {
    // Reset all repositories
    await this.bidRepo.clearAllBids();
    await this.teamRepo.resetTeamPurchases();
    
    // Reset auction state
    await this.auctionRepo.setState({
      currentPlayer: null,
      currentBid: 0,
      previousBid: 0,
      selectedTeam: null,
      bidHistory: [],
      isActive: false,
      isPaused: false,
      currentRound: 1,
    });

    this.playerIndex = 0;
    this.lastAction = null;

    return ApiResponseHelper.success(undefined);
  }

  async saveSnapshot(): Promise<ApiResponse<string>> {
    return this.auctionRepo.save();
  }

  async restoreSnapshot(id: string): Promise<ApiResponse<void>> {
    const loadResponse = await this.auctionRepo.load(id);
    if (!loadResponse.success || !loadResponse.data) {
      return ApiResponseHelper.error(ApiErrorCodes.NOT_FOUND, 'Snapshot not found');
    }

    return this.auctionRepo.restoreSnapshot(loadResponse.data.state);
  }

  async validateSell(
    player: IPlayer,
    team: ITeam,
    amount: number
  ): Promise<ValidationResponse> {
    const results = [];
    const config = (await this.getConfig()).data;
    const minimumBid = config?.minimumBid || 2000000;
    const maxUnderAge = config?.maxUnderAgePlayers || 2;

    // Check if player exists
    if (!player) {
      results.push(ValidationHelper.critical('No player selected', 'RULE_007'));
    }

    // Check if team exists
    if (!team) {
      results.push(ValidationHelper.critical('No team selected', 'RULE_006'));
    }

    // Check amount
    if (amount < minimumBid) {
      results.push(ValidationHelper.critical(
        `Bid must be at least ${this.formatCurrency(minimumBid)}`,
        'RULE_001'
      ));
    }

    // Check team capacity
    if (team && team.playersBought >= team.totalPlayerThreshold) {
      results.push(ValidationHelper.critical(
        `${team.name} has reached maximum player limit`,
        'RULE_002'
      ));
    }

    // Check team purse
    if (team) {
      const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
      const maxBid = team.remainingPurse - reserveNeeded;
      if (amount > maxBid) {
        results.push(ValidationHelper.critical(
          `${team.name} cannot afford this bid. Max: ${this.formatCurrency(maxBid)}`,
          'RULE_003'
        ));
      }
    }

    // Check under-age limit
    if (player && team && player.age !== null && player.age < 19) {
      if (team.underAgePlayers >= maxUnderAge) {
        results.push(ValidationHelper.critical(
          `${team.name} has reached under-age player limit (${maxUnderAge})`,
          'RULE_004'
        ));
      }
    }

    return ValidationHelper.aggregate(results.length > 0 ? results : [ValidationHelper.valid()]);
  }

  async canSelectNextPlayer(): Promise<ApiResponse<boolean>> {
    const availableResponse = await this.playerRepo.getAvailable();
    const hasPlayers = availableResponse.success && 
                       availableResponse.data !== undefined && 
                       availableResponse.data.length > 0;
    return ApiResponseHelper.success(hasPlayers);
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
export const auctionController = new AuctionController();
