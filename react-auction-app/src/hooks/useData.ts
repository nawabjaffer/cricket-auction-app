// ============================================================================
// USE DATA HOOK - Data Fetching with React Query
// Handles all data fetching and caching operations
// ============================================================================

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { googleSheetsService, imagePreloaderService } from '../services';
import { auctionPersistence } from '../services/auctionPersistence';
import { localImageCacheService } from '../services/localImageCache';
import { realtimeSync } from '../services/realtimeSync';
import { useAuctionStore } from '../store';
import type { Player, Team, SoldPlayer, UnsoldPlayer } from '../types';

// Query Keys
const QUERY_KEYS = {
  players: ['players'] as const,
  teams: ['teams'] as const,
  soldPlayers: ['soldPlayers'] as const,
  unsoldPlayers: ['unsoldPlayers'] as const,
};

/**
 * Fetch teams data
 */
export function useTeamsQuery() {
  const setTeams = useAuctionStore((state) => state.setTeams);

  const query = useQuery<Team[]>({
    queryKey: QUERY_KEYS.teams,
    queryFn: async () => {
      // Prefer admin-saved teams from Firebase so renamed teams persist.
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (db) {
          auctionPersistence.initialize(db);
          const persistedTeams = await auctionPersistence.getTeams();
          if (persistedTeams && persistedTeams.length > 0) {
            return persistedTeams;
          }
        }
      } catch (error) {
        console.warn('[useTeamsQuery] Could not load persisted teams, falling back to sheets:', error);
      }

      return googleSheetsService.fetchTeams();
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 60000, // Refetch every minute
  });

  useEffect(() => {
    if (query.data) {
      setTeams(query.data);
    }
  }, [query.data, setTeams]);

  return query;
}

/**
 * Fetch sold players data
 */
export function useSoldPlayersQuery() {
  const setSoldPlayers = useAuctionStore((state) => state.setSoldPlayers);

  const query = useQuery<{ ids: string[]; players: SoldPlayer[] }>({
    queryKey: QUERY_KEYS.soldPlayers,
    queryFn: () => googleSheetsService.fetchSoldPlayers(),
    staleTime: 30000, // 30 seconds
  });

  useEffect(() => {
    if (query.data) {
      setSoldPlayers(query.data.players);
    }
  }, [query.data, setSoldPlayers]);

  return query;
}

/**
 * Fetch unsold players data
 */
export function useUnsoldPlayersQuery() {
  const setUnsoldPlayers = useAuctionStore((state) => state.setUnsoldPlayers);

  const query = useQuery<{ ids: string[]; players: UnsoldPlayer[] }>({
    queryKey: QUERY_KEYS.unsoldPlayers,
    queryFn: () => googleSheetsService.fetchUnsoldPlayers(),
    staleTime: 30000,
  });

  useEffect(() => {
    if (query.data) {
      setUnsoldPlayers(query.data.players);
    }
  }, [query.data, setUnsoldPlayers]);

  return query;
}

/**
 * Fetch available players data
 */
export function usePlayersQuery() {
  const setPlayers = useAuctionStore((state) => state.setPlayers);
  const soldPlayersQuery = useSoldPlayersQuery();
  const unsoldPlayersQuery = useUnsoldPlayersQuery();

  const excludeIds = [
    ...(soldPlayersQuery.data?.ids || []),
    ...(unsoldPlayersQuery.data?.ids || []),
  ];

  const query = useQuery<Player[]>({
    queryKey: [...QUERY_KEYS.players, excludeIds],
    queryFn: () => googleSheetsService.fetchPlayers(excludeIds),
    staleTime: 30000,
    enabled: soldPlayersQuery.isSuccess && unsoldPlayersQuery.isSuccess,
  });

  useEffect(() => {
    if (query.data) {
      setPlayers(query.data);
    }
  }, [query.data, setPlayers]);

  return query;
}

/**
 * Combined hook for all initial data loading with image preloading
 * Waits for BOTH data AND images to be preloaded before marking as ready
 */

// Module-level flag: once images have been preloaded in this session,
// skip the loading screen on subsequent mounts (e.g. returning from /live).
let _globalPreloadComplete = false;

export function useInitialData() {
  const teamsQuery = useTeamsQuery();
  const playersQuery = usePlayersQuery();
  const soldPlayersQuery = useSoldPlayersQuery();
  const unsoldPlayersQuery = useUnsoldPlayersQuery();

  // Track preload state — initialize from global flag to skip if already done
  const [isPreloadingComplete, setIsPreloadingComplete] = useState(_globalPreloadComplete);

  // Collect all player images for preloading
  const allPlayerImages = useMemo(() => {
    const images = new Set<string>();

    // Available players
    playersQuery.data?.forEach(player => {
      if (player.imageUrl) images.add(player.imageUrl);
    });

    // Sold players
    soldPlayersQuery.data?.players.forEach(player => {
      if (player.imageUrl) images.add(player.imageUrl);
    });

    // Unsold players
    unsoldPlayersQuery.data?.players.forEach(player => {
      if (player.imageUrl) images.add(player.imageUrl);
    });

    return Array.from(images);
  }, [playersQuery.data, soldPlayersQuery.data?.players, unsoldPlayersQuery.data?.players]);

  // Trigger image preloading when all data is available
  // IMPORTANT: This now waits for preload to complete before allowing app to render
  useEffect(() => {
    // Skip if already preloaded globally (e.g. returning from /live)
    if (_globalPreloadComplete) return;

    if (allPlayerImages.length > 0 && !imagePreloaderService.isCurrentlyPreloading()) {
      setIsPreloadingComplete(false); // Mark preload as in-progress

      // Warm local Cache Storage for supported URLs.
      localImageCacheService.warmCache(allPlayerImages).catch((error) => {
        console.warn('[useInitialData] Local image cache warm-up failed:', error);
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
          // Mark preload as complete - app can now render
          _globalPreloadComplete = true;
          setIsPreloadingComplete(true);
        })
        .catch(error => {
          console.error('[useInitialData] Image preload error:', error);
          // Even if preload fails, allow app to render with cached/fallback images
          _globalPreloadComplete = true;
          setIsPreloadingComplete(true);
        });
    }
  }, [allPlayerImages.length]); // Only trigger when count changes

  // Data loading state
  const isDataLoading = 
    teamsQuery.isLoading || 
    playersQuery.isLoading || 
    soldPlayersQuery.isLoading || 
    unsoldPlayersQuery.isLoading;

  // Combined loading state: Show loading until BOTH data is ready AND images are preloaded
  const isLoading = isDataLoading || (allPlayerImages.length > 0 && !isPreloadingComplete);

  const isError = 
    teamsQuery.isError || 
    playersQuery.isError || 
    soldPlayersQuery.isError || 
    unsoldPlayersQuery.isError;

  const error = 
    teamsQuery.error || 
    playersQuery.error || 
    soldPlayersQuery.error || 
    unsoldPlayersQuery.error;

  return {
    isLoading,
    isError,
    error: error as Error | null,
    teams: teamsQuery.data || [],
    players: playersQuery.data || [],
    soldPlayers: soldPlayersQuery.data?.players || [],
    unsoldPlayers: unsoldPlayersQuery.data?.players || [],
    refetch: {
      teams: teamsQuery.refetch,
      players: playersQuery.refetch,
      soldPlayers: soldPlayersQuery.refetch,
      unsoldPlayers: unsoldPlayersQuery.refetch,
    },
  };
}

/**
 * Hook for refreshing all data
 */
export function useRefreshData() {
  const queryClient = useQueryClient();

  const refreshAll = () => {
    // Clear the Google Sheets service cache
    googleSheetsService.clearCache();
    
    // Invalidate all queries
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.teams });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.players });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.soldPlayers });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.unsoldPlayers });
  };

  const refreshTeams = () => {
    googleSheetsService.clearCache('teams');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.teams });
  };

  const refreshPlayers = () => {
    googleSheetsService.clearCache('players');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.players });
  };

  return {
    refreshAll,
    refreshTeams,
    refreshPlayers,
  };
}
