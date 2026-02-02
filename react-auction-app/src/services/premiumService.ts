// ============================================================================
// PREMIUM SERVICE - V3 Premium Feature Management
// Handles premium user verification and feature gating
// ============================================================================

import { ref, get, set, onValue, type Database } from 'firebase/database';
import type { PremiumUser, PremiumTier, PremiumFeatures } from '../types/premium';
import { TIER_FEATURES } from '../types/premium';

const DB_PATHS = {
  PREMIUM_USERS: 'premium/users',
  PREMIUM_CONFIG: 'premium/config',
} as const;

class PremiumService {
  private db: Database | null = null;
  private currentUser: PremiumUser | null = null;
  private listeners: Set<(user: PremiumUser | null) => void> = new Set();

  initialize(db: Database) {
    this.db = db;
    console.log('[PremiumService] Initialized');
  }

  /**
   * Subscribe to premium status changes
   */
  subscribe(callback: (user: PremiumUser | null) => void): () => void {
    this.listeners.add(callback);
    // Immediately call with current state
    callback(this.currentUser);
    
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentUser));
  }

  /**
   * Load premium user data from Firebase
   */
  async loadPremiumUser(uid: string): Promise<PremiumUser | null> {
    if (!this.db) {
      console.warn('[PremiumService] Database not initialized');
      return null;
    }

    try {
      const userRef = ref(this.db, `${DB_PATHS.PREMIUM_USERS}/${uid}`);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        this.currentUser = {
          uid,
          email: data.email || '',
          tier: data.tier || 'free',
          subscriptionId: data.subscriptionId,
          expiresAt: data.expiresAt,
          features: this.getFeatures(data.tier || 'free'),
        };
        
        // Check if subscription expired
        if (this.currentUser.expiresAt && this.currentUser.expiresAt < Date.now()) {
          console.log('[PremiumService] Subscription expired, reverting to free tier');
          this.currentUser.tier = 'free';
          this.currentUser.features = TIER_FEATURES.free;
        }

        this.notifyListeners();
        return this.currentUser;
      }

      // User not found, return free tier
      this.currentUser = this.createFreeUser(uid, '');
      this.notifyListeners();
      return this.currentUser;
    } catch (error) {
      console.error('[PremiumService] Failed to load premium user:', error);
      return null;
    }
  }

  /**
   * Create a free tier user
   */
  private createFreeUser(uid: string, email: string): PremiumUser {
    return {
      uid,
      email,
      tier: 'free',
      features: TIER_FEATURES.free,
    };
  }

  /**
   * Get features for a tier
   */
  getFeatures(tier: PremiumTier): PremiumFeatures {
    return { ...TIER_FEATURES[tier] };
  }

  /**
   * Check if user has a specific feature
   */
  hasFeature(feature: keyof PremiumFeatures): boolean {
    if (!this.currentUser) return false;
    const value = this.currentUser.features[feature];
    return typeof value === 'boolean' ? value : value > 0;
  }

  /**
   * Get current user's tier
   */
  getCurrentTier(): PremiumTier {
    return this.currentUser?.tier || 'free';
  }

  /**
   * Get current user
   */
  getCurrentUser(): PremiumUser | null {
    return this.currentUser;
  }

  /**
   * Check if live streaming is available
   */
  canUseLiveStreaming(): boolean {
    return this.hasFeature('liveStreaming');
  }

  /**
   * Check if OBS integration is available
   */
  canUseOBS(): boolean {
    return this.hasFeature('obsIntegration');
  }

  /**
   * Check if multi-camera is available
   */
  canUseMultiCamera(): boolean {
    return this.hasFeature('multiCamera');
  }

  /**
   * Get maximum number of cameras allowed
   */
  getMaxCameras(): number {
    return this.currentUser?.features.maxCameras || 0;
  }

  /**
   * Check if RTMP output is available
   */
  canUseRTMP(): boolean {
    return this.hasFeature('rtmpOutput');
  }

  /**
   * Upgrade user tier (admin only)
   */
  async upgradeTier(uid: string, tier: PremiumTier, subscriptionId?: string, durationDays?: number): Promise<boolean> {
    if (!this.db) return false;

    try {
      const expiresAt = durationDays 
        ? Date.now() + (durationDays * 24 * 60 * 60 * 1000)
        : undefined;

      const userRef = ref(this.db, `${DB_PATHS.PREMIUM_USERS}/${uid}`);
      await set(userRef, {
        tier,
        subscriptionId,
        expiresAt,
        updatedAt: Date.now(),
      });

      if (this.currentUser?.uid === uid) {
        this.currentUser.tier = tier;
        this.currentUser.subscriptionId = subscriptionId;
        this.currentUser.expiresAt = expiresAt;
        this.currentUser.features = this.getFeatures(tier);
        this.notifyListeners();
      }

      return true;
    } catch (error) {
      console.error('[PremiumService] Failed to upgrade tier:', error);
      return false;
    }
  }

  /**
   * Listen to premium status changes in realtime
   */
  listenToUserStatus(uid: string, callback: (user: PremiumUser | null) => void): () => void {
    if (!this.db) {
      callback(null);
      return () => {};
    }

    const userRef = ref(this.db, `${DB_PATHS.PREMIUM_USERS}/${uid}`);
    const unsubscribe = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const user: PremiumUser = {
          uid,
          email: data.email || '',
          tier: data.tier || 'free',
          subscriptionId: data.subscriptionId,
          expiresAt: data.expiresAt,
          features: this.getFeatures(data.tier || 'free'),
        };
        
        this.currentUser = user;
        callback(user);
      } else {
        const freeUser = this.createFreeUser(uid, '');
        this.currentUser = freeUser;
        callback(freeUser);
      }
    });

    return unsubscribe;
  }

  /**
   * Clear current user (on logout)
   */
  clearUser() {
    this.currentUser = null;
    this.notifyListeners();
  }
}

export const premiumService = new PremiumService();
