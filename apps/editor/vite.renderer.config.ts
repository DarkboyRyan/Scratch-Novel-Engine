import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Pre-bundle the browser-safe filename validator before Electron loads the
  // page. Otherwise Vite may discover it after the first render, reload the
  // Renderer, and duplicate the startup project request in development.
  optimizeDeps: {
    include: ['filenamify/browser'],
  },
});
