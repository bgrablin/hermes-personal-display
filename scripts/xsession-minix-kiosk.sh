#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
export HOME="${HOME:-$(getent passwd "$(id -un)" | cut -d: -f6)}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BUILD_ID="${PERSONAL_DISPLAY_BUILD_ID:-$($SCRIPT_DIR/hermes-display build-id)}"
URL="${PERSONAL_DISPLAY_URL:-http://127.0.0.1:8770/src/character-runtime-v2.html?kiosk=1&orientation=landscape}"
# Cache-bust the kiosk shell on each frontend runtime revision. The system unit may
# still pass an older v=... URL, so normalize here from the runtime's DISPLAY_BUILD_ID.
if [[ "$URL" == *"character-runtime-v2.html"* ]]; then
  if [[ "$URL" == *"v="* ]]; then
    URL="$(python3 - "$URL" "$BUILD_ID" <<'PY'
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
url, build = sys.argv[1], sys.argv[2]
parts = urlsplit(url)
query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != 'v']
query.append(('v', build))
print(urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)))
PY
)"
  else
    URL="${URL}$([[ "$URL" == *\?* ]] && printf '&' || printf '?')v=$BUILD_ID"
  fi
fi
CHROME="${PERSONAL_DISPLAY_CHROME:-/usr/bin/chromium-browser}"
# chromium-browser is a snap on this host. Keep the profile under ~/snap/chromium/common
# so AppArmor allows it; hidden ~/.cache/.hermes paths trigger denials.
WINDOW_SIZE="${PERSONAL_DISPLAY_WINDOW_SIZE:-1920,1280}"
PROFILE_DIR="${PERSONAL_DISPLAY_CHROME_PROFILE:-$HOME/snap/chromium/common/hermes-personal-display-profile}"
LOG_DIR="$HOME/.hermes/logs"
LOG_FILE="$LOG_DIR/personal-display-kiosk.log"
mkdir -p "$PROFILE_DIR" "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG_FILE"
}

wait_for_x() {
  for _ in $(seq 1 40); do
    if xset q >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  log "X server did not become ready"
  return 1
}

configure_outputs() {
  local xr
  xr="$(xrandr --query 2>&1 || true)"
  log "xrandr before: $(printf '%s' "$xr" | tr '\n' ' ' | sed 's/  */ /g')"

  xset s off -dpms s noblank >/dev/null 2>&1 || true

  # MINIX SF10T presents as DP-2 on the NUC USB-C/TB3 DisplayPort path.
  # Brian wants the panel physically rotated to landscape with the USB-C cable on the right,
  # so keep the native landscape mode and make DP-2 the primary output.
  if printf '%s\n' "$xr" | grep -q '^DP-2 connected'; then
    if printf '%s\n' "$xr" | grep -q '^DP-2 connected.*1920x1280'; then
      xrandr --output DP-2 --mode 1920x1280 --rotate inverted --primary --pos 0x0 || true
    else
      xrandr --output DP-2 --auto --rotate inverted --primary --pos 0x0 || true
    fi
    if printf '%s\n' "$xr" | grep -q '^DP-1 connected'; then
      if [[ "${PERSONAL_DISPLAY_ENABLE_DP1:-0}" == "1" ]]; then
        log "DP-1 connected; enabling because PERSONAL_DISPLAY_ENABLE_DP1=1"
        xrandr --output DP-1 --auto --right-of DP-2 || true
      else
        log "DP-1 connected; disabling for MINIX kiosk thermal reduction (set PERSONAL_DISPLAY_ENABLE_DP1=1 to keep it on)"
        xrandr --output DP-1 --off || true
      fi
    fi
  else
    log "DP-2 not connected according to xrandr; leaving default output layout"
  fi

  xrandr --query 2>&1 | tee -a "$LOG_FILE" || true

  if command -v xinput >/dev/null 2>&1; then
    while IFS= read -r device_name; do
      [ -n "$device_name" ] || continue
      log "mapping touch input to DP-2: $device_name"
      xinput --map-to-output "$device_name" DP-2 >>"$LOG_FILE" 2>&1 || true
      xinput --list-props "$device_name" >>"$LOG_FILE" 2>&1 || true
    done < <(xinput list --name-only 2>/dev/null | grep -Ei 'touch|SiS HID' || true)
  fi
}

configure_audio() {
  # Keep the physical kiosk on the SF10T/HDMI sink after display restarts. This is
  # best-effort because PipeWire may still be coming up while X starts.
  if command -v pactl >/dev/null 2>&1; then
    local sink
    sink="$(pactl list short sinks 2>/dev/null | awk '/alsa_output\.pci-0000_00_1f\.3\.hdmi-stereo/ {print $2; exit}' || true)"
    if [[ -n "$sink" ]]; then
      pactl set-default-sink "$sink" >/dev/null 2>&1 || true
      pactl set-sink-mute "$sink" 0 >/dev/null 2>&1 || true
      pactl set-sink-volume "$sink" "${PERSONAL_DISPLAY_AUDIO_VOLUME:-90%}" >/dev/null 2>&1 || true
      log "audio sink configured: $sink volume=${PERSONAL_DISPLAY_AUDIO_VOLUME:-90%}"
    else
      log "audio HDMI sink not visible to PipeWire; leaving audio routing unchanged"
    fi
  fi
}

launch_helpers() {
  openbox >/tmp/hermes-personal-display-openbox.log 2>&1 &
  unclutter -idle 0 -root -noevents >/tmp/hermes-personal-display-unclutter.log 2>&1 &
  # Paint the X root the same near-black as the dashboard so any gap between Chromium
  # exiting and the next instance painting shows dark, not a frozen stale frame.
  clear_screen_dark
}

# Clearing to the dashboard background avoids the "old display flashes then loads" effect on
# restart: when Chromium exits, X retains its last frame until the new process paints, so we
# blank the root to the app background first. Best-effort; harmless if the tools are absent.
clear_screen_dark() {
  if command -v xsetroot >/dev/null 2>&1; then
    xsetroot -solid '#05070a' >/dev/null 2>&1 || true
  elif command -v hsetroot >/dev/null 2>&1; then
    hsetroot -solid '#05070a' >/dev/null 2>&1 || true
  fi
}

launch_chromium_loop() {
  # Chromium enforces one instance per --user-data-dir (SingletonLock), so two kiosks cannot
  # share this profile. Clear any stale lock from an unclean exit so the relaunch is not blocked.
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" "$PROFILE_DIR/SingletonSocket" 2>/dev/null || true
  while true; do
    clear_screen_dark
    log "starting Chromium kiosk: $URL"
    "$CHROME" \
      --kiosk \
      --app="$URL" \
      --window-position=0,0 \
      --window-size="$WINDOW_SIZE" \
      --user-data-dir="$PROFILE_DIR" \
      --no-first-run \
      --disable-infobars \
      --disable-session-crashed-bubble \
      --autoplay-policy=no-user-gesture-required \
      --touch-events=enabled \
      --ozone-platform-hint=x11 \
      --disable-backgrounding-occluded-windows \
      ${PERSONAL_DISPLAY_CHROME_ARGS:-} >>"$LOG_FILE" 2>&1 || true
    log "Chromium exited; restarting in 3 seconds"
    sleep 3
  done
}

wait_for_x
configure_outputs
configure_audio
launch_helpers
launch_chromium_loop
