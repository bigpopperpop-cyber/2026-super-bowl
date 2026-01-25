import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Define variables for both build-time and runtime
  const processEnvDef: Record<string, any> = {
    'process.env': {}
  };

  // Populate process.env with loaded variables
  Object.keys(env).forEach((key) => {
    processEnvDef[`process.env.${key}`] = JSON.stringify(env[key]);
  });

  // Specifically ensure API_KEY is available
  processEnvDef['process.env.API_KEY'] = JSON.stringify(env.API_KEY || env.VITE_API_KEY || '');

  return {
    plugins: [react()],
    define: processEnvDef,
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom']
          }
        }
      }
    }
  };
});