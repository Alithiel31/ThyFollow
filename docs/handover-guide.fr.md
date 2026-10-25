# Guide de reprise

🇬🇧 [English version](./handover-guide.md)

[Retour au README](../README.fr.md)

ThyroTrack (dépôt `ThyFollow`) a un seul mainteneur réel (**Jacques Duchamplecheval**, alias GitHub
`Alithiel31`). Ce document existe pour qu'une autre personne — ou Jacques lui-même après une longue
coupure — puisse reprendre le projet sans devoir reconstituer de mémoire ce qui est documenté
ailleurs, dispersé, ou seulement connu du mainteneur. Il pointe vers la documentation existante plutôt
que de la dupliquer, et liste ce qu'il faut *avoir accès à* pour agir, pas seulement ce qu'il faut
*comprendre*. L'application stocke des **données de santé personnelles** : les questions d'accès et de
sauvegarde ci-dessous sont plus que des formalités.

---

## 1. Comprendre le projet — ordre de lecture recommandé

1. [README.fr.md](../README.fr.md) — vue d'ensemble, fonctionnalités, installation locale, configuration des identifiants Google
2. [architecture.fr.md](./architecture.fr.md) — chemin d'une requête, authentification, synchro Google Health, modèle de données
3. [environment.fr.md](./environment.fr.md) — toutes les variables d'environnement
4. [development.fr.md](./development.fr.md) — lancer le projet en local, routes, tests, CI
5. [`backend/docs/graphql.md`](../backend/docs/graphql.md) — pourquoi la couche GraphQL existe et comment elle fonctionne
6. [troubleshooting.fr.md](./troubleshooting.fr.md), [SECURITY.fr.md](../.github/SECURITY.fr.md), [CONTRIBUTING.fr.md](../.github/CONTRIBUTING.fr.md)
7. [CHANGELOG.md](../CHANGELOG.md) — historique détaillé des décisions

---

## 2. Ce qui tourne, et où

| Composant         | Où                                                              | Comment y accéder                                                                                              |
| ----------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Application       | `thyrotrack.alithiel31.dev`                                     | Domaine public, HTTPS via un tunnel Cloudflare (`cloudflared`)                                                 |
| Hébergement       | Un **Raspberry Pi** physique (nom d'hôte `Caesura`)             | Accès réseau via **Tailscale**                                                                                 |
| Conteneurs        | `docker-compose.yml` à la racine (`thyrotrack-backend`, `thyrotrack-frontend`) | `docker compose ps` sur le Pi                                                          |
| Reverse proxy     | **Traefik**, partagé avec les autres projets du Pi              | Non géré par ce dépôt ; `frontend` rejoint `traefik-net` et porte les labels de routage                         |
| Base de données   | **PostgreSQL 17**, instance native **hors Docker**, partagée avec d'autres projets | Base `thyrotrack`, rôle `thyrotrack_app`, jointe via `host.docker.internal:5432`                |
| Déploiement       | **Déclenché à la main** : `./deploy.sh` depuis le poste de travail | La CI publie les images arm64 sur GHCR après chaque merge ; `deploy.sh` sauvegarde la base, migre et déploie |
| Courriel          | **Resend**                                                      | Compte qui détient la clé API et le domaine d'envoi vérifié                                                    |
| Google            | Un projet Google Cloud                                          | Client OAuth (login), client OAuth (Google Health), compte de service (abonné webhook), écran de consentement   |


**Déployer et revenir en arrière.** Chaque merge sur `main` fait construire et publier les images
arm64 par la CI (`ghcr.io/alithiel31/thyfollow-{backend,frontend}:sha-<commit>`). `./deploy.sh`,
lancé depuis le poste de travail avec Docker pointé sur le Pi, déploie le dernier `main` ;
`./deploy.sh --tag sha-<commit>` déploie n'importe quelle version publiée, ce qui sert aussi de
retour arrière (le script affiche le tag précédent). Il fait un dump de la base avant de migrer :
un retour arrière au-delà d'une migration destructive demande donc aussi de restaurer ce dump
(`/mnt/storage/backups/pre-deploy/` sur le Pi). Détails :
[environment.fr.md](./environment.fr.md#secrets-de-production-avec-infisical-deploysh).

**Protection de `main`.** Un ruleset GitHub exige une pull request, interdit le force-push et la
suppression, et exige que les checks `Backend`, `Frontend`, `Docker build` (les deux images) et
`Migrations` passent, sur une branche à jour. `Audit` et `Publish image` ne sont volontairement pas
exigés : une nouvelle alerte de dépendance ne doit pas bloquer la PR qui la corrige, et `Publish`
ne tourne que sur `main`.

---

## 3. Secrets et accès nécessaires pour agir

Aucun secret réel n'est stocké dans ce dépôt (voir `.gitignore`, [SECURITY.fr.md](../.github/SECURITY.fr.md)).
Pour reprendre le projet en pratique, il faut obtenir l'accès aux éléments suivants — **à compléter par
le mainteneur actuel** (gestionnaire de mots de passe utilisé, ou tout autre moyen de transmission
sécurisée) :

- **Accès administrateur au dépôt GitHub** [`Alithiel31/ThyFollow`](https://github.com/Alithiel31/ThyFollow)
- **`.env` et `backend/.env` tels qu'en production** — ou de quoi les reconstituer à partir des modèles ([environment.fr.md](./environment.fr.md)) : `DB_PASSWORD`, `JWT_SECRET`, `RESEND_API_KEY`, les identifiants Google
- **`TOKEN_ENCRYPTION_KEY`** — la seule valeur qu'on ne peut pas régénérer sans douleur : sans l'originale, tous les jetons Google Health stockés sont perdus et chaque utilisateur doit relier son appareil
- **Accès superutilisateur à l'instance PostgreSQL partagée** (pour créer le rôle et la base, restaurer une sauvegarde)
- **Projet Google Cloud** : écran de consentement OAuth, les deux clients OAuth, le compte de service et sa clé JSON, le numéro de projet
- **Compte Resend** et le DNS du domaine d'envoi
- **Compte Cloudflare** (tunnel et domaine `alithiel31.dev`) et **compte Tailscale**
- **Accès SSH ou physique au Raspberry Pi** (conteneurs, Traefik, `cloudflared`, PostgreSQL)

> Le premier administrateur ne peut pas être créé depuis l'application : rien dans l'API n'accorde le
> rôle `ADMIN`. Il se positionne directement en base
> (`UPDATE users SET role = 'ADMIN' WHERE email = '…'`).

---

## 4. Remettre le service en marche à partir de zéro

Si le Raspberry Pi est perdu ou remplacé mais que le code et les secrets ci-dessus sont disponibles :

1. Installer Docker et Docker Compose, Tailscale et `cloudflared` sur la nouvelle machine.
2. Installer PostgreSQL 17 en natif, puis créer le rôle et la base :
   `CREATE ROLE thyrotrack_app LOGIN PASSWORD '…'; CREATE DATABASE thyrotrack OWNER thyrotrack_app;`
   S'assurer que le serveur écoute sur une adresse atteignable depuis la passerelle Docker
   (`host.docker.internal` résout vers la passerelle de l'hôte grâce à `extra_hosts`).
3. **Restaurer la dernière sauvegarde** dans `thyrotrack` s'il en existe une — voir plus bas. Sinon, le
   service `migrate` crée un schéma vide en rejouant les migrations.
4. Démarrer un **Traefik** partagé (provider Docker, entrypoint `web`) et créer le réseau :
   `docker network create traefik-net`.
5. Reconfigurer le tunnel Cloudflare pour que `thyrotrack.alithiel31.dev` atteigne Traefik.
6. Recréer `.env` et `backend/.env` ([environment.fr.md](./environment.fr.md)).
7. `./deploy.sh` (ou `docker compose up -d` sans Infisical), puis vérifier `docker compose ps` (les deux services démarrés /
   `healthy`) et `curl localhost:8000/health -H 'Host: thyrotrack.alithiel31.dev'` ou le `/health` public.
8. Si Google Health est utilisé : vérifier dans le journal du backend
   `Google Health webhook subscriber "thyrotrack-webhook" created.` et que les URI de redirection
   Google correspondent toujours au domaine public.

---

## 5. Risques connus à garder en tête

- **Mainteneur unique** — ce document réduit le risque mais ne le supprime pas ; envisager, à terme,
  de donner un accès en lecture à la liste des secrets à une seconde personne de confiance.
- **Sauvegardes.** PostgreSQL est partagé et hors Docker. Sur le Pi, des timers systemd lancent chaque
  nuit un dump (un `pg_dump` au format custom par base, plus les rôles), l'envoient à un bot Telegram
  dont le mainteneur est propriétaire, en gardent 14 jours en local et déclenchent une alerte si un
  passage échoue ou si aucun succès récent n'existe. `deploy.sh` fait aussi son propre dump avant
  chaque déploiement. Un test de restauration reste à dater (voir « À compléter » plus bas) : pour des
  données de santé, une sauvegarde non testée n'est pas une sauvegarde.
- **Un dump de test est dans l'historique git public.** `thyrotrack_backup_20260822.dump` a été
  commité (commit `1911941`) puis retiré du suivi (commit `4f63ba7`). Il date du 22 août 2026 et ne
  contient que des données de test saisies par le mainteneur, avant tout chargement de données
  personnelles (l'usage réel a commencé mi-octobre 2026). Décision : l'historique n'est **pas**
  réécrit. Seul le hash du mot de passe du ou des comptes de test est concerné ; changer ce mot de
  passe partout où il aurait été réutilisé. Un futur dump contenant des données réelles ne doit
  jamais être commité : si c'est le cas, le considérer comme divulgué à toute personne pouvant lire
  le dépôt, renouveler ce qui doit l'être et purger l'historique (y compris les références des
  pull requests, via le support GitHub).
- **Jetons de session dans `localStorage`**, valables 30 jours (`JWT_EXPIRES_IN`) — une faille XSS les
  exposerait ; la CSP de `frontend/nginx.conf` (`script-src 'self'`) est la parade. Ils sont révocables :
  incrémenter `User.tokenVersion` (fait automatiquement à la réinitialisation du mot de passe) invalide
  toutes les sessions de l'utilisateur.
- **IP du client derrière plusieurs proxys.** nginx remplace `X-Forwarded-For` par l'IP lue dans
  `CF-Connecting-IP` (posé par Cloudflare), et le backend fait confiance à ce seul saut (`trust proxy`
  à `1`). Une requête qui n'est pas passée par Cloudflare (accès direct par le tailnet) garde l'IP de
  Traefik. Si la topologie change (plus de Cloudflare, autre proxy), revoir `set_real_ip_from` /
  `real_ip_header` dans `frontend/nginx.conf`, puis vérifier depuis deux réseaux différents que les
  compteurs `RateLimit-Remaining` sont indépendants.
- **Le parsing Google Health est au mieux** — `fetchDailyMetrics` a été écrit sans charges utiles réelles
  (voir le CHANGELOG) : les valeurs synchronisées peuvent manquer ou être fausses tant qu'il n'est pas vérifié.
- **Écran de consentement Google en mode test** — tant que l'application n'est pas publiée, seuls les
  utilisateurs de test listés peuvent se connecter ou relier Google Health, et Google peut faire
  expirer leur autorisation périodiquement.
- **Point unique matériel** — un seul Raspberry Pi personnel ; ni redondance ni plan de bascule.

---

## À compléter par le mainteneur

Les champs suivants sont volontairement laissés vides — ils touchent à des informations personnelles
ou à des identifiants qui n'ont pas leur place dans un dépôt :

- [ ] Où sont stockés les secrets listés en section 3 (gestionnaire de mots de passe, coffre-fort numérique…) et qui d'autre y a accès
- [ ] Date du dernier **test de restauration** d'une sauvegarde PostgreSQL (restaurer un dump récent dans une base temporaire et la vérifier)
- [x] Contenu de `thyrotrack_backup_20260822.dump` et décision prise pour l'historique git (données de test seulement, historique conservé — voir section 5)
- [ ] Registrar du domaine `alithiel31.dev` et identifiants du compte
- [ ] Personne(s) de confiance à contacter en cas d'indisponibilité prolongée du mainteneur
- [ ] Emplacement physique du Raspberry Pi et modalités d'accès en cas d'urgence
- [ ] État des écrans de consentement OAuth Google (test ou publié) et liste des utilisateurs de test
