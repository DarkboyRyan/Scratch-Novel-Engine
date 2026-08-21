import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Keep local workspace sources live instead of serving stale pre-bundled
  // exports after Runtime or shared Player UI changes during development.
  optimizeDeps: {
    exclude: ['@vnengine/runtime', '@vnengine/player-ui'],
  },
});
