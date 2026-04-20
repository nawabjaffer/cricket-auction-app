import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuctionStore } from '../store/auctionStore';
import type { Player, Team } from '../types';

/**
 * SMOKE TEST: End-to-end auction simulation
 * Simulates a complete auction cycle:
 *   1. Load players and teams
 *   2. Select players sequentially
 *   3. Bid on players with teams
 *   4. Mark sold / unsold
 *   5. Round 2 with unsold players
 *   6. Final stats verification
 */

// Mock Firebase
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

function makePlayers(count: number): Player[] {
  const roles: Player['role'][] = ['Batsman', 'Bowler', 'All-Rounder', 'Wicket Keeper Batsman'];
  return Array.from({ length: count }, (_, i) => ({
    id: `P${String(i + 1).padStart(3, '0')}`,
    name: `Player ${i + 1}`,
    imageUrl: `/img/p${i + 1}.jpg`,
    role: roles[i % roles.length],
    age: 20 + (i % 15),
    matches: String(10 + i * 3),
    runs: String(100 + i * 50),
    wickets: String(i * 2),
    battingBestFigures: `${50 + i}`,
    bowlingBestFigures: `${i}/30`,
    basePrice: 100,
  }));
}

function makeTeams(): Team[] {
  return [
    {
      id: 'TeamA', name: 'Team Alpha', logoUrl: '', playersBought: 0,
      totalPlayerThreshold: 4, remainingPlayers: 4, allocatedAmount: 2000,
      remainingPurse: 2000, highestBid: 0, captain: '', underAgePlayers: 0,
    },
    {
      id: 'TeamB', name: 'Team Beta', logoUrl: '', playersBought: 0,
      totalPlayerThreshold: 4, remainingPlayers: 4, allocatedAmount: 2000,
      remainingPurse: 2000, highestBid: 0, captain: '', underAgePlayers: 0,
    },
  ];
}

describe('Smoke Test: Full Auction Simulation', () => {
  beforeEach(() => {
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

  it('runs a complete auction with sold and unsold players', () => {
    const store = useAuctionStore.getState();
    const players = makePlayers(6);
    const teams = makeTeams();

    // Step 1: Load data
    store.setTeams(teams);
    store.setPlayers(players);
    expect(useAuctionStore.getState().availablePlayers.length).toBe(6);
    expect(useAuctionStore.getState().teams.length).toBe(2);

    // Step 2: Select player 1 (sequential)
    useAuctionStore.getState().selectNextPlayer();
    let state = useAuctionStore.getState();
    expect(state.currentPlayer).not.toBeNull();
    const firstPlayerId = state.currentPlayer!.id;
    expect(state.currentBid).toBe(100);

    // Step 3: Team Alpha bids
    const teamA = useAuctionStore.getState().teams[0];
    const bidResult = useAuctionStore.getState().raiseBidForTeam(teamA);
    expect(bidResult).toBe(true);
    state = useAuctionStore.getState();
    expect(state.selectedTeam?.id).toBe('TeamA');
    expect(state.currentBid).toBeGreaterThan(100);

    // Step 4: Mark as sold
    useAuctionStore.getState().markAsSold();
    state = useAuctionStore.getState();
    expect(state.soldPlayers).toHaveLength(1);
    expect(state.soldPlayers[0].id).toBe(firstPlayerId);
    expect(state.soldPlayers[0].teamName).toBe('Team Alpha');
    expect(state.availablePlayers.length).toBe(5);
    expect(state.activeOverlay).toBe('sold');

    // Verify team stats updated
    const updatedTeamA = state.teams.find(t => t.id === 'TeamA')!;
    expect(updatedTeamA.playersBought).toBe(1);
    expect(updatedTeamA.remainingPurse).toBeLessThan(2000);

    // Step 5: Close overlay, select next player
    useAuctionStore.getState().setOverlay(null);
    useAuctionStore.getState().clearCurrentPlayer();
    useAuctionStore.getState().selectNextPlayer();
    state = useAuctionStore.getState();
    expect(state.currentPlayer).not.toBeNull();
    expect(state.currentPlayer!.id).not.toBe(firstPlayerId);

    // Step 6: Mark player 2 as unsold
    useAuctionStore.getState().markAsUnsold();
    state = useAuctionStore.getState();
    expect(state.unsoldPlayers).toHaveLength(1);
    expect(state.availablePlayers.length).toBe(4);
    expect(state.activeOverlay).toBe('unsold');

    // Step 7: Sell remaining available players alternating teams
    useAuctionStore.getState().setOverlay(null);
    useAuctionStore.getState().clearCurrentPlayer();

    let soldCount = 1; // already sold 1
    let teamToggle = 1; // start with Team Beta
    while (useAuctionStore.getState().availablePlayers.length > 0 && soldCount < 6) {
      useAuctionStore.getState().selectNextPlayer();
      const curState = useAuctionStore.getState();
      if (!curState.currentPlayer) break;

      const t = curState.teams[teamToggle % 2];

      // Reset lastBidTeamId so teams can bid
      useAuctionStore.setState({ lastBidTeamId: null });

      const ok = useAuctionStore.getState().raiseBidForTeam(t);
      if (ok) {
        useAuctionStore.getState().markAsSold();
        soldCount++;
        teamToggle++;
      } else {
        // If can't bid, mark unsold
        useAuctionStore.getState().markAsUnsold();
      }
      useAuctionStore.getState().setOverlay(null);
      useAuctionStore.getState().clearCurrentPlayer();
    }

    // Step 8: Verify final state
    state = useAuctionStore.getState();
    const totalProcessed = state.soldPlayers.length + state.unsoldPlayers.length;
    expect(totalProcessed).toBeGreaterThanOrEqual(2); // at least 1 sold + 1 unsold
    expect(state.soldPlayers.length).toBeGreaterThanOrEqual(1);

    // Step 9: Verify team purse integrity
    for (const team of state.teams) {
      // Purse should never go negative
      expect(team.remainingPurse).toBeGreaterThanOrEqual(0);
      // Players bought should be within threshold
      expect(team.playersBought).toBeLessThanOrEqual(team.totalPlayerThreshold);
    }

    // Step 10: Player stats
    const stats = state.getPlayerStats();
    expect(stats.total).toBe(6);
    expect(stats.sold + stats.unsold + stats.available).toBe(6);
  });

  it('handles players with null/undefined roles without crashing', () => {
    const players: Player[] = [
      {
        id: 'P012', name: 'No Role Player', imageUrl: '',
        role: undefined as unknown as Player['role'],
        age: null, matches: '', runs: '', wickets: '',
        battingBestFigures: '', bowlingBestFigures: '', basePrice: 100,
      },
      {
        id: 'P013', name: 'Null Role Player', imageUrl: '',
        role: null as unknown as Player['role'],
        age: 25, matches: '10', runs: '200', wickets: '5',
        battingBestFigures: '50', bowlingBestFigures: '3/20', basePrice: 100,
      },
    ];
    const teams = makeTeams();

    // Should not throw
    expect(() => {
      useAuctionStore.getState().setTeams(teams);
      useAuctionStore.getState().setPlayers(players);
    }).not.toThrow();

    expect(useAuctionStore.getState().availablePlayers.length).toBe(2);

    // Select and sell without crash
    useAuctionStore.getState().selectNextPlayer();
    const player = useAuctionStore.getState().currentPlayer!;
    expect(player).toBeTruthy();
    expect(Number.isFinite(useAuctionStore.getState().currentBid)).toBe(true);

    // Raise bid and sell - team has enough purse (2000)
    useAuctionStore.setState({ lastBidTeamId: null });
    const team = useAuctionStore.getState().teams[0];
    const bidOk = useAuctionStore.getState().raiseBidForTeam(team);
    expect(bidOk).toBe(true);
    useAuctionStore.getState().markAsSold();
    expect(useAuctionStore.getState().soldPlayers).toHaveLength(1);
  });

  it('handles malformed role/imageUrl payloads without crashing live flow', () => {
    const players: Player[] = [
      {
        id: 'P099',
        name: 'Malformed Payload Player',
        imageUrl: 123 as unknown as string,
        role: { invalid: true } as unknown as Player['role'],
        age: 24,
        matches: '8',
        runs: '120',
        wickets: '3',
        battingBestFigures: '42',
        bowlingBestFigures: '2/18',
        basePrice: 100,
      },
    ];

    useAuctionStore.getState().setTeams(makeTeams());
    expect(() => useAuctionStore.getState().setPlayers(players)).not.toThrow();
    expect(() => useAuctionStore.getState().selectNextPlayer()).not.toThrow();
    expect(useAuctionStore.getState().currentPlayer?.id).toBe('P099');
  });

  it('handles players with missing/invalid basePrice', () => {
    const players: Player[] = [
      {
        id: 'P020', name: 'Zero Price', imageUrl: '',
        role: 'Batsman', age: 22, matches: '5', runs: '100', wickets: '0',
        battingBestFigures: '', bowlingBestFigures: '', basePrice: 0 as unknown as number,
      },
      {
        id: 'P021', name: 'Negative Price', imageUrl: '',
        role: 'Bowler', age: 23, matches: '10', runs: '50', wickets: '15',
        battingBestFigures: '', bowlingBestFigures: '4/20', basePrice: -5 as unknown as number,
      },
    ];

    useAuctionStore.getState().setTeams(makeTeams());
    useAuctionStore.getState().setPlayers(players);

    useAuctionStore.getState().selectNextPlayer();
    const state = useAuctionStore.getState();
    // Should have a valid finite bid even with 0 or negative base price
    // The store uses fallback from activeConfig.auction.basePrice (100)
    expect(Number.isFinite(state.currentBid)).toBe(true);
    expect(state.currentBid).toBeGreaterThan(0);
  });

  it('prevents team from exceeding player threshold', () => {
    const players = makePlayers(5);
    const teams = [
      {
        id: 'T1', name: 'Small Team', logoUrl: '', playersBought: 0,
        totalPlayerThreshold: 2, remainingPlayers: 2, allocatedAmount: 2000,
        remainingPurse: 2000, highestBid: 0, captain: '', underAgePlayers: 0,
      },
    ];

    useAuctionStore.getState().setTeams(teams);
    useAuctionStore.getState().setPlayers(players);

    // Buy 2 players
    for (let i = 0; i < 2; i++) {
      useAuctionStore.getState().selectNextPlayer();
      useAuctionStore.setState({ lastBidTeamId: null });
      const team = useAuctionStore.getState().teams[0];
      useAuctionStore.getState().raiseBidForTeam(team);
      useAuctionStore.getState().markAsSold();
      useAuctionStore.getState().setOverlay(null);
      useAuctionStore.getState().clearCurrentPlayer();
    }

    // 3rd player: team should be full
    useAuctionStore.getState().selectNextPlayer();
    useAuctionStore.setState({ lastBidTeamId: null });
    const fullTeam = useAuctionStore.getState().teams[0];
    expect(fullTeam.playersBought).toBe(2);

    const eligible = useAuctionStore.getState().getEligibleTeams();
    expect(eligible.some(t => t.id === 'T1')).toBe(false);
  });

  it('round 2: auto-starts with unsold players', () => {
    const players = makePlayers(3);
    useAuctionStore.getState().setTeams(makeTeams());
    useAuctionStore.getState().setPlayers(players);

    // Mark all as unsold
    for (let i = 0; i < 3; i++) {
      useAuctionStore.getState().selectNextPlayer();
      useAuctionStore.getState().markAsUnsold();
      useAuctionStore.getState().setOverlay(null);
      useAuctionStore.getState().clearCurrentPlayer();
    }

    let state = useAuctionStore.getState();
    expect(state.availablePlayers).toHaveLength(0);
    expect(state.unsoldPlayers).toHaveLength(3);

    // selectNextPlayer should trigger Round 2
    useAuctionStore.getState().selectNextPlayer();
    state = useAuctionStore.getState();
    expect(state.currentRound).toBe(2);
    expect(state.currentPlayer).not.toBeNull();
    expect(state.availablePlayers.length).toBeGreaterThan(0);
  });
});
