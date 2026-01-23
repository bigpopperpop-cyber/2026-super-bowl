
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || '')
  },
  resolve: {
    // This is critical for Yjs to ensure only one instance is loaded, 
    // fixing the "Yjs was already imported" error in bundled builds.
    dedupe: ['yjs']
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
