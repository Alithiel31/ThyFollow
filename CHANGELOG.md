# Changelog

Tous les changements notables de ce projet sont documentés ici. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.0.0/). Les entrées ci-dessous restent datées
plutôt que rattachées à un numéro de version — seules les [releases GitHub](https://github.com/Alithiel31/ThyFollow/releases)
(à partir de `v1.0.0`) sont taguées ; `package.json` reste volontairement fixé à `1.0.0` et n'est
pas synchronisé avec ces tags.

## [Unreleased]

### À faire

- Confirmer en production la forme des points `dataTypes/{type}/dataPoints` : le code suit
  désormais la référence v4, et la structure du premier point reçu par type (noms de champs,
  sans valeurs) est journalisée au démarrage de la synchro. Retirer ce log une fois la forme
  confirmée, et vérifier que le filtre `sleep.interval.civil_end_time` est accepté (sinon un
  avertissement « relecture sans filtre » apparaît dans les logs).
- Documentation API structurée (OpenAPI/Swagger) — la liste d'endpoints du README est tenue à
  la main et devient difficile à maintenir à mesure que l'API grossit.
- Faire relire les fiches « Comprendre » par un médecin ou un pharmacien, vérifier leurs sources,
  puis renseigner `reviewedAt` (voir `frontend/src/content/comprendre/README.md`). Le contenu
  n'existe qu'en français ; l'interface anglaise l'indique.
- Étendre la couverture de tests frontend au-delà des formulaires d'auth/médicaments (LogPage,
  LabResultsPage, AppointmentsPage, ProfilePage).
- Suivi d'erreurs en production (Sentry ou équivalent) — aujourd'hui, un crash en prod ne
  remonte que via le logger applicatif, aucune alerte externe.
- Évaluer la montée de version Prisma 5 → 6 et Express 4 → 5 (aucune faille connue identifiée,
  mais l'écart grandit).

### Fixed

- **Synchro Google Health : nuits mieux découpées.** Une nuit qui traversait minuit était comptée
  en entier sur les deux jours. Chaque nuit est maintenant rangée au jour du réveil, en heure
  locale, comme dans l'app Fitbit. Les siestes du jour s'y ajoutent, et les phases d'éveil sont
  retirées quand l'API les fournit. Les bornes de la journée (poids, rythme cardiaque, sommeil)
  suivent le fuseau du profil au lieu d'UTC.
- **Synchro Google Health : poids et rythme cardiaque enfin lus.** Le code cherchait un champ
  `value` qui n'existe pas dans l'API v4 : aucune de ces deux mesures n'était jamais remplie. Il lit
  maintenant `weight.weightGrams` (converti en kg) et `heartRate.beatsPerMinute`, en gardant la
  mesure la plus récente de la journée. Les heures de sommeil viennent du résumé de la nuit calculé
  par Google (`summary.minutesAsleep`), et chaque nuit est demandée par son heure civile de réveil.

### Added

- **Onglet « Comprendre » : bibliothèque de fiches pédagogiques.** L'état vide « Les premiers
  articles arrivent bientôt » est remplacé par 8 fiches locales (`frontend/src/content/comprendre`)
  avec illustrations, catégories, recherche sans accents, carte « À la une », durée de lecture,
  encart « À retenir », sources et « À lire aussi ». Filtres conservés dans l'URL (`?cat=&q=`) au
  retour d'une fiche. Les articles publiés depuis `/admin/articles` restent affichés (« Articles de
  l'équipe ») et lisibles sur `/learn/:slug`. Nouveaux tokens `--pastel-*`, `--paper` et
  `--illustration-filter` (clair/sombre). **Les fiches sont des brouillons non relus** : chacune
  affiche « en attente de relecture » tant que `reviewedAt` n'est pas renseigné.
  Les illustrations sont précachées par le service worker (fiches lisibles hors ligne). Sur mobile,
  « Comprendre » (libellé court « Fiches ») remplace « Rendez-vous » dans la barre du bas ;
  Rendez-vous passe dans le menu « Plus », qui s'allume quand on est sur une de ses pages.
- **Détail des nuits mesuré par la montre** : efficacité du sommeil, minutes de sommeil profond et
  paradoxal, en lecture seule dans le journal (à côté du ressenti « qualité du sommeil », qui reste
  saisi à la main) et en moyennes dans le rapport et le CSV. L'API Google Health n'expose pas le
  score de sommeil Fitbit : ce sont les éléments du résumé de nuit qu'elle fournit.
- **« Récupérer l'historique » (Profil → Comptes liés)** : relit les 30 derniers jours depuis Google
  Health (`POST /api/integrations/google-health/resync`, 90 jours au plus, un seul rattrapage à la
  fois par compte, 3 par heure). Remplit les jours antérieurs à la connexion et corrige les nuits
  comptées deux fois par l'ancien découpage.

### Security

- **Quota d'imports PDF non contournable par requêtes simultanées.** Le solde lu en début de requête
  n'était décompté qu'après chaque fichier : plusieurs envois simultanés passaient tous le contrôle
  (au-delà des 3 imports offerts, ou du plafond mensuel Pro, avec autant d'appels IA payants). Chaque
  import est désormais réservé avant l'extraction par un incrément conditionnel en base
  (`reserveImport`), et rendu si l'extraction échoue (`releaseImport`) : un échec ne consomme
  toujours pas d'import.
- **Pré-création de compte neutralisée.** Quand « Se connecter avec Google » rattache un compte
  existant jamais vérifié (créé par un tiers avec l'email de la victime), son mot de passe et ses
  jetons sont effacés et l'email est marqué vérifié : le créateur ne peut plus s'y connecter.
- **Emails : nom échappé.** Le nom saisi à l'inscription n'est plus interprété comme du HTML dans
  les emails de vérification et de réinitialisation.
- **Webhook Google Health : secret comparé à temps constant** (`crypto.timingSafeEqual`).
- **Liaison Google et Google Health : cookies de flux signés.** Le cookie qui porte l'id du compte à
  lier était un JSON en clair, modifiable par l'utilisateur dans son navigateur : remplacer cet id
  permettait de rattacher son propre compte Google au compte de quelqu'un d'autre, puis de s'y
  connecter (ou d'injecter ses données Google Health dans son journal). Les cookies de flux sont
  désormais signés par HMAC (`lib/signedCookie.ts`) ; une valeur modifiée ou non signée est rejetée.
- **IP réelle du client derrière Cloudflare.** nginx lit `CF-Connecting-IP` (module realip, seulement
  depuis un pair du réseau Docker) et transmet cette IP au backend. Auparavant, le backend voyait
  l'IP du conteneur Traefik pour tous les visiteurs : un quota de limitation de débit commun à tout le
  monde (429 en usage normal) et 20 échecs de connexion, d'où qu'ils viennent, bloquaient les connexions
  de tous les utilisateurs pendant 15 minutes. Les IP des `AuthEvent` sont désormais justes.
- **Sessions révocables.** Chaque JWT porte la version de session de l'utilisateur
  (`User.tokenVersion`, migration `20261017120000_add_user_token_version`), relue en base à chaque
  requête (REST et GraphQL). La réinitialisation du mot de passe l'incrémente : toutes les sessions
  ouvertes auparavant sont refusées. Le token d'un compte supprimé est refusé (401). Les tokens
  existants restent valides jusqu'au premier incrément. L'algorithme du JWT est figé à HS256.
- **Jetons de vérification d'email et de réinitialisation stockés hachés** (SHA-256) : une fuite de la
  base ne permet plus de réinitialiser un mot de passe. Les liens envoyés avant ce déploiement ne
  fonctionnent plus (en redemander un).

### Added

- **Rappels par email** (section « Rappels par email » du profil, ancre `#reminders`) : journal du jour
  à l'heure choisie s'il n'est pas rempli, prises de médicament à chaque horaire défini (un email par
  créneau, sans les prises déjà validées, cadence quotidienne / un jour sur deux / hebdomadaire
  respectée), prochain bilan sanguin quand le dernier date de plus de N semaines, et rendez-vous dans
  les N jours qui précèdent (réglage `reminderDays` existant). Les réglages `NotificationSetting`
  existaient sans être lus ni affichés ; ils sont désormais **désactivés par défaut** (opt-in) et
  exposés par `GET`/`PUT /api/profile/notifications`, qui enregistre aussi le fuseau du navigateur
  (`UserProfile.timezone`) et la langue des emails. Une boucle dans le backend (`lib/reminders.ts`,
  toutes les 5 min, seulement si Resend est configuré, `REMINDERS_ENABLED=false` pour la couper)
  envoie chaque rappel une seule fois grâce à la table `reminder_logs` (clé unique par utilisateur,
  réservée avant l'envoi et rendue si l'envoi échoue). Un rappel à heure fixe part dans l'heure qui
  suit, jamais en retard ; bilan et rendez-vous partent en journée (9 h – 21 h). Migration
  `20261018100000_add_reminders`.
- **Mes données (RGPD)** (section du profil) : export de toutes ses données en JSON, PDF de bilans
  compris (`GET /api/account/export`), et suppression définitive du compte (`DELETE /api/account`,
  mot de passe exigé, ou email recopié pour un compte Google sans mot de passe). L'abonnement Stripe
  est résilié avant la suppression, qui est annulée si la résiliation échoue. `GET /api/auth/me`
  renvoie `hasPassword` (jamais le hash).

- Déploiement continu (déclenché à la main) : `docker-compose.yml` tire les images publiées sur
  GHCR (`IMAGE_TAG`, `sha-<commit>` ou `main`) au lieu de les construire sur le Pi ;
  `docker-compose.build.yml` garde la construction depuis les sources. `deploy.sh` déploie le
  dernier `main` (ou `--tag` pour revenir en arrière) : vérification des images, `pg_dump` de la
  base sur le Pi par ssh, pull, migrations, attente du healthcheck et test du `/health` public.
- Service Compose `migrate` : `prisma migrate deploy` tourne dans un conteneur à part avant le
  backend, qui n'est recréé que si les migrations réussissent (l'ancienne version reste en ligne
  sinon). Le `CMD` de l'image backend ne lance plus les migrations.
- CI : après chaque merge sur `main`, les images backend et frontend sont construites pour
  `linux/arm64` (runner ARM natif) et publiées sur GHCR (`ghcr.io/alithiel31/thyfollow-backend`,
  `…-frontend`), taguées `sha-<commit>` et `main`. Le build Docker des PR tourne lui aussi sur
  ARM, pour valider l'image qui tournera sur le Pi. Les runs de `main` ne sont plus annulés par
  un merge suivant.
- Accès Pro à l'import de bilans PDF : la saisie manuelle et l'export restent gratuits ; l'import
  automatique (lecture du PDF + repli IA) est réservé aux comptes Pro, avec 3 imports offerts à vie
  et un plafond de 25 imports par mois en Pro (`FREE_IMPORT_LIMIT`, `PRO_MONTHLY_IMPORT_LIMIT`).
  Le droit est `User.proUntil` (source unique, `lib/entitlements.ts`), vérifié côté serveur
  (402 `PRO_REQUIRED`, 429 `MONTHLY_QUOTA_REACHED`) ; un ADMIN est toujours Pro. Les PDF déjà
  importés restent consultables et téléchargeables après la fin d'un accès.
- Paiement par abonnement Stripe (Checkout + portail client) : `POST /api/billing/checkout`,
  `/portal`, webhook `POST /api/webhooks/stripe` (corps brut, signature vérifiée). Variables
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (facultatives : sans elles, 501).
- Codes promo : `POST /api/billing/redeem` (le code prolonge l'accès de sa durée) et gestion
  réservée aux ADMIN via `/api/admin/promo-codes` (création, liste, désactivation).
- `LabResult.source` (`MANUAL` / `PDF_IMPORT`) : l'origine d'un résultat est affichée dans le carnet.
- Documentation : README (FR/EN), `docs/` (architecture, développement, environnement, FR/EN) et `SECURITY` décrivent l'accès Pro, le paiement Stripe et les codes promo.
- Carnet : les cartes affichent désormais **tous les marqueurs renseignés** (ferritine, vitamines, T4/T3,
  thyroglobuline, magnésium, sélénium, cholestérol, glycémie, hémoglobine, en plus de TSH/FT4/FT3/anti-TPO),
  avec « Aucune valeur saisie » quand il n'y en a aucun ; la modale d'édition gagne une section « Autres
  marqueurs » pour les voir et les corriger. Import de PDF : une phrase de pied de page (« Laboratoire
  accrédité n°8-3165. Liste des sites… ») n'est plus prise pour le nom du laboratoire.
- Import de bilans PDF : une réponse **429** (trop de requêtes) affiche désormais « Trop de requêtes »
  avec le délai d'attente annoncé par le serveur (`Retry-After`) et la précision que ce n'est ni un bug
  ni une erreur de lecture, avec un bouton « Réessayer » ; une panne d'envoi (réseau, erreur serveur)
  affiche « Envoi échoué » au lieu de « Lecture impossible ».
- Import de bilans PDF : lecture plus robuste et réglage **« Lecture par IA à chaque import »**
  (profil, désactivé par défaut, exige le consentement IA). L'IA lit chaque bilan, les deux lectures
  (règles et IA) sont comparées et les désaccords sont signalés « à vérifier » dans l'écran de
  relecture (valeur différente, valeur lue par les règles seules, date différente) ; « Réessayer avec
  l'IA » fait la même comparaison. Nouvelle colonne `user_profiles.aiExtractionAlways` (migration
  `20261017100000_add_ai_extraction_always`) ; `PUT /api/profile/ai-extraction-consent` accepte
  `always`. Côté règles : libellés abrégés avec points (`T.S.H.`), lignes de commentaire ignorées (une
  note citant « TSH # 8 mUI/L » n'est plus prise pour un résultat), précision des valeurs conservée
  (`1,776` n'est plus arrondi à `1,78`) et dates écrites avec des tirets typographiques (`09−12−2025`).
- Déploiement de production avec secrets injectés par Infisical : `deploy.sh` (connexion Machine
  Identity, puis `docker compose up -d --build` dans `infisical run`), qui renomme
  `PG_THYROTRACK_PASSWORD` en `DB_PASSWORD` et refuse de déployer si `PDF_ENCRYPTION_KEY` est absente
  ou n'est pas une clé de 64 caractères hexadécimaux. `docker-compose.yml` transmet désormais
  `PDF_ENCRYPTION_KEY` et `ANTHROPIC_API_KEY` au backend (facultatives hors `deploy.sh` : sans elles,
  l'import de bilans PDF répond 501). Nouveau modèle `.infisical-identity.env.example`
  (`.infisical-identity.env` est ignoré par git : il contient un secret et le nom du tailnet).
- Import de bilans sanguins PDF dans le carnet (`LabResultsPage` → « Importer un bilan PDF ») :
  dépôt par lot (10 fichiers, 10 Mo), PDF protégés par mot de passe pris en charge (mot de passe
  fourni, mémorisé ou date de naissance du profil ; déchiffrement via `qpdf`), extraction par règles
  des 17 marqueurs de `LabResult` avec conversion d'unités, **repli IA optionnel** (API Anthropic,
  texte anonymisé uniquement, opt-in révocable dans le profil), écran de relecture obligatoire avant
  ajout, détection des doublons, et conservation des PDF **chiffrés** (AES-256-GCM,
  `PDF_ENCRYPTION_KEY`, colonne `bytea`) téléchargeables depuis le carnet. Mots de passe mémorisés
  révocables (un par un ou tous) dans la nouvelle section « Documents et IA » du profil. Nouvelles
  variables : `PDF_ENCRYPTION_KEY`, `PDF_ENCRYPTION_KEY_VERSION`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL` (Haiku 5.5 par défaut), `PDF_IMPORT_MAX_FILES`, `PDF_IMPORT_MAX_BYTES` ; l'image Docker du backend
  embarque désormais `qpdf`. Limites : PDF scannés (pas d'OCR) et images non gérés ; le serveur peut
  déchiffrer les mots de passe mémorisés (voir `SECURITY.md`).
- Page 404 dédiée (`NotFoundPage`, FR/EN) : une URL inconnue n'est plus redirigée silencieusement
  vers `/dashboard`. Le lien de retour mène au tableau de bord, ou à `/login` si la session est fermée
- Endpoint `POST /graphql` (Apollo Server 5), additif à la REST API existante — aucune route
  REST retirée ou modifiée, le frontend continue d'utiliser exclusivement `/api/*`. Démo
  technique de design de schéma, resolvers imbriqués, auth JWT bridgée depuis
  `middleware/auth.ts`, et surtout du piège N+1 (résolu via `DataLoader` sur
  `Medication.intakes`/`DailyEntry.symptomLogs`, testé par assertion `toHaveBeenCalledTimes(1)`).
  Voir [`backend/docs/graphql.md`](./backend/docs/graphql.md) pour le détail (avant/après,
  auth, ce qui est volontairement hors scope).
- `.github/dependabot.yml` : mises à jour hebdomadaires groupées pour les deux `package.json`
  (npm), les `Dockerfile` (docker) et les actions utilisées par `ci.yml` (github-actions) —
  chaque PR ouverte passe par la CI existante avant merge.
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

- Identité visuelle unifiée : le logo « papillon » (pétales bleus et orange) est désormais le seul
  logo de l'application — icône de l'onglet, icônes de l'app installée (PWA, iPhone), pages de
  connexion/inscription/mot de passe/vérification, page 404 et en-tête du rapport imprimable. Il
  remplace l'ancien carré vert à ligne de pouls. Les icônes de l'app passent sur fond bleu nuit.
- Documents non applicatifs de la racine (`ConceptArt/`, `thyro-track-conceptArt.pdf`, la
  maquette HTML standalone) regroupés sous un unique dossier `Docs/`, ignoré en une seule ligne
  de `.gitignore` au lieu de trois. `thyrotrack_backup_20260822.dump` (un dump PostgreSQL commité
  par erreur dans l'infra Pi ci-dessous) a été retiré du suivi git et déplacé dans `Docs/` — il
  reste disponible en local, simplement plus versionné.
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

## 2026-08-22 — Bascule infra Pi : PostgreSQL partagé + Traefik

Consolidation du déploiement sur l'hôte self-hosted (Raspberry Pi), sur deux axes indépendants.

- **Base de données** : le service `postgres` dédié (conteneur `thyrotrack-postgres`,
  PostgreSQL 16) est retiré de `docker-compose.yml`. Le backend se connecte désormais à une
  instance PostgreSQL 17 partagée avec d'autres projets sur le même hôte, via un rôle applicatif
  dédié à privilèges limités (accès à la seule base `thyrotrack`, pas de droits d'administration)
  et `host.docker.internal` (`extra_hosts`) pour joindre l'hôte depuis le conteneur. Migration des
  données existantes vérifiée par comptage exact (`COUNT(*)`) table par table avant bascule et
  suppression de l'ancien conteneur. Variable d'environnement renommée `POSTGRES_PASSWORD` →
  `DB_PASSWORD` dans `.env`/`.env.example`/`docker-compose.yml`. Le réseau Docker du projet
  (`thyrotrack-network`) a un sous-réseau désormais fixé explicitement (`172.22.0.0/24`) plutôt
  qu'attribué dynamiquement, pour que les règles d'accès réseau côté PostgreSQL restent valables
  dans la durée.
- **Reverse proxy** : le port `8082` n'est plus publié sur l'hôte. `frontend` rejoint le réseau
  `traefik-net` (partagé, géré par une instance Traefik déjà existante sur l'hôte) et porte des
  labels `traefik.*` routant `thyrotrack.alithiel31.dev` vers son port interne `80`. Le trafic
  public passe désormais par `cloudflared → Traefik → frontend` plutôt que directement sur un
  port exposé. `~/.cloudflared/config.yml` (hors dépôt, sur l'hôte) mis à jour en conséquence.

Voir le diagramme d'architecture et la section Déploiement du README pour le détail de la
nouvelle configuration, ainsi que les limites de portabilité de `docker-compose.yml` désormais
lié à cet hôte précis (instance PostgreSQL et Traefik externes au projet).

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
