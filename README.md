# 🦋 ThyroTrack

Application web de suivi thyroïdien, inspirée de l'app Clue.  
**Stack** : TypeScript · Express · Prisma · PostgreSQL · React · Recharts · Railway

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
npm install
```

### 2. Configurer l'environnement backend
```bash
cp backend/.env.example backend/.env
# Éditer backend/.env avec votre DATABASE_URL et JWT_SECRET
```

### 3. Initialiser la base de données
```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed   # Crée un compte démo: demo@thyrotrack.com / demo1234
```

### 4. Lancer en développement
```bash
# Depuis la racine
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

---

## 🚂 Déploiement sur Railway

### 1. Préparer le projet Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli
railway login
```

### 2. Créer le projet
```bash
railway init
# Choisir "Empty project"
```

### 3. Ajouter PostgreSQL
Dans le dashboard Railway :
- **New** → **Database** → **Add PostgreSQL**
- Railway injecte automatiquement `DATABASE_URL`

### 4. Variables d'environnement (Railway Dashboard → Variables)

| Variable | Valeur |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | une chaîne aléatoire sécurisée (32+ caractères) |
| `DATABASE_URL` | injecté automatiquement par Railway PostgreSQL |

> **Générer un JWT_SECRET :** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 5. Déployer
```bash
railway up
```

Railway détecte `nixpacks.toml`, construit le backend et le frontend, migre la BDD et démarre le serveur.

### 6. Seeder les données de démo (optionnel)
```bash
railway run npm run db:seed --workspace=backend
```

---

## 📁 Structure du projet

```
thyro-track/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Modèles de données complets
│   │   └── seed.ts             # Données de démonstration
│   ├── src/
│   │   ├── index.ts            # Entrée Express
│   │   ├── lib/
│   │   │   └── prisma.ts       # Client Prisma singleton
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT middleware
│   │   │   └── errorHandler.ts
│   │   └── routes/
│   │       ├── auth.ts         # POST /register, /login, /me
│   │       ├── entries.ts      # Journal quotidien (upsert par date)
│   │       ├── labResults.ts   # CRUD analyses sanguines
│   │       ├── medications.ts  # CRUD médicaments
│   │       ├── appointments.ts # CRUD rendez-vous
│   │       ├── profile.ts      # Profil thyroïdien
│   │       └── analytics.ts    # Agrégations, tendances
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage   # Vue d'ensemble
│       │   ├── LogPage         # Journal quotidien (style Clue)
│       │   ├── LabResultsPage  # Analyses + graphiques
│       │   ├── MedicationsPage # Traitements
│       │   ├── AppointmentsPage
│       │   └── ProfilePage
│       ├── lib/
│       │   ├── api.ts          # Client axios typé
│       │   ├── store.ts        # Auth state (Zustand)
│       │   └── utils.ts        # Helpers date, couleurs
│       └── types/index.ts      # Types partagés + constantes
│
├── railway.toml                # Config Railway
├── nixpacks.toml               # Build pipeline
└── package.json                # Monorepo workspaces
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
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Validation | Zod |
| Frontend | React 18 + Vite |
| État | Zustand + TanStack Query |
| Graphiques | Recharts |
| Routing | React Router 6 |
| Déploiement | Railway (monorepo) |
