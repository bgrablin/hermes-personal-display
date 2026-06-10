from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import hermes_display_server as server  # noqa: E402


def test_persona_history_is_bounded(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(server, "DISPLAY_STATE_PATH", tmp_path / "display_state.json")
    monkeypatch.setattr(server, "PERSONA_PACKET_PATH", tmp_path / "persona_packet.json")
    monkeypatch.setattr(server, "OPTIC_STATE_PATH", tmp_path / "optic_state.json")
    monkeypatch.setattr(server, "PUPPET_STATE_PATH", tmp_path / "puppet_state.json")
    monkeypatch.setattr(server, "PERSONA_HISTORY_PATH", tmp_path / "persona_history.jsonl")
    monkeypatch.setattr(server, "PERSONA_HISTORY_MAX_LINES", 3)

    for index in range(8):
        state = {"generated_at": f"2026-01-01T00:00:{index:02d}Z", "mood": "idle", "skin": "classic", "state_preset": "quiet_watch"}
        server.persist_display_bus(state, {"ok": True}, {"mode": f"mode-{index}"})

    lines = server.PERSONA_HISTORY_PATH.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 3
    assert json.loads(lines[0])["optic_mode"] == "mode-5"
    assert json.loads(lines[-1])["optic_mode"] == "mode-7"


def test_cached_build_state_reuses_value_within_ttl(monkeypatch) -> None:
    calls = {"count": 0}

    def fake_build_state() -> dict:
        calls["count"] += 1
        return {"generated_at": datetime.now(timezone.utc).isoformat(), "count": calls["count"]}

    monkeypatch.setattr(server, "build_state", fake_build_state)
    monkeypatch.setattr(server, "HERMES_STATE_CACHE_TTL_SECONDS", 60.0)
    server.clear_state_cache()

    first = server.cached_build_state()
    second = server.cached_build_state()

    assert calls["count"] == 1
    assert second == first
    second["count"] = 999
    assert server.cached_build_state()["count"] == 1

    server.clear_state_cache()
    assert server.cached_build_state()["count"] == 2


def test_reserve_entertainment_budget_is_bounded(monkeypatch, tmp_path: Path) -> None:
    usage_path = tmp_path / "usage.json"
    monkeypatch.setattr(server, "ENTERTAINMENT_USAGE_PATH", usage_path)
    monkeypatch.setattr(server, "MAX_SERVER_LINE_GENERATIONS_PER_DAY", 2)

    assert server.reserve_entertainment_budget("line_generation") is True
    assert server.reserve_entertainment_budget("line_generation") is True
    assert server.reserve_entertainment_budget("line_generation") is False

    usage = json.loads(usage_path.read_text(encoding="utf-8"))
    assert usage["line_requests"] == 2
