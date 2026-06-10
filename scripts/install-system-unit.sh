#!/usr/bin/env bash
set -euo pipefail

PROJECT="${HERMES_PERSONAL_DISPLAY_PROJECT:-$HOME/.hermes/projects/personal-display}"
SYSTEMD_SRC="$PROJECT/deploy/systemd-system"
UNIT="hermes-personal-display-minix.service"
UNIT_DIR="/etc/systemd/system"

if [[ ! -d "$SYSTEMD_SRC" ]]; then
  echo "Missing systemd source directory: $SYSTEMD_SRC" >&2
  exit 1
fi

if [[ ! -f "$SYSTEMD_SRC/$UNIT" ]]; then
  echo "Missing system unit template: $SYSTEMD_SRC/$UNIT" >&2
  exit 1
fi

sudo install -m 0644 "$SYSTEMD_SRC/$UNIT" "$UNIT_DIR/$UNIT"
if [[ -d "$SYSTEMD_SRC/$UNIT.d" ]]; then
  sudo install -d -m 0755 "$UNIT_DIR/$UNIT.d"
  for dropin in "$SYSTEMD_SRC/$UNIT.d"/*.conf; do
    [[ -e "$dropin" ]] || continue
    sudo install -m 0644 "$dropin" "$UNIT_DIR/$UNIT.d/$(basename "$dropin")"
  done
fi

sudo systemctl daemon-reload
sudo systemctl enable "$UNIT"

echo "Installed $UNIT and drop-ins from $SYSTEMD_SRC"
echo "Review env overrides in /home/brian/.config/hermes-personal-display.env before restart."
echo "Restart with: sudo systemctl restart $UNIT"
echo "Verify with: $PROJECT/scripts/hermes-display verify"
