# Hardware Intake Checklist - 3.5 inch Hermes Personal Display

Target device: Amazon ASIN `B0BLSQG7F7`, marketed as a 3.5 inch USB PC sensor panel, 320x480 IPS, Linux/Raspberry Pi compatible.

Purpose: identify how Linux exposes the monitor when it arrives, without installing vendor software, drivers, kernel modules, or making display configuration changes before Brian approves.

Safety constraints:

- Read-only discovery only during intake.
- Do not run vendor scripts, AppImages, binaries, installers, kernel module builds, udev rule installers, or `sudo make install`.
- Do not change bootloader, kernel, X11, Wayland, systemd, udev, DRM, framebuffer, or GPU config during initial intake.
- Do not expose any dashboard or display service to the WAN.
- Do not capture or display secrets, tokens, `.env` values, private keys, cookies, or credentials.

## Quick BLUF decision tree

1. Plug in the monitor.
2. If a new display output appears in `xrandr`, `kscreen-doctor`, `wlr-randr`, or DRM connector listings:
   - Treat it as a normal display.
   - Next work: configure 320x480 portrait kiosk/render target.
3. Else if a new `/dev/fb*` device appears or `dmesg` shows `fb`, `fbcon`, `tinyfb`, `fbtft`, `drm`, or `udl` activity:
   - Treat it as framebuffer/DRM-like.
   - Next work: test rendering to that framebuffer only after approval.
4. Else if new `/dev/hidraw*`, `/dev/ttyACM*`, `/dev/ttyUSB*`, or USB HID/serial interfaces appear:
   - Treat it as a vendor-protocol panel.
   - Next work: identify protocol safely before sending bytes.
5. Else if it appears as USB mass storage or composite device only:
   - Treat it as theme-upload/vendor-device mode.
   - Next work: inspect mounted read-only contents if any, then research software/protocol.
6. If nothing new appears:
   - Try a known-good USB data cable and direct NUC port, not a charge-only cable or passive hub.

## Before plugging it in

Capture baseline state so changes are obvious.

```bash
mkdir -p ~/hardware-intake/hermes-display
cd ~/hardware-intake/hermes-display

# Timestamp for file names.
TS=$(date +%Y%m%d-%H%M%S)

# Baseline USB and device nodes.
lsusb -t | tee "${TS}-before-lsusb-tree.txt"
lsusb | tee "${TS}-before-lsusb.txt"
find /dev -maxdepth 1 \( -name 'fb*' -o -name 'hidraw*' -o -name 'ttyACM*' -o -name 'ttyUSB*' -o -name 'video*' \) -printf '%p %TY-%Tm-%Td %TH:%TM:%TS\n' 2>/dev/null | sort | tee "${TS}-before-devnodes.txt"

# Baseline kernel-visible graphics/sysfs state.
find /sys/class/drm -maxdepth 2 -type f \( -name status -o -name modes -o -name enabled -o -name edid \) -print 2>/dev/null | sort | tee "${TS}-before-drm-files.txt"
for f in /sys/class/drm/card*-*/status /sys/class/drm/card*-*/modes /sys/class/drm/card*-*/enabled; do
  [ -e "$f" ] && echo "--- $f" && cat "$f"
done | tee "${TS}-before-drm-status.txt"

# Baseline session/display context.
printf 'XDG_SESSION_TYPE=%s\nWAYLAND_DISPLAY=%s\nDISPLAY=%s\n' "$XDG_SESSION_TYPE" "$WAYLAND_DISPLAY" "$DISPLAY" | tee "${TS}-before-session.txt"

# Baseline display tools. Some may not be installed; failures are acceptable.
command -v xrandr >/dev/null && xrandr --query | tee "${TS}-before-xrandr.txt" || true
command -v kscreen-doctor >/dev/null && kscreen-doctor -o | tee "${TS}-before-kscreen-doctor.txt" || true
command -v wlr-randr >/dev/null && wlr-randr | tee "${TS}-before-wlr-randr.txt" || true
```

Expected observations before plug-in:

- Existing USB devices only.
- Existing display connectors only.
- Existing framebuffer/HID/serial device nodes only.
- One of `DISPLAY` or `WAYLAND_DISPLAY` may be empty if this is a headless/SSH context. That is not an error.

## Plug-in procedure

1. Photograph the device, cable, connector, and any included paperwork before connecting.
2. Use a known data-capable USB cable.
3. Prefer a direct NUC USB port for first detection, not a hub.
4. Start a live kernel log in one terminal.
5. Plug in the monitor.
6. Wait 10-20 seconds.
7. Capture after-state commands below.

Live kernel log:

```bash
sudo dmesg --follow --human
```

If avoiding `sudo`, use:

```bash
dmesg --follow --human
```

If non-root access is restricted, capture the error and continue with `lsusb` and `/dev` checks.

## After plugging it in

Run this in the same intake directory.

```bash
cd ~/hardware-intake/hermes-display
TS=$(date +%Y%m%d-%H%M%S)

# USB identity and topology.
lsusb | tee "${TS}-after-lsusb.txt"
lsusb -t | tee "${TS}-after-lsusb-tree.txt"

# Kernel messages from this boot. Review around the plug-in time.
dmesg --human | tail -n 200 | tee "${TS}-after-dmesg-tail.txt"

# New likely device nodes.
find /dev -maxdepth 1 \( -name 'fb*' -o -name 'hidraw*' -o -name 'ttyACM*' -o -name 'ttyUSB*' -o -name 'video*' \) -printf '%p %TY-%Tm-%Td %TH:%TM:%TS\n' 2>/dev/null | sort | tee "${TS}-after-devnodes.txt"

# Display/session context.
printf 'XDG_SESSION_TYPE=%s\nWAYLAND_DISPLAY=%s\nDISPLAY=%s\n' "$XDG_SESSION_TYPE" "$WAYLAND_DISPLAY" "$DISPLAY" | tee "${TS}-after-session.txt"

# Normal desktop display detection.
command -v xrandr >/dev/null && xrandr --query | tee "${TS}-after-xrandr.txt" || true
command -v kscreen-doctor >/dev/null && kscreen-doctor -o | tee "${TS}-after-kscreen-doctor.txt" || true
command -v wlr-randr >/dev/null && wlr-randr | tee "${TS}-after-wlr-randr.txt" || true

# DRM connector status and advertised modes.
for f in /sys/class/drm/card*-*/status /sys/class/drm/card*-*/modes /sys/class/drm/card*-*/enabled; do
  [ -e "$f" ] && echo "--- $f" && cat "$f"
done | tee "${TS}-after-drm-status.txt"

# Framebuffer details, if any.
for fb in /sys/class/graphics/fb*; do
  [ -e "$fb" ] || continue
  echo "--- $fb"
  for f in name virtual_size modes mode stride bits_per_pixel blank; do
    [ -e "$fb/$f" ] && printf '%s: ' "$f" && cat "$fb/$f"
  done
done | tee "${TS}-after-framebuffers.txt"

# HID and serial identity clues.
for h in /sys/class/hidraw/hidraw*/device/uevent; do
  [ -e "$h" ] && echo "--- $h" && cat "$h"
done | tee "${TS}-after-hidraw-uevents.txt"

for t in /sys/class/tty/ttyACM* /sys/class/tty/ttyUSB*; do
  [ -e "$t" ] || continue
  echo "--- $t"
  readlink -f "$t/device" || true
  [ -e "$t/device/uevent" ] && cat "$t/device/uevent"
done | tee "${TS}-after-serial-uevents.txt"
```

Expected observations after plug-in:

- `lsusb` should show at least one new USB device unless the cable/port/device is bad.
- `dmesg` should show vendor ID, product ID, interface classes, and driver binding attempts.
- One of these likely paths should change:
  - normal display connector or DRM output;
  - framebuffer node;
  - HID raw node;
  - serial node;
  - mass storage or composite USB device.

## Compare before and after

```bash
cd ~/hardware-intake/hermes-display

# Replace file names with the actual timestamped before/after files.
diff -u *-before-lsusb.txt *-after-lsusb.txt || true
diff -u *-before-lsusb-tree.txt *-after-lsusb-tree.txt || true
diff -u *-before-devnodes.txt *-after-devnodes.txt || true
diff -u *-before-drm-status.txt *-after-drm-status.txt || true
```

Also identify new vendor/product IDs:

```bash
# Example manual follow-up once a new VID:PID is known from lsusb.
lsusb -d VENDOR:PRODUCT -v | tee "vidpid-detail.txt"
```

Use the actual hex values, for example `1234:abcd`. Do not paste arbitrary values.

## Evidence and photos to capture

Capture these before any configuration changes:

- Product box front/back and model stickers.
- Device front/back, connector side, buttons/switches if any.
- Cable included with device.
- Any paper manual, QR code, download URL, driver/software URL, GitHub link, vendor name, or Windows utility name.
- A photo of the screen immediately after plug-in:
  - blank/backlight only;
  - logo/splash screen;
  - default sensor theme;
  - mirrored desktop;
  - error/no signal;
  - USB mode prompt.
- A screenshot or copy of terminal output from:
  - `lsusb`;
  - `dmesg` around plug-in;
  - display command outputs;
  - new `/dev` nodes.

Do not include private tokens, private IPs beyond local troubleshooting need, `.env` content, or unrelated terminal history in shared screenshots.

## Path A - Normal display output

Indicators:

- New output appears in `xrandr --query`, `kscreen-doctor -o`, `wlr-randr`, or `/sys/class/drm/card*-*/status`.
- Advertised mode includes `320x480`, `480x320`, or another small panel mode.
- `dmesg` mentions DRM, DisplayLink/UDL, USB graphics, or a new connector.

Read-only confirmation commands:

```bash
xrandr --query
kscreen-doctor -o
wlr-randr
for f in /sys/class/drm/card*-*/status /sys/class/drm/card*-*/modes; do [ -e "$f" ] && echo "--- $f" && cat "$f"; done
```

Expected observations:

- Connector state changes from `disconnected` to `connected`, or a new connector appears.
- Modes list includes the panel resolution or close variant.
- Orientation is probably landscape by default even if the physical target is portrait.

Decision:

- If this path is confirmed, next implementation should use a normal display target.
- Candidate runtime: local browser kiosk, Pygame/SDL window, or Wayland/X11 full-screen app sized to 320x480.
- Rotation should be configured only after approval, using the display stack appropriate to the live session.

Do not run during intake without approval:

```bash
# Examples of changes to avoid until approved:
xrandr --output OUTPUT --rotate right
kscreen-doctor output.OUTPUT.rotation.right
wlr-randr --output OUTPUT --transform 90
```

## Path B - Framebuffer or DRM framebuffer device

Indicators:

- New `/dev/fbN` appears.
- `/sys/class/graphics/fbN/name` identifies a USB/display/framebuffer driver.
- `dmesg` mentions framebuffer, `fbcon`, `fbtft`, `tinyfb`, `udlfb`, or similar.
- No normal desktop display output appears.

Read-only confirmation commands:

```bash
find /dev -maxdepth 1 -name 'fb*' -printf '%p %TY-%Tm-%Td %TH:%TM:%TS\n' 2>/dev/null | sort
for fb in /sys/class/graphics/fb*; do
  [ -e "$fb" ] || continue
  echo "--- $fb"
  for f in name virtual_size modes mode stride bits_per_pixel blank; do
    [ -e "$fb/$f" ] && printf '%s: ' "$f" && cat "$fb/$f"
  done
done
dmesg --human | grep -Ei 'fb|framebuffer|fbtft|tinyfb|udl|displaylink|drm' | tail -n 80
```

Expected observations:

- New framebuffer node, often with a mode or virtual size.
- Resolution might be `320,480`, `480,320`, or a larger backing buffer.

Decision:

- If this path is confirmed, next implementation should test framebuffer-safe rendering in a separate approved task.
- Candidate runtime: Pygame/SDL with framebuffer target, direct framebuffer image blit, or a small compositor depending on driver.

Do not run during intake without approval:

```bash
# These write pixels or alter display state; save them for approved bring-up.
cat image.raw > /dev/fb1
fbi -d /dev/fb1 test.png
FRAMEBUFFER=/dev/fb1 python renderer.py
```

## Path C - HID or serial vendor protocol

Indicators:

- New `/dev/hidrawN`, `/dev/ttyACMN`, or `/dev/ttyUSBN` appears.
- `lsusb -t` shows HID, CDC ACM, vendor-specific, or composite interfaces.
- `dmesg` mentions `hid-generic`, `cdc_acm`, `usbserial`, or vendor-specific interface binding.
- No normal display output or framebuffer appears.

Read-only confirmation commands:

```bash
lsusb
lsusb -t
find /dev -maxdepth 1 \( -name 'hidraw*' -o -name 'ttyACM*' -o -name 'ttyUSB*' \) -printf '%p %TY-%Tm-%Td %TH:%TM:%TS\n' 2>/dev/null | sort
for h in /sys/class/hidraw/hidraw*/device/uevent; do [ -e "$h" ] && echo "--- $h" && cat "$h"; done
for t in /sys/class/tty/ttyACM* /sys/class/tty/ttyUSB*; do [ -e "$t" ] && echo "--- $t" && readlink -f "$t/device" && [ -e "$t/device/uevent" ] && cat "$t/device/uevent"; done
```

Expected observations:

- VID:PID and interface type are visible.
- Device may expose one control interface and one data interface.
- The screen may show a default theme but not act as a Linux display.

Decision:

- If this path is confirmed, treat it as protocol research before implementation.
- Search for the VID:PID, vendor name, product string, and Windows utility name.
- Prefer open-source Linux projects or protocol docs over vendor binaries.
- Do not send arbitrary bytes to HID/serial endpoints until protocol is known.

Do not run during intake without approval:

```bash
# Avoid blind writes/probes.
echo test > /dev/ttyACM0
cat firmware.bin > /dev/hidraw0
python random-usb-test.py
```

## Path D - USB mass storage or vendor theme-upload mode

Indicators:

- New block device appears in `lsblk`.
- Desktop auto-mounts a drive.
- Device contains theme files, Windows software, docs, or config.
- `lsusb -t` shows mass storage.

Read-only confirmation commands:

```bash
lsusb -t
lsblk -o NAME,PATH,MODEL,SIZE,FSTYPE,FSVER,LABEL,MOUNTPOINTS,TRAN,TYPE
findmnt
```

If auto-mounted, read-only inspection only:

```bash
# Replace /path/to/mount with actual mountpoint.
find /path/to/mount -maxdepth 2 -type f -printf '%p\n' | sort | tee mounted-files.txt
```

Expected observations:

- Vendor theme/config files or software payloads may be present.
- It may require a separate tool to upload images/themes rather than being a real display.

Decision:

- If this path is confirmed, copy only filenames and documentation metadata into intake notes.
- Do not execute bundled software.
- Next work should research the software/protocol and whether an open-source Linux-compatible renderer exists.

## Resolution and rotation checks

Goal: confirm whether the actual render target is `320x480` portrait, `480x320` landscape, or something else.

Normal display output:

```bash
xrandr --query | sed -n '/ connected/,/ disconnected/p'
kscreen-doctor -o
wlr-randr
for f in /sys/class/drm/card*-*/modes; do [ -e "$f" ] && echo "--- $f" && cat "$f"; done
```

Framebuffer output:

```bash
for fb in /sys/class/graphics/fb*; do
  [ -e "$fb" ] || continue
  echo "--- $fb"
  [ -e "$fb/virtual_size" ] && cat "$fb/virtual_size"
  [ -e "$fb/modes" ] && cat "$fb/modes"
  [ -e "$fb/mode" ] && cat "$fb/mode"
done
```

Expected observations:

- Portrait-native: `320x480` or virtual size `320,480`.
- Landscape-native: `480x320` or virtual size `480,320`; renderer may rotate content or display stack may rotate output.
- Weird backing buffer: document exactly; do not assume scaling behavior.

Decision:

- Use portrait-first UI assets if the target is `320x480` or easily rotated.
- If native landscape and rotation is expensive or unsupported, consider landscape UI variant before forcing system-level rotation.

## Intake report template

Create a short report at `~/hardware-intake/hermes-display/intake-summary.md`.

```markdown
# Hermes 3.5 inch display intake summary

Date:
Operator:
Device/model/ASIN:
Cable/port used:

## Physical evidence

- Photos captured:
- Manual/vendor URLs:
- Buttons/switches/connectors:

## Linux detection

- New USB VID:PID:
- Product/vendor string:
- `lsusb -t` interface classes:
- Relevant `dmesg` lines:
- New `/dev` nodes:

## Display path decision

Selected path:
- [ ] Normal display output
- [ ] Framebuffer/DRM framebuffer
- [ ] HID/serial vendor protocol
- [ ] Mass storage/theme upload mode
- [ ] Not detected

Evidence for decision:

## Resolution/orientation

- Observed mode/resolution:
- Portrait/landscape:
- Rotation support evidence:

## Risks/gotchas

- Driver/vendor software concerns:
- Permissions/access concerns:
- Stability concerns:

## Recommended next task

- Proposed assignee/profile:
- Scope:
- Commands/config changes needing approval:
```

## Approval gates after intake

Ask Brian before any of the following:

- Installing vendor software, display drivers, kernel modules, udev rules, or package repositories.
- Running binaries from the device, QR-code site, vendor zip, forum post, or GitHub repo.
- Changing display rotation, X11/Wayland config, boot config, systemd services, udev permissions, or group membership.
- Writing to `/dev/fb*`, `/dev/hidraw*`, `/dev/ttyACM*`, `/dev/ttyUSB*`, or mounted device storage.
- Exposing a display dashboard beyond localhost/trusted LAN.

## Recommended next card after hardware arrives

Title: `display: run hardware intake and classify 3.5 inch monitor path`

Scope:

- Run this checklist.
- Attach/copy intake summary and command outputs.
- Decide normal display vs framebuffer vs HID/serial/vendor protocol.
- Recommend the smallest safe bring-up path.
- Do not install or change drivers/config without explicit approval.
