from __future__ import annotations

import stat
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import display_runtime_checks as checks  # noqa: E402


def test_layout_rejects_supported_but_inactive_inverted_rotation() -> None:
    line = (
        "DP-2 connected primary 1920x1280+0+0 "
        "(normal left inverted right x axis y axis) 255mm x 170mm"
    )

    assert checks.output_layout_matches(
        line,
        output="DP-2",
        mode="1920x1280",
        rotation="inverted",
        position="0x0",
    ) is False


def test_layout_accepts_active_inverted_rotation() -> None:
    line = (
        "DP-2 connected primary 1920x1280+0+0 inverted "
        "(normal left inverted right x axis y axis) 255mm x 170mm"
    )

    assert checks.output_layout_matches(
        line,
        output="DP-2",
        mode="1920x1280",
        rotation="inverted",
        position="0x0",
    ) is True


def test_layout_treats_omitted_rotation_as_active_normal() -> None:
    line = (
        "DP-2 connected primary 1920x1280+0+0 "
        "(normal left inverted right x axis y axis) 255mm x 170mm"
    )

    assert checks.output_layout_matches(
        line,
        output="DP-2",
        mode="1920x1280",
        rotation="normal",
        position="0x0",
    ) is True


def test_framebuffer_inspection_uses_configured_output_geometry(tmp_path: Path) -> None:
    image_path = tmp_path / "root.png"
    image = Image.new("RGB", (320, 220), "black")
    for x in range(120, 220):
        for y in range(60, 160):
            image.putpixel((x, y), (20, 40, 80))
    image.save(image_path)

    rendered = checks.inspect_framebuffer(
        image_path,
        mode="100x100",
        position="120x60",
    )
    blank = checks.inspect_framebuffer(
        image_path,
        mode="100x100",
        position="0x0",
    )

    assert rendered.rendered is True
    assert rendered.box == (120, 60, 220, 160)
    assert blank.rendered is False
    assert blank.box == (0, 0, 100, 100)


def _write_cmdline(proc_root: Path, pid: int, *args: str) -> None:
    process_dir = proc_root / str(pid)
    process_dir.mkdir(parents=True)
    process_dir.joinpath("cmdline").write_bytes(b"\0".join(arg.encode() for arg in args) + b"\0")


def test_managed_chromium_roots_exclude_helpers_wrappers_and_other_profiles(tmp_path: Path) -> None:
    proc_root = tmp_path / "proc"
    profile = "/home/test/snap/chromium/common/hermes-personal-display-profile"
    url = "http://127.0.0.1:8770/src/character-runtime.html?kiosk=1&orientation=landscape"

    _write_cmdline(
        proc_root,
        101,
        "/snap/chromium/current/usr/lib/chromium-browser/chrome",
        "--kiosk",
        f"--app={url}",
        f"--user-data-dir={profile}",
    )
    _write_cmdline(
        proc_root,
        102,
        "/snap/chromium/current/usr/lib/chromium-browser/chrome",
        "--type=renderer",
        f"--user-data-dir={profile}",
    )
    _write_cmdline(
        proc_root,
        103,
        "/bin/bash",
        "-c",
        f"chromium --kiosk --app={url} --user-data-dir={profile}",
    )
    _write_cmdline(
        proc_root,
        104,
        "/usr/bin/chromium",
        "--kiosk",
        f"--app={url}",
        "--user-data-dir=/tmp/unrelated-profile",
    )
    _write_cmdline(
        proc_root,
        105,
        "/usr/bin/chromium",
        "--kiosk",
        "--app=http://127.0.0.1:8770/unrelated.html?kiosk=1",
        f"--user-data-dir={profile}",
    )

    matches = checks.managed_chromium_processes(proc_root, profile)

    assert [match.pid for match in matches] == [101]
    assert matches[0].args[0].endswith("/chrome")


def test_managed_chromium_accepts_snap_flattened_browser_process_title(tmp_path: Path) -> None:
    proc_root = tmp_path / "proc"
    profile = "/home/test/snap/chromium/common/hermes-personal-display-profile"
    process_dir = proc_root / "201"
    process_dir.mkdir(parents=True)
    process_dir.joinpath("exe").symlink_to(
        "/snap/chromium/current/usr/lib/chromium-browser/chrome"
    )
    process_dir.joinpath("cmdline").write_bytes(
        (
            "/snap/chromium/current/usr/lib/chromium-browser/chrome "
            "--password-store=basic --kiosk "
            "--app=http://127.0.0.1:8770/src/character-runtime.html?"
            "kiosk=1&orientation=landscape "
            f"--user-data-dir={profile}"
        ).encode()
        + b"\0"
    )

    matches = checks.managed_chromium_processes(proc_root, profile)

    assert [match.pid for match in matches] == [201]
    assert "--kiosk" in matches[0].args


def test_monitor_compositor_matches_python_entrypoint_not_option_value() -> None:
    script = "/home/test/personal-display/herdr-monitor-raw-compositor.py"

    assert checks._is_monitor_compositor(
        ("/usr/bin/python3", script, "--poll-seconds", "1"), script
    ) is True
    assert checks._is_monitor_compositor(
        (
            "/usr/bin/python3",
            "/home/test/personal-display/display_runtime_checks.py",
            "herdr-monitor",
            "--script",
            script,
        ),
        script,
    ) is False


def _fake_tmux(tmp_path: Path, returncode: int) -> Path:
    tmux = tmp_path / f"tmux-{returncode}"
    tmux.write_text(f"#!/bin/sh\nexit {returncode}\n", encoding="utf-8")
    tmux.chmod(tmux.stat().st_mode | stat.S_IXUSR)
    return tmux


def _write_monitor_processes(proc_root: Path, script: str) -> None:
    _write_cmdline(
        proc_root,
        301,
        "/usr/bin/alacritty",
        "--class",
        "HermesMonitorDisplay",
        "--command",
        "/usr/bin/python3",
        script,
    )
    _write_cmdline(proc_root, 302, "/usr/bin/python3", script, "--poll-seconds", "1")


def test_managed_monitor_requires_one_compositor_and_live_source(tmp_path: Path) -> None:
    proc_root = tmp_path / "proc"
    script = "/home/test/personal-display/herdr-monitor-raw-compositor.py"
    _write_monitor_processes(proc_root, script)

    display = checks.managed_herdr_monitor_display(
        proc_root,
        script=script,
        tmux_socket="display-source",
        tmux_session="display-source",
        tmux_binary=str(_fake_tmux(tmp_path, 0)),
    )

    assert display.healthy is True
    assert display.alacritty_pid == 301
    assert display.compositor_pids == (302,)
    assert display.tmux_session is True


def test_managed_monitor_rejects_missing_source_session(tmp_path: Path) -> None:
    proc_root = tmp_path / "proc"
    script = "/home/test/personal-display/herdr-monitor-raw-compositor.py"
    _write_monitor_processes(proc_root, script)

    display = checks.managed_herdr_monitor_display(
        proc_root,
        script=script,
        tmux_socket="display-source",
        tmux_session="display-source",
        tmux_binary=str(_fake_tmux(tmp_path, 1)),
    )

    assert display.healthy is False
    assert display.tmux_session is False
