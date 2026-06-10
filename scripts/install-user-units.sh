#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ENV_TARGET="${XDG_CONFIG_HOME:-$HOME/.config}/hermes-personal-display.env"
mkdir -p "$TARGET_DIR"

for unit in \
  hermes-personal-display-preview.service \
  hermes-personal-display-kiosk.service \
  hermes-route-rail-refresh.service \
  hermes-route-rail-refresh.timer \
  hermes-display-telemetry-watchdog.service \
  hermes-display-telemetry-watchdog.timer
do
  sed "s#@PROJECT_ROOT@#$ROOT#g" \
    "$ROOT/deploy/systemd-user/$unit" > "$TARGET_DIR/$unit"
  chmod 0644 "$TARGET_DIR/$unit"
done

if [[ ! -e "$ENV_TARGET" ]]; then
  install -m 0644 "$ROOT/deploy/systemd-user/hermes-personal-display.env.example" "$ENV_TARGET"
  echo "Wrote $ENV_TARGET from example template. Edit DISPLAY/WAYLAND_DISPLAY before enabling kiosk." 
else
  echo "Kept existing $ENV_TARGET"
fi

echo "Installed units into $TARGET_DIR"
echo "Next:"
echo "  1. Run $ROOT/scripts/detect-display-env.sh from the desktop session"
echo "  2. Edit $ENV_TARGET with the detected DISPLAY/WAYLAND_DISPLAY values"
echo "  3. systemctl --user daemon-reload"
echo "  4. systemctl --user enable --now hermes-personal-display-preview.service"
echo "  5. systemctl --user enable --now hermes-personal-display-kiosk.service"
echo "  6. systemctl --user enable --now hermes-route-rail-refresh.timer hermes-display-telemetry-watchdog.timer"
