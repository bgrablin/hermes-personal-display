from __future__ import annotations

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
    credential_pool.load_pool = lambda provider: _FakePool(entry)
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
fallback_providers: '[{"provider":"copilot","model":"gpt-5.4"}]'
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


def test_display_server_passes_sanitized_copilot_credit_usage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    route_path = tmp_path / "provider_route_rail.json"
    route_path.write_text(
        json.dumps(
            {
                "as_of_ms": int(time.time() * 1000),
                "active_provider_id": "copilot",
                "providers": [
                    {
                        "id": "copilot",
                        "label": "COPILOT",
                        "tier_label": "PRO",
                        "rank": 4,
                        "state": "confirmed",
                        "headroom": 0.7,
                        "secondary_headroom": None,
                        "credits_used": 450.25,
                        "credits_limit": 1500,
                        "reachable": True,
                        "last_used_age_s": 0,
                        "stale_age_s": None,
                        "account": "must-not-pass",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "PROVIDER_ROUTE_RAIL_PATH", route_path)

    rail = server.load_provider_route_rail()

    copilot = rail["providers"][0]
    assert copilot["credits_used"] == pytest.approx(450.25)
    assert copilot["credits_limit"] == pytest.approx(1500)
    assert "account" not in copilot


def test_display_server_rejects_invalid_copilot_credit_usage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    route_path = tmp_path / "provider_route_rail.json"
    route_path.write_text(
        json.dumps(
            {
                "as_of_ms": int(time.time() * 1000),
                "providers": [
                    {
                        "id": "copilot",
                        "label": "COPILOT",
                        "rank": 4,
                        "state": "confirmed",
                        "headroom": None,
                        "credits_used": "not-a-number",
                        "credits_limit": -1,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "PROVIDER_ROUTE_RAIL_PATH", route_path)

    copilot = server.load_provider_route_rail()["providers"][0]

    assert copilot["credits_used"] is None
    assert copilot["credits_limit"] is None


def test_display_server_expires_copilot_credit_usage_with_old_route_artifact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    route_path = tmp_path / "provider_route_rail.json"
    route_path.write_text(
        json.dumps(
            {
                "as_of_ms": int((time.time() - 3_700) * 1000),
                "active_provider_id": "copilot",
                "providers": [
                    {
                        "id": "copilot",
                        "label": "COPILOT",
                        "tier_label": "PRO",
                        "rank": 4,
                        "state": "confirmed",
                        "headroom": 0.7,
                        "credits_used": 450,
                        "credits_limit": 1500,
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "PROVIDER_ROUTE_RAIL_PATH", route_path)

    rail = server.load_provider_route_rail()
    copilot = rail["providers"][0]

    assert copilot["state"] == "unknown"
    assert copilot["headroom"] is None
    assert copilot["credits_used"] is None
    assert copilot["credits_limit"] is None
    assert rail["active_provider_id"] == ""
