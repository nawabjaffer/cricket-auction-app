import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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