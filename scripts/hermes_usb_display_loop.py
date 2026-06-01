#!/usr/bin/env python3
import io
import math
import os
import random
import struct
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import usb.core
import usb.util
from PIL import Image, ImageDraw, ImageFont
import cairosvg

SVG_NS = {'svg': 'http://www.w3.org/2000/svg'}
VID = 0x1908
PID = 0x0102
PANEL_W = 480
PANEL_H = 320
PORTRAIT_W = 320
PORTRAIT_H = 480
CBW_SIG = b'USBC'
CSW_SIG = b'USBS'
TAG = 0xDEADBEEF
EP_OUT = 0x01
EP_IN = 0x81
TIMEOUT = 5000
ROOT = Path(__file__).resolve().parents[1]
SVG_PATH = ROOT / 'src/mascot-v2/hermes-puppet.svg'
STATE_FILE = Path.home() / '.hermes/display/state.json'

DEFAULT_FONT = ImageFont.load_default()


def build_cbw(command: bytes, data_len: int, direction: int = 0x00) -> bytes:
    command = command.ljust(16, b'\x00')[:16]
    return (
        CBW_SIG
        + struct.pack('<I', TAG)
        + struct.pack('<I', data_len)
        + bytes([direction, 0, len(command)])
        + command
    )


def blit_cbw(x: int, y: int, w: int, h: int, data_len: int) -> bytes:
    cmd = bytearray(16)
    cmd[0] = 0xCD
    cmd[5] = 0x06
    cmd[6] = 0x12
    struct.pack_into('<H', cmd, 11, x + w - 1)
    struct.pack_into('<H', cmd, 13, y + h - 1)
    return build_cbw(bytes(cmd), data_len, 0x00)


def backlight_cbw(level: int) -> bytes:
    level = max(0, min(7, int(level)))
    cmd = bytearray(16)
    cmd[0] = 0xCD
    cmd[5] = 0x06
    cmd[6] = 0x01
    cmd[7] = 0x01
    cmd[9] = level
    return build_cbw(bytes(cmd), 0, 0x00)


def csw_ok(data: bytes) -> bool:
    return len(data) >= 13 and data[:4] == CSW_SIG and data[12] == 0


def open_dev():
    dev = usb.core.find(idVendor=VID, idProduct=PID)
    if dev is None:
        raise RuntimeError('device not found')
    dev.set_configuration()
    cfg = dev.get_active_configuration()
    intf = cfg[(0, 0)]
    try:
        if dev.is_kernel_driver_active(intf.bInterfaceNumber):
            dev.detach_kernel_driver(intf.bInterfaceNumber)
    except Exception:
        pass
    usb.util.claim_interface(dev, intf.bInterfaceNumber)
    return dev, intf.bInterfaceNumber


def send(dev, payload: bytes = b'', *, cbw: bytes):
    dev.write(EP_OUT, cbw, timeout=TIMEOUT)
    if payload:
        dev.write(EP_OUT, payload, timeout=TIMEOUT)
    csw = bytes(dev.read(EP_IN, 13, timeout=TIMEOUT))
    if not csw_ok(csw):
        raise RuntimeError(f'bad CSW: {csw.hex()}')


def rgb565be(r: int, g: int, b: int) -> bytes:
    value = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    return struct.pack('>H', value)


def image_to_frame(img: Image.Image) -> bytes:
    img = img.convert('RGB').resize((PANEL_W, PANEL_H), Image.LANCZOS)
    buf = bytearray(PANEL_W * PANEL_H * 2)
    idx = 0
    for y in range(PANEL_H):
        for x in range(PANEL_W):
            r, g, b = img.getpixel((x, y))
            buf[idx:idx+2] = rgb565be(r, g, b)
            idx += 2
    return bytes(buf)


def load_state():
    if STATE_FILE.exists():
        try:
            import json
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}


def get_lines():
    state = load_state()
    mood = state.get('mood', 'idle_watchful')
    status_line = state.get('status_line') or 'preview server live · usb panel active'
    quip = state.get('quip') or 'Still here. Mildly judgmental.'
    return mood, status_line[:38], quip[:38]


def build_svg_frame(tick: int, blink: float, gaze_x: float, gaze_y: float, mouth: str):
    tree = ET.parse(SVG_PATH)
    root = tree.getroot()

    for selector in ['.//svg:g[@id="eye-left"]/svg:circle[@class="iris"]', './/svg:g[@id="eye-right"]/svg:circle[@class="iris"]']:
        for node in root.findall(selector, SVG_NS):
            node.set('cx', f'{gaze_x:.2f}')
            node.set('cy', f'{gaze_y:.2f}')
    for selector in ['.//svg:g[@id="eye-left"]/svg:circle[@class="pupil"]', './/svg:g[@id="eye-right"]/svg:circle[@class="pupil"]']:
        for node in root.findall(selector, SVG_NS):
            node.set('cx', f'{gaze_x:.2f}')
            node.set('cy', f'{gaze_y:.2f}')

    lid_top = blink * 18.0
    lid_bottom = -blink * 9.0
    for selector in ['.//svg:g[@id="eye-left"]/svg:path[@class="upper-lid"]', './/svg:g[@id="eye-right"]/svg:path[@class="upper-lid"]']:
        for node in root.findall(selector, SVG_NS):
            node.set('transform', f'translate(0 {lid_top:.2f})')
    for selector in ['.//svg:g[@id="eye-left"]/svg:path[@class="lower-lid"]', './/svg:g[@id="eye-right"]/svg:path[@class="lower-lid"]']:
        for node in root.findall(selector, SVG_NS):
            node.set('transform', f'translate(0 {lid_bottom:.2f})')

    mouth_node = root.find('.//svg:path[@id="mouth"]', SVG_NS)
    mouth_glow = root.find('.//svg:path[@id="mouth-glow"]', SVG_NS)
    if mouth_node is not None:
        mouth_node.set('d', mouth)
    if mouth_glow is not None:
        mouth_glow.set('d', mouth)

    return ET.tostring(root, encoding='unicode')


def render_portrait_frame(tick: int, fps: float) -> Image.Image:
    t = tick / max(fps, 0.1)
    gaze_map = [
        (0.0, 0.0), (0.0, 0.0), (-5.8, 0.2), (-5.8, 0.2),
        (0.0, 0.0), (5.8, 0.2), (5.8, 0.2), (0.0, -0.8),
        (0.0, 0.0), (-9.0, 1.0), (0.0, 0.0), (6.5, 0.8),
    ]
    phase = int(t / 1.25) % len(gaze_map)
    gx, gy = gaze_map[phase]
    blink_wave = t % 7.5
    blink = 1.0 if 2.65 <= blink_wave <= 2.82 or 2.92 <= blink_wave <= 3.02 else 0.0
    mouth = 'M -16 30 Q 0 38 16 30' if phase not in {9, 10} else 'M -20 31 C -8 29 4 36 20 29'

    svg_text = build_svg_frame(tick, blink, gx, gy, mouth)
    png_bytes = cairosvg.svg2png(bytestring=svg_text.encode('utf-8'), output_width=220, output_height=260)
    mascot = Image.open(io.BytesIO(png_bytes)).convert('RGBA')

    canvas = Image.new('RGBA', (PORTRAIT_W, PORTRAIT_H), '#05070b')
    draw = ImageDraw.Draw(canvas)

    for y in range(PORTRAIT_H):
        alpha = int(34 + 34 * math.sin((y / PORTRAIT_H) * math.pi))
        draw.line((0, y, PORTRAIT_W, y), fill=(5, 16, 27, alpha), width=1)

    cx, cy = PORTRAIT_W // 2, 205
    halo_r = 96 + int(5 * math.sin(t * 1.3))
    draw.ellipse((cx - halo_r, cy - halo_r, cx + halo_r, cy + halo_r), outline=(42, 214, 163, 32), width=4)
    draw.ellipse((cx - halo_r - 18, cy - halo_r - 18, cx + halo_r + 18, cy + halo_r + 18), outline=(101, 243, 255, 22), width=2)

    for idx, phase_offset in enumerate((0.0, 2.1, 4.2, 5.4)):
        orbit_t = t * 0.55 + phase_offset
        ox = cx + math.cos(orbit_t) * (104 + idx * 8)
        oy = cy + math.sin(orbit_t * 1.15) * (58 + idx * 9)
        r = 2 + (idx % 2)
        color = (101, 243, 255, 96 - idx * 14) if idx % 2 == 0 else (42, 214, 163, 76 - idx * 10)
        draw.ellipse((ox - r, oy - r, ox + r, oy + r), fill=color)

    bob = int(round(math.sin(t * 0.9) * 4))
    canvas.alpha_composite(mascot, (50, 73 + bob))

    mood, status_line, quip = get_lines()
    now = datetime.now().strftime('%H:%M')
    draw.rounded_rectangle((16, 16, 304, 50), radius=14, fill=(255, 255, 255, 12), outline=(101, 243, 255, 38), width=1)
    pulse = 2 + ((tick // max(1, int(fps * 1.2))) % 2)
    draw.ellipse((25 - pulse, 29 - pulse, 33 + pulse, 37 + pulse), fill=(18, 39, 63, 180))
    draw.ellipse((25, 29, 33, 37), fill=(101, 243, 255, 255))
    draw.text((42, 26), mood.replace('_', ' ').upper()[:20], font=DEFAULT_FONT, fill=(216, 247, 255, 255))
    draw.text((270, 26), now, font=DEFAULT_FONT, fill=(138, 162, 178, 255))

    draw.rounded_rectangle((16, 354, 304, 458), radius=18, fill=(2, 5, 10, 170), outline=(101, 243, 255, 28), width=1)
    draw.text((28, 372), 'HERMES LOCAL PRESENCE', font=DEFAULT_FONT, fill=(232, 247, 255, 255))
    draw.text((28, 397), status_line, font=DEFAULT_FONT, fill=(138, 162, 178, 255))
    draw.text((28, 423), quip, font=DEFAULT_FONT, fill=(101, 243, 255, 255))

    for i, label in enumerate(['ENG', 'FOC', 'IMP']):
        x = 210 + i * 30
        glow = 24 + int(18 * (0.5 + 0.5 * math.sin(t * 1.4 + i * 0.8)))
        draw.rounded_rectangle((x, 438, x + 24, 452), radius=6, fill=(18, 39, 63, 255), outline=(101, 243, 255, glow), width=1)
        draw.text((x + 4, 441), label, font=DEFAULT_FONT, fill=(232, 247, 255, 255))

    return canvas.convert('RGB')


def close_dev(dev, intf):
    try:
        usb.util.release_interface(dev, intf)
    except Exception:
        pass
    try:
        usb.util.dispose_resources(dev)
    except Exception:
        pass


def main():
    fps = float(os.environ.get('HERMES_USB_PANEL_FPS', '2.0'))
    # Full 480x320 RGB565 frames are ~307 KiB. The panel enumerates as USB full-speed,
    # so sustained 6 FPS can exceed the practical bus limit and wedge the device.
    delay = max(0.5, 1.0 / fps)
    brightness = int(os.environ.get('HERMES_USB_PANEL_BRIGHTNESS', '7'))
    dev = None
    intf = None
    tick = 0
    while True:
        try:
            if dev is None:
                dev, intf = open_dev()
                send(dev, cbw=backlight_cbw(brightness))
            portrait = render_portrait_frame(tick, fps)
            panel = portrait.rotate(90, expand=True)
            frame = image_to_frame(panel)
            send(dev, frame, cbw=blit_cbw(0, 0, PANEL_W, PANEL_H, len(frame)))
            tick += 1
            time.sleep(delay)
        except usb.core.USBError:
            if dev is not None:
                close_dev(dev, intf)
            dev = None
            intf = None
            time.sleep(1.0)
        except Exception:
            if dev is not None:
                close_dev(dev, intf)
            raise


if __name__ == '__main__':
    main()
