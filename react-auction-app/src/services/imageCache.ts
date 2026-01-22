// ============================================================================
// IMAGE CACHE SERVICE - Session & LocalStorage Caching
// Manages image loading state and caches across session
// ============================================================================

interface CachedImage {
  url: string;
  loadedAt: number;
  status: 'success' | 'failed' | 'loading';
}

interface ImageCacheData {
  images: Record<string, CachedImage>;
  version: number;
  timestamp: number;
}

const CACHE_VERSION = 1;
const CACHE_KEY = 'bcc_auction_image_cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity

/**
 * Image Cache Service
 * - Session memory cache (fast in-memory access)
 * - localStorage backup (persistent across page reloads)
 * - Automatic cleanup and expiry management
 */
class ImageCacheService {
  private sessionCache = new Map<string, CachedImage>();
  private preloadQueue = new Set<string>();
  private lastActivityTime = Date.now();

  constructor() {
    this.initializeCache();
    this.setupActivityTracking();
  }

  /**
   * Initialize cache from localStorage and validate expiry
   */
  private initializeCache(): void {
    try {
      const storedData = localStorage.getItem(CACHE_KEY);
      if (!storedData) return;

      const data: ImageCacheData = JSON.parse(storedData);

      // Validate cache version and expiry
      if (data.version !== CACHE_VERSION) {
        console.log('[ImageCache] Cache version mismatch, clearing old cache');
        localStorage.removeItem(CACHE_KEY);
        return;
      }

      const now = Date.now();
      if (now - data.timestamp > CACHE_EXPIRY_MS) {
        console.log('[ImageCache] Cache expired, clearing');
        localStorage.removeItem(CACHE_KEY);
        return;
      }

      // Load valid cache into session memory
      Object.entries(data.images).forEach(([key, image]) => {
        this.sessionCache.set(key, image);
      });

      console.log('[ImageCache] Initialized with', this.sessionCache.size, 'cached images');
    } catch (error) {
      console.error('[ImageCache] Error initializing cache:', error);
      localStorage.removeItem(CACHE_KEY);
    }
  }

  /**
   * Setup activity tracking to refresh cache expiry
   */
  private setupActivityTracking(): void {
    const updateActivity = () => {
      this.lastActivityTime = Date.now();
    };

    // Track user activity
    ['click', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  /**
   * Get image from cache (session or localStorage)
   */
  getFromCache(imageUrl: string): CachedImage | null {
    if (!imageUrl) return null;

    // Check session cache first (fastest)
    if (this.sessionCache.has(imageUrl)) {
      const cached = this.sessionCache.get(imageUrl);
      console.log('[ImageCache] Hit:', imageUrl, '- Status:', cached?.status);
      return cached || null;
    }

    return null;
  }

  /**
   * Set image in cache (session + localStorage)
   */
  setInCache(imageUrl: string, status: 'success' | 'failed' | 'loading'): void {
    if (!imageUrl) return;

    const cachedImage: CachedImage = {
      url: imageUrl,
      loadedAt: Date.now(),
      status,
    };

    // Add to session cache
    this.sessionCache.set(imageUrl, cachedImage);

    // Persist to localStorage
    this.persistToLocalStorage();

    console.log('[ImageCache] Cached:', imageUrl, '- Status:', status);
  }

  /**
   * Mark image as successfully loaded
   */
  markAsLoaded(imageUrl: string): void {
    this.setInCache(imageUrl, 'success');
  }

  /**
   * Mark image as failed to load
   */
  markAsFailed(imageUrl: string): void {
    this.setInCache(imageUrl, 'failed');
  }

  /**
   * Mark image as loading
   */
  markAsLoading(imageUrl: string): void {
    if (!this.sessionCache.has(imageUrl)) {
      this.setInCache(imageUrl, 'loading');
    }
  }

  /**
   * Batch add multiple images to preload queue
   */
  addToPreloadQueue(imageUrls: string[]): void {
    imageUrls.forEach(url => {
      if (url && !this.sessionCache.has(url)) {
        this.preloadQueue.add(url);
      }
    });

    console.log('[ImageCache] Added', imageUrls.length, 'images to preload queue. Queue size:', this.preloadQueue.size);
  }

  /**
   * Get all images in preload queue
   */
  getPreloadQueue(): string[] {
    return Array.from(this.preloadQueue);
  }

  /**
   * Clear preload queue
   */
  clearPreloadQueue(): void {
    this.preloadQueue.clear();
  }

  /**
   * Remove image from preload queue
   */
  removeFromQueue(imageUrl: string): void {
    this.preloadQueue.delete(imageUrl);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.sessionCache.size;
    const successful = Array.from(this.sessionCache.values()).filter(
      img => img.status === 'success'
    ).length;
    const failed = Array.from(this.sessionCache.values()).filter(
      img => img.status === 'failed'
    ).length;
    const loading = Array.from(this.sessionCache.values()).filter(
      img => img.status === 'loading'
    ).length;

    return {
      total,
      successful,
      failed,
      loading,
      queueSize: this.preloadQueue.size,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0',
    };
  }

  /**
   * Check if cache is still fresh
   */
  isCacheFresh(): boolean {
    const inactivityDuration = Date.now() - this.lastActivityTime;
    return inactivityDuration < SESSION_TIMEOUT_MS;
  }

  /**
   * Persist session cache to localStorage
   */
  private persistToLocalStorage(): void {
    try {
      const data: ImageCacheData = {
        images: Object.fromEntries(this.sessionCache),
        version: CACHE_VERSION,
        timestamp: Date.now(),
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      // LocalStorage might be full or unavailable
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('[ImageCache] LocalStorage quota exceeded, clearing old cache');
        this.clearOldestEntries();
      } else {
        console.warn('[ImageCache] Error persisting to localStorage:', error);
      }
    }
  }

  /**
   * Clear oldest cache entries when storage is full
   */
  private clearOldestEntries(count: number = 50): void {
    const entries = Array.from(this.sessionCache.entries());
    entries
      .sort((a, b) => a[1].loadedAt - b[1].loadedAt)
      .slice(0, count)
      .forEach(([key]) => {
        this.sessionCache.delete(key);
      });

    this.persistToLocalStorage();
  }

  /**
   * Clear all cache
   */
  clearAll(): void {
    this.sessionCache.clear();
    this.preloadQueue.clear();
    localStorage.removeItem(CACHE_KEY);
    console.log('[ImageCache] All cache cleared');
  }

  /**
   * Cleanup stale cache entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    this.sessionCache.forEach((image, key) => {
      if (now - image.loadedAt > CACHE_EXPIRY_MS) {
        this.sessionCache.delete(key);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      this.persistToLocalStorage();
      console.log('[ImageCache] Cleaned up', cleanedCount, 'stale entries');
    }
  }
}

export const imageCacheService = new ImageCacheService();
