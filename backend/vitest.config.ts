import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Sans exclusion explicite, `dist/` (généré par `npm run build`, présent
    // en CI où build et test tournent dans le même job) est aussi scanné et
    // fait tourner chaque test deux fois (une fois depuis src/, une fois
    // depuis sa version compilée dans dist/).
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
