#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT="$ROOT/docs/runtime-artifacts/minix-sf10t-display-env-report.txt"
ENV_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/hermes-personal-display.env"
DRY_RUN="${DRY_RUN:-1}"

log() { printf '%s\n' "$*"; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[dry-run] %q ' "$@"; printf '\n'
  else
    "$@"
  fi
}

log "MINIX SF10T bring-up helper"
log "Root: $ROOT"
log "Report: $REPORT"
log "Env: $ENV_FILE"
log "DRY_RUN=$DRY_RUN (set DRY_RUN=0 to apply service changes)"
log

log "1) Capturing current display/session report."
"$ROOT/scripts/detect-display-env.sh" "$REPORT"
log

log "2) Current display tools output summary."
if command -v xrandr >/dev/null 2>&1; then
  xrandr --query || true
fi
if command -v wlr-randr >/dev/null 2>&1; then
  wlr-randr || true
fi
log

log "3) Service plan."
log "- Keep preview service enabled/running."
log "- Stop old proprietary USB panel renderer when the HDMI/USB-C monitor is confirmed."
log "- Start kiosk only after DISPLAY/WAYLAND_DISPLAY is present in $ENV_FILE."
log

if [[ ! -f "$ENV_FILE" ]]; then
  log "Creating env file from template."
  run install -m 0644 "$ROOT/deploy/systemd-user/hermes-personal-display.env.example" "$ENV_FILE"
fi

log "4) Suggested env additions for MINIX portrait mode:"
cat <<'EOF'
PERSONAL_DISPLAY_URL=http://127.0.0.1:8770/src/character-runtime.html?kiosk=1
PERSONAL_DISPLAY_WINDOW_SIZE=1280,1920
EOF
log

log "5) When ready to apply after editing env values:"
run systemctl --user enable --now hermes-personal-display-preview.service
run systemctl --user enable --now hermes-personal-display-kiosk.service
log
log "Done. If DRY_RUN=1, no service changes were made."
