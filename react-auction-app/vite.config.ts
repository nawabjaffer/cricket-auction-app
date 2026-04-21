/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/utils/**', 'src/services/auctionRules.ts', 'src/store/auctionStore.ts'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**'],
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      onwarn(warning, warn) {
        if (typeof warning?.message === 'string' && warning.message.includes('is dynamically imported by')) {
          return;
        }
        warn(warning);
      },
    },
  },
  server: {
    // Expose on network for mobile device testing
    host: true,
    port: 5173,
    proxy: {
      // Proxy Drive URLs through dev server to bypass CORS
      '/api/proxy-drive': {
        target: 'https://drive.google.com',
        changeOrigin: true,
        rewrite: (path) => {
          // /api/proxy-drive?id=XXX -> /uc?export=view&id=XXX
          const url = new URL(path, 'http://localhost');
          const fileId = url.searchParams.get('id');
          if (fileId) {
            return `/uc?export=view&id=${fileId}`;
          }
          return path;
        },
      },
    },
  },
})