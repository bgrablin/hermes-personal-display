import json
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from display_state.integration import (
    clean,
    observed_work,
    provider_telemetry,
    read_snapshots,
    write_snapshot,
)
from display_state.observer import Observer
from display_state.rpc_monitor import Connection, Monitor, RpcError


def observer_with_background(reason="yielded_to_background"):
    observer = Observer()
    observer.apply("on_session_start", {"session_id": "parent"})
    observer.apply(
        "post_tool_call",
        {
            "session_id": "parent",
            "tool_name": "terminal",
            "result": {
                "session_id": "process1",
                "status": reason,
                "promoted_from_foreground": reason != "yielded_to_background",
            },
        },
    )
    observer.apply("on_session_end", {"session_id": "parent", "completed": True})
    return observer


@pytest.mark.parametrize("reason", ["yielded_to_background", "promoted"])
def test_background_survives_parent_and_settles_only_from_registry(monkeypatch, reason):
    observer = observer_with_background(reason)
    process = SimpleNamespace(exited=False, exit_code=None)
    monkeypatch.setitem(
        sys.modules,
        "tools.process_registry",
        SimpleNamespace(process_registry=SimpleNamespace(get=lambda sid: process)),
    )
    observer.refresh_background()
    session = next(iter(observer.sessions.values()))
    assert session["status"] == "completed"
    assert session["processes"][0]["status"] == "running"
    process.exited, process.exit_code = True, 7
    observer.refresh_background()
    assert session["processes"][0]["status"] == "exited"
    assert session["processes"][0]["exit_code"] == 7


def test_missing_process_is_unknown_and_does_not_consume_notifications(monkeypatch):
    observer = observer_with_background()
    monkeypatch.setitem(
        sys.modules,
        "tools.process_registry",
        SimpleNamespace(process_registry=SimpleNamespace(get=lambda sid: None)),
    )
    observer.refresh_background()
    assert next(iter(observer.sessions.values()))["processes"][0]["status"] == "unknown"


def test_explicit_delegation_units_not_child_stop_or_suffix(monkeypatch):
    observer = Observer()
    observer.apply(
        "post_tool_call",
        {
            "session_id": "p",
            "tool_name": "delegate_task",
            "result": {
                "status": "dispatched",
                "delegation_id": "batch",
                "units": [
                    {
                        "delegation_id": "unrelated-A",
                        "group": "review",
                        "task_indexes": [0, 2],
                    },
                    {"delegation_id": "totally-B", "group": None, "task_indexes": [1]},
                ],
            },
        },
    )
    observer.apply(
        "subagent_stop", {"parent_session_id": "p", "child_status": "completed"}
    )
    statuses = [
        {"delegation_id": "unrelated-A", "status": "completed"},
        {"delegation_id": "totally-B", "status": "running"},
    ]
    monkeypatch.setitem(
        sys.modules,
        "tools.async_delegation",
        SimpleNamespace(list_async_delegations=lambda: statuses),
    )
    observer.refresh_background()
    batch = next(iter(observer.sessions.values()))["delegations"][0]
    assert not batch["settled"]
    assert batch["units"][0]["task_indexes"] == [0, 2]
    statuses[1]["status"] = "error"
    observer.refresh_background()
    assert batch["settled"]


def test_profile_isolation():
    o = Observer()
    for profile in ("a", "b"):
        o.apply("on_session_start", {"profile": profile, "session_id": "same"})
    o.apply("on_session_end", {"profile": "a", "session_id": "same", "completed": True})
    assert o.sessions[("b", "same")]["status"] == "running"


def test_snapshot_freshness_reconnect_and_credentials(tmp_path):
    o = observer_with_background()
    write_snapshot(
        o.owner,
        {
            "schema_version": 1,
            "owner": o.owner,
            "observed_at": 100,
            "sessions": list(o.sessions.values()),
        },
        tmp_path,
    )
    fresh = read_snapshots(tmp_path, 105)
    assert observed_work(fresh)["active"]
    stale = read_snapshots(tmp_path, 130)
    assert observed_work(stale)["state"] == "unknown"
    assert not observed_work(stale)["active"]
    assert read_snapshots(tmp_path, 105)["sources"][0].get("age_seconds") != 30
    text = clean(
        {
            "path": "/home/brian/project",
            "title": "token usage",
            "secret": "remove",
            "detail": "api_key=sk-1234567890",
        }
    )
    assert text["path"] == "/home/brian/project" and text["title"] == "token usage"
    assert "1234567890" not in str(text) and "secret" not in text


def test_provider_call_optional_fields_and_unknown_usage():
    rows = provider_telemetry(
        "2026-09-07 API call #2: model=test provider=openrouter in=100 out=5 total=105 latency=1.2s cache=80/100 (80%) write=10 id=req123 upstream=Some Provider\nAPI call #3: model=test provider=x in=? out=? total=? latency=0.2s usage=unavailable"
    )
    assert rows[0]["upstream"] == "Some Provider"
    assert rows[0]["cache_write"] == 10 and rows[0]["response_id"] == "req123"
    assert rows[1]["input"] is None and rows[1]["cache_write"] is None


def connection():
    target = {
        "session_id": "runtime",
        "profile": "home",
        "stored_session_id": "durable",
        "allow_controls": True,
    }
    return Connection(
        {"name": "owner", "url": "ws://127.0.0.1:8642/api/ws", "sessions": [target]}
    ), target


def test_rpc_revision_identity_and_4009_retains_state():
    c, target = connection()
    c.call = lambda method, params: (
        {"output": "Session ID: durable"}
        if method == "session.status"
        else {"control": {"revision": "r1", "goal": {"status": "active"}}}
    )
    assert c.hydrate(target)["available"]
    c.call = lambda *args: (_ for _ in ()).throw(RpcError(4009))
    row = c.hydrate(target)
    assert not row["available"] and not row["actions"]
    assert row["control"]["revision"] == "r1"
    assert row["error"] == "control temporarily unavailable"
    c.call = lambda *args: {"output": "Session ID: someone-else"}
    assert not c.hydrate(target)["available"]


def test_mutation_revision_conflict_and_no_retry():
    c, target = connection()
    c.hydrate = lambda _: {
        "available": True,
        "actions": ["goal.pause"],
        "control": {"revision": "new"},
    }
    sent = []
    c.call = lambda *args: sent.append(args)
    done, result = threading.Event(), {}
    c.mutate((target, "old", "goal.pause", done, result, time.monotonic() + 20))
    assert not sent and done.is_set() and not result["ok"]
    c.hydrate = lambda _: {
        "available": True,
        "actions": ["goal.pause"],
        "control": {"revision": "old"},
    }

    def fail(*args):
        sent.append(args)
        raise TimeoutError()

    c.call = fail
    with pytest.raises(TimeoutError):
        c.mutate((target, "old", "goal.pause", done, result, time.monotonic() + 20))
    assert len(sent) == 1 and "unknown" in result["status"]


def test_expired_mutation_never_sent():
    c, target = connection()
    c.hydrate = lambda _: pytest.fail("expired action read")
    done, result = threading.Event(), {}
    c.mutate((target, "", "goal.pause", done, result, 0))
    assert result["status"] == "expired; no action sent"


def test_events_only_invalidate_exact_owner_after_completion():
    c, _target = connection()
    c.rows["runtime"] = {"control": {"revision": "r1"}}

    def event(sid, seq):
        c.event(
            {
                "params": {
                    "type": "session.control.update",
                    "session_id": sid,
                    "seq": seq,
                    "payload": {"control": {"revision": "r2"}},
                }
            }
        )

    event("other", 5)
    assert not c.rows["runtime"].get("refresh_pending")
    event("runtime", 2)
    assert c.rows["runtime"]["refresh_pending"]
    c.rows["runtime"]["refresh_pending"] = False
    event("runtime", 1)
    assert not c.rows["runtime"]["refresh_pending"]
    assert c.rows["runtime"]["control"]["revision"] == "r1"


def test_controls_not_configured_and_gate_not_exposed(monkeypatch):
    monkeypatch.delenv("HERMES_DISPLAY_RPC_CONFIG", raising=False)
    monitor = Monitor()
    assert monitor.snapshot()["status"] == "not configured"
    assert not monitor.action({"action": "gate.run", "revision": ""})["ok"]


def test_wire_protocol_hydration_mcp_and_action():
    from websockets.sync.client import connect
    from websockets.sync.server import serve

    calls = []

    def handler(ws):
        for raw in ws:
            req = json.loads(raw)
            calls.append(req)
            if req["method"] == "session.status":
                result = {
                    "output": "Hermes TUI Status\nSession ID: durable\nAgent Running: No"
                }
            elif req["method"] == "session.control.read":
                result = {
                    "control": {
                        "revision": "r1",
                        "goal": {"status": "active"},
                        "loop": None,
                        "heartbeat": None,
                    }
                }
            elif req["method"] == "mcp.servers.status":
                result = {
                    "checked_at": 123,
                    "servers": [
                        {
                            "name": "mcp",
                            "status": "configured",
                            "tools": 0,
                            "transport": "stdio",
                        }
                    ],
                }
            else:
                assert (
                    req["method"] == "session.control"
                    and req["params"]["action"] == "goal.pause"
                )
                result = {"control": {"revision": "r2", "goal": {"status": "paused"}}}
            ws.send(json.dumps({"jsonrpc": "2.0", "id": req["id"], "result": result}))

    with serve(handler, "127.0.0.1", 0) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        c, target = connection()
        with connect(f"ws://127.0.0.1:{server.socket.getsockname()[1]}") as c.ws:
            assert c.hydrate(target)["control"]["revision"] == "r1"
            assert (
                c.call("mcp.servers.status", {"profile": "home"})["servers"][0]["tools"]
                == 0
            )
            done, result = threading.Event(), {}
            c.mutate((target, "r1", "goal.pause", done, result, time.monotonic() + 12))
            assert result["ok"] and c.rows["runtime"]["control"]["revision"] == "r2"
        server.shutdown()
        thread.join(timeout=2)
    assert all(req["params"].get("profile") == "home" for req in calls)
    assert not any(
        req["method"] in ("session.resume", "prompt.submit", "approval.respond")
        for req in calls
    )


def test_operator_http_boundaries_and_family_projection(monkeypatch):
    import http.client

    import hermes_display_server as server

    monkeypatch.setattr(
        server,
        "read_snapshots",
        lambda: {"schema_version": 1, "coverage": "unavailable", "sources": []},
    )
    monkeypatch.setattr(
        server,
        "integration_monitor",
        lambda: SimpleNamespace(
            snapshot=lambda: {"sessions": [], "status": "not configured"},
            action=lambda payload: {"ok": True, "status": "applied"},
        ),
    )
    httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_port
    try:

        def request(method, path, headers=None):
            connection = http.client.HTTPConnection("127.0.0.1", port)
            connection.request(
                method,
                path,
                body="{}" if method == "POST" else None,
                headers=headers or {},
            )
            response = connection.getresponse()
            status, body = response.status, json.loads(response.read())
            connection.close()
            return status, body

        assert request("GET", "/api/hermes-integration")[0] == 200
        assert (
            request("GET", "/api/hermes-integration", {"Host": "evil.example"})[0]
            == 403
        )
        assert (
            request(
                "POST",
                "/api/hermes-integration/control",
                {"Origin": "https://evil.example"},
            )[0]
            == 403
        )
        assert (
            request(
                "POST",
                "/api/hermes-integration/control",
                {"Origin": f"http://127.0.0.1:{port}"},
            )[0]
            == 200
        )
        safe = server.family_safe_state(
            {"live": {"integration": {"secret": "private"}, "system": {}}}
        )
        assert "integration" not in safe["live"]
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)


@pytest.mark.parametrize("failure", ["identity", "snapshot", 4001, 5031])
def test_verification_failure_discards_cached_details_and_blocks_mutation(failure):
    c, target = connection()
    c.rows[target["session_id"]] = {
        "control": {"revision": "old", "goal": {"title": "old goal"}},
        "mcp": {"servers": [{"name": "old server"}]},
        "observed_at": 123,
        "last_known": True,
    }
    calls = []

    def call(method, params):
        calls.append(method)
        if isinstance(failure, int):
            raise RpcError(failure)
        if method == "session.status":
            return {
                "output": "Session ID: wrong"
                if failure == "identity"
                else "Session ID: durable"
            }
        return {"control": None}

    c.call = call
    row = c.hydrate(target)
    assert not row["available"] and row["actions"] == []
    assert not {"control", "mcp", "observed_at", "last_known"}.intersection(row)
    done, result = threading.Event(), {}
    c.mutate((target, "old", "goal.pause", done, result, time.monotonic() + 12))
    assert not result["ok"] and "session.control" not in calls
    c.call = lambda method, params: (
        {"output": "Session ID: durable"}
        if method == "session.status"
        else {"control": {"revision": "new", "goal": {"title": "new goal"}}}
    )
    recovered = c.hydrate(target)
    assert recovered["available"] and recovered["control"]["revision"] == "new"
    assert "mcp" not in recovered


def test_4009_retains_labeled_last_known_details_without_refreshing_age():
    c, target = connection()
    c.rows[target["session_id"]] = {
        "control": {"revision": "old"},
        "mcp": {"servers": []},
        "observed_at": 123,
    }
    c.call = lambda *args: (_ for _ in ()).throw(RpcError(4009))
    row = c.hydrate(target)
    assert row["last_known"] and row["observed_at"] == 123
    assert row["control"]["revision"] == "old" and row["mcp"] == {"servers": []}
    assert not row["available"] and row["actions"] == []


def test_unexpected_mutation_failure_reconnects_instead_of_killing_monitor(monkeypatch):
    class StopLoop(BaseException):
        pass

    class FakeConnection:
        def __enter__(self):
            return object()

        def __exit__(self, *_args):
            return False

    c, target = connection()
    c.hydrate = lambda _target: {}
    c.call = lambda *_args: {}
    c.mutate = lambda _job: (_ for _ in ()).throw(RuntimeError("unexpected"))
    c.jobs.put((target, "r1", "goal.pause", threading.Event(), {}, time.monotonic() + 12))
    monkeypatch.setattr("websockets.sync.client.connect", lambda *_args, **_kwargs: FakeConnection())
    monkeypatch.setattr(time, "sleep", lambda _seconds: (_ for _ in ()).throw(StopLoop()))

    with pytest.raises(StopLoop):
        c.run()


@pytest.mark.parametrize(
    "case, expected",
    [
        ("connections", "Connection limit exceeded (maximum 8)"),
        ("names", "Duplicate connection name"),
        ("sessions", "Session limit exceeded (maximum 16 per connection)"),
        ("ids", "Duplicate runtime session ID"),
        (
            "malformed",
            "RPC configuration or optional websockets dependency unavailable",
        ),
    ],
)
def test_config_errors_are_distinct_safe_and_visible(
    tmp_path, monkeypatch, case, expected
):
    c, target = connection()
    config = c.config
    if case == "connections":
        configs = [{**config, "name": str(i)} for i in range(9)]
    elif case == "names":
        configs = [config, config]
    elif case == "sessions":
        configs = [
            {
                **config,
                "sessions": [{**target, "session_id": str(i)} for i in range(17)],
            }
        ]
    elif case == "ids":
        configs = [{**config, "sessions": [target, target]}]
    else:
        configs = [{**config, "url": "http://[credential-secret"}]
    path = tmp_path / "rpc.json"
    path.write_text(json.dumps({"connections": configs}))
    monkeypatch.setenv("HERMES_DISPLAY_RPC_CONFIG", str(path))
    monkeypatch.setattr(
        threading.Thread,
        "start",
        lambda self: pytest.fail("invalid config started a worker"),
    )
    monitor = Monitor()
    assert monitor.snapshot() == {"sessions": [], "status": expected}
    assert "credential-secret" not in monitor.error
