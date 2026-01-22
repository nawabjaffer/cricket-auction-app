#!/usr/bin/env node

/**
 * Image Cache Monitoring & Debug Script
 * Place this in browser console to monitor image preloading system
 * 
 * Usage:
 * 1. Open browser DevTools (F12)
 * 2. Go to Console tab
 * 3. Copy-paste the entire function below
 * 4. Call: imageCacheDebug.start()
 */

window.imageCacheDebug = (() => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  return {
    /**
     * Start monitoring image cache system
     */
    start: function() {
      console.clear();
      console.log('%c🖼️  Image Cache Debugging Started', 'color: #00ff00; font-size: 14px; font-weight: bold');
      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');

      // Set up real-time monitoring
      this.monitorCacheUpdates();
      this.monitorPreloading();
      this.displayStats();
    },

    /**
     * Monitor cache updates in real-time
     */
    monitorCacheUpdates: function() {
      // Hook into localStorage to detect cache updates
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'bcc_auction_image_cache') {
          try {
            const data = JSON.parse(value);
            console.log('%c📦 Cache Updated', 'color: #ffff00');
            console.log(`   Images: ${Object.keys(data.images).length}`);
            console.log(`   Version: ${data.version}`);
            console.log(`   Timestamp: ${new Date(data.timestamp).toLocaleTimeString()}`);
          } catch (e) {}
        }
        return originalSetItem.call(this, key, value);
      };
    },

    /**
     * Monitor preloading operations
     */
    monitorPreloading: function() {
      const self = this;
      const originalFetch = window.fetch;
      const imageRequests = new Map();

      window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('googleapis.com')) {
          return originalFetch.apply(this, args);
        }

        // Track image-like requests
        if (url.includes('googleusercontent.com') || url.includes('ui-avatars.com') || url.includes('drive.google.com')) {
          const requestId = `${Date.now()}-${Math.random()}`;
          imageRequests.set(requestId, { url, startTime: Date.now() });

          const promise = originalFetch.apply(this, args);
          return promise
            .then(response => {
              const duration = Date.now() - imageRequests.get(requestId).startTime;
              console.log(`%c✅ Image loaded: ${duration}ms`, 'color: #00ff00');
              console.log(`   URL: ${url.substring(0, 60)}...`);
              imageRequests.delete(requestId);
              return response;
            })
            .catch(error => {
              const duration = Date.now() - imageRequests.get(requestId).startTime;
              console.log(`%c❌ Image failed: ${duration}ms`, 'color: #ff0000');
              console.log(`   URL: ${url.substring(0, 60)}...`);
              imageRequests.delete(requestId);
              throw error;
            });
        }

        return originalFetch.apply(this, args);
      };
    },

    /**
     * Display current cache statistics
     */
    displayStats: function() {
      try {
        const cacheData = localStorage.getItem('bcc_auction_image_cache');
        if (cacheData) {
          const data = JSON.parse(cacheData);
          const images = data.images || {};
          
          let successful = 0;
          let failed = 0;
          let loading = 0;

          Object.values(images).forEach((img) => {
            if (img.status === 'success') successful++;
            else if (img.status === 'failed') failed++;
            else if (img.status === 'loading') loading++;
          });

          console.log('%c📊 Cache Statistics', 'color: #00ffff; font-size: 12px; font-weight: bold');
          console.log(`%c   Total: ${Object.keys(images).length}`, 'color: #ffffff');
          console.log(`%c   ✅ Successful: ${successful}`, 'color: #00ff00');
          console.log(`%c   ❌ Failed: ${failed}`, 'color: #ff0000');
          console.log(`%c   ⏳ Loading: ${loading}`, 'color: #ffff00');
          if (Object.keys(images).length > 0) {
            const successRate = ((successful / Object.keys(images).length) * 100).toFixed(1);
            console.log(`%c   Success Rate: ${successRate}%`, 'color: #0099ff');
          }
        } else {
          console.log('%c❌ No cache data found', 'color: #ff0000');
        }
      } catch (e) {
        console.error('Error displaying stats:', e);
      }

      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
    },

    /**
     * Get detailed cache entry info
     */
    getCacheEntry: function(imageUrl) {
      try {
        const cacheData = localStorage.getItem('bcc_auction_image_cache');
        if (cacheData) {
          const data = JSON.parse(cacheData);
          const entry = data.images[imageUrl];
          if (entry) {
            console.log('%c📄 Cache Entry', 'color: #0099ff; font-size: 12px; font-weight: bold');
            console.log(`   URL: ${entry.url}`);
            console.log(`   Status: ${entry.status}`);
            console.log(`   Loaded At: ${new Date(entry.loadedAt).toLocaleString()}`);
            console.log(`   Age: ${Math.round((Date.now() - entry.loadedAt) / 1000)}s`);
            return entry;
          } else {
            console.warn('URL not found in cache');
            return null;
          }
        }
      } catch (e) {
        console.error('Error getting cache entry:', e);
      }
    },

    /**
     * Search cache by URL pattern
     */
    searchCache: function(pattern) {
      try {
        const cacheData = localStorage.getItem('bcc_auction_image_cache');
        if (cacheData) {
          const data = JSON.parse(cacheData);
          const regex = new RegExp(pattern, 'i');
          const results = Object.entries(data.images).filter(([url]) => regex.test(url));
          
          console.log(`%c🔍 Found ${results.length} matches:`, 'color: #00ffff');
          results.forEach(([url, entry]) => {
            console.log(`   ${entry.status === 'success' ? '✅' : entry.status === 'failed' ? '❌' : '⏳'} ${url.substring(0, 70)}...`);
          });
          return results;
        }
      } catch (e) {
        console.error('Error searching cache:', e);
      }
    },

    /**
     * Export cache as JSON
     */
    exportCache: function() {
      try {
        const cacheData = localStorage.getItem('bcc_auction_image_cache');
        if (cacheData) {
          const data = JSON.parse(cacheData);
          console.log('%c📥 Cache Export:', 'color: #00ff00; font-size: 12px; font-weight: bold');
          console.log(JSON.stringify(data, null, 2));
          return data;
        }
      } catch (e) {
        console.error('Error exporting cache:', e);
      }
    },

    /**
     * Clear all cache
     */
    clearCache: function() {
      try {
        localStorage.removeItem('bcc_auction_image_cache');
        console.log('%c🗑️  Cache cleared successfully', 'color: #ff9900; font-size: 12px; font-weight: bold');
      } catch (e) {
        console.error('Error clearing cache:', e);
      }
    },

    /**
     * Simulate preload of specific URLs
     */
    preloadUrls: async function(urls) {
      console.log(`%c🚀 Starting preload of ${urls.length} URLs`, 'color: #ffff00');
      let successful = 0;
      let failed = 0;

      for (const url of urls) {
        try {
          await new Promise((resolve, reject) => {
            const img = new Image();
            const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
            img.onload = () => {
              clearTimeout(timeout);
              successful++;
              console.log(`   ✅ ${url.substring(0, 50)}...`);
              resolve();
            };
            img.onerror = () => {
              clearTimeout(timeout);
              failed++;
              console.log(`   ❌ ${url.substring(0, 50)}...`);
              reject();
            };
            img.src = url;
          });
        } catch (e) {
          failed++;
        }
      }

      console.log(`%c✅ Preload complete: ${successful}/${urls.length} successful`, 'color: #00ff00');
      return { successful, failed, total: urls.length };
    },

    /**
     * Monitor performance metrics
     */
    showPerformance: function() {
      console.log('%c⚡ Performance Metrics', 'color: #0099ff; font-size: 12px; font-weight: bold');
      
      const timing = performance.timing;
      const navigation = performance.navigation;
      
      if (timing && timing.loadEventEnd) {
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const domReadyTime = timing.domContentLoadedEventEnd - timing.navigationStart;
        const resourceLoadTime = timing.loadEventEnd - timing.domContentLoadedEventEnd;
        
        console.log(`   Page Load Time: ${loadTime}ms`);
        console.log(`   DOM Ready Time: ${domReadyTime}ms`);
        console.log(`   Resource Load Time: ${resourceLoadTime}ms`);
      }

      // Show memory usage if available
      if (performance.memory) {
        console.log(`%c💾 Memory Usage`, 'color: #ff99ff; font-size: 12px; font-weight: bold');
        console.log(`   Used JS Heap: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)}MB`);
        console.log(`   Total JS Heap: ${(performance.memory.totalJSHeapSize / 1048576).toFixed(2)}MB`);
        console.log(`   Heap Limit: ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`);
      }
    },

    /**
     * Help command
     */
    help: function() {
      console.log('%c🆘 Image Cache Debug Commands', 'color: #00ffff; font-size: 12px; font-weight: bold');
      console.log('imageCacheDebug.start()              - Start monitoring');
      console.log('imageCacheDebug.displayStats()       - Show cache statistics');
      console.log('imageCacheDebug.getCacheEntry(url)   - Get specific entry');
      console.log('imageCacheDebug.searchCache(pattern) - Search by pattern');
      console.log('imageCacheDebug.exportCache()        - Export all cache');
      console.log('imageCacheDebug.clearCache()         - Clear all cache');
      console.log('imageCacheDebug.preloadUrls(urls)    - Test preload URLs');
      console.log('imageCacheDebug.showPerformance()    - Show perf metrics');
      console.log('imageCacheDebug.help()               - Show this help');
    }
  };
})();

// Auto-start monitoring
window.imageCacheDebug.start();
console.log('%c\nType: imageCacheDebug.help() for commands', 'color: #00ff00');
