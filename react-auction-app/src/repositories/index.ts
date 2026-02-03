// ============================================================================
// REPOSITORIES INDEX - Data Access Layer
// Central export point for all repositories
// ============================================================================

import { PlayerRepository, type IPlayerRepository } from './PlayerRepository';
import { TeamRepository, type ITeamRepository } from './TeamRepository';
import { AuctionRepository, type IAuctionRepository } from './AuctionRepository';
import { BidRepository, type IBidRepository } from './BidRepository';

export { PlayerRepository, type IPlayerRepository };
export { TeamRepository, type ITeamRepository };
export { AuctionRepository, type IAuctionRepository };
export { BidRepository, type IBidRepository };

// Factory helper functions for dependency injection
class RepositoryFactory {
  private static instance: RepositoryFactory;
  private playerRepo: PlayerRepository;
  private teamRepo: TeamRepository;
  private auctionRepo: AuctionRepository;
  private bidRepo: BidRepository;

  private constructor() {
    this.playerRepo = new PlayerRepository();
    this.teamRepo = new TeamRepository();
    this.auctionRepo = new AuctionRepository();
    this.bidRepo = new BidRepository();
  }

  static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  getPlayerRepository(): PlayerRepository {
    return this.playerRepo;
  }

  getTeamRepository(): TeamRepository {
    return this.teamRepo;
  }

  getAuctionRepository(): AuctionRepository {
    return this.auctionRepo;
  }

  getBidRepository(): BidRepository {
    return this.bidRepo;
  }
}

// Factory helper functions for backward compatibility
export function getPlayerRepository() {
  return RepositoryFactory.getInstance().getPlayerRepository();
}

export function getTeamRepository() {
  return RepositoryFactory.getInstance().getTeamRepository();
}

export function getAuctionRepository() {
  return RepositoryFactory.getInstance().getAuctionRepository();
}

export function getBidRepository() {
  return RepositoryFactory.getInstance().getBidRepository();
}
