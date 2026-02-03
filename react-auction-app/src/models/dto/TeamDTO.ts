// ============================================================================
// TEAM DTO - Data Transfer Objects for Team operations
// Used for API requests/responses and data transformations
// ============================================================================

import type { ITeam } from '../domain/Team';

/**
 * DTO for creating a new team
 */
export interface CreateTeamDTO {
  name: string;
  logoUrl?: string;
  totalPlayerThreshold: number;
  allocatedAmount: number;
  captain?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * DTO for updating team information
 */
export interface UpdateTeamDTO {
  id: string;
  name?: string;
  logoUrl?: string;
  totalPlayerThreshold?: number;
  allocatedAmount?: number;
  captain?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * DTO for team purchase update
 */
export interface TeamPurchaseDTO {
  teamId: string;
  playerAmount: number;
  isUnderAge: boolean;
}

/**
 * DTO for team list response
 */
export interface TeamListDTO {
  teams: ITeam[];
  total: number;
}

/**
 * DTO for team stats summary
 */
export interface TeamStatsDTO {
  teamId: string;
  teamName: string;
  playersBought: number;
  remainingPlayers: number;
  spentAmount: number;
  remainingPurse: number;
  highestBid: number;
  averageBid: number;
  underAgePlayers: number;
}

/**
 * Transform functions for Team DTOs
 */
export const TeamDTOTransformer = {
  /**
   * Transform raw API data to Team interface
   */
  fromApiResponse(data: Record<string, unknown>): ITeam {
    const allocatedAmount = Number(data.allocatedAmount || data.allocated_amount || 0);
    const remainingPurse = Number(data.remainingPurse || data.remaining_purse || allocatedAmount);
    const totalPlayerThreshold = Number(data.totalPlayerThreshold || data.total_player_threshold || 25);
    const playersBought = Number(data.playersBought || data.players_bought || 0);

    return {
      id: String(data.id || ''),
      name: String(data.name || ''),
      logoUrl: String(data.logoUrl || data.logo_url || ''),
      playersBought,
      totalPlayerThreshold,
      remainingPlayers: totalPlayerThreshold - playersBought,
      allocatedAmount,
      remainingPurse,
      highestBid: Number(data.highestBid || data.highest_bid || 0),
      captain: String(data.captain || ''),
      underAgePlayers: Number(data.underAgePlayers || data.under_age_players || 0),
      primaryColor: data.primaryColor ? String(data.primaryColor) : undefined,
      secondaryColor: data.secondaryColor ? String(data.secondaryColor) : undefined,
    };
  },

  /**
   * Transform Team after purchase
   */
  afterPurchase(team: ITeam, amount: number, isUnderAge: boolean): ITeam {
    return {
      ...team,
      playersBought: team.playersBought + 1,
      remainingPlayers: team.remainingPlayers - 1,
      remainingPurse: team.remainingPurse - amount,
      highestBid: Math.max(team.highestBid, amount),
      underAgePlayers: isUnderAge ? team.underAgePlayers + 1 : team.underAgePlayers,
    };
  },

  /**
   * Transform to API request format
   */
  toApiRequest(team: ITeam): Record<string, unknown> {
    return {
      id: team.id,
      name: team.name,
      logo_url: team.logoUrl,
      players_bought: team.playersBought,
      total_player_threshold: team.totalPlayerThreshold,
      allocated_amount: team.allocatedAmount,
      remaining_purse: team.remainingPurse,
      highest_bid: team.highestBid,
      captain: team.captain,
      under_age_players: team.underAgePlayers,
      primary_color: team.primaryColor,
      secondary_color: team.secondaryColor,
    };
  },

  /**
   * Calculate team stats
   */
  toStatsDTO(team: ITeam, playerPurchases: { amount: number }[]): TeamStatsDTO {
    const totalSpent = team.allocatedAmount - team.remainingPurse;
    const avgBid = playerPurchases.length > 0
      ? playerPurchases.reduce((sum, p) => sum + p.amount, 0) / playerPurchases.length
      : 0;

    return {
      teamId: team.id,
      teamName: team.name,
      playersBought: team.playersBought,
      remainingPlayers: team.remainingPlayers,
      spentAmount: totalSpent,
      remainingPurse: team.remainingPurse,
      highestBid: team.highestBid,
      averageBid: avgBid,
      underAgePlayers: team.underAgePlayers,
    };
  },
};
