#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
export HOME="${HOME:-$(getent passwd "$(id -un)" | cut -d: -f6)}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BUILD_ID="${PERSONAL_DISPLAY_BUILD_ID:-$($SCRIPT_DIR/hermes-display build-id)}"
URL="${PERSONAL_DISPLAY_URL:-$($SCRIPT_DIR/hermes-display url)}"
# Cache-bust the kiosk shell on each frontend runtime revision. The system unit may
# still pass an older v=... URL, so normalize here from the generated build id.
if [[ "$URL" == *"character-runtime.html"* ]]; then
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
DISPLAY_OUTPUT="${PERSONAL_DISPLAY_OUTPUT:-}"
DISPLAY_MODE="${PERSONAL_DISPLAY_OUTPUT_MODE:-1920x1280}"
DISPLAY_ROTATE="${PERSONAL_DISPLAY_OUTPUT_ROTATE:-inverted}"
DISPLAY_POS="${PERSONAL_DISPLAY_OUTPUT_POS:-0x0}"
AUDIO_SINK="${PERSONAL_DISPLAY_AUDIO_SINK:-}"
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

detect_output() {
  local xr="$1"
  if [[ -n "$DISPLAY_OUTPUT" ]] && printf '%s\n' "$xr" | grep -q "^${DISPLAY_OUTPUT} connected"; then
    printf '%s\n' "$DISPLAY_OUTPUT"
    return 0
  fi
  printf '%s\n' "$xr" | awk '/^DP-[0-9]+ connected/ {print $1; exit} /^HDMI-[0-9]+ connected/ {print $1; exit} / connected/ {print $1; exit}'
}

configure_outputs() {
  local xr output
  xr="$(xrandr --query 2>&1 || true)"
  log "xrandr before: $(printf '%s' "$xr" | tr '\n' ' ' | sed 's/  */ /g')"

  xset s off -dpms s noblank >/dev/null 2>&1 || true

  output="$(detect_output "$xr")"
  if [[ -n "$output" ]]; then
    DISPLAY_OUTPUT="$output"
    # MINIX SF10T currently presents as DP-2 on Brian's NUC, but keep this
    # env-driven so disaster recovery is not tied to one connector name.
    if printf '%s\n' "$xr" | grep -q "^${output} connected.*${DISPLAY_MODE}"; then
      xrandr --output "$output" --mode "$DISPLAY_MODE" --rotate "$DISPLAY_ROTATE" --primary --pos "$DISPLAY_POS" || true
    else
      xrandr --output "$output" --auto --rotate "$DISPLAY_ROTATE" --primary --pos "$DISPLAY_POS" || true
    fi
    if printf '%s\n' "$xr" | grep -q '^DP-1 connected'; then
      if [[ "${PERSONAL_DISPLAY_ENABLE_DP1:-0}" == "1" ]]; then
        log "DP-1 connected; enabling because PERSONAL_DISPLAY_ENABLE_DP1=1"
        xrandr --output DP-1 --auto --right-of "$output" || true
      else
        log "DP-1 connected; disabling for MINIX kiosk thermal reduction (set PERSONAL_DISPLAY_ENABLE_DP1=1 to keep it on)"
        xrandr --output DP-1 --off || true
      fi
    fi
  else
    log "No connected kiosk output found according to xrandr; leaving default output layout"
  fi

  xrandr --query 2>&1 | tee -a "$LOG_FILE" || true

  if command -v xinput >/dev/null 2>&1; then
    while IFS= read -r device_name; do
      [ -n "$device_name" ] || continue
      log "mapping touch input to ${DISPLAY_OUTPUT:-default output}: $device_name"
      if [[ -n "${DISPLAY_OUTPUT:-}" ]]; then
        xinput --map-to-output "$device_name" "$DISPLAY_OUTPUT"
      else
        xinput --map-to-output "$device_name" "$(xrandr --query | awk '/ connected/ {print $1; exit}')"
      fi >>"$LOG_FILE" 2>&1 || true
      # xinput --map-to-output can leave the touch controller at an identity
      # transform when there is only one active X output. The MINIX panel is
      # physically used with DP-2 rotated 180 degrees (xrandr "inverted"), so
      # compose the output mapping and 180-degree touch rotation explicitly.
      # Matrix form for output geometry x,y,w,h on screen W,H:
      # [-w/W 0 (x+w)/W ; 0 -h/H (y+h)/H ; 0 0 1]
      case "$DISPLAY_ROTATE" in
        inverted)
          if [[ -n "${DISPLAY_OUTPUT:-}" ]]; then
            matrix="$(xrandr --query | awk -v out="$DISPLAY_OUTPUT" '
              /^Screen 0:/ { screen_w=$8; screen_h=$10 }
              $1 == out && / connected/ {
                for (i = 1; i <= NF; i++) {
                  if ($i ~ /^[0-9]+x[0-9]+\+[0-9]+\+[0-9]+$/) {
                    geometry = $i
                    gsub(/[x+]/, " ", geometry)
                    split(geometry, g)
                    if (screen_w && screen_h) {
                      printf "%.9f 0 %.9f 0 %.9f %.9f 0 0 1", -g[1]/screen_w, (g[3]+g[1])/screen_w, -g[2]/screen_h, (g[4]+g[2])/screen_h
                    }
                    exit
                  }
                }
              }
            ')"
            if [[ -n "$matrix" ]]; then
              # Intentionally unquoted: xinput expects nine separate matrix values.
              xinput set-prop "$device_name" "Coordinate Transformation Matrix" $matrix >>"$LOG_FILE" 2>&1 || true
            fi
          fi
          ;;
      esac
      xinput --list-props "$device_name" >>"$LOG_FILE" 2>&1 || true
    done < <(xinput list --name-only 2>/dev/null | grep -Ei 'touch|SiS HID' || true)
  fi
}

configure_audio() {
  # Keep the physical kiosk on the SF10T/HDMI sink after display restarts. This is
  # best-effort because PipeWire may still be coming up while X starts.
  if command -v pactl >/dev/null 2>&1; then
    local sink target
    target="$AUDIO_SINK"
    if [[ -z "$target" ]]; then
      target="$(pactl list short sinks 2>/dev/null | awk '/hdmi-stereo/ {print $2; exit}' || true)"
    fi
    sink="$(pactl list short sinks 2>/dev/null | awk -v target="$target" '$2 == target {print $2; exit}' || true)"
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
