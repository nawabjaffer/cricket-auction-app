// ============================================================================
// AUCTION PERSISTENCE SERVICE
// Handles saving/loading auction data to Firebase Realtime Database
// ============================================================================

import { 
  ref, 
  set, 
  get,
  onValue,
  type Database 
} from 'firebase/database';
import type { Player, Team, SoldPlayer, AuctionRoleCategory } from '../types';
import { tenantPath } from './tenantPath';

// Database paths. Each value is resolved through `tenantPath()` at access time,
// so the same literal `DB_PATHS.SOLD_PLAYERS` returns
// `tenants/{activeTenantId}/auction/soldPlayers` — no call sites to change.
const DB_PATH_KEYS = {
  SOLD_PLAYERS:     'auction/soldPlayers',
  UNSOLD_PLAYERS:   'auction/unsoldPlayers',
  INITIAL_SNAPSHOT: 'auction/initialSnapshot',
  ADMIN_SETTINGS:   'auction/adminSettings',
  TEAMS:            'auction/teams',
  ADMIN_PLAYERS:    'auction/adminPlayers',
  SPONSORS:         'auction/sponsors',
} as const;

type DbPathKey = keyof typeof DB_PATH_KEYS;

const DB_PATHS = new Proxy({} as Record<DbPathKey, string>, {
  get(_t, prop: string) {
    if (prop in DB_PATH_KEYS) {
      return tenantPath(DB_PATH_KEYS[prop as DbPathKey]);
    }
    return undefined;
  },
});

// ── Image compression for Firebase RTDB ──
// Compresses data: URLs to small JPEG thumbnails (~15-30KB) to fit RTDB write limits
const MAX_THUMB_SIZE = 300;
const THUMB_QUALITY = 0.6;

function compressDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(MAX_THUMB_SIZE / w, MAX_THUMB_SIZE / h, 1);
        const cw = Math.round(w * scale);
        const ch = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(''); return; }

        ctx.drawImage(img, 0, 0, cw, ch);
        const compressed = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
        // If still too large (>100KB encoded), drop it
        resolve(compressed.length > 100_000 ? '' : compressed);
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

async function compressImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl) return '';
  if (!imageUrl.startsWith('data:')) return imageUrl; // keep remote URLs as-is
  return compressDataUrl(imageUrl);
}

export interface SponsorRecord {
  id: string;
  name: string;
  logoUrl?: string;
  videoUrl?: string;
  website?: string;
  tier?: string;
  isTitleSponsor?: boolean;
  active?: boolean;
  isActive?: boolean;
  order?: number;
}

const normalizeSponsorLogoUrl = (rawValue: string | undefined): string => {
  const raw = (rawValue ?? '').trim();
  if (!raw) return '';

  const value = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith('drive.google.com') || raw.startsWith('docs.google.com')
      ? `https://${raw}`
      : raw;

  const buildDriveImageUrl = (fileId: string) => `https://drive.google.com/uc?export=view&id=${fileId}`;

  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) {
    return buildDriveImageUrl(value);
  }

  if (!/^https?:\/\//i.test(value)) return raw;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!host.includes('drive.google.com')) return value;

    const fileMatch = /\/file\/d\/([^/]+)/.exec(url.pathname);
    if (fileMatch?.[1]) return buildDriveImageUrl(fileMatch[1]);

    const id = url.searchParams.get('id');
    if (id) return buildDriveImageUrl(id);

    const looseMatch = /\/d\/([^/]+)/.exec(url.pathname);
    if (looseMatch?.[1]) return buildDriveImageUrl(looseMatch[1]);
  } catch {
    return raw;
  }

  return value;
};

const normalizeSponsorRecord = (sponsor: SponsorRecord, index = 0): SponsorRecord | null => {
  if (!sponsor || !sponsor.name?.trim()) return null;

  const resolvedActive = sponsor.active ?? sponsor.isActive ?? true;
  if (!resolvedActive) return null;

  return {
    ...sponsor,
    id: sponsor.id || `sponsor-${index + 1}`,
    name: sponsor.name.trim(),
    active: true,
    logoUrl: normalizeSponsorLogoUrl(sponsor.logoUrl),
    website: sponsor.website?.trim() || '',
    tier: sponsor.tier?.trim() || '',
    order: Number.isFinite(sponsor.order as number) ? sponsor.order : index,
  };
};

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
  // Additional export fields
  teamId?: string;
  auctionRound?: number;
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

// Special player category (e.g. Under-19, Over-40)
export interface SpecialCategory {
  id: string;
  label: string;
  ageMin?: number;
  ageMax?: number;
  // Optional color for badge display
  color?: string;
}

// Auction break configuration
export interface AuctionBreak {
  id: string;
  title: string;
  durationSeconds: number;
  sponsorVideoUrl?: string;
  order: number;
}

// Budget rules configuration
export interface BudgetRulesConfig {
  totalBudgetPerTeam: number;
  maxBidPerPlayer: number;
  minBidIncrement: number;
  maxBidIncrement: number;
  safeFundBufferPercent: number;
  minPlayersRequired: number;
  maxPlayersAllowed: number;
  reservedFundPerRemainingPlayer: number;
  /** 'constraint' blocks the bid; 'releaseRefund' prompts team to release a player */
  budgetMode?: 'constraint' | 'releaseRefund';
}

/** A pending release request for a team to choose a player to drop */
export interface ReleaseRequest {
  teamId: string;
  teamName: string;
  reason: string;
  requestedAt: string;
  /** ID of the player being bid on (context) */
  forPlayerId?: string;
  /** Amount the team needs freed up */
  requiredAmount?: number;
  status: 'pending' | 'completed' | 'cancelled';
}

// Loading screen configuration
export interface LoadingScreenConfig {
  mode: 'logo' | 'video';
  logoUrl?: string;
  videoUrl?: string;
  textOverlay?: string;
}

// Team owner info
export interface TeamOwner {
  id: string;
  name: string;
  imageUrl?: string;
  brandImageUrl?: string;
  designation?: string;
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
  /** Selected sport/game for the auction (e.g. 'cricket', 'kabaddi', 'football', etc.) */
  sport?: 'cricket' | 'kabaddi' | 'football' | 'volleyball' | 'basketball' | 'badminton' | string;
  // Auction role ordering — persisted sequence of role categories
  auctionRoleOrder?: AuctionRoleCategory[];
  // Under-age spotlight threshold (e.g. 18)
  underAgeThreshold?: number;
  /**
   * When true (default), /connect-bidding shows clickable team cards with
   * zero-password auto-login. When false, teams must type their
   * admin-configured username and password.
   */
  easyLoginMode?: boolean;
  // Feature 1: Player stats fields to display in main listing
  playerStatsFields?: string[];
  // Feature 2: Custom special categories (replaces single underAgeThreshold)
  specialCategories?: SpecialCategory[];
  // Whether special categories / under-age constraints are enabled
  enableSpecialCategories?: boolean;
  // Feature 4: Budget rules configuration
  budgetRules?: BudgetRulesConfig;
  // Feature 5: Auction breaks
  auctionBreaks?: AuctionBreak[];
  currentBreakId?: string;
  // Feature 6: Loading screen config
  loadingScreen?: LoadingScreenConfig;
  // Feature 8: Team owners (keyed by team id)
  teamOwners?: Record<string, TeamOwner[]>;
  // Feature 10: Max iconic players per team
  maxIconicPlayers?: number;
  // Default country code for WhatsApp links (e.g. '91' for India)
  defaultCountryCode?: string;
  // Configurable bid increment ranges (e.g. 0-500 → 50, 500-1000 → 100)
  bidIncrementRanges?: BidIncrementRange[];
  // Currency suffix displayed after amounts (default 'L' for Lakhs, can be 'T' for Thousands etc.)
  currencySuffix?: string;
  /**
   * OBS overlay visual style for the live player lower-third.
   * 'classic'   → original bottom-center card
   * 'broadcast' → new TV-style lower-third (image + info + big bid + CricHeroes stats + marquee)
   * 'compact'   → slim single-row strip
   */
  obsOverlayStyle?: 'classic' | 'broadcast' | 'compact';
  /**
   * Live auction screen presentation style.
   * 'classic'   → original split hero (default, unchanged behaviour)
   * 'spotlight' → centered cutout with light rays + split stat columns
   * 'vibrant'   → accent splash panel with a full stat table
   */
  auctionLayout?: 'classic' | 'spotlight' | 'vibrant';
  /** Accent color for the broadcast overlay gradient (default deep blue). */
  obsOverlayAccent?: string;
  // Budget enforcement mode: 'constraint' blocks bids, 'releaseRefund' prompts player drop
  budgetMode?: 'constraint' | 'releaseRefund';
  // Custom player placeholder image URL (default /placeholder_player.png)
  playerPlaceholderImage?: string;
  // When true, mirror screen preload persists across sessions (localStorage) for faster reload
  mirrorPreloadPersist?: boolean;
  /**
   * Lightweight username/password (separate from the email-based admin login)
   * that unlocks Super Admin Mode directly on /connect-bidding-admin — designed
   * for quick mobile access without needing the full admin email sign-in.
   */
  superAdminUsername?: string;
  superAdminPassword?: string;
  /** Persisted seating-arrangement order of team IDs for Super Admin Mode's team grid */
  superAdminTeamOrder?: string[];
  // Branding placement controls
  branding?: {
    /** Show title sponsor logo on sold/unsold overlays */
    showTitleSponsorOnOverlays?: boolean;
    /** Show title sponsor logo in team squad view */
    showTitleSponsorInTeamView?: boolean;
    /** Show brand owner name on sold overlay */
    showBrandOnSoldOverlay?: boolean;
    /** Show brand owner name on team view header */
    showBrandInTeamHeader?: boolean;
    /** Auto-reduce player threshold by iconic player count */
    reduceThresholdByIconPlayers?: boolean;
    /** Break overlay content mode: 'sponsors' | 'teamOwners' | 'both' */
    breakContentMode?: 'sponsors' | 'teamOwners' | 'both';
    /** Show sponsor images during break */
    showSponsorsInBreak?: boolean;
    /** Show team owner images during break */
    showTeamOwnersInBreak?: boolean;
    /** Squad view right panel: 'iconPlayers' | 'owners' */
    squadViewMode?: 'iconPlayers' | 'owners';
    /** Squad view visual theme variant */
    squadTheme?: 'default' | 'premium' | 'royal';
  };
}

export interface BidIncrementRange {
  minAmount: number;
  maxAmount: number;
  increment: number;
  /** 'amount' adds the increment value; 'multiplier' multiplies currentBid by increment */
  mode?: 'amount' | 'multiplier';
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
      age: player.age ?? null,
      matches: player.matches ?? '',
      bestFigures: player.bowlingBestFigures || player.battingBestFigures || 'N/A',
      teamName,
      soldAmount: player.soldAmount,
      basePrice: player.basePrice ?? 0,
      imageUrl: player.imageUrl ?? '',
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

  async removeSoldPlayer(playerId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const soldPlayerRef = ref(this.db, `${DB_PATHS.SOLD_PLAYERS}/${playerId}`);
    await set(soldPlayerRef, null);
  }

  // ==================== RELEASE REQUESTS ====================

  /**
   * Create a release request for a team (prompts them to drop a player)
   */
  async createReleaseRequest(request: ReleaseRequest): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const path = tenantPath(`auction/releaseRequests/${request.teamId}`);
    await set(ref(this.db, path), request);
  }

  /**
   * Clear a release request (after completion or cancellation)
   */
  async clearReleaseRequest(teamId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const path = tenantPath(`auction/releaseRequests/${teamId}`);
    await set(ref(this.db, path), null);
  }

  /**
   * Listen to release requests for a specific team
   */
  onReleaseRequest(teamId: string, callback: (request: ReleaseRequest | null) => void): () => void {
    if (!this.db) return () => {};
    const path = tenantPath(`auction/releaseRequests/${teamId}`);
    const requestRef = ref(this.db, path);
    const unsub = onValue(requestRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as ReleaseRequest : null);
    });
    return unsub;
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
      age: player.age ?? null,
      matches: player.matches ?? '',
      bowlingBest: player.bowlingBestFigures || 'N/A',
      basePrice: player.basePrice ?? 0,
      round,
      timestamp: Date.now(),
      imageUrl: player.imageUrl ?? '',
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

    // Compress base64 data URLs to small thumbnails
    const compressedUrls = await Promise.all(
      players.map(p => compressImageUrl(p.imageUrl ?? ''))
    );

    const cleanPlayers = players.map((p, i) => ({
      ...p,
      imageUrl: compressedUrls[i],
    }));

    const snapshot: InitialSnapshot = {
      players: cleanPlayers,
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

  /**
   * Partially update just the Super Admin team seating order without
   * overwriting the rest of the admin settings document. Safe to call from
   * lightweight mobile screens that don't have the full settings loaded.
   */
  async updateSuperAdminTeamOrder(order: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await set(ref(this.db, `${DB_PATHS.ADMIN_SETTINGS}/superAdminTeamOrder`), order);
  }

  // ==================== TEAMS ====================

  /**
   * Save updated teams
   */
  async saveTeams(teams: Team[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Strip undefined values — Firebase RTDB rejects them
    const cleaned = teams.map(t => {
      const record: Record<string, unknown> = {
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl ?? '',
        playersBought: t.playersBought ?? 0,
        totalPlayerThreshold: t.totalPlayerThreshold ?? 11,
        remainingPlayers: t.remainingPlayers ?? 0,
        allocatedAmount: t.allocatedAmount ?? 0,
        remainingPurse: t.remainingPurse ?? 0,
        highestBid: t.highestBid ?? 0,
        captain: t.captain ?? '',
        underAgePlayers: t.underAgePlayers ?? 0,
      };
      if (t.primaryColor) record.primaryColor = t.primaryColor;
      if (t.secondaryColor) record.secondaryColor = t.secondaryColor;
      if (t.brandLogoUrl) record.brandLogoUrl = t.brandLogoUrl;
      if (t.ownerCompany) record.ownerCompany = t.ownerCompany;
      if (t.brandTagline) record.brandTagline = t.brandTagline;
      if (t.authUsername) record.authUsername = t.authUsername;
      if (t.authPassword) record.authPassword = t.authPassword;
      return record;
    });

    const teamsRef = ref(this.db, DB_PATHS.TEAMS);
    await set(teamsRef, cleaned);
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
   * Compresses base64 data URLs to small JPEG thumbnails to fit Firebase RTDB write limits
   */
  async saveAdminPlayers(players: Player[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Compress all data: URLs in parallel, then build clean records
    const compressedUrls = await Promise.all(
      players.map(p => compressImageUrl(p.imageUrl ?? ''))
    );

    const cleaned = players.map((p, i) => {
      const record: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        imageUrl: compressedUrls[i],
        role: p.role,
        age: p.age ?? null,
        matches: p.matches ?? '',
        runs: p.runs ?? '',
        wickets: p.wickets ?? '',
        battingBestFigures: p.battingBestFigures ?? '',
        bowlingBestFigures: p.bowlingBestFigures ?? '',
        basePrice: p.basePrice ?? 0,
      };
      if (p.phone) record.phone = p.phone;
      if (p.whatsappNumber) record.whatsappNumber = p.whatsappNumber;
      if (p.dateOfBirth) record.dateOfBirth = p.dateOfBirth;
      if (p.battingStats) record.battingStats = p.battingStats;
      if (p.bowlingStats) record.bowlingStats = p.bowlingStats;
      return record;
    });

    const playersRef = ref(this.db, DB_PATHS.ADMIN_PLAYERS);
    await set(playersRef, cleaned);
  }

  /**
   * Get admin-edited player list
   */
  async getAdminPlayers(): Promise<Player[] | null> {
    if (!this.db) throw new Error('Database not initialized');

    const playersRef = ref(this.db, DB_PATHS.ADMIN_PLAYERS);
    const snapshot = await get(playersRef);

    if (!snapshot.exists()) return null;

    const raw = snapshot.val();
    // Firebase may return objects with numeric keys or arrays with null gaps
    const arr: unknown[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
    // Filter out null/undefined entries and ensure each has at least an id
    return arr.filter(
      (p): p is Player => p != null && typeof p === 'object' && 'id' in (p as Record<string, unknown>)
    );
  }

  /**
   * Clear admin player overrides
   */
  async clearAdminPlayers(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await set(ref(this.db, DB_PATHS.ADMIN_PLAYERS), null);
  }

  // ==================== SPONSORS ====================

  /**
   * Get event sponsors list from Firebase
   */
  async getSponsors(): Promise<SponsorRecord[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sponsorsRef = ref(this.db, DB_PATHS.SPONSORS);
    const snapshot = await get(sponsorsRef);

    if (!snapshot.exists()) return [];

    const data = snapshot.val();
    const list = Array.isArray(data)
      ? data
      : Object.entries(data).map(([id, value]) => ({ id, ...(value as Omit<SponsorRecord, 'id'>) }));

    return (list as SponsorRecord[])
      .map((sponsor, index) => normalizeSponsorRecord(sponsor, index))
      .filter((sponsor): sponsor is SponsorRecord => sponsor !== null)
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  }

  subscribeSponsors(onUpdate: (sponsors: SponsorRecord[]) => void): () => void {
    if (!this.db) {
      onUpdate([]);
      return () => {};
    }

    const sponsorsRef = ref(this.db, DB_PATHS.SPONSORS);
    const unsubscribe = onValue(sponsorsRef, (snapshot) => {
      if (!snapshot.exists()) {
        onUpdate([]);
        return;
      }

      const data = snapshot.val();
      const list = Array.isArray(data)
        ? data
        : Object.entries(data).map(([id, value]) => ({ id, ...(value as Omit<SponsorRecord, 'id'>) }));

      const normalized = (list as SponsorRecord[])
        .map((sponsor, index) => normalizeSponsorRecord(sponsor, index))
        .filter((sponsor): sponsor is SponsorRecord => sponsor !== null)
        .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
      onUpdate(normalized);
    });

    return unsubscribe;
  }

  /**
   * Save event sponsors list to Firebase
   */
  async saveSponsors(sponsors: SponsorRecord[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedSponsors = sponsors
      .map((sponsor, index) => normalizeSponsorRecord(sponsor, index))
      .filter((sponsor): sponsor is SponsorRecord => sponsor !== null);

    const sponsorsRef = ref(this.db, DB_PATHS.SPONSORS);
    await set(sponsorsRef, normalizedSponsors);
  }

  // ==================== LIVE SUBSCRIPTIONS ====================

  subscribeSoldPlayers(onUpdate: (records: SoldPlayerRecord[]) => void): () => void {
    if (!this.db) { onUpdate([]); return () => {}; }
    const soldRef = ref(this.db, DB_PATHS.SOLD_PLAYERS);
    const unsub = onValue(soldRef, (snapshot) => {
      if (!snapshot.exists()) { onUpdate([]); return; }
      onUpdate(Object.values(snapshot.val()) as SoldPlayerRecord[]);
    });
    return unsub;
  }

  subscribeUnsoldPlayers(onUpdate: (records: UnsoldPlayerRecord[]) => void): () => void {
    if (!this.db) { onUpdate([]); return () => {}; }
    const unsoldRef = ref(this.db, DB_PATHS.UNSOLD_PLAYERS);
    const unsub = onValue(unsoldRef, (snapshot) => {
      if (!snapshot.exists()) { onUpdate([]); return; }
      onUpdate(Object.values(snapshot.val()) as UnsoldPlayerRecord[]);
    });
    return unsub;
  }

  subscribeTeams(onUpdate: (teams: Team[]) => void): () => void {
    if (!this.db) { onUpdate([]); return () => {}; }
    const teamsRef = ref(this.db, DB_PATHS.TEAMS);
    const unsub = onValue(teamsRef, (snapshot) => {
      if (!snapshot.exists()) { onUpdate([]); return; }
      const data = snapshot.val();
      const list = Array.isArray(data) ? data : Object.values(data);
      onUpdate(list as Team[]);
    });
    return unsub;
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
   * Wipe ONLY the live session state used during a running auction.
   * Preserves teams, players, sponsors, theme/admin settings, and per-team
   * wishlists. Use this between sessions to keep RTDB lean.
   *
   * Cleared paths (under tenants/{tenantId}/):
   *   - auction/currentState     (live broadcast snapshot)
   *   - auction/mobileBids       (mobile bid stream)
   *   - auction/sessionReset     (reset signal)
   *   - auction/broadcastControl (overlay mode flags)
   */
  async clearLiveSessionState(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const livePaths = [
      tenantPath('auction/currentState'),
      tenantPath('auction/mobileBids'),
      tenantPath('auction/sessionReset'),
      tenantPath('auction/broadcastControl'),
    ];

    await Promise.all(livePaths.map(p => set(ref(this.db!, p), null)));
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
