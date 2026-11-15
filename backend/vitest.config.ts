import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sans exclusion explicite, `dist/` (généré par `npm run build`, présent
    // en CI où build et test tournent dans le même job) est aussi scanné et
    // fait tourner chaque test deux fois (une fois depuis src/, une fois
    // depuis sa version compilée dans dist/).
    exclude: ['**/node_modules/**', '**/dist/**'],
    // `npm run test:coverage` : résumé dans le terminal, rapport lcov dans
    // coverage/ (ignoré par Git, publié en artefact par la CI). Pas de seuil
    // bloquant pour l'instant : la couverture se lit, elle ne fait pas encore
    // échouer un build.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**', 'src/index.ts'],
    },
  },
});
