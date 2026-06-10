from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import hermes_display_server as server  # noqa: E402


def test_invalid_entertainment_line_cache_entry_is_deleted(tmp_path, monkeypatch) -> None:
    cache_path = tmp_path / "line-cache.json"
    cache_path.write_text(json.dumps({"bad-key": {"line": "hello", "emotion": "malware"}}), encoding="utf-8")
    monkeypatch.setattr(server, "ENTERTAINMENT_LINE_CACHE_PATH", cache_path)
    monkeypatch.setattr(server, "_entertainment_hash", lambda *args: "bad-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    result = server.handle_entertainment_line({"trigger": "tap", "mode": "family", "style": "tiny", "max_chars": 64})

    assert result["ok"] is False
    assert result["fallback"] == "curated"
    assert "bad-key" not in json.loads(cache_path.read_text(encoding="utf-8"))


def test_invalid_micro_show_cache_entry_is_deleted(tmp_path, monkeypatch) -> None:
    cache_path = tmp_path / "line-cache.json"
    cache_path.write_text(json.dumps({"bad-key": {"steps": [5]}}), encoding="utf-8")
    monkeypatch.setattr(server, "ENTERTAINMENT_LINE_CACHE_PATH", cache_path)
    monkeypatch.setattr(server, "_entertainment_hash", lambda *args: "bad-key")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    result = server.handle_entertainment_micro_show({"trigger": "tap", "mode": "family"})

    assert result["ok"] is False
    assert result["fallback"] == "curated"
    assert "bad-key" not in json.loads(cache_path.read_text(encoding="utf-8"))


def test_invalid_daily_creature_cache_is_replaced(tmp_path, monkeypatch) -> None:
    cache_path = tmp_path / "daily-cache.json"
    today = server._usage_today()
    cache_path.write_text(json.dumps({"date": today, "creature": {"name": 123}}), encoding="utf-8")
    monkeypatch.setattr(server, "ENTERTAINMENT_DAILY_CACHE_PATH", cache_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    result = server.handle_daily_creature()

    assert result["ok"] is False
    saved = json.loads(cache_path.read_text(encoding="utf-8"))
    assert saved["date"] == today
    assert isinstance(saved["creature"].get("name"), str)
