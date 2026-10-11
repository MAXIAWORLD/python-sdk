#!/usr/bin/env bash
# Prisme CRM — lancement local (Linux / macOS).
#   ./start.sh            construit l'interface si besoin puis démarre le serveur
#   ./start.sh --build    force la reconstruction de l'interface
#   ./start.sh --port 9000 --host 0.0.0.0   options transmises à « prisme serve »
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "✗ uv est requis : curl -LsSf https://astral.sh/uv/install.sh | sh  (https://docs.astral.sh/uv/)" >&2
  exit 1
fi

build=false
if [ "${1:-}" = "--build" ]; then
  build=true
  shift
fi

if [ "$build" = true ] || [ ! -f frontend/dist/index.html ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "✗ Node.js 20+ est requis pour construire l'interface : https://nodejs.org" >&2
    exit 1
  fi
  echo "→ Construction de l'interface…"
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
fi

exec uv run --project backend prisme serve "$@"
