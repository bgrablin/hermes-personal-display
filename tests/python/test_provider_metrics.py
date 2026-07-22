from __future__ import annotations

import datetime as dt
import json
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


class _FakeBillingResponse:
    status = 200

    def __init__(self, payload):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


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


def test_copilot_billing_usage_returns_confirmed_pro_headroom(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_PLAN", "pro")
    monkeypatch.delenv("HERMES_DISPLAY_COPILOT_CREDIT_LIMIT", raising=False)
    observed = {}

    def fake_urlopen(request, timeout):
        observed["url"] = request.full_url
        observed["authorization"] = request.headers.get("Authorization")
        observed["api_version"] = request.headers.get("X-github-api-version")
        observed["timeout"] = timeout
        return _FakeBillingResponse(
            {
                "usageItems": [
                    {
                        "unitType": "ai-credits",
                        "grossQuantity": 300,
                        "discountQuantity": 200,
                        "netQuantity": 100,
                    },
                    {
                        "unitType": "ai-credits",
                        "grossQuantity": 150,
                        "discountQuantity": 150,
                        "netQuantity": 0,
                    },
                ]
            }
        )

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)

    usage = updater.fetch_copilot_usage()

    assert usage is not None
    assert usage["credits_used"] == pytest.approx(450)
    assert usage["credits_limit"] == pytest.approx(1500)
    assert usage["headroom"] == pytest.approx(0.7)
    assert usage["tier_label"] == "PRO"
    assert usage["reset_at_epoch_s"] > time.time()
    now = dt.datetime.now(dt.timezone.utc)
    assert observed == {
        "url": f"https://api.github.com/users/bgrablin/settings/billing/ai_credit/usage?year={now.year}&month={now.month}",
        "authorization": "Bearer billing-token",
        "api_version": "2026-03-10",
        "timeout": 12.0,
    }


def test_copilot_billing_usage_without_limit_reports_used_credits_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")
    monkeypatch.delenv("HERMES_DISPLAY_COPILOT_PLAN", raising=False)
    monkeypatch.delenv("HERMES_DISPLAY_COPILOT_CREDIT_LIMIT", raising=False)
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeBillingResponse(
            {"usageItems": [{"unitType": "ai-credits", "grossQuantity": 125.5}]}
        ),
    )

    usage = updater.fetch_copilot_usage()

    assert usage is not None
    assert usage["credits_used"] == pytest.approx(125.5)
    assert usage["credits_limit"] is None
    assert usage["headroom"] is None
    assert usage["tier_label"] == "CREDITS"


@pytest.mark.parametrize(
    "usage_items",
    [
        [{"unitType": "ai-credits", "grossQuantity": "not-a-number"}],
        [{"unitType": "other", "grossQuantity": 125}],
        [{"unitType": "ai-credits", "grossQuantity": float("inf")}],
        [{"unitType": "ai-credits", "grossQuantity": -1}],
        [None],
        [
            {"unitType": "ai-credits", "grossQuantity": 25},
            {"unitType": "future-credit-unit", "grossQuantity": 500},
        ],
    ],
)
def test_copilot_billing_rejects_malformed_usage_items(
    usage_items: list[object], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_PLAN", "pro")
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeBillingResponse({"usageItems": usage_items}),
    )

    assert updater.fetch_copilot_usage() is None


def test_copilot_billing_accepts_empty_usage_items(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_PLAN", "pro")
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeBillingResponse({"usageItems": []}),
    )

    usage = updater.fetch_copilot_usage()

    assert usage is not None
    assert usage["credits_used"] == 0.0
    assert usage["credits_limit"] == 1500.0
    assert usage["headroom"] == 1.0


def test_invalid_explicit_copilot_account_does_not_fall_back_to_token_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bad/account")
    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request.full_url)
        return _FakeBillingResponse({"login": "token-owner"})

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)

    assert updater._copilot_billing_account("billing-token") is None
    assert requests == []


def test_unset_copilot_account_uses_token_owner(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HERMES_DISPLAY_COPILOT_ACCOUNT", raising=False)
    requests = []

    def fake_urlopen(request, timeout):
        requests.append(request.full_url)
        return _FakeBillingResponse({"login": "token-owner"})

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)

    assert updater._copilot_billing_account("billing-token") == "token-owner"
    assert requests == ["https://api.github.com/user"]


@pytest.mark.parametrize("invalid_limit", ["0", "-1", "nan", "inf", "bogus", "1000000001"])
def test_invalid_explicit_copilot_limit_fails_closed(
    invalid_limit: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_PLAN", "pro")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_CREDIT_LIMIT", invalid_limit)

    assert updater._copilot_credit_limit() is None


def test_invalid_explicit_copilot_limit_suppresses_percentage_headroom(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_PLAN", "pro")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_CREDIT_LIMIT", "not-a-limit")
    monkeypatch.setattr(
        updater.urllib.request,
        "urlopen",
        lambda request, timeout: _FakeBillingResponse(
            {"usageItems": [{"unitType": "ai-credits", "grossQuantity": 125}]}
        ),
    )

    usage = updater.fetch_copilot_usage()

    assert usage is not None
    assert usage["credits_used"] == pytest.approx(125)
    assert usage["credits_limit"] is None
    assert usage["headroom"] is None


def test_copilot_billing_can_reuse_github_cli_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    gh_bin = tmp_path / "gh"
    gh_bin.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", gh_bin)
    for name in ("HERMES_DISPLAY_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "COPILOT_GITHUB_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    observed = {}

    def fake_run(args, **kwargs):
        observed["args"] = args
        observed["kwargs"] = kwargs
        return SimpleNamespace(returncode=0, stdout="cli-token\n")

    monkeypatch.setattr(updater.subprocess, "run", fake_run)

    assert updater._copilot_billing_tokens() == ["cli-token"]
    assert observed["args"] == [str(gh_bin), "auth", "token"]
    assert observed["kwargs"]["timeout"] == 5
    assert observed["kwargs"]["capture_output"] is True


def test_copilot_billing_failure_does_not_fabricate_usage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "_load_hermes_env_and_path", lambda: None)
    monkeypatch.setattr(updater, "GH_BIN", tmp_path / "missing-gh")
    monkeypatch.setenv("HERMES_DISPLAY_GITHUB_TOKEN", "billing-token")
    monkeypatch.setenv("HERMES_DISPLAY_COPILOT_ACCOUNT", "bgrablin")

    def fail_urlopen(request, timeout):
        raise OSError("billing unavailable")

    monkeypatch.setattr(updater.urllib.request, "urlopen", fail_urlopen)

    assert updater.fetch_copilot_usage() is None


def test_confirmed_copilot_usage_overrides_catalog_only_state(monkeypatch: pytest.MonkeyPatch) -> None:
    providers, _ = updater.build_providers(time.time(), {})
    reset_at = time.time() + 86_400
    monkeypatch.setattr(updater, "fetch_codex_headroom", lambda: (None, None, None, None))
    monkeypatch.setattr(updater, "fetch_anthropic_headroom", lambda: (None, None, None))
    monkeypatch.setattr(updater, "fetch_nous_headroom", lambda: (None, None, None))
    monkeypatch.setattr(
        updater,
        "fetch_copilot_usage",
        lambda: {
            "headroom": 0.42,
            "credits_used": 870.0,
            "credits_limit": 1500.0,
            "tier_label": "PRO",
            "reset_at_epoch_s": reset_at,
        },
    )

    updater.apply_confirmed_quota(providers)

    copilot = next(row for row in providers if row["id"] == "copilot")
    assert copilot["state"] == "confirmed"
    assert copilot["headroom"] == pytest.approx(0.42)
    assert copilot["credits_used"] == pytest.approx(870)
    assert copilot["credits_limit"] == pytest.approx(1500)
    assert copilot["tier_label"] == "PRO"
    assert copilot["reset_at_epoch_s"] == reset_at


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
