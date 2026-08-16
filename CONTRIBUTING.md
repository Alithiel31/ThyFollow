# Contribuer

Merci de l'intérêt porté à ce projet. ThyroTrack est une app de suivi de santé thyroïdienne
(journal de symptômes, analyses, médicaments, rendez-vous) — toute contribution qui corrige un
bug, améliore la fiabilité ou clarifie la documentation est bienvenue.

## Avant de commencer

- Pour un changement non trivial (nouvelle fonctionnalité, refonte), ouvrez une issue pour en
  discuter avant de coder.
- Pour un correctif évident (typo, lien mort, faute de traduction), une PR directe suffit.
- Vérifiez que le point n'est pas déjà listé dans la section `[Unreleased] > À faire` du
  [`CHANGELOG.md`](./CHANGELOG.md).

## Environnement de développement

```bash
git clone git@github.com:Alithiel31/ThyFollow.git
cd ThyFollow

cd backend && npm install && cd ..
cd frontend && npm install && cd ..

cp backend/.env.example backend/.env
# Renseigner DATABASE_URL (Postgres local ou via Docker) et JWT_SECRET
```

```bash
cd backend
npx prisma migrate dev
npx prisma generate
npm run db:seed   # Compte de démo : demo@thyrotrack.com / demo1234
```

Puis, dans deux terminaux séparés :

```bash
cd backend && npm run dev   # http://localhost:3001
```

```bash
cd frontend && npm run dev  # http://localhost:5173
```

Voir le [`README.md`](./README.md) pour le détail (Google OAuth optionnel, déploiement Docker
Compose). La doc interactive de l'API (Swagger UI) est servie sur `http://localhost:3001/api/docs`
une fois le backend lancé — si vous ajoutez, modifiez ou supprimez une route, mettez à jour
[`backend/openapi.yaml`](./backend/openapi.yaml) dans la même PR.

## Reproduire la CI en local

Le workflow [`ci.yml`](./.github/workflows/ci.yml) lance, sur chaque PR vers `main`, lint +
typecheck/build + tests pour le backend et pour le frontend. Reproduction locale :

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

Node 20 est requis (`.nvmrc` à la racine) : les deux `package.json` pinnent volontairement
`jsdom`/`@testing-library/jest-dom` sur des versions compatibles Node 20 (les dernières majeures
de ces deux paquets exigent Node ≥22) — ne les mettez pas à jour sans revérifier cette
contrainte, voir [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

## Ouvrir une Pull Request

1. Créez une branche depuis `main` (`git checkout -b fix/mon-correctif`).
2. Committez avec un message clair — ce repo mélange `type(scope): description`
   (`fix(backend): ...`) et des messages en anglais plus descriptifs pour les changements plus
   larges ; les deux sont acceptés, mais le message doit expliquer le **pourquoi**, pas
   seulement le quoi.
3. Si le changement est notable pour un utilisateur ou un contributeur, ajoutez une entrée dans
   la section `[Unreleased]` de [`CHANGELOG.md`](./CHANGELOG.md).
4. Vérifiez que la CI passe (voir ci-dessus pour la reproduire en local avant de pousser).
5. Ouvrez la PR contre `main`.

## Signaler un problème

Pour un bug, précisez :

- Ce qui était attendu vs. ce qui s'est produit.
- Les étapes pour reproduire.
- `backend` ou `frontend` (ou les deux), et l'environnement (local, Docker Compose).
- Les logs pertinents (`docker compose logs backend`, console navigateur) — **en retirant tout
  token, email réel, ou donnée de santé.**

Avant d'ouvrir l'issue, jetez un œil à [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) : les
incidents déjà rencontrés et leur diagnostic y sont documentés.

## Secrets et données de santé

- Ne committez jamais de fichier `.env` réel, ni de `JWT_SECRET`, `GOOGLE_CLIENT_SECRET`,
  `RESEND_API_KEY` ou mot de passe Postgres — seuls les `.env.example` sont versionnés.
- Cette app manipule des données de santé (symptômes, résultats de labo). N'utilisez jamais de
  données personnelles réelles dans un exemple, un test, une issue ou une capture d'écran ; le
  compte de démo créé par `npm run db:seed` suffit pour illustrer un problème.
