import importlib.util
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


def test_display_observer_plugin_resolves_repo_after_doctor_copy(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    entrypoint = repo / "integrations/display-observer/__init__.py"
    spec = importlib.util.spec_from_file_location("display_observer_entrypoint", entrypoint)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    copied_entrypoint = tmp_path / "plugins/display-observer/__init__.py"
    copied_entrypoint.parent.mkdir(parents=True)
    copied_entrypoint.touch()
    assert module._resolve_repo_root(copied_entrypoint, repo / "tests") == repo


def test_display_observer_plugin_rejects_partial_checkout_ancestor(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    entrypoint = repo / "integrations/display-observer/__init__.py"
    spec = importlib.util.spec_from_file_location("display_observer_entrypoint", entrypoint)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    copied_entrypoint = tmp_path / "doctor/plugins/display-observer/__init__.py"
    copied_entrypoint.parent.mkdir(parents=True)
    copied_entrypoint.touch()
    partial = tmp_path / "partial"
    (partial / "scripts/display_state").mkdir(parents=True)
    (partial / "scripts/display_state/observer.py").touch()
    with pytest.raises(ImportError):
        module._resolve_repo_root(copied_entrypoint, partial / "tests")


def test_display_observer_plugin_accepts_complete_project_archive(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    entrypoint = repo / "integrations/display-observer/__init__.py"
    spec = importlib.util.spec_from_file_location("display_observer_entrypoint", entrypoint)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    archive = tmp_path / "release"
    for relative in (
        "package.json",
        "scripts/verify-project.sh",
        "scripts/display_state/observer.py",
        "integrations/display-observer/plugin.yaml",
    ):
        path = archive / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    copied_entrypoint = archive / "integrations/display-observer/__init__.py"
    assert module._resolve_repo_root(copied_entrypoint, archive) == archive


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
    process = SimpleNamespace(id="process1", exited=False, exit_code=None)
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


def test_subagent_hooks_preserve_named_activity_and_exact_stop_identity():
    observer = Observer()
    observer.callback("subagent_start")(
        parent_session_id="parent",
        parent_turn_id="turn-1",
        child_session_id="child-session",
        child_subagent_id="child-1",
        child_role="leaf",
        child_goal="Review /home/brian/display and api_key=secret-value",
    )
    hook, event = observer.events.get_nowait()
    assert hook == "subagent_start"
    assert "/home/brian/display" in event["child_goal"]
    assert "secret-value" not in event["child_goal"]
    observer.apply(hook, event)
    row = next(iter(observer.sessions.values()))
    assert row["subagents"][0]["status"] == "running"
    assert row["subagents"][0]["parent_turn_id"] == "turn-1"
    assert observed_work(
        {"sources": [{"sessions": [row], "fresh": True, "age_seconds": 0}]}
    )["summary"] == "Subagent work continuing"

    observer.callback("subagent_stop")(
        parent_session_id="parent",
        parent_turn_id="turn-1",
        child_session_id="child-session",
        child_role="leaf",
        child_status="completed",
        duration_ms=2100,
    )
    hook, event = observer.events.get_nowait()
    observer.apply(hook, event)
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "profile": event["profile"], "completed": True},
    )
    assert len(row["subagents"]) == 1
    assert row["subagents"][0]["status"] == "completed"
    assert row["subagents"][0]["duration_ms"] == 2100
    assert observed_work(
        {"sources": [{"sessions": [row], "fresh": True, "age_seconds": 0}]}
    )["state"] == "recent_activity"


def test_unmatched_subagent_stop_is_labeled_without_guessing():
    observer = Observer()
    observer.apply(
        "subagent_stop",
        {
            "parent_session_id": "parent",
            "child_session_id": "child-session",
            "child_status": "failed",
            "profile": "home",
        },
    )
    row = observer.sessions[("home", "parent")]["subagents"][0]
    assert row["subagent_id"] == "child-session"
    assert row["status"] == "failed"
    assert row["evidence"] == "stop observed without matching start"


def test_uncertain_tool_result_survives_turn_completion_without_success_claim():
    observer = Observer()
    observer.callback("post_tool_call")(
        session_id="parent",
        tool_call_id="call-1",
        tool_name="mcp.crm.update",
        result=json.dumps(
            {
                "outcome_uncertain": True,
                "error": (
                    "Operation may have completed for /home/brian/customer; "
                    "api_key=secret-value. Do not retry automatically."
                ),
            }
        ),
    )
    hook, event = observer.events.get_nowait()
    assert event["result"]["outcome_uncertain"] is True
    assert "secret-value" not in event["result"]["error"]
    observer.apply(hook, event)
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "profile": event["profile"], "completed": True},
    )
    row = next(iter(observer.sessions.values()))
    assert row["tool_outcome"]["tool_call_id"] == "call-1"
    assert row["tool_outcome"]["status"] == "unknown"
    row["last_event_at"] = time.time() - 31
    outcome = observed_work(
        {"sources": [{"sessions": [row], "fresh": True, "age_seconds": 0}]}
    )
    assert outcome["state"] == "unknown"
    assert outcome["summary"] == "Tool outcome uncertain; inspect before retrying"
    assert "/home/brian/customer" in outcome["detail"]


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


def test_silent_launch_handoff_parent_end_and_actual_process_exit(monkeypatch):
    observer = Observer()
    process = SimpleNamespace(
        id="proc_handoff",
        exited=False,
        exit_code=None,
        parent_session_id="child",
        owner_task_id="child-task",
        session_key="child",
    )
    monkeypatch.setitem(
        sys.modules,
        "tools.process_registry",
        SimpleNamespace(process_registry=SimpleNamespace(get=lambda pid: process)),
    )
    observer.callback("post_tool_call")(
        session_id="child",
        tool_name="terminal",
        result=json.dumps(
            {"session_id": process.id, "exit_code": 0, "notify_on_complete": False}
        ),
    )
    hook, event = observer.events.get_nowait()
    observer.apply(hook, event)
    process.owner_task_id, process.session_key = "parent-task", "parent"
    observer.callback("post_tool_call")(
        session_id="child",
        tool_name="process_manage",
        result={"status": "handed_off", "session_id": process.id},
    )
    hook, event = observer.events.get_nowait()
    observer.apply(hook, event)
    for sid in ("child", "parent"):
        observer.apply(
            "on_session_end",
            {"session_id": sid, "completed": True, "profile": event["profile"]},
        )
    observer.refresh_background()
    row = observer.sessions[(event["profile"], "child")]
    assert len(row["processes"]) == 1
    assert row["processes"][0]["reason"] == "handed_off"
    assert row["processes"][0]["session_key"] == "parent"
    snapshot = {
        "sources": [
            {
                "sessions": list(observer.sessions.values()),
                "fresh": True,
                "age_seconds": 0,
            }
        ]
    }
    assert observed_work(snapshot)["summary"] == "Command continuing in background"
    process.exited, process.exit_code = True, 9
    observer.refresh_background()
    assert observed_work(snapshot)["state"] == "failed"


def test_process_accounting_retains_only_structured_ids():
    observer = Observer()
    observer.callback("post_tool_call")(
        session_id="parent",
        tool_name="delegate_task",
        result={
            "results": [
                {
                    "summary": "not an event",
                    "handed_off_processes": [
                        {"session_id": "proc_h", "command": "private"}
                    ],
                    "orphaned_processes": [{"session_id": "proc_o"}],
                    "unread_completions": [
                        {
                            "session_id": "proc_u",
                            "output_tail": "private",
                            "exit_code": 0,
                        }
                    ],
                }
            ]
        },
    )
    hook, event = observer.events.get_nowait()
    assert "private" not in json.dumps(event)
    observer.apply(hook, event)
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "completed": True, "profile": event["profile"]},
    )
    observer.refresh_background()
    row = next(iter(observer.sessions.values()))
    assert len(row["processes"]) == 3
    assert all(p["status"] == "unknown" for p in row["processes"])
    assert (
        observed_work(
            {"sources": [{"sessions": [row], "fresh": True, "age_seconds": 0}]}
        )["state"]
        == "unknown"
    )


@pytest.mark.parametrize(
    "mismatch",
    [None, "id", "owner_task_id", "parent_session_id", "session_key", "expired"],
)
def test_retained_receipt_requires_exact_identity_and_fresh_retention(
    tmp_path, monkeypatch, mismatch
):
    from display_state.observer import completed_receipt

    process = {
        "session_id": "proc_receipt-name",
        "owner_task_id": "task",
        "parent_session_id": "stored",
        "session_key": "runtime",
    }
    record = {
        "id": process["session_id"],
        **{k: v for k, v in process.items() if k != "session_id"},
        "exit_code": 7,
        "output": "must not enter display snapshot",
    }
    if mismatch and mismatch != "expired":
        record[mismatch] = "foreign"
    path = tmp_path / "logs/process-results/proc_receipt-name.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(record))
    if mismatch == "expired":
        import os

        os.utime(path, (0, 0))
    result = completed_receipt(str(tmp_path), process)
    if mismatch:
        assert result is None
    else:
        assert result == {
            "status": "exited",
            "exit_code": 7,
            "evidence": "retained receipt",
        }
        observer = Observer()
        observer.apply(
            "on_session_end",
            {"session_id": "parent", "profile": str(tmp_path), "completed": True},
        )
        row = next(iter(observer.sessions.values()))
        row["processes"] = [{**process, "status": "unknown"}]
        monkeypatch.setitem(
            sys.modules,
            "tools.process_registry",
            SimpleNamespace(process_registry=SimpleNamespace(get=lambda pid: None)),
        )
        observer.refresh_background()
        assert row["processes"][0]["exit_code"] == 7
        assert row["processes"][0]["evidence"] == "retained receipt"
    assert path.exists()  # Observer never prunes or consumes receipts.


def test_unknown_process_clears_stale_completion_fields(monkeypatch):
    observer = observer_with_background()
    session = next(iter(observer.sessions.values()))
    process = session["processes"][0]
    process.update(exit_code=7, evidence="old registry receipt")
    monkeypatch.setitem(
        sys.modules,
        "tools.process_registry",
        SimpleNamespace(process_registry=SimpleNamespace(get=lambda pid: None)),
    )
    observer.refresh_background()
    assert process["status"] == "unknown"
    assert "exit_code" not in process
    assert "evidence" not in process


def test_unknown_process_clears_stale_fields_on_owner_mismatch(monkeypatch):
    observer = observer_with_background()
    session = next(iter(observer.sessions.values()))
    process = session["processes"][0]
    process.update(parent_session_id="parent", exit_code=7, evidence="old registry receipt")
    replacement = SimpleNamespace(
        id="process1", parent_session_id="replacement", owner_task_id="task", session_key="runtime"
    )
    monkeypatch.setitem(
        sys.modules,
        "tools.process_registry",
        SimpleNamespace(process_registry=SimpleNamespace(get=lambda pid: replacement)),
    )
    observer.refresh_background()
    assert process["status"] == "unknown"
    assert "exit_code" not in process
    assert "evidence" not in process


@pytest.mark.parametrize("split", [False, True])
def test_default_batch_and_independent_completion_modes(monkeypatch, split):
    observer = Observer()
    ids = ["batch-A", "batch-B"] if split else ["batch"]
    units = [
        {"delegation_id": uid, "task_indexes": [i] if split else [0, 1]}
        for i, uid in enumerate(ids)
    ]
    observer.apply(
        "post_tool_call",
        {
            "session_id": "parent",
            "tool_name": "delegate_task",
            "result": {
                "status": "dispatched",
                "delegation_id": "batch",
                "units": units,
            },
        },
    )
    records = [{"delegation_id": uid, "status": "running"} for uid in ids]
    monkeypatch.setitem(
        sys.modules,
        "tools.async_delegation",
        SimpleNamespace(list_async_delegations=lambda: records),
    )
    records[0]["status"] = "completed"
    observer.refresh_background()
    batch = next(iter(observer.sessions.values()))["delegations"][0]
    assert batch["settled"] is (not split)
    for row in records:
        row["status"] = "completed"
    observer.refresh_background()
    assert batch["settled"]
