# Environment variables

🇫🇷 [Version française](./environment.fr.md)

[Back to the README](../README.md)

There are two separate files, read by two separate things:

| File               | Read by                                  | Template               |
| ------------------ | ---------------------------------------- | ---------------------- |
| `.env` (root)      | `docker compose` (variable substitution) | `.env.example`         |
| `backend/.env`     | the backend (`env_file` + `dotenv`)      | `backend/.env.example` |

Only `.env.example` files are versioned — never commit a real `.env`.

## Root `.env` (Docker Compose)

| Variable      | Required | Description                                                                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD` | ✅       | Password of the PostgreSQL role `thyrotrack_app` on the shared instance (for example `openssl rand -hex 24`). Compose builds `DATABASE_URL` from it. |
| `PDF_ENCRYPTION_KEY` | ❌ | Forwarded to the backend (see [PDF lab report import](#pdf-lab-report-import)). Empty disables the import. |
| `ANTHROPIC_API_KEY`  | ❌ | Forwarded to the backend: enables the AI fallback extraction. Empty disables it. |

### Production secrets with Infisical (`deploy.sh`)

On the production host the three variables above are **not** read from the root `.env`: `deploy.sh`
logs in to Infisical (Machine Identity, Universal Auth) and runs `docker compose up -d --build`
inside `infisical run`, so the secrets exist only in the process environment.

| Infisical secret (project *Shared Keys*, environment `Production`) | Becomes | Notes |
| --- | --- | --- |
| `PG_THYROTRACK_PASSWORD` | `DB_PASSWORD` | Renamed by `deploy.sh`: Compose expects `DB_PASSWORD`. |
| `PDF_ENCRYPTION_KEY`     | `PDF_ENCRYPTION_KEY` | **Required by `deploy.sh`**: 64 hexadecimal characters, otherwise the deployment stops before touching Docker. |
| `ANTHROPIC_API_KEY`      | `ANTHROPIC_API_KEY`  | Optional: without it the AI fallback is disabled and `deploy.sh` says so. |

`deploy.sh` reads its credentials from `.infisical-identity.env` (git-ignored; template:
`.infisical-identity.env.example`): `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`,
`INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`, `INFISICAL_API_URL`, `INFISICAL_PROJECT_ID` and optionally
`INFISICAL_ENV` (`prod` by default). The real file holds a secret and the real tailnet name: never
commit it. Without Infisical, fill the root `.env` and run `docker compose up -d --build` as usual.

## Backend (`backend/.env`)

Read by `src/config.ts`, which centralises every access to `process.env`. The Compose file overrides
`DATABASE_URL`, `NODE_ENV`, `PORT` and `FRONTEND_URL` for the container.

### Core

| Variable        | Required        | Default                  | Description                                                                                                                                       |
| --------------- | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`  | ✅              | —                        | PostgreSQL connection string (used by Prisma). In Compose: `postgresql://thyrotrack_app:${DB_PASSWORD}@host.docker.internal:5432/thyrotrack`.      |
| `JWT_SECRET`    | ✅ in production | a dev-only value        | Secret that signs session tokens. **In production the server refuses to start if it is missing or shorter than 32 characters**; elsewhere it warns and uses a development value. |
| `JWT_EXPIRES_IN`| ❌              | `30d`                    | Session token lifetime.                                                                                                                           |
| `PORT`          | ❌              | `3001`                   | Port the API listens on.                                                                                                                          |
| `NODE_ENV`      | ❌              | `development`            | `production` enables the production guards (`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`).                                                              |
| `FRONTEND_URL`  | ❌              | `http://localhost:5173`  | CORS allow-list, comma-separated. In Compose: `http://caesura:8082,https://thyrotrack.alithiel31.dev`. Only a safety net in production, where nginx makes everything same-origin. |
| `APP_URL`       | ❌              | first entry of `FRONTEND_URL` | Canonical public URL of the frontend, used to build the links sent by email (verification, password reset). A single address, unlike `FRONTEND_URL`. |

### Email (Resend)

| Variable            | Required | Default                                 | Description                                                                                          |
| ------------------- | -------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`    | ❌       | —                                       | Resend API key. Without it, sending is skipped with a warning — handy locally, but nobody can then verify an account by email. |
| `RESEND_FROM_EMAIL` | ❌       | `ThyroTrack <onboarding@resend.dev>`    | Sender address; use a verified domain in production.                                                 |

### Sign in with Google (OIDC)

| Variable               | Required | Default                                                  | Description                                                                                   |
| ---------------------- | -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | ❌       | —                                                        | OAuth client id. Empty = the feature is disabled and `GET /api/auth/oidc/google` answers `501`. |
| `GOOGLE_CLIENT_SECRET` | ❌       | —                                                        | OAuth client secret.                                                                          |
| `GOOGLE_REDIRECT_URI`  | ❌       | `http://localhost:3001/api/auth/oidc/google/callback`    | Must match **exactly** an "Authorized redirect URI" declared at Google — the **backend** URL, not the frontend's. |

### Google Health synchronisation

All empty = the feature is disabled and the Profile card answers `501`. Setup is described in the
[README](../README.md#optional-sync-google-health-weight--heart-rate--sleep).

| Variable                             | Required                       | Default                                                          | Description                                                                                              |
| ------------------------------------ | ------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GOOGLE_HEALTH_CLIENT_ID`            | ❌                             | —                                                                | OAuth client id for the user consent flow. Separate credentials from the login ones (sensitive scopes).   |
| `GOOGLE_HEALTH_CLIENT_SECRET`        | ❌                             | —                                                                | Matching secret.                                                                                         |
| `GOOGLE_HEALTH_REDIRECT_URI`         | ❌                             | `http://localhost:3001/api/integrations/google-health/callback`  | Must match the redirect URI declared at Google.                                                          |
| `TOKEN_ENCRYPTION_KEY`               | ✅ if the client id is set     | —                                                                | 64 hexadecimal characters (32 bytes) encrypting the stored tokens with AES-256-GCM. In production the server refuses to start without a valid one. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_HEALTH_PROJECT_NUMBER`       | ❌ (needed for the subscriber) | —                                                                | Google Cloud project **number** — not its text id (Google answers 400/403 otherwise).                     |
| `GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY`  | ❌ (needed for the subscriber) | —                                                                | The **full JSON content** of the service account key (not a file path). Minimum role: Google Health API Editor. |
| `GOOGLE_HEALTH_WEBHOOK_SECRET`       | ❌ (needed for the subscriber) | —                                                                | Secret you choose, sent to Google at subscriber creation and echoed back in the `Authorization` header of every notification. Example: `node -e "console.log('Bearer ' + require('crypto').randomBytes(24).toString('hex'))"` |

The webhook subscriber is created at startup only when `GOOGLE_HEALTH_CLIENT_ID`,
`GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY` and `GOOGLE_HEALTH_PROJECT_NUMBER` are all set.

> **Rotating `TOKEN_ENCRYPTION_KEY`** makes every stored Google Health token undecryptable: users
> would have to link their device again. Rotating `JWT_SECRET` logs everybody out.

### PDF lab report import

| Variable                    | Required | Default                | Description |
| --------------------------- | -------- | ---------------------- | ----------- |
| `PDF_ENCRYPTION_KEY`        | ❌ (the import answers `501` without it) | — | 64 hexadecimal characters (32 bytes) encrypting the stored PDFs and remembered PDF passwords with AES-256-GCM. **Distinct from `TOKEN_ENCRYPTION_KEY`.** If set, it must be valid (production refuses to start otherwise). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PDF_ENCRYPTION_KEY_VERSION`| ❌       | `1`                    | Version of the key above, stored with every document (prepares a future rotation). |
| `ANTHROPIC_API_KEY`         | ❌       | —                      | Enables the AI fallback extraction (text only, anonymised, and only for users who opted in). Without it the rules-based extraction still works. |
| `ANTHROPIC_MODEL`           | ❌       | `claude-haiku-5-5`    | Model used by the fallback extraction (Haiku is enough for already-extracted text; switch to a larger model if a lab is misread). |
| `PDF_IMPORT_MAX_FILES`      | ❌       | `10`                   | Files per upload. |
| `PDF_IMPORT_MAX_BYTES`      | ❌       | `10485760` (10 MB)     | Size limit per file (a file between the limit and twice the limit is refused on its own; beyond, the whole upload is). |

The import also needs the `qpdf` binary (installed in the backend Docker image; for local
development install it with your package manager — `apt install qpdf`, `brew install qpdf`).

> **Rotating `PDF_ENCRYPTION_KEY`** makes every stored PDF and remembered PDF password undecryptable:
> there is no re-encryption tool yet. Stored PDFs live in the database (`lab_documents.dataEnc`,
> `bytea`), so they grow the database and its backups.

### Rate limiting

| Variable                     | Default            | Description                                              |
| ---------------------------- | ------------------ | -------------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`       | `900000` (15 min)  | Window of the global limiter                             |
| `RATE_LIMIT_MAX`             | `100`              | Requests per window per IP, whole API                    |
| `AUTH_RATE_LIMIT_WINDOW_MS`  | `900000` (15 min)  | Window of the `/api/auth` limiter                        |
| `AUTH_RATE_LIMIT_MAX`        | `20`               | Failed attempts per window per IP on `/api/auth` (successful requests are not counted) |

## Frontend

| Variable        | Description                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------- |
| `VITE_APP_NAME` | Present in `frontend/.env.example` but **read nowhere in the code**; it has no effect.         |

The frontend needs no configuration: it calls the relative path `/api`, which the Vite dev server
proxies to `http://localhost:3001` in development and nginx proxies to `backend:3001` in production.

## GitHub Actions

`ci.yml` needs no repository secret: the migration job starts its own throwaway PostgreSQL service
container. Dependabot and CodeQL work with the default permissions.
