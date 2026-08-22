# Troubleshooting

🇫🇷 [Version française](./TROUBLESHOOTING.fr.md)

This document walks through the incidents encountered while setting up CI and the frontend test
suite, including the diagnostic process followed — not just the final fix. Goal: the next
contributor touching these areas (test dependencies, CI pipeline) doesn't start from zero.

---

## 1. `npm ci` fails on the frontend (out-of-sync lockfile)

### Symptom

When adding the CI workflow (`.github/workflows/ci.yml`), the frontend job failed right at the
`npm ci` step, before even reaching lint:

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

`npm ci` (unlike `npm install`) refuses to resolve anything: it requires `package-lock.json` to
match `package.json` exactly, otherwise it fails immediately — a deliberate `npm ci` choice to
guarantee reproducible builds. The frontend's `package.json` declared several devDependencies
(`eslint-config-prettier`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`,
`prettier`, `typescript-eslint`) that the lock file didn't know about at all, and `globals` was
pinned to a different major version there. Confirmed locally:

```bash
cd frontend && npm ci
# → same EUSAGE error as in CI
```

### Root cause

The lock file had been committed in a state predating an addition/change of devDependencies in
`package.json` — an `npm install` had run at some point (those packages were usable in dev),
but its result was never re-committed. `npm install` (used in dev) tolerates this drift and
silently fixes it on the fly; `npm ci` (used in CI) does not tolerate it. That's precisely why
`npm ci` is used in CI: it would have failed any build for as long as this lock file stayed
committed as-is — CI only surfaced a problem that was already there.

### Fix

```bash
cd frontend
npm install   # regenerates package-lock.json in sync with package.json
```

`npm ci` then goes green again. Commit the regenerated `package-lock.json` every time a
dependency changes in `package.json`, never the other way around.

---

## 2. Every backend test runs twice in CI

### Symptom

Locally, `npm test` (backend) reported 4 test files / 41 tests. In the CI job, which runs
`npm run build` then `npm test` in the same environment, Vitest reported 8 and 82 — every test
running twice:

```text
 ✓ dist/controllers/oidc.controller.test.js > googleAuthorize > responds 501 ...
 ✓ src/controllers/oidc.controller.test.ts > googleAuthorize > responds 501 ...
```

### Investigation

`npm run build` (`tsc`) compiles all of `src/`, **including `*.test.ts` files**, into `dist/`
(no `exclude` rule in `tsconfig.json` to keep tests separate). `vitest.config.ts` defined no
explicit exclusion beyond its defaults, and once `dist/` was populated by the previous `build`
step in the same job, Vitest scanned both `src/**/*.test.ts` and `dist/**/*.test.js` — two
strictly equivalent sets of test files, one TypeScript, one compiled.

Reproduced locally:

```bash
npm run build   # populates dist/, including dist/**/*.test.js
npm test        # 8 files / 82 tests instead of 4 / 41
```

### Root cause

CI step ordering (`build` before `test`, in the same workspace) + no explicit `dist/` exclusion
on the Vitest side. Harmless to the result (the duplicated tests pass or fail identically), but
misleading in the logs and doubles the run time for nothing.

### Fix

Explicit `dist/` exclusion in `backend/vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
```

`rm -rf dist && npm run build && npm test` confirms it's back to 4 files / 41 tests.

---

## 3. `vitest run` crashes in CI after adding frontend tests (Node 20 vs. Node 22+)

### Symptom

The frontend job failed at the `npm test` step, while passing without issue locally:

```text
Error: [vitest-pool]: Failed to start forks worker for test files .../LoginPage.test.tsx.
Caused by: TypeError: webidl.util.markAsUncloneable is not a function
 ❯ new CacheStorage node_modules/undici/lib/web/cache/cachestorage.js:20:17
 ❯ Object.<anonymous> node_modules/jsdom/lib/api.js:12:33

 Test Files  no tests
      Tests  no tests
     Errors  3 errors
```

Right before that, in the install logs, some warnings that had gone unnoticed:

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

`jsdom` and `@testing-library/jest-dom` had been installed (`npm install -D vitest jsdom
@testing-library/react @testing-library/jest-dom @testing-library/user-event`) from a dev
machine running Node 22: npm resolved their latest major versions (`jsdom@30`, `jest-dom@7`),
both compatible with Node ≥22 only. `.nvmrc`/`engines` pin this project to Node 20, and CI
actually uses it — `npm ci` still installs these packages (`EBADENGINE` is only a warning, not a
blocker), but `jsdom@30` depends on `undici@8` internally (for `fetch`/`CacheStorage`), which
uses a Node API introduced after version 20. Reproduced by installing Node 20.20.2 (CI's
version) via `nvm` locally: same error.

### Root cause

Version drift: installing a package locally with a newer Node version than the one the project
actually targets (`.nvmrc`) resolves majors that Node 20 can't run, with no immediately visible
failure (just a warning) — the failure only surfaces at runtime, in CI.

### Fix

Pin `jsdom` and `@testing-library/jest-dom` to the latest versions compatible with Node 20:

```bash
npm install -D jsdom@^26.1.0 @testing-library/jest-dom@6.9.1
```

`jsdom@26` doesn't depend on `undici` (introduced internally starting with `jsdom@30`) and
`@testing-library/jest-dom@6.9.1` is the last 6.x release before 6.10.0 also raised its
requirement to Node ≥22 — hence the exact version (`6.9.1`, no `^`) rather than a plain caret,
so a future `npm update` doesn't reintroduce the same regression.

Verified with Node 20.20.2 installed via `nvm install 20` locally (to reproduce the CI
environment exactly): `npm ci && npm run lint && npm run build && npm test` all pass with no
`EBADENGINE`.

**Lesson for next time**: before adding or bumping a test/tooling dependency, check that it
respects the project's Node constraint (`.nvmrc`) — a successful local `npm install` doesn't
guarantee it if the dev machine runs a newer Node version than CI.
