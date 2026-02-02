// ============================================================================
// SERVICES INDEX - Barrel Export
// Central export point for all services
// ============================================================================

export { AuctionRulesService } from './auctionRules';
export { googleSheetsService } from './googleSheets';
export { webhookService } from './webhook';
export type { WebhookPayload, SoldPlayerPayload, UnsoldPlayerPayload, MoveUnsoldToSoldPayload } from './webhook';
export { audioService } from './audio';
export { imageCacheService } from './imageCache';
export { imagePreloaderService } from './imagePreloader';
export { biddingService } from './bidding';
export type { BidEvent } from './bidding';
export { authService, TEAM_CREDENTIALS } from './auth';
export type { TeamCredentials, AuthSession } from './auth';
export { firebaseService } from './firebase';
export type { FirestoreBid, FirestoreAuctionState, FirestorePlayer, FirestoreTeam } from './firebase';
export { syncService } from './syncService';
export type { AuctionSyncState, MobileBidEvent } from './syncService';
export { firebaseSyncService } from './firebaseSync';
export type { FirestoreAuctionState as FirebaseSyncState, MobileBidEvent as FirebaseMobileBid } from './firebaseSync';
export { realtimeSyncService } from './realtimeSync';
export type { RealtimeAuctionState, RealtimeMobileBid } from './realtimeSync';
export { authService as adminAuthService } from './authService';
export type { AdminAccount, AdminSession } from './authService';
export { featureFlagsService } from './featureFlagsService';
export type { FeatureFlag, FeatureFlags } from './featureFlagsService';

// V3 Premium Services
export { premiumService } from './premiumService';
export { cameraManager } from './cameraManager';
export { obsService } from './obsService';
