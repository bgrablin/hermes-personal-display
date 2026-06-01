# Hermes Personal Display

Local Hermes personal display runtime for the Intel NUC-hosted assistant.

## Current decision

The current accepted display direction is the **Concept B optic/instrument** runtime, with the older retro robot path retained only as historical reference:

- Runtime: `src/character-runtime-v2.html`
- Main app: `src/app.js`
- State resolver: `src/state.js`

The current accepted Intel NUC thermal baseline is documented in `docs/thermal-baseline.md`:

- MINIX/SF10T remains on `DP-2` at `1920x1280`, inverted, primary.
- Unused `DP-1` is disabled by default during kiosk operation.
- Conservative Chromium raster/compositor flags are enabled through a systemd drop-in.
- FPS, refresh rate, resolution, and visual effects are not reduced.

Generated review dumps, local screenshots, raw agent transcripts, and exploratory third-party asset packs are intentionally excluded from the repository. Keep durable decisions as short docs, tests, and curated fixtures rather than raw local artifacts.

## Current review pack

Canonical Brian-review references for the accepted retro-robot path:

- Runtime URL: `http://127.0.0.1:8770/src/character-runtime-v2.html`
- Debug/contact-sheet URL: `http://127.0.0.1:8770/src/mascot-v2-debug.html`
- Runtime screenshot artifact: `docs/review-artifacts/mascot-v2-runtime-review.png`
- Contact-sheet screenshot artifact: `docs/review-artifacts/mascot-v2-contact-sheet-review.png` (stitched full-sheet review image covering all 9 stills)
- Provenance note: `src/mascot-v2/SOURCE-LICENSE.md`

The debug/contact sheet is the acceptance artifact for the current 9 stills:

- neutral
- look-left
- look-right
- side-eye-left
- side-eye-right
- thinking
- healthy
- blocked
- night

## Current visual direction

- Classic robot / old AI terminal face inspiration.
- Simple expressive eyes and mouth on a dark face screen.
- Winged helmet retained as the Hermes identity cue.
- No teeth.
- No hands.
- No brown cheek/satchel blob.
- No obvious eyebrow strokes.

## Serve locally

From this directory:

```bash
python3 -m http.server 8770 --bind 127.0.0.1
```

Local review URLs:

- `http://127.0.0.1:8770/src/character-runtime-v2.html`
- `http://127.0.0.1:8770/src/mascot-v2-debug.html`

If Brian is off-subnet, send screenshots instead of URLs.

## Pre-monitor development goals

Before the USB display arrives, we can still finish:

1. Canonical runtime cleanup.
2. Kiosk launch script/template.
3. Health/verification script.
4. Asset and docs organization.
5. State/persona packet contract hardening.
6. Screenshot/contact-sheet workflow for remote review.
7. Monitor-ready env discovery and systemd-user scaffolding.

That review workflow now has stable committed artifact paths under `docs/review-artifacts/`.

## Monitor-ready kiosk prep

Checked-in prep assets now include:

- `scripts/detect-display-env.sh` — captures `DISPLAY` / `WAYLAND_DISPLAY`, browser path candidates, and `xrandr` / `wlr-randr` output.
- `scripts/install-user-units.sh` — installs the checked-in unit files into `~/.config/systemd/user/` and seeds the env file.
- `deploy/systemd-user/hermes-personal-display-preview.service`
- `deploy/systemd-user/hermes-personal-display-kiosk.service`
- `deploy/systemd-user/hermes-personal-display.env.example`
- `docs/minix-sf10t-bringup.md` — Tuesday bring-up plan for the MINIX SF10T 10.5" USB-C/HDMI monitor.
- `scripts/bring-up-minix-sf10t.sh` — dry-run-first helper for detecting the display, stopping the old USB panel renderer, and starting the browser kiosk after env values are confirmed.

The runtime page supports `?kiosk=1`, which hides the control panel and renders only the display surface for the physical monitor.

Current host prep notes:

- `chromium-browser` is installed locally
- `wlr-randr` is installed locally
- Preview defaults to loopback at `127.0.0.1:8770`; override `PERSONAL_DISPLAY_BIND` locally if LAN preview is needed.
- Keep live display/session values in `~/.config/hermes-personal-display.env`, not in the repo.

Do **not** make irreversible hardware/display-driver assumptions until the monitor is physically attached and inspected.
