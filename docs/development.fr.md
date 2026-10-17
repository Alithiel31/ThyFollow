# Développement local

🇬🇧 [English version](./development.md)

[Retour au README](../README.fr.md)

Prérequis : Node.js 24 (`.nvmrc` — `nvm use`) et une base PostgreSQL.

## Base de données

N'importe quel PostgreSQL convient. Une base jetable avec Docker :

```bash
docker run -d --name thyrotrack-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=thyrotrack postgres:17
```

puis `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/thyrotrack"` dans `backend/.env`.

## Backend (port 3001)

```bash
cd backend
npm install
cp .env.example .env            # renseigner DATABASE_URL et un JWT_SECRET (32 caractères ou plus)
npx prisma migrate deploy       # rejoue prisma/migrations sur une base vide
npx prisma generate
npm run db:seed                 # compte de démo : demo@thyrotrack.com / demo1234
npm run dev                     # tsx watch — rechargement à chaque modification
```

La connexion est refusée tant que le courriel d'un compte n'est pas vérifié. Sans `RESEND_API_KEY`,
aucun courriel n'est envoyé : vérifier les comptes à la main, en ouvrant `npm run db:studio` pour
passer `emailVerified` à `true` sur l'utilisateur (ou en lisant `verificationToken` puis en appelant
`POST /api/auth/verify-email`). Cela vaut aussi pour le compte de démo du seed : il le crée avec
`emailVerified` à sa valeur par défaut, `false`. La connexion Google et Google Health restent
désactivées (`501`) tant que leurs variables ne sont pas définies — voir
[environment.fr.md](./environment.fr.md).

### Changements de base de données

```bash
npx prisma migrate dev --name <ce-qui-change>   # modifier schema.prisma d'abord ; crée et applique une migration
npm run db:studio                                # parcourir les données
```

Toujours commiter la migration générée avec la modification de `schema.prisma` : la CI rejoue chaque
migration sur une base vide, puis lance `prisma migrate diff` et **échoue si `schema.prisma` contient
des changements sans migration**. Le conteneur applique lui-même les migrations au démarrage
(`prisma migrate deploy`).

### Routes

Tout est sous `/api` sauf `/health` et `/graphql`. Toutes les routes exigent `Authorization: Bearer
<jwt>` sauf mention « public ».

| Domaine            | Routes                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Santé (public)     | `GET /health`                                                                                                                                                       |
| Auth (public)      | `POST /api/auth/register` · `login` · `verify-email` · `resend-verification` · `forgot-password` · `reset-password` — `GET /api/auth/oidc/google` et `…/callback` — `POST /api/auth/oidc/exchange` |
| Auth (JWT)         | `GET /api/auth/me` · `POST`/`DELETE /api/auth/oidc/google/link`                                                                                                     |
| Journal quotidien  | `GET /api/entries?from=&to=` · `GET /api/entries/:date` · `POST /api/entries` (upsert par date) · `DELETE /api/entries/:date`                                       |
| Analyses de sang   | `GET`/`POST /api/lab-results` · `GET`/`PUT`/`DELETE /api/lab-results/:id` · `POST /api/lab-results/import` (Pro) · `POST /api/lab-results/import/:docId/confirm` · `DELETE /api/lab-results/import/:docId` · `GET /api/lab-results/documents/:docId`                                                                                           |
| Médicaments        | `GET`/`POST /api/medications` · `PUT`/`DELETE /api/medications/:id` · `GET /api/medications/intakes` · `POST`/`DELETE /api/medications/:id/intake`                  |
| Rendez-vous        | `GET`/`POST /api/appointments` · `PUT`/`DELETE /api/appointments/:id`                                                                                               |
| Profil             | `GET`/`PUT /api/profile` · `GET /api/profile/security/events`                                                                                                       |
| Accès Pro          | `POST /api/billing/checkout` · `POST /api/billing/portal` · `POST /api/billing/redeem` (code promo) · `POST /api/webhooks/stripe` (public, signature Stripe) — administrateur : `GET`/`POST /api/admin/promo-codes` · `PATCH /api/admin/promo-codes/:id` |
| Analyses           | `GET /api/analytics/overview?days=` · `symptoms?days=` · `report`                                                                                                   |
| Articles           | `GET /api/articles` · `GET /api/articles/:slug` — administrateur : `GET /api/articles/admin/all` · `POST /api/articles/admin` · `PUT`/`DELETE /api/articles/admin/:id` |
| Google Health      | `POST`/`DELETE /api/integrations/google-health/link` · `GET /api/integrations/google-health/callback` (public, appelé par Google) · `POST /api/webhooks/google-health` (public, authentifié par son secret) |
| GraphQL            | `POST /graphql` — voir [`backend/docs/graphql.md`](../backend/docs/graphql.md)                                                                                      |

Les erreurs ont toutes la forme `{ "error": "…" }`, traduites selon `Accept-Language` (ou `?lng=fr|en`).
Les erreurs de validation viennent de Zod ; `401` signifie jeton absent ou invalide, `403` une route
réservée aux administrateurs, `429` le limiteur de débit, `501` une fonctionnalité dont les identifiants
ne sont pas configurés. La liste REST du README est tenue à la main ; les routeurs
(`backend/src/routers/`) font foi.

### Tests (backend)

```bash
npm test          # vitest run
npm run lint      # eslint
npm run build     # tsc — vérification des types et compilation vers dist/
```

La suite couvre les contrôleurs d'authentification et OIDC, le webhook et l'abonné Google Health, le
chiffrement des jetons, ainsi que les resolvers et DataLoaders GraphQL. Elle utilise des simulacres et
n'a besoin ni d'une base de données ni du réseau. `vitest.config.ts` exclut `dist/` : sans cela, la copie
compilée produite par `npm run build` ferait tourner chaque test une seconde fois.

## Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Le serveur de développement Vite proxifie `/api` vers `http://localhost:3001` (`vite.config.ts`) : le
navigateur reste sur une seule origine, exactement comme en production.

| Commande          | Effet                                                    |
| ----------------- | -------------------------------------------------------- |
| `npm run dev`     | Serveur de développement                                 |
| `npm run build`   | `tsc && vite build` → `dist/` (types + bundle)           |
| `npm run preview` | Sert le build                                            |
| `npm run lint`    | eslint                                                   |
| `npm test`        | vitest (jsdom + Testing Library)                         |
| `npm run format`  | prettier                                                 |

Les tests couvrent les écrans d'authentification, le journal quotidien, le tableau de bord, les
médicaments, le profil et le callback OAuth. Étendre la couverture aux pages d'analyses de sang et de
rendez-vous figure dans `[Unreleased] > À faire` du CHANGELOG.

## Intégration continue

`.github/workflows/ci.yml` tourne à chaque push et pull request vers `main` :

| Job          | Ce qu'il vérifie                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `backend`    | `npm ci`, lint, `npm run build` (types), `npm test`                                                                       |
| `frontend`   | `npm ci`, lint, `npm run build`, `npm test`                                                                               |
| `docker`     | Construit les deux images (sans push), avec un cache de couches GitHub Actions                                            |
| `migrations` | Démarre PostgreSQL 17, lance `prisma migrate deploy`, puis échoue si `schema.prisma` et les migrations ont divergé        |
| `audit`      | `npm audit --omit=dev --audit-level=high` sur les deux paquets                                                            |

`codeql.yml` lance une analyse CodeQL à chaque push, pull request et chaque semaine. Dependabot
(hebdomadaire) regroupe les dépendances de développement et ignore les montées de version **majeures** —
faites à la main, une par une — ; la version majeure de Node se change aussi à la main (Dockerfiles et
`.nvmrc`).

Reproduire avant de pousser :

```bash
(cd backend  && npm run lint && npm run build && npm test)
(cd frontend && npm run lint && npm run build && npm test)
```

## Docker

```bash
cp .env.example .env              # DB_PASSWORD
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose logs -f backend
```

Ce fichier Compose suppose un PostgreSQL joignable sur `host.docker.internal:5432` (rôle et base déjà
créés) et un réseau Docker externe `traefik-net` ; voir le README, « Déploiement », pour ce qu'il faut
changer sur un hôte qui n'en dispose pas. Le conteneur backend lance `prisma migrate deploy` avant
`node dist/index.js`, et `frontend` attend le healthcheck du backend (`GET /health`).

Le script de seed a besoin de `ts-node`, une dépendance de développement que l'image de production
n'embarque pas (`npm ci --omit=dev`) : lancer `npm run db:seed` depuis une copie de développement
pointée vers la base visée plutôt que dans le conteneur. En cas de problème, commencer par
[TROUBLESHOOTING.fr.md](../TROUBLESHOOTING.fr.md).
