# Troubleshooting

Ce document revient sur les incidents rencontrés lors de la mise en place de la CI et de la
suite de tests frontend, avec la démarche de diagnostic suivie — pas seulement le correctif
final. Objectif : que le prochain contributeur qui touche à ces zones (dépendances de test,
pipeline CI) ne reparte pas de zéro.

---

## 1. `npm ci` échoue sur le frontend (lockfile désynchronisé)

### Symptôme

En ajoutant le workflow CI (`.github/workflows/ci.yml`), le job frontend échouait dès l'étape
`npm ci`, avant même le lint :

```text
npm error `npm ci` can only install packages when your package.json and package-lock.json or
npm error npm-shrinkwrap.json are in sync. Please update your lock file with `npm install`
npm error before continuing.
npm error
npm error Missing: eslint-config-prettier@9.1.2 from lock file
npm error Missing: eslint-plugin-react-hooks@5.2.0 from lock file
npm error Missing: eslint-plugin-react-refresh@0.4.26 from lock file
npm error Invalid: lock file's globals@14.0.0 does not satisfy globals@15.15.0
npm error Missing: prettier@3.9.6 from lock file
npm error Missing: typescript-eslint@8.67.0 from lock file
```

### Investigation

`npm ci` (contrairement à `npm install`) refuse de résoudre quoi que ce soit : il exige que
`package-lock.json` corresponde exactement à `package.json`, sinon il échoue immédiatement — un
choix volontaire de `npm ci` pour garantir des builds reproductibles. Le `package.json` du
frontend déclarait plusieurs devDependencies (`eslint-config-prettier`,
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `prettier`, `typescript-eslint`) que
le lock file ne connaissait pas du tout, et `globals` y était à une version majeure différente.
Confirmé en local :

```bash
cd frontend && npm ci
# → même erreur EUSAGE qu'en CI
```

### Cause racine

Le lock file avait été committé dans un état antérieur à un ajout/changement de
devDependencies dans `package.json` — un `npm install` a bien tourné à un moment (ces paquets
sont utilisables en dev), mais son résultat n'a jamais été re-committé. `npm install` (utilisé
en dev) tolère cet écart et le corrige silencieusement à la volée ; `npm ci` (utilisé en CI) ne
le tolère pas. C'est précisément pour ça qu'on utilise `npm ci` en CI : il aurait fait échouer
n'importe quel build tant que ce lock file restait committé tel quel — la CI n'a fait que rendre
visible un problème déjà présent.

### Fix

```bash
cd frontend
npm install   # régénère package-lock.json en phase avec package.json
```

Puis `npm ci` repasse au vert. Committer le `package-lock.json` régénéré à chaque fois qu'une
dépendance change dans `package.json`, jamais l'inverse.

---

## 2. Chaque test backend s'exécute deux fois en CI

### Symptôme

En local, `npm test` (backend) annonçait 4 fichiers de test / 41 tests. Dans le job CI, qui
enchaîne `npm run build` puis `npm test` dans le même environnement, Vitest en annonçait 8 et 82
— chaque test tournant deux fois :

```text
 ✓ dist/controllers/oidc.controller.test.js > googleAuthorize > responds 501 ...
 ✓ src/controllers/oidc.controller.test.ts > googleAuthorize > responds 501 ...
```

### Investigation

`npm run build` (`tsc`) compile tout `src/`, **y compris les fichiers `*.test.ts`**, dans
`dist/` (aucune règle `exclude` dans `tsconfig.json` pour les tester à part). `vitest.config.ts`
ne définissait aucune exclusion explicite au-delà de ses valeurs par défaut, et une fois
`dist/` peuplé par l'étape `build` précédente dans le même job, Vitest scanne aussi bien
`src/**/*.test.ts` que `dist/**/*.test.js` — deux jeux de fichiers de test strictement
équivalents, l'un TypeScript, l'autre compilé.

Reproduit en local :

```bash
npm run build   # peuple dist/, y compris dist/**/*.test.js
npm test        # 8 fichiers / 82 tests au lieu de 4 / 41
```

### Cause racine

Ordre des étapes CI (`build` avant `test`, dans le même workspace) + absence d'exclusion
explicite de `dist/` côté Vitest. Inoffensif sur le résultat (les tests dupliqués passent ou
échouent de façon identique), mais trompeur dans les logs et double le temps d'exécution pour
rien.

### Fix

Exclusion explicite de `dist/` dans `backend/vitest.config.ts` :

```ts
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

`rm -rf dist && npm run build && npm test` confirme le retour à 4 fichiers / 41 tests.

---

## 3. `vitest run` plante en CI après l'ajout des tests frontend (Node 20 vs. Node 22+)

### Symptôme

Le job frontend échouait à l'étape `npm test`, alors qu'il passait sans problème en local :

```text
Error: [vitest-pool]: Failed to start forks worker for test files .../LoginPage.test.tsx.
Caused by: TypeError: webidl.util.markAsUncloneable is not a function
 ❯ new CacheStorage node_modules/undici/lib/web/cache/cachestorage.js:20:17
 ❯ Object.<anonymous> node_modules/jsdom/lib/api.js:12:33

 Test Files  no tests
      Tests  no tests
     Errors  3 errors
```

Juste avant, dans les logs d'installation, des avertissements passés inaperçus :

```text
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: 'jsdom@30.0.1',
npm warn EBADENGINE   required: { node: '^22.22.2 || ^24.15.0 || >=26.0.0' },
npm warn EBADENGINE   current: { node: 'v20.20.2', npm: '10.8.2' }
npm warn EBADENGINE }
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: '@testing-library/jest-dom@7.0.1',
npm warn EBADENGINE   required: { node: '>=22', npm: '>=6', yarn: '>=1' },
```

### Investigation

`jsdom` et `@testing-library/jest-dom` avaient été installés (`npm install -D vitest jsdom
@testing-library/react @testing-library/jest-dom @testing-library/user-event`) depuis une
machine de dev tournant en Node 22 : npm a résolu leurs dernières versions majeures (`jsdom@30`,
`jest-dom@7`), toutes deux compatibles Node ≥22 seulement. `.nvmrc`/`engines` fixent Node 20
pour ce projet, et la CI l'utilise réellement — `npm ci` installe quand même ces paquets
(`EBADENGINE` n'est qu'un avertissement, pas un blocage), mais `jsdom@30` dépend de `undici@8`
en interne (pour `fetch`/`CacheStorage`), qui utilise une API Node introduite après la version
20. Reproduit en installant Node 20.20.2 (celle de la CI) via `nvm` en local : même erreur.

### Cause racine

Dérive de version : installer un paquet en local avec une version de Node plus récente que
celle réellement ciblée par le projet (`.nvmrc`) fait résoudre des majeures que Node 20 ne peut
pas exécuter, sans échec immédiat visible (juste un warning) — l'échec n'apparaît qu'au runtime,
en CI.

### Fix

Épingler `jsdom` et `@testing-library/jest-dom` sur les dernières versions compatibles Node 20 :

```bash
npm install -D jsdom@^26.1.0 @testing-library/jest-dom@6.9.1
```

`jsdom@26` ne dépend pas de `undici` (introduit en interne à partir de `jsdom@30`) et
`@testing-library/jest-dom@6.9.1` est la dernière 6.x avant que la 6.10.0 relève elle aussi son
exigence à Node ≥22 — d'où la version exacte (`6.9.1`, sans `^`) plutôt qu'un simple caret, pour
qu'un `npm update` futur ne réintroduise pas la même régression.

Vérifié avec Node 20.20.2 installé via `nvm install 20` en local (pour reproduire exactement
l'environnement CI) : `npm ci && npm run lint && npm run build && npm test` passent sans aucun
`EBADENGINE`.

**Leçon pour la suite** : avant d'ajouter ou de monter une dépendance de test/tooling, vérifier
qu'elle respecte la contrainte Node du projet (`.nvmrc`) — un `npm install` réussi en local ne le
garantit pas si le poste de dev tourne une version de Node plus récente que la CI.
