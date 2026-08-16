# 🦋 ThyroTrack

Application web de suivi thyroïdien, inspirée de l'app Clue.  
**Stack** : TypeScript · Express · Prisma · PostgreSQL · React · Recharts · Docker

---

## ✨ Fonctionnalités

| Module | Détail |
|---|---|
| **Journal quotidien** | Énergie, humeur, anxiété, brouillard mental, 11 symptômes thyroïdiens, médicament pris, mesures physiques |
| **Analyses sanguines** | TSH, FT4, FT3, Anti-TPO, Anti-TG, carences (Ferritine, Vit D, B12…) avec graphiques d'évolution |
| **Médicaments** | Gestion du traitement (Levothyrox, etc.), dosage, fréquence, observance |
| **Rendez-vous** | Agenda médical avec rappels, statuts, types spécialisés |
| **Tableau de bord** | Streak médicament, observance, moyennes, prochain RDV, historique TSH |
| **Profil** | Diagnostic, état thyroïde, plages TSH/FT4/FT3 personnalisées par votre médecin |

---

## 🚀 Démarrage rapide (local)

### Prérequis
- Node.js 20+
- PostgreSQL (ou Docker)

### 1. Cloner et installer
```bash
git clone <url>
cd thyro-track
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### 2. Configurer l'environnement backend
```bash
cp backend/.env.example backend/.env
# Éditer backend/.env avec votre DATABASE_URL et JWT_SECRET
```

#### (Optionnel) Activer "Se connecter avec Google"

Sans `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GET /api/auth/oidc/google` répond simplement `501` et le bouton Google reste inutile — le reste de l'app fonctionne normalement. Pour l'activer :

1. Sur [Google Cloud Console](https://console.cloud.google.com/), créez (ou sélectionnez) un projet.
2. **APIs & Services → OAuth consent screen** : type *External*, renseignez le nom de l'app et un email de support, ajoutez les scopes `openid`, `email`, `profile`.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, type *Web application*.
4. **Authorized JavaScript origins** : `http://localhost:5173` (URL du frontend).
5. **Authorized redirect URIs** : `http://localhost:3001/api/auth/oidc/google/callback` (doit correspondre exactement à `GOOGLE_REDIRECT_URI`, c'est l'URL du **backend**, pas du frontend).
6. Copiez le *Client ID* et le *Client Secret* générés dans `backend/.env` :
   ```bash
   GOOGLE_CLIENT_ID="xxxxxxxx.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="xxxxxxxx"
   ```
En production, mettez à jour les origines/redirect URIs avec le domaine réel et ajustez `GOOGLE_REDIRECT_URI` (+ `APP_URL`) en conséquence.

### 3. Initialiser la base de données
```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed   # Crée un compte démo: demo@thyrotrack.com / demo1234
```

### 4. Lancer en développement

Dans deux terminaux séparés :
```bash
cd backend && npm run dev   # http://localhost:3001
```
```bash
cd frontend && npm run dev  # http://localhost:5173
```

---

## 🐳 Déploiement (Docker Compose, self-hosted)

Le déploiement réel de ce projet passe par `docker-compose.yml` à la racine : trois services (PostgreSQL, backend Express, frontend servi par nginx) construits depuis `backend/Dockerfile` et `frontend/Dockerfile`.

### 1. Configurer l'environnement
```bash
cp .env.example .env
# Renseigner un POSTGRES_PASSWORD fort (ex: openssl rand -hex 24)

cp backend/.env.example backend/.env
# Renseigner JWT_SECRET (32+ caractères), RESEND_API_KEY, et
# GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET si "Se connecter avec Google" est utilisé.
# DATABASE_URL et FRONTEND_URL sont déjà fixés dans docker-compose.yml —
# adaptez-y votre propre domaine avant de déployer.
```

### 2. Lancer
```bash
docker compose up -d --build
```
Le conteneur backend exécute automatiquement `prisma migrate deploy` au démarrage (voir `backend/Dockerfile`). Le frontend est disponible sur le port `8082` (voir `docker-compose.yml`), le backend en interne sur `3001`.

### 3. Seeder les données de démo (optionnel)
```bash
docker compose exec backend npm run db:seed
```

> **Générer un JWT_SECRET :** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 📁 Structure du projet

```
thyro-track/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Modèles de données complets
│   │   └── seed.ts              # Données de démonstration
│   ├── src/
│   │   ├── index.ts             # Entrée Express
│   │   ├── lib/                 # Prisma client, i18n, logger, email (Resend), OIDC
│   │   ├── middleware/
│   │   │   ├── auth.ts          # JWT middleware
│   │   │   ├── admin.ts
│   │   │   ├── asyncHandler.ts
│   │   │   └── errorHandler.ts
│   │   ├── routers/             # Déclaration des routes Express (*.router.ts)
│   │   └── controllers/         # Logique métier + validation Zod (*.controller.ts)
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── DashboardPage    # Vue d'ensemble
│   │   │   ├── LogPage          # Journal quotidien (style Clue)
│   │   │   ├── LabResultsPage   # Analyses + graphiques
│   │   │   ├── MedicationsPage  # Traitements
│   │   │   ├── AppointmentsPage
│   │   │   └── ProfilePage
│   │   ├── lib/
│   │   │   ├── api.ts           # Client axios typé
│   │   │   ├── store.ts         # Auth state (Zustand)
│   │   │   └── utils.ts         # Helpers date, couleurs
│   │   └── types/index.ts       # Types partagés + constantes
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml            # Backend + Frontend (nginx) + PostgreSQL
├── .env.example                  # Variables lues par docker-compose.yml
└── LICENSE
```

---

## 🗃️ Schéma de la base de données

```
User ──┬── UserProfile         (diagnostic, plages cibles)
       ├── DailyEntry[]        (journal quotidien)
       │     └── SymptomLog[]  (symptômes personnalisés)
       ├── LabResult[]         (TSH, FT4, FT3, anticorps, carences)
       ├── Medication[]        (traitements)
       ├── Appointment[]       (rendez-vous médicaux)
       └── NotificationSetting
```

---

## 🔌 API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/auth/oidc/google            (redirige vers Google — OAuth2 + OpenID Connect)
GET    /api/auth/oidc/google/callback

GET    /api/entries?from=&to=
GET    /api/entries/:date
POST   /api/entries              (upsert par date)
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
```

---

## 🎨 Design System

- **Palette** : fond sombre (#0b0d14), accent violet (#7b61ff), teal (#00d4b4), rose (#ff6b8a)
- **Typographie** : DM Serif Display (titres) + DM Sans (corps)
- **UI** : CSS Modules, responsive mobile avec navigation bas de page

---

## 📦 Stack technique

| Couche | Technologie |
|---|---|
| Runtime | Node.js 20 |
| API | Express 4 + TypeScript |
| ORM | Prisma 5 |
| BDD | PostgreSQL |
| Auth | JWT (jsonwebtoken) + bcryptjs, OAuth2 + OpenID Connect (Google, via `openid-client`) |
| Validation | Zod |
| Frontend | React 18 + Vite |
| État | Zustand + TanStack Query |
| Graphiques | Recharts |
| Routing | React Router 6 |
| Déploiement | Docker Compose (self-hosted) |
