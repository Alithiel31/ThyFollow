# Variables d'environnement

🇬🇧 [English version](./environment.md)

[Retour au README](../README.fr.md)

Il y a deux fichiers distincts, lus par deux consommateurs distincts :

| Fichier            | Lu par                                          | Modèle                 |
| ------------------ | ----------------------------------------------- | ---------------------- |
| `.env` (racine)    | `docker compose` (substitution de variables)    | `.env.example`         |
| `backend/.env`     | le backend (`env_file` + `dotenv`)              | `backend/.env.example` |

Seuls les fichiers `.env.example` sont versionnés — ne jamais commiter un vrai `.env`.

## `.env` racine (Docker Compose)

| Variable      | Obligatoire | Description                                                                                                                     |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD` | ✅          | Mot de passe du rôle PostgreSQL `thyrotrack_app` sur l'instance partagée (par exemple `openssl rand -hex 24`). Compose en déduit `DATABASE_URL`. |
| `PDF_ENCRYPTION_KEY` | ❌   | Transmise au backend (voir [Import de bilans PDF](#import-de-bilans-pdf)). Vide, l'import est désactivé. |
| `ANTHROPIC_API_KEY`  | ❌   | Transmise au backend : active l'extraction de repli par IA. Vide, elle est désactivée. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | ❌ | Transmises au backend : paiement de l'abonnement Pro (voir [Accès Pro (Stripe)](#accès-pro-stripe)). Vides, le paiement répond `501` ; les codes promo fonctionnent quand même. |

### Secrets de production avec Infisical (`deploy.sh`)

Sur l'hôte de production, les variables ci-dessus ne sont **pas** lues dans le `.env` racine :
`deploy.sh` se connecte à Infisical (Machine Identity, Universal Auth) et lance
`docker compose up -d --build` dans `infisical run`, si bien que les secrets n'existent que dans
l'environnement du processus.

| Secret Infisical (projet *Shared Keys*, environnement `Production`) | Devient | Remarques |
| --- | --- | --- |
| `PG_THYROTRACK_PASSWORD` | `DB_PASSWORD` | Renommé par `deploy.sh` : Compose attend `DB_PASSWORD`. |
| `PDF_ENCRYPTION_KEY`     | `PDF_ENCRYPTION_KEY` | **Exigée par `deploy.sh`** : 64 caractères hexadécimaux, sinon le déploiement s'arrête avant de toucher à Docker. |
| `ANTHROPIC_API_KEY`      | `ANTHROPIC_API_KEY`  | Facultative : sans elle, le repli IA est désactivé et `deploy.sh` le signale. |
| `STRIPE_SECRET_KEY`      | `STRIPE_SECRET_KEY`  | Facultative : clé secrète (ou restreinte `rk_…`) de Stripe. `sk_test_…` pour tester, `sk_live_…` en production. |
| `STRIPE_WEBHOOK_SECRET`  | `STRIPE_WEBHOOK_SECRET` | Facultatif : secret `whsec_…` de l'endpoint webhook (affiché par Stripe à sa création). |
| `STRIPE_PRICE_ID`        | `STRIPE_PRICE_ID`    | Facultatif : identifiant `price_…` du prix récurrent de l'abonnement Pro. |

`deploy.sh` lit ses identifiants dans `.infisical-identity.env` (ignoré par git ; modèle :
`.infisical-identity.env.example`) : `INFISICAL_UNIVERSAL_AUTH_CLIENT_ID`,
`INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET`, `INFISICAL_API_URL`, `INFISICAL_PROJECT_ID` et, en option,
`INFISICAL_ENV` (`prod` par défaut). Le vrai fichier contient un secret et le vrai nom du tailnet :
ne jamais le commiter. Sans Infisical, renseignez le `.env` racine et lancez
`docker compose up -d --build` comme d'habitude.

## Backend (`backend/.env`)

Lues par `src/config.ts`, qui centralise tout accès à `process.env`. Le fichier Compose surcharge
`DATABASE_URL`, `NODE_ENV`, `PORT` et `FRONTEND_URL` pour le conteneur.

### Essentiel

| Variable         | Obligatoire        | Défaut                        | Description                                                                                                                                              |
| ---------------- | ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | ✅                 | —                             | Chaîne de connexion PostgreSQL (utilisée par Prisma). Dans Compose : `postgresql://thyrotrack_app:${DB_PASSWORD}@host.docker.internal:5432/thyrotrack`.  |
| `JWT_SECRET`     | ✅ en production   | une valeur de dev uniquement  | Secret qui signe les jetons de session. **En production, le serveur refuse de démarrer s'il est absent ou fait moins de 32 caractères** ; ailleurs il avertit et utilise une valeur de développement. |
| `JWT_EXPIRES_IN` | ❌                 | `30d`                         | Durée de vie du jeton de session.                                                                                                                        |
| `PORT`           | ❌                 | `3001`                        | Port d'écoute de l'API.                                                                                                                                  |
| `NODE_ENV`       | ❌                 | `development`                 | `production` active les garde-fous de production (`JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`).                                                               |
| `FRONTEND_URL`   | ❌                 | `http://localhost:5173`       | Liste blanche CORS, séparée par des virgules. Dans Compose : `http://caesura:8082,https://thyrotrack.alithiel31.dev`. Simple garde-fou en production, où nginx rend tout same-origin. |
| `APP_URL`        | ❌                 | 1re entrée de `FRONTEND_URL`  | URL publique canonique du frontend, utilisée pour construire les liens envoyés par courriel (vérification, réinitialisation du mot de passe). Une seule adresse, contrairement à `FRONTEND_URL`. |

### Courriel (Resend)

| Variable            | Obligatoire | Défaut                                  | Description                                                                                              |
| ------------------- | ----------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`    | ❌          | —                                       | Clé API Resend. Sans elle, l'envoi est sauté avec un avertissement — pratique en local, mais plus personne ne peut vérifier un compte par courriel. |
| `RESEND_FROM_EMAIL` | ❌          | `ThyroTrack <onboarding@resend.dev>`    | Adresse d'expédition ; utiliser un domaine vérifié en production.                                         |

### Se connecter avec Google (OIDC)

| Variable               | Obligatoire | Défaut                                                | Description                                                                                       |
| ---------------------- | ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | ❌          | —                                                     | Identifiant client OAuth. Vide = fonctionnalité désactivée, `GET /api/auth/oidc/google` répond `501`. |
| `GOOGLE_CLIENT_SECRET` | ❌          | —                                                     | Secret client OAuth.                                                                              |
| `GOOGLE_REDIRECT_URI`  | ❌          | `http://localhost:3001/api/auth/oidc/google/callback` | Doit correspondre **exactement** à une « URI de redirection autorisée » déclarée chez Google — l'URL du **backend**, pas du frontend. |

### Synchronisation Google Health

Tout vide = fonctionnalité désactivée, la carte du Profil répond `501`. La mise en place est décrite
dans le [README](../README.fr.md).

| Variable                             | Obligatoire                       | Défaut                                                           | Description                                                                                              |
| ------------------------------------ | --------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GOOGLE_HEALTH_CLIENT_ID`            | ❌                                | —                                                                | Identifiant client OAuth du flux de consentement utilisateur. Identifiants distincts de ceux du login (scopes sensibles). |
| `GOOGLE_HEALTH_CLIENT_SECRET`        | ❌                                | —                                                                | Secret correspondant.                                                                                    |
| `GOOGLE_HEALTH_REDIRECT_URI`         | ❌                                | `http://localhost:3001/api/integrations/google-health/callback`  | Doit correspondre à l'URI de redirection déclarée chez Google.                                           |
| `TOKEN_ENCRYPTION_KEY`               | ✅ si l'identifiant client est défini | —                            | 64 caractères hexadécimaux (32 octets) qui chiffrent les jetons stockés en AES-256-GCM. En production, le serveur refuse de démarrer sans clé valide. Génération : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GOOGLE_HEALTH_PROJECT_NUMBER`       | ❌ (requis pour l'abonné)         | —                                                                | **Numéro** du projet Google Cloud — pas son identifiant texte (Google répond sinon 400/403).             |
| `GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY`  | ❌ (requis pour l'abonné)         | —                                                                | **Contenu JSON complet** de la clé du compte de service (pas un chemin de fichier). Rôle minimum : Éditeur de l'API Google Health. |
| `GOOGLE_HEALTH_WEBHOOK_SECRET`       | ❌ (requis pour l'abonné)         | —                                                                | Secret de votre choix, envoyé à Google à la création de l'abonné et renvoyé dans l'en-tête `Authorization` de chaque notification. Exemple : `node -e "console.log('Bearer ' + require('crypto').randomBytes(24).toString('hex'))"` |

L'abonné webhook n'est créé au démarrage que si `GOOGLE_HEALTH_CLIENT_ID`,
`GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY` et `GOOGLE_HEALTH_PROJECT_NUMBER` sont tous renseignés.

> **Changer `TOKEN_ENCRYPTION_KEY`** rend indéchiffrables tous les jetons Google Health stockés : les
> utilisateurs devraient relier leur appareil. Changer `JWT_SECRET` déconnecte tout le monde.

### Import de bilans PDF

| Variable                    | Requis | Défaut                 | Description |
| --------------------------- | ------ | ---------------------- | ----------- |
| `PDF_ENCRYPTION_KEY`        | ❌ (l'import répond `501` sans elle) | — | 64 caractères hexadécimaux (32 octets) qui chiffrent en AES-256-GCM les PDF stockés et les mots de passe de PDF mémorisés. **Distincte de `TOKEN_ENCRYPTION_KEY`.** Si elle est définie, elle doit être valide (la production refuse de démarrer sinon). Génération : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PDF_ENCRYPTION_KEY_VERSION`| ❌     | `1`                    | Version de la clé ci-dessus, stockée avec chaque document (prépare une future rotation). |
| `ANTHROPIC_API_KEY`         | ❌     | —                      | Active l'extraction de repli par IA (texte seul, anonymisé, et uniquement pour les utilisateurs qui y ont consenti). Sans elle, l'extraction par règles fonctionne toujours. |
| `ANTHROPIC_MODEL`           | ❌     | `claude-haiku-5-5`    | Modèle utilisé par l'extraction de repli (Haiku : suffisant pour du texte déjà extrait ; passer à un modèle plus grand si un labo est mal lu). |
| `PDF_IMPORT_MAX_FILES`      | ❌     | `10`                   | Fichiers par envoi. |
| `PDF_IMPORT_MAX_BYTES`      | ❌     | `10485760` (10 Mo)     | Taille maximale par fichier (un fichier entre la limite et le double est refusé seul ; au-delà, c'est tout l'envoi). |

L'import nécessite aussi le binaire `qpdf` (installé dans l'image Docker du backend ; en développement
local, installez-le avec votre gestionnaire de paquets — `apt install qpdf`, `brew install qpdf`).

> **Changer `PDF_ENCRYPTION_KEY`** rend indéchiffrables tous les PDF stockés et les mots de passe de PDF
> mémorisés : il n'existe pas encore d'outil de rechiffrement. Les PDF sont stockés dans la base
> (`lab_documents.dataEnc`, `bytea`) : ils en augmentent la taille, et celle des sauvegardes.

### Accès Pro (Stripe)

L'import de bilans PDF est réservé aux comptes Pro (voir [Accès Pro et paiement](./architecture.fr.md#accès-pro-et-paiement)).

| Variable                   | Obligatoire | Défaut | Description |
| -------------------------- | ----------- | ------ | ----------- |
| `FREE_IMPORT_LIMIT`        | ❌          | `3`    | Imports offerts **à vie** à un compte non Pro. |
| `PRO_MONTHLY_IMPORT_LIMIT` | ❌          | `25`   | Plafond d'imports par mois (UTC) d'un compte Pro : borne le coût de l'API Anthropic. |
| `STRIPE_SECRET_KEY`        | ❌ (le paiement répond `501` sans les trois) | — | Clé secrète Stripe. Préférer une **clé restreinte** (`rk_…`) limitée à l'écriture des sessions Checkout et du portail client, et à la lecture des abonnements. La clé publiable (`pk_…`) n'est **pas** utilisée : le paiement passe par Stripe Checkout (page hébergée). |
| `STRIPE_WEBHOOK_SECRET`    | ❌          | —      | Secret `whsec_…` de l'endpoint `https://<domaine>/api/webhooks/stripe`. Sans lui, le webhook répond `501`. |
| `STRIPE_PRICE_ID`          | ❌          | —      | `price_…` du produit récurrent (le mode test et le mode live ont des prix distincts). |

Mise en place côté Stripe :

1. Créer un produit avec un prix **récurrent** → `STRIPE_PRICE_ID`.
2. Ajouter l'endpoint webhook `https://<domaine>/api/webhooks/stripe` abonné à
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` et
   `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`. En local :
   `stripe listen --forward-to localhost:3001/api/webhooks/stripe` affiche le `whsec_…` à utiliser.
3. Activer le **portail client** (Réglages → Facturation → Portail client) : sans lui, « Gérer
   l'abonnement » échoue.
4. Commencer en **mode test** (carte `4242 4242 4242 4242`), puis refaire les étapes 1 à 3 en mode live.

Ordre conseillé en production : déployer avec `STRIPE_SECRET_KEY` et `STRIPE_PRICE_ID`, créer
l'endpoint webhook (l'URL doit être joignable en HTTPS), puis ajouter `STRIPE_WEBHOOK_SECRET` et
redéployer. Stripe ne reçoit que l'email du compte, jamais de données de santé. Les taxes (Stripe Tax)
ne sont pas activées.

### Limitation de débit

| Variable                     | Défaut             | Description                                                  |
| ---------------------------- | ------------------ | ------------------------------------------------------------ |
| `RATE_LIMIT_WINDOW_MS`       | `900000` (15 min)  | Fenêtre du limiteur global                                   |
| `RATE_LIMIT_MAX`             | `100`              | Requêtes par fenêtre et par IP, sur toute l'API              |
| `AUTH_RATE_LIMIT_WINDOW_MS`  | `900000` (15 min)  | Fenêtre du limiteur de `/api/auth`                           |
| `AUTH_RATE_LIMIT_MAX`        | `20`               | Tentatives échouées par fenêtre et par IP sur `/api/auth` (les requêtes réussies ne comptent pas) |

Deux limiteurs dédiés ont des valeurs fixes dans `backend/src/index.ts` : `POST /api/lab-results/import` (20 requêtes / 15 min, chaque envoi peut déclencher un appel LLM payant) et `POST /api/billing/redeem` (10 requêtes / 15 min, contre la devinette de codes promo).

## Frontend

| Variable        | Description                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `VITE_APP_NAME` | Présente dans `frontend/.env.example` mais **lue nulle part dans le code** ; sans effet.             |

Le frontend n'a besoin d'aucune configuration : il appelle le chemin relatif `/api`, que le serveur
de développement Vite proxifie vers `http://localhost:3001` et que nginx proxifie vers `backend:3001`
en production.

## GitHub Actions

`ci.yml` n'exige aucun secret de dépôt : le job de migrations démarre son propre conteneur
PostgreSQL jetable. Dependabot et CodeQL fonctionnent avec les permissions par défaut.
