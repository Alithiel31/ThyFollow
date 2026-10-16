#!/usr/bin/env bash
# Déploie ThyroTrack avec les secrets injectés par Infisical (jamais écrits sur disque).
#
#   ./deploy.sh              # = docker compose up -d --build
#   ./deploy.sh <args...>    # arguments ajoutés à `docker compose up -d --build`
#
# Prérequis : la CLI `infisical`, `docker compose`, et un fichier
# .infisical-identity.env (voir .infisical-identity.env.example).
#
# Secrets lus dans Infisical (projet Shared Keys) :
#   PG_THYROTRACK_PASSWORD -> DB_PASSWORD (nom attendu par docker-compose.yml)
#   PDF_ENCRYPTION_KEY     -> obligatoire : 64 caractères hexadécimaux
#   ANTHROPIC_API_KEY      -> facultatif : sans elle, le repli IA est désactivé
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID -> facultatifs :
#                             sans eux, pas de paiement par carte (codes promo OK)
set -euo pipefail
cd "$(dirname "$0")"

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

for cmd in infisical docker; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ '$cmd' introuvable dans le PATH." >&2; exit 1; }
done

echo "🔐 Connexion à Infisical…"
# Le login explicite (token) est plus fiable que les variables d'environnement seules,
# qui déclenchent un flux interactif sur certaines versions de la CLI.
INFISICAL_TOKEN="$(infisical login --method=universal-auth \
  --client-id="$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID" \
  --client-secret="$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET" \
  --domain="$INFISICAL_API_URL" --silent --plain)"

echo "🚀 Déploiement (environnement Infisical : $INFISICAL_ENV)…"
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

    docker compose up -d --build "$@"
    docker compose ps
  ' _ "$@"
