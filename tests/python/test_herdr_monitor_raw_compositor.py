from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSITOR_PATH = ROOT / "scripts" / "herdr-monitor-raw-compositor.py"
spec = importlib.util.spec_from_file_location("herdr_monitor_raw_compositor", COMPOSITOR_PATH)
assert spec and spec.loader
compositor = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compositor
spec.loader.exec_module(compositor)


def plain(value: str) -> str:
    return compositor.SgrOrControl.sub("", compositor.OSC.sub("", value))


def test_compose_preserves_fixed_source_order_and_canvas_size() -> None:
    rendered = compositor.compose(
        "\033[31mCPU 42%\033[0m\nload 1.0\nignored",
        "HEALTH OK\nignored",
        columns=12,
        rows=4,
        resource_rows=2,
        health_rows=1,
    )
    lines = rendered.split("\r\n")

    assert len(lines) == 4
    assert [plain(line).rstrip() for line in lines[:3]] == ["CPU 42%", "load 1.0", "HEALTH OK"]
    assert all(len(plain(line)) == 12 for line in lines)


def test_ensure_source_recreates_an_invalid_owned_session(monkeypatch) -> None:
    events: list[str] = []
    readiness = iter((False, True))
    monkeypatch.setattr(compositor, "_source_is_ready", lambda: next(readiness))
    monkeypatch.setattr(compositor, "_source_exists", lambda: True)
    monkeypatch.setattr(compositor, "_kill_source", lambda: events.append("kill"))
    monkeypatch.setattr(compositor, "_create_source", lambda: events.append("create"))
    monkeypatch.setattr(compositor, "_wait_for_source_content", lambda: events.append("wait"))

    compositor.ensure_source()

    assert events == ["kill", "create", "wait"]


def test_run_once_cleans_its_owned_source(monkeypatch) -> None:
    events: list[str] = []
    monkeypatch.setattr(compositor, "ensure_source", lambda: events.append("ensure"))
    monkeypatch.setattr(
        compositor,
        "read_source_frame",
        lambda pane, _rows: "CPU 7%" if pane == 0 else "HEALTH OK",
    )
    monkeypatch.setattr(compositor, "render", lambda value: events.append(f"render:{'HEALTH OK' in value}"))
    monkeypatch.setattr(compositor.shutil, "get_terminal_size", lambda _fallback: (192, 65))
    monkeypatch.setattr(compositor, "_source_exists", lambda: True)
    monkeypatch.setattr(compositor, "_kill_source", lambda: events.append("kill"))

    assert compositor.run(poll_seconds=1, once=True) == 0
    assert events == ["ensure", "render:True", "kill"]
