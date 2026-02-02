// ============================================================================
// AUCTION DATA LOADER HOOK
// Loads initial data and restores state from Firebase on app start
// ============================================================================

import { useEffect, useState } from 'react';
import { auctionPersistence } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { useAuctionStore } from '../store/auctionStore';
import type { SoldPlayer } from '../types';

export function useAuctionDataLoader() {
  const [isRestoring, setIsRestoring] = useState(false);
  const [hasRestoredData, setHasRestoredData] = useState(false);

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
        console.log('[DataLoader] ✅ Data restored from Firebase:', {
          soldPlayers: restoredSoldPlayers.length,
          unsoldPlayers: restoredUnsoldPlayers.length,
          teams: savedTeams?.length || 0,
        });

      } catch (error) {
        console.error('[DataLoader] Failed to restore data from Firebase:', error);
      } finally {
        setIsRestoring(false);
      }
    };

    // Only attempt restore once
    if (!hasRestoredData && !isRestoring) {
      restoreDataFromFirebase();
    }
  }, [hasRestoredData, isRestoring, setSoldPlayers, setUnsoldPlayers, setTeams]);

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

      } catch (error) {
        console.error('[Snapshot] Failed to save initial snapshot:', error);
      }
    };

    saveSnapshot();
  }, [availablePlayers, teams, snapshotSaved]);

  return { snapshotSaved };
}
