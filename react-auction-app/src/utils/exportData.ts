// ============================================================================
// DATA EXPORT UTILITY
// Generate downloadable CSV/Excel files from auction data
// ============================================================================

import type { SoldPlayerRecord, UnsoldPlayerRecord } from '../services/auctionPersistence';
import type { Player } from '../types';
import { getStatFieldsForSport } from '../config/playerStatFields';

const escapeCsvCell = (cell: unknown): string => `"${String(cell ?? '').replace(/"/g, '""')}"`;

/**
 * Convert sold players to CSV format
 */
export function generateSoldPlayersCSV(players: SoldPlayerRecord[]): string {
  const headers = [
    'ID',
    'Player Name',
    'Age',
    'Player Role',
    'Player Image URL',
    'Team Name',
    'Sold Amount',
    'Base Price',
    'Matches',
    'Best Figures',
    'Auction Round',
    'Sold Timestamp',
  ];

  const rows = players.map(player => [
    player.id,
    player.playerName,
    player.age?.toString() || 'N/A',
    player.role,
    player.imageUrl,
    player.teamName,
    player.soldAmount.toString(),
    player.basePrice.toString(),
    player.matches,
    player.bestFigures,
    player.auctionRound?.toString() || '1',
    player.timestamp ? new Date(player.timestamp).toISOString() : 'N/A',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Export sold players as CSV
 */
export function exportSoldPlayers(players: SoldPlayerRecord[]): void {
  const csv = generateSoldPlayersCSV(players);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `auction-sold-players-${timestamp}.csv`;
  downloadCSV(csv, filename);
}

/**
 * Generate CSV template for importing players
 * Includes headers and sample data row
 */
export function generatePlayersCSVTemplate(sport = 'cricket'): string {
  if (sport !== 'cricket') {
    const fields = getStatFieldsForSport(sport).filter(field => !['age', 'matches'].includes(field.key));
    const headers = ['ID', 'Name', 'Role', 'Place', 'Base Price', 'Image URL', 'Phone', 'WhatsApp Number', 'Age', 'Date of Birth', 'Matches', ...fields.map(field => field.label)];
    const sampleRow = ['PLAYER001', 'Alex Player', '', 'Bengaluru', '0', 'https://example.com/image.jpg', '', '', '25', '', '0', ...fields.map(() => '0')];
    return [headers.join(','), sampleRow.map(escapeCsvCell).join(',')].join('\n');
  }
  const headers = [
    'ID',
    'Name',
    'Role',
    'Place',
    'Base Price',
    'Image URL',
    'Phone',
    'WhatsApp Number',
    'Age',
    'Date of Birth',
    'Matches',
    'Runs',
    'Wickets',
    'Batting Best Figures',
    'Bowling Best Figures',
    'Innings',
    'Not Out',
    'Highest Score',
    'Average',
    'Strike Rate',
    '30s',
    '50s',
    '100s',
    '4s',
    '6s',
    'Bowling Matches',
    'Bowling Innings',
    'Overs',
    'Maidens',
    'Bowling Runs',
    'BB',
    '3WKTs',
    '5WKTs',
    'Economy',
    'Bowling SR',
    'Bowling Average',
  ];

  // Sample data row to help users understand the format
  const sampleRow = [
    'PLAYER001',
    'John Doe',
    'Batsman',
    'Bengaluru',
    '500000',
    'https://example.com/image.jpg',
    '+919876543210',
    '+919912345678',
    '28',
    '1995-06-15',
    '120',
    '4500',
    '0',
    'N/A',
    'N/A',
    '100',
    '5',
    '156',
    '45.00',
    '95.23',
    '8',
    '12',
    '3',
    '45',
    '25',
    '0',
    '0',
    '0',
    '0',
    '0',
    'N/A',
    '0',
    '0',
    '0.00',
    '0.00',
    '0.00',
  ];

  const csvContent = [
    headers.join(','),
    sampleRow.map(escapeCsvCell).join(','),
  ].join('\n');

  return csvContent;
}

/**
 * Generate CSV for bulk-editing existing players.
 * Uses the same column order as the import template.
 */
export function generatePlayersBulkEditCSV(players: Player[], sport = 'cricket'): string {
  if (sport !== 'cricket') {
    const fields = getStatFieldsForSport(sport).filter(field => !['age', 'matches'].includes(field.key));
    const headers = ['ID', 'Name', 'Role', 'Place', 'Base Price', 'Image URL', 'Phone', 'WhatsApp Number', 'Age', 'Date of Birth', 'Matches', ...fields.map(field => field.label)];
    const rows = players.map(player => [
      player.id, player.name, player.role, player.place || '', player.basePrice, player.imageUrl || '', player.phone || '', player.whatsappNumber || '',
      player.age ?? '', player.dateOfBirth || '', player.matches || '0',
      ...fields.map(field => player.customStats?.[field.key] || (player as unknown as Record<string, string>)[field.key] || '0'),
    ]);
    return [headers.join(','), ...rows.map(row => row.map(escapeCsvCell).join(','))].join('\n');
  }
  const headers = [
    'ID',
    'Name',
    'Role',
    'Place',
    'Base Price',
    'Image URL',
    'Phone',
    'WhatsApp Number',
    'Age',
    'Date of Birth',
    'Matches',
    'Runs',
    'Wickets',
    'Batting Best Figures',
    'Bowling Best Figures',
    'Innings',
    'Not Out',
    'Highest Score',
    'Average',
    'Strike Rate',
    '30s',
    '50s',
    '100s',
    '4s',
    '6s',
    'Bowling Matches',
    'Bowling Innings',
    'Overs',
    'Maidens',
    'Bowling Runs',
    'BB',
    '3WKTs',
    '5WKTs',
    'Economy',
    'Bowling SR',
    'Bowling Average',
  ];

  const rows = players.map((p) => {
    const bat = p.battingStats;
    const bowl = p.bowlingStats;
    return [
      p.id,
      p.name,
      p.role,
      p.place || '',
      Number.isFinite(p.basePrice) ? p.basePrice : 0,
      p.imageUrl || '',
      p.phone || '',
      p.whatsappNumber || '',
      p.age ?? '',
      p.dateOfBirth || '',
      bat?.matches || p.matches || '0',
      bat?.runs || p.runs || '0',
      bowl?.wickets || p.wickets || '0',
      p.battingBestFigures || 'N/A',
      p.bowlingBestFigures || 'N/A',
      bat?.innings || '0',
      bat?.notOut || '0',
      bat?.highestScore || '0',
      bat?.average || '0.00',
      bat?.strikeRate || '0.00',
      bat?.thirties || '0',
      bat?.fifties || '0',
      bat?.hundreds || '0',
      bat?.fours || '0',
      bat?.sixes || '0',
      bowl?.matches || '0',
      bowl?.innings || '0',
      bowl?.overs || '0',
      bowl?.maidens || '0',
      bowl?.runs || '0',
      bowl?.bestBowling || 'N/A',
      bowl?.threeWickets || '0',
      bowl?.fiveWickets || '0',
      bowl?.economy || '0.00',
      bowl?.strikeRate || '0.00',
      bowl?.average || '0.00',
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Generate CSV template for importing player statistics/scores
 * Includes headers and sample data row
 */
export function generateScoresCSVTemplate(sport = 'cricket'): string {
  if (sport !== 'cricket') {
    const fields = getStatFieldsForSport(sport).filter(field => !['age', 'matches'].includes(field.key));
    const headers = ['ID', 'Full Name', 'Matches Played', ...fields.map(field => field.label)];
    const sampleRow = ['PLAYER001', 'Alex Player', '0', ...fields.map(() => '0')];
    return [headers.join(','), sampleRow.map(cell => escapeCsvCell(cell)).join(',')].join('\n');
  }
  const headers = [
    'ID',
    'Full Name',
    'Matches Played',
    'Innings',
    'Not Out',
    'Runs',
    'Highest Score',
    'Average',
    'Strike Rate',
    '30s',
    '50s',
    '100s',
    '4s',
    '6s',
    'Bowling Matches',
    'Bowling Innings',
    'Overs',
    'Maidens',
    'Bowling Runs',
    'Wickets',
    'BB',
    '3WKTs',
    '5WKTs',
    'Economy',
    'Bowling SR',
    'Bowling Average',
  ];

  // Sample data row
  const sampleRow = [
    'PLAYER001',
    'John Doe',
    '45',
    '43',
    '8',
    '1850',
    '89',
    '52.86',
    '142.31',
    '6',
    '8',
    '2',
    '52',
    '18',
    '25',
    '24',
    '98.5',
    '12',
    '450',
    '28',
    '3/24',
    '2',
    '1',
    '4.56',
    '21.07',
    '16.07',
  ];

  const csvContent = [
    headers.join(','),
    sampleRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','),
  ].join('\n');

  return csvContent;
}

/**
 * Download players CSV template
 */
export function downloadPlayersTemplate(players: Player[] = [], sport = 'cricket'): void {
  const hasExistingData = players.length > 0;
  const csv = hasExistingData
    ? generatePlayersBulkEditCSV(players, sport)
    : generatePlayersCSVTemplate(sport);
  downloadCSV(csv, hasExistingData ? `players-${sport}-bulk-edit.csv` : `players-${sport}-template.csv`);
}

/**
 * Download scores CSV template
 */
export function downloadScoresTemplate(sport = 'cricket'): void {
  const csv = generateScoresCSVTemplate(sport);
  downloadCSV(csv, `scores-${sport}-template.csv`);
}

/**
 * Convert unsold players to CSV format
 */
export function generateUnsoldPlayersCSV(players: UnsoldPlayerRecord[]): string {
  const headers = [
    'ID',
    'Player Name',
    'Age',
    'Player Role',
    'Player Image URL',
    'Base Price',
    'Matches',
    'Bowling Best',
    'Unsold Round',
    'Unsold Timestamp',
  ];

  const rows = players.map(player => [
    player.id,
    player.name,
    player.age?.toString() || 'N/A',
    player.role,
    player.imageUrl,
    player.basePrice.toString(),
    player.matches,
    player.bowlingBest,
    player.round,
    player.timestamp ? new Date(player.timestamp).toISOString() : 'N/A',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ].join('\n');

  return csvContent;
}

/**
 * Export unsold players as CSV
 */
export function exportUnsoldPlayers(players: UnsoldPlayerRecord[]): void {
  const csv = generateUnsoldPlayersCSV(players);
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `auction-unsold-players-${timestamp}.csv`;
  downloadCSV(csv, filename);
}
