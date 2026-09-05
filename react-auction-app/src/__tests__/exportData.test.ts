import { describe, it, expect, vi } from 'vitest';
import { generateSoldPlayersCSV, downloadCSV, exportSoldPlayers, generatePlayersCSVTemplate, generatePlayersBulkEditCSV, generateScoresCSVTemplate } from '../utils/exportData';

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

describe('CSV Templates', () => {
  it('generates players CSV template with required headers', () => {
    const csv = generatePlayersCSVTemplate();
    expect(csv).toContain('ID');
    expect(csv).toContain('Name');
    expect(csv).toContain('Role');
    expect(csv).toContain('Base Price');
    expect(csv).toContain('Image URL');
    expect(csv).toContain('Phone');
    expect(csv).toContain('WhatsApp Number');
    // Should have sample data rows
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('generates players bulk-edit CSV with existing player rows', () => {
    const csv = generatePlayersBulkEditCSV([
      {
        id: 'P100',
        name: 'Bulk Player',
        role: 'Batsman',
        place: 'Bengaluru',
        basePrice: 500,
        imageUrl: 'https://img.test/p100.jpg',
        phone: '+919876543210',
        whatsappNumber: '+919812345678',
        age: 26,
        dateOfBirth: '1999-01-01',
        matches: '40',
        runs: '1500',
        wickets: '10',
        battingBestFigures: '110',
        bowlingBestFigures: '2/20',
      },
    ] as any);

    expect(csv).toContain('P100');
    expect(csv).toContain('Bulk Player');
    expect(csv).toContain('Place');
    expect(csv).toContain('Bengaluru');
    expect(csv).toContain('+919876543210');
    expect(csv).toContain('+919812345678');
  });

  it('generates scores CSV template with stat headers', () => {
    const csv = generateScoresCSVTemplate();
    expect(csv).toContain('ID');
    expect(csv).toContain('Matches');
    expect(csv).toContain('Runs');
    expect(csv).toContain('Wickets');
    // Should have sample data rows
    const lines = csv.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('generates sport-specific player and score templates', () => {
    const playersTemplate = generatePlayersCSVTemplate('kabaddi');
    const scoresTemplate = generateScoresCSVTemplate('football');

    expect(playersTemplate).toContain('Raid Points');
    expect(playersTemplate).toContain('Tackle Points');
    expect(playersTemplate).not.toContain('Batting Innings');
    expect(scoresTemplate).toContain('Goals');
    expect(scoresTemplate).toContain('Pass Accuracy %');
    expect(scoresTemplate).not.toContain('Bowling Matches');
  });

  it('exports non-cricket custom stats in the selected sport schema', () => {
    const csv = generatePlayersBulkEditCSV([{
      id: 'K001',
      name: 'Kabaddi Player',
      role: 'Raider',
      basePrice: 100,
      imageUrl: '',
      age: 24,
      matches: '20',
      runs: '0',
      wickets: '0',
      battingBestFigures: 'N/A',
      bowlingBestFigures: 'N/A',
      customStats: { raidPoints: '125', tacklePoints: '4' },
    } as any], 'kabaddi');

    expect(csv).toContain('Raid Points');
    expect(csv).toContain('125');
    expect(csv).toContain('Tackle Points');
  });
});
