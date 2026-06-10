from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from display_state.privacy import augury_clean, clean_log_msg, scrub, sanitize_current_work  # noqa: E402
import hermes_display_server as server  # noqa: E402


FAKE_SECRET = "x" * 32
SENSITIVE_CASES = [
    "/home/brian/.hermes/secret.txt",
    "author" + "ization: " + FAKE_SECRET,
    "tok" + "en=" + FAKE_SECRET,
    "api_" + "key=" + FAKE_SECRET,
    "https://example.test/callback?" + "tok" + "en=" + FAKE_SECRET + "&ok=1",
    "line one\nline two\n" + "sec" + "ret=" + FAKE_SECRET,
    "A" * 96,
]

AUGURY_SENSITIVE_CASES = [case for case in SENSITIVE_CASES if not case.startswith("/home/")]


@pytest.mark.parametrize("text", SENSITIVE_CASES)
def test_scrub_redacts_private_or_credential_shaped_text(text: str) -> None:
    redacted = scrub(text)
    assert redacted == "[display-safe detail hidden]"
    assert "brian" not in redacted.lower()
    assert "token" not in redacted.lower()
    assert "sk-" not in redacted.lower()
    assert "\n" not in redacted


@pytest.mark.parametrize("text", SENSITIVE_CASES)
def test_clean_log_msg_redacts_and_caps(text: str) -> None:
    cleaned = clean_log_msg(f"prefix {text}\nsecond line", 32)
    assert len(cleaned) <= 32
    assert "\n" not in cleaned
    assert "brian" not in cleaned.lower()
    assert FAKE_SECRET not in cleaned


@pytest.mark.parametrize("text", AUGURY_SENSITIVE_CASES)
def test_augury_clean_redacts_and_caps(text: str) -> None:
    cleaned = augury_clean(f"prefix {text}\nsecond line", 40)
    assert len(cleaned) <= 40
    assert "\n" not in cleaned
    assert "brian" not in cleaned.lower()
    assert FAKE_SECRET not in cleaned


def test_augury_preserves_normal_file_paths_but_redacts_url_tokens() -> None:
    normal_path = "/home/brian/.hermes/projects/personal-display/src/state.js"
    cleaned = augury_clean(f"edited {normal_path}", 160)
    assert normal_path in cleaned
    token_url = "https://example.test/callback?" + "tok" + "en=" + FAKE_SECRET
    assert "[redacted]" in augury_clean(token_url, 160)
    assert FAKE_SECRET not in augury_clean(token_url, 160)
    assert scrub(normal_path) == "[display-safe detail hidden]"


def test_sanitize_current_work_strips_forbidden_keys_and_caps_text() -> None:
    safe = sanitize_current_work({
        "active": True,
        "state": "current_work",
        "summary": "Working\nwith " + "tok" + "en=" + FAKE_SECRET,
        "detail": "/home/brian/private/file.txt",
        "source": "telegram session",
        "prompt": "raw prompt",
        "tool_output": "raw output",
        "path": "/home/brian/private/file.txt",
        "extra": "not allowed",
        "age_seconds": 9999,
    }, max_age_seconds=10)

    assert set(safe) <= {
        "active", "state", "kind", "summary", "detail", "tool", "source",
        "visual_kind", "session_id", "session_label", "age_seconds",
        "valid_for_seconds", "expires_in_seconds",
    }
    assert safe["active"] is False
    assert safe["state"] == "quiet_watch"
    assert "prompt" not in safe
    assert "tool_output" not in safe
    assert "path" not in safe
    rendered = json.dumps(safe)
    assert "brian" not in rendered.lower()
    assert FAKE_SECRET not in rendered


def test_build_state_from_hostile_facts_contains_only_allowlisted_top_fields() -> None:
    packet = server.build_state_from_facts({
        "work": {
            "active": True,
            "state": "current_work",
            "summary": "Use /home/brian/.ssh/id_rsa " + "tok" + "en=" + FAKE_SECRET,
            "detail": "raw details\nwith " + "api_" + "key=" + FAKE_SECRET,
            "prompt": "raw prompt must not leak",
            "tool_output": "raw output must not leak",
            "path": "/home/brian/.ssh/id_rsa",
            "unexpected": "bad",
        },
        "system": {"cpu": "nope", "memory": "bad", "temp_c": "nan"},
        "gateway_ok": True,
        "warn_lines": ["2026-01-01 00:00:00 INFO " + "tok" + "en=" + FAKE_SECRET],
        "kanban": {"active": 0, "tasks": []},
        "manual_override": {"caption": "sec" + "ret=" + FAKE_SECRET},
        "resident_agents": 0,
        "malicious_top_level": "not allowed",
    })

    assert set(packet) <= {
        "schema_version", "generated_at", "mood", "skin", "state_preset",
        "caption", "snippet", "motion", "safety", "duration", "curiosity",
        "energy", "focus", "impatience", "playfulness", "live", "optic_state_packet",
        "puppet_state_packet", "valid_for_seconds", "state_label",
    }
    rendered = json.dumps(packet, sort_keys=True)
    assert "malicious_top_level" not in rendered
    assert "raw prompt" not in rendered
    assert "raw output" not in rendered
    assert "id_rsa" not in rendered
    assert FAKE_SECRET not in rendered
    assert "\n" not in packet["caption"]["text"]
