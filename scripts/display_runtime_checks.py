#!/usr/bin/env python3
"""Small, deterministic checks shared by the physical-display shell tools."""

from __future__ import annotations

import argparse
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

_MODE_RE = re.compile(r"^(\d+)x(\d+)$")
_POSITION_RE = re.compile(r"^(-?\d+)x(-?\d+)$")
_GEOMETRY_RE = re.compile(r"^\d+x\d+[+-]\d+[+-]\d+$")
_ROTATIONS = {"normal", "left", "right", "inverted"}
_CHROMIUM_EXECUTABLES = re.compile(
    r"^(?:chrome|chromium|chromium-browser|google-chrome|google-chrome-stable)$",
    re.IGNORECASE,
)
_RUNTIME_PATH = "/src/character-runtime.html"


@dataclass(frozen=True)
class FramebufferResult:
    rendered: bool
    mean: float
    maximum: int
    box: tuple[int, int, int, int]


@dataclass(frozen=True)
class ManagedChromiumProcess:
    pid: int
    args: tuple[str, ...]


@dataclass(frozen=True)
class ManagedHerdrMonitorDisplay:
    alacritty_pid: int | None
    compositor_pids: tuple[int, ...]
    tmux_session: bool

    @property
    def healthy(self) -> bool:
        alacritty_ok = self.alacritty_pid is not None and self.alacritty_pid != -1
        return alacritty_ok and len(self.compositor_pids) == 1 and self.tmux_session


def _parse_mode(mode: str) -> tuple[int, int]:
    match = _MODE_RE.fullmatch(mode)
    if not match:
        raise ValueError(f"invalid display mode: {mode!r}")
    width, height = (int(value) for value in match.groups())
    if width <= 0 or height <= 0:
        raise ValueError(f"display mode must be positive: {mode!r}")
    return width, height


def _parse_position(position: str) -> tuple[int, int]:
    match = _POSITION_RE.fullmatch(position)
    if not match:
        raise ValueError(f"invalid display position: {position!r}")
    return tuple(int(value) for value in match.groups())  # type: ignore[return-value]


def framebuffer_box(mode: str, position: str) -> tuple[int, int, int, int]:
    width, height = _parse_mode(mode)
    left, top = _parse_position(position)
    return left, top, left + width, top + height


def output_layout_matches(
    line: str,
    *,
    output: str,
    mode: str,
    rotation: str,
    position: str,
) -> bool:
    """Match active xrandr state, excluding the parenthesized supported rotations."""
    if rotation not in _ROTATIONS:
        raise ValueError(f"invalid display rotation: {rotation!r}")
    width, height = _parse_mode(mode)
    left, top = _parse_position(position)
    expected_geometry = f"{width}x{height}{left:+d}{top:+d}"

    active_segment = line.split(" (", 1)[0]
    tokens = active_segment.split()
    if len(tokens) < 2 or tokens[0] != output or tokens[1] != "connected":
        return False
    if "primary" not in tokens or expected_geometry not in tokens:
        return False

    geometry_index = tokens.index(expected_geometry)
    active_rotation = "normal"
    for token in tokens[geometry_index + 1 :]:
        if token in _ROTATIONS:
            active_rotation = token
            break
        if _GEOMETRY_RE.fullmatch(token):
            break
    return active_rotation == rotation


def inspect_framebuffer(
    image_path: str | Path,
    *,
    mode: str,
    position: str,
) -> FramebufferResult:
    from PIL import Image, ImageStat

    box = framebuffer_box(mode, position)
    with Image.open(image_path) as source:
        image = source.convert("RGB")
        left, top, right, bottom = box
        if left < 0 or top < 0 or right > image.width or bottom > image.height:
            raise ValueError(
                "configured display geometry "
                f"{box} is outside framebuffer {image.width}x{image.height}"
            )
        crop = image.crop(box)
        stat = ImageStat.Stat(crop)
    maximum = max(channel[1] for channel in stat.extrema)
    mean = sum(stat.mean) / 3
    return FramebufferResult(
        rendered=maximum > 12 and mean > 0.25,
        mean=mean,
        maximum=maximum,
        box=box,
    )


def _option_value(args: tuple[str, ...], name: str) -> str | None:
    prefix = f"{name}="
    for index, arg in enumerate(args):
        if arg.startswith(prefix):
            return arg[len(prefix) :]
        if arg == name and index + 1 < len(args):
            return args[index + 1]
    return None


def _normalized_process_args(args: tuple[str, ...]) -> tuple[str, ...]:
    if len(args) == 1 and " --" in args[0]:
        try:
            parsed = tuple(shlex.split(args[0]))
        except ValueError:
            return args
        if parsed:
            return parsed
    return args


def _is_managed_kiosk(args: tuple[str, ...], profile: str, executable: str) -> bool:
    if not args or not _CHROMIUM_EXECUTABLES.fullmatch(Path(executable).name):
        return False
    if "--kiosk" not in args or any(arg == "--type" or arg.startswith("--type=") for arg in args):
        return False

    process_profile = _option_value(args, "--user-data-dir")
    if process_profile is None:
        return False
    if os.path.normpath(os.path.expanduser(process_profile)) != os.path.normpath(
        os.path.expanduser(profile)
    ):
        return False

    app_url = _option_value(args, "--app")
    if app_url is None:
        return False
    parts = urlsplit(app_url)
    return parts.path == _RUNTIME_PATH and parse_qs(parts.query).get("kiosk") == ["1"]


def managed_chromium_processes(
    proc_root: str | Path,
    profile: str,
) -> list[ManagedChromiumProcess]:
    matches: list[ManagedChromiumProcess] = []
    root = Path(proc_root)
    for process_dir in sorted(
        (path for path in root.iterdir() if path.name.isdigit()),
        key=lambda path: int(path.name),
    ):
        try:
            raw = process_dir.joinpath("cmdline").read_bytes()
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            continue
        args = tuple(
            part.decode("utf-8", "replace")
            for part in raw.split(b"\0")
            if part
        )
        args = _normalized_process_args(args)
        try:
            executable = os.readlink(process_dir / "exe")
        except OSError:
            executable = args[0] if args else ""
        if _is_managed_kiosk(args, profile, executable):
            matches.append(ManagedChromiumProcess(pid=int(process_dir.name), args=args))
    return matches


def _is_monitor_compositor(args: tuple[str, ...], script: str) -> bool:
    """Match the compositor's Python entry point, not a verifier option value."""
    if not args or not Path(args[0]).name.casefold().startswith("python"):
        return False
    expected_script = os.path.normpath(os.path.expanduser(script))
    # Python's first non-option argument is the executed script.  Requiring
    # that position prevents a command such as ``... --script compositor``
    # (the verifier itself) from counting as another compositor process.
    for arg in args[1:]:
        if arg in {"-c", "-m"}:
            return False
        if arg.startswith("-"):
            continue
        return os.path.normpath(os.path.expanduser(arg)) == expected_script
    return False


def _is_monitor_alacritty(
    args: tuple[str, ...], executable: str, script: str
) -> bool:
    if Path(executable).name.casefold() != "alacritty":
        return False
    if "HermesMonitorDisplay" not in args:
        return False
    expected_script = os.path.normpath(os.path.expanduser(script))
    return any(os.path.normpath(os.path.expanduser(arg)) == expected_script for arg in args)


def managed_herdr_monitor_display(
    proc_root: str | Path,
    *,
    script: str,
    tmux_socket: str,
    tmux_session: str,
    tmux_binary: str = "tmux",
) -> ManagedHerdrMonitorDisplay:
    """Inspect the one-window, fixed-source terminal display path."""
    alacritty_pid: int | None = None
    compositor: list[int] = []
    root = Path(proc_root)
    for process_dir in sorted(
        (path for path in root.iterdir() if path.name.isdigit()),
        key=lambda path: int(path.name),
    ):
        try:
            raw = process_dir.joinpath("cmdline").read_bytes()
            args = tuple(
                part.decode("utf-8", "replace")
                for part in raw.split(b"\0")
                if part
            )
            args = _normalized_process_args(args)
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            continue
        try:
            executable = os.readlink(process_dir / "exe")
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            # Yama/containerized procfs can hide exe even for a readable cmdline.
            executable = args[0] if args else ""
        pid = int(process_dir.name)
        if _is_monitor_compositor(args, script):
            compositor.append(pid)
        if _is_monitor_alacritty(args, executable, script):
            if alacritty_pid is None:
                alacritty_pid = pid
            else:
                # -1 makes duplicate Alacritty instances fail the uniqueness gate.
                alacritty_pid = -1

    try:
        tmux_result = subprocess.run(
            [
                tmux_binary,
                "-L",
                tmux_socket,
                "-f",
                "/dev/null",
                "has-session",
                "-t",
                tmux_session,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=1.5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        tmux_result = None
    return ManagedHerdrMonitorDisplay(
        alacritty_pid=alacritty_pid,
        compositor_pids=tuple(compositor),
        tmux_session=bool(tmux_result and tmux_result.returncode == 0),
    )


def _layout_command(args: argparse.Namespace) -> int:
    try:
        matches = output_layout_matches(
            args.line,
            output=args.output,
            mode=args.mode,
            rotation=args.rotation,
            position=args.position,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0 if matches else 1


def _processes_command(args: argparse.Namespace) -> int:
    try:
        processes = managed_chromium_processes(args.proc_root, args.profile)
    except (FileNotFoundError, NotADirectoryError, PermissionError, OSError) as exc:
        print(f"unable to inspect process table: {exc}", file=sys.stderr)
        return 2
    for process in processes:
        print(f"{process.pid} {shlex.join(process.args)}")
    return 0


def _herdr_monitor_command(args: argparse.Namespace) -> int:
    try:
        display = managed_herdr_monitor_display(
            args.proc_root,
            script=args.script,
            tmux_socket=args.socket,
            tmux_session=args.session,
            tmux_binary=args.tmux_bin,
        )
    except (FileNotFoundError, NotADirectoryError, PermissionError, OSError) as exc:
        print(f"unable to inspect Herdr Monitor display: {exc}", file=sys.stderr)
        return 2
    if display.alacritty_pid is None:
        alacritty = "missing"
    elif display.alacritty_pid == -1:
        alacritty = "duplicate"
    else:
        alacritty = "ok"
    tmux = "ok" if display.tmux_session else "none"
    message = (
        f"alacritty={alacritty} compositor={len(display.compositor_pids)} tmux={tmux}"
    )
    print(message)
    return 0 if display.healthy else 1


def _framebuffer_command(args: argparse.Namespace) -> int:
    try:
        result = inspect_framebuffer(args.image, mode=args.mode, position=args.position)
    except Exception as exc:
        print(f"unable to inspect framebuffer: {type(exc).__name__}: {exc}")
        return 2
    if not result.rendered:
        print(f"black/blank framebuffer: mean={result.mean:.3f} max={result.maximum}")
        return 1
    print(f"rendered framebuffer: mean={result.mean:.2f} max={result.maximum}")
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    layout = commands.add_parser("layout")
    layout.add_argument("--line", required=True)
    layout.add_argument("--output", required=True)
    layout.add_argument("--mode", required=True)
    layout.add_argument("--rotation", required=True)
    layout.add_argument("--position", required=True)
    layout.set_defaults(handler=_layout_command)

    processes = commands.add_parser("managed-chromium")
    processes.add_argument("--proc-root", default="/proc")
    processes.add_argument("--profile", required=True)
    processes.set_defaults(handler=_processes_command)

    monitor = commands.add_parser("managed-herdr-monitor")
    monitor.add_argument("--proc-root", default="/proc")
    monitor.add_argument("--script", required=True)
    monitor.add_argument("--socket", required=True)
    monitor.add_argument("--session", required=True)
    monitor.add_argument("--tmux-bin", default="tmux")
    monitor.set_defaults(handler=_herdr_monitor_command)

    framebuffer = commands.add_parser("framebuffer")
    framebuffer.add_argument("--image", required=True)
    framebuffer.add_argument("--mode", required=True)
    framebuffer.add_argument("--position", required=True)
    framebuffer.set_defaults(handler=_framebuffer_command)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
