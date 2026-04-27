// ============================================================================
// DATA EXPORT UTILITY
// Generate downloadable CSV/Excel files from auction data
// ============================================================================

import type { SoldPlayerRecord } from '../services/auctionPersistence';

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
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
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
export function generatePlayersCSVTemplate(): string {
  const headers = [
    'ID',
    'Name',
    'Role',
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
    sampleRow.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','),
  ].join('\n');

  return csvContent;
}

/**
 * Generate CSV template for importing player statistics/scores
 * Includes headers and sample data row
 */
export function generateScoresCSVTemplate(): string {
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
export function downloadPlayersTemplate(): void {
  const csv = generatePlayersCSVTemplate();
  downloadCSV(csv, 'players-template.csv');
}

/**
 * Download scores CSV template
 */
export function downloadScoresTemplate(): void {
  const csv = generateScoresCSVTemplate();
  downloadCSV(csv, 'scores-template.csv');
}
