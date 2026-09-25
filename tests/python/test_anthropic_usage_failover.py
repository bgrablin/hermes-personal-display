"""Anthropic usage probe: credential failover, scale handling, privacy."""
from __future__ import annotations

import json
import sys
import urllib.error
from email.message import Message
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import update_provider_route_rail as updater  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_quota_probe_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(updater, "HOME", tmp_path)


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


def test_quota_endpoint_429_backs_off_without_freezing_a_percentage(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    now = [1_790_256_800.0]
    monkeypatch.setattr(updater.time, "time", lambda: now[0])
    monkeypatch.setattr(updater, "_anthropic_pool_tokens", lambda: ["SECRET-TOKEN-VALUE"])
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    attempts = []

    def fake_urlopen(request, timeout):
        attempts.append(request)
        if len(attempts) == 1:
            raise urllib.error.HTTPError(request.full_url, 429, "Rate limited", Message(), None)
        return _Response({"five_hour": {"utilization": 25.0}, "seven_day": {"utilization": 10.0}})

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)
    assert updater.fetch_anthropic_headroom() == (None, None, None)
    now[0] += 240  # The next regular rail refresh must not hammer this endpoint.
    assert updater.fetch_anthropic_headroom() == (None, None, None)
    assert len(attempts) == 1
    state = (tmp_path / ".hermes/state/anthropic-quota-probe.json").read_text()
    assert "SECRET-TOKEN-VALUE" not in state
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_opencode_go_headroom", lambda: (None, None, None, None))
    rows = [{"id": "anthropic", "state": "unknown", "headroom": None}]
    updater.apply_confirmed_quota(rows)
    assert rows[0]["quota_source_state"] == "rate_limited"
    now[0] += 1800
    assert updater.fetch_anthropic_headroom()[:2] == pytest.approx((0.75, 0.9))
    assert len(attempts) == 2


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


def test_percent_scale_one_percent_used_does_not_mean_exhausted() -> None:
    primary, secondary, _ = updater._parse_anthropic_usage({
        "five_hour": {"utilization": 1.0},
        "seven_day": {"utilization": 40.0},
    })
    assert primary == pytest.approx(0.99)
    assert secondary == pytest.approx(0.60)


@pytest.mark.parametrize("five_hour,seven_day", [(1.0, None), (0.5, 0.4)])
def test_usage_scale_without_percent_evidence_stays_unknown(five_hour: float, seven_day: float | None) -> None:
    payload = {"five_hour": {"utilization": five_hour}}
    if seven_day is not None:
        payload["seven_day"] = {"utilization": seven_day}
    assert updater._parse_anthropic_usage(payload) == (None, None, None)


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