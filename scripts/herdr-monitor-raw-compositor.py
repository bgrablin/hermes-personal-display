#!/usr/bin/env python3
"""Compose a fixed-size Herdr Monitor source as one lightweight ANSI display."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

DEFAULT_POLL_SECONDS = 1.0
HEALTH_REFRESH_SECONDS = 5.0
SOURCE_COLUMNS = 192
SOURCE_RESOURCE_ROWS = 46
SOURCE_HEALTH_ROWS = 19
# tmux needs one extra row for the horizontal pane separator to produce
# 46 rows + 19 rows of captured pane content.
SOURCE_WINDOW_ROWS = 66
SOURCE_SOCKET = os.environ.get(
    "PERSONAL_DISPLAY_SOURCE_TMUX_SOCKET", "hermes-personal-display-source"
)
SOURCE_SESSION = os.environ.get(
    "PERSONAL_DISPLAY_SOURCE_TMUX_SESSION", "hermes-personal-display-source"
)
SOURCE_HOME = Path.home()
BTOP_CONFIG = Path(
    os.environ.get(
        "PERSONAL_DISPLAY_BTOP_CONFIG", str(SOURCE_HOME / ".config/herdr-btop/btop.conf")
    )
)
HEALTH_MONITOR = Path(
    os.environ.get(
        "PERSONAL_DISPLAY_HEALTH_MONITOR",
        shutil.which("hermes-ops-monitor")
        or shutil.which("nuc-ops-monitor")
        or str(SOURCE_HOME / ".local/bin/nuc-ops-monitor"),
    )
)
RESET = "\033[0m"
SgrOrControl = re.compile(r"\033\[[0-?]*[ -/]*[@-~]")
OSC = re.compile(r"\033\][^\x07]*(?:\x07|\033\\)")
STOP = False


def request_stop(_signum: int, _frame: object) -> None:
    global STOP
    STOP = True


def visible_width(value: str) -> int:
    return len(SgrOrControl.sub("", OSC.sub("", value)))


def normalize_line(value: str) -> str:
    """Keep SGR color/style codes and remove cursor/erase controls."""
    value = OSC.sub("", value.replace("\r", ""))

    def keep_sgr(match: re.Match[str]) -> str:
        code = match.group(0)
        return code if code.endswith("m") else ""

    return SgrOrControl.sub(keep_sgr, value)


def fit_source_line(value: str, width: int) -> str:
    """Pad a source line to the target cell width without changing colors."""
    value = normalize_line(value)
    current = visible_width(value)
    if current > width:
        plain = SgrOrControl.sub("", OSC.sub("", value))
        value = plain[:width]
        current = len(value)
    return value + (" " * max(0, width - current)) + RESET


def frame_lines(frame: str, *, width: int, rows: int) -> list[str]:
    source_lines = [normalize_line(line) for line in frame.splitlines()]
    output = [fit_source_line(line, width) for line in source_lines[:rows]]
    while len(output) < rows:
        output.append(" " * width + RESET)
    return output


def error_lines(message: str, *, width: int, rows: int) -> list[str]:
    compact = " ".join(message.split())[: max(1, width - 4)]
    lines = [
        "\033[1m\033[38;2;247;198;107mHERDR MONITOR\033[0m",
        "",
        compact,
        "retrying fixed source...",
    ]
    output = [fit_source_line(line, width) for line in lines[:rows]]
    output.extend([" " * width + RESET] * max(0, rows - len(output)))
    return output


def compose(
    resources_frame: str,
    health_frame: str,
    *,
    columns: int,
    rows: int,
    resource_rows: int = SOURCE_RESOURCE_ROWS,
    health_rows: int = SOURCE_HEALTH_ROWS,
) -> str:
    """Join the fixed source panes without inheriting the interactive Herdr size."""
    width = min(max(1, columns), SOURCE_COLUMNS)
    resource_lines = frame_lines(resources_frame, width=width, rows=resource_rows)
    health_lines = frame_lines(health_frame, width=width, rows=health_rows)
    output = resource_lines + health_lines
    if len(output) < rows:
        output.extend([" " * width + RESET] * (rows - len(output)))
    else:
        output = output[:rows]
    return "\r\n".join(output)


def _binary(name: str, fallback: str) -> str:
    configured = os.environ.get(name)
    if configured:
        return configured
    return shutil.which(fallback) or fallback


def _tmux_binary() -> str:
    return _binary("PERSONAL_DISPLAY_TMUX", "tmux")


def _tmux_environment() -> dict[str, str]:
    env = os.environ.copy()
    # The display compositor is not itself a tmux client. Do not let a parent
    # shell make the fixed source look like a nested tmux invocation.
    env.pop("TMUX", None)
    env.setdefault("TERM", "xterm-256color")
    env.setdefault("COLORTERM", "truecolor")
    return env


def _run_tmux(args: list[str], *, timeout: float = 4.0, check: bool = True) -> str:
    command = [_tmux_binary(), "-L", SOURCE_SOCKET, "-f", "/dev/null", *args]
    try:
        completed = subprocess.run(
            command,
            env=_tmux_environment(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError(f"tmux source unavailable: {type(exc).__name__}") from exc
    if check and completed.returncode != 0:
        detail = " ".join(completed.stderr.split())[:160]
        raise RuntimeError(f"tmux source command failed: {completed.returncode} {detail}".strip())
    return completed.stdout


def _source_target(pane_index: int) -> str:
    return f"{SOURCE_SESSION}:0.{pane_index}"


def _source_exists() -> bool:
    try:
        _run_tmux(["has-session", "-t", SOURCE_SESSION], check=True)
    except RuntimeError:
        return False
    return True


def _source_layout() -> dict[int, tuple[int, int]]:
    raw = _run_tmux(
        [
            "list-panes",
            "-t",
            f"{SOURCE_SESSION}:0",
            "-F",
            "#{pane_index} #{pane_width} #{pane_height} #{pane_dead}",
        ]
    )
    layout: dict[int, tuple[int, int]] = {}
    for line in raw.splitlines():
        parts = line.split()
        if len(parts) != 4:
            continue
        try:
            pane, width, height = (int(value) for value in parts[:3])
        except ValueError:
            continue
        if parts[3] == "0":
            layout[pane] = (width, height)
    return layout


def _source_is_ready() -> bool:
    if not _source_exists():
        return False
    try:
        return _source_layout() == {
            0: (SOURCE_COLUMNS, SOURCE_RESOURCE_ROWS),
            1: (SOURCE_COLUMNS, SOURCE_HEALTH_ROWS),
        }
    except RuntimeError:
        return False


def _kill_source() -> None:
    _run_tmux(["kill-session", "-t", SOURCE_SESSION], check=False)


def _create_source() -> None:
    tmux = _tmux_binary()
    btop = _binary("PERSONAL_DISPLAY_BTOP", "btop")
    python = os.environ.get("PERSONAL_DISPLAY_PYTHON", sys.executable)
    if not Path(btop).exists() and shutil.which(btop) is None:
        raise RuntimeError(f"btop not found: {btop}")
    if not HEALTH_MONITOR.is_file():
        raise RuntimeError(f"health monitor not found: {HEALTH_MONITOR}")
    if not BTOP_CONFIG.is_file():
        raise RuntimeError(f"btop config not found: {BTOP_CONFIG}")

    _run_tmux(
        [
            "new-session",
            "-d",
            "-s",
            SOURCE_SESSION,
            "-x",
            str(SOURCE_COLUMNS),
            "-y",
            str(SOURCE_WINDOW_ROWS),
            "-c",
            str(SOURCE_HOME),
            "--",
            btop,
            "--config",
            str(BTOP_CONFIG),
            "--themes-dir",
            "/usr/share/btop/themes",
        ]
    )
    window = f"{SOURCE_SESSION}:0"
    _run_tmux(["set-option", "-t", SOURCE_SESSION, "status", "off"])
    _run_tmux(["set-option", "-t", SOURCE_SESSION, "mouse", "off"])
    _run_tmux(["set-window-option", "-t", window, "window-size", "manual"])
    _run_tmux(["set-window-option", "-t", window, "pane-border-status", "off"])
    _run_tmux(["set-window-option", "-t", window, "default-terminal", "tmux-256color"])
    _run_tmux(
        [
            "split-window",
            "-v",
            "-l",
            str(SOURCE_HEALTH_ROWS),
            "-t",
            _source_target(0),
            "-c",
            str(SOURCE_HOME),
            "--",
            python,
            str(HEALTH_MONITOR),
        ]
    )
    _run_tmux(["resize-pane", "-t", _source_target(0), "-y", str(SOURCE_RESOURCE_ROWS)])
    _run_tmux(["select-pane", "-t", _source_target(0), "-T", "Resources"])
    _run_tmux(["select-pane", "-t", _source_target(1), "-T", "Health"])
    _run_tmux(["select-pane", "-t", _source_target(0)])
    if not _source_is_ready():
        raise RuntimeError(
            f"fixed tmux source did not reach {SOURCE_COLUMNS}x{SOURCE_RESOURCE_ROWS} + "
            f"{SOURCE_COLUMNS}x{SOURCE_HEALTH_ROWS}"
        )


def ensure_source() -> None:
    if not _source_is_ready():
        if _source_exists():
            _kill_source()
        _create_source()
    _wait_for_source_content()


def read_source_frame(pane_index: int, rows: int) -> str:
    raw = _run_tmux(
        [
            "capture-pane",
            "-e",
            "-p",
            "-t",
            _source_target(pane_index),
            "-S",
            f"-{rows}",
            "-E",
            "-",
        ]
    )
    if not any(normalize_line(line).strip() for line in raw.splitlines()):
        raise RuntimeError(f"fixed source pane {pane_index} is empty")
    return raw


def _wait_for_source_content(timeout: float = 8.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: RuntimeError | None = None
    while time.monotonic() < deadline:
        try:
            read_source_frame(0, SOURCE_RESOURCE_ROWS)
            read_source_frame(1, SOURCE_HEALTH_ROWS)
            return
        except RuntimeError as exc:
            last_error = exc
            time.sleep(0.25)
    raise last_error or RuntimeError("fixed tmux source did not paint")


def render(value: str) -> None:
    # DEC synchronized updates make the redraw atomic in Alacritty. This keeps
    # the native terminal path smooth without a browser compositor.
    sys.stdout.write("\033[?25l\033[?2026h\033[H\033[2J" + value + "\033[?2026l")
    sys.stdout.flush()


def run(*, poll_seconds: float, once: bool) -> int:
    resources_frame = ""
    health_frame = ""
    last_health_read = 0.0
    last_source_check = 0.0
    source_error = True

    try:
        while not STOP:
            now = time.monotonic()
            try:
                if source_error or now - last_source_check >= HEALTH_REFRESH_SECONDS:
                    ensure_source()
                    last_source_check = now
                resources_frame = read_source_frame(0, SOURCE_RESOURCE_ROWS)
                source_error = False
            except RuntimeError as exc:
                source_error = True
                health_frame = "\n".join(error_lines(str(exc), width=SOURCE_COLUMNS, rows=SOURCE_HEALTH_ROWS))
                render(
                    "\033[2J\033[H"
                    + "\n".join(error_lines(str(exc), width=SOURCE_COLUMNS, rows=SOURCE_RESOURCE_ROWS))
                    + "\n"
                    + health_frame
                )
                if once:
                    return 1
                time.sleep(2.0)
                continue

            if not health_frame or now - last_health_read >= HEALTH_REFRESH_SECONDS:
                try:
                    health_frame = read_source_frame(1, SOURCE_HEALTH_ROWS)
                except RuntimeError as exc:
                    health_frame = "\n".join(
                        error_lines(str(exc), width=SOURCE_COLUMNS, rows=SOURCE_HEALTH_ROWS)
                    )
                last_health_read = now

            columns, rows = shutil.get_terminal_size((SOURCE_COLUMNS, SOURCE_RESOURCE_ROWS + SOURCE_HEALTH_ROWS))
            render(
                compose(
                    resources_frame,
                    health_frame,
                    columns=columns,
                    rows=rows,
                )
            )
            if once:
                return 0

            deadline = time.monotonic() + max(0.25, min(poll_seconds, 60.0))
            while not STOP and time.monotonic() < deadline:
                time.sleep(min(0.2, max(0.0, deadline - time.monotonic())))
    finally:
        # The isolated source belongs to this display route. Do not leave its
        # btop/health-monitor producers behind when Alacritty is restarted.
        if _source_exists():
            _kill_source()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--poll-seconds", type=float, default=DEFAULT_POLL_SECONDS)
    parser.add_argument("--once", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    global STOP
    STOP = False
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, request_stop)
    args = build_parser().parse_args(argv)
    return run(poll_seconds=args.poll_seconds, once=args.once)


if __name__ == "__main__":
    raise SystemExit(main())
