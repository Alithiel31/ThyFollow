# 🦋 ThyroTrack

🇫🇷 [Version française](./README.fr.md)

[![CI](https://github.com/Alithiel31/ThyFollow/actions/workflows/ci.yml/badge.svg)](https://github.com/Alithiel31/ThyFollow/actions/workflows/ci.yml)

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![GraphQL](https://img.shields.io/badge/GraphQL-Apollo%20Server%205-E10098?logo=graphql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)

![Docker Compose](https://img.shields.io/badge/Docker%20Compose-self--hosted-2496ED?logo=docker&logoColor=white)
![Traefik](https://img.shields.io/badge/Traefik-reverse%20proxy-24A1C1?logo=traefikproxy&logoColor=white)
![Cloudflare](https://img.shields.io/badge/cloudflared-tunnel-F38020?logo=cloudflare&logoColor=white)
![Raspberry Pi](https://img.shields.io/badge/Raspberry%20Pi-self--hosted%20host-A22846?logo=raspberrypi&logoColor=white)

A web app for tracking thyroid health, inspired by the Clue app.  
**Stack**: TypeScript · Express · GraphQL (additive) · Prisma · PostgreSQL · React · Recharts · Docker

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick start (local)](#quick-start-local)
- [Deployment](#deployment-docker-compose-self-hosted)
- [Project structure](#project-structure)
- [Database schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Design System](#design-system)
- [Tech stack](#tech-stack)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## ✨ Features

| Module | Detail |
|---|---|
| **Daily log** | Energy, mood, anxiety, brain fog, 11 thyroid symptoms, medication taken, physical measurements (weight/heart rate/sleep, syncable via Google Health, e.g. Pixel Watch) |
| **Lab results** | TSH, FT4, FT3, Anti-TPO, Anti-TG, deficiencies (Ferritin, Vit D, B12…) with trend charts |
| **Medications** | Treatment management (Levothyroxine, etc.), dosage, frequency, adherence |
| **Appointments** | Medical calendar with reminders, statuses, specialized types |
| **Dashboard** | Medication streak, adherence, averages, next appointment, TSH history |
| **Profile** | Diagnosis, thyroid status, TSH/FT4/FT3 target ranges set by your doctor |

---

## 🏗️ Architecture

```mermaid
flowchart LR
    UI["Browser"]
    TR["Traefik<br/>reverse proxy (:8000)"]

    subgraph Host["Docker host (docker-compose.yml)"]
        FE["frontend<br/>nginx + React/Vite build<br/>:80"]
        BE["backend<br/>Express + TypeScript<br/>:3001"]
        FE -- "proxy /api/*" --> BE
    end

    DB[("PostgreSQL 17<br/>shared native instance (outside Docker)")]
    EXT["Google OAuth · Resend"]

    UI -- "HTTPS · cloudflared" --> TR
    TR -- "Host: thyrotrack.alithiel31.dev" --> FE
    BE -- "host.docker.internal:5432" --> DB
    BE -. "OIDC (Google login) / email sending" .-> EXT
```

The `frontend` container only serves static files (nginx); all `/api/*` requests are proxied
to `backend` (see `frontend/nginx.conf`), which is the only service that talks to PostgreSQL
via Prisma. The browser therefore only ever sees a single origin, which avoids any client-side
CORS configuration in production — `CORS_ORIGIN`/`FRONTEND_URL` remain a safety net in case the
backend is called directly.

No port is published on the host: `frontend` joins the `traefik-net` network (created by
Traefik, declared `external: true` in `docker-compose.yml`) and carries `traefik.*` labels that
route `thyrotrack.alithiel31.dev` to its internal port `80`. Traefik is a service shared across
several projects on this host, not managed by this repo. PostgreSQL isn't a service of this
`docker-compose.yml` either: it's a shared instance, also common to several projects on this
host, reached from the `backend` container via `host.docker.internal` (see `extra_hosts` in
`docker-compose.yml`).

---

## 🚀 Quick start (local)

### Prerequisites
- Node.js 20+
- PostgreSQL (or Docker)

### 1. Clone and install
```bash
git clone <url>
cd thyro-track
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configure the backend environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your DATABASE_URL and JWT_SECRET
```

#### (Optional) Enable "Sign in with Google"

Without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GET /api/auth/oidc/google` simply responds
`501` and the Google button stays inert — the rest of the app works normally. To enable it:

1. On the [Google Cloud Console](https://console.cloud.google.com/), create (or select) a project.
2. **APIs & Services → OAuth consent screen**: type *External*, fill in the app name and a support email, add the `openid`, `email`, `profile` scopes.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type *Web application*.
4. **Authorized JavaScript origins**: `http://localhost:5173` (the frontend URL).
5. **Authorized redirect URIs**: `http://localhost:3001/api/auth/oidc/google/callback` (must exactly match `GOOGLE_REDIRECT_URI` — this is the **backend**'s URL, not the frontend's).
6. Copy the generated *Client ID* and *Client Secret* into `backend/.env`:
   ```bash
   GOOGLE_CLIENT_ID="xxxxxxxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="xxxxxxxx"
   ```
In production, update the origins/redirect URIs with the real domain and adjust
`GOOGLE_REDIRECT_URI` (+ `APP_URL`) accordingly.

#### (Optional) Sync Google Health (weight / heart rate / sleep)

A feature distinct from "Sign in with Google" above: it links a connected device (e.g. a
**Pixel Watch**) via the [Google Health API](https://developers.google.com/health) to
automatically pre-fill Weight, Heart rate and Sleep hours in the daily log (a <kbd>⌚</kbd>
badge marks a synced value). Without `GOOGLE_HEALTH_CLIENT_ID`, the "Google Health" card in the
Profile page responds `501` and stays inactive.

Two distinct authentication flows are involved:
- **User OAuth** (`GOOGLE_HEALTH_CLIENT_ID`/`SECRET`): each user authorizes ThyroTrack to read
  their health data — this is the "Link" button in the Profile page.
- **Google Cloud IAM service account** (`GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY`): manages a
  **single project-wide webhook subscriber** (not per user), created once at backend startup.
  With an `AUTOMATIC` policy, Google then automatically routes notifications for every
  consenting user to this one subscriber — no individual subscription is needed.

> ⚠️ **`fetchDailyMetrics` (reading measurements) is still partly best-effort.** The host, the
> version (`health.googleapis.com/v4`), the OAuth scopes and the whole webhook subscription
> model were confirmed by reading the official documentation directly. The exact shape of the
> JSON body returned by the `dataTypes/{type}/dataPoints` endpoints (used to read values),
> however, could not be verified — the parsing in
> `backend/src/lib/googleHealth.ts#fetchDailyMetrics` is a best guess, to be adjusted if needed
> once real data has been observed.

**1. Project and API**

On the [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Health
API** on the project (the same one as "Sign in with Google", or a dedicated one). Note the
project's **number** (visible on the project's home page — not its text ID, Google returns a
400/403 error otherwise) for `GOOGLE_HEALTH_PROJECT_NUMBER`.

**2. OAuth client (user login)**

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type *Web
   application* — separate credentials from the login ones, since health scopes are sensitive.
2. **Authorized redirect URIs**: `http://localhost:3001/api/integrations/google-health/callback`
   (must match `GOOGLE_HEALTH_REDIRECT_URI`).
3. Copy the *Client ID*/*Client Secret* into `backend/.env` (`GOOGLE_HEALTH_CLIENT_ID`,
   `GOOGLE_HEALTH_CLIENT_SECRET`), and generate an encryption key for the stored tokens:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   to put in `TOKEN_ENCRYPTION_KEY` (required as soon as `GOOGLE_HEALTH_CLIENT_ID` is set, the
   server refuses to start in production otherwise).
4. Add your Google account as a **test user**: **Google Auth Platform → Audience → Test users →
   Add users** (necessary as long as the app isn't published/verified by Google — plenty for
   personal use).

**3. Service account (project-wide webhook subscriber)**

1. **IAM & Admin → Service Accounts → Create Service Account.**
2. Grant it the **"Google Health API Editor"** role (or Admin, depending on your needs).
3. Generate a JSON key for this service account (**Keys → Add Key → JSON** tab) and paste
   **the full content of the downloaded file** into `GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY` (not a
   file path — the env var holds the JSON itself).
4. Pick a secret and put it in `GOOGLE_HEALTH_WEBHOOK_SECRET`:
   ```bash
   node -e "console.log('Bearer ' + require('crypto').randomBytes(24).toString('hex'))"
   ```
   This secret is sent to Google when the subscriber is created and echoed back by Google in
   every notification — that's what lets the backend verify their authenticity.
5. Fill in `GOOGLE_HEALTH_PROJECT_NUMBER` (see step 1).

**4. Important: public HTTPS**

`POST /api/webhooks/google-health` must be reachable by Google over public HTTPS — this won't
work with `localhost`. A real, deployed domain is required for the subscriber to be created
successfully: Google performs a synchronous double-check of the endpoint at creation time (an
authenticated request that must respond 200/201, and an unauthenticated one that must respond
401/403), and **subscriber creation fails if either one fails.**

Once everything is filled in, restart the backend: it creates the subscriber automatically at
startup (check the logs to confirm `Google Health webhook subscriber "thyrotrack-webhook"
created.`).

In production, update `GOOGLE_HEALTH_REDIRECT_URI` with the real domain.

### 3. Initialize the database
```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed   # Creates a demo account: demo@thyrotrack.com / demo1234
```

### 4. Run in development

In two separate terminals:
```bash
cd backend && npm run dev   # http://localhost:3001
```
```bash
cd frontend && npm run dev  # http://localhost:5173
```

---

## 🐳 Deployment (Docker Compose, self-hosted)

This project's real-world deployment goes through the root `docker-compose.yml`: two services
(Express backend, frontend served by nginx) built from `backend/Dockerfile` and
`frontend/Dockerfile`. As of 2026-08-22, PostgreSQL is **no longer** a service in this file —
the backend connects to a PostgreSQL instance shared with other projects on the same host, and
the frontend no longer exposes a port: it's routed through a Traefik reverse proxy, itself
shared as well (see the architecture diagram above). These two external dependencies are
therefore prerequisites for any deployment with this file as-is:

- a network-reachable PostgreSQL instance, with a database and application role already created;
- a Traefik instance (Docker provider, `traefik-net` network) already running on the host.

> **Deploying on a host without a shared Traefik or PostgreSQL** (e.g. a fresh host, or an
> isolated test): this `docker-compose.yml` is no longer self-contained as-is. You'd need to
> either reintroduce a dedicated `postgres` service and republish a port on `frontend`
> (`ports: ["8082:80"]`, removing the `traefik.*` labels and the `traefik-net` network), or
> deploy your own Traefik instance. This isn't documented here since it isn't the configuration
> actually used for this project — ask if you need it.

### 1. Configure the environment
```bash
cp .env.example .env
# Fill in DB_PASSWORD: the password for the PostgreSQL application role
# (e.g. openssl rand -hex 24), already created on the shared instance.

cp backend/.env.example backend/.env
# Fill in JWT_SECRET (32+ characters), RESEND_API_KEY, and
# GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET if "Sign in with Google" is used.
# DATABASE_URL and FRONTEND_URL are already set in docker-compose.yml —
# adapt them to your own domain and PostgreSQL host before deploying.
```

### 2. Launch
```bash
docker compose up -d --build
```
The backend container automatically runs `prisma migrate deploy` at startup (see
`backend/Dockerfile`) and joins PostgreSQL via `host.docker.internal` (see `extra_hosts` in
`docker-compose.yml`) — the database must therefore already exist with the application role
expected by `DATABASE_URL`. The frontend is routed by Traefik based on its `traefik.*` labels
(a `Host` rule on the configured domain), the backend stays internal on `3001`.

### 3. Seed demo data (optional)
```bash
docker compose exec backend npm run db:seed
```

> **Generate a JWT_SECRET:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 📁 Project structure

```
thyro-track/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Full data models
│   │   └── seed.ts              # Demo data
│   ├── src/
│   │   ├── index.ts             # Express entry point
│   │   ├── lib/                 # Prisma client, i18n, logger, email (Resend), OIDC
│   │   ├── middleware/
│   │   │   ├── auth.ts          # JWT middleware
│   │   │   ├── admin.ts
│   │   │   ├── asyncHandler.ts
│   │   │   └── errorHandler.ts
│   │   ├── routers/             # Express route declarations (*.router.ts)
│   │   ├── controllers/         # Business logic + Zod validation (*.controller.ts)
│   │   └── graphql/             # POST /graphql endpoint, additive to the REST API — see backend/docs/graphql.md
│   ├── docs/
│   │   └── graphql.md           # Why/how of the GraphQL layer (N+1, auth, out of scope)
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage    # Overview
│   │   │   ├── LogPage          # Daily log (Clue-style)
│   │   │   ├── LabResultsPage   # Lab results + charts
│   │   │   ├── MedicationsPage  # Treatments
│   │   │   ├── AppointmentsPage
│   │   │   └── ProfilePage
│   │   ├── lib/
│   │   │   ├── api.ts           # Typed axios client
│   │   │   ├── store.ts         # Auth state (Zustand)
│   │   │   └── utils.ts         # Date/color helpers
│   │   └── types/index.ts       # Shared types + constants
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml            # Backend + Frontend (nginx) — PostgreSQL and Traefik are external
├── .env.example                  # Variables read by docker-compose.yml
└── LICENSE
```

---

## 🗃️ Database schema

```
User ──┬── UserProfile             (diagnosis, target ranges)
       ├── DailyEntry[]            (daily log — weight/HR/sleep with source MANUAL|GOOGLE_HEALTH)
       │     └── SymptomLog[]      (custom symptoms)
       ├── LabResult[]             (TSH, FT4, FT3, antibodies, deficiencies)
       ├── Medication[]            (treatments)
       ├── Appointment[]           (medical appointments)
       ├── GoogleHealthConnection  (encrypted tokens, Pixel Watch sync...)
       └── NotificationSetting
```

---

## 🔌 API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/auth/oidc/google            (redirects to Google — OAuth2 + OpenID Connect)
GET    /api/auth/oidc/google/callback

GET    /api/entries?from=&to=
GET    /api/entries/:date
POST   /api/entries              (upsert by date)
DELETE /api/entries/:date

GET    /api/lab-results
POST   /api/lab-results
PUT    /api/lab-results/:id
DELETE /api/lab-results/:id

GET    /api/medications
POST   /api/medications
PUT    /api/medications/:id
DELETE /api/medications/:id

GET    /api/appointments
POST   /api/appointments
PUT    /api/appointments/:id
DELETE /api/appointments/:id

GET    /api/profile
PUT    /api/profile

GET    /api/analytics/overview?days=90
GET    /api/analytics/symptoms?days=30

POST   /api/integrations/google-health/link      (starts the Pixel Watch/Google Health connection)
GET    /api/integrations/google-health/callback
DELETE /api/integrations/google-health/link
POST   /api/webhooks/google-health                (Google notifications + subscriber validation handshake)

POST   /graphql                                   (additive to the REST API above, doesn't replace it — see backend/docs/graphql.md)
```

---

## 🎨 Design System

- **Palette**: dark background (#0b0d14), purple accent (#7b61ff), teal (#00d4b4), pink (#ff6b8a)
- **Typography**: DM Serif Display (headings) + DM Sans (body)
- **UI**: CSS Modules, mobile-responsive with bottom navigation

---

## 📦 Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| API | Express 4 + TypeScript |
| GraphQL API | Apollo Server 5 + DataLoader (additive to REST, technical demo — see [`backend/docs/graphql.md`](./backend/docs/graphql.md)) |
| ORM | Prisma 5 |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) + bcryptjs, OAuth2 + OpenID Connect (Google, via `openid-client`) |
| Validation | Zod |
| Frontend | React 18 + Vite |
| State | Zustand + TanStack Query |
| Charts | Recharts |
| Routing | React Router 6 |
| Deployment | Docker Compose (self-hosted, Raspberry Pi) |
| Reverse proxy | Traefik (shared, `traefik-net`) |
| Public access | cloudflared (tunnel) |
| Database (infra) | PostgreSQL 17, shared native instance (outside Docker) |

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development setup, how to reproduce CI
locally, and the PR format. If you hit an issue, [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
documents incidents already encountered on this project (and their diagnosis).

## 📝 Changelog

Notable changes are documented in [`CHANGELOG.md`](./CHANGELOG.md) (French only).

## 📄 License

Private project — see [`LICENSE`](./LICENSE).
