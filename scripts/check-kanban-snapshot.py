#!/usr/bin/env python3
"""Regression checks for hermes_display_server.kanban_snapshot().

Guards two reliability properties that a long-running display server depends on:

  * Repeated kanban_snapshot() calls do not leak file descriptors.
  * The read-only SQLite connection is closed after each call.

The test is hermetic: it builds a throwaway sqlite DB with a minimal `tasks`
table in a temp dir and points the server's KANBAN_DB / LEGACY_KANBAN_DB module
globals at it, so it never touches the live NUC kanban database.
"""
from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import hermes_display_server as srv  # noqa: E402


FAILURES: list[str] = []


def expect(condition: bool, label: str) -> None:
    if not condition:
        FAILURES.append(label)
        print(f"FAIL {label}")
    else:
        print(f"  ok   {label}")


def fd_count() -> int | None:
    """Open file-descriptor count for this process, or None when unavailable."""
    try:
        return len(os.listdir("/proc/self/fd"))
    except OSError:
        return None


def build_kanban_db(path: Path) -> None:
    """Create a minimal tasks table matching the columns kanban_snapshot() reads."""
    with sqlite3.connect(path) as con:
        con.execute(
            """
            create table tasks (
                title text,
                status text,
                assignee text,
                priority text,
                current_step_key text,
                last_heartbeat_at text,
                started_at text,
                created_at text
            )
            """
        )
        con.executemany(
            "insert into tasks "
            "(title, status, assignee, priority, current_step_key, last_heartbeat_at, started_at, created_at) "
            "values (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("Fix display feed", "blocked", "claude", "high", "diagnose", "2026-05-29 08:00:00", None, None),
                ("Tune optic motion", "running", "codex", "med", "render", "2026-05-29 08:01:00", None, None),
                ("Archive old assets", "done", "claude", "low", "sweep", "2026-05-29 07:00:00", None, None),
            ],
        )
        con.commit()


def run_snapshot_checks(db_path: Path) -> None:
    original_kanban = srv.KANBAN_DB
    original_legacy = srv.LEGACY_KANBAN_DB
    # Point both candidate paths at the fixture so kanban_db_path() resolves to
    # our temp DB and never falls back to a live install.
    srv.KANBAN_DB = db_path
    srv.LEGACY_KANBAN_DB = db_path.with_name("nonexistent-legacy.db")
    try:
        # Sanity: the snapshot reads the seeded rows (only the two active tasks).
        snap = srv.kanban_snapshot()
        expect(snap["active"] == 2, "snapshot returns the two active tasks")
        statuses = {task["status"] for task in snap["tasks"]}
        expect(statuses == {"blocked", "running"}, "snapshot excludes the done task")
        expect(snap["tasks"][0]["status"] == "blocked", "blocked task sorts first")

        # The read-only SQLite connection must be closed after the call. Track
        # the connection the snapshot opens and confirm it rejects further use.
        captured: list[sqlite3.Connection] = []
        real_connect = sqlite3.connect

        def tracking_connect(*args, **kwargs):
            con = real_connect(*args, **kwargs)
            captured.append(con)
            return con

        srv.sqlite3.connect = tracking_connect
        try:
            srv.kanban_snapshot()
        finally:
            srv.sqlite3.connect = real_connect

        expect(len(captured) == 1, "snapshot opens exactly one connection")
        if captured:
            try:
                captured[0].execute("select 1")
                expect(False, "connection is closed after snapshot")
            except sqlite3.ProgrammingError:
                expect(True, "connection is closed after snapshot")

        # Repeated calls must not leak file descriptors. Warm up once so any
        # one-time imports/caches settle, then compare fd counts across a burst.
        srv.kanban_snapshot()
        baseline = fd_count()
        for _ in range(250):
            srv.kanban_snapshot()
        after = fd_count()

        if baseline is None or after is None:
            print("  skip /proc/self/fd unavailable; fd-leak check skipped")
        else:
            # Allow tiny jitter (e.g. an interpreter-internal fd) but no growth
            # proportional to the 250 calls.
            expect(after <= baseline + 2, f"no fd leak across 250 calls (baseline={baseline} after={after})")
    finally:
        srv.KANBAN_DB = original_kanban
        srv.LEGACY_KANBAN_DB = original_legacy


def run_resolver_checks() -> None:
    sys_snapshot = {
        "cpu": 0.20,
        "sensor_error": False,
        "measurements": {
            "cpu": {"value": 0.20, "valid": True},
            "temp_c": {"value": 68.0, "valid": True},
        },
    }
    freshness = {"tier": "fresh", "valid_measurements": 2, "stale_measurements": []}
    queued_blocked = {
        "active": 2,
        "tasks": [
            {"title": "Queued blocked card", "status": "blocked"},
            {"title": "Queued pending card", "status": "pending"},
        ],
    }
    idle_facts = {
        "work": {"active": False, "state": "quiet_watch", "kind": "quiet"},
        "kanban": queued_blocked,
        "warn_lines": [],
        "gateway_ok": True,
        "system": sys_snapshot,
    }
    idle = srv.resolve_display_state(idle_facts, sys_snapshot, freshness)
    expect(idle["display_state"] == "quiet_watch", "idle queued blocked cards stay quiet/local watch")
    expect("blocked card queued" in idle["secondary_badges"], "idle queued blocked cards remain secondary context")

    active_facts = {
        "work": {"active": True, "state": "current_work", "kind": "thinking", "visual_kind": "reasoning"},
        "kanban": queued_blocked,
        "warn_lines": [],
        "gateway_ok": True,
        "system": sys_snapshot,
    }
    active = srv.resolve_display_state(active_facts, sys_snapshot, freshness)
    expect(active["display_state"] == "planning_reasoning", "active reasoning beats queued blocked cards")
    expect("blocked card queued" in active["secondary_badges"], "active reasoning keeps blocked card secondary")

    explicit_blocked_facts = {
        "work": {"active": False, "state": "blocked", "kind": "blocked"},
        "kanban": queued_blocked,
        "warn_lines": [],
        "gateway_ok": True,
        "system": sys_snapshot,
    }
    explicit_blocked = srv.resolve_display_state(explicit_blocked_facts, sys_snapshot, freshness)
    expect(explicit_blocked["display_state"] == "blocked_user_task", "explicit blocked work still renders blocked")


def run_turn_end_checks(tmp_path: Path) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    session_id = "testsession_000001"
    completed_log = tmp_path / "agent-completed.log"
    completed_log.write_text(
        "\n".join(
            [
                f'{stamp} INFO [{session_id}] agent.conversation_loop: conversation turn: session={session_id} model=gpt-5.5 provider=openai-codex platform=cli history=1 msg="Check display"',
                f"{stamp} INFO [{session_id}] agent.conversation_loop: API call #1: model=gpt-5.5 provider=openai-codex in=1 out=1 total=2 latency=1.0s",
                f"{stamp} INFO [{session_id}] agent.conversation_loop: Turn ended: reason=text_response(finish_reason=stop) model=gpt-5.5 api_calls=1/100 budget=20/100 tool_turns=0 last_msg_role=assistant response_len=12 session={session_id}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    work = srv.recent_agent_work(completed_log)
    expect(work.get("active") is False, "turn-ended log clears current_work active state")
    expect(work.get("state") == "recent_activity", "turn-ended log renders as recent activity")
    active = srv.active_session_summary(completed_log, minutes=srv.CURRENT_WORK_SECONDS / 60)
    expect(active["count"] == 0, "turn-ended log clears active session count")

    active_log = tmp_path / "agent-active.log"
    active_log.write_text(
        "\n".join(
            [
                f'{stamp} INFO [{session_id}] agent.conversation_loop: conversation turn: session={session_id} model=gpt-5.5 provider=openai-codex platform=cli history=2 msg="Check again"',
                f"{stamp} INFO [{session_id}] agent.conversation_loop: API call #2: model=gpt-5.5 provider=openai-codex in=1 out=1 total=2 latency=1.0s",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    work = srv.recent_agent_work(active_log)
    expect(work.get("active") is True, "unterminated recent turn still renders active")
    active = srv.active_session_summary(active_log, minutes=srv.CURRENT_WORK_SECONDS / 60)
    expect(active["count"] == 1, "unterminated recent turn still counts active")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        db_path = tmp_path / "kanban.db"
        build_kanban_db(db_path)
        run_snapshot_checks(db_path)
        run_resolver_checks()
        run_turn_end_checks(tmp_path)

    if FAILURES:
        print(f"FAIL kanban_snapshot checks: {len(FAILURES)} failure(s)")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("OK kanban_snapshot regression checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
