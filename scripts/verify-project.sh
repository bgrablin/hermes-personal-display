#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${PERSONAL_DISPLAY_BASE_URL:-http://127.0.0.1:8770}"

cd "$ROOT"

fail=0
say() { printf '%s\n' "$*"; }
check_file() {
  local f="$1"
  if [[ -s "$f" ]]; then
    say "OK file $f"
  else
    say "FAIL file $f"
    fail=1
  fi
}

say '== current runtime files =='
check_file README.md
check_file docs/project-manifest.md
check_file src/character-runtime.html
check_file src/mascot-debug.html
check_file src/styles.css
check_file src/state.js
check_file src/generated/display-contract.js
check_file src/mascot/states.js
check_file src/mascot/app.js
check_file src/mascot/SOURCE-LICENSE.md
check_file scripts/hermes-display
check_file scripts/hermes_display_server.py
check_file scripts/xsession-minix-kiosk.sh
check_file scripts/serve-preview.sh
check_file deploy/systemd-user/hermes-personal-display-preview.service
check_file deploy/systemd-user/hermes-personal-display-kiosk.service
check_file deploy/systemd-user/hermes-personal-display.env.example
check_file docs/systemd-user-units.md
check_file docs/minix-sf10t-bringup.md

say '== syntax =='
node --check src/state.js
node --check src/mascot/states.js
node --check src/mascot/app.js
node --check scripts/check-adopted-stack.js
node --check scripts/check-client-avatar-event-validator.js
node --check scripts/check-kiosk-recommendation-regressions.js
python3 -m py_compile scripts/hermes_display_server.py scripts/avatar_event_bus.py scripts/display_state/*.py scripts/generated/display_contract.py
bash -n scripts/hermes-display
bash -n scripts/serve-preview.sh
bash -n scripts/xsession-minix-kiosk.sh
bash -n scripts/detect-display-env.sh
bash -n scripts/install-user-units.sh
bash -n scripts/bring-up-minix-sf10t.sh

say '== package gates =='
npm test
npm run check:client-events
npm run check:kiosk
npm run check:augury-feed
npm run build

say '== http, if preview server is running =='
python3 - <<'PY' "$BASE_URL"
import json, sys, urllib.request
base=sys.argv[1].rstrip('/') + '/'
paths=[
  'api/hermes-state',
  'src/character-runtime.html?health=1',
  'src/character-runtime.html?kiosk=1&orientation=landscape',
  'src/mascot-debug.html?health=1',
  'src/mascot/states.js',
  'src/mascot/app.js',
]
for p in paths:
    try:
        with urllib.request.urlopen(base+p, timeout=3) as r:
            body = r.read(200)
        print('OK http', r.status, p, r.headers.get('content-length'))
    except Exception as exc:
        print('WARN http unavailable', p, exc)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect)
legacy_redirects = {
  'src/character-runtime-v2.html?kiosk=1&legacy-check=1': 'src/character-runtime.html?kiosk=1&legacy-check=1',
  'src/mascot-v2-debug.html?health=1': 'src/mascot-debug.html?health=1',
}
for old_path, new_path in legacy_redirects.items():
    try:
        opener.open(base + old_path, timeout=3)
        print('WARN legacy redirect followed unexpectedly', old_path)
    except urllib.error.HTTPError as exc:
        location = exc.headers.get('Location') or ''
        expected = '/' + new_path
        if exc.code == 302 and location == expected:
            print('OK legacy redirect', old_path, '->', location)
        else:
            print('WARN legacy redirect mismatch', old_path, exc.code, location, 'expected', expected)
    except Exception as exc:
        print('WARN legacy redirect unavailable', old_path, exc)
PY

exit "$fail"
