import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_WISHLIST_PICKS } from '../services/wishlistService';

// We test the wishlist service logic without a real Firebase database.
// The service internals are simple CRUD — we verify the exported constants
// and the service shape.

describe('WishlistService exports', () => {
  it('MAX_WISHLIST_PICKS is 11', () => {
    expect(MAX_WISHLIST_PICKS).toBe(11);
  });
});

describe('WishlistService — offline contract', () => {
  // Re-import fresh module for each test to get a clean singleton
  let service: typeof import('../services/wishlistService')['wishlistService'];

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../services/wishlistService');
    service = mod.wishlistService;
  });

  it('throws when not initialized', async () => {
    await expect(service.getWishlist('team1')).rejects.toThrow('not initialized');
  });

  it('throws when adding player without init', async () => {
    await expect(service.addPlayer('team1', 'player1')).rejects.toThrow('not initialized');
  });

  it('throws when removing player without init', async () => {
    await expect(service.removePlayer('team1', 'player1')).rejects.toThrow('not initialized');
  });

  it('wishlistRefPath returns scoped path', () => {
    // We can call this even without initialization (it just builds a string)
    const path = service.wishlistRefPath('myTeam');
    expect(path).toContain('wishlists');
    expect(path).toContain('myTeam');
  });
});
