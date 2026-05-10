#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"

printf '\n==> songcraft bootstrap\n'
printf 'root: %s\n' "$ROOT_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo 'error: python3 is required' >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo 'error: npm is required' >&2
  exit 1
fi

printf '\n==> Backend setup\n'
python3 -m venv "$API_DIR/.venv"
source "$API_DIR/.venv/bin/activate"
pip install --upgrade pip
pip install -e "$API_DIR[dev]"
deactivate

printf '\n==> Frontend setup\n'
cd "$WEB_DIR"
npm install

printf '\n==> Environment file\n'
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo 'created .env from .env.example'
else
  echo '.env already exists; leaving it unchanged'
fi

cat <<EOF

Bootstrap complete.

Next steps:
  cd $ROOT_DIR
  make test
  make dev

Docker-first alternative:
  cd $ROOT_DIR
  make up
EOF
