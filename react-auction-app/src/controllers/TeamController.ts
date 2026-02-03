// ============================================================================
// TEAM CONTROLLER - Business Logic for Team Operations
// Orchestrates team management with validation and stats
// ============================================================================

import type { ITeam, ITeamStatus } from '../models/domain/Team';
import type { TeamStatsDTO } from '../models/dto/TeamDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper } from '../models/responses/ApiResponse';
import { getTeamRepository } from '../repositories';

/**
 * Team controller interface
 */
export interface ITeamController {
  // Query operations
  getAllTeams(): Promise<ApiResponse<ITeam[]>>;
  getTeamById(id: string): Promise<ApiResponse<ITeam | null>>;
  getTeamByName(name: string): Promise<ApiResponse<ITeam | null>>;
  getEligibleTeams(): Promise<ApiResponse<ITeam[]>>;
  getTeamStatus(teamId: string): Promise<ApiResponse<ITeamStatus | null>>;
  
  // Stats
  getAllStats(): Promise<ApiResponse<TeamStatsDTO[]>>;
  getTeamRankings(): Promise<ApiResponse<{ team: ITeam; rank: number; spent: number }[]>>;
  
  // Validation
  canTeamBid(team: ITeam, bidAmount: number): Promise<ApiResponse<{ canBid: boolean; reason?: string }>>;
  canTeamBidOnPlayer(team: ITeam, playerAge: number | null, bidAmount: number): Promise<ApiResponse<{ canBid: boolean; reason?: string }>>;
  getMaxBidForTeam(team: ITeam): Promise<ApiResponse<number>>;
  
  // Data management
  setTeams(teams: ITeam[]): Promise<ApiResponse<void>>;
  updateTeam(team: ITeam): Promise<ApiResponse<ITeam>>;
  
  // Utilities
  getTeamLogoUrl(team: ITeam): string;
  getTeamShortName(team: ITeam): string;
  formatTeamBudget(team: ITeam): { total: string; spent: string; remaining: string };
}

/**
 * Team controller implementation
 */
export class TeamController implements ITeamController {
  // Config
  private minimumBid = 2000000;
  private maxUnderAge = 2;

  private get teamRepo() { return getTeamRepository(); }

  /**
   * Configure team controller
   */
  configure(config: { minimumBid?: number; maxUnderAge?: number }): void {
    if (config.minimumBid) this.minimumBid = config.minimumBid;
    if (config.maxUnderAge) this.maxUnderAge = config.maxUnderAge;
  }

  async getAllTeams(): Promise<ApiResponse<ITeam[]>> {
    return this.teamRepo.getAll();
  }

  async getTeamById(id: string): Promise<ApiResponse<ITeam | null>> {
    return this.teamRepo.getById(id);
  }

  async getTeamByName(name: string): Promise<ApiResponse<ITeam | null>> {
    return this.teamRepo.getByName(name);
  }

  async getEligibleTeams(): Promise<ApiResponse<ITeam[]>> {
    return this.teamRepo.getEligible(this.minimumBid);
  }

  async getTeamStatus(teamId: string): Promise<ApiResponse<ITeamStatus | null>> {
    return this.teamRepo.getStatus(teamId, this.minimumBid, this.maxUnderAge);
  }

  async getAllStats(): Promise<ApiResponse<TeamStatsDTO[]>> {
    return this.teamRepo.getAllStats();
  }

  async getTeamRankings(): Promise<ApiResponse<{ team: ITeam; rank: number; spent: number }[]>> {
    const teamsResponse = await this.teamRepo.getAll();
    if (!teamsResponse.success || !teamsResponse.data) {
      return ApiResponseHelper.error('UNKNOWN_ERROR', 'Failed to get teams');
    }

    const ranked = teamsResponse.data
      .map((team: ITeam) => ({
        team,
        spent: team.allocatedAmount - team.remainingPurse,
      }))
      .sort((a: any, b: any) => b.spent - a.spent)
      .map((item: any, index: number) => ({
        ...item,
        rank: index + 1,
      }));

    return ApiResponseHelper.success(ranked);
  }

  async canTeamBid(
    team: ITeam,
    bidAmount: number
  ): Promise<ApiResponse<{ canBid: boolean; reason?: string }>> {
    // Check if team is full
    if (team.playersBought >= team.totalPlayerThreshold) {
      return ApiResponseHelper.success({
        canBid: false,
        reason: `${team.name} has reached maximum player limit (${team.totalPlayerThreshold})`,
      });
    }

    // Check budget
    const maxBid = this.calculateMaxBid(team);
    if (bidAmount > maxBid) {
      return ApiResponseHelper.success({
        canBid: false,
        reason: `${team.name} cannot afford ${this.formatCurrency(bidAmount)}. Maximum bid: ${this.formatCurrency(maxBid)}`,
      });
    }

    return ApiResponseHelper.success({ canBid: true });
  }

  async canTeamBidOnPlayer(
    team: ITeam,
    playerAge: number | null,
    bidAmount: number
  ): Promise<ApiResponse<{ canBid: boolean; reason?: string }>> {
    // First check basic bid ability
    const basicCheck = await this.canTeamBid(team, bidAmount);
    if (!basicCheck.data?.canBid) {
      return basicCheck;
    }

    // Check under-age limit
    if (playerAge !== null && playerAge < 19) {
      if (team.underAgePlayers >= this.maxUnderAge) {
        return ApiResponseHelper.success({
          canBid: false,
          reason: `${team.name} has reached under-age player limit (${this.maxUnderAge})`,
        });
      }
    }

    return ApiResponseHelper.success({ canBid: true });
  }

  async getMaxBidForTeam(team: ITeam): Promise<ApiResponse<number>> {
    return ApiResponseHelper.success(this.calculateMaxBid(team));
  }

  async setTeams(teams: ITeam[]): Promise<ApiResponse<void>> {
    return this.teamRepo.setTeams(teams);
  }

  async updateTeam(team: ITeam): Promise<ApiResponse<ITeam>> {
    return this.teamRepo.updateTeam(team);
  }

  getTeamLogoUrl(team: ITeam): string {
    if (team.logoUrl?.trim()) {
      return team.logoUrl;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(team.name)}&background=1a1a2e&color=fff&size=64`;
  }

  getTeamShortName(team: ITeam): string {
    return team.name.substring(0, 3).toUpperCase();
  }

  formatTeamBudget(team: ITeam): { total: string; spent: string; remaining: string } {
    const spent = team.allocatedAmount - team.remainingPurse;
    return {
      total: this.formatCurrency(team.allocatedAmount),
      spent: this.formatCurrency(spent),
      remaining: this.formatCurrency(team.remainingPurse),
    };
  }

  /**
   * Get team capacity info
   */
  getTeamCapacity(team: ITeam): { 
    bought: number; 
    remaining: number; 
    total: number; 
    percentage: number;
    isFull: boolean;
  } {
    const percentage = (team.playersBought / team.totalPlayerThreshold) * 100;
    return {
      bought: team.playersBought,
      remaining: team.remainingPlayers,
      total: team.totalPlayerThreshold,
      percentage,
      isFull: team.playersBought >= team.totalPlayerThreshold,
    };
  }

  /**
   * Get teams that can still participate
   */
  async getActiveTeams(): Promise<ApiResponse<ITeam[]>> {
    const teamsResponse = await this.teamRepo.getAll();
    if (!teamsResponse.success || !teamsResponse.data) {
      return teamsResponse;
    }

    const active = teamsResponse.data.filter((team: any) => {
      const isFull = team.playersBought >= team.totalPlayerThreshold;
      const hasBudget = this.calculateMaxBid(team) > 0;
      return !isFull && hasBudget;
    });

    return ApiResponseHelper.success(active);
  }

  /**
   * Get teams sorted by remaining budget
   */
  async getTeamsByBudget(ascending: boolean = false): Promise<ApiResponse<ITeam[]>> {
    const teamsResponse = await this.teamRepo.getAll();
    if (!teamsResponse.success || !teamsResponse.data) {
      return teamsResponse;
    }

    const sorted = [...teamsResponse.data].sort((a, b) => {
      const diff = a.remainingPurse - b.remainingPurse;
      return ascending ? diff : -diff;
    });

    return ApiResponseHelper.success(sorted);
  }

  /**
   * Calculate maximum bid helper
   */
  private calculateMaxBid(team: ITeam): number {
    const reserveNeeded = (team.remainingPlayers - 1) * this.minimumBid;
    return Math.max(0, team.remainingPurse - reserveNeeded);
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
export const teamController = new TeamController();
