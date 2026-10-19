#!/usr/bin/env bash
# Déploie ThyroTrack à partir des images publiées par la CI sur GHCR, avec les
# secrets injectés par Infisical (jamais écrits sur disque).
#
#   ./deploy.sh                      # dernière version de main (sha-<commit>)
#   ./deploy.sh --tag sha-ab12cd3    # version précise (retour arrière)
#   ./deploy.sh --skip-backup        # sans dump de la base avant migration
#
# Lancé depuis le poste de travail : Docker vise le Pi via DOCKER_HOST ou le
# context actif (ssh://…). Étapes : sauvegarde de la base sur le Pi (ssh),
# pull des images, migrations (service `migrate`), redémarrage, vérification.
#
# Prérequis : la CLI `infisical`, `docker compose`, `git`, `ssh`, `curl`, et un
# fichier .infisical-identity.env (voir .infisical-identity.env.example).
#
# Variables facultatives :
#   DEPLOY_SSH         cible ssh du Pi (défaut : déduite de DOCKER_HOST / du context)
#   DEPLOY_BACKUP_DIR  dossier des dumps sur le Pi (défaut : /mnt/storage/backups/pre-deploy)
#   DEPLOY_HEALTH_URL  URL vérifiée après déploiement (défaut : https://thyrotrack.alithiel31.dev/health)
#
# Secrets lus dans Infisical (projet Shared Keys) :
#   PG_THYROTRACK_PASSWORD -> DB_PASSWORD (nom attendu par docker-compose.yml)
#   PDF_ENCRYPTION_KEY     -> obligatoire : 64 caractères hexadécimaux
#   ANTHROPIC_API_KEY      -> facultatif : sans elle, le repli IA est désactivé
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID -> facultatifs :
#                             sans eux, pas de paiement par carte (codes promo OK)
set -euo pipefail
cd "$(dirname "$0")"

IMAGE_REPO="ghcr.io/alithiel31/thyfollow"
DB_NAME="thyrotrack"
BACKUP_DIR="${DEPLOY_BACKUP_DIR:-/mnt/storage/backups/pre-deploy}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://thyrotrack.alithiel31.dev/health}"

IMAGE_TAG=""
SKIP_BACKUP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) IMAGE_TAG="${2:?--tag attend une valeur, ex. sha-ab12cd3}"; shift 2 ;;
    --skip-backup) SKIP_BACKUP=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "❌ Option inconnue : $1 (voir ./deploy.sh --help)" >&2; exit 1 ;;
  esac
done

IDENTITY_FILE=".infisical-identity.env"
if [ ! -f "$IDENTITY_FILE" ]; then
  echo "❌ $IDENTITY_FILE introuvable : copiez .infisical-identity.env.example et renseignez-le." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "./$IDENTITY_FILE"
set +a

: "${INFISICAL_API_URL:?INFISICAL_API_URL manquant dans $IDENTITY_FILE}"
: "${INFISICAL_UNIVERSAL_AUTH_CLIENT_ID:?INFISICAL_UNIVERSAL_AUTH_CLIENT_ID manquant dans $IDENTITY_FILE}"
: "${INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET:?INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET manquant dans $IDENTITY_FILE}"
: "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID manquant dans $IDENTITY_FILE}"
INFISICAL_ENV="${INFISICAL_ENV:-prod}"

for cmd in infisical docker git ssh curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ '$cmd' introuvable dans le PATH." >&2; exit 1; }
done

# ── Version à déployer ───────────────────────────────────────
# Par défaut, le dernier commit de main sur GitHub : c'est celui dont la CI
# publie les images (tag sha-<7 caractères>).
if [ -z "$IMAGE_TAG" ]; then
  MAIN_SHA="$(git ls-remote origin refs/heads/main | cut -c1-7)"
  [ -n "$MAIN_SHA" ] || { echo "❌ Impossible de lire main sur origin." >&2; exit 1; }
  IMAGE_TAG="sha-$MAIN_SHA"
fi
export IMAGE_TAG

echo "🔎 Vérification des images $IMAGE_TAG sur GHCR…"
for svc in backend frontend; do
  if ! docker manifest inspect "$IMAGE_REPO-$svc:$IMAGE_TAG" >/dev/null 2>&1; then
    echo "❌ $IMAGE_REPO-$svc:$IMAGE_TAG introuvable. La CI de ce commit a-t-elle fini (job publish) ?" >&2
    exit 1
  fi
done

if [ "$(git rev-parse --short=7 HEAD)" != "${IMAGE_TAG#sha-}" ]; then
  echo "ℹ️  Copie locale sur $(git rev-parse --short=7 HEAD), images $IMAGE_TAG : docker-compose.yml est lu ici, vérifiez qu'il correspond."
fi

PREVIOUS_IMAGE="$(docker inspect thyrotrack-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
PREVIOUS_TAG=""
case "$PREVIOUS_IMAGE" in "$IMAGE_REPO"-backend:*) PREVIOUS_TAG="${PREVIOUS_IMAGE##*:}" ;; esac
echo "📦 En ligne : ${PREVIOUS_IMAGE:-aucune} → cible : $IMAGE_TAG"

# ── Sauvegarde de la base avant migration ────────────────────
if [ "$SKIP_BACKUP" -eq 0 ]; then
  SSH_TARGET="${DEPLOY_SSH:-}"
  if [ -z "$SSH_TARGET" ]; then
    DOCKER_ENDPOINT="${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)}"
    case "$DOCKER_ENDPOINT" in
      ssh://*) SSH_TARGET="${DOCKER_ENDPOINT#ssh://}" ;;
      *) echo "❌ Hôte Docker non ssh ($DOCKER_ENDPOINT) : renseignez DEPLOY_SSH ou passez --skip-backup." >&2; exit 1 ;;
    esac
  fi
  DUMP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S)_avant_${IMAGE_TAG}.dump"
  echo "💾 Dump de $DB_NAME sur $SSH_TARGET…"
  # Script passé sur l'entrée standard : Git Bash (Windows) réécrirait les
  # chemins /mnt/… s'ils étaient passés en argument.
  ssh "$SSH_TARGET" 'bash -s' <<EOF
set -euo pipefail
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"
pg_dump -Fc "$DB_NAME" > "$DUMP_FILE"
pg_restore -l "$DUMP_FILE" >/dev/null
echo "   OK : $DUMP_FILE (\$(du -h "$DUMP_FILE" | cut -f1))"
EOF
fi

# ── Déploiement ──────────────────────────────────────────────
echo "🔐 Connexion à Infisical…"
# Le login explicite (token) est plus fiable que les variables d'environnement seules,
# qui déclenchent un flux interactif sur certaines versions de la CLI.
INFISICAL_TOKEN="$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  --client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
  --domain="$INFISICAL_API_URL" --silent --plain)"

echo "🚀 Déploiement de $IMAGE_TAG (environnement Infisical : $INFISICAL_ENV)…"
infisical run --token="$INFISICAL_TOKEN" --domain="$INFISICAL_API_URL" \
  --projectId="$INFISICAL_PROJECT_ID" --env="$INFISICAL_ENV" -- \
  bash -c '
    set -euo pipefail

    # Le compose attend DB_PASSWORD ; Infisical le stocke sous PG_THYROTRACK_PASSWORD.
    export DB_PASSWORD="${DB_PASSWORD:-${PG_THYROTRACK_PASSWORD:-}}"
    : "${DB_PASSWORD:?DB_PASSWORD / PG_THYROTRACK_PASSWORD absent d Infisical}"

    if ! printf "%s" "${PDF_ENCRYPTION_KEY:-}" | grep -Eq "^[0-9a-fA-F]{64}$"; then
      echo "❌ PDF_ENCRYPTION_KEY absente ou invalide dans Infisical (attendu : 64 caractères hexadécimaux)." >&2
      exit 1
    fi
    if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
      echo "ℹ️  ANTHROPIC_API_KEY absente : repli IA désactivé (l extraction par règles reste active)."
    fi

    if [ -z "${STRIPE_SECRET_KEY:-}" ] || [ -z "${STRIPE_WEBHOOK_SECRET:-}" ] || [ -z "${STRIPE_PRICE_ID:-}" ]; then
      echo "ℹ️  Stripe non configuré (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_ID) : paiement désactivé, codes promo toujours actifs."
    fi

    docker compose pull

    # Le service migrate passe en premier ; s il échoue, compose s arrête
    # avant de recréer le backend et l ancienne version reste en ligne.
    if ! docker compose up -d; then
      echo "❌ Échec du déploiement. Journal des migrations :" >&2
      docker compose logs --no-color --tail 50 migrate >&2 || true
      exit 1
    fi
  '

echo "⏳ Attente du healthcheck du backend…"
for _ in $(seq 1 24); do
  STATUS="$(docker inspect thyrotrack-backend --format '{{.State.Health.Status}}' 2>/dev/null || echo absent)"
  [ "$STATUS" = "healthy" ] && break
  sleep 5
done
docker compose ps

ROLLBACK_HINT=""
[ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ] && \
  ROLLBACK_HINT="Retour arrière : ./deploy.sh --tag $PREVIOUS_TAG"

if [ "$STATUS" != "healthy" ]; then
  echo "❌ Backend non sain après 2 min (état : $STATUS). Journal : docker compose logs backend" >&2
  [ -n "$ROLLBACK_HINT" ] && echo "   $ROLLBACK_HINT" >&2
  exit 1
fi
# Traefik et nginx ont besoin de quelques secondes après le démarrage du
# frontend : on réessaie (12 x 5 s) avant de conclure à un échec.
echo "⏳ Attente de $HEALTH_URL…"
PUBLIC_OK=0
for _ in $(seq 1 12); do
  if curl -fsS --max-time 10 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
    PUBLIC_OK=1
    break
  fi
  sleep 5
done
if [ "$PUBLIC_OK" != "1" ]; then
  echo "❌ $HEALTH_URL ne répond pas après 1 min (Traefik / tunnel Cloudflare ?)." >&2
  [ -n "$ROLLBACK_HINT" ] && echo "   $ROLLBACK_HINT" >&2
  exit 1
fi
echo "✅ $IMAGE_TAG en ligne ($HEALTH_URL répond)."
[ -n "$ROLLBACK_HINT" ] && echo "   $ROLLBACK_HINT"
exit 0
