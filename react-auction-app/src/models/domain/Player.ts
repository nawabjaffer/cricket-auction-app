// ============================================================================
// PLAYER DOMAIN MODEL
// Core player entity with business logic methods
// ============================================================================

import type { PlayerRole } from '../../types';

/**
 * Player domain model representing a cricket player in the auction
 */
export interface IPlayer {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly role: PlayerRole;
  readonly age: number | null;
  readonly matches: string;
  readonly runs: string;
  readonly wickets: string;
  readonly battingBestFigures: string;
  readonly bowlingBestFigures: string;
  readonly basePrice: number;
  readonly dateOfBirth?: string;
}

/**
 * Sold player with sale details
 */
export interface ISoldPlayer extends IPlayer {
  readonly soldAmount: number;
  readonly teamName: string;
  readonly teamId?: string;
  readonly soldDate: string;
}

/**
 * Unsold player with round information
 */
export interface IUnsoldPlayer extends IPlayer {
  readonly round: string;
  readonly unsoldDate: string;
}

/**
 * Player statistics summary
 */
export interface IPlayerStats {
  readonly total: number;
  readonly available: number;
  readonly sold: number;
  readonly unsold: number;
  readonly percentageSold: number;
  readonly totalRevenue: number;
  readonly averageSalePrice: number;
}

/**
 * Player domain class with business logic
 */
export class PlayerModel implements IPlayer {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly role: PlayerRole;
  readonly age: number | null;
  readonly matches: string;
  readonly runs: string;
  readonly wickets: string;
  readonly battingBestFigures: string;
  readonly bowlingBestFigures: string;
  readonly basePrice: number;
  readonly dateOfBirth?: string;

  constructor(
    id: string,
    name: string,
    imageUrl: string,
    role: PlayerRole,
    age: number | null,
    matches: string,
    runs: string,
    wickets: string,
    battingBestFigures: string,
    bowlingBestFigures: string,
    basePrice: number,
    dateOfBirth?: string
  ) {
    this.id = id;
    this.name = name;
    this.imageUrl = imageUrl;
    this.role = role;
    this.age = age;
    this.matches = matches;
    this.runs = runs;
    this.wickets = wickets;
    this.battingBestFigures = battingBestFigures;
    this.bowlingBestFigures = bowlingBestFigures;
    this.basePrice = basePrice;
    this.dateOfBirth = dateOfBirth;
  }

  /**
   * Check if player is a batsman (primary role)
   */
  isBatsman(): boolean {
    return this.role === 'Batsman' || this.role === 'Wicket-Keeper' || this.role === 'Wicket Keeper Batsman';
  }

  /**
   * Check if player is a bowler (primary role)
   */
  isBowler(): boolean {
    return this.role === 'Bowler';
  }

  /**
   * Check if player is an all-rounder
   */
  isAllRounder(): boolean {
    return this.role === 'All-Rounder';
  }

  /**
   * Check if player is under age (below 19)
   */
  isUnderAge(): boolean {
    return this.age !== null && this.age < 19;
  }

  /**
   * Get player's display avatar URL with fallback
   */
  getAvatarUrl(): string {
    if (this.imageUrl?.trim()) {
      return this.imageUrl;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.name)}&background=0D1117&color=FFFFFF&size=256`;
  }

  /**
   * Parse matches count from string
   */
  getMatchesCount(): number {
    const parsed = parseInt(this.matches, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Parse runs count from string
   */
  getRunsCount(): number {
    const parsed = parseInt(this.runs, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Parse wickets count from string
   */
  getWicketsCount(): number {
    const parsed = parseInt(this.wickets, 10);
    return isNaN(parsed) ? 0 : parsed;
  }

}

/**
 * Create PlayerModel from plain object
 */
export function createPlayerFromObject(obj: IPlayer): PlayerModel {
  return new PlayerModel(
    obj.id,
    obj.name,
    obj.imageUrl,
    obj.role,
    obj.age,
    obj.matches,
    obj.runs,
    obj.wickets,
    obj.battingBestFigures,
    obj.bowlingBestFigures,
    obj.basePrice,
    obj.dateOfBirth
  );
}
