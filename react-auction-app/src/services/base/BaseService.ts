// ============================================================================
// BASE SERVICE - Abstract base class for all services
// DRY: Common functionality shared across services
// ============================================================================

import { logger } from '../../utils/logger';
import { ApiResponseHelper, ApiErrorCodes } from '../../models/responses/ApiResponse';
import type { ApiResponse } from '../../models/responses/ApiResponse';

export abstract class BaseService {
  protected readonly serviceName: string;
  protected readonly log: ReturnType<typeof logger.scope>;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.log = logger.scope(serviceName);
  }

  /**
   * Execute operation with error handling
   */
  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<ApiResponse<T>> {
    try {
      this.log.debug(`Starting ${operationName}`);
      const result = await operation();
      this.log.debug(`Completed ${operationName}`);
      return ApiResponseHelper.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log.error(`Failed ${operationName}`, { error: message });
      return ApiResponseHelper.error(
        ApiErrorCodes.UNKNOWN_ERROR,
        `${operationName} failed: ${message}`
      );
    }
  }

  /**
   * Execute synchronous operation with error handling
   */
  protected executeSync<T>(
    operation: () => T,
    operationName: string
  ): ApiResponse<T> {
    try {
      const result = operation();
      return ApiResponseHelper.success(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log.error(`Failed ${operationName}`, { error: message });
      return ApiResponseHelper.error(
        ApiErrorCodes.UNKNOWN_ERROR,
        `${operationName} failed: ${message}`
      );
    }
  }

  /**
   * Validate required parameters
   */
  protected validateRequired(
    params: Record<string, unknown>,
    required: string[]
  ): ApiResponse<void> | null {
    for (const key of required) {
      if (params[key] === undefined || params[key] === null) {
        return ApiResponseHelper.error(
          ApiErrorCodes.VALIDATION_ERROR,
          `Missing required parameter: ${key}`
        );
      }
    }
    return null;
  }
}
