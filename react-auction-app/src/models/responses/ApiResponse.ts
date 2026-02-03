// ============================================================================
// API RESPONSE TYPES
// Standardized response types for all API operations
// ============================================================================

/**
 * Base API response structure
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * API metadata
 */
export interface ApiMeta {
  timestamp: number;
  requestId?: string;
  duration?: number;
  pagination?: PaginationMeta;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Common error codes
 */
export const ApiErrorCodes = {
  // General errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Auction errors
  AUCTION_NOT_ACTIVE: 'AUCTION_NOT_ACTIVE',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  INVALID_BID: 'INVALID_BID',
  BID_TOO_LOW: 'BID_TOO_LOW',
  TEAM_FULL: 'TEAM_FULL',
  INSUFFICIENT_PURSE: 'INSUFFICIENT_PURSE',
  UNDERAGE_LIMIT: 'UNDERAGE_LIMIT',
  
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  SYNC_FAILED: 'SYNC_FAILED',
} as const;

export type ApiErrorCode = typeof ApiErrorCodes[keyof typeof ApiErrorCodes];

/**
 * Helper functions for creating API responses
 */
export const ApiResponseHelper = {
  /**
   * Create success response
   */
  success<T>(data: T, meta?: Partial<ApiMeta>): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: {
        timestamp: Date.now(),
        ...meta,
      },
    };
  },

  /**
   * Create error response
   */
  error(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>
  ): ApiResponse<never> {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
      meta: {
        timestamp: Date.now(),
      },
    };
  },

  /**
   * Create paginated response
   */
  paginated<T>(
    data: T[],
    page: number,
    pageSize: number,
    total: number
  ): ApiResponse<T[]> {
    const totalPages = Math.ceil(total / pageSize);
    return {
      success: true,
      data,
      meta: {
        timestamp: Date.now(),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  },

  /**
   * Check if response is successful
   */
  isSuccess<T>(response: ApiResponse<T>): response is ApiResponse<T> & { data: T } {
    return response.success && response.data !== undefined;
  },

  /**
   * Extract data or throw
   */
  unwrap<T>(response: ApiResponse<T>): T {
    if (!response.success || response.data === undefined) {
      throw new Error(response.error?.message || 'Unknown error');
    }
    return response.data;
  },
};
