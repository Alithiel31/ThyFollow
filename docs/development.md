# Local development

🇫🇷 [Version française](./development.fr.md)

[Back to the README](../README.md)

Prerequisites: Node.js 24 (`.nvmrc` — `nvm use`) and a PostgreSQL database.

## Database

Any PostgreSQL works. A throwaway one with Docker:

```bash
docker run -d --name thyrotrack-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=thyrotrack postgres:17
```

then `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/thyrotrack"` in `backend/.env`.

## Backend (port 3001)

```bash
cd backend
npm install
cp .env.example .env            # set DATABASE_URL and a JWT_SECRET (32+ characters)
npx prisma migrate deploy       # replays prisma/migrations on an empty database
npx prisma generate
npm run db:seed                 # demo account: demo@thyrotrack.com / demo1234
npm run dev                     # tsx watch — reloads on change
```

Login is refused until an account's email is verified. Without `RESEND_API_KEY`, no email is sent,
so verify accounts by hand: open `npm run db:studio` and set `emailVerified` to `true` on the user
(or read `verificationToken` and call `POST /api/auth/verify-email`). This applies to the seeded
demo account too: the seed creates it with `emailVerified` left at its default, `false`. Google
sign-in and Google Health stay disabled (`501`) until their variables are set — see
[environment.md](./environment.md).

### Database changes

```bash
npx prisma migrate dev --name <what-changed>   # edit schema.prisma first; creates and applies a migration
npm run db:studio                               # browse the data
```

Always commit the generated migration with the `schema.prisma` change: the CI replays every
migration on an empty database, then runs `prisma migrate diff` and **fails if `schema.prisma`
contains changes that have no migration**. The container applies migrations itself at startup
(`prisma migrate deploy`).

### Routes

Everything is under `/api` except `/health` and `/graphql`. All routes need `Authorization: Bearer
<jwt>` unless marked public.

| Area               | Routes                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health (public)    | `GET /health`                                                                                                                                                       |
| Auth (public)      | `POST /api/auth/register` · `login` · `verify-email` · `resend-verification` · `forgot-password` · `reset-password` — `GET /api/auth/oidc/google` and `…/callback` — `POST /api/auth/oidc/exchange` |
| Auth (JWT)         | `GET /api/auth/me` · `POST`/`DELETE /api/auth/oidc/google/link`                                                                                                     |
| Daily log          | `GET /api/entries?from=&to=` · `GET /api/entries/:date` · `POST /api/entries` (upsert by date) · `DELETE /api/entries/:date`                                        |
| Lab results        | `GET`/`POST /api/lab-results` · `GET`/`PUT`/`DELETE /api/lab-results/:id` · `POST /api/lab-results/import` (Pro) · `POST /api/lab-results/import/:docId/confirm` · `DELETE /api/lab-results/import/:docId` · `GET /api/lab-results/documents/:docId`                                                                                           |
| Medications        | `GET`/`POST /api/medications` · `PUT`/`DELETE /api/medications/:id` · `GET /api/medications/intakes` · `POST`/`DELETE /api/medications/:id/intake`                  |
| Appointments       | `GET`/`POST /api/appointments` · `PUT`/`DELETE /api/appointments/:id`                                                                                               |
| Profile            | `GET`/`PUT /api/profile` · `GET /api/profile/security/events`                                                                                                       |
| Pro access         | `POST /api/billing/checkout` · `POST /api/billing/portal` · `POST /api/billing/redeem` (promo code) · `POST /api/webhooks/stripe` (public, Stripe signature) — admin only: `GET`/`POST /api/admin/promo-codes` · `PATCH /api/admin/promo-codes/:id` |
| Analytics          | `GET /api/analytics/overview?days=` · `symptoms?days=` · `report`                                                                                                   |
| Articles           | `GET /api/articles` · `GET /api/articles/:slug` — admin only: `GET /api/articles/admin/all` · `POST /api/articles/admin` · `PUT`/`DELETE /api/articles/admin/:id`    |
| Google Health      | `POST`/`DELETE /api/integrations/google-health/link` · `GET /api/integrations/google-health/callback` (public, called by Google) · `POST /api/webhooks/google-health` (public, authenticated by its secret) |
| GraphQL            | `POST /graphql` — see [`backend/docs/graphql.md`](../backend/docs/graphql.md)                                                                                       |

Errors share the shape `{ "error": "…" }`, translated through `Accept-Language` (or `?lng=fr|en`).
Validation errors come from Zod; `401` is a missing or invalid token, `403` an admin-only route,
`429` the rate limiter, `501` a feature whose credentials are not configured. The REST list in the
README is maintained by hand; the routers (`backend/src/routers/`) are the source of truth.

### Tests (backend)

```bash
npm test          # vitest run
npm run lint      # eslint
npm run build     # tsc — type-check and compile to dist/
```

The suite covers the auth and OIDC controllers, the Google Health webhook and subscriber, token
encryption, and the GraphQL resolvers and DataLoaders. It uses mocks and needs neither a database
nor the network. `vitest.config.ts` excludes `dist/`: without it, the compiled copy produced by
`npm run build` would run every test a second time.

## Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:3001` (`vite.config.ts`), so the browser
stays on one origin exactly as in production.

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Dev server                                            |
| `npm run build`   | `tsc && vite build` → `dist/` (type-check + bundle)   |
| `npm run preview` | Serves the build                                      |
| `npm run lint`    | eslint                                                |
| `npm test`        | vitest (jsdom + Testing Library)                      |
| `npm run format`  | prettier                                              |

The tests cover the authentication screens, the daily log, the dashboard, medications, the profile
and the OAuth callback. Extending coverage to the lab results and appointments pages is listed
under `[Unreleased] > To do` in the CHANGELOG.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

| Job          | What it checks                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `backend`    | `npm ci`, lint, `npm run build` (type-check), `npm test`                                                                 |
| `frontend`   | `npm ci`, lint, `npm run build`, `npm test`                                                                              |
| `docker`     | Builds both `linux/arm64` images on an ARM runner (no push), with a GitHub Actions layer cache                          |
| `migrations` | Starts PostgreSQL 17, runs `prisma migrate deploy`, then fails if `schema.prisma` and the migrations have drifted apart  |
| `audit`      | `npm audit --omit=dev --audit-level=high` on both packages                                                               |
| `publish`    | Only after a merge to `main`, once `backend`, `frontend`, `docker` and `migrations` are green: pushes the images to GHCR (`ghcr.io/alithiel31/thyfollow-{backend,frontend}`), tagged `sha-<commit>` and `main` |

`codeql.yml` runs a CodeQL analysis on push, pull request and weekly. Dependabot (weekly) groups
dev dependencies and ignores **major** version bumps — those are done by hand, one at a time — and
Node's major version is changed manually too (Dockerfiles and `.nvmrc`).

Reproduce before pushing:

```bash
(cd backend  && npm run lint && npm run build && npm test)
(cd frontend && npm run lint && npm run build && npm test)
```

## Docker

```bash
cp .env.example .env              # DB_PASSWORD
cp backend/.env.example backend/.env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
docker compose logs -f backend
```

`docker-compose.yml` alone pulls the images published by CI (`IMAGE_TAG`, `main` by default);
`docker-compose.build.yml` builds them from source under a local name (`thyfollow-*:local`).

This Compose file assumes a PostgreSQL reachable at `host.docker.internal:5432` (with the role and
database already created) and an external Docker network `traefik-net`; see the README, "Deployment",
for what to change on a host without them. The `migrate` service runs `prisma migrate deploy` and
exits; `backend` only starts if it succeeded, and `frontend` waits for the backend healthcheck
(`GET /health`).
The seed script needs `ts-node`, a dev dependency that the production image leaves out
(`npm ci --omit=dev`): run `npm run db:seed` from a development checkout pointed at the target
database rather than inside the container. When something fails, start with
[TROUBLESHOOTING.md](../TROUBLESHOOTING.md).
