# Handover guide

🇫🇷 [Version française](./handover-guide.fr.md)

[Back to the README](../README.md)

ThyroTrack (repository `ThyFollow`) has a single real maintainer (**Jacques Duchamplecheval**,
GitHub alias `Alithiel31`). This document exists so that someone else — or Jacques himself after a
long break — can take the project over without rebuilding from memory what is documented
elsewhere, scattered, or known only to the maintainer. It points to the existing documentation
rather than duplicating it, and lists what you need to *have access to* in order to act, not just
to *understand*. The application stores **personal health data**, which makes the access and
backup questions below more than formalities.

---

## 1. Understanding the project — suggested reading order

1. [README.md](../README.md) — overview, features, local setup, Google credentials setup
2. [architecture.md](./architecture.md) — request path, authentication, Google Health sync, data model
3. [environment.md](./environment.md) — every environment variable
4. [development.md](./development.md) — run it locally, routes, tests, CI
5. [`backend/docs/graphql.md`](../backend/docs/graphql.md) — why the GraphQL layer exists and how it works
6. [TROUBLESHOOTING.md](../TROUBLESHOOTING.md), [SECURITY.md](../SECURITY.md), [CONTRIBUTING.md](../CONTRIBUTING.md)
7. [CHANGELOG.md](../CHANGELOG.md) — detailed history of the decisions (in French)

---

## 2. What runs, and where

| Component         | Where                                                          | How to reach it                                                                                              |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Application       | `thyrotrack.alithiel31.dev`                                    | Public domain, HTTPS through a Cloudflare Tunnel (`cloudflared`)                                             |
| Hosting           | A physical **Raspberry Pi** (host name `Caesura`)              | Network access through **Tailscale**                                                                         |
| Containers        | `docker-compose.yml` at the root (`thyrotrack-backend`, `thyrotrack-frontend`) | `docker compose ps` on the Pi                                                          |
| Reverse proxy     | **Traefik**, shared with the other projects of the Pi          | Not managed by this repository; `frontend` joins `traefik-net` and carries the routing labels                |
| Database          | **PostgreSQL 17**, a native instance **outside Docker**, shared with other projects | Database `thyrotrack`, role `thyrotrack_app`, reached via `host.docker.internal:5432`          |
| Deployment        | **Manual**: `docker compose up -d --build` on the Pi           | There is no continuous deployment workflow; GitHub Actions only runs checks                                  |
| Email             | **Resend**                                                     | Account holding the API key and the verified sending domain                                                  |
| Google            | A Google Cloud project                                         | OAuth client (login), OAuth client (Google Health), service account (webhook subscriber), consent screen     |

---

## 3. Secrets and access needed to act

No real secret is stored in this repository (see `.gitignore`, [SECURITY.md](../SECURITY.md)). To
take the project over in practice you need access to the following — **to be completed by the
current maintainer** (password manager in use, or any other secure way of handing them over):

- **Administrator access to the GitHub repository** [`Alithiel31/ThyFollow`](https://github.com/Alithiel31/ThyFollow)
- **`.env` and `backend/.env` as they are in production** — or the means to rebuild them from the templates ([environment.md](./environment.md)): `DB_PASSWORD`, `JWT_SECRET`, `RESEND_API_KEY`, the Google credentials
- **`TOKEN_ENCRYPTION_KEY`** — the one value that cannot be regenerated painlessly: without the original, every stored Google Health token is lost and each user must link their device again
- **Superuser access to the shared PostgreSQL instance** (to create the role and database, restore a backup)
- **Google Cloud project**: OAuth consent screen, the two OAuth clients, the service account and its JSON key, the project number
- **Resend account** and the DNS of the sending domain
- **Cloudflare account** (tunnel and domain `alithiel31.dev`) and **Tailscale account**
- **SSH or physical access to the Raspberry Pi** (containers, Traefik, `cloudflared`, PostgreSQL)

> The first administrator cannot be created from the application: nothing in the API grants the
> `ADMIN` role. It is set directly in the database
> (`UPDATE users SET role = 'ADMIN' WHERE email = '…'`).

---

## 4. Bringing the service back from scratch

If the Raspberry Pi is lost or replaced but the code and the secrets above are available:

1. Install Docker and Docker Compose, Tailscale and `cloudflared` on the new machine.
2. Install PostgreSQL 17 natively, then create the role and database:
   `CREATE ROLE thyrotrack_app LOGIN PASSWORD '…'; CREATE DATABASE thyrotrack OWNER thyrotrack_app;`
   Make sure the server listens on an address the Docker gateway can reach (`host.docker.internal`
   resolves to the host gateway through `extra_hosts`).
3. **Restore the latest backup** into `thyrotrack` if one exists — see the section below. Otherwise
   the container creates an empty schema by replaying the migrations at start.
4. Start a shared **Traefik** (Docker provider, `web` entrypoint) and create the network:
   `docker network create traefik-net`.
5. Reconfigure the Cloudflare tunnel so that `thyrotrack.alithiel31.dev` reaches Traefik.
6. Recreate `.env` and `backend/.env` ([environment.md](./environment.md)).
7. `docker compose up -d --build`, then check `docker compose ps` (both services `healthy`/up) and
   `curl localhost:8000/health -H 'Host: thyrotrack.alithiel31.dev'` or the public `/health`.
8. If Google Health is used: check the backend log for
   `Google Health webhook subscriber "thyrotrack-webhook" created.` and that the Google redirect
   URIs still match the public domain.

---

## 5. Known risks to keep in mind

- **Single maintainer** — this document reduces the risk without removing it; consider eventually
  sharing read access to the list of secrets with a second trusted person.
- **Backups are not documented.** PostgreSQL is shared and outside Docker, and nothing in this
  repository says how or how often it is backed up, or that a restore was ever tested. For health
  data this is the first thing to settle (see "To be completed" below).
- **A database dump went through git history.** `thyrotrack_backup_20260822.dump` was committed
  (commit `1911941`) and only untracked afterwards (commit `4f63ba7`); it is still retrievable from
  history. Check what it contained and, if it held real data, treat it as disclosed to everybody who
  can read the repository, rotate what needs rotating, and decide whether to purge the history.
- **Session tokens in `localStorage`** with a 30-day lifetime (`JWT_EXPIRES_IN`) — a cross-site
  scripting flaw would expose them; the CSP in `frontend/nginx.conf` (`script-src 'self'`) is the mitigation.
  They can be revoked: incrementing `User.tokenVersion` (done automatically on password reset)
  invalidates every session of that user.
- **Client IP behind several proxies.** nginx replaces `X-Forwarded-For` with the IP read from
  `CF-Connecting-IP` (set by Cloudflare), and the backend trusts that single hop (`trust proxy` set to
  `1`). A request that did not go through Cloudflare (direct tailnet access) keeps Traefik's IP. If the
  topology changes (no more Cloudflare, another proxy), revisit `set_real_ip_from` / `real_ip_header`
  in `frontend/nginx.conf`, then check from two different networks that the `RateLimit-Remaining`
  counters are independent.
- **Google Health parsing is best-effort** — `fetchDailyMetrics` was written without real payloads
  (see the CHANGELOG), so synced values may be missing or wrong until verified.
- **Google consent screen in testing mode** — while the application is not published, only listed test
  users can sign in or link Google Health, and Google may expire their authorisation periodically.
- **Single hardware point** — one personal Raspberry Pi; no redundancy or failover plan.

---

## To be completed by the maintainer

These fields are deliberately left empty — they concern personal information or credentials that do
not belong in a repository:

- [ ] Where the secrets listed in section 3 are stored (password manager, digital vault…) and who else can reach them
- [ ] **Backup policy of the PostgreSQL instance**: tool, frequency, location, retention, date of the last restore test
- [ ] Contents of `thyrotrack_backup_20260822.dump` and the decision taken about the git history
- [ ] Registrar of the domain `alithiel31.dev` and the account credentials
- [ ] Trusted person(s) to contact if the maintainer is unavailable for a long time
- [ ] Physical location of the Raspberry Pi and how to access it in an emergency
- [ ] Status of the Google OAuth consent screens (testing or published) and the list of test users
