// ============================================================================
// USE DATA HOOK - Data Loading (Firebase-first, manual Sheets sync)
// Automatic Google Sheets fetching is disabled. Use manual import in Admin Panel.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { googleSheetsService, imagePreloaderService } from '../services';
import { auctionPersistence } from '../services/auctionPersistence';
import { localImageCacheService } from '../services/localImageCache';
import { realtimeSync } from '../services/realtimeSync';
import { useAuctionStore } from '../store';
import type { Player, Team } from '../types';

/**
 * Combined hook for initial data loading (Firebase-only, no auto Sheets sync).
 * Loads admin players + teams from Firebase, then preloads images.
 */

// Module-level flag: once images have been preloaded in this session,
// skip the loading screen on subsequent mounts (e.g. returning from /live).
let _globalPreloadComplete = false;

// Module-level flag: once Firebase data has been loaded in this session,
// skip the Firebase fetch on subsequent mounts (e.g. returning from /live).
let _globalDataLoaded = false;

// localStorage-based preload cache: skip preload on page reload if recently completed
const PRELOAD_LS_KEY = 'epl_preload_done_v1';
const PRELOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isPreloadCachedLocally(): boolean {
  try {
    const ts = localStorage.getItem(PRELOAD_LS_KEY);
    return !!ts && (Date.now() - Number(ts) < PRELOAD_TTL_MS);
  } catch {
    return false;
  }
}

function markPreloadComplete(): void {
  _globalPreloadComplete = true;
  try { localStorage.setItem(PRELOAD_LS_KEY, Date.now().toString()); } catch { /* ignore */ }
}

export function useInitialData() {
  const [isLoading, setIsLoading] = useState(!_globalDataLoaded);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dataReady, setDataReady] = useState(_globalDataLoaded);
  const [isPreloadingComplete, setIsPreloadingComplete] = useState(
    _globalPreloadComplete || isPreloadCachedLocally()
  );

  // Load data from Firebase only — no auto Google Sheets fetch
  // Skipped on subsequent mounts within the same SPA session.
  useEffect(() => {
    if (_globalDataLoaded) {
      // Data already loaded in this session — resolve immediately
      setDataReady(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const loadFromFirebase = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) {
          console.warn('[useInitialData] Database not ready');
          if (!cancelled) { setIsLoading(false); setDataReady(true); }
          return;
        }

        auctionPersistence.initialize(db);

        // Load teams from Firebase
        const persistedTeams = await auctionPersistence.getTeams();
        if (persistedTeams && persistedTeams.length > 0) {
          useAuctionStore.getState().setTeams(persistedTeams);
        }

        // Load admin players from Firebase
        const adminPlayers = await auctionPersistence.getAdminPlayers();
        if (adminPlayers && adminPlayers.length > 0) {
          useAuctionStore.getState().setAdminPlayerOverrides(adminPlayers);
        }

        _globalDataLoaded = true;
        if (!cancelled) { setDataReady(true); setIsLoading(false); }
      } catch (err) {
        console.error('[useInitialData] Failed to load from Firebase:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsError(true);
          setIsLoading(false);
          setDataReady(true);
        }
      }
    };

    loadFromFirebase();
    return () => { cancelled = true; };
  }, []);

  // Collect all player images for preloading
  const originalPlayers = useAuctionStore((state) => state.originalPlayers);
  const soldPlayers = useAuctionStore((state) => state.soldPlayers);

  const allPlayerImages = useMemo(() => {
    const images = new Set<string>();
    originalPlayers.forEach(p => { if (p.imageUrl) images.add(p.imageUrl); });
    soldPlayers.forEach(p => { if (p.imageUrl) images.add(p.imageUrl); });
    return Array.from(images);
  }, [originalPlayers, soldPlayers]);

  // Trigger image preloading when data is ready
  useEffect(() => {
    if (!dataReady) return;

    if (_globalPreloadComplete || isPreloadCachedLocally()) {
      if (!isPreloadingComplete) setIsPreloadingComplete(true);
      return;
    }

    if (allPlayerImages.length > 0 && !imagePreloaderService.isCurrentlyPreloading()) {
      setIsPreloadingComplete(false);

      localImageCacheService.warmCache(allPlayerImages).catch((err) => {
        console.warn('[useInitialData] Local image cache warm-up failed:', err);
      });

      console.log('[useInitialData] Starting image preload for', allPlayerImages.length, 'images');
      imagePreloaderService.preloadImages(allPlayerImages, {
        maxConcurrent: 6,
        timeout: 15000,
      })
        .then(result => {
          console.log('[useInitialData] Image preload complete:', {
            successful: result.successful.length,
            failed: result.failed.length,
            successRate: `${result.successRate.toFixed(1)}%`,
          });
          markPreloadComplete();
          setIsPreloadingComplete(true);
        })
        .catch(err => {
          console.error('[useInitialData] Image preload error:', err);
          markPreloadComplete();
          setIsPreloadingComplete(true);
        });
    } else {
      // No images to preload
      if (!isPreloadingComplete) setIsPreloadingComplete(true);
    }
  }, [dataReady, allPlayerImages.length]);

  return {
    isLoading: isLoading || (dataReady && allPlayerImages.length > 0 && !isPreloadingComplete),
    isError,
    error,
  };
}

/**
 * Hook for manually syncing players from Google Sheets.
 * Returns a function that fetches fresh data from sheets and applies as admin overrides.
 */
export function useSyncFromSheets() {
  const [isSyncing, setIsSyncing] = useState(false);

  const syncPlayers = async (): Promise<{ players: Player[]; teams: Team[] }> => {
    setIsSyncing(true);
    try {
      googleSheetsService.clearCache();
      const [players, teams] = await Promise.all([
        googleSheetsService.fetchPlayers([]),
        googleSheetsService.fetchTeams(),
      ]);
      return { players, teams };
    } finally {
      setIsSyncing(false);
    }
  };

  return { syncPlayers, isSyncing };
}

/**
 * Hook for refreshing data (kept for backward compatibility)
 */
export function useRefreshData() {
  const refreshAll = () => {
    // With Firebase-first loading, refresh means reload page
    globalThis.location.reload();
  };

  return { refreshAll };
}
