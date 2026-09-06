#!/usr/bin/env bash
set -euo pipefail

# Lightweight physical-display renderer backed by an isolated tmux source.
# The compositor starts one btop pane and one configured health-monitor pane;
# it does not resize or attach to the operator's interactive Herdr workspace.

SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null || realpath -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
PYTHON="${PERSONAL_DISPLAY_PYTHON:-$(command -v python3)}"
ALACRITTY="${PERSONAL_DISPLAY_ALACRITTY:-$(command -v alacritty || true)}"
POLL_SECONDS="${PERSONAL_DISPLAY_MONITOR_POLL_SECONDS:-1}"
DASHBOARD="$SCRIPT_DIR/herdr-monitor-raw-compositor.py"

if [[ -z "${DISPLAY:-}" ]]; then
  echo "Herdr Monitor terminal display requires an X11 DISPLAY." >&2
  exit 1
fi
if [[ -z "$PYTHON" || ! -x "$PYTHON" ]]; then
  echo "python3 is required for the Herdr Monitor terminal display." >&2
  exit 1
fi
if [[ -z "$ALACRITTY" || ! -x "$ALACRITTY" ]]; then
  echo "alacritty is required for the Herdr Monitor terminal display." >&2
  exit 1
fi
if [[ ! -x "$DASHBOARD" ]]; then
  echo "missing executable dashboard: $DASHBOARD" >&2
  exit 1
fi
if [[ ! "$POLL_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "PERSONAL_DISPLAY_MONITOR_POLL_SECONDS must be numeric: $POLL_SECONDS" >&2
  exit 2
fi

# The compositor owns a separate fixed-size tmux source. It does not attach
# to, resize, or otherwise alter the interactive Herdr Monitor tab.
# Alacritty is the only GUI process. The Python compositor owns the isolated
# fixed-size terminal source and presents its two native monitor panes.
exec "$ALACRITTY" \
  -q \
  --class HermesMonitorDisplay \
  --title "Hermes Monitor" \
  --working-directory "$HOME" \
  -o 'window.decorations="None"' \
  -o 'window.startup_mode="Fullscreen"' \
  -o 'window.dimensions.columns=192' \
  -o 'window.dimensions.lines=65' \
  -o 'font.normal.family="IBM Plex Mono"' \
  -o 'font.size=4.8' \
  -o 'font.offset.x=1' \
  -o 'font.offset.y=1' \
  -o 'font.glyph_offset.y=0' \
  -o 'window.padding.x=0' \
  -o 'window.padding.y=0' \
  -o 'colors.primary.background="#05070a"' \
  --command "$PYTHON" "$DASHBOARD" --poll-seconds "$POLL_SECONDS"
