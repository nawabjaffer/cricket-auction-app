// ============================================================================
// AUCTION PERSISTENCE SERVICE
// Handles saving/loading auction data to Firebase Realtime Database
// ============================================================================

import { 
  ref, 
  set, 
  get,
  type Database 
} from 'firebase/database';
import type { Player, Team, SoldPlayer } from '../types';

// Database paths
const DB_PATHS = {
  SOLD_PLAYERS: 'auction/soldPlayers',
  UNSOLD_PLAYERS: 'auction/unsoldPlayers',
  INITIAL_SNAPSHOT: 'auction/initialSnapshot',
  ADMIN_SETTINGS: 'auction/adminSettings',
  TEAMS: 'auction/teams',
  ADMIN_PLAYERS: 'auction/adminPlayers',
} as const;

// Sold player record format for Firebase
export interface SoldPlayerRecord {
  id: string;
  playerName: string;
  role: string;
  age: number | null;
  matches: string;
  bestFigures: string;
  teamName: string;
  soldAmount: number;
  basePrice: number;
  imageUrl: string;
  timestamp: number;
}

// Unsold player record format for Firebase
export interface UnsoldPlayerRecord {
  id: string;
  name: string;
  role: string;
  age: number | null;
  matches: string;
  bowlingBest: string;
  basePrice: number;
  round: string;
  timestamp: number;
  imageUrl: string;
}

// Initial snapshot structure
export interface InitialSnapshot {
  players: Player[];
  teams: Team[];
  capturedAt: number;
  source: 'google-sheets';
}

// Admin settings structure
export interface AdminSettings {
  organizerName: string;
  organizerLogo: string;
  numberOfTeams: number;
  maxUnsoldRounds: number;
  themeColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  auctionTitle: string;
  updatedAt: number;
}

class AuctionPersistenceService {
  private db: Database | null = null;

  initialize(db: Database) {
    this.db = db;
  }

  // ==================== SOLD PLAYERS ====================
  
  /**
   * Save a sold player to Firebase
   */
  async saveSoldPlayer(player: SoldPlayer, teamName: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const record: SoldPlayerRecord = {
      id: player.id,
      playerName: player.name,
      role: player.role,
      age: player.age,
      matches: player.matches,
      bestFigures: player.bowlingBestFigures || player.battingBestFigures || 'N/A',
      teamName,
      soldAmount: player.soldAmount,
      basePrice: player.basePrice,
      imageUrl: player.imageUrl,
      timestamp: Date.now(),
    };

    const soldPlayerRef = ref(this.db, `${DB_PATHS.SOLD_PLAYERS}/${player.id}`);
    await set(soldPlayerRef, record);
  }

  /**
   * Get all sold players from Firebase
   */
  async getSoldPlayers(): Promise<SoldPlayerRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const soldPlayersRef = ref(this.db, DB_PATHS.SOLD_PLAYERS);
    const snapshot = await get(soldPlayersRef);
    
    if (!snapshot.exists()) return [];

    const data = snapshot.val();
    return Object.values(data) as SoldPlayerRecord[];
  }

  // ==================== UNSOLD PLAYERS ====================

  /**
   * Save an unsold player to Firebase
   */
  async saveUnsoldPlayer(player: Player, round: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const record: UnsoldPlayerRecord = {
      id: player.id,
      name: player.name,
      role: player.role,
      age: player.age,
      matches: player.matches,
      bowlingBest: player.bowlingBestFigures || 'N/A',
      basePrice: player.basePrice,
      round,
      timestamp: Date.now(),
      imageUrl: player.imageUrl,
    };

    const unsoldPlayerRef = ref(this.db, `${DB_PATHS.UNSOLD_PLAYERS}/${player.id}`);
    await set(unsoldPlayerRef, record);
  }

  /**
   * Get all unsold players from Firebase
   */
  async getUnsoldPlayers(): Promise<UnsoldPlayerRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const unsoldPlayersRef = ref(this.db, DB_PATHS.UNSOLD_PLAYERS);
    const snapshot = await get(unsoldPlayersRef);
    
    if (!snapshot.exists()) return [];

    const data = snapshot.val();
    return Object.values(data) as UnsoldPlayerRecord[];
  }

  /**
   * Remove a single unsold player record
   */
  async removeUnsoldPlayer(playerId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const unsoldPlayerRef = ref(this.db, `${DB_PATHS.UNSOLD_PLAYERS}/${playerId}`);
    await set(unsoldPlayerRef, null);
  }

  /**
   * Clear all unsold players (used when starting Round 2)
   */
  async clearUnsoldPlayers(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await set(ref(this.db, DB_PATHS.UNSOLD_PLAYERS), null);
  }

  // ==================== INITIAL SNAPSHOT ====================

  /**
   * Save initial snapshot from Google Sheets
   */
  async saveInitialSnapshot(players: Player[], teams: Team[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const snapshot: InitialSnapshot = {
      players,
      teams,
      capturedAt: Date.now(),
      source: 'google-sheets',
    };

    const snapshotRef = ref(this.db, DB_PATHS.INITIAL_SNAPSHOT);
    await set(snapshotRef, snapshot);
  }

  /**
   * Get initial snapshot
   */
  async getInitialSnapshot(): Promise<InitialSnapshot | null> {
    if (!this.db) throw new Error('Database not initialized');

    const snapshotRef = ref(this.db, DB_PATHS.INITIAL_SNAPSHOT);
    const snapshot = await get(snapshotRef);
    
    if (!snapshot.exists()) return null;

    return snapshot.val() as InitialSnapshot;
  }

  // ==================== ADMIN SETTINGS ====================

  /**
   * Save admin settings
   */
  async saveAdminSettings(settings: AdminSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const settingsWithTimestamp = {
      ...settings,
      updatedAt: Date.now(),
    };

    const settingsRef = ref(this.db, DB_PATHS.ADMIN_SETTINGS);
    await set(settingsRef, settingsWithTimestamp);
  }

  /**
   * Get admin settings
   */
  async getAdminSettings(): Promise<AdminSettings | null> {
    if (!this.db) throw new Error('Database not initialized');

    const settingsRef = ref(this.db, DB_PATHS.ADMIN_SETTINGS);
    const snapshot = await get(settingsRef);
    
    if (!snapshot.exists()) return null;

    return snapshot.val() as AdminSettings;
  }

  // ==================== TEAMS ====================

  /**
   * Save updated teams
   */
  async saveTeams(teams: Team[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const teamsRef = ref(this.db, DB_PATHS.TEAMS);
    await set(teamsRef, teams);
  }

  /**
   * Get saved teams
   */
  async getTeams(): Promise<Team[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const teamsRef = ref(this.db, DB_PATHS.TEAMS);
    const snapshot = await get(teamsRef);
    
    if (!snapshot.exists()) return null;

    return snapshot.val() as Team[];
  }

  // ==================== ADMIN PLAYERS ====================

  /**
   * Save admin-edited player list
   */
  async saveAdminPlayers(players: Player[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const playersRef = ref(this.db, DB_PATHS.ADMIN_PLAYERS);
    await set(playersRef, players);
  }

  /**
   * Get admin-edited player list
   */
  async getAdminPlayers(): Promise<Player[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const playersRef = ref(this.db, DB_PATHS.ADMIN_PLAYERS);
    const snapshot = await get(playersRef);

    if (!snapshot.exists()) return null;

    return snapshot.val() as Player[];
  }

  /**
   * Clear admin player overrides
   */
  async clearAdminPlayers(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await set(ref(this.db, DB_PATHS.ADMIN_PLAYERS), null);
  }

  // ==================== RESET/CLEAR ====================

  /**
   * Clear all auction data (for reset)
   */
  async clearAuctionData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const promises = [
      set(ref(this.db, DB_PATHS.SOLD_PLAYERS), null),
      set(ref(this.db, DB_PATHS.UNSOLD_PLAYERS), null),
      set(ref(this.db, DB_PATHS.TEAMS), null),
    ];

    await Promise.all(promises);
  }

  /**
   * Check if there's existing auction data
   */
  async hasExistingData(): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const soldRef = ref(this.db, DB_PATHS.SOLD_PLAYERS);
    const unsoldRef = ref(this.db, DB_PATHS.UNSOLD_PLAYERS);

    const [soldSnapshot, unsoldSnapshot] = await Promise.all([
      get(soldRef),
      get(unsoldRef),
    ]);

    return soldSnapshot.exists() || unsoldSnapshot.exists();
  }
}

// Export singleton instance
export const auctionPersistence = new AuctionPersistenceService();
