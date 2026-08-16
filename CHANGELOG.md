# Changelog

Tous les changements notables de ce projet sont documentés ici. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.0.0/). Le projet n'utilise pas de versions
sémantiques taguées (`package.json` reste en `1.0.0`) : les entrées sont datées plutôt que
numérotées.

## [Unreleased]

### À faire

- Vérifier le format exact des notifications webhook et les chemins REST de la Google Health
  API (`lib/googleHealth.ts`, `controllers/googleHealthWebhook.controller.ts`) face à la doc
  officielle et à la console Google Cloud — non vérifiable depuis l'environnement de
  développement utilisé pour écrire cette intégration (accès réseau bloqué), voir README.
- Documentation API structurée (OpenAPI/Swagger) — la liste d'endpoints du README est tenue à
  la main et devient difficile à maintenir à mesure que l'API grossit.
- Étendre la couverture de tests frontend au-delà des formulaires d'auth/médicaments (LogPage,
  LabResultsPage, AppointmentsPage, ProfilePage).
- Suivi d'erreurs en production (Sentry ou équivalent) — aujourd'hui, un crash en prod ne
  remonte que via le logger applicatif, aucune alerte externe.
- Évaluer la montée de version Prisma 5 → 6 et Express 4 → 5 (aucune faille connue identifiée,
  mais l'écart grandit).

### Added

- Synchronisation Google Health (poids, rythme cardiaque, heures de sommeil) depuis un appareil
  connecté (ex: Pixel Watch) : connexion/déconnexion dédiée dans le Profil (distincte de "Se
  connecter avec Google"), tokens chiffrés au repos (AES-256-GCM), synchro en arrière-plan par
  webhook, avec une règle stricte de non-écrasement des saisies manuelles dans `LogPage`
  (badge ⌚ affiché quand une valeur vient de la synchro). Voir le README pour la configuration
  et les points restant à vérifier face à la doc officielle Google.
- Pipeline CI (GitHub Actions, `.github/workflows/ci.yml`) : lint + typecheck/build + tests pour
  backend et frontend, sur chaque push/PR vers `main`. Jusqu'ici aucune vérification automatique
  n'existait avant qu'un changement n'atteigne la prod.
- Tests backend (Vitest + Supertest) pour l'ensemble du flow email/mot de passe
  (`auth.controller.ts` : register, login, verify-email, resend-verification,
  forgot/reset-password, `/me`) — seul le flow Google OIDC était couvert jusque-là.
- Vitest + React Testing Library côté frontend (aucun framework de test n'y existait), avec des
  tests sur les pages de login/register et le formulaire d'ajout de médicament.
- `LICENSE` (propriétaire, tous droits réservés), `.nvmrc` + `engines` (Node 20) dans les deux
  `package.json`, `.editorconfig`.
- `CONTRIBUTING.md`, `TROUBLESHOOTING.md`, ce `CHANGELOG.md`.

### Changed

- Section déploiement du `README.md` réécrite autour de Docker Compose (le déploiement réel,
  `docker-compose.yml` + Dockerfiles) — elle décrivait encore Railway et des fichiers
  (`railway.toml`, `nixpacks.toml`) qui n'existent plus dans le repo depuis l'abandon de cette
  piste.
- Tous les `<label>` de formulaire liés à leur `<input>`/`<select>`/`<textarea>` via
  `htmlFor`/`id` (auth, médicaments, analyses, rendez-vous, profil, admin articles, journal) —
  ils n'étaient que visuellement adjacents, sans association programmatique, donc invisibles
  pour un lecteur d'écran.
- Landmarks `<nav>` de l'AppShell (barre latérale desktop / barre basse mobile) distingués par
  un `aria-label` propre.
- `backend/src/config.ts` : la valeur de repli de `FRONTEND_URL`/`APP_URL` en l'absence de
  variable d'environnement passe de `http://caesura:8082` (nom d'hôte de déploiement personnel)
  à `http://localhost:5173`, cohérent avec `.env.example`.
- `ts-node-dev` (déclaré mais jamais utilisé — le script `dev` tourne sur `tsx watch`) remplacé
  par une dépendance explicite `ts-node`, dont dépendait déjà silencieusement le script
  `db:seed` via `ts-node-dev`.

### Fixed

- `frontend/package-lock.json` désynchronisé de `package.json` : `npm ci` échouait
  immédiatement. Voir [`TROUBLESHOOTING.md#1`](./TROUBLESHOOTING.md#1-npm-ci-échoue-sur-le-frontend-lockfile-désynchronisé).
- Chaque test backend s'exécutait deux fois en CI (`dist/**/*.test.js` compilé scanné en plus de
  `src/**/*.test.ts`). Voir
  [`TROUBLESHOOTING.md#2`](./TROUBLESHOOTING.md#2-chaque-test-backend-sexécute-deux-fois-en-ci).
- `jsdom@30`/`@testing-library/jest-dom@7` (installés depuis un poste en Node 22) faisaient
  planter Vitest en CI (Node 20). Voir
  [`TROUBLESHOOTING.md#3`](./TROUBLESHOOTING.md#3-vitest-run-plante-en-ci-après-lajout-des-tests-frontend-node-20-vs-node-22).

### Removed

- `_to_delete/tf-changes.tar.gz` : archive de 26 Ko, explicitement nommée "à supprimer",
  toujours committée depuis son ajout accidentel.

## 2026-08-16 — Vitamines et dosages flexibles

Les médicaments supposaient jusque-là une hormone thyroïdienne dosée en microgrammes avec une
seule prise quotidienne. Ajout d'une unité de dosage sélectionnable (µg/mg/UI/comprimé/goutte/
ml/autre), d'un sélecteur "prises par jour" (1 à 4×) générant un créneau horaire par prise, et
d'une checklist par prise sur chaque carte médicament (prise/non prise, persistée côté serveur).

## 2026-08-15 — Connexion Google (OAuth2 + OpenID Connect)

- Ajout du flow Authorization Code + PKCE vers Google en complément de l'auth JWT existante :
  `GET /api/auth/oidc/google` démarre la redirection, le callback vérifie l'`id_token`
  (signature JWKS, `iss`, `aud`, `nonce`) via `openid-client`, lie ou crée le compte
  (modèle `OAuthAccount`, liaison par email vérifié uniquement), puis émet le même JWT de
  session que le login classique.
- Sécurisation du flow : le JWT ne transite plus dans l'URL de redirection (code d'échange
  opaque à usage unique, 60s, consommé via `POST /api/auth/oidc/exchange`, pour éviter toute
  exposition via l'historique navigateur ou les logs de proxy) ; le callback rattrape désormais
  ses erreurs (state/nonce invalide, flow expiré) au lieu d'afficher du JSON brut ; ajout d'un
  modèle `AuthEvent` pour tracer les connexions/liaisons Google.
- Liaison de Google à un compte déjà existant (créé par email/mot de passe), depuis la page
  Profil.

## 2026-07-06 → 2026-07-07 — Refonte design frontend, fix CORS prod

Refonte visuelle V1 du frontend, puis correctif de casse sur `FRONTEND_URL` qui cassait le CORS
en production.

## Genèse

Le projet démarre en novembre 2025 comme un simple README, puis prend sa forme actuelle
(monorepo `backend`/`frontend`, Prisma/PostgreSQL, React/Vite) au printemps 2026. Une première
piste de déploiement via Railway (`nixpacks.toml`) est explorée puis abandonnée début mai 2026
au profit d'un déploiement Docker Compose self-hosted, toujours en place aujourd'hui.
