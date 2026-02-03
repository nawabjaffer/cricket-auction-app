// ============================================================================
// STORAGE SERVICE - Browser storage abstraction
// DRY: Single interface for local/session storage operations
// ============================================================================

import { BaseService } from '../base/BaseService';
import type { IStorageService } from '../interfaces';
import { safeJsonParse } from '../../utils/helpers';
import { STORAGE_KEYS } from '../../utils/constants';

export class StorageService extends BaseService implements IStorageService {
  private readonly storage: Storage;

  constructor(useSessionStorage: boolean = false) {
    super('StorageService');
    this.storage = useSessionStorage ? sessionStorage : localStorage;
  }

  /**
   * Get item from storage
   */
  get<T>(key: string): T | null {
    try {
      const item = this.storage.getItem(key);
      if (item === null) return null;
      return safeJsonParse<T>(item, null as T);
    } catch (error) {
      this.log.error('Failed to get item from storage', { key, error });
      return null;
    }
  }

  /**
   * Set item in storage
   */
  set<T>(key: string, value: T): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      this.log.error('Failed to set item in storage', { key, error });
    }
  }

  /**
   * Remove item from storage
   */
  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch (error) {
      this.log.error('Failed to remove item from storage', { key, error });
    }
  }

  /**
   * Clear all items from storage
   */
  clear(): void {
    try {
      this.storage.clear();
    } catch (error) {
      this.log.error('Failed to clear storage', { error });
    }
  }

  /**
   * Get all keys in storage
   */
  keys(): string[] {
    try {
      const keys: string[] = [];
      for (let i = 0; i < this.storage.length; i++) {
        const key = this.storage.key(i);
        if (key) keys.push(key);
      }
      return keys;
    } catch (error) {
      this.log.error('Failed to get storage keys', { error });
      return [];
    }
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.storage.getItem(key) !== null;
  }

  /**
   * Get storage size in bytes (approximate)
   */
  getSize(): number {
    let size = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key) {
        const value = this.storage.getItem(key);
        if (value) {
          size += key.length + value.length;
        }
      }
    }
    return size * 2; // UTF-16 uses 2 bytes per character
  }
}

// ============================================================================
// CACHE SERVICE - In-memory cache with TTL
// ============================================================================

import type { ICacheService, ICacheEntry } from '../interfaces';

export class CacheService extends BaseService implements ICacheService {
  private readonly cache = new Map<string, ICacheEntry<unknown>>();
  private readonly defaultTTL: number;

  constructor(defaultTTLMs: number = 5 * 60 * 1000) { // 5 minutes default
    super('CacheService');
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Get item from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as ICacheEntry<T> | undefined;
    if (!entry) return null;

    if (this.isExpired(key)) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set item in cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    if (!this.cache.has(key)) return false;
    if (this.isExpired(key)) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete item from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Check if entry is expired
   */
  isExpired(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Get cache stats
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    for (const key of this.cache.keys()) {
      if (this.isExpired(key)) {
        this.delete(key);
      }
    }
  }
}

// Export singleton instances
export const localStorageService = new StorageService(false);
export const sessionStorageService = new StorageService(true);
export const cacheService = new CacheService();

// Re-export storage keys for convenience
export { STORAGE_KEYS };
