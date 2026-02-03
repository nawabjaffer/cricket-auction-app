// ============================================================================
// AUCTION DOMAIN MODEL
// Core auction state and configuration
// ============================================================================

import type { IPlayer, ISoldPlayer, IUnsoldPlayer } from './Player';
import type { ITeam } from './Team';

/**
 * Auction configuration settings
 */
export interface IAuctionConfig {
  readonly minimumBid: number;
  readonly bidIncrement: number;
  readonly maxUnderAgePlayers: number;
  readonly maxRounds: number;
  readonly autoSelectNext: boolean;
  readonly soundEnabled: boolean;
  readonly webhookEnabled: boolean;
}

/**
 * Auction round information
 */
export interface IAuctionRound {
  readonly roundNumber: number;
  readonly isActive: boolean;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly playersAuctioned: number;
  readonly playersSold: number;
  readonly playersUnsold: number;
}

/**
 * Current auction state snapshot
 */
export interface IAuctionState {
  readonly currentPlayer: IPlayer | null;
  readonly currentBid: number;
  readonly previousBid: number;
  readonly selectedTeam: ITeam | null;
  readonly bidHistory: IBidHistoryEntry[];
  readonly isActive: boolean;
  readonly isPaused: boolean;
  readonly currentRound: number;
}

/**
 * Bid history entry
 */
export interface IBidHistoryEntry {
  readonly teamId: string;
  readonly teamName: string;
  readonly amount: number;
  readonly timestamp: string;
}

/**
 * Selection mode for picking next player
 */
export type SelectionMode = 'sequential' | 'random';

/**
 * Overlay types for auction UI
 */
export type OverlayType = 'sold' | 'unsold' | 'end' | 'teams' | null;

/**
 * Auction summary statistics
 */
export interface IAuctionSummary {
  readonly totalPlayers: number;
  readonly playersSold: number;
  readonly playersUnsold: number;
  readonly playersRemaining: number;
  readonly totalRevenue: number;
  readonly averageSalePrice: number;
  readonly highestSale: { player: ISoldPlayer; amount: number } | null;
  readonly lowestSale: { player: ISoldPlayer; amount: number } | null;
  readonly mostActiveTeam: { team: ITeam; purchases: number } | null;
}

/**
 * Auction domain class with business logic
 */
export class AuctionModel {
  private readonly config: IAuctionConfig;
  private state: IAuctionState;
  private readonly availablePlayers: IPlayer[];
  private readonly soldPlayers: ISoldPlayer[];
  private readonly unsoldPlayers: IUnsoldPlayer[];
  private readonly teams: ITeam[];

  constructor(
    config: IAuctionConfig,
    state: IAuctionState,
    availablePlayers: IPlayer[],
    soldPlayers: ISoldPlayer[],
    unsoldPlayers: IUnsoldPlayer[],
    teams: ITeam[]
  ) {
    this.config = config;
    this.state = state;
    this.availablePlayers = availablePlayers;
    this.soldPlayers = soldPlayers;
    this.unsoldPlayers = unsoldPlayers;
    this.teams = teams;
  }

  /**
   * Get current auction state
   */
  getState(): IAuctionState {
    return { ...this.state };
  }

  /**
   * Get auction configuration
   */
  getConfig(): IAuctionConfig {
    return { ...this.config };
  }

  /**
   * Check if auction is currently active
   */
  isActive(): boolean {
    return this.state.isActive && !this.state.isPaused;
  }

  /**
   * Check if current player can be sold
   */
  canSell(): boolean {
    return (
      this.state.currentPlayer !== null &&
      this.state.selectedTeam !== null &&
      this.state.currentBid > 0
    );
  }

  /**
   * Check if current player can be marked unsold
   */
  canMarkUnsold(): boolean {
    return this.state.currentPlayer !== null;
  }

  /**
   * Check if there are more players to auction
   */
  hasMorePlayers(): boolean {
    return this.availablePlayers.length > 0;
  }

  /**
   * Get auction summary statistics
   */
  getSummary(): IAuctionSummary {
    const totalRevenue = this.soldPlayers.reduce((sum, p) => sum + p.soldAmount, 0);
    const sortedSold = [...this.soldPlayers].sort((a, b) => b.soldAmount - a.soldAmount);

    const teamPurchases = new Map<string, number>();
    this.soldPlayers.forEach(p => {
      const count = teamPurchases.get(p.teamName) || 0;
      teamPurchases.set(p.teamName, count + 1);
    });

    let mostActiveTeam: { team: ITeam; purchases: number } | null = null;
    let maxPurchases = 0;
    teamPurchases.forEach((count, teamName) => {
      if (count > maxPurchases) {
        const team = this.teams.find(t => t.name === teamName);
        if (team) {
          mostActiveTeam = { team, purchases: count };
          maxPurchases = count;
        }
      }
    });

    return {
      totalPlayers: this.availablePlayers.length + this.soldPlayers.length + this.unsoldPlayers.length,
      playersSold: this.soldPlayers.length,
      playersUnsold: this.unsoldPlayers.length,
      playersRemaining: this.availablePlayers.length,
      totalRevenue,
      averageSalePrice: this.soldPlayers.length > 0 ? totalRevenue / this.soldPlayers.length : 0,
      highestSale: sortedSold[0] ? { player: sortedSold[0], amount: sortedSold[0].soldAmount } : null,
      lowestSale: sortedSold.at(-1) ? { player: sortedSold.at(-1)!, amount: sortedSold.at(-1)!.soldAmount } : null,
      mostActiveTeam,
    };
  }

  /**
   * Get eligible teams that can still bid
   */
  getEligibleTeams(): ITeam[] {
    return this.teams.filter(team => {
      const isFull = team.playersBought >= team.totalPlayerThreshold;
      const reserveNeeded = (team.remainingPlayers - 1) * this.config.minimumBid;
      const maxBid = team.remainingPurse - reserveNeeded;
      return !isFull && maxBid > 0;
    });
  }

  /**
   * Calculate maximum bid for a specific team
   */
  getMaxBidForTeam(team: ITeam): number {
    const reserveNeeded = (team.remainingPlayers - 1) * this.config.minimumBid;
    return Math.max(0, team.remainingPurse - reserveNeeded);
  }

}

/**
 * Default auction configuration
 */
export function getDefaultAuctionConfig(): IAuctionConfig {
  return {
    minimumBid: 2000000,
    bidIncrement: 500000,
    maxUnderAgePlayers: 2,
    maxRounds: 3,
    autoSelectNext: true,
    soundEnabled: true,
    webhookEnabled: true,
  };
}

/**
 * Default auction state
 */
export function getDefaultAuctionState(): IAuctionState {
  return {
    currentPlayer: null,
    currentBid: 0,
    previousBid: 0,
    selectedTeam: null,
    bidHistory: [],
    isActive: false,
    isPaused: false,
    currentRound: 1,
  };
}
