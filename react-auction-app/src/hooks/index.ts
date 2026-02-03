// ============================================================================
// HOOKS INDEX - Barrel Export
// MVC: Hooks provide React integration with controllers
// ============================================================================

// Core auction hooks
export { useAuction } from './useAuction';
export { 
  useAuctionController,
  usePlayerController,
  useTeamController,
  useBidController,
} from './useAuctionController';

// Data fetching hooks
export { 
  useTeamsQuery, 
  usePlayersQuery, 
  useSoldPlayersQuery, 
  useUnsoldPlayersQuery,
  useInitialData,
  useRefreshData,
} from './useData';

// Keyboard and UI hooks
export { useKeyboardShortcuts, useHotkeyHelp } from './useKeyboardShortcuts';
export { useTheme, useThemeClasses } from './useTheme';
export { useImagePreload } from './useImagePreload';
export { useImagePreloaderInit } from './useImagePreloaderInit';

// Cross-device sync hooks
export { useDesktopSync, useMobileSync } from './useCrossDeviceSync';
export type { MobileSyncState } from './useCrossDeviceSync';
export { useFirebaseDesktopSync, useFirebaseMobileSync } from './useFirebaseSync';
export type { FirebaseMobileSyncState } from './useFirebaseSync';
export { useBroadcastDesktopSync, useBroadcastMobileSync } from './useBroadcastSync';
export type { BroadcastMobileSyncState } from './useBroadcastSync';
export { useRealtimeDesktopSync, useRealtimeMobileSync } from './useRealtimeSync';
export type { RealtimeMobileSyncState } from './useRealtimeSync';

// Admin and data management hooks
export { useAuctionDataLoader, useSaveInitialSnapshot } from './useAuctionDataLoader';
export { useFeatureFlags } from './useFeatureFlags';
export { useFeatureFlagsInit } from './useFeatureFlagsInit';
export { useAdminAuth } from './useAdminAuth';
export { useAdminPlayersOverrides } from './useAdminPlayersOverrides';

// V3 Premium Hooks
export { usePremium } from './usePremium';
export { useMotionSensor } from './useMotionSensor';
