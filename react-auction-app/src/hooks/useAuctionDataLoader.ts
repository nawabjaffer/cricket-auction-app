// ============================================================================
// AUCTION DATA LOADER HOOK
// Loads initial data and restores state from Firebase on app start
// ============================================================================

import { useEffect, useState } from 'react';
import { auctionPersistence } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { batchPreloadImages } from '../services/firebaseStorageService';
import { getActiveTenant, onTenantChange } from '../services/tenantPath';
import { useAuctionStore } from '../store/auctionStore';
import type { SoldPlayer } from '../types';

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

  const { 
    setTeams, 
    setSoldPlayers, 
    setUnsoldPlayers,
  } = useAuctionStore();

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

        // Check if there's existing auction data in Firebase
        const hasData = await auctionPersistence.hasExistingData();

        if (!hasData) {
          console.log('[DataLoader] No existing Firebase data found');
          setIsRestoring(false);
          return;
        }

        console.log('[DataLoader] Found existing data, restoring from Firebase...');

        // Load sold and unsold players
        const [soldRecords, unsoldRecords, savedTeams, adminSettings] = await Promise.all([
          auctionPersistence.getSoldPlayers(),
          auctionPersistence.getUnsoldPlayers(),
          auctionPersistence.getTeams(),
          auctionPersistence.getAdminSettings(),
        ]);

        // Convert sold records back to SoldPlayer format
        const restoredSoldPlayers: SoldPlayer[] = soldRecords.map(record => ({
          id: record.id,
          name: record.playerName,
          role: record.role as SoldPlayer['role'],
          age: record.age,
          matches: record.matches,
          runs: '',
          wickets: '',
          battingBestFigures: '',
          bowlingBestFigures: record.bestFigures,
          basePrice: record.basePrice,
          imageUrl: record.imageUrl,
          soldAmount: record.soldAmount,
          teamName: record.teamName,
          teamId: savedTeams?.find(t => t.name === record.teamName)?.id,
          soldDate: new Date(record.timestamp).toISOString(),
        }));

        // Convert unsold records back to UnsoldPlayer format
        const restoredUnsoldPlayers = unsoldRecords.map(record => ({
          id: record.id,
          name: record.name,
          role: record.role as SoldPlayer['role'],
          age: record.age,
          matches: record.matches,
          runs: '',
          wickets: '',
          battingBestFigures: '',
          bowlingBestFigures: record.bowlingBest,
          basePrice: record.basePrice,
          imageUrl: record.imageUrl,
          round: record.round,
          unsoldDate: new Date(record.timestamp).toISOString(),
        }));

        // Update store with restored data
        setSoldPlayers(restoredSoldPlayers);
        setUnsoldPlayers(restoredUnsoldPlayers);

        if (savedTeams) {
          setTeams(savedTeams);
        }

        if (adminSettings?.maxUnsoldRounds !== undefined) {
          useAuctionStore.getState().setMaxUnsoldRounds(adminSettings.maxUnsoldRounds);
        }

        // Reconcile available players to exclude sold/unsold
        useAuctionStore.getState().reconcilePlayerPools();

        setHasRestoredData(true);
        _restoreCompleteByTenant.add(tenantId);
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
  }, [tenantId, hasRestoredData, isRestoring, setSoldPlayers, setUnsoldPlayers, setTeams]);

  return {
    isRestoring,
    hasRestoredData,
  };
}

/**
 * Hook to save initial snapshot when data is loaded from Google Sheets
 */
export function useSaveInitialSnapshot() {
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const { availablePlayers, teams } = useAuctionStore();

  useEffect(() => {
    const saveSnapshot = async () => {
      // Only save if we have data and haven't saved yet
      if (snapshotSaved || availablePlayers.length === 0 || teams.length === 0) {
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
  }, [availablePlayers, teams, snapshotSaved]);

  return { snapshotSaved };
}
