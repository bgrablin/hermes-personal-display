from __future__ import annotations

import datetime as dt
import json
import sys
import time
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import update_provider_route_rail as updater  # noqa: E402
import hermes_display_server as server  # noqa: E402


class _FakeEntry:
    runtime_api_key = "test-token"
    runtime_base_url = "https://chatgpt.com/backend-api/codex"
    access_token = "test-token"
    extra = {}

    def __init__(self, *, last_status="", reset_at=None):
        self.last_status = last_status
        self.last_error_reset_at = reset_at


class _FakePool:
    def __init__(self, entry):
        self._entries = [entry]

    def select(self):
        return None

    def peek(self):
        # Mirrors the real exhausted-path behavior: usable peek skips exhausted
        # credentials, but the read-only WHAM/usage call can still use the entry.
        return None


class _FakeResponse:
    status = 200

    def __init__(self, payload):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def _install_fake_credential_pool(monkeypatch: pytest.MonkeyPatch, entry: _FakeEntry) -> None:
    package = types.ModuleType("agent")
    credential_pool = types.ModuleType("agent.credential_pool")
    credential_pool.load_pool = lambda provider: _FakePool(entry)  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "agent", package)
    monkeypatch.setitem(sys.modules, "agent.credential_pool", credential_pool)
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)


def test_codex_headroom_trusts_future_credential_exhaustion_over_wham_rollover(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_at = time.time() + 3600
    _install_fake_credential_pool(monkeypatch, _FakeEntry(last_status="exhausted", reset_at=reset_at))
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse(
            {
                "plan_type": "prolite",
                "rate_limit": {
                    "allowed": True,
                    "limit_reached": False,
                    "primary_window": {
                        "used_percent": 0,
                        "reset_at": time.time() + 18_000,
                    },
                    "secondary_window": {
                        "used_percent": 0,
                        "reset_at": time.time() + 604_800,
                    },
                },
            }
        ),
    )

    headroom, secondary, tier, observed_reset = updater.fetch_codex_headroom()

    assert headroom == 0.0
    assert secondary is None
    assert tier == "PROLITE"
    assert observed_reset == reset_at


def test_codex_headroom_refreshes_selected_pool_credential_before_usage_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    stale = _FakeEntry()
    stale.runtime_api_key = "stale-token"
    fresh = _FakeEntry()
    fresh.runtime_api_key = "fresh-token"

    class _RefreshingPool:
        _entries = [stale]

        def peek(self):
            return stale

        def select(self):
            return fresh

    package = types.ModuleType("agent")
    credential_pool = types.ModuleType("agent.credential_pool")
    setattr(credential_pool, "load_pool", lambda provider: _RefreshingPool())
    monkeypatch.setitem(sys.modules, "agent", package)
    monkeypatch.setitem(sys.modules, "agent.credential_pool", credential_pool)
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)

    def fake_urlopen(request, timeout):
        assert request.headers["Authorization"] == "Bearer fresh-token"
        return _FakeResponse(
            {
                "plan_type": "prolite",
                "rate_limit": {
                    "primary_window": {
                        "used_percent": 81,
                        "reset_at": time.time() + 604_800,
                        "limit_window_seconds": 604_800,
                    }
                },
            }
        )

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)

    headroom, secondary, tier, _reset_at = updater.fetch_codex_headroom()

    assert headroom == pytest.approx(0.19)
    assert secondary is None
    assert tier == "PROLITE 7D"


def test_codex_without_confirmed_quota_never_fabricates_request_headroom() -> None:
    now = time.time()
    providers, _ = updater.build_providers(
        now,
        {"openai-codex": {"requests": 280, "last_ts": now - 30}},
    )

    codex = next(row for row in providers if row["id"] == "openai-codex")
    assert codex["state"] == "unknown"
    assert codex["headroom"] is None


def test_config_fallback_routes_ignore_malformed_string_without_losing_primary_route(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config_dir = tmp_path / ".hermes"
    config_dir.mkdir()
    (config_dir / "config.yaml").write_text(
        """model:
  provider: openai-codex
  default: gpt-5.6-sol
fallback_providers: '[{"provider":"opencode-go","model":"glm-5.3-flash"}]'
""",
        encoding="utf-8",
    )
    monkeypatch.setattr(updater, "HOME", tmp_path)

    assert updater.load_config_fallback_routes() == {
        "openai-codex": ("openai-codex", "gpt-5.6-sol")
    }


def test_display_server_passes_route_reset_at_epoch_s(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    reset_at = time.time() + 1800
    route_path = tmp_path / "provider_route_rail.json"
    route_path.write_text(
        json.dumps(
            {
                "as_of_ms": int(time.time() * 1000),
                "active_provider_id": "openai-codex",
                "providers": [
                    {
                        "id": "openai-codex",
                        "label": "CHATGPT",
                        "tier_label": "PROLITE 5H",
                        "rank": 1,
                        "state": "confirmed",
                        "headroom": 0.0,
                        "secondary_headroom": None,
                        "reachable": True,
                        "last_used_age_s": 0,
                        "stale_age_s": None,
                        "reset_at_epoch_s": reset_at,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "PROVIDER_ROUTE_RAIL_PATH", route_path)

    rail = server.load_provider_route_rail()

    assert rail["providers"][0]["headroom"] == 0.0
    assert rail["providers"][0]["reset_at_epoch_s"] == pytest.approx(reset_at)


def _opencode_go_usage_payload(*, rolling=None, weekly=None, monthly=None) -> dict:
    def window(value):
        if value is None:
            return None
        percent, reset = value
        window_data = {"status": "ok", "percent": percent}
        if reset:
            window_data["resetsAt"] = reset
        return window_data

    return {
        "usage": {
            "rolling": window(rolling),
            "weekly": window(weekly),
            "monthly": window(monthly),
        }
    }


def test_opencode_go_usage_returns_confirmed_headroom(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "go-token")
    observed = {}
    reset_at = "2026-09-14T04:10:39.163Z"
    expected_reset = dt.datetime.fromisoformat(reset_at.replace("Z", "+00:00")).timestamp()

    def fake_urlopen(request, timeout):
        observed["url"] = request.full_url
        observed["authorization"] = request.headers.get("Authorization")
        observed["timeout"] = timeout
        return _FakeResponse(
            _opencode_go_usage_payload(
                rolling=(3, reset_at),
                weekly=(52, "2026-09-14T00:00:00.163Z"),
                monthly=(0, "2026-10-13T23:09:00.893Z"),
            )
        )

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)

    headroom, secondary, tier, observed_reset = updater.fetch_opencode_go_headroom()

    assert headroom == pytest.approx(0.97)
    assert secondary == pytest.approx(0.48)
    assert tier == "GO"
    assert observed_reset == pytest.approx(expected_reset)
    assert observed == {
        "url": updater.OPENCODE_GO_USAGE_URL,
        "authorization": "Bearer go-token",
        "timeout": 12.0,
    }


def test_opencode_go_missing_key_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)

    assert updater.fetch_opencode_go_headroom() == (None, None, None, None)


def test_opencode_go_endpoint_failure_does_not_fabricate_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "go-token")

    def fail_urlopen(request, timeout):
        raise OSError("usage endpoint unavailable")

    monkeypatch.setattr(updater.urllib.request, "urlopen", fail_urlopen)

    assert updater.fetch_opencode_go_headroom() == (None, None, None, None)


@pytest.mark.parametrize(
    "payload",
    [
        _opencode_go_usage_payload(rolling=None, weekly=(1, "2026-09-14T00:00:00Z")),
        _opencode_go_usage_payload(rolling=("bad", None)),
        _opencode_go_usage_payload(rolling=(101, None)),
        _opencode_go_usage_payload(rolling=(-1, None)),
        _opencode_go_usage_payload(rolling=(float("inf"), None)),
        {"usage": {"rolling": {"status": "limited", "percent": 100}}},
        {"usage": {"rolling": "not-a-window"}},
        {},
        None,
    ],
)
def test_opencode_go_malformed_windows_fail_closed(
    payload: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "go-token")
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse(payload if payload is not None else {}),
    )

    assert updater.fetch_opencode_go_headroom() == (None, None, None, None)


def test_opencode_go_weekly_absence_keeps_rolling_headroom(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "go-token")
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeResponse(_opencode_go_usage_payload(rolling=(60, None))),
    )

    headroom, secondary, tier, reset_at = updater.fetch_opencode_go_headroom()

    assert headroom == pytest.approx(0.4)
    assert secondary is None
    assert tier == "GO"
    assert reset_at is None


def test_confirmed_opencode_go_usage_overrides_unknown_state(monkeypatch: pytest.MonkeyPatch) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    reset_at = time.time() + 86_400
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_anthropic_headroom", lambda: (None, None, None))
    monkeypatch.setattr(
        updater,
        "fetch_opencode_go_headroom",
        lambda: (0.42, 0.91, "GO", reset_at),
    )

    updater.apply_confirmed_quota(providers)

    go = next(row for row in providers if row["id"] == "opencode-go")
    assert go["state"] == "confirmed"
    assert go["headroom"] == pytest.approx(0.42)
    assert go["secondary_headroom"] == pytest.approx(0.91)
    assert go["tier_label"] == "GO"
    assert go["reset_at_epoch_s"] == reset_at


def test_alibaba_reachable_route_becomes_inferred_ready_without_headroom(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_alibaba_reachability", lambda: True)
    updater.apply_alibaba_readiness(providers)
    alibaba = next(row for row in providers if row["id"] == "alibaba-token-plan")
    assert alibaba["state"] == "inferred"
    assert alibaba["headroom"] is None
    assert alibaba["tier_label"] == "TOKEN PLAN"


def test_alibaba_unreachable_route_stays_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_alibaba_reachability", lambda: False)
    updater.apply_alibaba_readiness(providers)
    alibaba = next(row for row in providers if row["id"] == "alibaba-token-plan")
    assert alibaba["state"] == "unknown"
    assert alibaba["headroom"] is None


def test_anthropic_confirmed_headroom_preserves_primary_reset(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_at = time.time() + 3600
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_anthropic_headroom", lambda: (0.25, 0.8, reset_at))
    monkeypatch.setattr(updater, "fetch_opencode_go_headroom", lambda: (None, None, None, None))
    updater.apply_confirmed_quota(providers)
    claude = next(row for row in providers if row["id"] == "anthropic")
    assert claude["reset_at_epoch_s"] == reset_at
