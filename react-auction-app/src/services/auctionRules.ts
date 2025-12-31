// ============================================================================
// AUCTION RULES - Business Logic for Bid Validation
// Implements SOLID principles with single responsibility
// ============================================================================

import type { Team, ValidationResult, AuctionRulesConfig } from '../types';
import { activeConfig } from '../config';

/**
 * Auction Rules Service
 * Handles all bid validation logic based on configurable rules
 */
export class AuctionRulesService {
  private config: AuctionRulesConfig;

  constructor(config?: AuctionRulesConfig) {
    this.config = config || activeConfig.auction.rules;
  }

  // Getters for dynamic rule values
  get minimumPlayerBasePrice(): number {
    return this.config.minimumPlayerBasePrice;
  }

  get safeFundBufferPercent(): number {
    return this.config.safeFundBufferPercent;
  }

  get underAgeLimit(): number {
    return this.config.underAgeLimit;
  }

  get maxUnderAgePlayers(): number {
    return this.config.maxUnderAgePlayers;
  }

  /**
   * RULE_001 & RULE_002: Calculate maximum allowed bid for a team
   * Ensures team can afford remaining players at minimum base price
   */
  calculateMaxBid(team: Team): number {
    if (team.remainingPlayers <= 0) return 0;
    const maxBid = team.remainingPurse - (team.remainingPlayers - 1) * this.minimumPlayerBasePrice;
    return Math.max(0, maxBid);
  }

  /**
   * RULE_003: Validate total budget constraint
   * Prevents team from exceeding allocated total fund
   */
  validateTotalBudget(team: Team, bidAmount: number): boolean {
    const totalSpent = team.allocatedAmount - team.remainingPurse;
    return totalSpent + bidAmount <= team.allocatedAmount;
  }

  /**
   * RULE_004: Validate player count limit
   * Ensures team doesn't exceed total player threshold
   */
  validatePlayerCount(team: Team): boolean {
    return team.playersBought < team.totalPlayerThreshold;
  }

  /**
   * RULE_005: Validate minimum participation balance
   * Ensures team has at least base price remaining
   */
  validateMinimumBalance(team: Team, playerBasePrice: number): boolean {
    return team.remainingPurse >= playerBasePrice;
  }

  /**
   * RULE_006: Validate safe fund threshold
   * Warns if team is entering unsafe fund range
   */
  validateSafeFundThreshold(team: Team, bidAmount: number): boolean {
    if (team.remainingPlayers <= 1) return true;
    const safeThreshold = (team.remainingPlayers - 1) * this.minimumPlayerBasePrice * this.safeFundBufferPercent;
    return (team.remainingPurse - bidAmount) >= safeThreshold;
  }

  /**
   * RULE_009: Validate under-age player limit
   * Ensures team doesn't exceed maximum under-age players
   */
  validateUnderAgeLimit(team: Team, playerAge: number | null): boolean {
    if (!playerAge || playerAge >= this.underAgeLimit) {
      return true;
    }
    return (team.underAgePlayers || 0) < this.maxUnderAgePlayers;
  }

  /**
   * Comprehensive bid validation
   * Checks all rules and returns detailed validation result
   */
  validateBid(
    team: Team,
    bidAmount: number,
    playerBasePrice: number = this.minimumPlayerBasePrice,
    playerAge: number | null = null
  ): ValidationResult {
    // RULE_004: Check player count
    if (!this.validatePlayerCount(team)) {
      return {
        valid: false,
        severity: 'critical',
        message: `Team roster full. ${team.name} cannot buy more players.`,
        ruleId: 'RULE_004',
      };
    }

    // RULE_003: Check total budget
    if (!this.validateTotalBudget(team, bidAmount)) {
      return {
        valid: false,
        severity: 'critical',
        message: `Insufficient funds! ${team.name} cannot exceed allocated total budget.`,
        ruleId: 'RULE_003',
      };
    }

    // RULE_005: Check minimum balance
    if (!this.validateMinimumBalance(team, playerBasePrice)) {
      return {
        valid: false,
        severity: 'warning',
        message: `Insufficient balance to bid for this player. ${team.name} needs at least ₹${playerBasePrice.toLocaleString()}.`,
        ruleId: 'RULE_005',
      };
    }

    // RULE_009: Check under-age player limit
    if (playerAge && playerAge < this.underAgeLimit) {
      if (!this.validateUnderAgeLimit(team, playerAge)) {
        return {
          valid: false,
          severity: 'critical',
          message: `${team.name} has reached maximum limit of under-${this.underAgeLimit} players (max ${this.maxUnderAgePlayers} allowed).`,
          ruleId: 'RULE_009',
        };
      }
    }

    // RULE_001 & RULE_002: Check remaining budget constraint
    const maxBid = this.calculateMaxBid(team);
    if (bidAmount > maxBid) {
      return {
        valid: false,
        severity: 'critical',
        message: `Bid exceeds allowed limit! ${team.name} must retain enough funds to complete the team. Max allowed: ₹${maxBid.toLocaleString()}`,
        ruleId: 'RULE_001',
      };
    }

    // RULE_006: Check safe fund threshold (warning only)
    if (!this.validateSafeFundThreshold(team, bidAmount)) {
      return {
        valid: true,
        severity: 'warning',
        message: `Warning: ${team.name} is entering unsafe fund range. Consider preserving funds for upcoming players.`,
        ruleId: 'RULE_006',
        isWarning: true,
      };
    }

    return {
      valid: true,
      severity: 'info',
      message: 'Bid is valid.',
      ruleId: null,
    };
  }

  /**
   * Get team status based on their financial health
   */
  getTeamStatus(team: Team, currentBid: number, bidIncrement: number): 'safe' | 'warning' | 'danger' {
    const nextBid = currentBid + bidIncrement;
    const validation = this.validateBid(team, nextBid);

    if (!validation.valid && validation.severity === 'critical') {
      return 'danger';
    }

    if (!validation.valid || validation.isWarning) {
      return 'warning';
    }

    return 'safe';
  }

  /**
   * Get detailed warning message for team bid restriction
   */
  getBidRestrictionMessage(team: Team, _bidAmount: number, ruleId: string | null): string {
    const maxBid = this.calculateMaxBid(team);
    
    switch (ruleId) {
      case 'RULE_001':
        return `${team.name} cannot bid - Max allowed: ₹${maxBid.toLocaleString()}`;
      case 'RULE_003':
        return `${team.name} has exhausted budget (₹${team.allocatedAmount.toLocaleString()})`;
      case 'RULE_004':
        return `${team.name} roster full (${team.totalPlayerThreshold}/${team.totalPlayerThreshold})`;
      case 'RULE_005':
        return `${team.name} insufficient balance (₹${team.remainingPurse.toLocaleString()} < ₹${this.minimumPlayerBasePrice.toLocaleString()})`;
      case 'RULE_009':
        return `${team.name} has reached max under-${this.underAgeLimit} players limit (${this.maxUnderAgePlayers} max)`;
      default:
        return `${team.name} cannot place this bid`;
    }
  }
}

// Singleton instance for easy access
export const auctionRules = new AuctionRulesService();
