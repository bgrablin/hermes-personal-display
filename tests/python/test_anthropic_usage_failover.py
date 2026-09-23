"""Anthropic usage probe: credential failover, scale handling, privacy."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import update_provider_route_rail as updater  # noqa: E402


class _RateLimited(Exception):
    code = 429


class _Response:
    def __init__(self, payload: dict):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def _by_token(monkeypatch: pytest.MonkeyPatch, responses: dict[str, object]) -> list[str]:
    """Route urlopen by the bearer token in the Authorization header; record order."""
    seen: list[str] = []

    def fake_urlopen(request, timeout):
        token = str(request.headers.get("Authorization", "")).replace("Bearer ", "")
        seen.append(token)
        outcome = responses[token]
        if isinstance(outcome, Exception):
            raise outcome
        return _Response(outcome)

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    return seen


def test_rate_limited_top_credential_fails_over_to_the_healthy_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(updater, "_anthropic_pool_tokens", lambda: ["token-top", "token-good"])
    seen = _by_token(monkeypatch, {
        "token-top": _RateLimited("rate limited"),
        "token-good": {"five_hour": {"utilization": 0.0}, "seven_day": {"utilization": 43.0}},
    })

    primary, secondary, _ = updater.fetch_anthropic_headroom()

    assert seen == ["token-top", "token-good"]
    assert primary == pytest.approx(1.0)
    assert secondary == pytest.approx(0.57)


def test_all_credentials_failing_degrades_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_anthropic_pool_tokens", lambda: ["token-a", "token-b"])
    _by_token(monkeypatch, {
        "token-a": _RateLimited("rate limited"),
        "token-b": {"unexpected": "shape"},
    })
    assert updater.fetch_anthropic_headroom() == (None, None, None)


def test_pool_without_tokens_uses_the_hermes_snapshot_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(updater, "_anthropic_pool_tokens", lambda: [])
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "_anthropic_headroom_from_hermes_snapshot", lambda: (0.5, 0.25, 123.0))
    assert updater.fetch_anthropic_headroom() == (0.5, 0.25, 123.0)


def test_probe_failure_logs_no_credential_material(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(updater, "_anthropic_pool_tokens", lambda: ["SECRET-TOKEN-VALUE"])
    _by_token(monkeypatch, {"SECRET-TOKEN-VALUE": _RateLimited("rate limited")})

    updater.fetch_anthropic_headroom()
    captured = capsys.readouterr()

    assert "SECRET-TOKEN-VALUE" not in captured.err
    assert "SECRET-TOKEN-VALUE" not in captured.out
    assert "no credential answered" in captured.err


@pytest.mark.parametrize("used,expected", [(0.43, 0.57), (43.0, 0.57), (0.0, 1.0), (100.0, 0.0)])
def test_utilization_scales_map_to_the_same_headroom(used: float, expected: float) -> None:
    headroom, _ = updater._anthropic_usage_window({"seven_day": {"utilization": used}}, "seven_day")
    assert headroom == pytest.approx(expected)


@pytest.mark.parametrize("payload", [
    {},
    {"seven_day": None},
    {"seven_day": {"utilization": "43"}},
    {"seven_day": {"utilization": 140}},
    {"seven_day": {"utilization": True}},
])
def test_unusable_windows_never_become_headroom(payload: dict) -> None:
    assert updater._anthropic_usage_window(payload, "seven_day") == (None, None)


def test_window_reset_timestamp_is_parsed() -> None:
    headroom, reset_at = updater._anthropic_usage_window(
        {"five_hour": {"utilization": 10.0, "resets_at": "2026-09-22T20:00:00Z"}}, "five_hour"
    )
    assert headroom == pytest.approx(0.9)
    assert reset_at is not None