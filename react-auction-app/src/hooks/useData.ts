// ============================================================================
// USE DATA HOOK - Data Loading (Firebase-first, manual Sheets sync)
// Automatic Google Sheets fetching is disabled. Use manual import in Admin Panel.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { googleSheetsService, imagePreloaderService } from '../services';
import { auctionPersistence } from '../services/auctionPersistence';
import { localImageCacheService } from '../services/localImageCache';
import { realtimeSync } from '../services/realtimeSync';
import {
  DEFAULT_TENANT_ID,
  getActiveTenant,
  onTenantChange,
  tenantStorageKey,
} from '../services/tenantPath';
import { tenantService } from '../services/tenantService';
import { useAuctionStore } from '../store';
import type { Player, Team } from '../types';

/**
 * Combined hook for initial data loading (Firebase-only, no auto Sheets sync).
 * Loads admin players + teams from Firebase, then preloads images.
 */

// Per-tenant flags: data and preload are tracked separately for each tenant
// so switching tenants always reloads from that tenant's namespace.
const _dataLoadedByTenant = new Set<string>();
const _preloadCompleteByTenant = new Set<string>();

// When the active tenant changes, drop in-memory flags + clear store data
// for the old tenant so the new tenant starts from a clean slate.
onTenantChange((next, prev) => {
  _dataLoadedByTenant.delete(prev);
  _preloadCompleteByTenant.delete(prev);
  // Clear the previous tenant's store data so we don't leak players/teams
  // into the new tenant's view while its load is in flight.
  try {
    useAuctionStore.getState().resetAuction();
  } catch (err) {
    console.warn('[useInitialData] Failed to reset store on tenant change:', err);
  }
  if (typeof console !== 'undefined') {
    console.log(`[useInitialData] Tenant switched: ${prev} → ${next}, cache cleared`);
  }
});

// localStorage-based preload cache (tenant-scoped): skip preload on page reload
// if recently completed for THIS tenant.
const PRELOAD_LS_BASE = 'preload_done_v2';
const PRELOAD_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isPreloadCachedLocally(): boolean {
  try {
    const ts = localStorage.getItem(tenantStorageKey(PRELOAD_LS_BASE));
    return !!ts && (Date.now() - Number(ts) < PRELOAD_TTL_MS);
  } catch {
    return false;
  }
}

function markPreloadComplete(): void {
  _preloadCompleteByTenant.add(getActiveTenant());
  try {
    localStorage.setItem(tenantStorageKey(PRELOAD_LS_BASE), Date.now().toString());
  } catch { /* ignore */ }
}

export function useInitialData() {
  const [tenantId, setTenantId] = useState(getActiveTenant());
  const initialDataLoaded = _dataLoadedByTenant.has(tenantId);
  const initialPreloadDone = _preloadCompleteByTenant.has(tenantId) || isPreloadCachedLocally();

  const [isLoading, setIsLoading] = useState(!initialDataLoaded);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dataReady, setDataReady] = useState(initialDataLoaded);
  const [isPreloadingComplete, setIsPreloadingComplete] = useState(initialPreloadDone);

  // Re-trigger data loading when the active tenant changes.
  useEffect(() => {
    const unsub = onTenantChange((next) => {
      setTenantId(next);
      setDataReady(false);
      setIsLoading(true);
      setIsPreloadingComplete(false);
    });
    return () => { unsub(); };
  }, []);

  // Load data from Firebase — re-runs whenever the active tenant changes.
  useEffect(() => {
    if (_dataLoadedByTenant.has(tenantId)) {
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
        } else {
          // Empty for this tenant — make sure we don't show a stale list.
          useAuctionStore.getState().setTeams([]);
        }

        // Resolve per-tenant Google Sheet (if any). Only the tenant that
        // explicitly has a sheetId will fetch from Google Sheets — every
        // other tenant works purely from its own RTDB namespace.
        const sheetIdOverride = await resolveTenantSheetId(tenantId);

        // Load admin players from Firebase AND (optionally) raw players from
        // Google Sheets in parallel. Sheets data is used as the base when the
        // tenant has its own sheet; otherwise admin players are the only source.
        // Also load adminSettings here so organizerLogo is always available
        // even on fresh tenants with no sold players (hasExistingData = false).
        const [adminPlayers, sheetPlayers, adminSettings] = await Promise.all([
          auctionPersistence.getAdminPlayers().catch(() => null),
          sheetIdOverride
            ? googleSheetsService.fetchPlayers([], sheetIdOverride).catch((err) => {
                console.warn('[useInitialData] Google Sheets fetch failed:', err);
                return [] as Player[];
              })
            : Promise.resolve([] as Player[]),
          auctionPersistence.getAdminSettings().catch(() => null),
        ]);

        // Push branding settings into store immediately — before the preload
        // phase — so the organizer logo renders on the first frame.
        if (adminSettings?.organizerLogo) {
          useAuctionStore.getState().setOrganizerLogo(adminSettings.organizerLogo);
        }

        // Seed the base (originalPlayers) with sheet data first so the
        // subsequent override merge can fall back to sheet imageUrl when
        // the admin copy is empty. If no sheet, start with an empty base
        // so we don't carry over a previous tenant's roster.
        useAuctionStore.getState().setPlayers(sheetPlayers ?? []);

        if (adminPlayers && adminPlayers.length > 0) {
          useAuctionStore.getState().setAdminPlayerOverrides(adminPlayers);

          // Repair: if any admin player had an empty imageUrl that sheets
          // can fill, persist the repaired list back so other clients see it.
          if (sheetPlayers && sheetPlayers.length > 0) {
            const sheetMap = new Map(sheetPlayers.map((p) => [p.id, p]));
            let changed = false;
            const repaired = adminPlayers.map((ap) => {
              if (!ap.imageUrl && sheetMap.get(ap.id)?.imageUrl) {
                changed = true;
                return { ...ap, imageUrl: sheetMap.get(ap.id)!.imageUrl };
              }
              return ap;
            });
            if (changed) {
              auctionPersistence.saveAdminPlayers(repaired).catch((err) => {
                console.warn('[useInitialData] repair save failed:', err);
              });
            }
          }
        }

        _dataLoadedByTenant.add(tenantId);
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
  }, [tenantId]);

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

    if (_preloadCompleteByTenant.has(tenantId) || isPreloadCachedLocally()) {
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
  }, [dataReady, allPlayerImages.length, tenantId]);

  return {
    isLoading: isLoading || (dataReady && allPlayerImages.length > 0 && !isPreloadingComplete),
    isError,
    error,
  };
}

// ── Per-tenant Google Sheet resolution ─────────────────────────────────
// Returns the sheet id to fetch for a tenant, or null to skip sheet fetch.
// Default tenant uses the env-configured sheet (legacy behavior). Other
// tenants must opt in via `tenantService.updateTenant({ sheetId })` —
// otherwise we DO NOT fetch any sheet, keeping their data isolated.
const _sheetIdCache = new Map<string, string | null>();

async function resolveTenantSheetId(tenantId: string): Promise<string | null> {
  if (_sheetIdCache.has(tenantId)) return _sheetIdCache.get(tenantId) ?? null;
  try {
    const rec = await tenantService.getTenant(tenantId);
    if (rec?.sheetId) {
      _sheetIdCache.set(tenantId, rec.sheetId);
      return rec.sheetId;
    }
  } catch (err) {
    console.warn('[useInitialData] Failed to read tenant sheetId:', err);
  }
  // Default tenant falls back to the env-configured sheet so existing
  // EPL deployments keep working without extra config.
  if (tenantId === DEFAULT_TENANT_ID) {
    _sheetIdCache.set(tenantId, '');  // empty string → use default config
    return '';
  }
  _sheetIdCache.set(tenantId, null);
  return null;
}

// Drop the per-tenant sheet cache when the tenant changes so any updates
// to the registry take effect on the next load.
onTenantChange(() => { _sheetIdCache.clear(); });

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
