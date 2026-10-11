# Sécurité

🇬🇧 [English version](./SECURITY.md)

ThyroTrack traite des **données de santé personnelles** (symptômes, analyses de sang, médicaments,
rendez-vous). Les signalements de sécurité sont pris au sérieux, même si le projet est maintenu par
une seule personne.

## Signaler une vulnérabilité

Merci de ne **pas** ouvrir d'issue publique pour signaler une faille de sécurité — une issue GitHub
classique l'expose à tout le monde avant qu'un correctif n'existe.

Deux façons de signaler, dans l'ordre de préférence :

1. **[Signaler une vulnérabilité](https://github.com/Alithiel31/ThyFollow/security/advisories/new)**
   via l'onglet Security du dépôt (GitHub Security Advisories) — le rapport reste privé entre vous et
   le mainteneur, et permet une divulgation coordonnée une fois le correctif publié.
2. Par courriel à [contact@alithiel31.dev](mailto:contact@alithiel31.dev), avec `SECURITY` dans
   l'objet, et si possible : le composant concerné (backend, frontend, Docker/nginx, CI), les étapes
   de reproduction, et l'impact envisagé.

**N'incluez jamais de vraies données de santé ni de vrais identifiants dans un signalement** — le compte
de démo créé par le script de seed suffit pour illustrer un problème.

### Ce qu'on peut promettre

- Accusé de réception sous **72 heures**.
- Un mainteneur, sur son temps libre : pas de SLA formel au-delà de l'accusé de réception, mais une faille
  confirmée à impact réel — surtout si elle expose les données d'un autre utilisateur — passe devant
  tout le reste.
- Crédit dans le [`CHANGELOG.md`](./CHANGELOG.md) une fois le correctif publié, sauf préférence contraire.
- Pas de programme de bug bounty — c'est un projet personnel, pas une entreprise.

## Périmètre

Dans le périmètre :

- Le backend Express (`backend/`) : API REST, endpoint GraphQL, authentification, intégrations Google
  OIDC et Google Health, et leurs dépendances directes.
- Le frontend React (`frontend/`) et ses dépendances directes.
- La configuration Docker et nginx (`docker-compose.yml`, `frontend/nginx.conf`, les Dockerfiles).
- Les workflows GitHub Actions (`.github/workflows/`).

Hors périmètre :

- Les services tiers (Google, Resend, Cloudflare) — à signaler directement à leurs équipes.
- Une faille nécessitant un accès physique au Raspberry Pi qui héberge le service, ou un accès déjà
  privilégié à l'infrastructure (Tailscale, tunnel Cloudflare, instance PostgreSQL partagée).
- Le volumétrique pur (déni de service par submersion) : la limitation de débit décrite dans
  [architecture.fr.md](./docs/architecture.fr.md) est une atténuation, pas une garantie d'absorber un
  trafic hostile — un endpoint qui y échappe, en revanche, est bien dans le périmètre.
- L'ingénierie sociale visant le mainteneur ou des tiers.

## Ce qui est déjà en place

Avant de signaler un problème déjà couvert, quelques mécanismes existants (détaillés dans
[architecture.fr.md](./docs/architecture.fr.md) et [environment.fr.md](./docs/environment.fr.md)) :

- **Authentification** — mots de passe hachés avec bcrypt (coût 12) ; JWT signés, et le serveur refuse de
  démarrer en production avec un `JWT_SECRET` de moins de 32 caractères ; vérification du courriel avant
  la première connexion ; connexion Google via OpenID Connect avec state, nonce et PKCE, et un code à
  usage unique pour que le jeton de session ne transite jamais dans une URL ; limitation de débit plus
  stricte sur `/api/auth`.
- **Autorisation** — chaque requête de données est limitée à l'utilisateur authentifié, avec une
  vérification de propriété avant toute modification ou suppression ; le rôle `ADMIN` est relu en base à
  chaque requête.
- **Secrets au repos** — les jetons d'accès et de rafraîchissement Google Health sont chiffrés en
  AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) ; en production, le serveur refuse de démarrer sans clé valide
  quand la fonctionnalité est activée. L'endpoint webhook vérifie un secret partagé avant toute action.
- **Entrées** — les corps de requête sont validés avec Zod et assainis contre le XSS
  (`express-xss-sanitizer`) ; l'analyseur JSON garde sa limite de taille par défaut.
- **En-têtes** — `helmet` côté API ; CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy` et `Permissions-Policy` posés par nginx sur la SPA (`frontend/nginx.conf`).
- **Conteneurs** — le backend tourne sous l'utilisateur non privilégié `node` derrière `dumb-init` ;
  PostgreSQL est joint par un rôle dédié (`thyrotrack_app`), pas un superutilisateur.
- **Chaîne d'approvisionnement** — `npm audit --omit=dev --audit-level=high` bloque la CI sur les
  dépendances de production ; CodeQL analyse le code à chaque push, pull request et chaque semaine ;
  Dependabot ouvre des pull requests hebdomadaires (les versions majeures sont traitées à la main).
- **Hygiène des données de santé** — les réponses de l'API ne sont jamais mises en cache par le service worker.

## Versions supportées

Un seul déploiement, pas de branches de version : seul le code sur `main` — celui réellement en
production — reçoit des correctifs de sécurité.
