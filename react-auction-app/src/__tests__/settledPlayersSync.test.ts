import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SoldPlayerRecord, UnsoldPlayerRecord } from '../services/auctionPersistence';
import type { Player } from '../types';

type SoldListener = (records: SoldPlayerRecord[]) => void;
type UnsoldListener = (records: UnsoldPlayerRecord[]) => void;

const listeners = vi.hoisted(() => ({
  sold: null as null | ((records: unknown[]) => void),
  unsold: null as null | ((records: unknown[]) => void),
  soldFirst: [] as unknown[],
  unsoldFirst: [] as unknown[],
}));

vi.mock('../services/auctionPersistence', () => ({
  auctionPersistence: {
    initialize: vi.fn(),
    subscribeSoldPlayers: (cb: SoldListener) => {
      listeners.sold = cb as (records: unknown[]) => void;
      cb(listeners.soldFirst as SoldPlayerRecord[]);
      return () => { listeners.sold = null; };
    },
    subscribeUnsoldPlayers: (cb: UnsoldListener) => {
      listeners.unsold = cb as (records: unknown[]) => void;
      cb(listeners.unsoldFirst as UnsoldPlayerRecord[]);
      return () => { listeners.unsold = null; };
    },
    saveSoldPlayer: vi.fn(),
    saveUnsoldPlayer: vi.fn(),
    removeUnsoldPlayer: vi.fn(),
    saveTeams: vi.fn(),
    clearUnsoldPlayers: vi.fn(),
  },
}));

vi.mock('../services/realtimeSync', () => ({
  realtimeSync: {
    getDatabase: vi.fn().mockReturnValue({}),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    broadcastState: vi.fn(),
  },
}));

vi.mock('../services/premiumService', () => ({ premiumService: { initialize: vi.fn() } }));

import { useAuctionStore } from '../store/auctionStore';
import { setActiveTenant } from '../services/tenantPath';
import { startSettledPlayersSync } from '../services/settledPlayersSync';

const soldRecord = (overrides: Partial<SoldPlayerRecord> = {}): SoldPlayerRecord => ({
  id: 'P1',
  playerName: 'Ravi Kumar',
  role: 'Batsman',
  age: 25,
  matches: '10',
  bestFigures: 'N/A',
  teamName: 'Team A',
  soldAmount: 30,
  basePrice: 10,
  imageUrl: '/old.jpg',
  timestamp: Date.UTC(2026, 0, 1),
  ...overrides,
});

const player = (overrides: Partial<Player> = {}): Player => ({
  id: 'P1',
  name: 'Ravi Kumar',
  imageUrl: '/img.jpg',
  role: 'Batsman',
  age: 25,
  matches: '10',
  runs: '0',
  wickets: '0',
  battingBestFigures: '',
  bowlingBestFigures: '',
  basePrice: 10,
  ...overrides,
});

describe('startSettledPlayersSync', () => {
  beforeEach(() => {
    listeners.soldFirst = [];
    listeners.unsoldFirst = [];
    // A tenant change stops any running session and clears the sold/unsold lists.
    setActiveTenant('tenant_a');
    setActiveTenant('tenant_b');
    useAuctionStore.setState({ soldPlayers: [], unsoldPlayers: [], availablePlayers: [], originalPlayers: [], teams: [] });
  });

  it('replaces stale local sold/unsold data with the database even when the database is empty', async () => {
    useAuctionStore.setState({
      soldPlayers: [{ ...player(), soldAmount: 5, teamName: 'Old', soldDate: '' }],
      unsoldPlayers: [{ ...player({ id: 'P2', name: 'Old Unsold' }), round: 'Round 1', unsoldDate: '' }],
    });

    await startSettledPlayersSync();

    expect(useAuctionStore.getState().soldPlayers).toEqual([]);
    expect(useAuctionStore.getState().unsoldPlayers).toEqual([]);
  });

  it('loads sold records from the database and keeps following later edits', async () => {
    listeners.soldFirst = [soldRecord()];
    await startSettledPlayersSync();
    expect(useAuctionStore.getState().soldPlayers.map(p => [p.id, p.soldAmount, p.teamName])).toEqual([['P1', 30, 'Team A']]);

    listeners.sold?.([soldRecord({ soldAmount: 45, teamName: 'Team B' })]);
    const [edited] = useAuctionStore.getState().soldPlayers;
    expect(edited.soldAmount).toBe(45);
    expect(edited.teamName).toBe('Team B');
    expect(edited.soldDate).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
  });

  it('removes freshly loaded sold players from the available pool', async () => {
    useAuctionStore.setState({ availablePlayers: [player(), player({ id: 'P9', name: 'Someone Else' })] });
    listeners.soldFirst = [soldRecord()];

    await startSettledPlayersSync();

    expect(useAuctionStore.getState().availablePlayers.map(p => p.id)).toEqual(['P9']);
  });

  it('shows the Players-list details on sold records while keeping the sale fields', async () => {
    useAuctionStore.getState().setPlayers([player({ name: 'Ravi K', role: 'Bowler', imageUrl: '/new.jpg' })]);
    listeners.soldFirst = [soldRecord()];

    await startSettledPlayersSync();

    const [sold] = useAuctionStore.getState().soldPlayers;
    expect(sold).toMatchObject({ name: 'Ravi K', role: 'Bowler', imageUrl: '/new.jpg', soldAmount: 30, teamName: 'Team A' });
  });
});
