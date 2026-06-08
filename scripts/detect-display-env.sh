#!/usr/bin/env bash
set -euo pipefail

OUTFILE="${1:-}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

say() {
  printf '%s\n' "$*" | tee -a "$TMP"
}

section() {
  say
  say "== $1 =="
}

cmd_or_missing() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '%s' "$(command -v "$name")"
  else
    printf 'missing'
  fi
}

section "identity"
say "timestamp=$(date -Is)"
say "user=$(id -un)"
say "host=$(hostname)"
say "cwd=$(pwd)"

section "graphical session env"
say "XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-}"
say "DISPLAY=${DISPLAY:-}"
say "WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}"
if [[ -n "${XAUTHORITY:-}" ]]; then
  say "XAUTHORITY=set_redacted"
else
  say "XAUTHORITY="
fi
say "DBUS_SESSION_BUS_ADDRESS=${DBUS_SESSION_BUS_ADDRESS:-}"

section "browser candidates"
say "chromium-browser=$(cmd_or_missing chromium-browser)"
say "chromium=$(cmd_or_missing chromium)"
say "google-chrome=$(cmd_or_missing google-chrome)"
say "google-chrome-stable=$(cmd_or_missing google-chrome-stable)"

section "display tooling"
say "xrandr=$(cmd_or_missing xrandr)"
say "wlr-randr=$(cmd_or_missing wlr-randr)"
say "loginctl=$(cmd_or_missing loginctl)"

section "loginctl session summary"
if command -v loginctl >/dev/null 2>&1; then
  loginctl list-sessions --no-legend 2>/dev/null | tee -a "$TMP" || true
else
  say "loginctl unavailable"
fi

section "xrandr"
if command -v xrandr >/dev/null 2>&1; then
  xrandr --query 2>&1 | tee -a "$TMP" || true
else
  say "xrandr unavailable"
fi

section "wlr-randr"
if command -v wlr-randr >/dev/null 2>&1; then
  wlr-randr 2>&1 | tee -a "$TMP" || true
else
  say "wlr-randr unavailable"
fi

section "preview + kiosk prerequisites"
say "preview_url=${PERSONAL_DISPLAY_URL:-http://127.0.0.1:8770/src/character-runtime.html?kiosk=1}"
say "has_display_env=$([[ -n "${DISPLAY:-}" || -n "${WAYLAND_DISPLAY:-}" ]] && echo yes || echo no)"
say "has_browser=$([[ "$(cmd_or_missing chromium-browser)" != missing || "$(cmd_or_missing chromium)" != missing || "$(cmd_or_missing google-chrome)" != missing || "$(cmd_or_missing google-chrome-stable)" != missing ]] && echo yes || echo no)"

if [[ -n "$OUTFILE" ]]; then
  mkdir -p "$(dirname "$OUTFILE")"
  cp "$TMP" "$OUTFILE"
  say
  say "saved_report=$OUTFILE"
fi
