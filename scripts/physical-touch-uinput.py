#!/usr/bin/env python3
"""Drive the physical kiosk like a family member using a temporary uinput MT device.

This exercises kernel -> XInput2 -> Chromium -> PointerEvents. It intentionally
requires root and python3-evdev. It leaves no persistent input device after exit.
"""
from __future__ import annotations

import argparse
import subprocess
import time
from dataclasses import dataclass

from evdev import AbsInfo, UInput, ecodes as e

W, H = 1920, 1280
NAME = 'Hermes Virtual Family Touch Test'

CAP = {
    e.EV_KEY: [e.BTN_TOUCH, e.BTN_TOOL_FINGER, e.BTN_TOOL_DOUBLETAP, e.BTN_TOOL_TRIPLETAP],
    e.EV_ABS: [
        (e.ABS_X, AbsInfo(0, 0, W - 1, 0, 0, 0)),
        (e.ABS_Y, AbsInfo(0, 0, H - 1, 0, 0, 0)),
        (e.ABS_PRESSURE, AbsInfo(0, 0, 255, 0, 0, 0)),
        (e.ABS_MT_SLOT, AbsInfo(0, 0, 9, 0, 0, 0)),
        (e.ABS_MT_TRACKING_ID, AbsInfo(0, 0, 65535, 0, 0, 0)),
        (e.ABS_MT_POSITION_X, AbsInfo(0, 0, W - 1, 0, 0, 0)),
        (e.ABS_MT_POSITION_Y, AbsInfo(0, 0, H - 1, 0, 0, 0)),
        (e.ABS_MT_PRESSURE, AbsInfo(0, 0, 255, 0, 0, 0)),
        (e.ABS_MT_TOUCH_MAJOR, AbsInfo(0, 0, 80, 0, 0, 0)),
    ],
}

# Desired browser/screen coordinates. The physical DP-2 output is inverted, and
# xinput maps the device through that CTM, so write raw coordinates inverted.
def raw(x: float, y: float) -> tuple[int, int]:
    return int(max(0, min(W - 1, W - x))), int(max(0, min(H - 1, H - y)))

@dataclass
class Pt:
    x: float
    y: float

ZONES = {
    'center': Pt(960, 640),
    'left': Pt(250, 640),
    'right': Pt(1670, 640),
    'sky': Pt(960, 150),
    'floor': Pt(960, 1120),
    'field': Pt(960, 310),
}

class Touch:
    def __init__(self, ui: UInput, gap: float = 0.035) -> None:
        self.ui = ui
        self.gap = gap
        self.next_tid = 100

    def w(self, typ: int, code: int, val: int) -> None:
        self.ui.write(typ, code, val)

    def slot(self, slot_num: int, tracking_id: int | None = None, x: float | None = None, y: float | None = None, pressure: int = 180, major: int = 46) -> None:
        self.w(e.EV_ABS, e.ABS_MT_SLOT, slot_num)
        if tracking_id is not None:
            self.w(e.EV_ABS, e.ABS_MT_TRACKING_ID, tracking_id)
        if x is not None and y is not None:
            rx, ry = raw(x, y)
            self.w(e.EV_ABS, e.ABS_MT_POSITION_X, rx)
            self.w(e.EV_ABS, e.ABS_MT_POSITION_Y, ry)
            if slot_num == 0:
                self.w(e.EV_ABS, e.ABS_X, rx)
                self.w(e.EV_ABS, e.ABS_Y, ry)
        self.w(e.EV_ABS, e.ABS_MT_PRESSURE, pressure)
        self.w(e.EV_ABS, e.ABS_MT_TOUCH_MAJOR, major)
        if slot_num == 0:
            self.w(e.EV_ABS, e.ABS_PRESSURE, pressure)

    def syn(self, delay: float | None = None) -> None:
        self.ui.syn()
        time.sleep(self.gap if delay is None else delay)

    def down_points(self, points: list[Pt], pressure: int = 190, major: int = 50) -> list[int]:
        tids = []
        for idx, p in enumerate(points):
            tid = self.next_tid
            self.next_tid += 1
            tids.append(tid)
            self.slot(idx, tid, p.x, p.y, pressure, major)
        self.w(e.EV_KEY, e.BTN_TOUCH, 1)
        self.w(e.EV_KEY, e.BTN_TOOL_FINGER, 1 if len(points) == 1 else 0)
        self.w(e.EV_KEY, e.BTN_TOOL_DOUBLETAP, 1 if len(points) == 2 else 0)
        self.w(e.EV_KEY, e.BTN_TOOL_TRIPLETAP, 1 if len(points) >= 3 else 0)
        self.syn()
        return tids

    def move_points(self, points: list[Pt], pressure: int = 190, major: int = 46) -> None:
        for idx, p in enumerate(points):
            self.slot(idx, None, p.x, p.y, pressure, major)
        self.syn()

    def lift(self, count: int) -> None:
        for idx in range(count):
            self.slot(idx, -1)
        self.w(e.EV_KEY, e.BTN_TOOL_TRIPLETAP, 0)
        self.w(e.EV_KEY, e.BTN_TOOL_DOUBLETAP, 0)
        self.w(e.EV_KEY, e.BTN_TOOL_FINGER, 0)
        self.w(e.EV_KEY, e.BTN_TOUCH, 0)
        self.syn(0.18)

    def tap(self, p: Pt, hold: float = 0.11) -> None:
        self.down_points([p])
        time.sleep(hold)
        self.lift(1)

    def long_press(self, p: Pt, hold: float = 0.88) -> None:
        self.down_points([p], pressure=205, major=56)
        time.sleep(hold)
        self.lift(1)

    def drag(self, start: Pt, end: Pt, steps: int = 18, hold: float = 0.02) -> None:
        self.down_points([start], pressure=180, major=44)
        for i in range(1, steps + 1):
            t = i / steps
            self.move_points([Pt(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)], pressure=198, major=42)
            time.sleep(hold)
        self.lift(1)

    def two_finger_tap(self, a: Pt, b: Pt) -> None:
        self.down_points([a, b], pressure=198, major=52)
        time.sleep(0.18)
        self.lift(2)

    def two_finger_move(self, a0: Pt, b0: Pt, a1: Pt, b1: Pt, steps: int = 16) -> None:
        self.down_points([a0, b0], pressure=198, major=52)
        for i in range(1, steps + 1):
            t = i / steps
            self.move_points([
                Pt(a0.x + (a1.x - a0.x) * t, a0.y + (a1.y - a0.y) * t),
                Pt(b0.x + (b1.x - b0.x) * t, b0.y + (b1.y - b0.y) * t),
            ], pressure=205, major=50)
        time.sleep(0.12)
        self.lift(2)

    def three_finger_tap(self) -> None:
        self.down_points([Pt(820, 620), Pt(960, 650), Pt(1100, 620)], pressure=200, major=50)
        time.sleep(0.15)
        self.lift(3)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--pause', type=float, default=1.45, help='pause between family user actions')
    args = parser.parse_args()
    with UInput(CAP, name=NAME, vendor=0x1D6B, product=0x2031, version=1, input_props=[e.INPUT_PROP_DIRECT]) as ui:
        print(f'created {NAME} at {ui.devnode}', flush=True)
        time.sleep(1.0)
        subprocess.run(['sudo', '-u', 'brian', 'env', 'DISPLAY=:0', 'xinput', 'map-to-output', NAME, 'DP-2'], check=False)
        subprocess.run(['sudo', '-u', 'brian', 'env', 'DISPLAY=:0', 'xinput', 'list-props', NAME], check=False)
        t = Touch(ui)
        flows = [
            ('tap:center', lambda: t.tap(ZONES['center'])),
            ('tap:left', lambda: t.tap(ZONES['left'])),
            ('tap:right', lambda: t.tap(ZONES['right'])),
            ('tap:sky', lambda: t.tap(ZONES['sky'])),
            ('tap:floor', lambda: t.tap(ZONES['floor'])),
            ('tap:field', lambda: t.tap(Pt(540, 300))),
            ('rapid:center-five', lambda: [t.tap(ZONES['center'], 0.07) or time.sleep(0.18) for _ in range(5)]),
            ('longpress:center', lambda: t.long_press(ZONES['center'])),
            ('drag:field-slow', lambda: t.drag(Pt(780, 720), Pt(1160, 500))),
            ('twofinger:tap', lambda: t.two_finger_tap(Pt(790, 640), Pt(1130, 640))),
            ('twofinger:spread', lambda: t.two_finger_move(Pt(880, 650), Pt(1040, 650), Pt(610, 575), Pt(1310, 725))),
            ('twofinger:pinch', lambda: t.two_finger_move(Pt(620, 575), Pt(1300, 725), Pt(890, 650), Pt(1030, 650))),
            ('threefinger:tap', t.three_finger_tap),
        ]
        for name, fn in flows:
            print(f'FLOW {name}', flush=True)
            fn()
            time.sleep(args.pause)
        # Safety lift all slots.
        t.lift(3)
        print('completed family touch flow; all slots lifted', flush=True)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
