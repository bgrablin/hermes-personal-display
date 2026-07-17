#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f -- "${BASH_SOURCE[0]}" 2>/dev/null || realpath -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
URL="${PERSONAL_DISPLAY_STATE_URL:-http://127.0.0.1:8770/api/hermes-state}"
SERVICE="${PERSONAL_DISPLAY_SERVICE:-hermes-personal-display-preview.service}"
SYSTEM_SERVICE="${HERMES_DISPLAY_SYSTEM_SERVICE:-hermes-personal-display-minix.service}"
STAMP="${XDG_RUNTIME_DIR:-/tmp}/hermes-display-telemetry-watchdog.last-restart"
COOLDOWN_SECONDS="${PERSONAL_DISPLAY_WATCHDOG_COOLDOWN:-300}"
DISPLAY_NAME="${PERSONAL_DISPLAY_X_DISPLAY:-:0}"
DISPLAY_OUTPUT="${PERSONAL_DISPLAY_OUTPUT:-DP-2}"
DISPLAY_MODE="${PERSONAL_DISPLAY_OUTPUT_MODE:-1920x1280}"
DISPLAY_ROTATE="${PERSONAL_DISPLAY_OUTPUT_ROTATE:-inverted}"
DISPLAY_POS="${PERSONAL_DISPLAY_OUTPUT_POS:-0x0}"
RENDER_FAILURES="${XDG_RUNTIME_DIR:-/tmp}/hermes-display-render-failures"
RENDER_RESTART_STAMP="${XDG_RUNTIME_DIR:-/tmp}/hermes-display-render-last-restart"
RENDER_RESTART_COOLDOWN="${PERSONAL_DISPLAY_RENDER_RESTART_COOLDOWN:-300}"
HERMES_DISPLAY="${PERSONAL_DISPLAY_COMMAND:-$SCRIPT_DIR/hermes-display}"

# Reassert the always-on policy every watchdog tick. This is harmless when the
# X server has no DPMS extension, and repairs a connector that is still present
# but was disabled after a link/power glitch.
if DISPLAY="$DISPLAY_NAME" xset q >/dev/null 2>&1; then
  DISPLAY="$DISPLAY_NAME" xset s off s noblank -dpms >/dev/null 2>&1 || true
  DISPLAY="$DISPLAY_NAME" xset s reset >/dev/null 2>&1 || true

  geometry_pos="${DISPLAY_POS/x/+}"
  expected_geometry="${DISPLAY_MODE}+${geometry_pos}"
  output_line="$(DISPLAY="$DISPLAY_NAME" xrandr --query 2>/dev/null | awk -v output="$DISPLAY_OUTPUT" '$1 == output && $2 == "connected" { print; exit }')"
  if [[ -n "$output_line" ]] && {
    [[ "$output_line" != *"$expected_geometry"* ]] ||
      [[ "$output_line" != *" primary "* ]] ||
      [[ "$output_line" != *" $DISPLAY_ROTATE "* ]]
  }; then
    DISPLAY="$DISPLAY_NAME" xrandr \
      --output "$DISPLAY_OUTPUT" \
      --mode "$DISPLAY_MODE" \
      --rotate "$DISPLAY_ROTATE" \
      --primary \
      --pos "$DISPLAY_POS"
    echo "Recovered $DISPLAY_OUTPUT: connector was connected but not actively driving $DISPLAY_MODE."
  fi
fi

# The connector, Chromium process, and state API can all be healthy while the
# actual X framebuffer is black. Verify only the managed render path (service,
# Chromium instance count, layout, and pixels), require two consecutive failures
# to ignore startup transitions, then recover through the managed kiosk service.
# The cooldown prevents a restart loop if rendering cannot recover.
if "$HERMES_DISPLAY" verify-render >/dev/null 2>&1; then
  rm -f "$RENDER_FAILURES"
else
  failures=0
  [[ -s "$RENDER_FAILURES" ]] && failures="$(<"$RENDER_FAILURES")"
  [[ "$failures" =~ ^[0-9]+$ ]] || failures=0
  failures=$((failures + 1))
  printf '%s' "$failures" >"$RENDER_FAILURES"
  if [[ "$failures" -ge 2 ]]; then
    now="$(date +%s)"
    last_render_restart=0
    [[ -s "$RENDER_RESTART_STAMP" ]] && last_render_restart="$(<"$RENDER_RESTART_STAMP")"
    [[ "$last_render_restart" =~ ^[0-9]+$ ]] || last_render_restart=0
    if [[ $((now - last_render_restart)) -ge "$RENDER_RESTART_COOLDOWN" ]]; then
      # Record the attempt before invoking sudo so a persistent permission or
      # service failure cannot trigger a restart attempt on every timer tick.
      printf '%s' "$now" >"$RENDER_RESTART_STAMP"
      if sudo -n systemctl restart "$SYSTEM_SERVICE"; then
        rm -f "$RENDER_FAILURES"
        echo "Restarted physical kiosk: display verification failed twice consecutively."
      else
        echo "Failed to restart physical kiosk after repeated display verification failures." >&2
        exit 1
      fi
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
last=0
[[ -s "$STAMP" ]] && last="$(cat "$STAMP" 2>/dev/null || echo 0)"
if [[ $((now - last)) -lt "$COOLDOWN_SECONDS" ]]; then
  exit 0
fi

printf '%s' "$now" > "$STAMP"
systemctl --user restart "$SERVICE"
echo "Restarted $SERVICE: display API telemetry was stale while host sensors were available."
