"""display state priority rules.

Compatibility shim created to make the display-server application boundary explicit.
Move code here incrementally; keep hermes_display_server.py as HTTP routing only.
"""
from __future__ import annotations

import re

from display_state.collector import blocked_kanban_task

ACTIONABLE_WARNING_RE = re.compile(
    r"\b(CRITICAL|Traceback|Unhandled|uncaught|database locked|permission denied|disk full|no space left|connection refused|gateway stopped|disconnected unexpectedly)\b",
    re.I,
)
CRITICAL_WARNING_RE = re.compile(r"\b(CRITICAL|Traceback|Unhandled|uncaught|disk full|no space left)\b", re.I)


def actionable_warn_lines(lines: list[str]) -> list[str]:
    """Keep the kiosk calm for routine agent/provider warnings, surface real local issues."""
    actionable = []
    for line in lines:
        text = str(line)
        if ACTIONABLE_WARNING_RE.search(text):
            # Quota/model/provider/MCP keepalive warnings are useful in logs but are not
            # physical-display incidents. The display should not enter CRITICAL just
            # because Context7/Honcho had a transient reconnect or timeout.
            if re.search(r"RateLimitError|usage_limit_reached|Title generation failed|Fallback skip|BadRequestError|out of extra usage|Tool .* returned error|plugins\.memory\.honcho\.session|Honcho dialectic query failed|tools\.mcp_tool: MCP server 'context7'|mcp\.client\.streamable_http: Error in post_writer|context7.*(?:keepalive failed|connection lost|unhandled errors in a TaskGroup)|httpx\.ConnectTimeout|httpcore\.ConnectTimeout", text, re.I):
                continue
            actionable.append(text)
    return actionable[-4:]


def resolve_display_state(facts: dict, sys: dict, freshness: dict) -> dict:
    """Single display state resolver with explicit priority and safe diagnostics."""
    work = facts.get("work") or {}
    kanban = facts.get("kanban") or {"active": 0, "tasks": []}
    warn_lines = actionable_warn_lines(facts.get("warn_lines") or [])
    gateway_ok = bool(facts.get("gateway_ok"))
    now_hour = facts.get("now_hour")
    active_work = bool(work.get("active"))
    task_count = int(kanban.get("active") or 0)
    work_kind = str(work.get("kind") or work.get("visual_kind") or "")
    reason_codes: list[str] = []
    secondary_badges: list[str] = []
    if task_count:
        secondary_badges.append(f"{task_count} task{'s' if task_count != 1 else ''} available")

    if freshness["tier"] in {"aging", "stale", "lost"}:
        secondary_badges.append(f"telemetry {freshness['tier']}")
    if not gateway_ok:
        secondary_badges.append("gateway watch")

    if any(CRITICAL_WARNING_RE.search(str(line)) for line in warn_lines):
        reason_codes.append("critical_local_log")
        return {"display_state": "critical_local_issue", "priority": 10, "reason_codes": reason_codes, "secondary_badges": secondary_badges}

    blocked = blocked_kanban_task(kanban)
    work_blocked = str(work.get("state") or "").lower() in {"blocked", "waiting", "awaiting_input"} or str(work.get("kind") or "").lower() == "blocked"
    # Blocked Kanban cards in the local display board are queued context, not an
    # operator-facing incident by themselves. Only show BLOCKED when the current
    # active turn/work packet is itself blocked or waiting on Brian.
    if blocked and work_blocked:
        reason_codes.append("blocked_kanban_task")
        return {"display_state": "blocked_user_task", "priority": 20, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
    if blocked:
        secondary_badges.append("blocked card queued")

    total_measurements = len(sys.get("measurements") or {})
    valid_measurements = int(freshness.get("valid_measurements") or 0)
    telemetry_fully_lost = freshness["tier"] == "lost" and bool((facts.get("system") or {}).get("sensor_error")) and (total_measurements == 0 or valid_measurements == 0)

    # Priority 3: actionable attention. A fully-lost real telemetry feed,
    # gateway outage, or actionable non-critical warning can interrupt idle or
    # active visuals. Stale-but-present telemetry stays a secondary badge and is
    # only promoted after all work/recent/night states below.
    if telemetry_fully_lost:
        reason_codes.append("telemetry_lost")
        return {"display_state": "needs_attention", "priority": 30, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
    if not gateway_ok:
        reason_codes.append("gateway_watch")
        return {"display_state": "needs_attention", "priority": 30, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
    if warn_lines:
        reason_codes.append("recent_warning_log")
        return {"display_state": "needs_attention", "priority": 30, "reason_codes": reason_codes, "secondary_badges": secondary_badges}

    if active_work and work_kind in {"thinking", "reasoning", "request", "compression"}:
        reason_codes.append("planning_or_reasoning_active")
        return {"display_state": "planning_reasoning", "priority": 40, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
    if active_work:
        reason_codes.append("active_work")
        return {"display_state": "active_work", "priority": 50, "reason_codes": reason_codes, "secondary_badges": secondary_badges}

    age = work.get("age_seconds")
    try:
        recent = age is not None and float(age) <= 30 * 60 and work.get("state") == "recent_activity"
    except Exception:
        recent = False
    if recent:
        reason_codes.append("recent_activity")
        return {"display_state": "recently_completed", "priority": 60, "reason_codes": reason_codes, "secondary_badges": secondary_badges}

    if now_hour is not None:
        try:
            hour = int(now_hour)
            if hour >= 22 or hour < 6:
                reason_codes.append("night_hours")
                return {"display_state": "night_mode", "priority": 80, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
        except Exception:
            pass

    if freshness["tier"] in {"stale", "lost"}:
        reason_codes.append("feed_freshness_degraded")
        return {"display_state": "feed_stale_degraded", "priority": 90, "reason_codes": reason_codes, "secondary_badges": secondary_badges}

    reason_codes.append("quiet_watch")
    return {"display_state": "quiet_watch", "priority": 70, "reason_codes": reason_codes, "secondary_badges": secondary_badges}
