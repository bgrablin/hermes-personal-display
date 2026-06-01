#!/usr/bin/env python3
import struct
import sys
from pathlib import Path

import usb.core
import usb.util
from PIL import Image, ImageOps

VID = 0x1908
PID = 0x0102
WIDTH = 480
HEIGHT = 320
CBW_SIG = b'USBC'
CSW_SIG = b'USBS'
TAG = 0xDEADBEEF
EP_OUT = 0x01
EP_IN = 0x81
TIMEOUT = 5000


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


def rgb565be(r: int, g: int, b: int) -> bytes:
    value = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    return struct.pack('>H', value)


def make_quadrant() -> bytes:
    colors = [
        rgb565be(255, 0, 0),
        rgb565be(0, 255, 0),
        rgb565be(0, 0, 255),
        rgb565be(255, 255, 255),
    ]
    half_w = WIDTH // 2
    half_h = HEIGHT // 2
    buf = bytearray(WIDTH * HEIGHT * 2)
    idx = 0
    for y in range(HEIGHT):
        for x in range(WIDTH):
            if y < half_h:
                color = colors[0] if x < half_w else colors[1]
            else:
                color = colors[2] if x < half_w else colors[3]
            buf[idx:idx+2] = color
            idx += 2
    return bytes(buf)


def image_to_frame(path: Path) -> bytes:
    img = Image.open(path).convert('RGB')
    img = ImageOps.exif_transpose(img)
    # Project runtime is portrait 320x480; panel is landscape 480x320.
    if img.height > img.width:
        img = img.rotate(90, expand=True)
    img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
    buf = bytearray(WIDTH * HEIGHT * 2)
    idx = 0
    for y in range(HEIGHT):
        for x in range(WIDTH):
            r, g, b = img.getpixel((x, y))
            buf[idx:idx+2] = rgb565be(r, g, b)
            idx += 2
    return bytes(buf)


def csw_ok(data: bytes) -> bool:
    return len(data) >= 13 and data[:4] == CSW_SIG and data[12] == 0


def send(dev, payload: bytes = b'', *, cbw: bytes):
    wrote = dev.write(EP_OUT, cbw, timeout=TIMEOUT)
    print(f'CBW bytes: {wrote}')
    if payload:
        wrote = dev.write(EP_OUT, payload, timeout=TIMEOUT)
        print(f'PAYLOAD bytes: {wrote}')
    csw = bytes(dev.read(EP_IN, 13, timeout=TIMEOUT))
    print(f'CSW: {csw.hex()}')
    if not csw_ok(csw):
        raise RuntimeError(f'bad CSW: {csw.hex()}')


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
    except (NotImplementedError, usb.core.USBError):
        pass
    usb.util.claim_interface(dev, intf.bInterfaceNumber)
    return dev, intf.bInterfaceNumber


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'quadrant'
    dev, intf = open_dev()
    try:
        send(dev, cbw=backlight_cbw(7))
        if mode == 'quadrant':
            frame = make_quadrant()
        elif mode == 'image':
            if len(sys.argv) < 3:
                raise SystemExit('usage: usb_display_probe.py image /path/to/image.png')
            frame = image_to_frame(Path(sys.argv[2]))
        else:
            raise SystemExit('mode must be quadrant or image')
        send(dev, frame, cbw=blit_cbw(0, 0, WIDTH, HEIGHT, len(frame)))
        print('OK')
    finally:
        try:
            usb.util.release_interface(dev, intf)
        except Exception:
            pass
        usb.util.dispose_resources(dev)


if __name__ == '__main__':
    main()
