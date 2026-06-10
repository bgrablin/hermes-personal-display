#!/usr/bin/env bash
set -euo pipefail

PROJECT="${HERMES_PERSONAL_DISPLAY_PROJECT:-$HOME/.hermes/projects/personal-display}"
SYSTEMD_SRC="$PROJECT/deploy/systemd-system"
UNIT="hermes-personal-display-minix.service"
UNIT_DIR="/etc/systemd/system"
INSTALL_USER="${HERMES_PERSONAL_DISPLAY_USER:-$(id -un)}"
INSTALL_HOME="${HERMES_PERSONAL_DISPLAY_HOME:-$HOME}"
INSTALL_UID="${HERMES_PERSONAL_DISPLAY_UID:-$(id -u "$INSTALL_USER" 2>/dev/null || id -u)}"

if [[ ! -d "$SYSTEMD_SRC" ]]; then
  echo "Missing systemd source directory: $SYSTEMD_SRC" >&2
  exit 1
fi

if [[ ! -f "$SYSTEMD_SRC/$UNIT" ]]; then
  echo "Missing system unit template: $SYSTEMD_SRC/$UNIT" >&2
  exit 1
fi

render_unit() {
  local src="$1"
  python3 - "$src" "$PROJECT" "$INSTALL_USER" "$INSTALL_HOME" "$INSTALL_UID" <<'PY'
import sys
from pathlib import Path
src, project, user, home, uid = sys.argv[1:]
text = Path(src).read_text(encoding="utf-8")
for key, value in {
    "@PROJECT_ROOT@": project,
    "@USER@": user,
    "@HOME@": home,
    "@UID@": uid,
}.items():
    text = text.replace(key, value)
print(text, end="")
PY
}

rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
render_unit "$SYSTEMD_SRC/$UNIT" > "$rendered"

if grep -q '@[A-Z_][A-Z_]*@' "$rendered"; then
  echo "Rendered unit still contains template placeholders" >&2
  exit 1
fi

sudo install -m 0644 "$rendered" "$UNIT_DIR/$UNIT"
if [[ -d "$SYSTEMD_SRC/$UNIT.d" ]]; then
  sudo install -d -m 0755 "$UNIT_DIR/$UNIT.d"
  for dropin in "$SYSTEMD_SRC/$UNIT.d"/*.conf; do
    [[ -e "$dropin" ]] || continue
    sudo install -m 0644 "$dropin" "$UNIT_DIR/$UNIT.d/$(basename "$dropin")"
  done
fi

sudo systemctl daemon-reload
sudo systemctl enable "$UNIT"

echo "Installed $UNIT for user $INSTALL_USER uid $INSTALL_UID from $SYSTEMD_SRC"
echo "Review env overrides in $INSTALL_HOME/.config/hermes-personal-display.env before restart."
echo "Restart with: sudo systemctl restart $UNIT"
echo "Verify with: $PROJECT/scripts/hermes-display verify"
