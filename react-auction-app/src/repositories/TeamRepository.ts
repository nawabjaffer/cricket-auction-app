// ============================================================================
// TEAM REPOSITORY - Data Access Layer for Teams
// Handles all team data operations with validation
// ============================================================================

import type { ITeam, ITeamStatus } from '../models/domain/Team';
import type { TeamStatsDTO } from '../models/dto/TeamDTO';
import { TeamDTOTransformer } from '../models/dto/TeamDTO';
import type { ApiResponse } from '../models/responses/ApiResponse';
import { ApiResponseHelper, ApiErrorCodes } from '../models/responses/ApiResponse';

/**
 * Team repository interface
 */
export interface ITeamRepository {
  // Read operations
  getAll(): Promise<ApiResponse<ITeam[]>>;
  getById(id: string): Promise<ApiResponse<ITeam | null>>;
  getByName(name: string): Promise<ApiResponse<ITeam | null>>;
  getEligible(minimumBid: number): Promise<ApiResponse<ITeam[]>>;
  getStatus(teamId: string, minimumBid: number, maxUnderAge: number): Promise<ApiResponse<ITeamStatus | null>>;
  
  // Write operations
  setTeams(teams: ITeam[]): Promise<ApiResponse<void>>;
  updateTeam(team: ITeam): Promise<ApiResponse<ITeam>>;
  updateAfterPurchase(teamId: string, amount: number, isUnderAge: boolean): Promise<ApiResponse<ITeam>>;
  resetTeamPurchases(): Promise<ApiResponse<void>>;
  
  // Stats
  getAllStats(): Promise<ApiResponse<TeamStatsDTO[]>>;
  
  // Sync
  sync(): Promise<ApiResponse<void>>;
}

/**
 * In-memory team repository implementation
 */
export class TeamRepository implements ITeamRepository {
  private teams: ITeam[] = [];

  // Store reference for syncing with Zustand
  private storeRef: {
    getState: () => { teams: ITeam[] };
    setState: (state: Partial<{ teams: ITeam[] }>) => void;
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
    this.teams = [...state.teams];
  }

  /**
   * Sync local cache to store
   */
  private syncToStore(): void {
    if (!this.storeRef) return;
    this.storeRef.setState({ teams: this.teams });
  }

  async getAll(): Promise<ApiResponse<ITeam[]>> {
    this.syncFromStore();
    return ApiResponseHelper.success([...this.teams]);
  }

  async getById(id: string): Promise<ApiResponse<ITeam | null>> {
    this.syncFromStore();
    const team = this.teams.find(t => t.id === id) || null;
    return ApiResponseHelper.success(team);
  }

  async getByName(name: string): Promise<ApiResponse<ITeam | null>> {
    this.syncFromStore();
    const team = this.teams.find(t => t.name === name) || null;
    return ApiResponseHelper.success(team);
  }

  async getEligible(minimumBid: number): Promise<ApiResponse<ITeam[]>> {
    this.syncFromStore();
    
    const eligible = this.teams.filter(team => {
      const isFull = team.playersBought >= team.totalPlayerThreshold;
      if (isFull) return false;

      const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
      const maxBid = team.remainingPurse - reserveNeeded;
      return maxBid > 0;
    });

    return ApiResponseHelper.success(eligible);
  }

  async getStatus(
    teamId: string,
    minimumBid: number,
    maxUnderAge: number
  ): Promise<ApiResponse<ITeamStatus | null>> {
    this.syncFromStore();
    
    const team = this.teams.find(t => t.id === teamId);
    if (!team) {
      return ApiResponseHelper.success(null);
    }

    const isFull = team.playersBought >= team.totalPlayerThreshold;
    const hasUnderAgeLimit = team.underAgePlayers >= maxUnderAge;
    const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
    const maxBid = Math.max(0, team.remainingPurse - reserveNeeded);
    const canBid = !isFull && maxBid > 0;

    const reasons: string[] = [];
    if (isFull) reasons.push('Team is full');
    if (maxBid <= 0) reasons.push('Insufficient purse');
    if (hasUnderAgeLimit) reasons.push('Under-age limit reached');

    let status: 'safe' | 'warning' | 'danger' = 'safe';
    if (isFull || maxBid <= 0) {
      status = 'danger';
    } else if (team.remainingPlayers <= 2 || team.remainingPurse < minimumBid * 3) {
      status = 'warning';
    }

    return ApiResponseHelper.success({
      status,
      isFull,
      hasUnderAgeLimit,
      maxBid,
      canBid,
      reasons,
    });
  }

  async setTeams(teams: ITeam[]): Promise<ApiResponse<void>> {
    this.teams = [...teams];
    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async updateTeam(team: ITeam): Promise<ApiResponse<ITeam>> {
    this.syncFromStore();
    
    const index = this.teams.findIndex(t => t.id === team.id);
    if (index === -1) {
      return ApiResponseHelper.error(
        ApiErrorCodes.TEAM_NOT_FOUND,
        `Team with id ${team.id} not found`
      );
    }

    this.teams[index] = team;
    this.syncToStore();

    return ApiResponseHelper.success(team);
  }

  async updateAfterPurchase(
    teamId: string,
    amount: number,
    isUnderAge: boolean
  ): Promise<ApiResponse<ITeam>> {
    this.syncFromStore();
    
    const index = this.teams.findIndex(t => t.id === teamId);
    if (index === -1) {
      return ApiResponseHelper.error(
        ApiErrorCodes.TEAM_NOT_FOUND,
        `Team with id ${teamId} not found`
      );
    }

    const team = this.teams[index];
    const updatedTeam = TeamDTOTransformer.afterPurchase(team, amount, isUnderAge);
    
    this.teams[index] = updatedTeam;
    this.syncToStore();

    return ApiResponseHelper.success(updatedTeam);
  }

  async resetTeamPurchases(): Promise<ApiResponse<void>> {
    this.syncFromStore();
    
    this.teams = this.teams.map(team => ({
      ...team,
      playersBought: 0,
      remainingPlayers: team.totalPlayerThreshold,
      remainingPurse: team.allocatedAmount,
      highestBid: 0,
      underAgePlayers: 0,
    }));

    this.syncToStore();
    return ApiResponseHelper.success(undefined);
  }

  async getAllStats(): Promise<ApiResponse<TeamStatsDTO[]>> {
    this.syncFromStore();
    
    // Would need to query sold players to get accurate purchase data
    // For now, return basic stats from team data
    const stats: TeamStatsDTO[] = this.teams.map(team => ({
      teamId: team.id,
      teamName: team.name,
      playersBought: team.playersBought,
      remainingPlayers: team.remainingPlayers,
      spentAmount: team.allocatedAmount - team.remainingPurse,
      remainingPurse: team.remainingPurse,
      highestBid: team.highestBid,
      averageBid: team.playersBought > 0 
        ? (team.allocatedAmount - team.remainingPurse) / team.playersBought 
        : 0,
      underAgePlayers: team.underAgePlayers,
    }));

    return ApiResponseHelper.success(stats);
  }

  async sync(): Promise<ApiResponse<void>> {
    this.syncFromStore();
    return ApiResponseHelper.success(undefined);
  }

  /**
   * Calculate max bid for a team
   */
  getMaxBidForTeam(team: ITeam, minimumBid: number): number {
    const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
    return Math.max(0, team.remainingPurse - reserveNeeded);
  }
}

// Singleton instance
export const teamRepository = new TeamRepository();
