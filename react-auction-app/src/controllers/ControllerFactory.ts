// ============================================================================
// CONTROLLER FACTORY - Dependency Injection for Controllers
// Provides centralized access to all controllers
// ============================================================================

import { AuctionController, auctionController } from './AuctionController';
import { BidController, bidController } from './BidController';
import { PlayerController, playerController } from './PlayerController';
import { TeamController, teamController } from './TeamController';

/**
 * Controller factory configuration
 */
interface ControllerConfig {
  auction?: AuctionController;
  bid?: BidController;
  player?: PlayerController;
  team?: TeamController;
}

/**
 * Controller Factory
 * Provides dependency injection for controllers
 */
class ControllerFactoryImpl {
  private config: ControllerConfig = {};
  private initialized = false;

  /**
   * Configure controller implementations
   */
  configure(config: ControllerConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize controllers with config
   */
  initialize(auctionConfig: {
    minimumBid?: number;
    bidIncrement?: number;
    maxUnderAge?: number;
  } = {}): void {
    if (this.initialized) return;

    // Configure bid controller
    this.getBidController().configure(auctionConfig);
    
    // Configure team controller
    this.getTeamController().configure({
      minimumBid: auctionConfig.minimumBid,
      maxUnderAge: auctionConfig.maxUnderAge,
    });

    this.initialized = true;
    console.log('[ControllerFactory] Controllers initialized');
  }

  /**
   * Get auction controller
   */
  getAuctionController(): AuctionController {
    return this.config.auction || auctionController;
  }

  /**
   * Get bid controller
   */
  getBidController(): BidController {
    return this.config.bid || bidController;
  }

  /**
   * Get player controller
   */
  getPlayerController(): PlayerController {
    return this.config.player || playerController;
  }

  /**
   * Get team controller
   */
  getTeamController(): TeamController {
    return this.config.team || teamController;
  }

  /**
   * Reset controllers (for testing)
   */
  reset(): void {
    this.config = {};
    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// Export singleton
export const ControllerFactory = new ControllerFactoryImpl();

// Convenience exports
export const getAuctionController = () => ControllerFactory.getAuctionController();
export const getBidController = () => ControllerFactory.getBidController();
export const getPlayerController = () => ControllerFactory.getPlayerController();
export const getTeamController = () => ControllerFactory.getTeamController();
