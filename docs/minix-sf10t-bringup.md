# MINIX SF10T bring-up plan

Date prepared: 2026-05-16
Target hardware: MINIX SF10T 10.5" portable touchscreen monitor
Amazon short link provided by Brian: https://a.co/d/02asRjP3

## BLUF

The MINIX SF10T should let the Hermes display move back to the preferred **browser kiosk** path instead of the temporary proprietary USB-panel renderer.

Target mode for Hermes:

- Physical orientation: **portrait** if the stand/cabling allows it
- OS logical resolution: **1280×1920**
- Browser runtime: `http://127.0.0.1:8770/src/character-runtime-v2.html?kiosk=1`
- Renderer: Chromium kiosk, not Python USB framebuffer

## Verified product facts

From Amazon / MINIX product pages:

- Size: **10.5 inch**
- Panel: IPS
- Native resolution: **1920×1280**
- Aspect ratio: **15:10**
- Brightness: **up to 400 cd/m²**
- Contrast: **1500:1**
- Touch: 10-point capacitive
- Ports:
  - 2× full-featured USB-C
  - 1× Mini HDMI
  - 1× Micro USB 2.0 peripheral port
  - 1× 3.5mm audio
- Power/PD:
  - USB-C PD input up to **65W**
  - USB-C PD output up to **47W** when externally powered
- Mounting:
  - magnetic stand / smart cover
  - 75mm dual-hole VESA support
- Box includes:
  - monitor
  - magnetic mount
  - HDMI to Mini-HDMI cable
  - USB-C to USB-C video cable
  - USB-C to USB-C power cable
  - Micro USB to USB-A cable
  - 20V/1.5A power adapter

## NUC compatibility notes

The Hermes host is an Intel NUC7i5BNH. Public specs indicate:

- HDMI 2.0 output
- USB-C / Thunderbolt 3 port with DisplayPort 1.2 support

Preferred first test:

1. Connect one USB-C cable from the NUC USB-C/TB3 port to a full-featured USB-C port on the MINIX.
2. If the monitor powers on and appears as a display, use single-cable USB-C.
3. If single-cable mode is unstable or underpowered, use:
   - NUC HDMI → MINIX Mini-HDMI for video
   - NUC USB-A/USB-C → MINIX USB-C for 5V/PD power
4. Use the included wall adapter only if NUC bus power is not enough.

## Prepared local changes

Already prepared in this project:

- Kiosk CSS now scales the 320×480 runtime to fill the viewport while preserving the 2:3 portrait aspect ratio.
- `scripts/launch-kiosk.sh` now accepts:
  - `PERSONAL_DISPLAY_WINDOW_SIZE`, default `1280,1920`
  - `PERSONAL_DISPLAY_CHROME_ARGS`, optional extra Chromium flags
- `deploy/systemd-user/hermes-personal-display.env.example` now includes MINIX portrait defaults.
- `scripts/bring-up-minix-sf10t.sh` exists as a dry-run-first helper.

## Tuesday physical bring-up checklist

### 1. Connect hardware

Try in this order:

1. **USB-C single cable** from NUC USB-C/TB3 to MINIX full-featured USB-C.
2. If no signal or power cycling: **HDMI + USB power**.
3. If still unstable: HDMI + included MINIX power adapter.

### 2. Detect display/session

Run from Hermes project root:

```bash
cd <project-root>
./scripts/bring-up-minix-sf10t.sh
```

This is dry-run by default. It writes:

```text
docs/runtime-artifacts/minix-sf10t-display-env-report.txt
```

### 3. Identify output name

Use whichever tool works in the live graphical session:

```bash
xrandr --query
wlr-randr
```

Likely output names may be `HDMI-1`, `DP-1`, `DP-2`, or similar.

### 4. Rotate to portrait

For X11, example only:

```bash
xrandr --output HDMI-1 --mode 1920x1280 --rotate left
```

For Wayland/wlroots, example only:

```bash
wlr-randr --output HDMI-A-1 --transform 90
```

Do not hard-code these names before live detection.

### 5. Update kiosk env

Edit:

```bash
~/.config/hermes-personal-display.env
```

Minimum expected values:

```bash
PERSONAL_DISPLAY_URL=http://127.0.0.1:8770/src/character-runtime-v2.html?kiosk=1
PERSONAL_DISPLAY_WINDOW_SIZE=1280,1920
# DISPLAY=:0
# WAYLAND_DISPLAY=wayland-0
```

Set only the display/session variables that are actually present.

### 6. Start the real kiosk

Only after the MINIX display is visible to Linux:

```bash
cd <project-root>
DRY_RUN=0 ./scripts/bring-up-minix-sf10t.sh
```

This will:

- keep/start `hermes-personal-display-preview.service`
- enable/start `hermes-personal-display-kiosk.service`

### 7. Validate physically

Do not call it done until the actual screen shows:

- live animated mascot motion
- current time, not a stale timestamp
- full-screen/near-full-screen portrait composition
- no browser controls/chrome
- stable output after 10+ minutes

## Risks and mitigations

### USB-C single-cable may not supply enough power

Mitigation: use HDMI video plus USB-C power from a stronger port/adapter. The monitor still avoids proprietary USB framebuffer hacks.

### Touch and portrait rotation may disagree

Mitigation: ignore touch for MVP. If touch is needed later, calibrate after display rotation.

### Browser kiosk may open on the wrong monitor

Mitigation: detect the output name first, then use OS display arrangement/primary output settings before enabling kiosk.

### Runtime may look too sparse at 10.5 inches

Mitigation: the current CSS scales cleanly. If it feels empty, next iteration should enlarge/recompose the mascot for 1280×1920 instead of stretching the old USB-panel layout forever.

## Rollback

To stop the kiosk while keeping the preview server available:

```bash
systemctl --user stop hermes-personal-display-kiosk.service
```

To recover the live NUC display, prefer the service-aware helper:

```bash
hermes-display fix
hermes-display verify
```
