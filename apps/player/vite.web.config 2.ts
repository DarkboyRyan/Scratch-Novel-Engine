import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(__dirname, 'src/web'),
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@vnengine/runtime', '@vnengine/player-ui'],
  },
  build: {
    outDir: path.resolve(__dirname, '.vite/web-player/payload'),
    emptyOutDir: true,
    assetsDir: 'player-assets',
    copyPublicDir: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'player-assets/player-[hash].js',
        chunkFileNames: 'player-assets/chunk-[hash].js',
        assetFileNames: 'player-assets/[name]-[hash][extname]',
      },
    },
  },
});
