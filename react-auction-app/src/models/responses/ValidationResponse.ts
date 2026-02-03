// ============================================================================
// VALIDATION RESPONSE TYPES
// Standardized validation results for business rules
// ============================================================================

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'critical' | 'warning' | 'info';

/**
 * Auction rule identifiers
 */
export type AuctionRuleId =
  | 'RULE_001' // Minimum bid amount
  | 'RULE_002' // Maximum players per team
  | 'RULE_003' // Budget constraint
  | 'RULE_004' // Under-age player limit
  | 'RULE_005' // Bid increment rule
  | 'RULE_006' // Team eligibility
  | 'RULE_007' // Player availability
  | 'RULE_008' // Round restrictions
  | 'RULE_009' // Reserved amount rule
  | 'RULE_010'; // Same team consecutive bid

/**
 * Single validation result
 */
export interface ValidationResult {
  valid: boolean;
  severity: ValidationSeverity;
  message: string;
  ruleId: AuctionRuleId | null;
  field?: string;
  details?: Record<string, unknown>;
}

/**
 * Aggregated validation response
 */
export interface ValidationResponse {
  valid: boolean;
  results: ValidationResult[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Bid validation response
 */
export interface BidValidationResponse extends ValidationResponse {
  suggestedAmount?: number;
  maxAllowedBid?: number;
  minRequiredBid?: number;
}

/**
 * Team validation response
 */
export interface TeamValidationResponse extends ValidationResponse {
  canBid: boolean;
  remainingCapacity: number;
  remainingBudget: number;
}

/**
 * Helper functions for validation responses
 */
export const ValidationHelper = {
  /**
   * Create a valid result
   */
  valid(message?: string): ValidationResult {
    return {
      valid: true,
      severity: 'info',
      message: message || 'Validation passed',
      ruleId: null,
    };
  },

  /**
   * Create a critical error result
   */
  critical(message: string, ruleId: AuctionRuleId, field?: string): ValidationResult {
    return {
      valid: false,
      severity: 'critical',
      message,
      ruleId,
      field,
    };
  },

  /**
   * Create a warning result
   */
  warning(message: string, ruleId: AuctionRuleId, field?: string): ValidationResult {
    return {
      valid: true, // Warnings don't block operations
      severity: 'warning',
      message,
      ruleId,
      field,
    };
  },

  /**
   * Create an info result
   */
  info(message: string, ruleId?: AuctionRuleId): ValidationResult {
    return {
      valid: true,
      severity: 'info',
      message,
      ruleId: ruleId || null,
    };
  },

  /**
   * Aggregate multiple results into a response
   */
  aggregate(results: ValidationResult[]): ValidationResponse {
    const criticalCount = results.filter(r => r.severity === 'critical').length;
    const warningCount = results.filter(r => r.severity === 'warning').length;
    const infoCount = results.filter(r => r.severity === 'info').length;

    return {
      valid: criticalCount === 0,
      results,
      criticalCount,
      warningCount,
      infoCount,
    };
  },

  /**
   * Merge multiple validation responses
   */
  merge(...responses: ValidationResponse[]): ValidationResponse {
    const allResults = responses.flatMap(r => r.results);
    return ValidationHelper.aggregate(allResults);
  },

  /**
   * Get all error messages
   */
  getErrorMessages(response: ValidationResponse): string[] {
    return response.results
      .filter(r => r.severity === 'critical')
      .map(r => r.message);
  },

  /**
   * Get all warning messages
   */
  getWarningMessages(response: ValidationResponse): string[] {
    return response.results
      .filter(r => r.severity === 'warning')
      .map(r => r.message);
  },

  /**
   * Check if response has specific rule violation
   */
  hasRuleViolation(response: ValidationResponse, ruleId: AuctionRuleId): boolean {
    return response.results.some(r => r.ruleId === ruleId && !r.valid);
  },
};
