import { ref, get, set, update } from 'firebase/database';
import { realtimeSync } from './realtimeSync';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description: string;
  category: 'bidding' | 'ui' | 'notifications' | 'analytics' | 'other';
  updatedAt: number;
  updatedBy?: string;
}

export interface FeatureFlags {
  [key: string]: FeatureFlag;
}

const FEATURE_FLAGS_PATH = 'admin/featureFlags';

// Default feature flags
const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  'gesture-bidding': {
    name: 'Gesture-Based Bidding',
    enabled: true,
    description: 'Enable device motion sensor for gesture-based bidding (shake to bid)',
    category: 'bidding',
    updatedAt: Date.now()
  },
  'auto-bid': {
    name: 'Auto Bid',
    enabled: false,
    description: 'Enable automatic bidding increment suggestions',
    category: 'bidding',
    updatedAt: Date.now()
  },
  'sound-notifications': {
    name: 'Sound Notifications',
    enabled: true,
    description: 'Enable audio alerts for bid events',
    category: 'notifications',
    updatedAt: Date.now()
  },
  'toast-notifications': {
    name: 'Toast Notifications',
    enabled: true,
    description: 'Show toast messages for bidding events',
    category: 'notifications',
    updatedAt: Date.now()
  },
  'keyboard-shortcuts': {
    name: 'Keyboard Shortcuts',
    enabled: true,
    description: 'Enable keyboard shortcuts for quick actions',
    category: 'ui',
    updatedAt: Date.now()
  },
  'player-image-preload': {
    name: 'Image Preloading',
    enabled: true,
    description: 'Preload player images for faster display',
    category: 'ui',
    updatedAt: Date.now()
  },
  'bid-history': {
    name: 'Bid History',
    enabled: true,
    description: 'Show bid history for each player',
    category: 'ui',
    updatedAt: Date.now()
  },
  'analytics': {
    name: 'Analytics',
    enabled: false,
    description: 'Enable analytics tracking',
    category: 'analytics',
    updatedAt: Date.now()
  },
  'dark-mode': {
    name: 'Dark Mode',
    enabled: false,
    description: 'Enable dark mode theme option',
    category: 'ui',
    updatedAt: Date.now()
  },
  'team-stats': {
    name: 'Team Stats Display',
    enabled: true,
    description: 'Show detailed team statistics',
    category: 'ui',
    updatedAt: Date.now()
  },
  'export-data': {
    name: 'Data Export',
    enabled: true,
    description: 'Allow exporting auction data to CSV',
    category: 'other',
    updatedAt: Date.now()
  },
  'audit-log': {
    name: 'Audit Logging',
    enabled: false,
    description: 'Log all admin actions for audit trail',
    category: 'analytics',
    updatedAt: Date.now()
  }
};

class FeatureFlagsService {
  private static instance: FeatureFlagsService;
  private db: any;
  private flags: FeatureFlags = {};
  private initialized = false;
  private listeners: ((flags: FeatureFlags) => void)[] = [];

  private constructor() {
    this.initializeDB();
  }

  static getInstance(): FeatureFlagsService {
    if (!FeatureFlagsService.instance) {
      FeatureFlagsService.instance = new FeatureFlagsService();
    }
    return FeatureFlagsService.instance;
  }

  private initializeDB() {
    try {
      this.db = realtimeSync.getDatabase();
      if (!this.db) {
        console.warn('[FeatureFlagsService] Database not initialized yet');
      }
    } catch (error) {
      console.error('[FeatureFlagsService] Failed to get database:', error);
    }
  }

  private async ensureDbReady(): Promise<void> {
    if (!this.db) {
      await realtimeSync.ensureInitialized();
      this.initializeDB();
    }
  }

  /**
   * Initialize feature flags from Firebase or use defaults
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDbReady();

    if (!this.db) {
      console.warn('[FeatureFlagsService] Using default feature flags');
      this.flags = DEFAULT_FEATURE_FLAGS;
      this.initialized = true;
      return;
    }

    try {
      const snapshot = await get(ref(this.db, FEATURE_FLAGS_PATH));
      
      if (snapshot.exists()) {
        this.flags = snapshot.val();
      } else {
        // Initialize with defaults if not in Firebase
        this.flags = DEFAULT_FEATURE_FLAGS;
        await this.saveAllFlags();
      }

      this.initialized = true;
      console.log('[FeatureFlagsService] Initialized with', Object.keys(this.flags).length, 'flags');
    } catch (error) {
      console.error('[FeatureFlagsService] Error initializing:', error);
      this.flags = DEFAULT_FEATURE_FLAGS;
      this.initialized = true;
    }
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(featureKey: string): boolean {
    const flag = this.flags[featureKey];
    if (!flag) {
      console.warn(`[FeatureFlagsService] Unknown feature flag: ${featureKey}`);
      return false;
    }
    return flag.enabled;
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Get flags by category
   */
  getFlagsByCategory(category: FeatureFlag['category']): FeatureFlags {
    const filtered: FeatureFlags = {};
    Object.entries(this.flags).forEach(([key, flag]) => {
      if (flag.category === category) {
        filtered[key] = flag;
      }
    });
    return filtered;
  }

  /**
   * Get a single flag
   */
  getFlag(featureKey: string): FeatureFlag | null {
    return this.flags[featureKey] || null;
  }

  /**
   * Update a single feature flag
   */
  async toggleFeature(featureKey: string, enabled: boolean, updatedBy?: string): Promise<void> {
    if (!this.flags[featureKey]) {
      throw new Error(`Feature flag not found: ${featureKey}`);
    }

    this.flags[featureKey].enabled = enabled;
    this.flags[featureKey].updatedAt = Date.now();
    if (updatedBy) {
      this.flags[featureKey].updatedBy = updatedBy;
    }

    if (this.db) {
      try {
        await update(ref(this.db, `${FEATURE_FLAGS_PATH}/${featureKey}`), {
          enabled,
          updatedAt: Date.now(),
          ...(updatedBy && { updatedBy })
        });
        console.log(`[FeatureFlagsService] Updated flag: ${featureKey} = ${enabled}`);
      } catch (error) {
        console.error('[FeatureFlagsService] Error updating flag:', error);
        throw error;
      }
    }

    this.notifyListeners();
  }

  /**
   * Update multiple flags at once
   */
  async updateFlags(updates: Record<string, boolean>, updatedBy?: string): Promise<void> {
    const updateData: any = {};

    Object.entries(updates).forEach(([key, enabled]) => {
      if (!this.flags[key]) {
        console.warn(`[FeatureFlagsService] Unknown feature flag: ${key}`);
        return;
      }

      this.flags[key].enabled = enabled;
      this.flags[key].updatedAt = Date.now();
      if (updatedBy) {
        this.flags[key].updatedBy = updatedBy;
      }

      updateData[`${FEATURE_FLAGS_PATH}/${key}`] = {
        enabled,
        updatedAt: Date.now(),
        ...(updatedBy && { updatedBy })
      };
    });

    if (this.db && Object.keys(updateData).length > 0) {
      try {
        await update(ref(this.db), updateData);
        console.log('[FeatureFlagsService] Updated multiple flags');
      } catch (error) {
        console.error('[FeatureFlagsService] Error updating flags:', error);
        throw error;
      }
    }

    this.notifyListeners();
  }

  /**
   * Reset all flags to defaults
   */
  async resetToDefaults(): Promise<void> {
    this.flags = { ...DEFAULT_FEATURE_FLAGS };

    if (this.db) {
      try {
        await set(ref(this.db, FEATURE_FLAGS_PATH), this.flags);
        console.log('[FeatureFlagsService] Reset to default flags');
      } catch (error) {
        console.error('[FeatureFlagsService] Error resetting flags:', error);
        throw error;
      }
    }

    this.notifyListeners();
  }

  /**
   * Add a new custom feature flag
   */
  async addFlag(
    key: string,
    flag: FeatureFlag
  ): Promise<void> {
    if (this.flags[key]) {
      throw new Error(`Feature flag already exists: ${key}`);
    }

    this.flags[key] = flag;

    if (this.db) {
      try {
        await set(ref(this.db, `${FEATURE_FLAGS_PATH}/${key}`), flag);
        console.log(`[FeatureFlagsService] Added new flag: ${key}`);
      } catch (error) {
        console.error('[FeatureFlagsService] Error adding flag:', error);
        throw error;
      }
    }

    this.notifyListeners();
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(listener: (flags: FeatureFlags) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notify all subscribers of changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener({ ...this.flags });
    });
  }

  /**
   * Private helper to save all flags
   */
  private async saveAllFlags(): Promise<void> {
    if (!this.db) return;

    try {
      await set(ref(this.db, FEATURE_FLAGS_PATH), this.flags);
    } catch (error) {
      console.error('[FeatureFlagsService] Error saving flags:', error);
      throw error;
    }
  }

  /**
   * Get flag usage stats
   */
  getStats() {
    const total = Object.keys(this.flags).length;
    const enabled = Object.values(this.flags).filter((f) => f.enabled).length;
    const disabled = total - enabled;

    return { total, enabled, disabled };
  }
}

export const featureFlagsService = FeatureFlagsService.getInstance();
