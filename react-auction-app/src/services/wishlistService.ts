// ============================================================================
// WISHLIST SERVICE
// Per-team pre-auction wishlist ("dream picks"). Stored privately under
// `tenants/{id}/wishlists/{teamId}/{playerId} = { addedAt: number }`.
//
// Teams see only their own picks. A team may pick up to MAX_WISHLIST_PICKS
// players. The service is intentionally thin — React components subscribe
// directly via Firebase `onValue` for live updates.
// ============================================================================

import { type Database, get, ref, remove, set } from 'firebase/database';
import { tenantPath } from './tenantPath';

export const MAX_WISHLIST_PICKS = 11;

export interface WishlistEntry {
  addedAt: number;
}

export type WishlistMap = Record<string, WishlistEntry>;

class WishlistService {
  private db: Database | null = null;

  initialize(db: Database) {
    this.db = db;
  }

  private teamPath(teamId: string, playerId?: string): string {
    const safeTeam = encodeURIComponent(teamId);
    return playerId
      ? tenantPath(`wishlists/${safeTeam}/${encodeURIComponent(playerId)}`)
      : tenantPath(`wishlists/${safeTeam}`);
  }

  async getWishlist(teamId: string): Promise<WishlistMap> {
    if (!this.db) throw new Error('Wishlist service not initialized');
    const snap = await get(ref(this.db, this.teamPath(teamId)));
    if (!snap.exists()) return {};
    return snap.val() as WishlistMap;
  }

  /**
   * Add a player to the team's wishlist. Throws if the cap is reached.
   * @param cap Optional per-team cap. When omitted, falls back to MAX_WISHLIST_PICKS.
   *            Pass `team.totalPlayerThreshold` to enforce the admin-configured size.
   */
  async addPlayer(teamId: string, playerId: string, cap?: number): Promise<void> {
    if (!this.db) throw new Error('Wishlist service not initialized');
    const current = await this.getWishlist(teamId);
    if (current[playerId]) return; // already picked — no-op
    const effectiveCap = Math.max(1, Math.min(cap ?? MAX_WISHLIST_PICKS, MAX_WISHLIST_PICKS * 4));
    if (Object.keys(current).length >= effectiveCap) {
      throw new Error(`Wishlist is full (max ${effectiveCap} players)`);
    }
    const entry: WishlistEntry = { addedAt: Date.now() };
    await set(ref(this.db, this.teamPath(teamId, playerId)), entry);
  }

  async removePlayer(teamId: string, playerId: string): Promise<void> {
    if (!this.db) throw new Error('Wishlist service not initialized');
    await remove(ref(this.db, this.teamPath(teamId, playerId)));
  }

  /** Convenience subscription ref path (for onValue in components). */
  wishlistRefPath(teamId: string): string {
    return this.teamPath(teamId);
  }
}

export const wishlistService = new WishlistService();
