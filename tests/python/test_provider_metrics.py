from __future__ import annotations

import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import hermes_display_server as server  # noqa: E402
import update_provider_route_rail as updater  # noqa: E402


def test_provider_plan_includes_xai_as_fifth_unmetered_route() -> None:
    xai = updater.PROVIDER_PLAN["xai-oauth"]
    assert xai["label"] == "XAI"
    assert xai["rank"] == 5
    assert xai["request_cap"] is None


def test_route_availability_never_fabricates_quota(monkeypatch: pytest.MonkeyPatch) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(
        updater,
        "load_config_fallback_routes",
        lambda: {"xai-oauth": ("xai-oauth", "grok-code-fast-1")},
    )
    monkeypatch.setattr(updater, "route_resolves", lambda provider, model: True)
    updater.apply_route_availability(providers)
    xai = next(row for row in providers if row["id"] == "xai-oauth")
    assert xai["state"] == "inferred"
    assert xai["headroom"] is None


def test_server_accepts_five_sanitized_routes_including_xai(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    route_path = tmp_path / "provider_route_rail.json"
    providers = [
        {
            "id": provider_id,
            "label": label,
            "rank": rank,
            "state": "inferred" if provider_id == "xai-oauth" else "unknown",
            "headroom": None,
            "secondary_headroom": None,
            "reachable": True,
            "last_used_age_s": 0,
            "stale_age_s": None,
            "tier_label": "SUPERGROK" if provider_id == "xai-oauth" else None,
            "secret": "must-not-pass",
        }
        for rank, (provider_id, label) in enumerate(
            [
                ("openai-codex", "CHATGPT"),
                ("anthropic", "CLAUDE"),
                ("nous", "GEMINI"),
                ("copilot", "COPILOT"),
                ("xai-oauth", "XAI"),
            ],
            start=1,
        )
    ]
    route_path.write_text(
        __import__("json").dumps(
            {"as_of_ms": int(time.time() * 1000), "active_provider_id": "xai-oauth", "providers": providers}
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "PROVIDER_ROUTE_RAIL_PATH", route_path)
    rail = server.load_provider_route_rail()
    assert len(rail["providers"]) == 5
    assert rail["providers"][-1]["id"] == "xai-oauth"
    assert "secret" not in rail["providers"][-1]


class _FakeCatalogResponse:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return b'{"data":[{"id":"gpt-test"}]}'


class _FakeCatalogPool:
    def entries(self):
        return [SimpleNamespace(runtime_api_key="catalog-token")]


def test_copilot_catalog_reachability_uses_read_only_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    import types

    fake_agent = types.ModuleType("agent")
    fake_pool_module = types.ModuleType("agent.credential_pool")
    setattr(fake_pool_module, "load_pool", lambda provider: _FakeCatalogPool())
    setattr(fake_agent, "credential_pool", fake_pool_module)
    monkeypatch.setitem(sys.modules, "agent", fake_agent)
    monkeypatch.setitem(sys.modules, "agent.credential_pool", fake_pool_module)
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    observed = {}

    def fake_urlopen(request, timeout):
        observed["url"] = request.full_url
        observed["method"] = request.method
        observed["timeout"] = timeout
        return _FakeCatalogResponse()

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)
    assert updater.fetch_copilot_reachable() is True
    assert observed == {"url": "https://api.githubcopilot.com/models", "method": "GET", "timeout": 10.0}


def test_verified_copilot_reachability_has_no_fake_headroom(monkeypatch: pytest.MonkeyPatch) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_copilot_reachable", lambda: True)
    updater.apply_verified_reachability(providers)
    copilot = next(row for row in providers if row["id"] == "copilot")
    assert copilot["state"] == "inferred"
    assert copilot["headroom"] is None
    assert copilot["tier_label"] == "CATALOG"


def test_nous_portal_usage_becomes_confirmed_headroom(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_at = time.time() + 86_400
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_anthropic_headroom", lambda: (None, None, None))
    monkeypatch.setattr(updater, "fetch_nous_headroom", lambda: (0.37, "PLUS", reset_at))
    updater.apply_confirmed_quota(providers)
    nous = next(row for row in providers if row["id"] == "nous")
    assert nous["state"] == "confirmed"
    assert nous["headroom"] == pytest.approx(0.37)
    assert nous["tier_label"] == "PLUS"
    assert nous["reset_at_epoch_s"] == reset_at


def test_anthropic_confirmed_headroom_preserves_primary_reset(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_at = time.time() + 3600
    providers, _ = updater.build_providers(time.time(), {})
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_anthropic_headroom", lambda: (0.25, 0.8, reset_at))
    monkeypatch.setattr(updater, "fetch_nous_headroom", lambda: (None, None, None))
    updater.apply_confirmed_quota(providers)
    claude = next(row for row in providers if row["id"] == "anthropic")
    assert claude["reset_at_epoch_s"] == reset_at
