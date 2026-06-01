#!/usr/bin/env bash
set -euo pipefail

URL="${PERSONAL_DISPLAY_URL:-http://127.0.0.1:8770/src/character-runtime-v2.html?kiosk=1}"
CHROME="${PERSONAL_DISPLAY_CHROME:-}"
WINDOW_SIZE="${PERSONAL_DISPLAY_WINDOW_SIZE:-1280,1920}"
EXTRA_ARGS="${PERSONAL_DISPLAY_CHROME_ARGS:-}"

if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo "No graphical session detected. Export DISPLAY or WAYLAND_DISPLAY before kiosk launch." >&2
  echo "Hint: run scripts/detect-display-env.sh from the desktop session and copy the results into the unit env file." >&2
  exit 1
fi

if [[ -z "$CHROME" ]]; then
  for candidate in chromium-browser chromium google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROME="$candidate"
      break
    fi
  done
fi

if [[ -z "$CHROME" ]]; then
  echo "No Chromium/Chrome executable found. Install chromium-browser/chromium before kiosk launch." >&2
  exit 1
fi

# shellcheck disable=SC2206
EXTRA_ARG_ARRAY=($EXTRA_ARGS)

exec "$CHROME" \
  --kiosk \
  --app="$URL" \
  --window-size="$WINDOW_SIZE" \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --ozone-platform-hint=auto \
  "${EXTRA_ARG_ARRAY[@]}"
