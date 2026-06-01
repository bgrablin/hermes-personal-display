#!/usr/bin/env bash
set -euo pipefail

URL="${PERSONAL_DISPLAY_STATE_URL:-http://127.0.0.1:8770/api/hermes-state}"
SERVICE="${PERSONAL_DISPLAY_SERVICE:-hermes-personal-display-preview.service}"
STAMP="${XDG_RUNTIME_DIR:-/tmp}/hermes-display-telemetry-watchdog.last-restart"
COOLDOWN_SECONDS="${PERSONAL_DISPLAY_WATCHDOG_COOLDOWN:-300}"

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
