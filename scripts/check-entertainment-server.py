#!/usr/bin/env python3
"""Focused checks for Hermes entertainment server safety helpers."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("hermes_display_server", ROOT / "scripts" / "hermes_display_server.py")
assert spec is not None and spec.loader is not None
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def expect_raises(fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except Exception:
        return
    raise AssertionError(f"expected {fn.__name__} to reject input")


def main() -> int:
    original_key = os.environ.pop("OPENAI_API_KEY", None)
    try:
        key_a = server.entertainment_tts_cache_key("gpt-4o-mini-tts", "marin", "small bright", "hey, hello!")
        key_b = server.entertainment_tts_cache_key("gpt-4o-mini-tts", "marin", "small bright", "hey, hello!")
        key_c = server.entertainment_tts_cache_key("gpt-4o-mini-tts", "coral", "small bright", "hey, hello!")
        assert len(key_a) == 64 and key_a == key_b and key_a != key_c

        result = server.handle_entertainment_tts({
            "sequence_id": "curious_orb",
            "line_id": "curious_orb.hello.001",
            "text": "hey, hello!",
            "voice": "marin",
            "style": "small cheerful robot friend, warm, playful, not loud",
        })
        assert result["ok"] is False and result["fallback"] == "browser_tts"

        expect_raises(server.handle_entertainment_tts, {"sequence_id": "../../bad", "text": "hello"})
        expect_raises(server.handle_entertainment_tts, {"sequence_id": "curious_orb", "text": "x" * 97})
        expect_raises(server.handle_entertainment_tts, {"sequence_id": "curious_orb", "text": "secret token: abcdefghijklmnopqrstuvwxyz"})
        expect_raises(server.handle_entertainment_tts, {"sequence_id": "curious_orb", "text": "/home/operator/.ssh/id_ed25519"})

        safe_line = server.validate_entertainment_line({
            "line": "Tiny comet!",
            "caption": "Tiny comet!",
            "emotion": "delighted",
            "sfx_hint": "whoosh",
            "particle_theme": "comets",
        })
        assert safe_line["line"] == "Tiny comet!"
        expect_raises(server.validate_entertainment_line, {"line": "Tell me your name?", "caption": "Tell me your name?", "emotion": "nosy", "sfx_hint": "none", "particle_theme": "stars"})

        line = server.handle_entertainment_line({"trigger": "boop", "mode": "idle_watch", "style": "tiny friendly robot companion", "max_chars": 48})
        assert line["fallback"] == "curated" and len(line["line"]) <= 64

        micro = server.handle_entertainment_micro_show({"trigger": "micro_show", "mode": "idle_watch"})
        assert micro["fallback"] == "curated" and len(micro["steps"]) <= 12 and micro["duration_ms"] <= 12000
        expect_raises(server.validate_micro_show, {"title": "Bad", "line": "Bad", "steps": [{"at_ms": 0, "event": "SCRIPT"}]})
        expect_raises(server.validate_micro_show, {"title": "Bad", "line": "Bad", "steps": [{"at_ms": 0, "event": "CAPTION", "html": "<b>bad</b>"}]})
        expect_raises(server.validate_micro_show, {"title": "Bad", "line": "Bad", "steps": [{"at_ms": 0, "event": "SFX", "asset": "https://example.invalid/a.mp3"}]})

        creature = server.handle_daily_creature()
        assert creature["sequence_hint"] in server.entertainment_sequence_ids()
        assert "ChildOne" not in creature["line"] and "ChildTwo" not in creature["line"] and "ChildThree" not in creature["line"]

        # Server allowlists must come from sequences.json, not a duplicated literal set.
        sequence_ids = server.entertainment_sequence_ids()
        assert {"curious_orb", "feathered_flyby", "mini_showtime", "peek_a_blink"}.issubset(sequence_ids)

        # Usage budgets should allow cache hits, but cap cache misses and generated lines.
        server.ENTERTAINMENT_USAGE_PATH = server.DISPLAY_DIR / "test_entertainment_usage.json"
        server.atomic_json_write(server.ENTERTAINMENT_USAGE_PATH, {
            "date": server._usage_today(),
            "hours": {server._usage_hour(): {"tts_cache_misses": server.MAX_SERVER_TTS_CACHE_MISSES_PER_HOUR}},
            "tts_cache_misses": 0,
            "line_requests": 0,
        })
        assert server.entertainment_budget_allowed("tts_cache_miss") is False

        # Watch animation logs must be bounded so the kiosk audit file cannot grow forever.
        server.WATCH_ANIMATION_LOG_PATH = server.DISPLAY_DIR / "test_watch_animation_triggers.jsonl"
        if server.WATCH_ANIMATION_LOG_PATH.exists():
            server.WATCH_ANIMATION_LOG_PATH.unlink()
        for idx in range(505):
            record = server.write_watch_animation_log({"sequence_id": "curious_orb", "event": "tts_played", "line_id": f"curious_orb.hello.{idx:03d}", "cached": True})
        lines = server.WATCH_ANIMATION_LOG_PATH.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 500
        assert record["event"] == "tts_played" and record["cached"] is True and "text" not in record
    finally:
        if original_key is not None:
            os.environ["OPENAI_API_KEY"] = original_key
    print("entertainment server checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
