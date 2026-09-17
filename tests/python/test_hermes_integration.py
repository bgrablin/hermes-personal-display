import importlib.util
import json
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from display_state.integration import (
    TERMINAL,
    TOOL_TERMINAL,
    clean,
    observed_work,
    provider_telemetry,
    read_snapshots,
    write_snapshot,
)
from display_state.observer import Observer, interruption_attribution
from display_state.resolver import resolve_display_state
from display_state.rpc_monitor import Connection, Monitor, RpcError


def apply_callback(observer, hook, **kwargs):
    observer.callback(hook)(**kwargs)
    received_hook, event = observer.events.get_nowait()
    assert received_hook == hook
    observer.apply(received_hook, event)
    return event


def test_rpc_snapshot_reports_server_relative_age_without_mutating_cache(monkeypatch):
    c, target = connection()
    c.rows['runtime'] = {**target, 'available': True, 'observed_at': 100, 'actions': ['goal.pause']}
    c.observed_monotonic['runtime'] = 100
    monkeypatch.setattr(time, 'monotonic', lambda: 115)
    assert c.snapshot()[0]['age_seconds'] == 15
    assert c.snapshot()[0]['available']
    monkeypatch.setattr(time, 'monotonic', lambda: 121)
    row = c.snapshot()[0]
    assert row['age_seconds'] == 21
    assert not row['available'] and row['actions'] == []
    assert 'age_seconds' not in c.rows['runtime']
    assert c.rows['runtime']['available']


def test_rpc_snapshot_missing_age_fails_closed_without_epoch_fallback(monkeypatch):
    c, target = connection()
    c.rows['runtime'] = {**target, 'available': True, 'actions': ['goal.pause']}
    monkeypatch.setattr(time, 'monotonic', lambda: 115)
    row = c.snapshot()[0]
    assert row['age_seconds'] is None
    assert not row['available'] and row['actions'] == []


@pytest.mark.parametrize(
    'observed_at',
    [
        pytest.param(None, id='null'),
        pytest.param('invalid', id='text'),
        pytest.param(True, id='boolean'),
        pytest.param(float('nan'), id='nan'),
        pytest.param(float('inf'), id='infinity'),
        pytest.param(10**5000, id='oversized-integer'),
    ],
)
def test_rpc_snapshot_invalid_age_fails_closed(observed_at, monkeypatch):
    c, target = connection()
    c.rows['runtime'] = {
        **target,
        'available': True,
        'observed_at': observed_at,
        'actions': ['goal.pause'],
    }
    monkeypatch.setattr(time, 'monotonic', lambda: 115)
    row = c.snapshot()[0]
    assert row['age_seconds'] is None
    assert not row['available'] and row['actions'] == []
    json.dumps(row, allow_nan=False)


def test_rpc_snapshot_uses_monotonic_age_after_wall_clock_rollback(monkeypatch):
    c, target = connection()
    c.rows['runtime'] = {**target, 'available': True, 'observed_at': 121, 'actions': ['goal.pause']}
    c.observed_monotonic['runtime'] = 100
    # The wall clock moved backward from 121 to 115; monotonic age remains 21s.
    monkeypatch.setattr(time, 'time', lambda: 115)
    monkeypatch.setattr(time, 'monotonic', lambda: 121)
    row = c.snapshot()[0]
    assert row['age_seconds'] == 21
    assert not row['available'] and row['actions'] == []


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


def test_display_observer_plugin_registers_interrupt_hook(monkeypatch):
    repo = Path(__file__).resolve().parents[2]
    entrypoint = repo / "integrations/display-observer/__init__.py"
    spec = importlib.util.spec_from_file_location("display_observer_registration", entrypoint)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    registered = []
    fake_observer = SimpleNamespace(
        callback=lambda hook: hook,
        start=lambda: None,
    )
    monkeypatch.setattr(module, "Observer", lambda: fake_observer)
    module.register(SimpleNamespace(register_hook=lambda hook, callback: registered.append((hook, callback))))
    assert ("agent_loop_stopped", "agent_loop_stopped") in registered


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
    start_event = apply_callback(observer, "on_session_start", session_id="parent")
    profile = start_event["profile"]
    observer.apply(
        "post_tool_call",
        {
            "session_id": "parent",
            "profile": profile,
            "tool_name": "terminal",
            "result": {
                "session_id": "process1",
                "status": reason,
                "promoted_from_foreground": reason != "yielded_to_background",
            },
        },
    )
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "profile": profile, "completed": True},
    )
    return observer


def test_agent_loop_stopped_marks_exact_turn_interrupted_without_settling_background():
    observer = observer_with_background()
    observer.callback("agent_loop_stopped")(
        session_key="parent",
        platform="tui",
        reason="user_stop",
        invalidation_reason="session_interrupt",
    )
    hook, event = observer.events.get_nowait()
    assert hook == "agent_loop_stopped"
    assert event["session_key"] == "parent"
    observer.apply(hook, event)
    session = next(iter(observer.sessions.values()))
    assert session["status"] == "interrupted"
    assert session["interruption"] == {
        "actor": "user",
        "reason": "user_stop",
        "invalidation_reason": "session_interrupt",
        "platform": "tui",
        "observed_at": session["interruption"]["observed_at"],
    }
    active = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert active["active"]
    assert active["summary"] == "Command continuing in background"

    session["processes"][0].update(status="exited", exit_code=0)
    settled = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert settled["state"] == "recent_activity"
    assert settled["summary"] == "Turn stopped by request"


def test_session_end_preserves_bounded_system_interrupt_attribution():
    observer = Observer()
    event = apply_callback(
        observer,
        "on_session_end",
        session_id="parent",
        turn_id="turn-1",
        platform="gateway",
        interrupted=True,
        turn_exit_reason="interrupted_during_api_call(turn_liveness_watchdog)",
    )
    assert "turn_exit_reason" not in event
    assert event["interruption_attribution"] == {
        "actor": "system",
        "phase": "api_call",
        "issuer": "turn_liveness_watchdog",
        "exit_reason": "interrupted_during_api_call(turn_liveness_watchdog)",
    }
    session = next(iter(observer.sessions.values()))
    assert session["status"] == "interrupted"
    assert session["interruption"] == {
        "actor": "system",
        "phase": "api_call",
        "issuer": "turn_liveness_watchdog",
        "exit_reason": "interrupted_during_api_call(turn_liveness_watchdog)",
        "platform": "gateway",
        "observed_at": session["interruption"]["observed_at"],
    }
    work = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert work["state"] == "system_interrupted"
    assert work["summary"] == "Hermes stopped the turn"
    resolved = resolve_display_state(
        {"work": work, "gateway_ok": True, "kanban": {}},
        {"measurements": {}},
        {"tier": "fresh", "valid_measurements": 0},
    )
    assert resolved["display_state"] == "needs_attention"
    assert resolved["reason_codes"] == ["observer_system_interrupt"]


@pytest.mark.parametrize(
    ("reason", "expected"),
    [
        ("interrupted_by_user", {"actor": "user", "exit_reason": "interrupted_by_user"}),
        (
            "interrupted_during_api_call",
            {
                "actor": "user",
                "phase": "api_call",
                "exit_reason": "interrupted_during_api_call",
            },
        ),
        (
            "interrupted_by_system(gateway_shutdown)",
            {
                "actor": "system",
                "phase": "turn",
                "issuer": "gateway_shutdown",
                "exit_reason": "interrupted_by_system(gateway_shutdown)",
            },
        ),
        ("interrupted_by_system(gateway shutdown)", None),
        ("local_processing_error(secret-bearing prose)", None),
        ("interrupted_by_system(" + "x" * 65 + ")", None),
    ],
)
def test_interrupt_attribution_accepts_only_structured_bounded_reasons(reason, expected):
    assert interruption_attribution(reason) == expected


def test_callback_discards_unrecognized_turn_exit_reason_before_queueing():
    observer = Observer()
    observer.callback("on_session_end")(
        session_id="parent",
        interrupted=True,
        turn_exit_reason="local_processing_error(secret-bearing prose)",
    )
    hook, event = observer.events.get_nowait()
    assert hook == "on_session_end"
    assert "turn_exit_reason" not in event
    assert "interruption_attribution" not in event


def test_new_turn_replaces_prior_interrupt_metadata_instead_of_merging_it():
    observer = Observer()
    apply_callback(
        observer,
        "agent_loop_stopped",
        session_id="parent",
        turn_id="turn-1",
        platform="tui",
        reason="user_stop",
        invalidation_reason="session_interrupt",
    )
    apply_callback(
        observer,
        "on_session_end",
        session_id="parent",
        turn_id="turn-2",
        interrupted=True,
        turn_exit_reason="interrupted_by_system(gateway_shutdown)",
    )
    interruption = observer.sessions[("unknown", "parent")]["interruption"]
    assert interruption == {
        "actor": "system",
        "phase": "turn",
        "issuer": "gateway_shutdown",
        "exit_reason": "interrupted_by_system(gateway_shutdown)",
        "observed_at": interruption["observed_at"],
    }


def test_new_turn_clears_previous_interrupt_detail():
    observer = Observer()
    observer.apply(
        "agent_loop_stopped",
        {"session_key": "parent", "reason": "user_stop", "platform": "tui"},
    )
    observer.apply("on_session_start", {"session_id": "parent"})
    session = next(iter(observer.sessions.values()))
    assert session["status"] == "running"
    assert "interruption" not in session


def test_agent_loop_stopped_resolves_distinct_observed_session_key_alias():
    observer = Observer()
    observer.apply(
        "on_session_start",
        {
            "profile": "home",
            "session_id": "stored-session-id",
            "session_key": "agent:main:tui:dm:s1",
        },
    )
    observer.apply(
        "agent_loop_stopped",
        {
            "profile": "home",
            "session_key": "agent:main:tui:dm:s1",
            "reason": "user_stop",
        },
    )
    assert list(observer.sessions) == [("home", "stored-session-id")]
    session = observer.sessions[("home", "stored-session-id")]
    assert session["session_key"] == "agent:main:tui:dm:s1"
    assert session["status"] == "interrupted"


@pytest.mark.parametrize("explicit_status", ["failed", "error", "stalled"])
def test_reduced_session_finalizer_clears_stale_interruption_metadata(explicit_status):
    observer = Observer()
    observer.apply(
        "agent_loop_stopped", {"session_key": "parent", "reason": "user_stop"}
    )
    observer.apply("on_session_end", {"session_id": "parent"})
    assert observer.sessions[("unknown", "parent")]["status"] == "interrupted"

    observer.apply(
        "on_session_end", {"session_id": "parent", "status": explicit_status}
    )
    row = observer.sessions[("unknown", "parent")]
    assert row["status"] == explicit_status
    # A hard failure wins; the interruption record must not survive as metadata.
    assert "interruption" not in row


def test_late_subagent_start_does_not_erase_observed_interruption():
    observer = Observer()
    observer.apply(
        "agent_loop_stopped", {"session_key": "parent", "reason": "user_stop"}
    )
    observer.apply(
        "subagent_start",
        {
            "parent_session_id": "parent",
            "child_session_id": "child",
            "child_subagent_id": "child-1",
        },
    )
    row = observer.sessions[("unknown", "parent")]
    assert row["status"] == "interrupted"
    assert row["interruption"]["reason"] == "user_stop"


def test_late_subagent_start_via_session_key_alias_preserves_interruption():
    observer = Observer()
    observer.apply(
        "on_session_start",
        {
            "profile": "home",
            "session_id": "stored-session-id",
            "session_key": "agent:main:tui:dm:s1",
        },
    )
    observer.apply(
        "agent_loop_stopped",
        {
            "profile": "home",
            "session_key": "agent:main:tui:dm:s1",
            "reason": "user_stop",
        },
    )
    observer.apply(
        "subagent_start",
        {
            "profile": "home",
            "parent_session_id": "stored-session-id",
            "child_session_id": "child",
            "child_subagent_id": "child-1",
        },
    )
    row = observer.sessions[("home", "stored-session-id")]
    assert row["status"] == "interrupted"
    assert row["interruption"]["reason"] == "user_stop"
    assert row["subagents"][0]["status"] == "running"


@pytest.mark.parametrize("process_status", ["failed", "error", "stalled"])
def test_explicit_terminal_process_status_is_a_hard_failure(process_status):
    session = {
        "session_id": "parent",
        "status": "completed",
        "last_event_at": time.time(),
        "processes": [{"session_id": "process1", "status": process_status}],
        "delegations": [],
        "subagents": [],
    }
    outcome = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert outcome["state"] == "failed"
    assert outcome["summary"] == "Observed work ended with an error"


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
        child_goal="Review /srv/hermes/display and api_key=secret-value",
    )
    hook, event = observer.events.get_nowait()
    assert hook == "subagent_start"
    assert "/srv/hermes/display" in event["child_goal"]
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
                    "Operation may have completed for /srv/hermes/customer; "
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
    assert "/srv/hermes/customer" in outcome["detail"]


def test_concurrent_tool_calls_keep_exact_identity_and_settle_independently():
    observer = Observer()
    start_event = apply_callback(observer, "on_session_start", session_id="parent")
    profile = start_event["profile"]
    barrier = threading.Barrier(3)

    def publish(call_id, tool_name):
        callback = observer.callback("pre_tool_call")
        barrier.wait()
        callback(
            session_id="parent",
            turn_id="turn-1",
            tool_call_id=call_id,
            tool_name=tool_name,
        )

    threads = [
        threading.Thread(target=publish, args=("call-search", "search_files")),
        threading.Thread(target=publish, args=("call-read", "read_file")),
    ]
    for thread in threads:
        thread.start()
    barrier.wait()
    for thread in threads:
        thread.join()
    while not observer.events.empty():
        hook, event = observer.events.get_nowait()
        observer.apply(hook, event)

    session = observer.sessions[(profile, "parent")]
    assert {row["tool_call_id"] for row in session["tools"]} == {
        "call-search",
        "call-read",
    }
    assert all(row["status"] == "running" for row in session["tools"])
    work = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert work["active"]
    assert work["tool_count"] == 2
    assert work["summary"] == "2 tool calls active"

    observer.apply(
        "post_tool_call",
        {
            "session_id": "parent",
            "profile": profile,
            "turn_id": "turn-1",
            "tool_call_id": "call-read",
            "tool_name": "read_file",
            "status": "ok",
            "duration_ms": 1250,
        },
    )
    statuses = {row["tool_call_id"]: row["status"] for row in session["tools"]}
    assert statuses == {"call-search": "running", "call-read": "completed"}
    assert observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )["summary"] == "1 tool call active"


@pytest.mark.parametrize("tool_status", ["blocked", "timeout"])
def test_tool_terminal_statuses_are_bounded_without_evicting_unknown(tool_status):
    observer = Observer()
    start_event = apply_callback(observer, "on_session_start", session_id="parent")
    profile = start_event["profile"]
    apply_callback(
        observer,
        "pre_tool_call",
        session_id="parent",
        turn_id="turn-1",
        tool_call_id="call-lost",
        tool_name="search_files",
    )
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "profile": profile, "completed": True},
    )

    for index in range(63):
        apply_callback(
            observer,
            "post_tool_call",
            session_id="parent",
            tool_call_id=f"call-{index}",
            tool_name="tool",
            status=tool_status,
        )

    apply_callback(
        observer,
        "post_tool_call",
        session_id="parent",
        tool_call_id="call-overflow",
        tool_name="tool",
        status=tool_status,
    )
    session = observer.sessions[(profile, "parent")]
    call_ids = {row["tool_call_id"] for row in session["tools"]}
    assert len(session["tools"]) == 64
    assert "call-lost" in call_ids
    assert "call-overflow" in call_ids
    assert observer.dropped == 0
    assert tool_status in TOOL_TERMINAL
    assert tool_status not in TERMINAL


@pytest.mark.parametrize("tool_status", ["blocked", "timeout"])
def test_tool_terminal_status_allows_session_eviction_but_not_blocked_background(tool_status):
    observer = Observer()
    profile = "synthetic-profile"
    for index in range(64):
        blocked_background = index == 0
        observer.sessions[(profile, f"session-{index}")] = {
            "session_id": f"session-{index}",
            "profile": profile,
            "status": "completed",
            "tools": [] if blocked_background else [{"status": tool_status}],
            "processes": (
                [{"session_id": "background", "status": "blocked"}]
                if blocked_background
                else []
            ),
            "delegations": [],
            "subagents": [],
        }

    observer.apply(
        "on_session_start",
        {"profile": profile, "session_id": "replacement"},
    )

    assert len(observer.sessions) == 64
    assert (profile, "session-0") in observer.sessions
    assert (profile, "session-1") not in observer.sessions
    assert (profile, "replacement") in observer.sessions


def test_finished_turn_marks_missing_tool_completion_unknown():
    observer = Observer()
    observer.apply("on_session_start", {"session_id": "parent"})
    observer.apply(
        "pre_tool_call",
        {
            "session_id": "parent",
            "turn_id": "turn-1",
            "tool_call_id": "call-lost",
            "tool_name": "mcp.crm.update",
        },
    )
    observer.apply("on_session_end", {"session_id": "parent", "completed": True})
    session = observer.sessions[("unknown", "parent")]
    assert session["tools"][0]["status"] == "unknown"
    assert session["tools"][0]["evidence"] == (
        "turn ended without matching tool completion"
    )
    assert session["tool_outcome"] == {
        "status": "unknown",
        "tool_name": "mcp.crm.update",
        "tool_call_id": "call-lost",
        "message": "A previous turn ended without exact tool completion evidence.",
        "observed_at": session["tool_outcome"]["observed_at"],
    }
    outcome = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert outcome["state"] == "unknown"
    assert outcome["summary"] == "Tool outcome unknown; observation incomplete"


def test_missing_tool_unknown_wins_public_state_over_recent_log_completion(tmp_path, monkeypatch):
    import hermes_display_server as server

    observer = Observer()
    start_event = apply_callback(observer, "on_session_start", session_id="parent")
    profile = start_event["profile"]
    apply_callback(
        observer,
        "pre_tool_call",
        session_id="parent",
        turn_id="turn-1",
        tool_call_id="call-lost",
        tool_name="mcp.crm.update",
    )
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "profile": profile, "completed": True},
    )
    session = observer.sessions[(profile, "parent")]
    session["last_event_at"] = time.time() - 31
    snapshot = {
        "schema_version": 1,
        "coverage": "observed",
        "sources": [{
            "schema_version": 1,
            "owner": observer.owner,
            "observed_at": time.time(),
            "fresh": True,
            "age_seconds": 0,
            "sessions": [session],
        }],
    }
    log_path = tmp_path / "agent.log"
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_path.write_text(
        "\n".join([
            f'{stamp} INFO [parent] agent.conversation_loop: conversation turn: session=parent model=test provider=test platform=cli history=1 msg="Check display"',
            f"{stamp} INFO [parent] agent.conversation_loop: Turn ended: reason=text_response(finish_reason=stop) session=parent",
        ]) + "\n",
        encoding="utf-8",
    )
    log_work = server.recent_agent_work(log_path)
    assert log_work["state"] == "recent_activity"

    monkeypatch.setattr(server, "LOG_DIR", tmp_path)
    monkeypatch.setattr(server, "read_snapshots", lambda: snapshot)
    monkeypatch.setattr(server, "active_session_summary", lambda *args, **kwargs: {"count": 0, "sessions": []})
    monkeypatch.setattr(server, "active_agent_count", lambda: 0)
    monkeypatch.setattr(server, "kanban_snapshot", lambda: {"active": 0, "summary": "0 active task(s)", "tasks": []})
    monkeypatch.setattr(server, "system_snapshot", lambda: {"cpu": 0.1, "memory": 0.2, "temp_c": 50})
    monkeypatch.setattr(server, "gateway_ok_recently", lambda text: True)
    monkeypatch.setattr(server, "load_manual_override", lambda: {})
    monkeypatch.setattr(server, "load_provider_route_rail", lambda: {"providers": []})
    monkeypatch.setattr(server, "load_remote_memory_status", lambda: {"state": "unknown"})
    monkeypatch.setattr(server, "persist_display_bus", lambda *args: None)

    state = server.build_state()
    work = state["live"]["current_work"]
    assert work["state"] == "unknown"
    assert work["source"] == "hermes_observer"
    assert state["live"]["resolver"]["reason_codes"] == ["observer_unknown"]
    assert "Last activity completed just now." not in json.dumps(work)


def test_new_turn_rotates_tool_rail_and_preserves_prior_unknown_evidence():
    observer = Observer()
    observer.apply("on_session_start", {"session_id": "parent"})
    observer.apply(
        "pre_tool_call",
        {
            "session_id": "parent",
            "turn_id": "turn-1",
            "tool_call_id": "call-lost",
            "tool_name": "mcp.crm.update",
        },
    )
    observer.apply(
        "on_session_end",
        {"session_id": "parent", "turn_id": "turn-1", "completed": True},
    )
    observer.apply(
        "pre_tool_call",
        {
            "session_id": "parent",
            "turn_id": "turn-2",
            "tool_call_id": "call-current",
            "tool_name": "search_files",
        },
    )

    session = observer.sessions[("unknown", "parent")]
    assert session["turn_id"] == "turn-2"
    assert [row["tool_call_id"] for row in session["tools"]] == ["call-current"]
    assert session["tool_outcome"]["status"] == "unknown"
    assert session["tool_outcome"]["tool_call_id"] == "call-lost"
    assert "previous turn" in session["tool_outcome"]["message"].lower()


def test_tool_rail_saturation_never_evicts_unknown_evidence():
    observer = Observer()
    observer.apply("on_session_start", {"session_id": "parent"})
    session = observer.sessions[("unknown", "parent")]
    session["tools"] = [
        {
            "tool_call_id": f"call-{index}",
            "tool_name": "tool",
            "status": "unknown",
        }
        for index in range(64)
    ]

    observer.apply(
        "pre_tool_call",
        {
            "session_id": "parent",
            "tool_call_id": "call-overflow",
            "tool_name": "search_files",
        },
    )

    assert len(session["tools"]) == 64
    assert all(row["status"] == "unknown" for row in session["tools"])
    assert observer.dropped == 1


def test_session_eviction_preserves_unknown_tool_evidence():
    observer = Observer()
    for index in range(64):
        observer.sessions[("unknown", f"session-{index}")] = {
            "session_id": f"session-{index}",
            "profile": "unknown",
            "status": "completed",
            "tools": ([{"tool_call_id": "lost", "status": "unknown"}] if index == 0 else []),
            "processes": [],
            "delegations": [],
            "subagents": [],
        }

    observer.apply("on_session_start", {"session_id": "replacement"})

    assert ("unknown", "session-0") in observer.sessions
    assert ("unknown", "session-1") not in observer.sessions
    assert ("unknown", "replacement") in observer.sessions


def test_terminal_tool_error_contributes_to_observed_failure():
    observer = Observer()
    observer.apply("on_session_start", {"session_id": "parent"})
    observer.apply(
        "post_tool_call",
        {
            "session_id": "parent",
            "tool_call_id": "call-failed",
            "tool_name": "search_files",
            "status": "error",
        },
    )
    observer.apply("on_session_end", {"session_id": "parent", "completed": True})
    session = observer.sessions[("unknown", "parent")]
    outcome = observed_work(
        {"sources": [{"sessions": [session], "fresh": True, "age_seconds": 0}]}
    )
    assert outcome["state"] == "failed"
    assert outcome["summary"] == "Observed work ended with an error"


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
            "path": "/srv/hermes/project",
            "title": "token usage",
            "secret": "remove",
            "detail": "api_key=sk-1234567890",
        }
    )
    assert text["path"] == "/srv/hermes/project" and text["title"] == "token usage"
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
    assert "runtime" in c.observed_monotonic
    c.call = lambda *args: (_ for _ in ()).throw(RpcError(4009))
    row = c.hydrate(target)
    assert not row["available"] and not row["actions"]
    assert "runtime" in c.observed_monotonic
    assert row["control"]["revision"] == "r1"
    assert row["error"] == "control temporarily unavailable"
    c.call = lambda *args: {"output": "Session ID: someone-else"}
    assert not c.hydrate(target)["available"]
    assert "runtime" not in c.observed_monotonic


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
    monkeypatch.setattr(
        server,
        "cron_incident_snapshot",
        lambda: {"available": True, "open": 1, "recent": 1, "summary": "1 open scheduler incident", "incidents": [{
            "id": "inc-1", "job_id": "job-1", "job": "Nightly display check", "profile": "default",
            "state": "alerted", "failure_type": "timeout", "first_seen_at": "2026-09-15T00:00:00Z",
            "last_seen_at": "2026-09-15T01:00:00Z", "age_seconds": 60, "recent": True,
            "error": "timed out", "output_file": "/srv/hermes/.hermes/cron/output/job-1/run.md",
        }]},
    )
    operator_state = {
        "generated_at": "2026-09-15T01:00:00+00:00",
        "state_preset": "quiet_watch",
        "live": {
            "system": {"cpu": 0.2},
            "cron_incidents": {"available": True, "open": 1, "recent": 1},
        },
    }
    monkeypatch.setattr(server, "cached_build_state", lambda: operator_state)
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

        status, integration = request("GET", "/api/hermes-integration")
        assert status == 200
        assert integration["cron_incidents"]["incidents"][0]["job"] == "Nightly display check"
        assert integration["cron_incidents"]["profiles_checked"] == 0
        assert integration["cron_incidents"]["read_errors"] == 0
        assert integration["cron_incidents"]["profiles_truncated"] is False
        assert integration["cron_incidents"]["discovery_error"] is False
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
        family_aliases = [
            "audience=family", "audience=theater", "family=1", "family=TRUE",
            "family=Yes", "view=theater", "audience=FAMILY", "audience=TheAtEr",
            "family=TrUe", "view=THEATER",
        ]
        for alias in family_aliases:
            status, body = request("GET", f"/api/hermes-state?{alias}")
            assert status == 200
            assert body["live"]["family_mode"] is True
            assert "cron_incidents" not in body["live"]
        status, operator = request("GET", "/api/hermes-state?audience=operator")
        assert status == 200
        assert "cron_incidents" in operator["live"]

        monkeypatch.setattr(server, "cached_build_state", lambda: (_ for _ in ()).throw(RuntimeError("synthetic")))
        for alias in family_aliases:
            status, body = request("GET", f"/api/hermes-state?{alias}")
            assert status == 503
            assert body["live"]["family_mode"] is True
            assert "cron_incidents" not in body["live"]
        safe = server.family_safe_state(
            {"live": {"integration": {"secret": "private"}, "cron_incidents": {"open": 1}, "system": {}}}
        )
        assert "integration" not in safe["live"]
        assert "cron_incidents" not in safe["live"]
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)


def test_ambient_cron_snapshot_excludes_private_incident_details():
    import hermes_display_server as server

    ambient = server.cron_incident_ambient_snapshot({
        "available": True,
        "open": 1,
        "recent": 1,
        "incidents": [{
            "id": "inc-1", "job_id": "job-1", "job": "Nightly display check",
            "profile": "silver", "state": "alerted", "failure_type": "timeout",
            "first_seen_at": "2026-09-15T00:00:00Z", "last_seen_at": "2026-09-15T01:00:00Z",
            "age_seconds": 60, "recent": True, "error": "private diagnostic",
            "output_file": "/srv/hermes/.hermes/cron/output/job-1/run.md",
        }],
    })

    assert ambient["category"] == "scheduler"
    assert ambient["label"] == "Scheduled task"
    assert ambient["incidents"] == [{
        "id": ambient["incidents"][0]["id"], "category": "scheduler",
        "label": "Scheduled task", "recent": True,
    }]
    assert len(ambient["incidents"][0]["id"]) == 32
    again = server.cron_incident_ambient_snapshot({
        "available": True, "open": 1, "recent": 1,
        "incidents": [{"id": "inc-1", "job_id": "job-1", "job": "changed", "profile": "silver", "recent": True}],
    })
    assert again["incidents"][0]["id"] == ambient["incidents"][0]["id"]
    assert "private diagnostic" not in json.dumps(ambient)
    assert "/srv/hermes" not in json.dumps(ambient)
    assert "Nightly display check" not in json.dumps(ambient)
    assert "silver" not in json.dumps(ambient)
    assert "timeout" not in json.dumps(ambient)


def test_ambient_cron_snapshot_scrubs_paths_in_public_labels():
    import hermes_display_server as server

    snapshot = {
        "available": True, "open": 1, "recent": 1,
        "incidents": [{
            "id": "/private/example/incident", "job": "/private/example/job",
            "profile": "/private/example/profile", "state": "alerted",
            "failure_type": "timeout", "age_seconds": 60, "recent": True,
        }],
    }
    private = server.sanitize_cron_incident_snapshot(snapshot)
    assert private["incidents"][0]["job"] == "/private/example/job"
    ambient = server.cron_incident_ambient_snapshot(snapshot)
    assert "/private/example" not in json.dumps(ambient)
    assert ambient["recent"] == 1
    assert ambient["label"] == "Scheduled task"
    assert set(ambient["incidents"][0]) == {"id", "category", "label", "recent"}


def test_unavailable_cron_snapshot_cannot_drive_ambient_alerts():
    import hermes_display_server as server

    ambient = server.cron_incident_ambient_snapshot({
        "available": False, "open": 4, "recent": 2,
        "incidents": [{"id": "partial", "recent": True}],
    })

    assert ambient == {
        "available": False, "open": 0, "recent": 0,
        "category": "scheduler", "label": "Scheduled task", "incidents": [],
    }


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
