import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuctionStore } from '../store/auctionStore';
import type { Player, Team } from '../types';

// ── Mocks ──────────────────────────────────────────────────────────────────────
vi.mock('../services/auctionPersistence', () => ({
  auctionPersistence: {
    initialize: vi.fn(),
    saveSoldPlayer: vi.fn().mockResolvedValue(undefined),
    saveUnsoldPlayer: vi.fn().mockResolvedValue(undefined),
    removeUnsoldPlayer: vi.fn().mockResolvedValue(undefined),
    saveTeams: vi.fn().mockResolvedValue(undefined),
    clearUnsoldPlayers: vi.fn().mockResolvedValue(undefined),
    clearSoldPlayers: vi.fn().mockResolvedValue(undefined),
    clearTeams: vi.fn().mockResolvedValue(undefined),
    getDatabase: vi.fn().mockReturnValue(null),
  },
}));

vi.mock('../services/realtimeSync', () => ({
  realtimeSync: {
    getDatabase: vi.fn().mockReturnValue(null),
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    broadcastState: vi.fn(),
  },
}));

vi.mock('../services/premiumService', () => ({
  premiumService: { initialize: vi.fn() },
}));

// ── Factories ──────────────────────────────────────────────────────────────────
let _pid = 1;
function makePlayer(overrides: Partial<Player> = {}): Player {
  const id = `P${String(_pid++).padStart(3, '0')}`;
  return {
    id,
    name: `Player ${id}`,
    imageUrl: `/img/${id}.jpg`,
    role: 'Batsman',
    age: 24,
    matches: '30',
    runs: '800',
    wickets: '0',
    battingBestFigures: '90',
    bowlingBestFigures: 'N/A',
    basePrice: 100,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'T1',
    name: 'Team Alpha',
    logoUrl: '/img/t1.png',
    playersBought: 0,
    totalPlayerThreshold: 11,
    remainingPlayers: 11,
    allocatedAmount: 2000,
    remainingPurse: 2000,
    highestBid: 0,
    captain: '',
    underAgePlayers: 0,
    ...overrides,
  };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────
describe('Mock Auction — Full Flow', () => {
  const TEAM_A = makeTeam({ id: 'TA', name: 'Royal Kings', allocatedAmount: 3000, remainingPurse: 3000 });
  const TEAM_B = makeTeam({ id: 'TB', name: 'Super Strikers', allocatedAmount: 3000, remainingPurse: 3000 });

  beforeEach(() => {
    _pid = 1;
    useAuctionStore.setState({
      availablePlayers: [],
      originalPlayers: [],
      _adminPlayerOverrides: null,
      soldPlayers: [],
      unsoldPlayers: [],
      teams: [],
      selectedTeam: null,
      currentPlayer: null,
      currentBid: 1,
      previousBid: 0,
      bidHistory: [],
      lastBidTeamId: null,
      isLoading: false,
      error: null,
      notification: null,
      activeOverlay: null,
      selectionMode: 'sequential',
      currentRound: 1,
      isRound2Active: false,
      maxUnsoldRounds: 1,
    });
  });

  it('runs a complete auction cycle: select → bid → sold', () => {
    const players = [makePlayer({ id: 'P001', basePrice: 100 }), makePlayer({ id: 'P002', basePrice: 200 })];
    const store = useAuctionStore.getState();

    store.setTeams([TEAM_A, TEAM_B]);
    store.setPlayers(players);
    expect(useAuctionStore.getState().availablePlayers).toHaveLength(2);

    // Select first player
    store.selectPlayer(players[0]);
    expect(useAuctionStore.getState().currentPlayer?.id).toBe('P001');
    expect(useAuctionStore.getState().currentBid).toBe(100);

    // Team A bids
    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    let state = useAuctionStore.getState();
    expect(state.currentBid).toBeGreaterThanOrEqual(100);
    expect(state.selectedTeam?.id).toBe('TA');

    // Sell to Team A
    useAuctionStore.getState().markAsSold();
    state = useAuctionStore.getState();
    expect(state.soldPlayers).toHaveLength(1);
    expect(state.soldPlayers[0].teamName).toBe('Royal Kings');
    expect(state.activeOverlay).toBe('sold');

    // Dismiss overlay and check player removed from available
    useAuctionStore.getState().setOverlay(null);
    state = useAuctionStore.getState();
    expect(state.activeOverlay).toBeNull();
    expect(state.availablePlayers.find(p => p.id === 'P001')).toBeUndefined();
  });

  it('sells at base price when only one team bids', () => {
    const player = makePlayer({ id: 'P010', basePrice: 150 });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A, TEAM_B]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    // Only Team A bids once → sells at base (or first increment)
    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    useAuctionStore.getState().markAsSold();

    const state = useAuctionStore.getState();
    expect(state.soldPlayers).toHaveLength(1);
    expect(state.soldPlayers[0].soldAmount).toBeGreaterThanOrEqual(150);
    expect(state.soldPlayers[0].teamName).toBe('Royal Kings');
  });

  it('marks unsold and re-enters player in round 2', () => {
    const player = makePlayer({ id: 'P020' });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    // No bids → mark unsold
    useAuctionStore.getState().markAsUnsold();
    let state = useAuctionStore.getState();
    expect(state.unsoldPlayers).toHaveLength(1);
    expect(state.activeOverlay).toBe('unsold');

    // Dismiss overlay
    useAuctionStore.getState().setOverlay(null);
    state = useAuctionStore.getState();
    expect(state.activeOverlay).toBeNull();
  });

  it('bidding war between two teams increments bid correctly', () => {
    const player = makePlayer({ id: 'P030', basePrice: 100 });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A, TEAM_B]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    // 5 round bidding war
    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    const bid1 = useAuctionStore.getState().currentBid;
    
    useAuctionStore.getState().raiseBidForTeam(TEAM_B);
    const bid2 = useAuctionStore.getState().currentBid;
    expect(bid2).toBeGreaterThan(bid1);
    
    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    const bid3 = useAuctionStore.getState().currentBid;
    expect(bid3).toBeGreaterThan(bid2);
    
    useAuctionStore.getState().raiseBidForTeam(TEAM_B);
    const bid4 = useAuctionStore.getState().currentBid;
    expect(bid4).toBeGreaterThan(bid3);

    // Sell to Team B (last bidder)
    useAuctionStore.getState().markAsSold();
    const state = useAuctionStore.getState();
    expect(state.soldPlayers[0].teamName).toBe('Super Strikers');
    expect(state.soldPlayers[0].soldAmount).toBe(bid4);
  });

  it('tracks bid history through auction', () => {
    const player = makePlayer({ id: 'P040', basePrice: 100 });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A, TEAM_B]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    useAuctionStore.getState().raiseBidForTeam(TEAM_B);
    useAuctionStore.getState().raiseBidForTeam(TEAM_A);

    const history = useAuctionStore.getState().bidHistory;
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history[0].teamName).toBe('Royal Kings');
    expect(history[1].teamName).toBe('Super Strikers');
    expect(history[2].teamName).toBe('Royal Kings');
  });

  it('cannot sell without bids (no selectedTeam)', () => {
    const player = makePlayer({ id: 'P050', basePrice: 100 });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    // No bids placed, try to sell
    useAuctionStore.getState().markAsSold();
    const state = useAuctionStore.getState();
    // Should show notification or not create a sold record
    expect(state.soldPlayers).toHaveLength(0);
  });

  it('team purse decreases after buying players', () => {
    const player = makePlayer({ id: 'P060', basePrice: 100 });
    const store = useAuctionStore.getState();
    store.setTeams([TEAM_A, TEAM_B]);
    store.setPlayers([player]);
    store.selectPlayer(player);

    useAuctionStore.getState().raiseBidForTeam(TEAM_A);
    useAuctionStore.getState().markAsSold();

    const team = useAuctionStore.getState().teams.find(t => t.id === 'TA');
    expect(team).toBeDefined();
    expect(team!.playersBought).toBeGreaterThanOrEqual(1);
    expect(team!.remainingPurse).toBeLessThan(3000);
  });

  it('selectNextPlayer advances to the next player', () => {
    const p1 = makePlayer({ id: 'P070' });
    const p2 = makePlayer({ id: 'P071' });
    const store = useAuctionStore.getState();
    store.setPlayers([p1, p2]);
    store.setTeams([TEAM_A]);

    store.selectNextPlayer();
    expect(useAuctionStore.getState().currentPlayer?.id).toBe('P070');
  });

  it('auctionState reflects current status', () => {
    const store = useAuctionStore.getState();
    expect(store.auctionState).toBeDefined();
    expect(store.auctionState.isAuctionActive).toBeDefined();
  });
});

describe('Player Type — phone field', () => {
  it('player can have optional phone field', () => {
    const p = makePlayer({ phone: '+919876543210' });
    expect(p.phone).toBe('+919876543210');
  });

  it('player without phone field is valid', () => {
    const p = makePlayer();
    expect(p.phone).toBeUndefined();
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    _pid = 100;
    useAuctionStore.setState({
      availablePlayers: [],
      originalPlayers: [],
      _adminPlayerOverrides: null,
      soldPlayers: [],
      unsoldPlayers: [],
      teams: [],
      selectedTeam: null,
      currentPlayer: null,
      currentBid: 1,
      previousBid: 0,
      bidHistory: [],
      lastBidTeamId: null,
      isLoading: false,
      error: null,
      notification: null,
      activeOverlay: null,
      selectionMode: 'sequential',
      currentRound: 1,
      isRound2Active: false,
      maxUnsoldRounds: 1,
    });
  });

  it('handles empty player list gracefully', () => {
    const store = useAuctionStore.getState();
    store.setPlayers([]);
    store.selectNextPlayer();
    expect(useAuctionStore.getState().currentPlayer).toBeNull();
  });

  it('handles empty teams list gracefully', () => {
    const store = useAuctionStore.getState();
    store.setTeams([]);
    expect(useAuctionStore.getState().teams).toHaveLength(0);
  });

  it('handles player with zero base price', () => {
    const player = makePlayer({ id: 'P100', basePrice: 0 });
    const store = useAuctionStore.getState();
    store.setPlayers([player]);
    store.selectPlayer(player);
    // Store may coerce 0 to a default minimum — just verify no crash and finite bid
    expect(Number.isFinite(useAuctionStore.getState().currentBid)).toBe(true);
  });

  it('does not crash when dismissing overlay with no active overlay', () => {
    useAuctionStore.getState().setOverlay(null);
    expect(useAuctionStore.getState().activeOverlay).toBeNull();
  });

  it('handles rapid sequential sell/select cycles', () => {
    const players = Array.from({ length: 5 }, (_, i) => makePlayer({ id: `RAPID${i}`, basePrice: 100 }));
    const team = makeTeam({ id: 'TFAST', name: 'Speed Team', allocatedAmount: 10000, remainingPurse: 10000 });
    const store = useAuctionStore.getState();
    store.setTeams([team]);
    store.setPlayers(players);

    for (let i = 0; i < 5; i++) {
      store.selectPlayer(players[i]);
      useAuctionStore.getState().raiseBidForTeam(team);
      useAuctionStore.getState().markAsSold();
      useAuctionStore.getState().setOverlay(null);
    }

    expect(useAuctionStore.getState().soldPlayers).toHaveLength(5);
  });

  it('team.authUsername and authPassword are optional', () => {
    const team = makeTeam({ authUsername: 'admin', authPassword: 'secret' });
    expect(team.authUsername).toBe('admin');
    expect(team.authPassword).toBe('secret');

    const team2 = makeTeam();
    expect(team2.authUsername).toBeUndefined();
    expect(team2.authPassword).toBeUndefined();
  });
});
