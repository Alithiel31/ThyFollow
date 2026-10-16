# Security

🇫🇷 [Version française](./SECURITY.fr.md)

ThyroTrack handles **personal health data** (symptoms, lab results, medications, appointments).
Security reports are taken seriously, even though the project is maintained by a single person.

## Reporting a vulnerability

Please do **not** open a public issue for a security flaw — a regular GitHub issue exposes it to
everybody before a fix exists.

Two ways to report, in order of preference:

1. **[Report a vulnerability](https://github.com/Alithiel31/ThyFollow/security/advisories/new)**
   through the repository's Security tab (GitHub Security Advisories) — the report stays private
   between you and the maintainer and allows coordinated disclosure once a fix is out.
2. By email to [contact@alithiel31.dev](mailto:contact@alithiel31.dev) with `SECURITY` in the
   subject and, if possible: the affected component (backend, frontend, Docker/nginx, CI), the
   steps to reproduce, and the impact you foresee.

**Never include real health data or real credentials in a report** — the demo account created by
the seed script is enough to illustrate a problem.

### What can be promised

- Acknowledgement within **72 hours**.
- One maintainer, spare time: no formal SLA beyond the acknowledgement, but a confirmed flaw with
  real impact — above all one that exposes another user's data — goes before everything else.
- Credit in the [`CHANGELOG.md`](./CHANGELOG.md) once the fix is released, unless you prefer
  otherwise.
- No bug bounty — this is a personal project, not a company.

## Scope

In scope:

- The Express backend (`backend/`): REST API, GraphQL endpoint, authentication, Google OIDC and
  Google Health integrations, and their direct dependencies.
- The React frontend (`frontend/`) and its direct dependencies.
- The Docker and nginx configuration (`docker-compose.yml`, `frontend/nginx.conf`, the Dockerfiles).
- The GitHub Actions workflows (`.github/workflows/`).

Out of scope:

- Third-party services (Google, Resend, Cloudflare) — report them to their own teams.
- A flaw that requires physical access to the Raspberry Pi hosting the service, or already
  privileged access to the infrastructure (Tailscale, Cloudflare tunnel, the shared PostgreSQL
  instance).
- Pure volumetric attacks (flooding): the rate limiting described in
  [architecture.md](./docs/architecture.md) is a mitigation, not a guarantee of absorbing hostile
  traffic — an endpoint that escapes it, however, is in scope.
- Social engineering aimed at the maintainer or third parties.

## What is already in place

Before reporting something already covered, a few existing mechanisms (detailed in
[architecture.md](./docs/architecture.md) and [environment.md](./docs/environment.md)):

- **Authentication** — passwords hashed with bcrypt (cost 12); signed JWTs, and the server refuses to
  start in production with a `JWT_SECRET` shorter than 32 characters; email verification before the
  first login; Google sign-in through OpenID Connect with state, nonce and PKCE, and a one-time code
  so the session token never travels in a URL; stricter rate limiting on `/api/auth`.
- **Authorisation** — each data query is scoped to the authenticated user, with an ownership check
  before any update or deletion; the `ADMIN` role is re-read from the database on every request.
- **Secrets at rest** — Google Health access and refresh tokens are encrypted with AES-256-GCM
  (`TOKEN_ENCRYPTION_KEY`); the server refuses to start in production without a valid key when the
  feature is enabled. The webhook endpoint checks a shared secret before doing anything.
- **Lab report PDFs** — imported PDFs are decrypted with `qpdf` (the password goes through a
  temporary file, never a command-line argument), then stored **encrypted** (AES-256-GCM,
  `PDF_ENCRYPTION_KEY`, distinct from `TOKEN_ENCRYPTION_KEY`) and only served to their owner.
  Remembered PDF passwords are encrypted the same way and revocable from the profile, but **the
  server can decrypt them** (not zero-knowledge): a simultaneous leak of the database and the key
  would expose them. The optional AI extraction sends **only anonymised text** (never the PDF) to
  **Anthropic**, and only for users who opted in; the anonymisation is best-effort, not a guarantee.
- **Inputs** — request bodies are validated with Zod and sanitised against XSS
  (`express-xss-sanitizer`); the JSON body parser keeps its default size limit.
- **Headers** — `helmet` on the API; CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` and `Permissions-Policy` set by nginx on the SPA (`frontend/nginx.conf`).
- **Containers** — the backend runs as the unprivileged `node` user behind `dumb-init`; PostgreSQL is
  reached through a dedicated role (`thyrotrack_app`), not a superuser.
- **Supply chain** — `npm audit --omit=dev --audit-level=high` blocks the CI on production
  dependencies; CodeQL analyses the code on every push, pull request and weekly; Dependabot opens
  weekly pull requests (major versions are handled by hand).
- **Health data hygiene** — the API responses are never cached by the service worker.

## Supported versions

A single deployment, no version branches: only the code on `main` — the one actually running in
production — receives security fixes.
