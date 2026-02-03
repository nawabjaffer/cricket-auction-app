// ============================================================================
// BID DOMAIN MODEL
// Core bid entity with validation and business logic
// ============================================================================

import type { ITeam } from './Team';
import type { IPlayer } from './Player';

/**
 * Bid event types
 */
export type BidEventType = 'raise' | 'stop' | 'retract';

/**
 * Bid source identification
 */
export type BidSource = 'keyboard' | 'mobile' | 'admin' | 'api';

/**
 * Bid interface
 */
export interface IBid {
  readonly id: string;
  readonly playerId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly type: BidEventType;
  readonly source: BidSource;
  readonly clientId: string;
}

/**
 * Bid validation result
 */
export interface IBidValidation {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

/**
 * Bid history entry for display
 */
export interface IBidHistoryDisplay {
  readonly bid: IBid;
  readonly isWinning: boolean;
  readonly rank: number;
}

/**
 * Bid domain class with business logic
 */
export class BidModel implements IBid {
  readonly id: string;
  readonly playerId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly amount: number;
  readonly timestamp: number;
  readonly type: BidEventType;
  readonly source: BidSource;
  readonly clientId: string;

  constructor(
    id: string,
    playerId: string,
    teamId: string,
    teamName: string,
    amount: number,
    timestamp: number,
    type: BidEventType,
    source: BidSource,
    clientId: string
  ) {
    this.id = id;
    this.playerId = playerId;
    this.teamId = teamId;
    this.teamName = teamName;
    this.amount = amount;
    this.timestamp = timestamp;
    this.type = type;
    this.source = source;
    this.clientId = clientId;
  }

  /**
   * Convert to plain object
   */
  toObject(): IBid {
    return {
      id: this.id,
      playerId: this.playerId,
      teamId: this.teamId,
      teamName: this.teamName,
      amount: this.amount,
      timestamp: this.timestamp,
      type: this.type,
      source: this.source,
      clientId: this.clientId,
    };
  }

  /**
   * Get formatted amount
   */
  getFormattedAmount(): string {
    return formatBidCurrency(this.amount);
  }

  /**
   * Get relative time string
   */
  getRelativeTime(): string {
    const seconds = Math.floor((Date.now() - this.timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }
}

/**
 * Generate unique bid ID
 */
export function generateBidId(): string {
  return `bid_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create a new bid
 */
export function createBid(
  player: IPlayer,
  team: ITeam,
  amount: number,
  type: BidEventType = 'raise',
  source: BidSource = 'keyboard',
  clientId: string = 'default'
): BidModel {
  return new BidModel(
    generateBidId(),
    player.id,
    team.id,
    team.name,
    amount,
    Date.now(),
    type,
    source,
    clientId
  );
}

/**
 * Validate a bid against rules
 */
export function validateBid(
  bid: IBid,
  team: ITeam,
  player: IPlayer,
  currentBid: number,
  minimumBid: number,
  bidIncrement: number
): IBidValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if team is full
  if (team.playersBought >= team.totalPlayerThreshold) {
    errors.push(`${team.name} has reached maximum player limit`);
  }

  // Check minimum bid
  if (bid.amount < minimumBid) {
    errors.push(`Bid must be at least ${formatBidCurrency(minimumBid)}`);
  }

  // Check if bid is higher than current
  if (bid.amount <= currentBid) {
    errors.push(`Bid must be higher than current bid of ${formatBidCurrency(currentBid)}`);
  }

  // Check bid increment
  const expectedMinBid = currentBid + bidIncrement;
  if (bid.amount < expectedMinBid && currentBid > 0) {
    warnings.push(`Bid should be at least ${formatBidCurrency(expectedMinBid)} (current + increment)`);
  }

  // Check team purse
  const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
  const maxBid = team.remainingPurse - reserveNeeded;
  if (bid.amount > maxBid) {
    errors.push(`${team.name} cannot afford this bid. Max: ${formatBidCurrency(maxBid)}`);
  }

  // Check under-age limit
  if (player.age !== null && player.age < 19 && team.underAgePlayers >= 2) {
    errors.push(`${team.name} has reached under-age player limit`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format currency for display
 */
export function formatBidCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Parse currency string to number
 */
export function parseBidCurrency(str: string): number {
  const cleaned = str.replace(/[₹,\s]/g, '');
  if (cleaned.toLowerCase().includes('cr')) {
    return parseFloat(cleaned) * 10000000;
  }
  if (cleaned.toLowerCase().includes('l')) {
    return parseFloat(cleaned) * 100000;
  }
  return parseFloat(cleaned) || 0;
}
