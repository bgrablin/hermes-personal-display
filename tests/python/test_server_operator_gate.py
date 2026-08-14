from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import hermes_display_server as server  # noqa: E402

Handler = server.Handler


def _server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def test_augury_feed_allows_loopback_host() -> None:
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/augury-feed"
        with urllib.request.urlopen(url, timeout=5) as resp:
            assert resp.status == 200
            assert b"schema_version" in resp.read()
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_augury_feed_rejects_non_loopback_host_header() -> None:
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/augury-feed"
        req = urllib.request.Request(url, headers={"Host": "192.168.1.50"})
        try:
            urllib.request.urlopen(req, timeout=5)
            raise AssertionError("expected 403")
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
            assert b"loopback_only" in exc.read()
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_family_state_endpoint_excludes_operator_payload(monkeypatch) -> None:
    private_state = {
        "schema_version": "0.4.0",
        "generated_at": "2026-08-14T12:00:00+00:00",
        "valid_for_seconds": 10,
        "mood": "thinking_focused",
        "skin": "retro-terminal-focus",
        "state_preset": "working",
        "motion": {"reduced_motion": True},
        "caption": {"text": "PRIVATE WORK CAPTION"},
        "snippet": {"text": "PRIVATE SNIPPET"},
        "safety": {"boundary": "local_trusted_display", "redaction_level": "display_safe", "contains_credentials": False},
        "live": {
            "system": {"cpu": 0.95, "memory": 0.42, "temp_c": 88, "cpu_temp_c": 88, "source": "private sensor path"},
            "current_work": {"summary": "PRIVATE WORK", "session_id": "secret-session"},
            "active_sessions": [{"session_id": "secret-session"}],
            "kanban": {"tasks": [{"title": "PRIVATE TASK"}]},
            "route_rail": {"active_provider_id": "private-provider"},
            "remote_memory": {"status": "private-memory"},
        },
    }
    monkeypatch.setattr(server, "cached_build_state", lambda: private_state)
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/hermes-state?audience=family"
        with urllib.request.urlopen(url, timeout=5) as resp:
            payload = json.loads(resp.read())
        serialized = json.dumps(payload)
        assert payload["state_preset"] == "quiet_watch"
        assert payload["state_label"] == "FAMILY MODE"
        assert payload["safety"]["redaction_level"] == "public_status"
        assert payload["live"] == {
            "family_mode": True,
            "system": {"cpu": 0.95, "memory": 0.42, "temp_c": 88.0, "cpu_temp_c": 88.0},
        }
        for private_text in ("PRIVATE", "secret-session", "private-provider", "private-memory", "sensor path"):
            assert private_text not in serialized
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_family_state_error_path_still_excludes_operator_payload(monkeypatch) -> None:
    private_degraded_state = {
        "schema_version": "0.4.0",
        "generated_at": "2026-08-14T12:00:00+00:00",
        "state_preset": "waiting_input",
        "state_label": "WAITING INPUT",
        "caption": {"text": "PRIVATE DEGRADED CAPTION"},
        "live": {
            "system": {"cpu": 0.72, "memory": 0.51, "source": "private sensor path"},
            "current_work": {"summary": "PRIVATE DEGRADED WORK"},
            "active_sessions": [{"session_id": "secret-session"}],
            "route_rail": {"active_provider_id": "private-provider"},
            "remote_memory": {"status": "private-memory"},
        },
    }
    monkeypatch.setattr(server, "cached_build_state", lambda: (_ for _ in ()).throw(RuntimeError("private failure")))
    monkeypatch.setattr(server, "degraded_state", lambda _reason: private_degraded_state)
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/hermes-state?audience=family"
        try:
            urllib.request.urlopen(url, timeout=5)
            raise AssertionError("expected degraded family state to return 503")
        except urllib.error.HTTPError as exc:
            assert exc.code == 503
            payload = json.loads(exc.read())
        serialized = json.dumps(payload)
        assert payload["state_preset"] == "quiet_watch"
        assert payload["state_label"] == "FAMILY MODE"
        assert payload["live"] == {
            "family_mode": True,
            "system": {"cpu": 0.72, "memory": 0.51},
        }
        for private_text in ("PRIVATE", "secret-session", "private-provider", "private-memory", "sensor path"):
            assert private_text not in serialized
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_static_server_does_not_expose_repository_metadata() -> None:
    httpd = _server()
    try:
        root = f"http://127.0.0.1:{httpd.server_address[1]}"
        with urllib.request.urlopen(f"{root}/src/character-runtime.html", timeout=5) as resp:
            assert resp.status == 200
        with urllib.request.urlopen(
            urllib.request.Request(f"{root}/src/character-runtime.html", method="HEAD"),
            timeout=5,
        ) as resp:
            assert resp.status == 200
            assert resp.read() == b""
        for path in ("/.git/HEAD", "/scripts/hermes_display_server.py"):
            for method in ("GET", "HEAD"):
                try:
                    urllib.request.urlopen(
                        urllib.request.Request(f"{root}{path}", method=method),
                        timeout=5,
                    )
                    raise AssertionError(f"expected {method} {path} to be denied")
                except urllib.error.HTTPError as exc:
                    assert exc.code == 404
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_avatar_stream_requires_explicit_operator_audience() -> None:
    httpd = _server()
    try:
        root = f"http://127.0.0.1:{httpd.server_address[1]}"
        for suffix in ("", "?audience=family"):
            try:
                urllib.request.urlopen(f"{root}/avatar-events/stream{suffix}", timeout=5)
                raise AssertionError("expected non-operator avatar stream to be denied")
            except urllib.error.HTTPError as exc:
                assert exc.code == 404
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_route_rail_refresh_endpoint_queues_local_refresh(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        server,
        "request_provider_route_rail_refresh",
        lambda: calls.append("refresh") or {"ok": True, "status": "queued"},
    )
    httpd = _server()
    try:
        origin = f"http://127.0.0.1:{httpd.server_address[1]}"
        url = f"{origin}/api/provider-route-rail/refresh"
        request = urllib.request.Request(url, data=b"", method="POST", headers={"Origin": origin})
        with urllib.request.urlopen(request, timeout=5) as resp:
            payload = json.loads(resp.read())
            assert resp.status == 202
        assert payload == {"ok": True, "status": "queued"}
        assert calls == ["refresh"]
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_route_rail_refresh_endpoint_rejects_missing_or_foreign_origin(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        server,
        "request_provider_route_rail_refresh",
        lambda: calls.append("refresh") or {"ok": True, "status": "queued"},
    )
    httpd = _server()
    try:
        origin = f"http://127.0.0.1:{httpd.server_address[1]}"
        url = f"{origin}/api/provider-route-rail/refresh"
        for headers in ({}, {"Origin": "https://untrusted.example"}, {"Origin": "http://localhost:8770"}):
            request = urllib.request.Request(url, data=b"", method="POST", headers=headers)
            try:
                urllib.request.urlopen(request, timeout=5)
                raise AssertionError(f"expected refresh request with headers {headers} to be rejected")
            except urllib.error.HTTPError as exc:
                assert exc.code == 403
        assert calls == []
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_route_rail_refresh_endpoint_rejects_non_loopback_host_header(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(
        server,
        "request_provider_route_rail_refresh",
        lambda: calls.append("refresh") or {"ok": True, "status": "queued"},
    )
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/provider-route-rail/refresh"
        request = urllib.request.Request(
            url,
            data=b"",
            method="POST",
            headers={"Host": "display.example", "Origin": "http://display.example"},
        )
        try:
            urllib.request.urlopen(request, timeout=5)
            raise AssertionError("expected operator route refresh endpoint to reject a non-loopback Host")
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
        assert calls == []
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_route_rail_refresh_cooldown_avoids_duplicate_service_start(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(server.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(
        server.subprocess,
        "run",
        lambda *args, **kwargs: calls.append((args, kwargs)) or SimpleNamespace(returncode=0),
    )
    monkeypatch.setattr(server, "_PROVIDER_ROUTE_REFRESH_AT", 0.0)

    assert server.request_provider_route_rail_refresh() == {"ok": True, "status": "queued"}
    assert server.request_provider_route_rail_refresh() == {"ok": True, "status": "cooldown"}
    assert len(calls) == 1


def test_route_rail_refresh_service_failure_does_not_start_cooldown(monkeypatch) -> None:
    monkeypatch.setattr(server.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(
        server.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1),
    )
    monkeypatch.setattr(server, "_PROVIDER_ROUTE_REFRESH_AT", 0.0)

    try:
        server.request_provider_route_rail_refresh()
        raise AssertionError("expected a failed service start to raise")
    except RuntimeError:
        pass
    assert server._PROVIDER_ROUTE_REFRESH_AT == 0.0
