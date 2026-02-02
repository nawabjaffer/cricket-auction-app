// ============================================================================
// HOOKS INDEX - Barrel Export
// ============================================================================

export { useAuction } from './useAuction';
export { 
  useTeamsQuery, 
  usePlayersQuery, 
  useSoldPlayersQuery, 
  useUnsoldPlayersQuery,
  useInitialData,
  useRefreshData,
} from './useData';
export { useKeyboardShortcuts, useHotkeyHelp } from './useKeyboardShortcuts';
export { useTheme, useThemeClasses } from './useTheme';
export { useImagePreload } from './useImagePreload';
export { useImagePreloaderInit } from './useImagePreloaderInit';
export { useDesktopSync, useMobileSync } from './useCrossDeviceSync';
export type { MobileSyncState } from './useCrossDeviceSync';
export { useFirebaseDesktopSync, useFirebaseMobileSync } from './useFirebaseSync';
export type { FirebaseMobileSyncState } from './useFirebaseSync';
export { useBroadcastDesktopSync, useBroadcastMobileSync } from './useBroadcastSync';
export type { BroadcastMobileSyncState } from './useBroadcastSync';
export { useRealtimeDesktopSync, useRealtimeMobileSync } from './useRealtimeSync';
export type { RealtimeMobileSyncState } from './useRealtimeSync';