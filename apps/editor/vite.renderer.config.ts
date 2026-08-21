import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the browser-safe filename validator before Electron loads the
  // page. Otherwise Vite may discover it after the first render, reload the
  // Renderer, and duplicate the startup project request in development.
  // Workspace packages must stay in Vite's source module graph. Pre-bundling
  // them can leave a stale optimizeDeps artifact after a new named export is
  // added, which aborts ESM linking before React can mount and causes a blank
  // Editor window.
  optimizeDeps: {
    include: ['filenamify/browser'],
    exclude: ['@vnengine/runtime', '@vnengine/player-ui'],
  },
});
