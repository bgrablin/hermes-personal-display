"""In-process observer. Never drains completion queues or invokes agent commands."""

from __future__ import annotations

import json
import logging
import queue
import sys
import threading
import time
import uuid

from display_state.integration import TERMINAL, clean, write_snapshot

log = logging.getLogger(__name__)


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
                )
                if key in kwargs
            }
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
                            "session_id",
                            "exit_code",
                            "notify_on_complete",
                            "promoted_from_foreground",
                            "delegation_id",
                            "units",
                            "count",
                        )
                        if k in raw
                    }
            try:
                self.events.put_nowait((hook, clean(event)))
            except queue.Full:
                self.dropped += 1

        return receive

    def apply(self, hook, event):
        sid = event.get("parent_session_id") or event.get("session_id")
        if not sid:
            return
        key = (event.get("profile", "unknown"), sid)
        if key not in self.sessions and len(self.sessions) >= 64:
            settled = next(
                (
                    k
                    for k, s in self.sessions.items()
                    if s["status"] in TERMINAL
                    and all(p["status"] in TERMINAL for p in s["processes"])
                    and all(d.get("settled") for d in s["delegations"])
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
                "processes": [],
                "delegations": [],
            },
        )
        s["last_event_at"] = time.time()
        if hook == "on_session_start":
            s["status"] = "running"
        elif hook == "on_session_end":
            s["status"] = (
                "interrupted"
                if event.get("interrupted")
                else "completed"
                if event.get("completed")
                else "failed"
            )
        elif hook in ("pre_tool_call", "pre_api_request"):
            s["status"] = "running"
            s["tool"] = event.get("tool_name")
        elif hook == "api_request_error":
            s["request_status"] = "error; turn outcome pending"
        if event.get("turn_id"):
            s["turn_id"] = event[
                "turn_id"
            ]  # Observed identity, never a durable receipt claim.
        raw = event.get("result") or {}
        background = (
            raw.get("status") == "yielded_to_background"
            or raw.get("notify_on_complete")
            or raw.get("promoted_from_foreground")
        )
        if (
            hook == "post_tool_call"
            and event.get("tool_name") == "terminal"
            and raw.get("session_id")
            and background
            and not any(p["session_id"] == raw["session_id"] for p in s["processes"])
        ):
            if len(s["processes"]) >= 64:
                self.dropped += 1
                return
            s["processes"].append(
                {
                    "session_id": raw["session_id"],
                    "status": "running",
                    "reason": "redirect"
                    if raw.get("status") == "yielded_to_background"
                    else "background",
                }
            )
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
                if process is None:
                    p["status"] = "unknown"
                else:
                    p["status"] = "exited" if process.exited else "running"
                    p["exit_code"] = process.exit_code
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
