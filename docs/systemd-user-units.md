# systemd user units for future physical display deployment

These are now checked-in templates. Do not enable the kiosk unit until the monitor path and graphical session variables are verified on the live host.

## Checked-in files

- `deploy/systemd-user/hermes-personal-display-preview.service`
- `deploy/systemd-user/hermes-personal-display-kiosk.service`
- `deploy/systemd-user/hermes-personal-display.env.example`
- `scripts/install-user-units.sh`
- `scripts/detect-display-env.sh`

## What changed

- The runtime page now supports `?kiosk=1`, which hides the control panel and renders only the 320×480 display surface.
- `scripts/launch-kiosk.sh` now fails fast if no `DISPLAY` or `WAYLAND_DISPLAY` is present.
- The checked-in kiosk unit loads its session-specific variables from `%h/.config/hermes-personal-display.env` instead of hard-coding them.

## Safe prep workflow

1. From the graphical desktop session that will own the tiny monitor, run:

   ```bash
   ./scripts/detect-display-env.sh .review-tmp/display-env-report.txt
   ```

2. Review the saved report for:
   - `DISPLAY` or `WAYLAND_DISPLAY`
   - browser candidate path
   - `xrandr` or `wlr-randr` output

3. Install the unit templates into `~/.config/systemd/user/`:

   ```bash
   ./scripts/install-user-units.sh
   ```

4. Edit `~/.config/hermes-personal-display.env` with the detected session values.

5. Validate before enabling:

   ```bash
   ./scripts/verify-project.sh
   systemctl --user daemon-reload
   systemctl --user cat hermes-personal-display-preview.service
   systemctl --user cat hermes-personal-display-kiosk.service
   ```

6. Enable only after the physical display is attached and rendering is proven manually:

   ```bash
   systemctl --user enable --now hermes-personal-display-preview.service
   systemctl --user enable --now hermes-personal-display-kiosk.service
   ```

## Current unit behavior

### Preview server

- Binds to `127.0.0.1:8770` by default; set `PERSONAL_DISPLAY_BIND` locally to expose it on a LAN interface.
- Serves the project directory via `scripts/serve-preview.sh`
- Safe to run before the monitor is attached

### Kiosk launcher

- Opens `http://127.0.0.1:8770/src/character-runtime.html?kiosk=1`
- Requires a real graphical session with either `DISPLAY` or `WAYLAND_DISPLAY`
- Uses Chromium/Chrome auto-detection unless `PERSONAL_DISPLAY_CHROME` is set

## Caveats

- This is still **prep**, not full hardware integration. We have not yet detected the real monitor output on this host.
- The current shell session on Hermes does **not** expose `DISPLAY` or `WAYLAND_DISPLAY`, so kiosk launch is expected to fail here until run from the desktop session or a populated env file.
- Do not hard-code X11/Wayland values into the repo. Keep them in `%h/.config/hermes-personal-display.env`.
