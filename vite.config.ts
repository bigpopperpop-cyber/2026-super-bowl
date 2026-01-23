
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
  },
  resolve: {
    // Force Vite to deduplicate these packages to avoid "already imported" errors
    dedupe: ['yjs', 'react', 'react-dom']
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'yjs-vendor': ['yjs', 'y-webrtc', 'y-websocket', 'y-indexeddb'],
          'react-vendor': ['react', 'react-dom']
        }
      }
    }
  }
});
