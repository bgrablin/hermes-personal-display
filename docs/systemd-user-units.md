# systemd units for Hermes personal display

These checked-in templates are the recovery source for the preview server, user-session kiosk prep, watchdog timers, and the live MINIX/SF10T system kiosk.

## Checked-in files

User units:

- `deploy/systemd-user/hermes-personal-display-preview.service`
- `deploy/systemd-user/hermes-personal-display-kiosk.service`
- `deploy/systemd-user/hermes-route-rail-refresh.service`
- `deploy/systemd-user/hermes-route-rail-refresh.timer`
- `deploy/systemd-user/hermes-display-telemetry-watchdog.service`
- `deploy/systemd-user/hermes-display-telemetry-watchdog.timer`
- `deploy/systemd-user/hermes-personal-display.env.example`
- `scripts/install-user-units.sh`
- `scripts/detect-display-env.sh`

System units:

- `deploy/systemd-system/hermes-personal-display-minix.service`
- `deploy/systemd-system/hermes-personal-display-minix.service.d/10-augury.conf`
- `deploy/systemd-system/hermes-personal-display-minix.service.d/20-chromium-flags.conf`
- `deploy/systemd-system/hermes-nuc-thermal-policy.service`

## Runtime paths

- Preview server: `scripts/serve-preview.sh` serves the repo on `127.0.0.1:8770` by default.
- Legacy/user-session kiosk prep unit: `deploy/systemd-user/hermes-personal-display-kiosk.service` runs `scripts/launch-kiosk.sh` and is for desktop-session/pre-monitor testing.
- Live physical MINIX/SF10T kiosk: `deploy/systemd-system/hermes-personal-display-minix.service` runs `startx scripts/xsession-minix-kiosk.sh` on tty7. This is the service-controlled deployment used by `scripts/hermes-display`.

Do not confuse `launch-kiosk.sh` with the live `xsession-minix-kiosk.sh` path. The current physical deployment uses the system unit and X session script.

## Safe user-unit install workflow

1. From the graphical session or the NUC shell, inspect display/audio candidates:

   ```bash
   ./scripts/detect-display-env.sh .review-tmp/display-env-report.txt
   ```

2. Install user unit templates and the env template:

   ```bash
   ./scripts/install-user-units.sh
   ```

3. Edit `~/.config/hermes-personal-display.env` if the auto-detected defaults are wrong:

   ```text
   PERSONAL_DISPLAY_OUTPUT=DP-2
   PERSONAL_DISPLAY_OUTPUT_MODE=1920x1280
   PERSONAL_DISPLAY_OUTPUT_ROTATE=inverted
   PERSONAL_DISPLAY_OUTPUT_POS=0x0
   PERSONAL_DISPLAY_AUDIO_SINK=alsa_output.pci-0000_00_1f.3.hdmi-stereo
   PERSONAL_DISPLAY_AUDIO_VOLUME=90%
   HERMES_DISPLAY_COPILOT_ACCOUNT=github-login
   HERMES_DISPLAY_COPILOT_PLAN=pro
   ```

   The route-rail refresh unit loads this file. Copilot headroom uses GitHub's
   read-only billing API and needs either an existing `gh` login with billing
   access or a protected Hermes token with personal `Plan: read` permission.
   Keep tokens out of `~/.config/hermes-personal-display.env`, which is not a
   secret store. This collector intentionally supports only the personal user
   endpoint. Organization and enterprise billing require different endpoints
   and permissions and are not represented as personal headroom. If consumption
   is confirmed but no valid individual limit is available, the rail shows
   credits used without inventing remaining percentage headroom.

4. Enable the user timers/services as needed:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now hermes-personal-display-preview.service
   systemctl --user enable --now hermes-route-rail-refresh.timer hermes-display-telemetry-watchdog.timer
   ```

## System kiosk recovery install

The live kiosk unit is system-level because it owns tty7/startx and conflicts with the display manager. The checked-in `hermes-personal-display-minix.service` is a template containing `@PROJECT_ROOT@`, `@USER@`, `@HOME@`, and `@UID@`; do not copy it directly into `/etc/systemd/system`. To restore it on the NUC, render/install it with the helper:

```bash
./scripts/install-system-unit.sh
sudo install -m 0644 deploy/systemd-system/hermes-nuc-thermal-policy.service /etc/systemd/system/hermes-nuc-thermal-policy.service
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-nuc-thermal-policy.service
sudo systemctl restart hermes-personal-display-minix.service
./scripts/hermes-display verify
```

Machine-specific display/audio choices belong in `~/.config/hermes-personal-display.env`; the scripts fall back to auto-detection where possible.

### Optional terminal renderer

The system kiosk defaults to the Chromium character runtime. To select the
terminal renderer, set these host-specific values in the local env file before
restarting the system kiosk:

```text
PERSONAL_DISPLAY_RENDERER=herdr-monitor
PERSONAL_DISPLAY_HEALTH_MONITOR=/path/to/read-only-health-monitor
PERSONAL_DISPLAY_BTOP_CONFIG=/path/to/btop.conf
```

The renderer starts one fullscreen Alacritty process and one private tmux
source with btop and the configured health monitor. It does not attach to the
operator's Herdr workspace. `hermes-display verify-render` requires exactly one
managed compositor, its Alacritty window, the private tmux session, the expected
display layout, and non-blank framebuffer pixels. Enabling this renderer is a
deployment change and still requires physical-panel verification.

## Verification

After changes:

```bash
npm run build
npm test
./scripts/hermes-display restart
./scripts/hermes-display verify
./scripts/hermes-display screenshot
```

`hermes-display verify` checks the generated build id, canonical Chromium URL, configured display output geometry, audio sink/volume, and Intel p-state thermal policy (`max_perf_pct` target defaults to 80 on the Hermes NUC kiosk baseline).
