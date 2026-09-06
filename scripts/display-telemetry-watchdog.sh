#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null || realpath -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
URL="${PERSONAL_DISPLAY_STATE_URL:-http://127.0.0.1:8770/api/hermes-state}"
SERVICE="${PERSONAL_DISPLAY_SERVICE:-hermes-personal-display-preview.service}"
EXPECTED_SYSTEM_SERVICE="hermes-personal-display-minix.service"
SYSTEM_SERVICE="${HERMES_DISPLAY_SYSTEM_SERVICE:-$EXPECTED_SYSTEM_SERVICE}"
if [[ "$SYSTEM_SERVICE" != "$EXPECTED_SYSTEM_SERVICE" ]]; then
  echo "Refusing privileged restart outside the kiosk allowlist: $SYSTEM_SERVICE" >&2
  exit 2
fi
if [[ ! "$SERVICE" =~ ^[A-Za-z0-9_.@:-]+\.service$ ]]; then
  echo "Refusing invalid user service name: $SERVICE" >&2
  exit 2
fi
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
RUNTIME_MODE="$(stat -c '%a' -- "$RUNTIME_DIR" 2>/dev/null || true)"
if [[ -L "$RUNTIME_DIR" || ! -d "$RUNTIME_DIR" || ! -O "$RUNTIME_DIR" || ! "$RUNTIME_MODE" =~ ^[0-7]*00$ ]]; then
  echo "Unsafe or unavailable watchdog runtime directory: $RUNTIME_DIR mode=${RUNTIME_MODE:-unknown}" >&2
  exit 1
fi
STAMP="$RUNTIME_DIR/hermes-display-telemetry-watchdog.last-restart"
COOLDOWN_SECONDS="${PERSONAL_DISPLAY_WATCHDOG_COOLDOWN:-300}"
DISPLAY_NAME="${PERSONAL_DISPLAY_X_DISPLAY:-:0}"
DISPLAY_OUTPUT="${PERSONAL_DISPLAY_OUTPUT:-DP-2}"
DISPLAY_MODE="${PERSONAL_DISPLAY_OUTPUT_MODE:-1920x1280}"
DISPLAY_ROTATE="${PERSONAL_DISPLAY_OUTPUT_ROTATE:-inverted}"
DISPLAY_POS="${PERSONAL_DISPLAY_OUTPUT_POS:-0x0}"
RENDER_FAILURES="$RUNTIME_DIR/hermes-display-render-failures"
RENDER_RESTART_STAMP="$RUNTIME_DIR/hermes-display-render-last-restart"
RENDER_RESTART_COOLDOWN="${PERSONAL_DISPLAY_RENDER_RESTART_COOLDOWN:-300}"
# Tracks the last observed non-restartable (status 2) render state so the
# watchdog can surface that fault on the transition into it without repeating
# it on every tick while the display stays genuinely inactive/unavailable.
RENDER_DOWN_SEEN="$RUNTIME_DIR/hermes-display-render-down-seen"
HERMES_DISPLAY="${PERSONAL_DISPLAY_COMMAND:-$SCRIPT_DIR/hermes-display}"
RUNTIME_CHECKS="$SCRIPT_DIR/display_runtime_checks.py"

if [[ ! "$COOLDOWN_SECONDS" =~ ^[0-9]+$ || ! "$RENDER_RESTART_COOLDOWN" =~ ^[0-9]+$ ]]; then
  echo "Watchdog cooldown values must be non-negative integers." >&2
  exit 2
fi

validate_state_path() {
  local path="$1"
  if [[ -L "$path" || ( -e "$path" && ( ! -f "$path" || ! -O "$path" ) ) ]]; then
    echo "Unsafe watchdog state path: $path" >&2
    return 1
  fi
}

write_state_file() {
  local path="$1" value="$2" tmp
  validate_state_path "$path"
  tmp="$(mktemp "$RUNTIME_DIR/.hermes-display-state.XXXXXX")"
  printf '%s' "$value" >"$tmp"
  chmod 600 "$tmp"
  if ! mv -fT -- "$tmp" "$path"; then
    rm -f -- "$tmp"
    return 1
  fi
}

read_state_file() {
  local path="$1"
  validate_state_path "$path"
  if [[ -s "$path" ]]; then
    printf '%s' "$(<"$path")"
  else
    printf '0'
  fi
}

validate_state_path "$STAMP"
validate_state_path "$RENDER_FAILURES"
validate_state_path "$RENDER_RESTART_STAMP"
validate_state_path "$RENDER_DOWN_SEEN"

# Reassert the always-on policy every watchdog tick. This is harmless when the
# X server has no DPMS extension, and repairs a connector that is still present
# but was disabled after a link/power glitch.
if DISPLAY="$DISPLAY_NAME" xset q >/dev/null 2>&1; then
  DISPLAY="$DISPLAY_NAME" xset s off s noblank -dpms >/dev/null 2>&1 || true
  DISPLAY="$DISPLAY_NAME" xset s reset >/dev/null 2>&1 || true

  output_line="$(DISPLAY="$DISPLAY_NAME" xrandr --query 2>/dev/null | awk -v output="$DISPLAY_OUTPUT" '$1 == output && $2 == "connected" { print; exit }')"
  if [[ -n "$output_line" ]]; then
    layout_status=0
    python3 "$RUNTIME_CHECKS" layout \
      --line "$output_line" \
      --output "$DISPLAY_OUTPUT" \
      --mode "$DISPLAY_MODE" \
      --rotation "$DISPLAY_ROTATE" \
      --position "$DISPLAY_POS" >/dev/null 2>&1 || layout_status=$?
    if [[ "$layout_status" -eq 1 ]]; then
      if DISPLAY="$DISPLAY_NAME" xrandr \
        --output "$DISPLAY_OUTPUT" \
        --mode "$DISPLAY_MODE" \
        --rotate "$DISPLAY_ROTATE" \
        --primary \
        --pos "$DISPLAY_POS"; then
        echo "Recovered $DISPLAY_OUTPUT: connector was connected but not actively driving $DISPLAY_MODE."
      else
        echo "Unable to repair display layout for $DISPLAY_OUTPUT; continuing with non-restartable verification." >&2
      fi
    elif [[ "$layout_status" -eq 2 ]]; then
      echo "Unable to validate configured display layout; skipping automatic xrandr repair." >&2
    fi
  fi
fi

# The connector, Chromium process, and state API can all be healthy while the
# actual X framebuffer is black. Verify only the managed render path (service,
# Chromium instance count, layout, and pixels), require two consecutive failures
# to ignore startup transitions, then recover through the managed kiosk service.
# The cooldown prevents a restart loop if rendering cannot recover.
render_status=0
if "$HERMES_DISPLAY" verify-render >/dev/null 2>&1; then
  rm -f "$RENDER_FAILURES"
  rm -f "$RENDER_DOWN_SEEN"
else
  render_status=$?
  if [[ "$render_status" -eq 1 ]]; then
    # Restartable fault: the display is present but rendering is broken, so we
    # leave the quiescent state and re-arm the non-restartable transition log.
    rm -f "$RENDER_DOWN_SEEN"
    failures="$(read_state_file "$RENDER_FAILURES")"
    [[ "$failures" =~ ^[0-9]+$ ]] || failures=0
    failures=$((failures + 1))
    write_state_file "$RENDER_FAILURES" "$failures"
    if [[ "$failures" -ge 2 ]]; then
      now="$(date +%s)"
      last_render_restart="$(read_state_file "$RENDER_RESTART_STAMP")"
      [[ "$last_render_restart" =~ ^[0-9]+$ ]] || last_render_restart=0
      if [[ $((now - last_render_restart)) -ge "$RENDER_RESTART_COOLDOWN" ]]; then
        # Record the attempt before invoking sudo so a persistent permission or
        # service failure cannot trigger a restart attempt on every timer tick.
        write_state_file "$RENDER_RESTART_STAMP" "$now"
        if sudo -n systemctl restart -- "$SYSTEM_SERVICE"; then
          rm -f "$RENDER_FAILURES"
          echo "Restarted physical kiosk: display verification failed twice consecutively."
        else
          echo "Failed to restart physical kiosk after repeated display verification failures." >&2
          exit 1
        fi
      fi
    fi
  else
    # Non-restartable fault (e.g. display output disconnected / framebuffer
    # unavailable): restart cannot help, so recovery stays fail-closed and
    # suppressed. Surface the fault once on the transition into this state and
    # stay quiet while it persists, so the watchdog is not noisy every tick for
    # an expected, long-lived inactive display.
    rm -f "$RENDER_FAILURES"
    last_down="$(read_state_file "$RENDER_DOWN_SEEN")"
    [[ "$last_down" =~ ^[0-9]+$ ]] || last_down=0
    if [[ "$last_down" -ne "$render_status" ]]; then
      write_state_file "$RENDER_DOWN_SEEN" "$render_status"
      echo "Display verification reported a non-restartable fault (status $render_status); kiosk restart suppressed." >&2
    fi
  fi
fi

json="$(mktemp)"
trap 'rm -f "$json"' EXIT

if ! curl -fsS --max-time 4 "$URL" -o "$json"; then
  exit 0
fi

read -r sensor_error thermal_readings temp_c cpu memory <<EOF
$(python3 - "$json" <<'PY'
import json, sys
j = json.load(open(sys.argv[1]))
s = j.get('live', {}).get('system', {})
print(
    str(bool(s.get('sensor_error'))).lower(),
    int(s.get('thermal_readings') or 0),
    s.get('temp_c'),
    s.get('cpu'),
    s.get('memory'),
)
PY
)
EOF

host_readings="$(python3 - <<'PY'
from pathlib import Path
count = 0
for path in Path('/sys/class/hwmon').glob('hwmon*/temp*_input'):
    try:
        path.read_text(encoding='utf-8')
        count += 1
    except Exception:
        pass
print(count)
PY
)"
host_has_proc=0
[[ -r /proc/loadavg && -r /proc/meminfo ]] && host_has_proc=1

bad=0
if [[ "$sensor_error" == "true" && "$host_readings" -gt 0 && "$host_has_proc" -eq 1 ]]; then
  bad=1
elif [[ "$thermal_readings" -eq 0 && "$host_readings" -gt 0 && "$host_has_proc" -eq 1 ]]; then
  bad=1
elif [[ "$temp_c" == "None" && "$host_readings" -gt 0 && "$host_has_proc" -eq 1 ]]; then
  bad=1
fi

if [[ "$bad" -ne 1 ]]; then
  exit 0
fi

now="$(date +%s)"
last="$(read_state_file "$STAMP")"
[[ "$last" =~ ^[0-9]+$ ]] || last=0
if [[ $((now - last)) -lt "$COOLDOWN_SECONDS" ]]; then
  exit 0
fi

write_state_file "$STAMP" "$now"
systemctl --user restart -- "$SERVICE"
echo "Restarted $SERVICE: display API telemetry was stale while host sensors were available."
