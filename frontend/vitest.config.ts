// vitest.config.ts
// Config Vitest séparée de vite.config.ts : le plugin VitePWA (manifest,
// service worker) n'a aucun sens en environnement de test et complique
// inutilement le graphe de modules.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
