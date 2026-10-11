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
6. [TROUBLESHOOTING.fr.md](../TROUBLESHOOTING.fr.md), [SECURITY.fr.md](../SECURITY.fr.md), [CONTRIBUTING.fr.md](../CONTRIBUTING.fr.md)
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
| Déploiement       | **Manuel** : `docker compose up -d --build` sur le Pi           | Aucun workflow de déploiement continu ; GitHub Actions ne fait que des vérifications                           |
| Courriel          | **Resend**                                                      | Compte qui détient la clé API et le domaine d'envoi vérifié                                                    |
| Google            | Un projet Google Cloud                                          | Client OAuth (login), client OAuth (Google Health), compte de service (abonné webhook), écran de consentement   |

---

## 3. Secrets et accès nécessaires pour agir

Aucun secret réel n'est stocké dans ce dépôt (voir `.gitignore`, [SECURITY.fr.md](../SECURITY.fr.md)).
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
   conteneur crée un schéma vide en rejouant les migrations au démarrage.
4. Démarrer un **Traefik** partagé (provider Docker, entrypoint `web`) et créer le réseau :
   `docker network create traefik-net`.
5. Reconfigurer le tunnel Cloudflare pour que `thyrotrack.alithiel31.dev` atteigne Traefik.
6. Recréer `.env` et `backend/.env` ([environment.fr.md](./environment.fr.md)).
7. `docker compose up -d --build`, puis vérifier `docker compose ps` (les deux services démarrés /
   `healthy`) et `curl localhost:8000/health -H 'Host: thyrotrack.alithiel31.dev'` ou le `/health` public.
8. Si Google Health est utilisé : vérifier dans le journal du backend
   `Google Health webhook subscriber "thyrotrack-webhook" created.` et que les URI de redirection
   Google correspondent toujours au domaine public.

---

## 5. Risques connus à garder en tête

- **Mainteneur unique** — ce document réduit le risque mais ne le supprime pas ; envisager, à terme,
  de donner un accès en lecture à la liste des secrets à une seconde personne de confiance.
- **Les sauvegardes ne sont pas documentées.** PostgreSQL est partagé et hors Docker, et rien dans ce
  dépôt ne dit comment ni à quelle fréquence il est sauvegardé, ni qu'une restauration ait jamais été
  testée. Pour des données de santé, c'est la première chose à régler (voir « À compléter » plus bas).
- **Un dump de base est passé par l'historique git.** `thyrotrack_backup_20260822.dump` a été commité
  (commit `1911941`) puis seulement retiré du suivi (commit `4f63ba7`) ; il reste récupérable dans
  l'historique. Vérifier ce qu'il contenait et, s'il portait des données réelles, le considérer comme
  divulgué à toute personne pouvant lire le dépôt, renouveler ce qui doit l'être et décider s'il faut
  purger l'historique.
- **Jetons de session dans `localStorage`**, valables 30 jours (`JWT_EXPIRES_IN`) — une faille XSS les
  exposerait ; la CSP de `frontend/nginx.conf` (`script-src 'self'`) est la parade.
- **IP du client derrière plusieurs proxys.** Le backend tourne avec `trust proxy` à `1`, alors qu'une
  requête traverse `cloudflared`, Traefik puis nginx. Le projet frère WeatherQC a eu besoin de 3 sauts
  pour une chaîne équivalente. Si le limiteur de débit finit par identifier tous les visiteurs par
  l'adresse du même proxy, ils partageraient un seul quota : vérifier depuis deux réseaux différents
  (méthode décrite dans l'`architecture.md` de WeatherQC) avant de compter sur `AUTH_RATE_LIMIT_MAX`.
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
- [ ] **Politique de sauvegarde de l'instance PostgreSQL** : outil, fréquence, emplacement, rétention, date du dernier test de restauration
- [ ] Contenu de `thyrotrack_backup_20260822.dump` et décision prise pour l'historique git
- [ ] Registrar du domaine `alithiel31.dev` et identifiants du compte
- [ ] Personne(s) de confiance à contacter en cas d'indisponibilité prolongée du mainteneur
- [ ] Emplacement physique du Raspberry Pi et modalités d'accès en cas d'urgence
- [ ] État des écrans de consentement OAuth Google (test ou publié) et liste des utilisateurs de test
