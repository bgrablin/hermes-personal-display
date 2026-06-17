"""Log snapshot helpers: line parsing, Augury feed assembly, and current-work extraction."""
from __future__ import annotations

import os
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from display_state.privacy import AUGURY_REDACTION_POLICY, augury_clean, clean_log_msg

_LOG_DIR = Path.home() / ".hermes" / "logs"

SESSION_ID_RE = re.compile(r"\[([^\]]+)\]")
TOOL_RE = re.compile(r"tool ([a-zA-Z0-9_\-]+) completed")
ERR_RE = re.compile(r"\b(ERROR|WARNING)\b")
ACTIONABLE_WARNING_RE = re.compile(
    r"\b(CRITICAL|Traceback|Unhandled|uncaught|database locked|permission denied|disk full|no space left|connection refused|gateway stopped|disconnected unexpectedly)\b",
    re.I,
)
CRITICAL_WARNING_RE = re.compile(r"\b(CRITICAL|Traceback|Unhandled|uncaught|disk full|no space left)\b", re.I)
ACTIVE_LOG_RE = re.compile(r"(agent\.tool_executor|conversation_loop|codex_stream_request|API call #|tool [a-zA-Z0-9_\-]+ completed)")
LOG_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")
CONVERSATION_RE = re.compile(r"conversation turn: session=([^\s]+).*?platform=([^\s]+).*?msg=([\"'])(.*)\3")
API_CALL_RE = re.compile(r"API call #(\d+):")
TURN_ENDED_RE = re.compile(r"Turn ended:")

TOOL_LABELS = {
    "terminal": "shell",
    "execute_code": "python",
    "read_file": "files",
    "search_files": "search",
    "patch": "patch",
    "write_file": "write",
    "browser_snapshot": "browser",
    "browser_vision": "vision",
    "web_search": "web",
    "web_extract": "web",
    "skill_view": "skills",
    "process": "local process",
    "todo": "planning",
}

TOOL_CAPTIONS = {
    "terminal": "Working in the shell.",
    "execute_code": "Running a local Python probe.",
    "read_file": "Reading the local filesystem.",
    "search_files": "Searching project context.",
    "patch": "Patching code carefully.",
    "write_file": "Writing a file.",
    "browser_snapshot": "Inspecting a page.",
    "browser_vision": "Looking at the display.",
    "web_search": "Checking current sources.",
    "web_extract": "Reading source material.",
    "skill_view": "Loading procedural memory.",
    "process": "Checking a local process.",
    "todo": "Keeping the work organized.",
}

TOOL_ACTIVITY_SUMMARIES = {
    "terminal": "Working in the local shell.",
    "execute_code": "Running a local Python check.",
    "read_file": "Reading project context.",
    "search_files": "Searching project files.",
    "patch": "Updating project files.",
    "write_file": "Writing a local file.",
    "browser_snapshot": "Inspecting the display page.",
    "browser_vision": "Checking the display visually.",
    "web_search": "Checking current sources.",
    "web_extract": "Reading source material.",
    "skill_view": "Loading procedural memory.",
    "process": "Checking a local process.",
    "todo": "Organizing the work queue.",
}

CURRENT_WORK_SECONDS = 4 * 60
CURRENT_WORK_MAX_AGE_SECONDS = CURRENT_WORK_SECONDS

# Augury ambient log feed. This is an operator-only private overlay, so it
# intentionally allows useful operational context (including normal file paths)
# while narrowly redacting credential/token and raw log-payload-shaped snippets.
# All browser-facing display-safety constraints
# (current_work, captions, kanban) remain unchanged.
AUGURY_SCHEMA_VERSION = "0.1.0"
AUGURY_DEFAULT_LIMIT = 12
AUGURY_MAX_LIMIT = 25
AUGURY_DEFAULT_MINUTES = 30
AUGURY_MAX_MINUTES = 120
AUGURY_MAX_ITEM_CHARS = 320
AUGURY_TAIL_BYTES = 160_000
AUGURY_FEED_TTL_SECONDS = 4
AUGURY_TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:[,.]\d+)?")
AUGURY_CONVERSATION_KIND_RE = re.compile(r"conversation turn: session=", re.I)

TOOL_WORK_KINDS = {
    "terminal": "shell",
    "execute_code": "python",
    "read_file": "reading",
    "search_files": "searching",
    "patch": "patching",
    "write_file": "writing",
    "browser_snapshot": "inspecting",
    "browser_vision": "looking",
    "web_search": "researching",
    "web_extract": "reading_web",
    "skill_view": "recalling",
    "process": "shell",
    "todo": "planning",
}


def format_age(age_seconds: float | int | None) -> str:
    if age_seconds is None:
        return ""
    try:
        seconds = max(0, int(round(float(age_seconds))))
    except Exception:
        return ""
    if seconds < 90:
        return f"{seconds}s"
    minutes = round(seconds / 60)
    if minutes < 90:
        return f"{minutes}m"
    return f"{round(minutes / 60)}h"


def tail_text(path: Path, max_bytes: int = 80_000) -> str:
    try:
        with path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - max_bytes))
            return fh.read().decode("utf-8", "replace")
    except FileNotFoundError:
        return ""
    except Exception as exc:
        return f"read_error:{exc}"


def newest_matching_lines(path: Path, pattern: re.Pattern[str], limit: int = 8) -> list[str]:
    lines = tail_text(path).splitlines()
    found = [line for line in lines if pattern.search(line)]
    return found[-limit:]


def line_is_recent(line: str, minutes: float = 4) -> bool:
    age = line_age_seconds(line)
    return age is not None and age <= minutes * 60


def recent_matching_lines(path: Path, pattern: re.Pattern[str], minutes: float = 4, limit: int = 8) -> list[str]:
    return [line for line in newest_matching_lines(path, pattern, limit * 4) if line_is_recent(line, minutes)][-limit:]


def line_age_seconds(line: str) -> float | None:
    m = LOG_TS_RE.match(line)
    if not m:
        return None
    try:
        dt = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").astimezone()
        return max(0.0, (datetime.now().astimezone() - dt).total_seconds())
    except Exception:
        return None


def current_user_request(lines: list[str], fallback_index: int | None = None, session_id: str | None = None) -> dict | None:
    """Return the newest display-safe real user request, skipping maintenance turns."""
    if fallback_index is None:
        fallback_index = len(lines) - 1
    maintenance_re = re.compile(r"^(Review the conversation above|\[IMPORTANT:|\[System note:)", re.I)
    for prior in reversed(lines[:fallback_index + 1]):
        m = CONVERSATION_RE.search(prior)
        if not m:
            continue
        if session_id and m.group(1) != session_id:
            continue
        message = clean_log_msg(m.group(4), 92)
        if maintenance_re.search(message):
            continue
        return {
            "session_id": m.group(1),
            "platform": m.group(2),
            "message": message,
            "age_seconds": line_age_seconds(prior),
        }
    return None


def session_label(session_id: str | None, platform: str | None = None) -> str:
    if not session_id:
        return "Hermes session"
    if session_id.startswith("cron_"):
        return "scheduled job"
    if platform:
        return f"{platform} session"
    return "Hermes session"


def augury_session_id(line: str) -> str | None:
    match = SESSION_ID_RE.search(line)
    if not match:
        return None
    candidate = match.group(1).strip()
    # The bracketed token in agent.log is typically the session id like
    # "20260523_162540_61cd7e"; reject obvious non-id values like log levels
    # so the augury feed never surfaces "INFO"/"WARNING" as a session label.
    if not candidate or candidate.upper() in {"INFO", "WARN", "WARNING", "ERROR", "DEBUG", "CRITICAL"}:
        return None
    return candidate[:64]


def augury_log_tail(line: str) -> str:
    """Return the display-useful message tail from a timestamped agent/gateway log line."""
    text = re.sub(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d{3})?\s+", "", str(line or ""))
    text = re.sub(r"^(?:DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\s+", "", text, flags=re.I)
    text = re.sub(r"^\[[^\]]{1,80}\]\s+", "", text)
    text = re.sub(r"^(?:[a-zA-Z0-9_.-]{2,80})(?::|\s+[-–—:]?)\s+", "", text)
    return text.strip() or str(line or "")


def augury_item_from_line(line: str) -> dict | None:
    """Convert one agent.log line into a display-safe augury item."""
    if not line:
        return None
    age = line_age_seconds(line)
    if age is None:
        return None

    ts_match = AUGURY_TS_RE.match(line)
    timestamp = ts_match.group(1) if ts_match else None
    session_id = augury_session_id(line)

    convo_match = CONVERSATION_RE.search(line)
    tool_match = TOOL_RE.search(line)
    api_match = API_CALL_RE.search(line)
    is_conversation_line = bool(AUGURY_CONVERSATION_KIND_RE.search(line))

    kind: str
    title: str
    text: str
    if convo_match:
        kind = "prompt"
        platform = (convo_match.group(2) or "").strip()[:24] or "session"
        title = f"{platform} prompt"
        text = convo_match.group(4) or ""
    elif tool_match:
        kind = "tool"
        tool = tool_match.group(1)[:32]
        title = f"tool {tool}"
        text = augury_log_tail(line)
    elif api_match:
        kind = "thinking"
        title = f"API #{api_match.group(1)[:12]}"
        text = augury_log_tail(line)
    elif "Preflight compression" in line:
        kind = "thinking"
        title = "compression"
        text = augury_log_tail(line)
    elif is_conversation_line:
        kind = "prompt"
        title = "session prompt"
        text = augury_log_tail(line)
    elif ERR_RE.search(line) or ACTIVE_LOG_RE.search(line):
        kind = "log"
        title = "log"
        text = augury_log_tail(line)
    else:
        return None

    safe_text = augury_clean(text, AUGURY_MAX_ITEM_CHARS)
    if not safe_text:
        return None
    safe_title = augury_clean(title, 64) or kind

    return {
        "kind": kind,
        "source": "agent.log",
        "timestamp": timestamp,
        "age_seconds": int(round(age)),
        "session_id": session_id,
        "title": safe_title,
        "text": safe_text,
    }


def build_augury_items(text: str, limit: int, minutes: int) -> list[dict]:
    """Walk a tailed log text and extract bounded augury items, newest first."""
    cutoff_seconds = minutes * 60
    items: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for line in reversed(text.splitlines()):
        if len(items) >= limit:
            break
        if not line:
            continue
        if line_age_seconds(line) is None:
            continue
        item = augury_item_from_line(line)
        if not item:
            continue
        if item.get("age_seconds") is not None and item["age_seconds"] > cutoff_seconds:
            continue
        dedup = (item["kind"], item["text"])
        if dedup in seen:
            continue
        seen.add(dedup)
        items.append(item)
    items.reverse()
    return items


def augury_current_work_card(work: dict | None) -> dict:
    """Display-safe current_work card for the augury feed header."""
    base = work or {}
    return {
        "active": bool(base.get("active")),
        "kind": augury_clean(base.get("visual_kind") or base.get("kind") or "", 48),
        "summary": augury_clean(base.get("summary") or "", 160),
        "detail": augury_clean(base.get("detail") or "", 160),
        "session_id": augury_clean(base.get("session_id") or "", 64) or None,
        "session_label": augury_clean(base.get("session_label") or "", 48) or None,
        "age_seconds": base.get("age_seconds"),
    }


def recent_agent_work(path: Path, minutes: float = CURRENT_WORK_SECONDS / 60) -> dict:
    """Return display-safe current-work detail from recent Hermes agent logs."""
    lines = tail_text(path, 120_000).splitlines()
    if not lines:
        return {
            "active": False,
            "state": "quiet_watch",
            "summary": "Quiet watch. No recent agent activity.",
            "detail": "Local display is monitoring without an active turn.",
            "age_seconds": None,
        }

    def conversation_before(index: int, session_id: str | None = None) -> dict | None:
        for prior in reversed(lines[:index + 1]):
            m = CONVERSATION_RE.search(prior)
            if not m:
                continue
            if session_id and m.group(1) != session_id:
                continue
            return {
                "session_id": m.group(1),
                "platform": m.group(2),
                "message": clean_log_msg(m.group(4), 92),
                "age_seconds": line_age_seconds(prior),
            }
        return None

    newest_conversation = current_user_request(lines)
    active_cutoff = minutes * 60
    for idx in range(len(lines) - 1, -1, -1):
        line = lines[idx]
        age = line_age_seconds(line)
        if age is None or age > active_cutoff:
            continue
        session_match = SESSION_ID_RE.search(line)
        session_id = session_match.group(1) if session_match else None
        convo = current_user_request(lines, idx, session_id) or newest_conversation or {}
        if not session_id:
            session_id = convo.get("session_id")
        platform = convo.get("platform")
        prompt = convo.get("message") or "recent request"

        if TURN_ENDED_RE.search(line):
            return {
                "active": False,
                "state": "recent_activity",
                "kind": "completed",
                "summary": "Last activity completed just now.",
                "detail": "Recent work is complete; local systems remain under watch.",
                "tool": None,
                "source": session_label(session_id, platform),
                "visual_kind": "completed",
                "session_id": session_id,
                "session_label": session_label(session_id, platform),
                "age_seconds": round(age),
            }

        tool_match = TOOL_RE.search(line)
        if tool_match:
            tool = tool_match.group(1)
            label = TOOL_LABELS.get(tool, tool.replace("_", " "))
            return {
                "active": True,
                "state": "current_work",
                "kind": "tool",
                "summary": TOOL_ACTIVITY_SUMMARIES.get(tool, "Working on the current request."),
                "detail": TOOL_CAPTIONS.get(tool, f"Using {label}."),
                "tool": tool,
                "source": session_label(session_id, platform),
                "visual_kind": TOOL_WORK_KINDS.get(tool, "working"),
                "session_id": session_id,
                "session_label": session_label(session_id, platform),
                "age_seconds": round(age),
            }

        api_match = API_CALL_RE.search(line)
        if api_match:
            return {
                "active": True,
                "state": "current_work",
                "kind": "thinking",
                "summary": "Thinking through the current request.",
                "detail": "Reasoning before taking the next action.",
                "tool": None,
                "source": session_label(session_id, platform),
                "visual_kind": "reasoning",
                "session_id": session_id,
                "session_label": session_label(session_id, platform),
                "age_seconds": round(age),
            }

        if "Preflight compression" in line:
            return {
                "active": True,
                "state": "current_work",
                "kind": "compression",
                "summary": "Compacting long session context.",
                "detail": "Compacting long session context.",
                "tool": None,
                "source": session_label(session_id, platform),
                "visual_kind": "compressing",
                "session_id": session_id,
                "session_label": session_label(session_id, platform),
                "age_seconds": round(age),
            }

        if CONVERSATION_RE.search(line):
            return {
                "active": True,
                "state": "current_work",
                "kind": "request",
                "summary": "Reading the latest request.",
                "detail": "Reading the latest request.",
                "tool": None,
                "source": session_label(session_id, platform),
                "visual_kind": "reading",
                "session_id": session_id,
                "session_label": session_label(session_id, platform),
                "age_seconds": round(age),
            }

    last_age = (newest_conversation or {}).get("age_seconds")
    age_label = format_age(last_age) if last_age is not None else None
    return {
        "active": False,
        "state": "recent_activity" if age_label else "quiet_watch",
        "summary": f"Last activity completed {age_label} ago." if age_label else "Quiet watch. No active turn is running.",
        "detail": "Recent work is complete; local systems remain under watch." if age_label else "Local display is monitoring without an active turn.",
        "source": session_label((newest_conversation or {}).get("session_id"), (newest_conversation or {}).get("platform")),
        "session_id": (newest_conversation or {}).get("session_id"),
        "session_label": session_label((newest_conversation or {}).get("session_id"), (newest_conversation or {}).get("platform")),
        "age_seconds": last_age,
    }


def build_augury_feed(
    limit: int = AUGURY_DEFAULT_LIMIT,
    minutes: int = AUGURY_DEFAULT_MINUTES,
    log_path: Path | None = None,
) -> dict:
    """Assemble the bounded, redacted augury ambient feed."""
    try:
        bounded_limit = max(1, min(AUGURY_MAX_LIMIT, int(limit)))
    except (TypeError, ValueError):
        bounded_limit = AUGURY_DEFAULT_LIMIT
    try:
        bounded_minutes = max(1, min(AUGURY_MAX_MINUTES, int(minutes)))
    except (TypeError, ValueError):
        bounded_minutes = AUGURY_DEFAULT_MINUTES

    agent_log = log_path if log_path is not None else (_LOG_DIR / "agent.log")
    text = tail_text(agent_log, AUGURY_TAIL_BYTES)
    items = build_augury_items(text, bounded_limit, bounded_minutes)
    try:
        work = recent_agent_work(agent_log) if log_path is None else {}
    except Exception:
        work = {}

    return {
        "schema_version": AUGURY_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "valid_for_seconds": AUGURY_FEED_TTL_SECONDS,
        "boundary": "home_private_lan",
        "sensitivity": "home_private_redacted",
        "policy": {
            "purpose": "ambient_log_visualization",
            "redaction": AUGURY_REDACTION_POLICY,
            "limit": bounded_limit,
            "minutes": bounded_minutes,
            "max_item_chars": AUGURY_MAX_ITEM_CHARS,
            "tail_bytes": AUGURY_TAIL_BYTES,
        },
        "current_work": augury_current_work_card(work),
        "items": items,
    }


def active_session_summary(path: Path, minutes: float = 1.5) -> dict:
    """Count distinct active Hermes turns, not resident processes.

    This is what the display's ACTIVE/WORK counters should show. A CLI turn and
    a Telegram turn count as two active sessions when both have recent tool/API
    activity, even though the visible current_work card only shows the newest
    event.
    """
    lines = tail_text(path, 140_000).splitlines()
    active_cutoff = minutes * 60
    sessions: dict[str, dict] = {}
    platforms: dict[str, str] = {}

    for line in lines:
        cm = CONVERSATION_RE.search(line)
        if cm:
            message = clean_log_msg(cm.group(4), 92)
            if not re.match(r"^(Review the conversation above|\[IMPORTANT:|\[System note:)", message, re.I):
                platforms[cm.group(1)] = cm.group(2)

        age = line_age_seconds(line)
        if age is None or age > active_cutoff:
            continue

        if not (ACTIVE_LOG_RE.search(line) or "Preflight compression" in line):
            continue
        cm = CONVERSATION_RE.search(line)
        session_match = SESSION_ID_RE.search(line)
        session_id = cm.group(1) if cm else session_match.group(1) if session_match else None
        if not session_id:
            continue

        if TURN_ENDED_RE.search(line):
            sessions.pop(session_id, None)
            continue

        if cm:
            message = clean_log_msg(cm.group(4), 92)
            if re.match(r"^(Review the conversation above|\[IMPORTANT:|\[System note:)", message, re.I):
                continue

        platform = platforms.get(session_id) or (cm.group(2) if cm else None)
        rec = sessions.setdefault(session_id, {
            "session_id": session_id,
            "session_label": session_label(session_id, platform),
            "platform": platform,
            "age_seconds": round(age),
        })
        rec["age_seconds"] = min(rec["age_seconds"], round(age))
        if platform:
            rec["platform"] = platform
            rec["session_label"] = session_label(session_id, platform)

    items = sorted(sessions.values(), key=lambda item: item.get("age_seconds", 9999))
    return {"count": len(items), "sessions": items[:5]}


def active_agent_count() -> int:
    try:
        out = subprocess.check_output(
            ["pgrep", "-af", r"hermes.*(chat|kanban|--resume|gateway)"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=1.0,
        )
        lines = []
        for line in out.splitlines():
            if "hermes_display_server" in line:
                continue
            # Resident services should not make the physical display look busy.
            if "gateway run" in line or "hermes dashboard" in line:
                continue
            lines.append(line)
        return len(lines)
    except Exception:
        return 0


def recent_agent_activity(path: Path, minutes: float = 3.0) -> bool:
    """True when the active Hermes session is doing visible work recently.

    This avoids showing STANDING BY during multi-step tool/thinking work, while
    still ignoring old resident service noise after the session goes quiet.
    """
    try:
        if time.time() - path.stat().st_mtime > minutes * 60:
            return False
    except Exception:
        return False
    return bool(recent_matching_lines(path, ACTIVE_LOG_RE, minutes=minutes, limit=10))


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
