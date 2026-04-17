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
