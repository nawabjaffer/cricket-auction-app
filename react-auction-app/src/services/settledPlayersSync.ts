// ============================================================================
// SETTLED PLAYERS SYNC
// Keeps the sold/unsold lists in the store identical to the Realtime Database.
// The first payload is the restore on load; later payloads keep every tab and
// device current, so edits made elsewhere never leave a stale list behind.
// ============================================================================

import { auctionPersistence, type SoldPlayerRecord, type UnsoldPlayerRecord } from './auctionPersistence';
import { realtimeSync } from './realtimeSync';
import { getActiveTenant, onTenantChange } from './tenantPath';
import { useAuctionStore } from '../store/auctionStore';
import type { SoldPlayer, UnsoldPlayer } from '../types';

interface SyncSession {
  tenantId: string;
  ready: Promise<void>;
  stop: () => void;
}

let session: SyncSession | null = null;

function toSoldPlayer(record: SoldPlayerRecord): SoldPlayer {
  const { teams } = useAuctionStore.getState();
  return {
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
    teamId: record.teamId || teams.find(team => team.name === record.teamName)?.id,
    soldDate: new Date(record.timestamp).toISOString(),
  };
}

function toUnsoldPlayer(record: UnsoldPlayerRecord): UnsoldPlayer {
  return {
    id: record.id,
    name: record.name,
    role: record.role as UnsoldPlayer['role'],
    age: record.age,
    matches: record.matches ?? '',
    runs: '',
    wickets: '',
    battingBestFigures: '',
    bowlingBestFigures: record.bowlingBest,
    basePrice: record.basePrice,
    imageUrl: record.imageUrl,
    round: record.round,
    unsoldDate: new Date(record.timestamp).toISOString(),
  };
}

/**
 * Starts (once per tenant) the live sold/unsold subscriptions and resolves after
 * both lists have been read from the database.
 */
export function startSettledPlayersSync(): Promise<void> {
  const tenantId = getActiveTenant();
  if (session?.tenantId === tenantId) return session.ready;
  session?.stop();

  const unsubscribers: Array<() => void> = [];
  const ready = (async () => {
    await realtimeSync.ensureInitialized();
    const db = realtimeSync.getDatabase();
    if (!db) {
      session = null;
      return;
    }
    auctionPersistence.initialize(db);

    await new Promise<void>(resolve => {
      let soldLoaded = false;
      let unsoldLoaded = false;
      const finishIfLoaded = () => { if (soldLoaded && unsoldLoaded) resolve(); };

      unsubscribers.push(auctionPersistence.subscribeSoldPlayers(records => {
        const store = useAuctionStore.getState();
        store.setSoldPlayers(records.map(toSoldPlayer));
        store.reconcilePlayerPools();
        soldLoaded = true;
        finishIfLoaded();
      }));

      unsubscribers.push(auctionPersistence.subscribeUnsoldPlayers(records => {
        const store = useAuctionStore.getState();
        store.setUnsoldPlayers(records.map(toUnsoldPlayer));
        // Only the first payload prunes the pool: starting round 2 empties this list before its DB write lands.
        if (!unsoldLoaded) store.reconcilePlayerPools();
        unsoldLoaded = true;
        finishIfLoaded();
      }));
    });
  })();

  session = { tenantId, ready, stop: () => unsubscribers.forEach(stop => stop()) };
  ready.catch(() => { if (session?.ready === ready) session = null; });
  return ready;
}

onTenantChange(() => {
  session?.stop();
  session = null;
  const store = useAuctionStore.getState();
  store.setSoldPlayers([]);
  store.setUnsoldPlayers([]);
});
