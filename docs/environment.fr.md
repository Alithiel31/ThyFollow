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
| `ANTHROPIC_MODEL`           | ❌     | `claude-sonnet-5-5`    | Modèle utilisé par l'extraction de repli. |
| `PDF_IMPORT_MAX_FILES`      | ❌     | `10`                   | Fichiers par envoi. |
| `PDF_IMPORT_MAX_BYTES`      | ❌     | `10485760` (10 Mo)     | Taille maximale par fichier (un fichier entre la limite et le double est refusé seul ; au-delà, c'est tout l'envoi). |

L'import nécessite aussi le binaire `qpdf` (installé dans l'image Docker du backend ; en développement
local, installez-le avec votre gestionnaire de paquets — `apt install qpdf`, `brew install qpdf`).

> **Changer `PDF_ENCRYPTION_KEY`** rend indéchiffrables tous les PDF stockés et les mots de passe de PDF
> mémorisés : il n'existe pas encore d'outil de rechiffrement. Les PDF sont stockés dans la base
> (`lab_documents.dataEnc`, `bytea`) : ils en augmentent la taille, et celle des sauvegardes.

### Limitation de débit

| Variable                     | Défaut             | Description                                                  |
| ---------------------------- | ------------------ | ------------------------------------------------------------ |
| `RATE_LIMIT_WINDOW_MS`       | `900000` (15 min)  | Fenêtre du limiteur global                                   |
| `RATE_LIMIT_MAX`             | `100`              | Requêtes par fenêtre et par IP, sur toute l'API              |
| `AUTH_RATE_LIMIT_WINDOW_MS`  | `900000` (15 min)  | Fenêtre du limiteur de `/api/auth`                           |
| `AUTH_RATE_LIMIT_MAX`        | `20`               | Tentatives échouées par fenêtre et par IP sur `/api/auth` (les requêtes réussies ne comptent pas) |

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
