#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIND_ADDR="${PERSONAL_DISPLAY_BIND:-127.0.0.1}"
PORT="${PERSONAL_DISPLAY_PORT:-8770}"
export PERSONAL_DISPLAY_BIND="$BIND_ADDR"
export PERSONAL_DISPLAY_PORT="$PORT"

cd "$ROOT"
exec python3 "$ROOT/scripts/hermes_display_server.py"
