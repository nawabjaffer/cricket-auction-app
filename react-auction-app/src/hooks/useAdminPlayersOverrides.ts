import { useEffect } from 'react';
import { auctionPersistence } from '../services/auctionPersistence';
import { realtimeSync } from '../services/realtimeSync';
import { useAuctionStore } from '../store/auctionStore';

/**
 * Apply admin-edited player list overrides from Firebase.
 * Uses setAdminPlayerOverrides so admin data persists across Google Sheets reloads.
 */
export function useAdminPlayersOverrides() {
  useEffect(() => {
    const applyOverrides = async () => {
      try {
        await realtimeSync.ensureInitialized();
        const db = realtimeSync.getDatabase();
        if (!db) return;

        auctionPersistence.initialize(db);
        const adminPlayers = await auctionPersistence.getAdminPlayers();
        if (!adminPlayers || adminPlayers.length === 0) return;

        // Store as admin overrides — these survive Google Sheets reloads
        useAuctionStore.getState().setAdminPlayerOverrides(adminPlayers);
      } catch (error) {
        console.error('[AdminPlayers] Failed to apply admin player overrides:', error);
      }
    };

    applyOverrides();
  }, []);
}
