import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuctionStore } from '../store/auctionStore';
import type { Player, Team, UnsoldPlayer } from '../types';

// Mock Firebase persistence to avoid real DB calls
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
  premiumService: {
    initialize: vi.fn(),
  },
}));

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'P001',
    name: 'Test Batsman',
    imageUrl: '/img/player1.jpg',
    role: 'Batsman',
    age: 25,
    matches: '50',
    runs: '1500',
    wickets: '0',
    battingBestFigures: '120',
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
    playersBought: 3,
    totalPlayerThreshold: 11,
    remainingPlayers: 8,
    allocatedAmount: 2000,
    remainingPurse: 1500,
    highestBid: 200,
    captain: '',
    underAgePlayers: 0,
    ...overrides,
  };
}

describe('Auction Store', () => {
  beforeEach(() => {
    // Reset store between tests
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

  describe('setPlayers', () => {
    it('sets available and original players', () => {
      const players = [makePlayer(), makePlayer({ id: 'P002', name: 'Player 2' })];
      useAuctionStore.getState().setPlayers(players);

      const state = useAuctionStore.getState();
      expect(state.availablePlayers).toHaveLength(2);
      expect(state.originalPlayers).toHaveLength(2);
    });

    it('filters out sold players', () => {
      useAuctionStore.setState({
        soldPlayers: [{
          ...makePlayer({ id: 'P001' }),
          soldAmount: 10,
          teamName: 'Team A',
          soldDate: new Date().toISOString(),
        }],
      });

      useAuctionStore.getState().setPlayers([makePlayer(), makePlayer({ id: 'P002' })]);
      expect(useAuctionStore.getState().availablePlayers).toHaveLength(1);
      expect(useAuctionStore.getState().availablePlayers[0].id).toBe('P002');
    });

    it('filters out captain players', () => {
      useAuctionStore.setState({
        teams: [makeTeam({ captain: 'Test Batsman' })],
      });

      useAuctionStore.getState().setPlayers([makePlayer()]);
      expect(useAuctionStore.getState().availablePlayers).toHaveLength(0);
    });

    it('merges admin overrides on top of base players', () => {
      useAuctionStore.setState({
        _adminPlayerOverrides: [makePlayer({ id: 'P001', name: 'Admin Override Name' })],
      });

      useAuctionStore.getState().setPlayers([makePlayer({ id: 'P001', name: 'Base Name' })]);
      const p = useAuctionStore.getState().availablePlayers[0];
      expect(p.name).toBe('Admin Override Name');
    });
  });

  describe('setTeams', () => {
    it('sets teams', () => {
      const teams = [makeTeam(), makeTeam({ id: 'T2', name: 'Team Beta' })];
      useAuctionStore.getState().setTeams(teams);
      expect(useAuctionStore.getState().teams).toHaveLength(2);
    });
  });

  describe('selectPlayer', () => {
    it('sets current player and bid', () => {
      const player = makePlayer({ basePrice: 100 });
      useAuctionStore.getState().selectPlayer(player);

      const state = useAuctionStore.getState();
      expect(state.currentPlayer).toEqual(player);
      expect(state.currentBid).toBe(100);
      expect(state.selectedTeam).toBeNull();
      expect(state.bidHistory).toEqual([]);
    });

    it('handles NaN basePrice safely', () => {
      const player = makePlayer({ basePrice: NaN });
      useAuctionStore.getState().selectPlayer(player);
      const state = useAuctionStore.getState();
      expect(Number.isFinite(state.currentBid)).toBe(true);
    });

    it('handles undefined basePrice safely', () => {
      const player = makePlayer({ basePrice: undefined as unknown as number });
      useAuctionStore.getState().selectPlayer(player);
      const state = useAuctionStore.getState();
      expect(Number.isFinite(state.currentBid)).toBe(true);
    });
  });

  describe('selectNextPlayer', () => {
    it('selects first available player in sequential mode', () => {
      const p1 = makePlayer({ id: 'P001' });
      const p2 = makePlayer({ id: 'P002' });
      useAuctionStore.setState({ availablePlayers: [p1, p2], selectionMode: 'sequential' });

      useAuctionStore.getState().selectNextPlayer();
      expect(useAuctionStore.getState().currentPlayer?.id).toBe('P001');
    });

    it('prevents skipping during active bidding', () => {
      const player = makePlayer();
      useAuctionStore.setState({
        availablePlayers: [player, makePlayer({ id: 'P002' })],
        currentPlayer: player,
        currentBid: 200,
        bidHistory: [{ teamId: 'T1', teamName: 'Team', amount: 200, timestamp: '' }],
      });

      useAuctionStore.getState().selectNextPlayer();
      expect(useAuctionStore.getState().notification?.type).toBe('warning');
    });

    it('shows notification when no players available', () => {
      useAuctionStore.setState({ availablePlayers: [], unsoldPlayers: [] });
      useAuctionStore.getState().selectNextPlayer();
      expect(useAuctionStore.getState().notification?.type).toBe('info');
    });
  });

  describe('selectTeam / clearTeam', () => {
    it('selects and clears team', () => {
      const team = makeTeam();
      useAuctionStore.getState().selectTeam(team);
      expect(useAuctionStore.getState().selectedTeam).toEqual(team);

      useAuctionStore.getState().clearTeam();
      expect(useAuctionStore.getState().selectedTeam).toBeNull();
    });
  });

  describe('markAsSold', () => {
    it('marks current player as sold', () => {
      const player = makePlayer();
      const team = makeTeam();
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 200,
        selectedTeam: team,
        availablePlayers: [player],
        teams: [team],
      });

      useAuctionStore.getState().markAsSold();
      const state = useAuctionStore.getState();

      expect(state.soldPlayers).toHaveLength(1);
      expect(state.soldPlayers[0].soldAmount).toBe(200);
      expect(state.soldPlayers[0].teamName).toBe('Team Alpha');
      expect(state.availablePlayers).toHaveLength(0);
      expect(state.activeOverlay).toBe('sold');
    });

    it('updates team stats after sale', () => {
      const player = makePlayer();
      const team = makeTeam({ playersBought: 3, remainingPlayers: 8, remainingPurse: 1500 });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 200,
        selectedTeam: team,
        availablePlayers: [player],
        teams: [team],
      });

      useAuctionStore.getState().markAsSold();
      const updatedTeam = useAuctionStore.getState().teams[0];
      expect(updatedTeam.playersBought).toBe(4);
      expect(updatedTeam.remainingPurse).toBe(1300);
    });

    it('rejects when no team selected', () => {
      useAuctionStore.setState({
        currentPlayer: makePlayer(),
        selectedTeam: null,
      });
      useAuctionStore.getState().markAsSold();
      expect(useAuctionStore.getState().notification?.type).toBe('error');
      expect(useAuctionStore.getState().soldPlayers).toHaveLength(0);
    });

    it('rejects double-selling same player', () => {
      const player = makePlayer();
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 200,
        selectedTeam: makeTeam(),
        availablePlayers: [player],
        teams: [makeTeam()],
        soldPlayers: [{
          ...player,
          soldAmount: 200,
          teamName: 'Other Team',
          soldDate: new Date().toISOString(),
        }],
      });

      useAuctionStore.getState().markAsSold();
      expect(useAuctionStore.getState().soldPlayers).toHaveLength(1);
    });
  });

  describe('markAsUnsold', () => {
    it('marks current player as unsold', () => {
      const player = makePlayer();
      useAuctionStore.setState({
        currentPlayer: player,
        availablePlayers: [player],
      });

      useAuctionStore.getState().markAsUnsold();
      const state = useAuctionStore.getState();

      expect(state.unsoldPlayers).toHaveLength(1);
      expect(state.unsoldPlayers[0].round).toBe('Round 1');
      expect(state.availablePlayers).toHaveLength(0);
      expect(state.activeOverlay).toBe('unsold');
    });

    it('rejects when no player selected', () => {
      useAuctionStore.setState({ currentPlayer: null });
      useAuctionStore.getState().markAsUnsold();
      expect(useAuctionStore.getState().notification?.type).toBe('error');
    });

    it('rejects marking sold player as unsold', () => {
      const player = makePlayer();
      useAuctionStore.setState({
        currentPlayer: player,
        soldPlayers: [{
          ...player,
          soldAmount: 10,
          teamName: 'Team',
          soldDate: new Date().toISOString(),
        }],
      });
      useAuctionStore.getState().markAsUnsold();
      expect(useAuctionStore.getState().unsoldPlayers).toHaveLength(0);
    });
  });

  describe('bidding', () => {
    it('raiseBidForTeam increases bid', () => {
      const player = makePlayer({ basePrice: 100 });
      const team = makeTeam({ remainingPurse: 1500, remainingPlayers: 8 });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 100,
        teams: [team],
        lastBidTeamId: null,
      });

      const success = useAuctionStore.getState().raiseBidForTeam(team);
      expect(success).toBe(true);
      expect(useAuctionStore.getState().currentBid).toBeGreaterThan(100);
      expect(useAuctionStore.getState().selectedTeam).toEqual(team);
    });

    it('prevents same team from bidding consecutively', () => {
      const player = makePlayer();
      const team = makeTeam();
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 200,
        lastBidTeamId: 'T1',
        bidHistory: [{ teamId: 'T1', teamName: 'Team', amount: 200, timestamp: '' }],
      });

      const success = useAuctionStore.getState().raiseBidForTeam(team);
      expect(success).toBe(false);
    });

    it('prevents bidding without a player', () => {
      useAuctionStore.setState({ currentPlayer: null });
      const success = useAuctionStore.getState().raiseBidForTeam(makeTeam());
      expect(success).toBe(false);
    });

    it('decrementBid undoes last bid', () => {
      const player = makePlayer({ basePrice: 100 });
      const team1 = makeTeam({ id: 'T1', name: 'Alpha' });
      const team2 = makeTeam({ id: 'T2', name: 'Beta' });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 300,
        selectedTeam: team2,
        teams: [team1, team2],
        bidHistory: [
          { teamId: 'T1', teamName: 'Alpha', amount: 200, timestamp: '' },
          { teamId: 'T2', teamName: 'Beta', amount: 300, timestamp: '' },
        ],
      });

      useAuctionStore.getState().decrementBid();
      const state = useAuctionStore.getState();
      expect(state.currentBid).toBe(200);
      expect(state.selectedTeam?.id).toBe('T1');
    });

    it('resetBid resets to base price', () => {
      const player = makePlayer({ basePrice: 100 });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 500,
        selectedTeam: makeTeam(),
      });

      useAuctionStore.getState().resetBid();
      expect(useAuctionStore.getState().currentBid).toBe(100);
      expect(useAuctionStore.getState().selectedTeam).toBeNull();
    });
  });

  describe('getEligibleTeams', () => {
    it('returns teams that can bid', () => {
      const player = makePlayer({ basePrice: 100 });
      const goodTeam = makeTeam({ id: 'T1', remainingPurse: 1500, remainingPlayers: 6 });
      const fullTeam = makeTeam({ id: 'T2', playersBought: 11, totalPlayerThreshold: 11 });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 100,
        teams: [goodTeam, fullTeam],
      });

      const eligible = useAuctionStore.getState().getEligibleTeams();
      expect(eligible.some(t => t.id === 'T1')).toBe(true);
      expect(eligible.some(t => t.id === 'T2')).toBe(false);
    });

    it('returns all teams when no current player', () => {
      useAuctionStore.setState({
        currentPlayer: null,
        teams: [makeTeam(), makeTeam({ id: 'T2' })],
      });
      expect(useAuctionStore.getState().getEligibleTeams()).toHaveLength(2);
    });
  });

  describe('getMaxBidForTeam', () => {
    it('calculates max bid', () => {
      const team = makeTeam({ remainingPurse: 1500, remainingPlayers: 6 });
      const maxBid = useAuctionStore.getState().getMaxBidForTeam(team);
      expect(maxBid).toBeGreaterThan(0);
    });
  });

  describe('getPlayerStats', () => {
    it('returns correct counts', () => {
      useAuctionStore.setState({
        availablePlayers: [makePlayer(), makePlayer({ id: 'P002' })],
        soldPlayers: [{
          ...makePlayer({ id: 'P003' }),
          soldAmount: 10,
          teamName: 'Team',
          soldDate: '',
        }],
        unsoldPlayers: [{
          ...makePlayer({ id: 'P004' }),
          round: 'R1',
          unsoldDate: '',
        }],
      });

      const stats = useAuctionStore.getState().getPlayerStats();
      expect(stats.total).toBe(4);
      expect(stats.available).toBe(2);
      expect(stats.sold).toBe(1);
      expect(stats.unsold).toBe(1);
    });
  });

  describe('reconcilePlayerPools', () => {
    it('removes sold/unsold players from available', () => {
      const p1 = makePlayer({ id: 'P001' });
      const p2 = makePlayer({ id: 'P002' });
      const p3 = makePlayer({ id: 'P003' });
      useAuctionStore.setState({
        availablePlayers: [p1, p2, p3],
        soldPlayers: [{ ...p1, soldAmount: 10, teamName: 'T', soldDate: '' }],
        unsoldPlayers: [{ ...p2, round: 'R1', unsoldDate: '' }],
        teams: [],
      });

      useAuctionStore.getState().reconcilePlayerPools();
      expect(useAuctionStore.getState().availablePlayers).toHaveLength(1);
      expect(useAuctionStore.getState().availablePlayers[0].id).toBe('P003');
    });
  });

  describe('clearCurrentPlayer', () => {
    it('clears current player and resets bid state', () => {
      useAuctionStore.setState({
        currentPlayer: makePlayer(),
        currentBid: 15,
        selectedTeam: makeTeam(),
      });

      useAuctionStore.getState().clearCurrentPlayer();
      const state = useAuctionStore.getState();
      expect(state.currentPlayer).toBeNull();
      expect(state.selectedTeam).toBeNull();
      expect(state.bidHistory).toEqual([]);
    });
  });

  describe('setOverlay', () => {
    it('sets active overlay', () => {
      useAuctionStore.getState().setOverlay('sold');
      expect(useAuctionStore.getState().activeOverlay).toBe('sold');
    });

    it('clears overlay', () => {
      useAuctionStore.setState({ activeOverlay: 'sold' });
      useAuctionStore.getState().setOverlay(null);
      expect(useAuctionStore.getState().activeOverlay).toBeNull();
    });
  });

  describe('notification', () => {
    it('shows and clears notification', () => {
      useAuctionStore.getState().showNotification('success', 'Test message');
      expect(useAuctionStore.getState().notification).toEqual({ type: 'success', message: 'Test message' });

      useAuctionStore.getState().clearNotification();
      expect(useAuctionStore.getState().notification).toBeNull();
    });
  });

  describe('selectionMode', () => {
    it('toggles between sequential and random', () => {
      expect(useAuctionStore.getState().selectionMode).toBe('sequential');
      useAuctionStore.getState().toggleSelectionMode();
      expect(useAuctionStore.getState().selectionMode).toBe('random');
      useAuctionStore.getState().toggleSelectionMode();
      expect(useAuctionStore.getState().selectionMode).toBe('sequential');
    });
  });

  describe('selectRandomPlayer', () => {
    it('selects a random player from available', () => {
      const players = [makePlayer({ id: 'P001' }), makePlayer({ id: 'P002' }), makePlayer({ id: 'P003' })];
      useAuctionStore.setState({ availablePlayers: players });

      const result = useAuctionStore.getState().selectRandomPlayer();
      expect(result).not.toBeNull();
      expect(players.some(p => p.id === result?.id)).toBe(true);
    });

    it('returns null when no players available', () => {
      useAuctionStore.setState({ availablePlayers: [] });
      expect(useAuctionStore.getState().selectRandomPlayer()).toBeNull();
    });
  });

  describe('clearBidState', () => {
    it('clears bid state but keeps current player', () => {
      const player = makePlayer();
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 500,
        selectedTeam: makeTeam(),
        bidHistory: [{ teamId: 'T1', teamName: 'T', amount: 500, timestamp: '' }],
        lastBidTeamId: 'T1',
        activeOverlay: 'sold',
      });

      useAuctionStore.getState().clearBidState();
      const state = useAuctionStore.getState();
      expect(state.currentPlayer).toEqual(player);
      expect(state.currentBid).toBe(100); // basePrice
      expect(state.selectedTeam).toBeNull();
      expect(state.bidHistory).toEqual([]);
      expect(state.lastBidTeamId).toBeNull();
      expect(state.activeOverlay).toBeNull();
    });
  });

  describe('placeBid', () => {
    it('places a valid bid', () => {
      const player = makePlayer({ basePrice: 100 });
      const team = makeTeam({ remainingPurse: 1500, remainingPlayers: 8 });
      useAuctionStore.setState({
        currentPlayer: player,
        currentBid: 100,
        teams: [team],
        lastBidTeamId: null,
      });

      const result = useAuctionStore.getState().placeBid(200, team);
      expect(result).toBe(true);
      expect(useAuctionStore.getState().currentBid).toBe(200);
      expect(useAuctionStore.getState().selectedTeam).toEqual(team);
    });

    it('rejects bid without player', () => {
      useAuctionStore.setState({ currentPlayer: null });
      expect(useAuctionStore.getState().placeBid(200, makeTeam())).toBe(false);
    });

    it('rejects consecutive bid by same team', () => {
      useAuctionStore.setState({
        currentPlayer: makePlayer(),
        currentBid: 200,
        lastBidTeamId: 'T1',
        bidHistory: [{ teamId: 'T1', teamName: 'T', amount: 200, timestamp: '' }],
      });
      expect(useAuctionStore.getState().placeBid(300, makeTeam())).toBe(false);
    });
  });

  describe('moveUnsoldToSold', () => {
    it('moves unsold player to sold', () => {
      const player = makePlayer();
      const unsold: UnsoldPlayer = { ...player, round: 'R1', unsoldDate: '' };
      const team = makeTeam();
      useAuctionStore.setState({
        unsoldPlayers: [unsold],
        soldPlayers: [],
        teams: [team],
        availablePlayers: [],
      });

      useAuctionStore.getState().moveUnsoldToSold(unsold, team, 200);
      const state = useAuctionStore.getState();
      expect(state.soldPlayers).toHaveLength(1);
      expect(state.soldPlayers[0].soldAmount).toBe(200);
      expect(state.unsoldPlayers).toHaveLength(0);
      expect(state.teams[0].playersBought).toBe(4); // 3 + 1
    });

    it('rejects if player already sold', () => {
      const player = makePlayer();
      const unsold: UnsoldPlayer = { ...player, round: 'R1', unsoldDate: '' };
      useAuctionStore.setState({
        soldPlayers: [{ ...player, soldAmount: 200, teamName: 'T', soldDate: '' }],
        unsoldPlayers: [unsold],
        teams: [makeTeam()],
      });

      useAuctionStore.getState().moveUnsoldToSold(unsold, makeTeam(), 300);
      expect(useAuctionStore.getState().notification?.type).toBe('error');
    });
  });

  describe('startNextRound', () => {
    it('starts next round with unsold players', () => {
      const unsold: UnsoldPlayer[] = [
        { ...makePlayer({ id: 'P001' }), round: 'R1', unsoldDate: '' },
        { ...makePlayer({ id: 'P002' }), round: 'R1', unsoldDate: '' },
      ];
      useAuctionStore.setState({
        unsoldPlayers: unsold,
        currentRound: 1,
        maxUnsoldRounds: 1,
      });

      useAuctionStore.getState().startNextRound();
      const state = useAuctionStore.getState();
      expect(state.currentRound).toBe(2);
      expect(state.isRound2Active).toBe(true);
      expect(state.availablePlayers).toHaveLength(2);
      expect(state.unsoldPlayers).toHaveLength(0);
    });

    it('rejects when max rounds reached', () => {
      useAuctionStore.setState({
        currentRound: 2,
        maxUnsoldRounds: 1,
        unsoldPlayers: [{ ...makePlayer(), round: 'R1', unsoldDate: '' }],
      });

      useAuctionStore.getState().startNextRound();
      expect(useAuctionStore.getState().notification?.type).toBe('info');
      expect(useAuctionStore.getState().currentRound).toBe(2);
    });

    it('rejects when no unsold players', () => {
      useAuctionStore.setState({
        currentRound: 1,
        maxUnsoldRounds: 1,
        unsoldPlayers: [],
      });

      useAuctionStore.getState().startNextRound();
      expect(useAuctionStore.getState().notification?.type).toBe('info');
    });
  });

  describe('resetAuction', () => {
    it('resets all state', () => {
      useAuctionStore.setState({
        availablePlayers: [makePlayer()],
        soldPlayers: [{ ...makePlayer({ id: 'P002' }), soldAmount: 200, teamName: 'T', soldDate: '' }],
        currentPlayer: makePlayer(),
        currentBid: 500,
        currentRound: 2,
        isRound2Active: true,
      });

      useAuctionStore.getState().resetAuction();
      const state = useAuctionStore.getState();
      expect(state.availablePlayers).toHaveLength(0);
      expect(state.soldPlayers).toHaveLength(0);
      expect(state.currentPlayer).toBeNull();
      expect(state.currentRound).toBe(1);
      expect(state.isRound2Active).toBe(false);
    });
  });

  describe('jumpToPlayerIndex', () => {
    it('jumps to valid player index', () => {
      const players = [makePlayer({ id: 'P001' }), makePlayer({ id: 'P002' }), makePlayer({ id: 'P003' })];
      useAuctionStore.setState({
        availablePlayers: players,
        originalPlayers: players,
      });

      const result = useAuctionStore.getState().jumpToPlayerIndex(2);
      expect(result).toBe(true);
      expect(useAuctionStore.getState().currentPlayer?.id).toBe('P002');
    });

    it('rejects invalid index', () => {
      useAuctionStore.setState({
        availablePlayers: [makePlayer()],
        originalPlayers: [makePlayer()],
      });

      expect(useAuctionStore.getState().jumpToPlayerIndex(0)).toBe(false);
      expect(useAuctionStore.getState().jumpToPlayerIndex(999)).toBe(false);
    });

    it('rejects if player already sold', () => {
      const p1 = makePlayer({ id: 'P001' });
      useAuctionStore.setState({
        availablePlayers: [],
        originalPlayers: [p1],
        soldPlayers: [{ ...p1, soldAmount: 200, teamName: 'T', soldDate: '' }],
      });

      expect(useAuctionStore.getState().jumpToPlayerIndex(1)).toBe(false);
    });
  });

  describe('jumpToPlayerId', () => {
    it('jumps to valid player ID', () => {
      const players = [makePlayer({ id: 'P001' }), makePlayer({ id: 'P002' })];
      useAuctionStore.setState({
        availablePlayers: players,
        originalPlayers: players,
      });

      expect(useAuctionStore.getState().jumpToPlayerId('P002')).toBe(true);
      expect(useAuctionStore.getState().currentPlayer?.id).toBe('P002');
    });

    it('rejects invalid player ID', () => {
      useAuctionStore.setState({
        availablePlayers: [makePlayer()],
      });

      expect(useAuctionStore.getState().jumpToPlayerId('NONEXISTENT')).toBe(false);
      expect(useAuctionStore.getState().jumpToPlayerId('')).toBe(false);
      expect(useAuctionStore.getState().jumpToPlayerId(null as unknown as string)).toBe(false);
    });
  });

  describe('setMaxUnsoldRounds', () => {
    it('sets valid value', () => {
      useAuctionStore.getState().setMaxUnsoldRounds(3);
      expect(useAuctionStore.getState().maxUnsoldRounds).toBe(3);
    });

    it('clamps to range 0-10', () => {
      useAuctionStore.getState().setMaxUnsoldRounds(-5);
      expect(useAuctionStore.getState().maxUnsoldRounds).toBe(0);

      useAuctionStore.getState().setMaxUnsoldRounds(99);
      expect(useAuctionStore.getState().maxUnsoldRounds).toBe(10);
    });

    it('defaults to 1 for non-finite values', () => {
      useAuctionStore.getState().setMaxUnsoldRounds(NaN);
      expect(useAuctionStore.getState().maxUnsoldRounds).toBe(1);
    });
  });

  describe('setLoading / setError', () => {
    it('sets loading state', () => {
      useAuctionStore.getState().setLoading(true);
      expect(useAuctionStore.getState().isLoading).toBe(true);
      useAuctionStore.getState().setLoading(false);
      expect(useAuctionStore.getState().isLoading).toBe(false);
    });

    it('sets error', () => {
      useAuctionStore.getState().setError('Something went wrong');
      expect(useAuctionStore.getState().error).toBe('Something went wrong');
      useAuctionStore.getState().setError(null);
      expect(useAuctionStore.getState().error).toBeNull();
    });
  });

  describe('setAuctionState', () => {
    it('merges partial auction state', () => {
      useAuctionStore.getState().setAuctionState({ currentBid: 300 });
      expect(useAuctionStore.getState().auctionState.currentBid).toBe(300);
    });
  });

  describe('setAuctionRoleOrder', () => {
    it('sets role order', () => {
      useAuctionStore.getState().setAuctionRoleOrder(['Batsman', 'Bowler']);
      expect(useAuctionStore.getState().auctionRoleOrder).toEqual(['Batsman', 'Bowler']);
    });
  });
});
