#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIND_ADDR="${PERSONAL_DISPLAY_BIND:-127.0.0.1}"
PORT="${PERSONAL_DISPLAY_PORT:-8770}"
export PERSONAL_DISPLAY_BIND="$BIND_ADDR"
export PERSONAL_DISPLAY_PORT="$PORT"

if [[ ! -f "$ROOT/scripts/generated/display_contract.py" ]]; then
  echo "Missing generated display contract: $ROOT/scripts/generated/display_contract.py" >&2
  echo "Run: npm run generate:contract" >&2
  exit 1
fi

cd "$ROOT"
exec python3 "$ROOT/scripts/hermes_display_server.py"
