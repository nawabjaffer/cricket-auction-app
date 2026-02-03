// ============================================================================
// TEAM DOMAIN MODEL
// Core team entity with business logic methods
// ============================================================================

/**
 * Team domain model representing a franchise in the auction
 */
export interface ITeam {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string;
  readonly playersBought: number;
  readonly totalPlayerThreshold: number;
  readonly remainingPlayers: number;
  readonly allocatedAmount: number;
  readonly remainingPurse: number;
  readonly highestBid: number;
  readonly captain: string;
  readonly underAgePlayers: number;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
}

/**
 * Team status for validation
 */
export interface ITeamStatus {
  readonly status: 'safe' | 'warning' | 'danger';
  readonly isFull: boolean;
  readonly hasUnderAgeLimit: boolean;
  readonly maxBid: number;
  readonly canBid: boolean;
  readonly reasons: string[];
}

/**
 * Team statistics
 */
export interface ITeamStats {
  readonly name: string;
  readonly playersBought: number;
  readonly remainingPlayers: number;
  readonly remainingPurse: number;
  readonly highestBid: number;
  readonly underAgePlayers: number;
}

/**
 * Team domain class with business logic
 */
export class TeamModel implements ITeam {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string;
  readonly playersBought: number;
  readonly totalPlayerThreshold: number;
  readonly remainingPlayers: number;
  readonly allocatedAmount: number;
  readonly remainingPurse: number;
  readonly highestBid: number;
  readonly captain: string;
  readonly underAgePlayers: number;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;

  constructor(
    id: string,
    name: string,
    logoUrl: string,
    playersBought: number,
    totalPlayerThreshold: number,
    remainingPlayers: number,
    allocatedAmount: number,
    remainingPurse: number,
    highestBid: number,
    captain: string,
    underAgePlayers: number,
    primaryColor?: string,
    secondaryColor?: string
  ) {
    this.id = id;
    this.name = name;
    this.logoUrl = logoUrl;
    this.playersBought = playersBought;
    this.totalPlayerThreshold = totalPlayerThreshold;
    this.remainingPlayers = remainingPlayers;
    this.allocatedAmount = allocatedAmount;
    this.remainingPurse = remainingPurse;
    this.highestBid = highestBid;
    this.captain = captain;
    this.underAgePlayers = underAgePlayers;
    this.primaryColor = primaryColor;
    this.secondaryColor = secondaryColor;
  }

  /**
   * Check if team can participate in bidding
   */
  canBid(): boolean {
    return !this.isFull() && this.remainingPurse > 0;
  }

  /**
   * Check if team has reached max player limit
   */
  isFull(): boolean {
    return this.playersBought >= this.totalPlayerThreshold;
  }

  /**
   * Check if team has reached under-age player limit
   */
  hasReachedUnderAgeLimit(maxUnderAge: number = 2): boolean {
    return this.underAgePlayers >= maxUnderAge;
  }

  /**
   * Calculate maximum bid amount team can make
   * Must reserve minimum amount for remaining player slots
   */
  getMaxBid(minimumBid: number = 2000000): number {
    const reserveNeeded = (this.remainingPlayers - 1) * minimumBid;
    return Math.max(0, this.remainingPurse - reserveNeeded);
  }

  /**
   * Check if team can afford a specific bid amount
   */
  canAfford(amount: number, minimumBid: number = 2000000): boolean {
    return amount <= this.getMaxBid(minimumBid);
  }

  /**
   * Get team status for UI display
   */
  getStatus(minimumBid: number = 2000000, maxUnderAge: number = 2): ITeamStatus {
    const maxBid = this.getMaxBid(minimumBid);
    const isFull = this.isFull();
    const hasUnderAgeLimit = this.hasReachedUnderAgeLimit(maxUnderAge);
    const canBid = !isFull && maxBid > 0;

    const reasons: string[] = [];
    if (isFull) reasons.push('Team is full');
    if (maxBid <= 0) reasons.push('Insufficient purse');
    if (hasUnderAgeLimit) reasons.push('Under-age limit reached');

    let status: 'safe' | 'warning' | 'danger' = 'safe';
    if (isFull || maxBid <= 0) {
      status = 'danger';
    } else if (this.remainingPlayers <= 2 || this.remainingPurse < minimumBid * 3) {
      status = 'warning';
    }

    return { status, isFull, hasUnderAgeLimit, maxBid, canBid, reasons };
  }

  /**
   * Get team's short name (first 3 characters)
   */
  getShortName(): string {
    return this.name.substring(0, 3).toUpperCase();
  }

  /**
   * Get team logo URL with fallback
   */
  getLogoUrl(): string {
    if (this.logoUrl?.trim()) {
      return this.logoUrl;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=1a1a2e&color=fff&size=64`;
  }

}

/**
 * Create TeamModel from plain object
 */
export function createTeamFromObject(obj: ITeam): TeamModel {
  return new TeamModel(
    obj.id,
    obj.name,
    obj.logoUrl,
    obj.playersBought,
    obj.totalPlayerThreshold,
    obj.remainingPlayers,
    obj.allocatedAmount,
    obj.remainingPurse,
    obj.highestBid,
    obj.captain,
    obj.underAgePlayers,
    obj.primaryColor,
    obj.secondaryColor
  );
}
