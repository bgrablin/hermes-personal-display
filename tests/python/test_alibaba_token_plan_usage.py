"""Alibaba Token Plan monthly-usage probe: console replay, degradation, privacy."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import update_provider_route_rail as updater  # noqa: E402

RESET_MS = 1792771200000


def _envelope(inner: dict, code: str = "SUCCESS") -> dict:
    return {"data": {"DataV2": {"data": {"code": code, "msg": "Success." if code == "SUCCESS" else "denied",
                                         "data": inner, "success": code == "SUCCESS"}}}}


def _jar(tmp_path: Path, text: str = "login_aliyunid_ticket=fake-ticket-value; tfstk=fake-tfstk") -> Path:
    path = tmp_path / "cookies.txt"
    path.write_text(text + "\n", encoding="utf-8")
    return path


def _alibaba_row(providers: list[dict]) -> dict:
    return next(row for row in providers if row["id"] == "alibaba-token-plan")


def test_console_call_posts_params_and_carries_cookie_header(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    class _Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b"{}"

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["headers"] = request.headers
        captured["body"] = request.data.decode("utf-8")
        return _Response()

    monkeypatch.setattr(updater.urllib.request, "urlopen", fake_urlopen)
    updater._alibaba_console_call(updater.ALIBABA_USAGE_ACTION, {}, "login_aliyunid_ticket=fake-ticket-value")

    assert "action=IntlBroadScopeAspnGateway" in captured["url"]
    assert updater.ALIBABA_USAGE_ACTION in captured["url"]
    decoded = json.loads(updater.urllib.parse.parse_qs(captured["body"])["params"][0])
    assert decoded["Api"] == updater.ALIBABA_USAGE_ACTION
    assert decoded["Data"]["cornerstoneParam"]["consoleSite"] == "MODELSTUDIO_ALBABACLOUD"
    assert "fake-ticket-value" in captured["headers"]["Cookie"]


def test_usage_confirms_remaining_headroom_and_plan_tier(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")
    monkeypatch.setattr(
        updater,
        "_alibaba_console_call",
        lambda action, data, cookie: _envelope(
            {"per1MonthPercentage": 0.13593510265089412, "per1MonthResetTime": RESET_MS}
        ) if action == updater.ALIBABA_USAGE_ACTION else _envelope(
            {"specCode": "essential", "remainingDays": 30, "status": "VALID"}
        ),
    )
    providers, _ = updater.build_providers(time.time(), {})
    updater.apply_alibaba_usage(providers)

    row = _alibaba_row(providers)
    assert row["state"] == "confirmed"
    assert row["headroom"] == pytest.approx(1 - 0.13593510265089412)
    assert row["tier_label"] == "ESSENTIAL"
    assert row["reset_at_epoch_s"] == pytest.approx(RESET_MS / 1000)


def test_usage_falls_back_to_plan_label_when_subscription_unavailable(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")
    monkeypatch.setattr(
        updater,
        "_alibaba_console_call",
        lambda action, data, cookie: _envelope({"per1MonthPercentage": 0.5})
        if action == updater.ALIBABA_USAGE_ACTION else _envelope({}, code="FAIL"),
    )
    providers, _ = updater.build_providers(time.time(), {})
    updater.apply_alibaba_usage(providers)

    row = _alibaba_row(providers)
    assert row["state"] == "confirmed"
    assert row["headroom"] == pytest.approx(0.5)
    assert row["tier_label"] == "TOKEN PLAN"
    assert row["reset_at_epoch_s"] is None


def test_missing_cookie_jar_leaves_row_for_readiness_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "ALIBABA_COOKIE_JAR", tmp_path / "absent.txt")
    providers, _ = updater.build_providers(time.time(), {})
    updater.apply_alibaba_usage(providers)
    assert _alibaba_row(providers)["state"] == "unknown"

    monkeypatch.setattr(updater, "alibaba_route_configured", lambda: True)
    updater.apply_alibaba_readiness(providers)
    row = _alibaba_row(providers)
    assert row["state"] == "inferred"
    assert row["headroom"] is None


def test_rejected_console_session_never_becomes_a_percentage(
    monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")
    monkeypatch.setattr(
        updater, "_alibaba_console_call",
        lambda action, data, cookie: _envelope({}, code="NEED_LOGIN"),
    )
    assert updater.fetch_alibaba_token_plan_usage() == (None, None, None)


@pytest.mark.parametrize("value", [150, -0.2, "13.5", None, True])
def test_out_of_range_or_non_numeric_usage_is_rejected(
    value: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")
    monkeypatch.setattr(
        updater, "_alibaba_console_call",
        lambda action, data, cookie: _envelope({"per1MonthPercentage": value})
        if action == updater.ALIBABA_USAGE_ACTION else _envelope({"specCode": "essential"}),
    )
    assert updater.fetch_alibaba_token_plan_usage() == (None, None, None)


def test_fraction_and_percent_forms_agree(monkeypatch: pytest.MonkeyPatch) -> None:
    """The console reports a 0-1 fraction; a percent-scale value maps identically."""
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")

    def with_usage(value: float):
        monkeypatch.setattr(
            updater, "_alibaba_console_call",
            lambda action, data, cookie: _envelope({"per1MonthPercentage": value})
            if action == updater.ALIBABA_USAGE_ACTION else _envelope({"specCode": "essential"}),
        )
        return updater.fetch_alibaba_token_plan_usage()[0]

    assert with_usage(0.1359) == pytest.approx(with_usage(13.59))
    assert with_usage(1.0) == pytest.approx(0.0)  # fully consumed


def test_http_failure_degrades_instead_of_raising(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "session=value")

    def boom(action, data, cookie):
        raise OSError("connection reset")

    monkeypatch.setattr(updater, "_alibaba_console_call", boom)
    assert updater.fetch_alibaba_token_plan_usage() == (None, None, None)


def test_cookie_jar_is_parsed_into_a_single_header(tmp_path: Path) -> None:
    jar = _jar(tmp_path, "a=1; b=2; broken; c=3")
    assert updater.load_alibaba_cookie_header(jar) == "a=1; b=2; c=3"
    assert updater.load_alibaba_cookie_header(tmp_path / "missing.txt") == ""


def test_confirmed_rail_row_carries_no_console_session_material(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(updater, "load_alibaba_cookie_header", lambda jar=None: "login_aliyunid_ticket=SECRET")
    monkeypatch.setattr(
        updater, "_alibaba_console_call",
        lambda action, data, cookie: _envelope({"per1MonthPercentage": 0.14})
        if action == updater.ALIBABA_USAGE_ACTION else _envelope({"specCode": "essential"}),
    )
    providers, active = updater.build_providers(time.time(), {"alibaba-token-plan": {"requests": 1, "last_ts": time.time()}})
    updater.apply_alibaba_usage(providers)
    payload = json.dumps({"as_of_ms": int(time.time() * 1000), "active_provider_id": active, "providers": providers})

    assert "SECRET" not in payload
    assert "login_aliyunid_ticket" not in payload
    assert "0.14" not in payload  # used percent is not published either; only headroom