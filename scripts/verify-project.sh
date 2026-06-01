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

say '== files =='
check_file README.md
check_file docs/project-manifest.md
check_file src/character-runtime-v2.html
check_file src/mascot-v2-debug.html
check_file src/mascot-v2/hermes-puppet.svg
check_file src/mascot-v2/states.js
check_file src/mascot-v2/runtime.js
check_file src/mascot-v2/app.js
check_file src/mascot-v2/approval.js
check_file src/mascot-v2/styles.css
check_file src/mascot-v2/SOURCE-LICENSE.md
check_file docs/review-artifacts/mascot-v2-runtime-review.png
check_file docs/review-artifacts/mascot-v2-contact-sheet-review.png
check_file docs/systemd-user-units.md
check_file docs/minix-sf10t-bringup.md
check_file scripts/detect-display-env.sh
check_file scripts/install-user-units.sh
check_file scripts/launch-kiosk.sh
check_file scripts/bring-up-minix-sf10t.sh
check_file deploy/systemd-user/hermes-personal-display-preview.service
check_file deploy/systemd-user/hermes-personal-display-kiosk.service
check_file deploy/systemd-user/hermes-personal-display-usb.service
check_file deploy/systemd-user/hermes-personal-display.env.example

say '== syntax =='
python3 - <<'PY'
import xml.etree.ElementTree as ET
ET.parse('src/mascot-v2/hermes-puppet.svg')
print('OK svg xml src/mascot-v2/hermes-puppet.svg')
PY
node --check src/mascot-v2/states.js
node --check src/mascot-v2/runtime.js
node --check src/mascot-v2/app.js
node --check src/mascot-v2/approval.js
node --check scripts/check-active-work-overflow.js
node --check scripts/check-kiosk-recommendation-regressions.js
node --check scripts/check-puppet-behavior-mapping.js
node --check scripts/check-puppet-layer-recommendations.js
node --check scripts/check-client-avatar-event-validator.js
node --check scripts/check-chatgpt-review-coverage.js
node scripts/check-active-work-overflow.js
node scripts/check-kiosk-recommendation-regressions.js
node scripts/check-puppet-behavior-mapping.js
node scripts/check-puppet-layer-recommendations.js
node scripts/check-client-avatar-event-validator.js
node scripts/check-chatgpt-review-coverage.js
python3 scripts/validate-avatar-event-fixtures.py
python3 scripts/check-avatar-event-bus.py
python3 -m py_compile scripts/hermes_display_server.py scripts/avatar_event_bus.py scripts/validate-avatar-event-fixtures.py scripts/check-avatar-event-bus.py scripts/personality_engine.py
if [[ -f tests/test_display_resolver.py ]]; then
  python3 tests/test_display_resolver.py
else
  python3 - <<'PY'
import json
from pathlib import Path
fixtures = sorted(Path('tests/fixtures/resolver').glob('*.json'))
if not fixtures:
    raise SystemExit('FAIL no resolver fixtures found')
for fixture in fixtures:
    json.loads(fixture.read_text())
print(f'OK resolver fixtures json {len(fixtures)}')
PY
fi
bash -n scripts/serve-preview.sh
bash -n scripts/launch-kiosk.sh
bash -n scripts/detect-display-env.sh
bash -n scripts/install-user-units.sh
bash -n scripts/bring-up-minix-sf10t.sh

say '== http, if preview server is running =='
python3 - <<'PY' "$BASE_URL"
import sys, urllib.request
base=sys.argv[1].rstrip('/') + '/'
paths=[
  'src/character-runtime-v2.html?health=1',
  'src/character-runtime-v2.html?kiosk=1',
  'src/character-runtime-v2.html?kiosk=1&orientation=landscape',
  'src/mascot-v2-debug.html?health=1',
  'src/mascot-v2/hermes-puppet.svg',
  'src/mascot-v2/runtime.js',
  'src/mascot-v2/states.js',
  'docs/review-artifacts/mascot-v2-runtime-review.png',
  'docs/review-artifacts/mascot-v2-contact-sheet-review.png',
]
for p in paths:
    try:
        r=urllib.request.urlopen(base+p, timeout=3)
        print('OK http', r.status, p, r.headers.get('content-length'))
    except Exception as exc:
        print('WARN http unavailable', p, exc)
PY

exit "$fail"
