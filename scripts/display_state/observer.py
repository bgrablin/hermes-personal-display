"""In-process observer. Never drains completion queues or invokes agent commands."""

from __future__ import annotations

import json
import logging
import queue
import re
import sys
import threading
import time
import uuid
from pathlib import Path

from display_state.integration import TERMINAL, TOOL_TERMINAL, clean, write_snapshot

log = logging.getLogger(__name__)


def process_identity(process):
    return {
        key: getattr(process, key, None)
        for key in ("owner_task_id", "parent_session_id", "session_key")
    }


def completed_receipt(profile, process):
    """Exact, bounded, owner-pinned read. Never prune files or consume delivery."""
    pid = process["session_id"]
    if not re.fullmatch(r"proc_[A-Za-z0-9_-]+", pid) or not Path(profile).is_absolute():
        return None
    if not process.get("parent_session_id") or not process.get("owner_task_id"):
        return None
    path = Path(profile) / "logs/process-results" / f"{pid}.json"
    try:
        if path.is_symlink():
            return None
        with path.open("rb") as stream:
            content = stream.read(512_001)
        if len(content) > 512_000 or time.time() - path.stat().st_mtime > 7 * 86400:
            return None
        row = json.loads(content)
        if row.get("id") != pid or any(
            row.get(key) != process.get(key)
            for key in ("owner_task_id", "parent_session_id", "session_key")
        ):
            return None
        return {
            "status": "exited",
            "exit_code": row.get("exit_code"),
            "evidence": "retained receipt",
        }
    except (OSError, ValueError, TypeError, AttributeError):
        return None


class Observer:
    def __init__(self):
        self.owner = uuid.uuid4().hex
        self.sessions = {}
        self.events = queue.Queue(maxsize=512)
        self.dropped = 0

    def callback(self, hook):
        def receive(**kwargs):
            # Extract before queuing: no prompts, histories or arbitrary tool output retained.
            event = {
                key: kwargs[key]
                for key in (
                    "session_id",
                    "parent_session_id",
                    "session_key",
                    "turn_id",
                    "tool_call_id",
                    "tool_name",
                    "completed",
                    "interrupted",
                    "model",
                    "status",
                    "child_session_id",
                    "child_subagent_id",
                    "child_status",
                    "child_role",
                    "child_goal",
                    "parent_subagent_id",
                    "parent_turn_id",
                    "duration_ms",
                    "platform",
                    "reason",
                    "invalidation_reason",
                )
                if key in kwargs
            }
            if event.get("child_goal"):
                event["child_goal"] = clean(event["child_goal"])[:240]
            try:
                from hermes_constants import get_hermes_home

                event["profile"] = str(get_hermes_home())
            except ImportError:
                event["profile"] = "unknown"
            if hook == "post_tool_call":
                raw = kwargs.get("result")
                if isinstance(raw, str):
                    try:
                        raw = json.loads(raw)
                    except (ValueError, TypeError):
                        raw = {}
                if isinstance(raw, dict):
                    event["result"] = {
                        k: raw[k]
                        for k in (
                            "status",
                            "error",
                            "session_id",
                            "exit_code",
                            "notify_on_complete",
                            "promoted_from_foreground",
                            "delegation_id",
                            "units",
                            "count",
                            "outcome_uncertain",
                        )
                        if k in raw
                    }
                    # A background launch can deliberately have notifications off.
                    # A returned process ID from terminal is structured evidence;
                    # its launch exit_code is not the command's exit outcome.
                    if kwargs.get("tool_name") in ("terminal", "process_manage"):
                        pid = raw.get("session_id")
                        registry = getattr(
                            sys.modules.get("tools.process_registry"),
                            "process_registry",
                            None,
                        )
                        process = registry.get(pid) if registry and pid else None
                        if process is not None and getattr(process, "id", None) == pid:
                            event["process_identity"] = process_identity(process)
                    entries = raw.get("results") or [raw]
                    if not isinstance(entries, list):
                        entries = []
                    event["process_accounting"] = [
                        {"session_id": p["session_id"], "reason": kind}
                        for entry in entries[:64]
                        if isinstance(entry, dict)
                        for kind in (
                            "handed_off_processes",
                            "orphaned_processes",
                            "unread_completions",
                        )
                        for p in (entry.get(kind) or [])[:64]
                        if isinstance(p, dict) and isinstance(p.get("session_id"), str)
                    ][:64]
            try:
                self.events.put_nowait((hook, clean(event)))
            except queue.Full:
                self.dropped += 1

        return receive

    def apply(self, hook, event):
        profile = event.get("profile", "unknown")
        session_key = event.get("session_key")
        sid = event.get("parent_session_id") or event.get("session_id")
        key = None
        if hook == "agent_loop_stopped" and session_key:
            # Gateway/TUI interruption events identify the transport session key,
            # which can differ from the stored session ID used by lifecycle hooks.
            # Resolve only an alias observed on that exact profile; never guess
            # between concurrently running sessions.
            matches = [
                candidate
                for candidate, row in self.sessions.items()
                if candidate[0] == profile
                and (
                    row.get("session_key") == session_key
                    or row.get("session_id") == session_key
                )
            ]
            if len(matches) == 1:
                key = matches[0]
                sid = self.sessions[key]["session_id"]
        sid = sid or session_key
        if not sid:
            return
        key = key or (profile, sid)
        if key not in self.sessions and len(self.sessions) >= 64:
            settled = next(
                (
                    k
                    for k, s in self.sessions.items()
                    if s["status"] in TERMINAL
                    and all(p["status"] in TERMINAL for p in s["processes"])
                    and all(d.get("settled") for d in s["delegations"])
                    and all(
                        a.get("status") in TERMINAL
                        for a in s.get("subagents", [])
                    )
                    and all(
                        t.get("status") in TOOL_TERMINAL
                        for t in s.get("tools", [])
                    )
                ),
                None,
            )
            if settled is not None:
                del self.sessions[settled]
            else:
                self.dropped += 1
                return  # Coverage is bounded; never evict unsettled work and claim completion.
        s = self.sessions.setdefault(
            key,
            {
                "session_id": sid,
                "profile": key[0],
                "status": "unknown",
                "tools": [],
                "processes": [],
                "delegations": [],
                "subagents": [],
            },
        )
        s["last_event_at"] = time.time()
        event_turn_id = event.get("turn_id")
        if isinstance(event_turn_id, str) and event_turn_id:
            previous_turn_id = s.get("turn_id")
            if previous_turn_id and previous_turn_id != event_turn_id:
                # Session-start is not a per-turn hook. Rotate on the first
                # identity-bearing event for the next turn so old terminal rows
                # cannot contaminate current activity. Preserve unresolved prior
                # evidence as a fail-closed outcome instead of silently dropping it.
                previous_unknown = next(
                    (
                        row
                        for row in s.get("tools", [])
                        if row.get("status") == "unknown"
                    ),
                    None,
                )
                if previous_unknown and not s.get("tool_outcome"):
                    s["tool_outcome"] = {
                        "status": "unknown",
                        "tool_name": previous_unknown.get("tool_name") or "tool",
                        "tool_call_id": previous_unknown.get("tool_call_id"),
                        "message": "A previous turn ended without exact tool completion evidence.",
                        "observed_at": time.time(),
                    }
                s["tools"] = []
            s["turn_id"] = event_turn_id
        if session_key and hook != "agent_loop_stopped":
            s["session_key"] = session_key
        if hook == "on_session_start":
            s["status"] = "running"
            # Tool calls are turn-scoped. Keep independently tracked background
            # processes/delegations, but start each new turn with an empty call rail.
            s["tools"] = []
            s.pop("interruption", None)
        elif hook == "on_session_end":
            explicit_status = event.get("status")
            if explicit_status in {"failed", "error", "stalled"}:
                s["status"] = explicit_status
                # An explicit hard failure supersedes a recorded interruption;
                # keeping both would produce contradictory snapshot metadata.
                s.pop("interruption", None)
            elif event.get("interrupted"):
                s["status"] = "interrupted"
            elif event.get("completed"):
                s["status"] = "completed"
            elif s.get("status") != "interrupted":
                s["status"] = "failed"
            self.mark_unsettled_tools_unknown(s)
        elif hook == "agent_loop_stopped":
            # Immediate identity-bearing evidence for /stop, /new's running-agent
            # path, and TUI/Desktop session.interrupt. It settles only the parent
            # turn; background work retains its independently observed state.
            s["status"] = "interrupted"
            s["interruption"] = {
                key: event.get(key)
                for key in ("reason", "invalidation_reason", "platform")
                if event.get(key)
            }
            s["interruption"]["observed_at"] = time.time()
        elif hook in ("pre_tool_call", "pre_api_request"):
            s["status"] = "running"
            s["tool"] = event.get("tool_name")
            s.pop("interruption", None)
            if hook == "pre_tool_call":
                self.track_tool_start(s, event)
        elif hook == "api_request_error":
            s["request_status"] = "error; turn outcome pending"
        elif (
            hook == "post_tool_call"
            and (event.get("result") or {}).get("outcome_uncertain") is True
        ):
            raw = event["result"]
            s["tool_outcome"] = {
                "status": "unknown",
                "tool_name": event.get("tool_name") or "tool",
                "tool_call_id": event.get("tool_call_id"),
                "message": raw.get("error")
                or "The operation may have completed; inspect external state before retrying.",
                "observed_at": time.time(),
            }
        if hook == "post_tool_call":
            self.track_tool_stop(s, event)
        # turn_id is observed identity only, never a durable receipt claim.
        if hook == "subagent_start":
            self.track_subagent_start(s, event)
        elif hook == "subagent_stop":
            self.track_subagent_stop(s, event)
        raw = event.get("result") or {}
        if (
            hook == "post_tool_call"
            and (
                event.get("tool_name") == "terminal"
                or (
                    event.get("tool_name") == "process_manage"
                    and raw.get("status") == "handed_off"
                )
            )
            and isinstance(raw.get("session_id"), str)
            and not raw.get("error")
        ):
            self.track_process(
                s,
                raw["session_id"],
                raw.get("status") or "background",
                event.get("process_identity"),
            )
        for process in event.get("process_accounting", []):
            self.track_process(s, process["session_id"], process["reason"])
        if (
            hook == "post_tool_call"
            and event.get("tool_name") == "delegate_task"
            and raw.get("status") == "dispatched"
        ):
            did = raw.get("delegation_id")
            if did and not any(d["delegation_id"] == did for d in s["delegations"]):
                if len(s["delegations"]) >= 64:
                    self.dropped += 1
                    return
                units = raw.get("units") or [
                    {
                        "delegation_id": did,
                        "group": None,
                        "task_indexes": list(
                            range(min(64, int(raw.get("count") or 1)))
                        ),
                    }
                ]
                s["delegations"].append(
                    {
                        "delegation_id": did,
                        "units": [dict(u, status="running") for u in units],
                    }
                )
        # Child stop is not unit completion. Only the registry settles exact dispatch units.

    def track_tool_start(self, session, event):
        """Track one exact tool call without retaining arguments or tool output."""
        call_id = event.get("tool_call_id")
        if not isinstance(call_id, str) or not call_id:
            return
        tools = session.setdefault("tools", [])
        existing = next((row for row in tools if row.get("tool_call_id") == call_id), None)
        if existing is not None:
            # A late duplicate start must not resurrect a terminal call.
            if existing.get("status") != "running":
                return
        else:
            if len(tools) >= 64:
                settled = next(
                    (row for row in tools if row.get("status") in TOOL_TERMINAL),
                    None,
                )
                if settled is None:
                    self.dropped += 1
                    return
                tools.remove(settled)
            existing = {"tool_call_id": call_id}
            tools.append(existing)
        existing.update(
            tool_name=event.get("tool_name") or "tool",
            turn_id=event.get("turn_id") or None,
            status="running",
            observed_started_at=time.time(),
        )
        existing.pop("observed_finished_at", None)
        existing.pop("duration_ms", None)
        existing.pop("evidence", None)

    def track_tool_stop(self, session, event):
        """Settle only the exact call identified by Hermes' terminal hook."""
        call_id = event.get("tool_call_id")
        if not isinstance(call_id, str) or not call_id:
            return
        tools = session.setdefault("tools", [])
        existing = next((row for row in tools if row.get("tool_call_id") == call_id), None)
        if existing is None:
            if len(tools) >= 64:
                settled = next(
                    (row for row in tools if row.get("status") in TOOL_TERMINAL),
                    None,
                )
                if settled is None:
                    self.dropped += 1
                    return
                tools.remove(settled)
            existing = {
                "tool_call_id": call_id,
                "evidence": "completion observed without matching start",
            }
            tools.append(existing)
        raw = event.get("result") or {}
        status = str(event.get("status") or "").lower()
        if status in {"ok", "success"}:
            status = "completed"
        elif status not in {
            "completed",
            "failed",
            "error",
            "blocked",
            "timeout",
            "cancelled",
            "interrupted",
        }:
            # A result's `status` may describe dispatched background work, not
            # the terminal tool invocation. Only the hook's status is a call
            # outcome; older hooks fall back to explicit error vs completion.
            status = "failed" if raw.get("error") else "completed"
        existing.update(
            tool_name=event.get("tool_name") or existing.get("tool_name") or "tool",
            turn_id=event.get("turn_id") or existing.get("turn_id"),
            status=status,
            observed_finished_at=time.time(),
        )
        duration = event.get("duration_ms")
        if isinstance(duration, int) and duration >= 0:
            existing["duration_ms"] = duration

    @staticmethod
    def mark_unsettled_tools_unknown(session):
        """A finished turn cannot truthfully leave a tool marked as still running."""
        first_unknown = None
        for tool in session.get("tools", []):
            if tool.get("status") == "running":
                tool.update(
                    status="unknown",
                    evidence="turn ended without matching tool completion",
                    observed_finished_at=time.time(),
                )
                first_unknown = first_unknown or tool
        if first_unknown is not None and not session.get("tool_outcome"):
            session["tool_outcome"] = {
                "status": "unknown",
                "tool_name": first_unknown.get("tool_name") or "tool",
                "tool_call_id": first_unknown.get("tool_call_id"),
                "message": "A previous turn ended without exact tool completion evidence.",
                "observed_at": time.time(),
            }

    def track_subagent_start(self, session, event):
        child_session_id = event.get("child_session_id")
        subagent_id = event.get("child_subagent_id")
        if not isinstance(subagent_id, str) or not subagent_id:
            return
        existing = next(
            (
                row
                for row in session["subagents"]
                if row.get("subagent_id") == subagent_id
                and row.get("child_session_id") == child_session_id
            ),
            None,
        )
        if existing is None:
            if len(session["subagents"]) >= 64:
                settled = next(
                    (
                        row
                        for row in session["subagents"]
                        if row.get("status") in TERMINAL
                    ),
                    None,
                )
                if settled is None:
                    self.dropped += 1
                    return
                session["subagents"].remove(settled)
            existing = {"subagent_id": subagent_id}
            session["subagents"].append(existing)
        existing.update(
            child_session_id=child_session_id,
            role=event.get("child_role"),
            goal=event.get("child_goal"),
            parent_subagent_id=event.get("parent_subagent_id"),
            parent_turn_id=event.get("parent_turn_id"),
            status="running",
            observed_started_at=time.time(),
        )
        if session["status"] != "interrupted":
            # A late or racing child start must not erase an observed interruption.
            session["status"] = "running"

    def track_subagent_stop(self, session, event):
        child_session_id = event.get("child_session_id")
        if not isinstance(child_session_id, str) or not child_session_id:
            return
        existing = next(
            (
                row
                for row in session["subagents"]
                if row.get("child_session_id") == child_session_id
            ),
            None,
        )
        if existing is None:
            if len(session["subagents"]) >= 64:
                self.dropped += 1
                return
            existing = {
                "subagent_id": child_session_id,
                "child_session_id": child_session_id,
                "evidence": "stop observed without matching start",
            }
            session["subagents"].append(existing)
        existing.update(
            status=event.get("child_status") or "unknown",
            role=event.get("child_role") or existing.get("role"),
            observed_finished_at=time.time(),
        )
        duration = event.get("duration_ms")
        if isinstance(duration, int) and duration >= 0:
            existing["duration_ms"] = duration

    def track_process(self, session, pid, reason, identity=None):
        existing = next(
            (p for p in session["processes"] if p["session_id"] == pid), None
        )
        if existing is None:
            if len(session["processes"]) >= 64:
                self.dropped += 1
                return
            existing = {"session_id": pid, "status": "running", "reason": reason}
            session["processes"].append(existing)
        if reason in ("handed_off", "handed_off_processes"):
            existing["reason"] = "handed_off"
        if identity:
            existing.update(identity)

    def refresh_background(self):
        registry_module = sys.modules.get("tools.process_registry")
        registry = getattr(registry_module, "process_registry", None)
        delegation_module = sys.modules.get("tools.async_delegation")
        units = (
            {u["delegation_id"]: u for u in delegation_module.list_async_delegations()}
            if delegation_module
            else {}
        )
        for s in self.sessions.values():
            for p in s["processes"]:
                if p["status"] in TERMINAL:
                    continue
                process = registry.get(p["session_id"]) if registry else None
                if (
                    process is None
                    or getattr(process, "id", None) != p["session_id"]
                ):
                    p["status"] = "unknown"
                    p.pop("exit_code", None)
                    p.pop("evidence", None)
                    receipt = completed_receipt(s["profile"], p)
                    if receipt:
                        p.update(receipt)
                else:
                    identity = process_identity(process)
                    if (
                        p.get("parent_session_id")
                        and identity["parent_session_id"] != p["parent_session_id"]
                    ):
                        p["status"] = "unknown"
                        p.pop("exit_code", None)
                        p.pop("evidence", None)
                        continue
                    p.update(identity)
                    p["status"] = "exited" if process.exited else "running"
                    p["exit_code"] = process.exit_code
                    p["evidence"] = "process registry"
            for delegation in s["delegations"]:
                for unit in delegation["units"]:
                    if unit["status"] not in TERMINAL:
                        unit["status"] = units.get(unit["delegation_id"], {}).get(
                            "status", "unknown"
                        )
                delegation["settled"] = all(
                    u["status"] in TERMINAL for u in delegation["units"]
                )

    def tick(self):
        while True:
            try:
                hook, event = self.events.get_nowait()
            except queue.Empty:
                break
            self.apply(hook, event)
        self.refresh_background()
        write_snapshot(
            self.owner,
            {
                "schema_version": 1,
                "owner": self.owner,
                "kind": "lifecycle",
                "observed_at": time.time(),
                "dropped_events": self.dropped,
                "sessions": list(self.sessions.values()),
            },
        )

    def run(self):
        while True:
            try:
                self.tick()
            except Exception:
                log.debug("Display observer unavailable", exc_info=True)
            time.sleep(2)

    def start(self):
        threading.Thread(target=self.run, name="display-observer", daemon=True).start()
