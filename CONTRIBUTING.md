# Contributing

🇫🇷 [Version française](./CONTRIBUTING.fr.md)

Thanks for your interest in this project. ThyroTrack is a thyroid health tracking app (symptom
log, lab results, medications, appointments) — any contribution that fixes a bug, improves
reliability, or clarifies the documentation is welcome.

## Before you start

- For a non-trivial change (new feature, redesign), open an issue to discuss it before coding.
- For an obvious fix (typo, dead link, translation mistake), a direct PR is fine.
- Check that the item isn't already listed in the `[Unreleased] > To do` section of
  [`CHANGELOG.md`](./CHANGELOG.md).

## Development environment

```bash
git clone git@github.com:Alithiel31/ThyFollow.git
cd ThyFollow

cd backend && npm install && cd ..
cd frontend && npm install && cd ..

cp backend/.env.example backend/.env
# Fill in DATABASE_URL (local Postgres or via Docker) and JWT_SECRET
```

```bash
cd backend
npx prisma migrate dev
npx prisma generate
npm run db:seed   # Demo account: demo@thyrotrack.com / demo1234
```

Then, in two separate terminals:

```bash
cd backend && npm run dev   # http://localhost:3001
```

```bash
cd frontend && npm run dev  # http://localhost:5173
```

See [`README.md`](./README.md) for the details (optional Google OAuth, Docker Compose
deployment).

## Reproducing CI locally

The [`ci.yml`](./.github/workflows/ci.yml) workflow runs, on every PR to `main`, lint +
typecheck/build + tests for both backend and frontend. To reproduce locally:

```bash
# Backend
cd backend
npm run lint
npm run build   # tsc — typecheck
npm test        # vitest run

# Frontend
cd frontend
npm run lint
npm run build   # tsc && vite build — typecheck + build
npm test        # vitest run
```

Node 20 is required (`.nvmrc` at the root): both `package.json` files deliberately pin
`jsdom`/`@testing-library/jest-dom` to versions compatible with Node 20 (the latest majors of
these two packages require Node ≥22) — don't bump them without re-checking this constraint, see
[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

## Opening a Pull Request

1. Create a branch from `main` (`git checkout -b fix/my-fix`).
2. Commit with a clear message — this repo mixes `type(scope): description`
   (`fix(backend): ...`) and more descriptive English messages for larger changes; both are
   accepted, but the message should explain the **why**, not just the what.
3. If the change is notable for a user or a contributor, add an entry to the `[Unreleased]`
   section of [`CHANGELOG.md`](./CHANGELOG.md).
4. Make sure CI passes (see above to reproduce it locally before pushing).
5. Open the PR against `main`.

## Reporting an issue

For a bug, include:

- What was expected vs. what happened.
- Steps to reproduce.
- `backend` or `frontend` (or both), and the environment (local, Docker Compose).
- Relevant logs (`docker compose logs backend`, browser console) — **with any token, real
  email, or health data stripped out.**

Before opening the issue, take a look at [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md): incidents
already encountered and their diagnosis are documented there.

## Secrets and health data

- Never commit a real `.env` file, nor `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`,
  or a Postgres password — only `.env.example` files are versioned.
- This app handles health data (symptoms, lab results). Never use real personal data in an
  example, a test, an issue, or a screenshot; the demo account created by `npm run db:seed` is
  enough to illustrate a problem.
