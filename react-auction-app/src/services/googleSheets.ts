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
  private readonly cache = new Map<string, { data: unknown; timestamp: number }>();

  private get config() {
    return activeConfig.googleSheets;
  }

  private get columnMappings() {
    return activeConfig.columnMappings;
  }

  private normalizePlayerImageUrl(rawValue: string | undefined | null): string {
    const raw = (rawValue ?? '').trim();
    const placeholder = activeConfig.assets.placeholderMan;

    if (!raw) return placeholder;

    // Common bad values when the sheet contains only an extension
    if (/^(jpg|jpeg|png|webp)$/i.test(raw)) return placeholder;

    // Allow app-served assets
    if (raw.startsWith('/')) return raw;

    // Normalize scheme-less drive links
    const value = /^https?:\/\//i.test(raw)
      ? raw
      : raw.startsWith('drive.google.com') || raw.startsWith('docs.google.com')
        ? `https://${raw}`
        : raw;

    const buildDriveViewUrl = (fileId: string) => {
      // Use standard uc endpoint for Drive images
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    };

    // Allow bare Drive file IDs (common in sheets); detect long base64-ish tokens
    const looksLikeDriveId = /^[A-Za-z0-9_-]{20,}$/.test(value);
    if (looksLikeDriveId) {
      return buildDriveViewUrl(value);
    }

    // Only attempt URL parsing for http(s) after normalization
    if (!/^https?:\/\//i.test(value)) return placeholder;

    const normalizeDriveUrl = (value: string): string | null => {
      try {
        const url = new URL(value);

        // Direct googleusercontent links are already file-serving; keep as-is
        if (url.hostname.includes('googleusercontent.com')) {
          return url.toString();
        }

        if (!url.hostname.includes('drive.google.com')) return null;

        // https://drive.google.com/file/d/<id>/view
        const fileMatch = /\/file\/d\/([^/]+)/.exec(url.pathname);
        if (fileMatch?.[1]) return buildDriveViewUrl(fileMatch[1]);

        // https://drive.google.com/uc?id=<id>&export=view|download
        const ucIdParam = url.searchParams.get('id');
        if (ucIdParam) return buildDriveViewUrl(ucIdParam);

        // https://drive.google.com/thumbnail?id=<id>
        const thumbnailId = url.searchParams.get('thumbnail') || url.searchParams.get('thumb');
        if (thumbnailId) return buildDriveViewUrl(thumbnailId);

        // /d/<id> without /file prefix (rare shared links)
        const looseMatch = /\/d\/([^/]+)/.exec(url.pathname);
        if (looseMatch?.[1]) return buildDriveViewUrl(looseMatch[1]);

        return null;
      } catch {
        return null;
      }
    };

    const normalizedDriveUrl = normalizeDriveUrl(value);
    if (normalizedDriveUrl) return normalizedDriveUrl;

    // Non-drive URLs are allowed but returned as-is so images continue to load
    return raw;
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
    const ageNumber = Number.parseInt(dobValue, 10);
    if (!Number.isNaN(ageNumber) && ageNumber > 0 && ageNumber < 120) {
      return ageNumber;
    }

    // Try to parse as date
    const dobDate = new Date(dobValue);
    if (!Number.isNaN(dobDate.getTime())) {
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
      
      // Skip header row
      const playerRows = data.values.slice(1);

      return playerRows
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
            imageUrl: this.normalizePlayerImageUrl(row[cols.imageUrl]),
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: this.calculateAge(row[cols.dateOfBirth]),
            matches: row[cols.matches] || '0',
            runs: row[cols.runs] || 'N/A',
            wickets: row[cols.wickets] || 'N/A',
            battingBestFigures: row[cols.battingBest] || 'N/A',
            bowlingBestFigures: row[cols.bowlingBest] || 'N/A',
            basePrice: Number.parseFloat(row[cols.basePrice]) || activeConfig.auction.basePrice,
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

      // Skip header row
      const teamRows = data.values.slice(1);

      return teamRows.map((row: string[], index: number): Team => {
        const totalPlayerThreshold = Number.parseInt(row[cols.totalPlayerThreshold], 10) || 11;
        const playersBought = Number.parseInt(row[cols.playersBought], 10) || 0;

        const name = row[cols.name] || `Team ${index + 1}`;
        const colors = activeConfig.ui.teamColors?.[name] || { primary: '#3b82f6', secondary: '#06b6d4' };

        return {
          id: name,
          name,
          logoUrl: row[cols.logoUrl] || '',
          primaryColor: colors.primary,
          secondaryColor: colors.secondary,
          playersBought,
          totalPlayerThreshold,
          remainingPlayers: totalPlayerThreshold - playersBought,
          allocatedAmount: Number.parseFloat(row[cols.allocatedAmount]) || 0,
          remainingPurse: Number.parseFloat(row[cols.remainingPurse]) || 0,
          highestBid: Number.parseFloat(row[cols.highestBid]) || 0,
          captain: row[cols.captain] || '',
          underAgePlayers: Number.parseInt(row[cols.underAgePlayers], 10) || 0,
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
            imageUrl: this.normalizePlayerImageUrl(row[cols.imageUrl]),
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: row[cols.age] ? Number.parseInt(row[cols.age], 10) : null,
            matches: row[cols.matches] || '0',
            runs: 'N/A',
            wickets: 'N/A',
            battingBestFigures: row[cols.bestFigures] || 'N/A',
            bowlingBestFigures: row[cols.bestFigures] || 'N/A',
            basePrice: Number.parseFloat(row[cols.basePrice]) || 0,
            soldAmount: Number.parseFloat(row[cols.soldAmount]) || 0,
            teamName: row[cols.teamName] || '',
            teamId: row[cols.teamName] || '',
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
            imageUrl: this.normalizePlayerImageUrl(row[cols.imageUrl]),
            name: row[cols.name] || 'Unknown Player',
            role: (row[cols.role] || 'Player') as Player['role'],
            age: row[cols.age] ? Number.parseInt(row[cols.age], 10) : null,
            matches: row[cols.matches] || '0',
            runs: 'N/A',
            wickets: 'N/A',
            battingBestFigures: row[cols.bestFigures] || 'N/A',
            bowlingBestFigures: row[cols.bestFigures] || 'N/A',
            basePrice: Number.parseFloat(row[cols.basePrice]) || 0,
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
