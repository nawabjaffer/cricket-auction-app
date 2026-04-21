import { describe, it, expect, vi } from 'vitest';
import { generateSoldPlayersCSV, downloadCSV, exportSoldPlayers } from '../utils/exportData';

describe('generateSoldPlayersCSV', () => {
  it('generates CSV with headers', () => {
    const csv = generateSoldPlayersCSV([]);
    expect(csv).toContain('ID');
    expect(csv).toContain('Player Name');
    expect(csv).toContain('Sold Amount');
  });

  it('generates CSV with player data', () => {
    const players = [{
      id: 'P001',
      playerName: 'Test Player',
      role: 'Batsman',
      age: 25,
      imageUrl: '/img/p1.jpg',
      basePrice: 5,
      soldAmount: 10,
      teamName: 'Team A',
      matches: '50',
      bestFigures: '120',
      auctionRound: 1,
      timestamp: Date.now(),
    }];
    const csv = generateSoldPlayersCSV(players);
    expect(csv).toContain('P001');
    expect(csv).toContain('Test Player');
    expect(csv).toContain('Team A');
  });

  it('escapes commas in values', () => {
    const players = [{
      id: 'P002',
      playerName: 'Player, Jr.',
      role: 'Bowler',
      age: 22,
      imageUrl: '',
      basePrice: 3,
      soldAmount: 8,
      teamName: 'Team B',
      matches: '10',
      bestFigures: '3/20',
      auctionRound: 1,
      timestamp: Date.now(),
    }];
    const csv = generateSoldPlayersCSV(players);
    expect(csv).toContain('"Player, Jr."');
  });
});

describe('downloadCSV', () => {
  it('creates and clicks a download link', () => {
    const mockClick = vi.fn();
    const mockLink = {
      setAttribute: vi.fn(),
      style: { visibility: '' },
      click: mockClick,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadCSV('test,content', 'file.csv');
    expect(mockClick).toHaveBeenCalled();
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'file.csv');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');

    vi.restoreAllMocks();
  });
});

describe('exportSoldPlayers', () => {
  it('generates CSV and triggers download', () => {
    const mockClick = vi.fn();
    const mockLink = {
      setAttribute: vi.fn(),
      style: { visibility: '' },
      click: mockClick,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    exportSoldPlayers([{
      id: 'P001',
      playerName: 'Test',
      role: 'Batsman',
      age: 25,
      imageUrl: '',
      basePrice: 5,
      soldAmount: 10,
      teamName: 'Team A',
      matches: '10',
      bestFigures: '50',
      auctionRound: 1,
      timestamp: Date.now(),
    }]);

    expect(mockClick).toHaveBeenCalled();
    expect(mockLink.setAttribute).toHaveBeenCalledWith('download', expect.stringContaining('auction-sold-players-'));

    vi.restoreAllMocks();
  });
});
