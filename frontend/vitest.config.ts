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
    // `npm run test:coverage` : résumé dans le terminal, rapport lcov dans
    // coverage/ (ignoré par Git, publié en artefact par la CI). Pas de seuil
    // bloquant pour l'instant.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts', 'src/types/**'],
    },
  },
});
