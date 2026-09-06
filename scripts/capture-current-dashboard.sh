#!/usr/bin/env bash
set -euo pipefail

# Capture the live physical display for private/synced review and generate a
# separate synthetic screenshot for the public repository. Never copy live
# operator state into docs/current-dashboard.png.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC_OUT="${HERMES_DASHBOARD_SYNC_OUT:-$HOME/Sync/hermes-dashboard-current.png}"
REPO_OUT="${HERMES_DASHBOARD_REPO_OUT:-$ROOT_DIR/docs/current-dashboard.png}"
PUBLIC_CAPTURE="$ROOT_DIR/scripts/capture-public-dashboard.cjs"
DISPLAY_NAME="${DISPLAY:-:0}"
OUTPUT_NAME="${HERMES_DASHBOARD_OUTPUT:-DP-2}"

usage() {
  cat <<'USAGE'
Usage: scripts/capture-current-dashboard.sh [--sync-only|--repo-only|--output PATH]

Captures the current live Hermes dashboard for the private synced output and
generates a bounded synthetic dashboard for docs/current-dashboard.png.
`--repo-only` never captures or publishes live operator state.

Environment overrides:
  DISPLAY                       X display to capture, defaults to :0
  HERMES_DASHBOARD_OUTPUT       XRandR output to crop, defaults to DP-2
  HERMES_DASHBOARD_SYNC_OUT     synced local screenshot path
  HERMES_DASHBOARD_REPO_OUT     repo screenshot path
USAGE
}

write_sync=1
write_repo=1
custom_out=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sync-only)
      write_repo=0
      ;;
    --repo-only)
      write_sync=0
      ;;
    --output)
      shift
      custom_out="${1:-}"
      if [[ -z "$custom_out" ]]; then
        echo "--output requires a path" >&2
        exit 2
      fi
      write_sync=0
      write_repo=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

capture_public() {
  if [[ ! -f "$PUBLIC_CAPTURE" ]]; then
    echo "Missing public screenshot helper: $PUBLIC_CAPTURE" >&2
    return 1
  fi
  node "$PUBLIC_CAPTURE" "$REPO_OUT"
}

if [[ "$write_repo" -eq 1 && "$write_sync" -eq 0 && -z "$custom_out" ]]; then
  capture_public
  exit 0
fi

if ! command -v scrot >/dev/null 2>&1; then
  echo "scrot is required to capture the X11 framebuffer" >&2
  exit 1
fi

if ! DISPLAY="$DISPLAY_NAME" xrandr --query >/tmp/hermes-dashboard-xrandr.$$ 2>/tmp/hermes-dashboard-xrandr-err.$$; then
  echo "Unable to query XRandR on DISPLAY=$DISPLAY_NAME" >&2
  cat /tmp/hermes-dashboard-xrandr-err.$$ >&2 || true
  rm -f /tmp/hermes-dashboard-xrandr.$$ /tmp/hermes-dashboard-xrandr-err.$$
  exit 1
fi

geometry="$(python3 - "$OUTPUT_NAME" /tmp/hermes-dashboard-xrandr.$$ <<'PY'
import re
import sys
output = sys.argv[1]
path = sys.argv[2]
text = open(path, encoding='utf-8').read().splitlines()
pattern = re.compile(rf'^{re.escape(output)}\s+connected\b.*?(\d+)x(\d+)\+(\d+)\+(\d+)')
for line in text:
    match = pattern.search(line)
    if match:
        print(' '.join(match.groups()))
        sys.exit(0)
print('', end='')
sys.exit(1)
PY
)" || true

rm -f /tmp/hermes-dashboard-xrandr.$$ /tmp/hermes-dashboard-xrandr-err.$$

if [[ -z "$geometry" ]]; then
  echo "Unable to find connected output $OUTPUT_NAME in XRandR output" >&2
  exit 1
fi

read -r width height x y <<<"$geometry"

tmp_full="$(mktemp --suffix=.png /tmp/hermes-dashboard-full.XXXXXX)"
tmp_crop="$(mktemp --suffix=.png /tmp/hermes-dashboard-crop.XXXXXX)"
# scrot refuses to overwrite an existing file and silently appends _000, so
# reserve names with mktemp, then remove them before capture/write.
rm -f "$tmp_full" "$tmp_crop"
trap 'rm -f "$tmp_full" "$tmp_crop"' EXIT

DISPLAY="$DISPLAY_NAME" scrot "$tmp_full"

python3 - "$tmp_full" "$tmp_crop" "$width" "$height" "$x" "$y" <<'PY'
from PIL import Image
import sys
src, dest, width, height, x, y = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:])
with Image.open(src) as im:
    crop = im.crop((x, y, x + width, y + height))
    crop.save(dest, optimize=True)
PY

written=()
if [[ -n "$custom_out" ]]; then
  mkdir -p "$(dirname "$custom_out")"
  cp "$tmp_crop" "$custom_out"
  written+=("$custom_out")
fi
if [[ "$write_sync" -eq 1 ]]; then
  mkdir -p "$(dirname "$SYNC_OUT")"
  cp "$tmp_crop" "$SYNC_OUT"
  written+=("$SYNC_OUT")
fi
if [[ "$write_repo" -eq 1 ]]; then
  capture_public
  written+=("$REPO_OUT")
fi

printf 'Captured %sx%s+%s+%s from %s on DISPLAY=%s\n' "$width" "$height" "$x" "$y" "$OUTPUT_NAME" "$DISPLAY_NAME"
printf 'Updated:\n'
printf '  %s\n' "${written[@]}"
