// ============================================================================
// GOOGLE SHEETS SERVICE - Data Layer
// Handles all API interactions with Google Sheets
// ============================================================================

import type { Player, Team, SoldPlayer, UnsoldPlayer } from '../types';
import { activeConfig } from '../config';

const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Google Sheets API Service
 * Implements data fetching with caching and error handling
 */
class GoogleSheetsService {
  private cache = new Map<string, { data: unknown; timestamp: number }>();

  private get config() {
    return activeConfig.googleSheets;
  }

  private get columnMappings() {
    return activeConfig.columnMappings;
  }

  /**
   * Build API URL for fetching sheet data
   */
  private buildUrl(range: string): string {
    return `${API_BASE}/${this.config.sheetId}/values/${encodeURIComponent(range)}?key=${this.config.apiKey}`;
  }

  /**
   * Clear cache for a specific key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Calculate age from date of birth
   */
  private calculateAge(dobValue: string): number | null {
    if (!dobValue || dobValue.trim() === '') return null;

    // Check if it's a direct age number
    const ageNumber = parseInt(dobValue);
    if (!isNaN(ageNumber) && ageNumber > 0 && ageNumber < 120) {
      return ageNumber;
    }

    // Try to parse as date
    const dobDate = new Date(dobValue);
    if (!isNaN(dobDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }
      return age;
    }

    return null;
  }

  /**
   * Fetch all players from registration sheet
   */
  async fetchPlayers(excludeSoldIds: string[] = []): Promise<Player[]> {
    try {
      const url = this.buildUrl(this.config.ranges.players);
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values) {
        console.error('[GoogleSheets] No player data found');
        return [];
      }

      const cols = this.columnMappings.players;
      
      return data.values
        .map((row: string[], index: number): Player | null => {
          // Skip if no base price
          if (!row[cols.basePrice] || row[cols.basePrice].trim() === '' || row[cols.basePrice].trim() === 'N/A') {
            return null;
          }

          const playerId = row[cols.id] || `P${String(index + 1).padStart(3, '0')}`;

          // Skip if already sold
          if (excludeSoldIds.includes(playerId.trim())) {
            return null;
          }

          return {
            id: playerId,
            imageUrl: row[cols.imageUrl] || '',
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: this.calculateAge(row[cols.dateOfBirth]),
            matches: row[cols.matches] || '0',
            runs: row[cols.runs] || 'N/A',
            wickets: row[cols.wickets] || 'N/A',
            battingBestFigures: row[cols.battingBest] || 'N/A',
            bowlingBestFigures: row[cols.bowlingBest] || 'N/A',
            basePrice: parseFloat(row[cols.basePrice]) || activeConfig.auction.basePrice,
            dateOfBirth: row[cols.dateOfBirth] || '',
          };
        })
        .filter((player: Player | null): player is Player => player !== null);
    } catch (error) {
      console.error('[GoogleSheets] Error fetching players:', error);
      return [];
    }
  }

  /**
   * Fetch all teams
   */
  async fetchTeams(): Promise<Team[]> {
    try {
      const url = this.buildUrl(this.config.ranges.teams);
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values) {
        console.error('[GoogleSheets] No teams data found');
        return activeConfig.defaultTeams;
      }

      const cols = this.columnMappings.teams;

      return data.values.map((row: string[], index: number): Team => {
        const totalPlayerThreshold = parseInt(row[cols.totalPlayerThreshold]) || 11;
        const playersBought = parseInt(row[cols.playersBought]) || 0;

        return {
          name: row[cols.name] || `Team ${index + 1}`,
          logoUrl: row[cols.logoUrl] || '',
          playersBought,
          totalPlayerThreshold,
          remainingPlayers: totalPlayerThreshold - playersBought,
          allocatedAmount: parseFloat(row[cols.allocatedAmount]) || 0,
          remainingPurse: parseFloat(row[cols.remainingPurse]) || 0,
          highestBid: parseFloat(row[cols.highestBid]) || 0,
          captain: row[cols.captain] || '',
          underAgePlayers: parseInt(row[cols.underAgePlayers]) || 0,
        };
      });
    } catch (error) {
      console.error('[GoogleSheets] Error fetching teams:', error);
      return activeConfig.defaultTeams;
    }
  }

  /**
   * Fetch sold players
   */
  async fetchSoldPlayers(): Promise<{ ids: string[]; players: SoldPlayer[] }> {
    try {
      const url = this.buildUrl(this.config.ranges.soldPlayers);
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values || data.values.length === 0) {
        return { ids: [], players: [] };
      }

      const cols = this.columnMappings.soldPlayers;
      const soldPlayerIds: string[] = [];
      const soldPlayerObjects: SoldPlayer[] = [];

      // Skip header row
      for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        const playerId = row[cols.id] || '';
        
        if (playerId && playerId.trim() !== '') {
          soldPlayerIds.push(playerId.trim());
          
          soldPlayerObjects.push({
            id: playerId.trim(),
            imageUrl: row[cols.imageUrl] || '',
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: row[cols.age] ? parseInt(row[cols.age]) : null,
            matches: row[cols.matches] || '0',
            runs: 'N/A',
            wickets: 'N/A',
            battingBestFigures: row[cols.bestFigures] || 'N/A',
            bowlingBestFigures: row[cols.bestFigures] || 'N/A',
            basePrice: parseFloat(row[cols.basePrice]) || 0,
            soldAmount: parseFloat(row[cols.soldAmount]) || 0,
            teamName: row[cols.teamName] || '',
            soldDate: new Date().toISOString(),
          });
        }
      }

      return { ids: soldPlayerIds, players: soldPlayerObjects };
    } catch (error) {
      console.error('[GoogleSheets] Error fetching sold players:', error);
      return { ids: [], players: [] };
    }
  }

  /**
   * Fetch unsold players (Round 1 only)
   */
  async fetchUnsoldPlayers(): Promise<{ ids: string[]; players: UnsoldPlayer[] }> {
    try {
      const url = this.buildUrl(this.config.ranges.unsoldPlayers);
      const response = await fetch(url);
      const data = await response.json();

      if (!data.values || data.values.length === 0) {
        return { ids: [], players: [] };
      }

      const cols = this.columnMappings.unsoldPlayers;
      const unsoldPlayerIds: string[] = [];
      const unsoldPlayerObjects: UnsoldPlayer[] = [];

      // Skip header row and only get Round 1 players
      for (let i = 1; i < data.values.length; i++) {
        const row = data.values[i];
        const playerId = row[cols.id] || '';
        const round = row[cols.round] || '';

        if (playerId && playerId.trim() !== '' && round.includes('Round 1')) {
          unsoldPlayerIds.push(playerId.trim());

          unsoldPlayerObjects.push({
            id: playerId.trim(),
            imageUrl: row[cols.imageUrl] || '',
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: row[cols.age] ? parseInt(row[cols.age]) : null,
            matches: row[cols.matches] || '0',
            runs: 'N/A',
            wickets: 'N/A',
            battingBestFigures: row[cols.bestFigures] || 'N/A',
            bowlingBestFigures: row[cols.bestFigures] || 'N/A',
            basePrice: parseFloat(row[cols.basePrice]) || 0,
            round,
            unsoldDate: row[cols.unsoldDate] || new Date().toISOString(),
          });
        }
      }

      return { ids: unsoldPlayerIds, players: unsoldPlayerObjects };
    } catch (error) {
      console.error('[GoogleSheets] Error fetching unsold players:', error);
      return { ids: [], players: [] };
    }
  }

  /**
   * Fetch sold players for a specific team
   */
  async fetchSoldPlayersForTeam(teamName: string): Promise<SoldPlayer[]> {
    const { players } = await this.fetchSoldPlayers();
    return players.filter(player => player.teamName === teamName);
  }
}

export const googleSheetsService = new GoogleSheetsService();
