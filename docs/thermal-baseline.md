# Thermal baseline: MINIX kiosk no-visible-change optimization

Date accepted: 2026-05-27

Brian observed a sustained 3-5°C temperature improvement over multiple days with this configuration and accepted it as the new baseline.

## Baseline display contract

The Hermes Personal Display remains visually unchanged:

- physical display: MINIX/SF10T on `DP-2`
- mode: `1920x1280`
- rotation: `inverted`
- primary output: `DP-2`
- refresh/FPS/effects: unchanged
- `DP-1`: connected but inactive by default during kiosk operation

## Baseline changes

### Opt-in NUC kiosk CPU cap

The accepted kiosk thermal policy for the Intel NUC is:

- `intel_pstate/max_perf_pct=85`
- `intel_pstate/no_turbo=0` (turbo remains available inside the capped envelope)
- `intel_pstate/min_perf_pct` is left to the host default
- DP-2 remains `1920x1280` inverted at `60 Hz`
- Chromium GPU-raster/zero-copy/OOP-raster flags and visual effects remain unchanged

This is a host-specific, opt-in operational policy for the NUC kiosk. It must not be silently enabled by generic installs or public-demo setup scripts.

The deployable unit template is checked in at:

```text
deploy/systemd-system/hermes-nuc-thermal-policy.service
```

Install/enable only on the Hermes NUC after capturing a before snapshot:

```bash
cd <repo>
sensors | grep -E 'Package id 0|Core 0|Core 1|pch|temp1'
cat /sys/devices/system/cpu/intel_pstate/max_perf_pct
cat /sys/devices/system/cpu/intel_pstate/no_turbo
scripts/hermes-display verify

sudo install -o root -g root -m 0644 \
  deploy/systemd-system/hermes-nuc-thermal-policy.service \
  /etc/systemd/system/hermes-nuc-thermal-policy.service
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-nuc-thermal-policy.service

cat /sys/devices/system/cpu/intel_pstate/max_perf_pct
cat /sys/devices/system/cpu/intel_pstate/no_turbo
scripts/hermes-display verify
```

Expected accepted runtime: CPU package temperature steady around the mid-to-high 60s °C for the `concept-b-thermal-hotpath3` kiosk build, with CPU max performance capped at 85%, DP-2 still `1920x1280` inverted, and no visible regression in motion/visual direction.

Rollback:

```bash
sudo systemctl disable --now hermes-nuc-thermal-policy.service
cat /sys/devices/system/cpu/intel_pstate/max_perf_pct  # expected: 100
cat /sys/devices/system/cpu/intel_pstate/no_turbo       # expected: 0
scripts/hermes-display verify
```

### DP-1 disabled by default

`/scripts/xsession-minix-kiosk.sh` now disables the unused `DP-1` output unless explicitly overridden:

```bash
PERSONAL_DISPLAY_ENABLE_DP1=1
```

This keeps the 4K `DP-1` output from being driven during normal kiosk operation while preserving a reversible opt-in escape hatch.

### Chromium kiosk flags

The accepted Chromium flag baseline is checked in at:

```text
deploy/systemd-system/hermes-personal-display-minix-chromium-flags.conf
```

The active host drop-in path is:

```text
/etc/systemd/system/hermes-personal-display-minix.service.d/20-chromium-flags.conf
```

Install/update it with:

```bash
sudo install -o root -g root -m 0644 \
  deploy/systemd-system/hermes-personal-display-minix-chromium-flags.conf \
  /etc/systemd/system/hermes-personal-display-minix.service.d/20-chromium-flags.conf
sudo systemctl daemon-reload
sudo systemctl restart hermes-personal-display-minix.service
```

Flags intentionally do not cap FPS, lower refresh rate, lower resolution, or reduce visual effects. They bias Chromium toward GPU raster/zero-copy/OOP raster and disable irrelevant browser background/update services for this single-purpose kiosk.

## Verification commands

```bash
cd <repo>
./scripts/hermes-display verify
DISPLAY=:0 xrandr --listmonitors
DISPLAY=:0 xrandr --query | grep -E '^(DP-1|DP-2|HDMI-1)'
pgrep -af '[c]hrom.*character-runtime' | head -n 1
```

Expected state:

- `./scripts/hermes-display verify` passes
- one active monitor, `DP-2`
- `DP-2 connected primary 1920x1280+0+0 inverted`
- `DP-1 connected` with no active mode/position
- Chromium command includes:
  - `--enable-gpu-rasterization`
  - `--enable-zero-copy`
  - `--enable-oop-rasterization`
  - `--force-device-scale-factor=1`

## Rollback

To roll back only the Chromium flags:

```bash
sudo rm /etc/systemd/system/hermes-personal-display-minix.service.d/20-chromium-flags.conf
sudo systemctl daemon-reload
sudo systemctl restart hermes-personal-display-minix.service
DISPLAY=:0 xrandr --output DP-2 --mode 1920x1280 --rotate inverted --primary --pos 0x0 --output DP-1 --off
./scripts/hermes-display verify
```

To temporarily re-enable `DP-1`, set `PERSONAL_DISPLAY_ENABLE_DP1=1` in the service environment and restart the kiosk.

## Public repo note

Do not commit raw thermal logs, screenshots, agent transcripts, or local process dumps. Keep only curated summaries and deployable config because this repository may become public.
