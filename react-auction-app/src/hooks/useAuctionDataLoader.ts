// ============================================================================
// AUCTION DATA LOADER HOOK
// Loads initial data and restores state from Firebase on app start
// ============================================================================

import { useEffect, useState } from 'react';
import { auctionPersistence } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { batchPreloadImages } from '../services/firebaseStorageService';
import { getActiveTenant, onTenantChange } from '../services/tenantPath';
import { startSettledPlayersSync } from '../services/settledPlayersSync';
import { useAuctionStore } from '../store/auctionStore';

// Per-tenant flag: track restore completion separately for each tenant so
// switching tenants always re-runs the restore against the new namespace.
const _restoreCompleteByTenant = new Set<string>();

// Drop the previous tenant's restore flag when the active tenant changes.
onTenantChange((_next, prev) => { _restoreCompleteByTenant.delete(prev); });

export function useAuctionDataLoader() {
  const [tenantId, setTenantId] = useState(getActiveTenant());
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasRestoredData, setHasRestoredData] = useState(_restoreCompleteByTenant.has(tenantId));

  // Re-render this hook's consumer when the active tenant changes so the
  // effect below can re-run against the new namespace.
  useEffect(() => {
    const unsub = onTenantChange((next) => setTenantId(next));
    return () => { unsub(); };
  }, []);

  const { setTeams } = useAuctionStore();

  useEffect(() => {
    const restoreDataFromFirebase = async () => {
      try {
        setIsRestoring(true);

        // Ensure realtime sync is initialized (it initializes the Firebase app)
        await realtimeSync.ensureInitialized();

        // Get database instance from realtime sync
        const db = realtimeSync.getDatabase();
        if (!db) {
          console.log('[DataLoader] Database not ready yet, skipping restore');
          setIsRestoring(false);
          return;
        }

        // Initialize persistence service with the database
        auctionPersistence.initialize(db);

        // Teams first so legacy sold records (name only) can resolve their team id
        const [savedTeams, adminSettings] = await Promise.all([
          auctionPersistence.getTeams(),
          auctionPersistence.getAdminSettings(),
        ]);
        if (savedTeams) {
          setTeams(savedTeams);
        }

        // Sold/unsold always come from the database, even when both lists are empty
        await startSettledPlayersSync();

        if (adminSettings?.maxUnsoldRounds !== undefined) {
          useAuctionStore.getState().setMaxUnsoldRounds(adminSettings.maxUnsoldRounds);
        }

        if (adminSettings?.organizerLogo) {
          useAuctionStore.getState().setOrganizerLogo(adminSettings.organizerLogo);
        }

        if (adminSettings?.organizerName) {
          useAuctionStore.getState().setOrganizerName(adminSettings.organizerName);
        }

        setHasRestoredData(true);
        _restoreCompleteByTenant.add(tenantId);
        const { soldPlayers: restoredSoldPlayers, unsoldPlayers: restoredUnsoldPlayers } = useAuctionStore.getState();
        console.log('[DataLoader] ✅ Data restored from Firebase:', {
          soldPlayers: restoredSoldPlayers.length,
          unsoldPlayers: restoredUnsoldPlayers.length,
          teams: savedTeams?.length || 0,
        });

        // ── Background: upload all images to Firebase Storage (fire-and-forget)
        // This makes every subsequent render instant — CDN URLs from localStorage.
        const allPlayers = [
          ...restoredSoldPlayers,
          ...restoredUnsoldPlayers,
          ...useAuctionStore.getState().availablePlayers,
        ];
        const imageItems = [
          ...allPlayers
            .filter((p) => p.imageUrl && !p.imageUrl.startsWith('data:'))
            .map((p) => ({
              url: p.imageUrl!,
              storagePath: `images/players/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            })),
          ...(savedTeams ?? [])
            .filter((t) => t.logoUrl && !t.logoUrl.startsWith('data:'))
            .map((t) => ({
              url: t.logoUrl!,
              storagePath: `images/teams/${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            })),
        ];
        batchPreloadImages(imageItems, { maxConcurrent: 3 }).catch(() => {});

      } catch (error) {
        console.error('[DataLoader] Failed to restore data from Firebase:', error);
      } finally {
        setIsRestoring(false);
      }
    };

    // Only attempt restore once per tenant
    if (!_restoreCompleteByTenant.has(tenantId) && !isRestoring) {
      setHasRestoredData(false);
      restoreDataFromFirebase();
    } else if (_restoreCompleteByTenant.has(tenantId) && !hasRestoredData) {
      setHasRestoredData(true);
    }
  }, [tenantId, hasRestoredData, isRestoring, setTeams]);

  return {
    isRestoring,
    hasRestoredData,
  };
}

/**
 * Hook to save initial snapshot when data is loaded from Google Sheets
 */
export function useSaveInitialSnapshot(enabled = true) {
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const { availablePlayers, teams } = useAuctionStore();

  useEffect(() => {
    const saveSnapshot = async () => {
      // Only save if we have data and haven't saved yet
      if (!enabled || snapshotSaved || availablePlayers.length === 0 || teams.length === 0) {
        return;
      }

      try {
        // Check if snapshot already exists
        const existingSnapshot = await auctionPersistence.getInitialSnapshot();
        
        if (existingSnapshot) {
          console.log('[Snapshot] Initial snapshot already exists, skipping save');
          setSnapshotSaved(true);
          return;
        }

        console.log('[Snapshot] Saving initial snapshot to Firebase...');
        await auctionPersistence.saveInitialSnapshot(availablePlayers, teams);
        setSnapshotSaved(true);
        console.log('[Snapshot] ✅ Initial snapshot saved');

        // Upload all images to Firebase Storage in the background
        const { availablePlayers: latestPlayers, teams: latestTeams } = useAuctionStore.getState();
        const imageItems = [
          ...latestPlayers
            .filter((p) => p.imageUrl && !p.imageUrl.startsWith('data:'))
            .map((p) => ({
              url: p.imageUrl!,
              storagePath: `images/players/${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            })),
          ...latestTeams
            .filter((t) => t.logoUrl && !t.logoUrl.startsWith('data:'))
            .map((t) => ({
              url: t.logoUrl!,
              storagePath: `images/teams/${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
            })),
        ];
        batchPreloadImages(imageItems, { maxConcurrent: 3 }).catch(() => {});

      } catch (error) {
        console.error('[Snapshot] Failed to save initial snapshot:', error);
      }
    };

    saveSnapshot();
  }, [enabled, availablePlayers, teams, snapshotSaved]);

  return { snapshotSaved };
}

/**
 * Live subscription to teams in Firebase for mirror mode. Sold/unsold stay
 * live through startSettledPlayersSync() in every mode.
 */
export function useMirrorLiveSync(enabled = true) {
  const { setTeams } = useAuctionStore();

  useEffect(() => {
    if (!enabled) return;

    const unsubTeams = auctionPersistence.subscribeTeams((teams) => {
      setTeams(teams);
    });

    return () => {
      unsubTeams();
    };
  }, [enabled, setTeams]);
}
