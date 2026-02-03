// ============================================================================
// VALIDATORS - Shared validation utilities
// DRY: Single source of truth for all validation functions
// ============================================================================

import type { IPlayer } from '../models/domain/Player';
import type { ITeam } from '../models/domain/Team';

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
  code?: string;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    valid: regex.test(email),
    message: regex.test(email) ? undefined : 'Invalid email format',
  };
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): ValidationResult {
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, message: 'Invalid URL format' };
  }
}

/**
 * Validate player can be sold to team
 */
export function validatePlayerSale(
  player: IPlayer | null,
  team: ITeam | null,
  amount: number,
  config: { minimumBid: number; maxUnderAge: number }
): ValidationResult {
  if (!player) {
    return { valid: false, message: 'No player selected', code: 'NO_PLAYER' };
  }

  if (!team) {
    return { valid: false, message: 'No team selected', code: 'NO_TEAM' };
  }

  if (amount < config.minimumBid) {
    return {
      valid: false,
      message: `Bid must be at least ₹${(config.minimumBid / 100000).toFixed(0)} L`,
      code: 'BID_TOO_LOW',
    };
  }

  if (team.playersBought >= team.totalPlayerThreshold) {
    return {
      valid: false,
      message: `${team.name} has reached maximum player limit`,
      code: 'TEAM_FULL',
    };
  }

  const reserveNeeded = (team.remainingPlayers - 1) * config.minimumBid;
  const maxBid = team.remainingPurse - reserveNeeded;
  if (amount > maxBid) {
    return {
      valid: false,
      message: `${team.name} cannot afford this bid`,
      code: 'INSUFFICIENT_PURSE',
    };
  }

  if (player.age !== null && player.age < 19 && team.underAgePlayers >= config.maxUnderAge) {
    return {
      valid: false,
      message: `${team.name} has reached under-age player limit`,
      code: 'UNDERAGE_LIMIT',
    };
  }

  return { valid: true };
}

/**
 * Validate bid amount
 */
export function validateBidAmount(
  amount: number,
  currentBid: number,
  minimumBid: number,
  bidIncrement: number
): ValidationResult {
  if (amount < minimumBid) {
    return {
      valid: false,
      message: `Bid must be at least ₹${(minimumBid / 100000).toFixed(0)} L`,
      code: 'BELOW_MINIMUM',
    };
  }

  if (amount <= currentBid) {
    return {
      valid: false,
      message: 'Bid must be higher than current bid',
      code: 'NOT_HIGHER',
    };
  }

  const expectedMin = currentBid + bidIncrement;
  if (amount < expectedMin && currentBid > 0) {
    return {
      valid: false,
      message: `Bid should be at least ₹${(expectedMin / 100000).toFixed(0)} L`,
      code: 'BELOW_INCREMENT',
    };
  }

  return { valid: true };
}

/**
 * Validate team can bid
 */
export function validateTeamCanBid(
  team: ITeam,
  minimumBid: number
): ValidationResult {
  if (team.playersBought >= team.totalPlayerThreshold) {
    return {
      valid: false,
      message: 'Team is full',
      code: 'TEAM_FULL',
    };
  }

  const reserveNeeded = (team.remainingPlayers - 1) * minimumBid;
  const maxBid = team.remainingPurse - reserveNeeded;

  if (maxBid <= 0) {
    return {
      valid: false,
      message: 'Insufficient budget',
      code: 'NO_BUDGET',
    };
  }

  return { valid: true };
}

/**
 * Validate string is not empty
 */
export function validateRequired(value: string | undefined | null, fieldName: string): ValidationResult {
  if (!value || value.trim() === '') {
    return {
      valid: false,
      message: `${fieldName} is required`,
      code: 'REQUIRED',
    };
  }
  return { valid: true };
}

/**
 * Validate number is in range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): ValidationResult {
  if (value < min || value > max) {
    return {
      valid: false,
      message: `${fieldName} must be between ${min} and ${max}`,
      code: 'OUT_OF_RANGE',
    };
  }
  return { valid: true };
}

/**
 * Validate number is positive
 */
export function validatePositive(value: number, fieldName: string): ValidationResult {
  if (value <= 0) {
    return {
      valid: false,
      message: `${fieldName} must be positive`,
      code: 'NOT_POSITIVE',
    };
  }
  return { valid: true };
}

/**
 * Validate array is not empty
 */
export function validateArrayNotEmpty<T>(arr: T[] | undefined | null, fieldName: string): ValidationResult {
  if (!arr || arr.length === 0) {
    return {
      valid: false,
      message: `${fieldName} cannot be empty`,
      code: 'EMPTY_ARRAY',
    };
  }
  return { valid: true };
}

/**
 * Combine multiple validation results
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  const failed = results.find(r => !r.valid);
  if (failed) {
    return failed;
  }
  return { valid: true };
}

/**
 * Create validation result
 */
export function createValidation(valid: boolean, message?: string, code?: string): ValidationResult {
  return { valid, message, code };
}
