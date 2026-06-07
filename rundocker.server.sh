#!/bin/sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

PUBLIC_HOST_VALUE="${1:-${PUBLIC_HOST:-}}"
if [ -z "$PUBLIC_HOST_VALUE" ]; then
  echo "Uso: ./rundocker.server.sh <public-host> [letsencrypt-site]" >&2
  echo "Esempio: ./rundocker.server.sh tm.example.com" >&2
  exit 1
fi

LETSENCRYPT_SITE_VALUE="${2:-${LETSENCRYPT_SITE:-$PUBLIC_HOST_VALUE}}"

ENV_FILE_ARGS=""
if [ -f .env.server ]; then
  ENV_FILE_ARGS="--env-file .env.server"
fi

PUBLIC_HOST="$PUBLIC_HOST_VALUE" \
LETSENCRYPT_SITE="$LETSENCRYPT_SITE_VALUE" \
docker compose ${ENV_FILE_ARGS} -f docker-compose.server.yml up --build -d
