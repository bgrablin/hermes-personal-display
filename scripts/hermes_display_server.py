#!/usr/bin/env python3
"""Static server plus live Hermes display-state API.

Local-only helper for the MINIX personal display. It serves the project files and
exposes /api/hermes-state as display-safe JSON derived from local Hermes state.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from avatar_event_bus import (
    AvatarEventBus,
    SECRET_PATTERNS,
    ValidationError,
    is_loopback_request,
    load_event_json,
    sse_frame,
)

from display_state.persistence import atomic_json_write, append_bounded_jsonl
from display_state.collector import (
    kanban_snapshot,
    metric_snippet,
    normalize_system_freshness,
    system_snapshot,
)
from display_state.privacy import (
    augury_clean,
    clean_log_msg,
    scrub,
    sanitize_current_work as _sanitize_current_work,
)
from display_state.resolver import actionable_warn_lines, resolve_display_state
from display_state.log_snapshot import (
    SESSION_ID_RE,
    TOOL_RE,
    ERR_RE,
    ACTIONABLE_WARNING_RE,
    CRITICAL_WARNING_RE,
    ACTIVE_LOG_RE,
    LOG_TS_RE,
    CONVERSATION_RE,
    API_CALL_RE,
    TURN_ENDED_RE,
    TOOL_LABELS,
    TOOL_CAPTIONS,
    TOOL_ACTIVITY_SUMMARIES,
    TOOL_WORK_KINDS,
    CURRENT_WORK_SECONDS,
    CURRENT_WORK_MAX_AGE_SECONDS,
    AUGURY_SCHEMA_VERSION,
    AUGURY_DEFAULT_LIMIT,
    AUGURY_MAX_LIMIT,
    AUGURY_DEFAULT_MINUTES,
    AUGURY_MAX_MINUTES,
    AUGURY_MAX_ITEM_CHARS,
    AUGURY_TAIL_BYTES,
    AUGURY_FEED_TTL_SECONDS,
    AUGURY_TS_RE,
    AUGURY_CONVERSATION_KIND_RE,
    format_age,
    tail_text,
    newest_matching_lines,
    line_is_recent,
    recent_matching_lines,
    line_age_seconds,
    current_user_request,
    session_label,
    augury_session_id,
    augury_log_tail,
    augury_item_from_line,
    build_augury_items,
    augury_current_work_card,
    build_augury_feed,
    recent_agent_work,
    active_session_summary,
    active_agent_count,
    recent_agent_activity,
)

ROOT = Path(__file__).resolve().parents[1]
HERMES_HOME = Path.home() / ".hermes"
LOG_DIR = HERMES_HOME / "logs"
DISPLAY_DIR = Path(os.environ.get("HERMES_DISPLAY_DIR", HERMES_HOME / "display"))
DISPLAY_STATE_PATH = DISPLAY_DIR / "display_state.json"
PERSONA_PACKET_PATH = DISPLAY_DIR / "persona_packet.json"
PUPPET_STATE_PATH = DISPLAY_DIR / "puppet_state_packet.json"
OPTIC_STATE_PATH = DISPLAY_DIR / "optic_state_packet.json"
PERSONA_HISTORY_PATH = DISPLAY_DIR / "persona_history.jsonl"
MANUAL_OVERRIDE_PATH = DISPLAY_DIR / "manual_override.json"
PROVIDER_ROUTE_RAIL_PATH = DISPLAY_DIR / "provider_route_rail.json"
WATCH_ANIMATION_LOG_PATH = DISPLAY_DIR / "watch_animation_triggers.jsonl"
ENTERTAINMENT_TTS_CACHE_DIR = DISPLAY_DIR / "tts_cache"
ENTERTAINMENT_LINE_CACHE_PATH = DISPLAY_DIR / "entertainment_line_cache.json"
ENTERTAINMENT_DAILY_CACHE_PATH = DISPLAY_DIR / "entertainment_daily_cache.json"
ENTERTAINMENT_USAGE_PATH = DISPLAY_DIR / "entertainment_usage.json"
ENTERTAINMENT_SCHEMA_VERSION = "2026-05-30.1"
ENTERTAINMENT_TTS_MODEL = os.environ.get("HERMES_DISPLAY_TTS_MODEL", "gpt-4o-mini-tts")
ENTERTAINMENT_LINE_MODEL = os.environ.get("HERMES_DISPLAY_LINE_MODEL", "gpt-4.1-mini")
MAX_TTS_TEXT_CHARS = 96
MAX_TTS_REQUEST_BYTES = 1024
MAX_LINE_REQUEST_BYTES = 1024
MAX_AI_LINE_CHARS = 64
MAX_SERVER_TTS_CACHE_MISSES_PER_DAY = 100
MAX_SERVER_TTS_CACHE_MISSES_PER_HOUR = 30
MAX_SERVER_LINE_GENERATIONS_PER_DAY = 50
MAX_SERVER_MICRO_SHOWS_PER_DAY = 12
ENTERTAINMENT_VOICES = {"marin", "cedar", "coral"}
ENTERTAINMENT_ALLOWED_TRIGGERS = {"boop", "tap", "long_press", "constellation", "rhythm", "micro_show", "idle", "complete", "blocked"}
ENTERTAINMENT_ALLOWED_MODES = {"idle_watch", "reasoning", "searching", "tool_shell", "waiting_user", "complete", "blocked", "degraded_offline", "family"}
ENTERTAINMENT_ALLOWED_EMOTIONS = {"curious", "delighted", "sleepy", "silly", "proud", "gentle"}
ENTERTAINMENT_ALLOWED_SFX = {"sparkle", "chime", "boop", "whoosh", "pop", "none"}
DEFAULT_BIND_HOST = "127.0.0.1"
REQUEST_SOCKET_TIMEOUT_SECONDS = 15
HERMES_STATE_CACHE_TTL_SECONDS = 1.0
PERSONA_HISTORY_MAX_LINES = 1000
ENTERTAINMENT_ALLOWED_PARTICLES = {"fireflies", "stars", "comets", "bubbles", "confetti", "rings"}
MICRO_SHOW_ALLOWED_EVENTS = {"PARTICLE", "RIPPLE", "GAZE", "SFX", "COMET", "ORBIT", "CAPTION", "BLINK", "GLOW"}
MICRO_SHOW_ALLOWED_SFX = {"sfx-chime-1", "sfx-chime-soft", "sfx-whoosh", "sfx-hop1", "sfx-hop2", "sfx-hop3", "sfx-inhale-soft", "sfx-step", "sfx-giggle-mini", "sfx-applause-short"}
MICRO_SHOW_ALLOWED_PARTICLES = {"sparkle", "star", "confetti", "feather"}
HONCHO_HEALTH_PATH = HERMES_HOME / "state" / "honcho-health-watch.json"
KANBAN_BOARD = os.environ.get("HERMES_DISPLAY_KANBAN_BOARD", "hermes-personal-display")
KANBAN_DB = HERMES_HOME / "kanban" / "boards" / KANBAN_BOARD / "kanban.db"
LEGACY_KANBAN_DB = HERMES_HOME / "kanban.db"
AVATAR_EVENT_BUS = AvatarEventBus()
_STATE_CACHE_LOCK = threading.Lock()
_STATE_CACHE: dict[str, object] = {"at": 0.0, "state": None}
_ENTERTAINMENT_USAGE_LOCK = threading.Lock()
_PROVIDER_ROUTE_REFRESH_LOCK = threading.Lock()
_PROVIDER_ROUTE_REFRESH_AT = 0.0

# Public display contract constants are generated from schemas/*.json.
from display_state.contract import (
    DISPLAY_CONTRACT_SCHEMAS,
    DISPLAY_PRESETS,
    DISPLAY_PRESET_LABELS,
    DISPLAY_PRESET_MOTION,
    OPTIC_MODE_BY_PRESET,
    OPTIC_STATE_BY_MODE,
)

class FixtureLookupError(Exception):
    """Expected fixture lookup failure for local preview/debug API input."""


def sanitize_current_work(work: dict) -> dict:
    return _sanitize_current_work(work, max_age_seconds=CURRENT_WORK_MAX_AGE_SECONDS)


def sanitize_kanban_snapshot(kanban: dict) -> dict:
    raw = kanban or {}
    tasks = []
    for task in list(raw.get("tasks") or [])[:3]:
        if not isinstance(task, dict):
            continue
        tasks.append({
            "title": clean_log_msg(task.get("title") or "task", 54) or "task",
            "status": clean_log_msg(task.get("status") or "unknown", 24),
            "assignee": clean_log_msg(task.get("assignee") or "", 32),
            "step": clean_log_msg(task.get("step") or task.get("current_step_key") or "", 32),
        })
    try:
        active = max(0, int(raw.get("active") or len(tasks) or 0))
    except Exception:
        active = len(tasks)
    return {
        "active": min(len(tasks), active),
        "summary": clean_log_msg(raw.get("summary") or f"{len(tasks)} active task(s)", 54),
        "tasks": tasks,
    }


def state_copy(display_state: str, work: dict, sys: dict, freshness: dict, gateway_ok: bool, warn_lines: list[str]) -> tuple[str, str, str, str]:
    if display_state == "critical_local_issue":
        return "blocked_annoyed", "retro-amber-watch", "Critical local issue needs attention.", clean_log_msg(warn_lines[-1], 72) if warn_lines else "local issue detected"
    if display_state == "blocked_user_task":
        return "blocked_annoyed", "retro-amber-watch", "Blocked user task needs Brian.", "Kanban card is blocked."
    if display_state == "needs_attention":
        if freshness["tier"] == "lost" and sys.get("sensor_error"):
            return "blocked_annoyed", "retro-amber-watch", "Telemetry unavailable. Check local sensors.", "Sensor feed unavailable; last local state held."
        if not gateway_ok:
            return "blocked_annoyed", "retro-amber-watch", "Gateway needs attention.", "local gateway watch"
        detail = clean_log_msg(warn_lines[-1], 72) if warn_lines else "local warning needs attention"
        return "blocked_annoyed", "retro-amber-watch", "Local warning needs attention.", detail
    if display_state == "planning_reasoning":
        return "thinking_focused", "retro-terminal-focus", "Thinking through the current request.", clean_log_msg(work.get("summary") or "Reasoning before action.", 72)
    if display_state == "active_work":
        return "thinking_focused", "retro-terminal-focus", "Work active.", clean_log_msg(work.get("summary") or work.get("detail") or "Current work in progress.", 72)
    if display_state == "recently_completed":
        return "healthy_smug", "retro-robot-core", clean_log_msg(work.get("summary") or "Recent work completed.", 72), "recent activity complete"
    if display_state == "night_mode":
        return "night_sleepy", "retro-night-watch", "Night watch. Quiet systems only.", metric_snippet(sys, gateway_ok, freshness)
    if display_state == "feed_stale_degraded":
        return "idle_watchful", "retro-robot-core", "Telemetry feed stale. Keeping last good view.", metric_snippet(sys, gateway_ok, freshness)
    if sys.get("cpu") is not None and sys.get("cpu") >= 0.75:
        return "healthy_smug", "retro-robot-core", "The NUC is busy, not bored.", metric_snippet(sys, gateway_ok, freshness)
    return "healthy_smug", "retro-robot-core", "Systems steady. Naturally.", metric_snippet(sys, gateway_ok, freshness)


def display_preset_for(display_state: str, work: dict, freshness: dict) -> str:
    visual_kind = str(work.get("visual_kind") or work.get("kind") or "").lower()
    work_state = str(work.get("state") or "").lower()
    if display_state == "critical_local_issue":
        return "critical"
    if display_state == "blocked_user_task":
        return "blocked"
    if display_state == "needs_attention":
        return "waiting_input"
    if display_state == "planning_reasoning":
        return "planning" if visual_kind in {"planning", "recalling"} else "reasoning"
    if display_state == "active_work":
        return "planning" if visual_kind in {"planning", "recalling"} else "working"
    if display_state == "recently_completed":
        return "completed"
    if display_state == "night_mode":
        return "night_watch"
    if display_state == "feed_stale_degraded" or freshness.get("tier") in {"stale", "lost"}:
        return "feed_stale"
    if work_state in {"waiting", "awaiting_input"}:
        return "waiting_input"
    return "quiet_watch"


# DISPLAY_PRESET_LABELS and DISPLAY_PRESET_MOTION are imported from the generated display contract above.

def load_manual_override(now: datetime | None = None) -> dict:
    """Read a small local-only override file without allowing arbitrary display text."""
    if now is None:
        now = datetime.now(timezone.utc)
    try:
        raw = json.loads(MANUAL_OVERRIDE_PATH.read_text(encoding="utf-8"))
        if not isinstance(raw, dict) or raw.get("enabled") is False:
            return {}
        expires_at = raw.get("expires_at") or raw.get("until")
        if expires_at:
            expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry < now:
                return {}
        allowed_modes = {"night", "quiet", "attention", "blocked", "complete", "work", "reasoning"}
        mode = str(raw.get("mode") or "").lower()
        caption = clean_log_msg(raw.get("caption") or raw.get("status_line") or "", 72)
        if mode not in allowed_modes and not caption:
            return {}
        sensitivity = str(raw.get("display_sensitivity") or raw.get("sensitivity") or "public_status")
        if sensitivity not in {"public_status", "home_private"}:
            caption = ""
        return {"mode": mode if mode in allowed_modes else None, "caption": caption, "source": "manual_override", "active": True}
    except FileNotFoundError:
        return {}
    except Exception as exc:
        print(f"manual override parse issue: {exc.__class__.__name__}", flush=True)
        return {}


def display_state_file_packet(facts: dict, sys: dict, freshness: dict, resolver: dict, state: dict) -> dict:
    work = facts.get("work") or {}
    kanban = facts.get("kanban") or {}
    return {
        "schema_version": "0.4.0",
        "timestamp": state["generated_at"],
        "overall_status": resolver.get("display_state", "quiet_watch"),
        "mode": (facts.get("manual_override") or {}).get("mode"),
        "mood": state.get("mood"),
        "expression": state.get("state_preset"),
        "animation_intensity": state.get("energy"),
        "status_line": state.get("caption", {}).get("text"),
        "status_line_sensitivity": "public_status",
        "quip": state.get("snippet", {}).get("text"),
        "quip_sensitivity": "public_status",
        "services": {"gateway": "ok" if facts.get("gateway_ok") else "watch"},
        "activity": {
            "active_tools": 1 if work.get("active") else 0,
            "kanban_ready": int(kanban.get("active") or 0),
            "kanban_blocked": sum(1 for task in kanban.get("tasks") or [] if str(task.get("status", "")).lower() == "blocked"),
            "display_safe_title": work.get("summary") or state.get("caption", {}).get("text"),
        },
        "system": sys,
        "freshness": freshness,
        "display_policy": {"boundary": "local_trusted_display", "redaction_required": True, "forbid_credentials": True},
        "resolver": resolver,
    }


def optic_state_packet_for(state: dict, work: dict) -> dict:
    preset = state.get("state_preset") or "quiet_watch"
    mode = OPTIC_MODE_BY_PRESET.get(preset, "idle_watch")
    visual_kind = str((work or {}).get("visual_kind") or (work or {}).get("kind") or "")
    if preset == "working":
        mode = "searching" if visual_kind in {"searching", "researching", "looking", "inspecting"} else "writing" if visual_kind in {"writing", "patching"} else "reading" if visual_kind in {"reading", "reading_web"} else "tool_shell"
    if visual_kind in {"listening", "notice", "searching"}:
        mode = visual_kind
    base = json.loads(json.dumps(OPTIC_STATE_BY_MODE.get(mode, OPTIC_STATE_BY_MODE["idle_watch"])))
    optic = {"schema_version": "0.4.0", "generated_at": state["generated_at"], "mode": mode, **base}
    optic["optic"] = {
        "aperture_open": optic.get("eyes", {}).get("lid_open", 1.0),
        "pupil_scale": optic.get("eyes", {}).get("pupil_scale", 1.0),
        "iris_glow": optic.get("glow", {}).get("face", 0.42),
        "blink_profile": "focused_slow" if mode in {"reasoning", "tool_shell"} else "soft_patient" if mode == "waiting_user" else "calm",
    }
    optic["rings"] = {"motion_budget": min(1.0, max(0.0, optic.get("ring", {}).get("opacity", 0.34))), "pulse_style": "precise" if mode == "tool_shell" else "ambient"}
    optic["identity"] = {"winglet_tension": optic.get("helmet", {}).get("wing_tension", 0.0), "helmet_brow_tilt": optic.get("helmet", {}).get("rim_tilt_deg", 0.0)}
    return optic


def persist_display_bus(state: dict, display_state: dict, optic_state: dict) -> None:
    atomic_json_write(DISPLAY_STATE_PATH, display_state)
    atomic_json_write(PERSONA_PACKET_PATH, {k: v for k, v in state.items() if k not in {"optic_state_packet", "puppet_state_packet"}})
    atomic_json_write(OPTIC_STATE_PATH, optic_state)
    atomic_json_write(PUPPET_STATE_PATH, optic_state)
    try:
        append_bounded_jsonl(PERSONA_HISTORY_PATH, {"at": state["generated_at"], "mood": state.get("mood"), "skin": state.get("skin"), "state_preset": state.get("state_preset"), "optic_mode": optic_state.get("mode")}, max_lines=PERSONA_HISTORY_MAX_LINES)
    except Exception as exc:
        print(f"Display persona history write failed: {scrub(exc.__class__.__name__)}", flush=True)



def load_provider_route_rail() -> dict:
    """Load redacted provider route/headroom artifact for the Concept B route rail.

    The display server only accepts a small allowlisted shape. It does not
    authenticate to providers or pass through raw provider/account identifiers.
    Missing or stale data degrades to an honest unknown/stale display instead of
    synthesizing plausible-looking quota values.
    """
    fallback = {
        "as_of_ms": None,
        "active_provider_id": "",
        "providers": [
            {"id": "openai-codex", "label": "CHATGPT", "tier_label": None, "rank": 1, "state": "unknown", "headroom": None, "secondary_headroom": None, "reachable": True, "last_used_age_s": None, "stale_age_s": None},
            {"id": "anthropic", "label": "CLAUDE", "tier_label": None, "rank": 2, "state": "unknown", "headroom": None, "secondary_headroom": None, "reachable": True, "last_used_age_s": None, "stale_age_s": None},
            {"id": "nous", "label": "GEMINI", "tier_label": None, "rank": 3, "state": "unknown", "headroom": None, "secondary_headroom": None, "reachable": True, "last_used_age_s": None, "stale_age_s": None},
            {"id": "copilot", "label": "COPILOT", "tier_label": None, "rank": 4, "state": "unknown", "headroom": None, "secondary_headroom": None, "reachable": True, "last_used_age_s": None, "stale_age_s": None},
            {"id": "xai-oauth", "label": "XAI", "tier_label": None, "rank": 5, "state": "unknown", "headroom": None, "secondary_headroom": None, "reachable": True, "last_used_age_s": None, "stale_age_s": None},
        ],
    }
    try:
        raw = json.loads(PROVIDER_ROUTE_RAIL_PATH.read_text(encoding="utf-8")) if PROVIDER_ROUTE_RAIL_PATH.is_file() else fallback
    except Exception as exc:
        print(f"provider route rail artifact issue: {scrub(exc.__class__.__name__)}", flush=True)
        raw = fallback
    allowed_states = {"confirmed", "inferred", "stale", "unknown", "error", "disabled"}
    allowed_ids = {"openai-codex", "anthropic", "nous", "google-gemini-cli", "google-gemini", "gemini", "copilot", "xai-oauth"}

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    try:
        as_of_ms = int(raw.get("as_of_ms")) if raw.get("as_of_ms") is not None else None
    except Exception:
        as_of_ms = None
    age_seconds = max(0, int((now_ms - as_of_ms) / 1000)) if as_of_ms is not None else None
    stale_route = age_seconds is None or age_seconds > 10 * 60
    expired_route = age_seconds is None or age_seconds > 60 * 60

    safe = {"as_of_ms": as_of_ms, "age_seconds": age_seconds, "active_provider_id": "", "providers": []}
    for item in (raw.get("providers") or [])[:5]:
        provider_id = str(item.get("id") or "")[:32]
        if provider_id not in allowed_ids:
            continue
        state = str(item.get("state") or "unknown").lower()
        if state not in allowed_states:
            state = "unknown"
        if expired_route and state in {"confirmed", "inferred", "stale"}:
            state = "unknown"
        elif stale_route and state in {"confirmed", "inferred"}:
            state = "stale"
        def safe_headroom(value):
            try:
                return max(0.0, min(1.0, float(value)))
            except Exception:
                return None
        def safe_nonnegative_number(value):
            if value is None or isinstance(value, bool):
                return None
            try:
                number = float(value)
            except (TypeError, ValueError):
                return None
            return number if math.isfinite(number) and number >= 0 else None
        label = re.sub(r"[^A-Z0-9]", "", str(item.get("label") or provider_id).upper())[:8] or "ROUTE"
        tier = re.sub(r"[^A-Z0-9/ ._-]", "", str(item.get("tier_label") or "").upper())[:12] or None
        headroom = safe_headroom(item.get("headroom"))
        secondary = safe_headroom(item.get("secondary_headroom"))
        credits_used = safe_nonnegative_number(item.get("credits_used"))
        credits_limit = safe_nonnegative_number(item.get("credits_limit"))
        if state in {"unknown", "error", "disabled"}:
            headroom = None
            secondary = None
            credits_used = None
            credits_limit = None
            if state == "unknown":
                tier = None
        stale_age_s = int(item["stale_age_s"]) if item.get("stale_age_s") is not None else (age_seconds if state == "stale" else None)
        row = {
            "id": provider_id,
            "label": label,
            "tier_label": tier,
            "rank": int(item.get("rank") or 99),
            "state": state,
            "headroom": headroom,
            "secondary_headroom": secondary,
            "credits_used": credits_used,
            "credits_limit": credits_limit,
            "reachable": item.get("reachable") if isinstance(item.get("reachable"), bool) else True,
            "last_used_age_s": int(item["last_used_age_s"]) if item.get("last_used_age_s") is not None else None,
            "stale_age_s": stale_age_s,
        }
        # Pass through reset_at_epoch_s so the frontend can show a
        # countdown when a provider is exhausted at 0 % headroom.
        if isinstance(item.get("reset_at_epoch_s"), (int, float)):
            row["reset_at_epoch_s"] = float(item["reset_at_epoch_s"])
        safe["providers"].append(row)
    safe["providers"].sort(key=lambda row: row.get("rank", 99))
    active = str(raw.get("active_provider_id") or "")[:32]
    active_allowed = active if any(row["id"] == active and row.get("state") in {"confirmed", "inferred"} for row in safe["providers"]) else ""
    safe["active_provider_id"] = active_allowed
    return safe


def load_remote_memory_status() -> dict:
    """Load display-safe remote Honcho health from the local watchdog artifact.

    The display server must not block on remote Honcho during state collection.
    A cron watchdog refreshes this local file; stale/missing artifacts render as
    unknown instead of implying Honcho is healthy.
    """
    fallback = {
        "provider": "honcho",
        "label": "HONCHO",
        "state": "unknown",
        "status": "UNKNOWN",
        "age_seconds": None,
        "api": "no local health artifact",
        "service": "",
        "app": "",
    }
    try:
        raw = json.loads(HONCHO_HEALTH_PATH.read_text(encoding="utf-8")) if HONCHO_HEALTH_PATH.is_file() else {}
    except Exception as exc:
        return {**fallback, "api": scrub(exc.__class__.__name__)}

    try:
        mtime = HONCHO_HEALTH_PATH.stat().st_mtime if HONCHO_HEALTH_PATH.is_file() else 0.0
        age_seconds = max(0, int(time.time() - mtime)) if mtime else None
    except Exception:
        age_seconds = None

    raw_state = str(raw.get("last") or "unknown").lower()
    raw_metric = raw.get("last_metric")
    metric: dict = raw_metric if isinstance(raw_metric, dict) else {}
    api_health_ok = metric.get("api_health_ok")
    raw_containers = metric.get("containers")
    containers: dict = raw_containers if isinstance(raw_containers, dict) else {}
    core_containers_up = None
    if containers:
        core_containers_up = all(
            "up" in str(containers.get(name, "")).lower()
            for name in (
                "honcho-selfhost-api-1",
                "honcho-selfhost-database-1",
                "honcho-selfhost-redis-1",
            )
        )
    if age_seconds is None or age_seconds > 20 * 60:
        state = "stale"
        status = "STALE"
    elif api_health_ok is True and core_containers_up is not False:
        # The watchdog's top-level `last` can be "degraded" for non-outage
        # warnings, for example deriver warning volume. The display's remote
        # memory cell is meant to answer whether Honcho memory is reachable, so
        # prefer the concrete API/container health fields when present.
        state = "ok"
        status = "UP"
    elif raw_state == "up":
        state = "ok"
        status = "UP"
    elif raw_state == "down" or api_health_ok is False:
        state = "down"
        status = "DOWN"
    else:
        state = "unknown"
        status = "UNKNOWN"

    def safe_field(value: object) -> str:
        return scrub(str(value or ""))[:80]

    return {
        "provider": "honcho",
        "label": "HONCHO",
        "state": state,
        "status": status,
        "age_seconds": age_seconds,
        "api": safe_field(raw.get("api") or ("health ok" if api_health_ok is True else "")),
        "service": safe_field(raw.get("service") or ("containers ok" if core_containers_up is True else "")),
        "app": safe_field(raw.get("app") or "; ".join(str(w) for w in (raw.get("warnings") or [])[:2])),
    }



def build_state_from_facts(facts: dict) -> dict:
    work = sanitize_current_work(facts.get("work") or {})
    facts = {**facts, "work": work}
    active_summary = facts.get("active_summary") or {"count": 0, "sessions": []}
    agents = int(facts.get("resident_agents") or 0)
    kanban = sanitize_kanban_snapshot(facts.get("kanban") or {"active": 0, "summary": "0 active task(s)", "tasks": []})
    system_input = facts.get("system") or {}
    sys, freshness = normalize_system_freshness(system_input)
    gateway_ok = bool(facts.get("gateway_ok"))
    raw_warn_lines = facts.get("warn_lines") or []
    warn_lines = actionable_warn_lines(raw_warn_lines)
    resolver = resolve_display_state({**facts, "warn_lines": warn_lines}, sys, freshness)
    mood, skin, caption, snippet = state_copy(resolver["display_state"], work, sys, freshness, gateway_ok, warn_lines)
    state_preset = display_preset_for(resolver["display_state"], work, freshness)
    motion = dict(DISPLAY_PRESET_MOTION.get(state_preset, DISPLAY_PRESET_MOTION["quiet_watch"]))
    manual = dict(facts.get("manual_override") or {})
    if manual.get("caption"):
        manual["caption"] = clean_log_msg(manual.get("caption"), 72)
    manual_mode = str(manual.get("mode") or "")
    if manual.get("active") and manual_mode:
        override_preset = {
            "night": "night_watch",
            "quiet": "quiet_watch",
            "attention": "waiting_input",
            "blocked": "blocked",
            "complete": "completed",
            "work": "working",
            "reasoning": "reasoning",
        }.get(manual_mode)
        if override_preset:
            state_preset = override_preset
            motion = dict(DISPLAY_PRESET_MOTION.get(state_preset, DISPLAY_PRESET_MOTION["quiet_watch"]))
            mood = {
                "night_watch": "night_sleepy",
                "quiet_watch": "idle_watchful",
                "waiting_input": "idle_watchful",
                "blocked": "blocked_annoyed",
                "completed": "healthy_smug",
                "working": "thinking_focused",
                "reasoning": "thinking_focused",
            }.get(state_preset, mood)
            skin = {
                "night_watch": "retro-night-watch",
                "blocked": "retro-amber-watch",
                "waiting_input": "retro-amber-watch",
                "working": "retro-terminal-focus",
                "reasoning": "retro-terminal-focus",
            }.get(state_preset, skin)
            resolver = {**resolver, "manual_override": manual_mode, "secondary_badges": [*resolver.get("secondary_badges", []), "manual override"]}
    if manual.get("caption"):
        caption = manual["caption"]

    if resolver["display_state"] in {"critical_local_issue", "needs_attention"}:
        work["detail"] = "Recent local issue needs attention."
        work["summary"] = caption
    elif resolver["display_state"] in {"active_work", "planning_reasoning"}:
        work.setdefault("state", "current_work")
        if int(kanban.get("active") or 0):
            work["summary"] = caption
            work.setdefault("detail", clean_log_msg(kanban["tasks"][0]["title"], 52) if kanban.get("tasks") else caption)
        else:
            work.setdefault("summary", snippet)
            work.setdefault("detail", caption)

    active_agents = int(active_summary.get("count") or 0)
    active_tasks = int(kanban.get("active") or 0) + active_agents
    cpu_value = float(sys.get("cpu") or 0.0)
    energy = min(1.0, 0.18 + cpu_value * 0.78 + min(active_agents + int(kanban.get("active") or 0), 4) * 0.04)
    focus = 0.82 if mood == "thinking_focused" else 0.45 if mood == "healthy_smug" else 0.28
    impatience = 0.70 if mood == "blocked_annoyed" else 0.10
    curiosity = 0.78 if work.get("kind") in {"request", "thinking", "compression"} else 0.64 if mood == "thinking_focused" else 0.50

    state = {
        "schema_version": "0.4.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "valid_for_seconds": 10,
        "mood": mood,
        "skin": skin,
        "state_preset": state_preset,
        "state_label": DISPLAY_PRESET_LABELS.get(state_preset, "QUIET WATCH"),
        "motion": motion,
        "playfulness": 0.58,
        "energy": round(energy, 2),
        "focus": round(focus, 2),
        "curiosity": round(curiosity, 2),
        "impatience": round(impatience, 2),
        "caption": {"text": caption, "tone": "live", "priority": "status", "max_width_chars": 42},
        "snippet": {"id": "live", "text": snippet, "kind": "system", "sensitivity": "display_safe"},
        "duration": {"transition_ms": 350},
        "safety": {"boundary": "local_trusted_display", "redaction_level": "display_safe", "contains_credentials": False},
        "live": {
            "agents": active_agents,
            "resident_agents": agents,
            "tasks": active_tasks,
            "kanban": kanban,
            "system": sys,
            "freshness": freshness,
            "resolver": {**resolver, "fixture_source": facts.get("fixture_source")},
            "last_tool": work.get("tool"),
            "current_work": work,
            "active_sessions": active_summary.get("sessions") or [],
            "gateway_ok": gateway_ok,
            "state_reason": resolver["display_state"],
            "fixture_source": facts.get("fixture_source"),
            "manual_override": manual if manual else None,
            "route_rail": facts.get("route_rail") or load_provider_route_rail(),
            "remote_memory": facts.get("remote_memory") or load_remote_memory_status(),
        },
    }
    optic_state = optic_state_packet_for(state, work)
    state["optic_state_packet"] = optic_state
    state["puppet_state_packet"] = optic_state  # backwards-compatible alias during transition
    display_state = display_state_file_packet({**facts, "manual_override": manual}, sys, freshness, resolver, state)
    if not facts.get("fixture_source"):
        persist_display_bus(state, display_state, optic_state)
    return state


def gateway_process_running() -> bool:
    """Best-effort local gateway liveness check for the physical display."""
    try:
        subprocess.check_output(
            ["pgrep", "-af", r"hermes_cli\.main gateway run|hermes.*gateway run"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=1.0,
        )
        return True
    except Exception:
        return False


def gateway_ok_recently(text: str, minutes: float = 10.0) -> bool:
    """True when recent gateway logs or the local gateway process show liveness."""
    markers = (
        "Telegram polling resumed",
        "[MEMORY]",
        "kanban dispatcher",
        "inbound message:",
        "response ready:",
        "Sending response",
        "Flushing text batch",
        "Connected to Telegram",
        "Gateway running",
        "Cron ticker started",
    )
    for line in str(text or "").splitlines():
        if any(marker in line for marker in markers) and line_is_recent(line, minutes):
            return True
    return gateway_process_running()


def build_state() -> dict:
    agent_log = LOG_DIR / "agent.log"
    gateway_log = LOG_DIR / "gateway.log"
    errors_log = LOG_DIR / "errors.log"
    recent_gateway = tail_text(gateway_log, 40_000)
    facts = {
        "warn_lines": recent_matching_lines(errors_log, ERR_RE, minutes=3, limit=4),
        "work": recent_agent_work(agent_log),
        "active_summary": active_session_summary(agent_log, minutes=CURRENT_WORK_SECONDS / 60),
        "resident_agents": active_agent_count(),
        "kanban": kanban_snapshot(),
        "system": system_snapshot(),
        "gateway_ok": gateway_ok_recently(recent_gateway),
        "manual_override": load_manual_override(),
        "route_rail": load_provider_route_rail(),
        "remote_memory": load_remote_memory_status(),
        "now_hour": datetime.now().hour,
    }
    return build_state_from_facts(facts)


def cached_build_state() -> dict:
    now = time.monotonic()
    with _STATE_CACHE_LOCK:
        cached = _STATE_CACHE.get("state")
        cached_at = float(_STATE_CACHE.get("at") or 0.0)
        if isinstance(cached, dict) and now - cached_at < HERMES_STATE_CACHE_TTL_SECONDS:
            return json.loads(json.dumps(cached))
    state = build_state()
    with _STATE_CACHE_LOCK:
        _STATE_CACHE["at"] = now
        _STATE_CACHE["state"] = json.loads(json.dumps(state))
    return state


def family_safe_state(source_state: dict) -> dict:
    """Return a fixed family-safe projection with only coarse system telemetry."""
    source = source_state if isinstance(source_state, dict) else {}
    raw_live = source.get("live")
    source_live = raw_live if isinstance(raw_live, dict) else {}
    raw_system = source_live.get("system")
    source_system = raw_system if isinstance(raw_system, dict) else {}
    safe_system: dict[str, float] = {}
    for key in ("cpu", "memory", "temp_c", "cpu_temp_c"):
        value = source_system.get(key)
        if value is None or isinstance(value, bool):
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            safe_system[key] = number

    quiet = DISPLAY_PRESETS["quiet_watch"]
    state = {
        "schema_version": "0.4.0",
        "generated_at": source.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        "valid_for_seconds": 10,
        "mood": quiet["mood"],
        "skin": quiet["skin"],
        "state_preset": "quiet_watch",
        "state_label": "FAMILY MODE",
        "motion": json.loads(json.dumps(quiet["motion"])),
        "playfulness": 0.58,
        "energy": 0.2,
        "focus": 0.28,
        "curiosity": 0.5,
        "impatience": 0.0,
        "caption": {"text": "Family mode.", "tone": "calm", "priority": "ambient", "max_width_chars": 42},
        "snippet": None,
        "duration": {"transition_ms": 350},
        "safety": {"boundary": "local_trusted_display", "redaction_level": "public_status", "contains_credentials": False},
        "live": {"family_mode": True, "system": safe_system},
    }
    optic_state = optic_state_packet_for(state, {})
    state["optic_state_packet"] = optic_state
    state["puppet_state_packet"] = optic_state
    return state


def request_provider_route_rail_refresh() -> dict:
    """Queue the deployed read-only quota refresh service with a short cooldown."""
    global _PROVIDER_ROUTE_REFRESH_AT
    now = time.monotonic()
    with _PROVIDER_ROUTE_REFRESH_LOCK:
        if now - _PROVIDER_ROUTE_REFRESH_AT < 15.0:
            return {"ok": True, "status": "cooldown"}
        result = subprocess.run(
            ["systemctl", "--user", "start", "--no-block", "hermes-route-rail-refresh.service"],
            text=True,
            capture_output=True,
            timeout=3,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("route rail refresh service unavailable")
        _PROVIDER_ROUTE_REFRESH_AT = now
    return {"ok": True, "status": "queued"}


def clear_state_cache() -> None:
    with _STATE_CACHE_LOCK:
        _STATE_CACHE["at"] = 0.0
        _STATE_CACHE["state"] = None


def degraded_state(reason: str = "state_api_error") -> dict:
    """Return display-safe degraded state when live collection fails."""
    facts = {
        "warn_lines": [],
        "work": {
            "active": False,
            "state": "degraded",
            "summary": "Display state feed degraded.",
            "detail": "local state API returned a safe fallback",
            "kind": "watch",
            "visual_kind": "watch",
            "age_seconds": 0,
        },
        "active_summary": {"count": 0, "sessions": []},
        "resident_agents": 0,
        "kanban": {"active": 0, "summary": "0 active task(s)", "tasks": []},
        "system": {"sensor_error": True, "measurements": {}, "source": reason},
        "gateway_ok": False,
        "now_hour": datetime.now().hour,
    }
    state = build_state_from_facts(facts)
    state["live"]["state_api_degraded"] = True
    state["live"]["state_api_reason"] = scrub(reason)[:64]
    return state


def build_state_from_fixture_name(name: str) -> dict:
    fixture_name = Path(name or "").name
    if fixture_name != name or not fixture_name.endswith(".json"):
        raise FixtureLookupError("Fixture not found")

    fixture_path = ROOT / "tests" / "fixtures" / "resolver" / fixture_name
    if not fixture_path.is_file():
        raise FixtureLookupError("Fixture not found")

    try:
        facts = json.loads(fixture_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise FixtureLookupError("Fixture is invalid") from exc
    facts["fixture_source"] = fixture_name
    return build_state_from_facts(facts)


def json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


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


def format_temp(value) -> str:
    if value is None:
        return "temp n/a"
    try:
        return f"{round(float(value))}°C"
    except Exception:
        return "temp n/a"


def entertainment_sequence_ids() -> set[str]:
    path = ROOT / "src" / "mascot" / "sequences.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return {
            str(seq.get("id"))
            for seq in data.get("sequences", [])
            if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(seq.get("id") or ""))
        } or {"curious_orb", "feathered_flyby", "mini_showtime", "peek_a_blink"}
    except Exception:
        return {"curious_orb", "feathered_flyby", "mini_showtime", "peek_a_blink"}


def _usage_today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _usage_hour() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")


def entertainment_usage() -> dict:
    today = _usage_today()
    try:
        usage = json.loads(ENTERTAINMENT_USAGE_PATH.read_text(encoding="utf-8")) if ENTERTAINMENT_USAGE_PATH.is_file() else {}
    except Exception:
        usage = {}
    if usage.get("date") != today:
        usage = {"date": today, "tts_requests": 0, "line_requests": 0, "tts_cache_misses": 0, "hours": {}}
    usage.setdefault("tts_requests", 0)
    usage.setdefault("line_requests", 0)
    usage.setdefault("micro_show_requests", 0)
    usage.setdefault("tts_cache_misses", 0)
    usage.setdefault("hours", {})
    usage["hours"].setdefault(_usage_hour(), {"tts_cache_misses": 0})
    return usage


def _usage_allowed(usage: dict, kind: str) -> bool:
    hour = usage.get("hours", {}).get(_usage_hour(), {})
    if kind == "tts_cache_miss":
        return (
            int(usage.get("tts_cache_misses", 0)) < MAX_SERVER_TTS_CACHE_MISSES_PER_DAY
            and int(hour.get("tts_cache_misses", 0)) < MAX_SERVER_TTS_CACHE_MISSES_PER_HOUR
        )
    if kind == "line_generation":
        return int(usage.get("line_requests", 0)) < MAX_SERVER_LINE_GENERATIONS_PER_DAY
    if kind == "micro_show":
        return int(usage.get("micro_show_requests", 0)) < MAX_SERVER_MICRO_SHOWS_PER_DAY
    return False


def _increment_usage(usage: dict, kind: str) -> None:
    hour = usage.setdefault("hours", {}).setdefault(_usage_hour(), {"tts_cache_misses": 0})
    if kind == "tts_cache_miss":
        usage["tts_requests"] = int(usage.get("tts_requests", 0)) + 1
        usage["tts_cache_misses"] = int(usage.get("tts_cache_misses", 0)) + 1
        hour["tts_cache_misses"] = int(hour.get("tts_cache_misses", 0)) + 1
    elif kind == "line_generation":
        usage["line_requests"] = int(usage.get("line_requests", 0)) + 1
    elif kind == "micro_show":
        usage["micro_show_requests"] = int(usage.get("micro_show_requests", 0)) + 1


def entertainment_budget_allowed(kind: str) -> bool:
    with _ENTERTAINMENT_USAGE_LOCK:
        return _usage_allowed(entertainment_usage(), kind)


def reserve_entertainment_budget(kind: str) -> bool:
    with _ENTERTAINMENT_USAGE_LOCK:
        usage = entertainment_usage()
        if not _usage_allowed(usage, kind):
            return False
        _increment_usage(usage, kind)
        atomic_json_write(ENTERTAINMENT_USAGE_PATH, usage)
        return True


def record_entertainment_usage(kind: str) -> None:
    with _ENTERTAINMENT_USAGE_LOCK:
        usage = entertainment_usage()
        _increment_usage(usage, kind)
        atomic_json_write(ENTERTAINMENT_USAGE_PATH, usage)


def write_watch_animation_log(payload: dict) -> dict:
    """Append a bounded local entertainment audit record without raw text or prompts."""
    sequence_id = str(payload.get("sequence_id") or "")[:64]
    if sequence_id not in entertainment_sequence_ids():
        raise ValueError("invalid_sequence_id")
    raw_ts = str(payload.get("ts") or datetime.now(timezone.utc).isoformat())[:40]
    record = {
        "ts": raw_ts,
        "sequence_id": sequence_id,
        "aborted": bool(payload.get("aborted")),
    }
    event = str(payload.get("event") or "")[:40]
    if event in {"sequence_started", "sequence_aborted", "tts_played", "tts_fallback", "line_generated"}:
        record["event"] = event
    line_id = str(payload.get("line_id") or "")[:96]
    if line_id and re.fullmatch(r"[A-Za-z0-9_.:-]{1,96}", line_id):
        record["line_id"] = line_id
    if "cached" in payload:
        record["cached"] = bool(payload.get("cached"))
    append_bounded_jsonl(WATCH_ANIMATION_LOG_PATH, record, max_lines=500)
    return record


def _read_json_body(handler: SimpleHTTPRequestHandler, max_bytes: int) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as exc:
        raise ValueError("invalid_length") from exc
    if length <= 0 or length > max_bytes:
        raise ValueError("body_too_large" if length > max_bytes else "empty_body")
    payload = json.loads(handler.rfile.read(length).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("invalid_json_object")
    forbidden = {"prompt", "log", "raw", "messages", "system", "developer", "context", "transcript", "tool_output", "file_path"}
    if forbidden.intersection(payload):
        raise ValueError("forbidden_request_field")
    return payload


def _normalize_entertainment_text(text, max_chars: int = MAX_TTS_TEXT_CHARS) -> str:
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if not value or len(value) > max_chars:
        raise ValueError("invalid_text_length")
    if scrub(value) == "[display-safe detail hidden]" or any(pattern.search(value) for pattern in SECRET_PATTERNS):
        raise ValueError("unsafe_text")
    if re.search(r"https?://|www\.|@[\w.-]+|(?:^|\s)(?:\.{0,2}/|~/|/[\w.-]+/)|\b(credential|password|token|secret|log|traceback)\b", value, re.I):
        raise ValueError("non_display_safe_text")
    if not re.fullmatch(r"[A-Za-z0-9 .,!?'-]{1,%d}" % max_chars, value):
        raise ValueError("unsupported_text_chars")
    return value


def _safe_sequence_id(payload: dict) -> str:
    sequence_id = str(payload.get("sequence_id") or "").strip()
    if sequence_id not in entertainment_sequence_ids():
        raise ValueError("invalid_sequence_id")
    return sequence_id


def _safe_line_id(payload: dict, sequence_id: str) -> str:
    line_id = str(payload.get("line_id") or f"{sequence_id}.line").strip()[:96]
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,96}", line_id):
        raise ValueError("invalid_line_id")
    return line_id


def _entertainment_hash(*parts: str) -> str:
    normalized = "\u241f".join(str(part or "").strip().lower() for part in parts)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def entertainment_tts_cache_key(model: str, voice: str, instructions: str, text: str) -> str:
    return _entertainment_hash(ENTERTAINMENT_SCHEMA_VERSION, model, voice, instructions, text)


def _json_post_openai(url: str, payload: dict, api_key: str) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _post_openai_tts(payload: dict, api_key: str) -> bytes:
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read()


def handle_entertainment_tts(payload: dict) -> dict:
    sequence_id = _safe_sequence_id(payload)
    line_id = _safe_line_id(payload, sequence_id)
    text = _normalize_entertainment_text(payload.get("text"), MAX_TTS_TEXT_CHARS)
    voice = str(payload.get("voice") or "marin").strip().lower()
    if voice not in ENTERTAINMENT_VOICES:
        voice = "coral"
    instructions = _normalize_entertainment_text(
        payload.get("style") or payload.get("instructions") or "small cheerful robot friend, warm, playful, not loud",
        160,
    )
    model = ENTERTAINMENT_TTS_MODEL
    cache_key = entertainment_tts_cache_key(model, voice, instructions, text)
    mp3_path = ENTERTAINMENT_TTS_CACHE_DIR / f"{cache_key}.mp3"
    meta_path = ENTERTAINMENT_TTS_CACHE_DIR / f"{cache_key}.json"
    if mp3_path.is_file():
        return {"ok": True, "audio_url": f"/api/hermes-entertainment/tts-cache/{cache_key}.mp3", "cache_key": cache_key, "cached": True, "duration_hint_ms": max(700, min(3500, len(text) * 75))}
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "fallback": "browser_tts", "reason": "missing_openai_api_key"}
    if not reserve_entertainment_budget("tts_cache_miss"):
        return {"ok": False, "fallback": "browser_tts", "reason": "server_tts_budget_exhausted"}
    ENTERTAINMENT_TTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    speech_payload = {"model": model, "voice": voice, "input": text, "instructions": instructions, "response_format": "mp3"}
    audio = _post_openai_tts(speech_payload, api_key)
    if not audio or len(audio) < 128:
        raise ValueError("empty_tts_audio")
    fd, tmp_name = tempfile.mkstemp(prefix=f".{cache_key}.", suffix=".mp3.tmp", dir=ENTERTAINMENT_TTS_CACHE_DIR)
    with os.fdopen(fd, "wb") as tmp:
        tmp.write(audio)
    os.replace(tmp_name, mp3_path)
    atomic_json_write(meta_path, {"text": text, "voice": voice, "model": model, "instructions": instructions, "line_id": line_id, "sequence_id": sequence_id, "created_at": datetime.now(timezone.utc).isoformat(), "schema_version": ENTERTAINMENT_SCHEMA_VERSION})
    return {"ok": True, "audio_url": f"/api/hermes-entertainment/tts-cache/{cache_key}.mp3", "cache_key": cache_key, "cached": False, "duration_hint_ms": max(700, min(3500, len(text) * 75))}


def validate_entertainment_line(payload: dict) -> dict:
    line = _normalize_entertainment_text(payload.get("line"), MAX_AI_LINE_CHARS)
    caption = _normalize_entertainment_text(payload.get("caption") or line, MAX_AI_LINE_CHARS)
    emotion = str(payload.get("emotion") or "delighted").strip().lower()
    sfx_hint = str(payload.get("sfx_hint") or "none").strip().lower()
    particle_theme = str(payload.get("particle_theme") or "stars").strip().lower()
    if emotion not in ENTERTAINMENT_ALLOWED_EMOTIONS:
        raise ValueError("invalid_emotion")
    if sfx_hint not in ENTERTAINMENT_ALLOWED_SFX:
        raise ValueError("invalid_sfx_hint")
    if particle_theme not in ENTERTAINMENT_ALLOWED_PARTICLES:
        raise ValueError("invalid_particle_theme")
    return {"line": line, "caption": caption, "emotion": emotion, "sfx_hint": sfx_hint, "particle_theme": particle_theme}


def handle_entertainment_line(payload: dict) -> dict:
    trigger = str(payload.get("trigger") or "tap").strip().lower()
    mode = str(payload.get("mode") or "family").strip().lower()
    if trigger not in ENTERTAINMENT_ALLOWED_TRIGGERS:
        raise ValueError("invalid_trigger")
    if mode not in ENTERTAINMENT_ALLOWED_MODES:
        mode = "family"
    max_chars = int(payload.get("max_chars") or 48)
    max_chars = max(16, min(MAX_AI_LINE_CHARS, max_chars))
    style = _normalize_entertainment_text(payload.get("style") or "tiny friendly robot companion", 96)
    cache_key = _entertainment_hash(ENTERTAINMENT_SCHEMA_VERSION, trigger, mode, style, str(max_chars), datetime.now().strftime("%Y-%m-%d"))
    try:
        cache = json.loads(ENTERTAINMENT_LINE_CACHE_PATH.read_text(encoding="utf-8")) if ENTERTAINMENT_LINE_CACHE_PATH.is_file() else {}
    except Exception:
        cache = {}
    if cache_key in cache:
        try:
            cached = validate_entertainment_line(cache[cache_key])
        except Exception:
            cache.pop(cache_key, None)
            atomic_json_write(ENTERTAINMENT_LINE_CACHE_PATH, cache)
        else:
            return {"ok": True, **cached, "cache_key": cache_key, "cached": True}
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or not reserve_entertainment_budget("line_generation"):
        fallback = validate_entertainment_line({"line": "Boop received!", "caption": "Boop received!", "emotion": "delighted", "sfx_hint": "boop", "particle_theme": "stars"})
        reason = "missing_openai_api_key" if not api_key else "server_line_budget_exhausted"
        return {"ok": False, "fallback": "curated", "reason": reason, **fallback}
    schema = {
        "type": "object", "additionalProperties": False,
        "required": ["line", "caption", "emotion", "sfx_hint", "particle_theme"],
        "properties": {
            "line": {"type": "string", "maxLength": max_chars},
            "caption": {"type": "string", "maxLength": max_chars},
            "emotion": {"type": "string", "enum": sorted(ENTERTAINMENT_ALLOWED_EMOTIONS)},
            "sfx_hint": {"type": "string", "enum": sorted(ENTERTAINMENT_ALLOWED_SFX)},
            "particle_theme": {"type": "string", "enum": sorted(ENTERTAINMENT_ALLOWED_PARTICLES)},
        },
    }
    prompt = "Generate one short family-safe line for a friendly home display named Hermes. Rules: 2 to 8 words preferred. No names. No personal data. No work, logs, files, tools, secrets, credentials, or system status. No scary, violent, romantic, rude, religious, political, medical, or adult content. No advice. No questions asking a child to disclose anything. Whimsical, gentle, easy to hear."
    response = _json_post_openai(
        "https://api.openai.com/v1/responses",
        {"model": ENTERTAINMENT_LINE_MODEL, "input": [{"role": "system", "content": prompt}, {"role": "user", "content": f"trigger={trigger}; mode={mode}; style={style}; max_chars={max_chars}"}], "text": {"format": {"type": "json_schema", "name": "hermes_entertainment_line", "schema": schema, "strict": True}}},
        api_key,
    )
    output_text = response.get("output_text") or ""
    if not output_text:
        for item in response.get("output", []) or []:
            for content in item.get("content", []) or []:
                if content.get("type") in {"output_text", "text"} and content.get("text"):
                    output_text = content.get("text")
                    break
    generated = validate_entertainment_line(json.loads(output_text))
    cache[cache_key] = generated
    atomic_json_write(ENTERTAINMENT_LINE_CACHE_PATH, cache)
    return {"ok": True, **generated, "cache_key": cache_key, "cached": False}


def validate_micro_show(payload: dict) -> dict:
    title = _normalize_entertainment_text(payload.get("title") or "Tiny Light Parade", 64)
    line = _normalize_entertainment_text(payload.get("line") or title, 64)
    steps = payload.get("steps") or []
    if not isinstance(steps, list) or len(steps) > 12:
        raise ValueError("invalid_micro_show_steps")
    clean_steps = []
    max_at = 0
    for raw in steps:
        if not isinstance(raw, dict):
            raise ValueError("invalid_micro_show_step")
        if any(key in raw for key in ("html", "css", "js", "url", "href", "src", "code")):
            raise ValueError("forbidden_micro_show_field")
        event = str(raw.get("event") or "").strip().upper()
        if event not in MICRO_SHOW_ALLOWED_EVENTS:
            raise ValueError("invalid_micro_show_event")
        at_ms = int(max(0, min(12000, float(raw.get("at_ms") or 0))))
        max_at = max(max_at, at_ms)
        step = {"at_ms": at_ms, "event": event}
        if event == "SFX":
            asset = str(raw.get("asset") or "sfx-chime-soft").strip()
            if asset not in MICRO_SHOW_ALLOWED_SFX:
                raise ValueError("invalid_micro_show_sfx")
            step["asset"] = asset
        elif event == "PARTICLE":
            kind = str(raw.get("kind") or "star").strip().lower()
            if kind not in MICRO_SHOW_ALLOWED_PARTICLES:
                raise ValueError("invalid_micro_show_particle")
            step["kind"] = kind
            step["count"] = int(max(1, min(28, int(raw.get("count") or 10))))
        elif event in {"RIPPLE", "ORBIT"}:
            step["zone"] = str(raw.get("zone") or "boop")[:16]
        elif event == "COMET":
            step["side"] = "right" if str(raw.get("side") or "left").lower() == "right" else "left"
        elif event == "GAZE":
            step["target"] = str(raw.get("target") or "front")[:32]
            step["hold_ms"] = int(max(180, min(1200, int(raw.get("hold_ms") or 420))))
        elif event == "CAPTION":
            step["text"] = _normalize_entertainment_text(raw.get("text") or title, 64)
            step["dur_ms"] = int(max(500, min(2400, int(raw.get("dur_ms") or 1300))))
        elif event in {"BLINK", "GLOW"}:
            step["kind"] = str(raw.get("kind") or "notice")[:24]
        clean_steps.append(step)
    if max_at > 12000:
        raise ValueError("micro_show_too_long")
    return {"title": title, "line": line, "steps": clean_steps, "duration_ms": min(12000, max_at + 1200)}


def _fallback_micro_show(reason: str = "missing_openai_api_key") -> dict:
    show = validate_micro_show({
        "title": "Moonbeam Parade",
        "line": "Moonbeam parade!",
        "steps": [
            {"at_ms": 0, "event": "PARTICLE", "kind": "star", "count": 12},
            {"at_ms": 420, "event": "RIPPLE", "zone": "boop"},
            {"at_ms": 780, "event": "GAZE", "target": "augury_left", "hold_ms": 420},
            {"at_ms": 1150, "event": "SFX", "asset": "sfx-chime-soft"},
            {"at_ms": 1650, "event": "COMET", "side": "right"},
        ],
    })
    return {"ok": False, "fallback": "curated", "reason": reason, **show}


def handle_entertainment_micro_show(payload: dict) -> dict:
    trigger = str(payload.get("trigger") or "micro_show").strip().lower()
    mode = str(payload.get("mode") or "idle_watch").strip().lower()
    if trigger not in ENTERTAINMENT_ALLOWED_TRIGGERS:
        raise ValueError("invalid_trigger")
    if mode not in ENTERTAINMENT_ALLOWED_MODES:
        mode = "family"
    cache_key = _entertainment_hash(ENTERTAINMENT_SCHEMA_VERSION, "micro_show", trigger, mode, datetime.now().strftime("%Y-%m-%d"))
    try:
        cache = json.loads(ENTERTAINMENT_LINE_CACHE_PATH.read_text(encoding="utf-8")) if ENTERTAINMENT_LINE_CACHE_PATH.is_file() else {}
    except Exception:
        cache = {}
    if cache_key in cache:
        try:
            cached = validate_micro_show(cache[cache_key])
        except Exception:
            cache.pop(cache_key, None)
            atomic_json_write(ENTERTAINMENT_LINE_CACHE_PATH, cache)
        else:
            return {"ok": True, **cached, "cache_key": cache_key, "cached": True}
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key or not reserve_entertainment_budget("micro_show"):
        return _fallback_micro_show("missing_openai_api_key" if not api_key else "server_micro_show_budget_exhausted")
    schema = {
        "type": "object", "additionalProperties": False,
        "required": ["title", "line", "steps"],
        "properties": {
            "title": {"type": "string", "maxLength": 64},
            "line": {"type": "string", "maxLength": 64},
            "steps": {"type": "array", "maxItems": 12, "items": {"type": "object", "additionalProperties": False, "required": ["at_ms", "event"], "properties": {
                "at_ms": {"type": "integer", "minimum": 0, "maximum": 12000},
                "event": {"type": "string", "enum": sorted(MICRO_SHOW_ALLOWED_EVENTS)},
                "kind": {"type": "string"}, "count": {"type": "integer", "minimum": 1, "maximum": 28},
                "zone": {"type": "string"}, "side": {"type": "string", "enum": ["left", "right"]},
                "target": {"type": "string"}, "hold_ms": {"type": "integer", "minimum": 180, "maximum": 1200},
                "asset": {"type": "string", "enum": sorted(MICRO_SHOW_ALLOWED_SFX)},
                "text": {"type": "string", "maxLength": 64}, "dur_ms": {"type": "integer", "minimum": 500, "maximum": 2400},
            }}},
        },
    }
    prompt = "Compose one very short family-safe audiovisual micro-show for a private home display named Hermes. Data only. No HTML, CSS, JS, URLs, logs, work context, personal data, system status, child names, secrets, or instructions."
    response = _json_post_openai(
        "https://api.openai.com/v1/responses",
        {"model": ENTERTAINMENT_LINE_MODEL, "input": [{"role": "system", "content": prompt}, {"role": "user", "content": f"trigger={trigger}; mode={mode}; max duration 12s; max 12 steps"}], "text": {"format": {"type": "json_schema", "name": "hermes_micro_show", "schema": schema, "strict": True}}},
        api_key,
    )
    output_text = response.get("output_text") or ""
    if not output_text:
        for item in response.get("output", []) or []:
            for content in item.get("content", []) or []:
                if content.get("type") in {"output_text", "text"} and content.get("text"):
                    output_text = content.get("text")
                    break
    show = validate_micro_show(json.loads(output_text))
    cache[cache_key] = show
    atomic_json_write(ENTERTAINMENT_LINE_CACHE_PATH, cache)
    return {"ok": True, **show, "cache_key": cache_key, "cached": False}


def _deterministic_daily_creature(today: str) -> dict:
    names = ["Zibble", "Momo", "Piploo", "Nimbit", "Orbsy", "Luma", "Tiko"]
    themes = ["moon cyan", "soft gold", "tiny violet", "warm teal", "blue-green", "lantern amber"]
    idx = sum(ord(ch) for ch in today) % len(names)
    name = names[idx]
    return {"ok": False, "fallback": "deterministic", "date": today, "name": name, "color_theme": themes[idx % len(themes)], "sound": "chirp", "favorite_motion": "spiral", "line": f"{name} found a sparkle!", "sequence_hint": "daily_creature_visit"}


def validate_daily_creature(payload: dict, today: str, *, strict: bool = False) -> dict:
    if strict:
        required = {"name", "color_theme", "sound", "favorite_motion", "line", "sequence_hint"}
        if not isinstance(payload, dict) or not required <= payload.keys():
            raise ValueError("invalid_daily_creature_cache")
        for key in required:
            value = payload.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ValueError("invalid_daily_creature_cache")
        if payload.get("sequence_hint") not in entertainment_sequence_ids():
            raise ValueError("invalid_daily_creature_sequence")
    name = _normalize_entertainment_text(payload.get("name") or "Zibble", 24)
    color_theme = _normalize_entertainment_text(payload.get("color_theme") or "moon cyan", 32)
    sound = str(payload.get("sound") or "chirp").strip().lower()[:24]
    favorite_motion = str(payload.get("favorite_motion") or "spiral").strip().lower()[:32]
    line = _normalize_entertainment_text(payload.get("line") or f"{name} found a sparkle!", 64)
    sequence_hint = str(payload.get("sequence_hint") or "daily_creature_visit").strip()
    if sequence_hint not in entertainment_sequence_ids():
        sequence_hint = "daily_creature_visit" if "daily_creature_visit" in entertainment_sequence_ids() else "peek_a_blink"
    return {"ok": True, "date": today, "name": name, "color_theme": color_theme, "sound": sound, "favorite_motion": favorite_motion, "line": line, "sequence_hint": sequence_hint}


def handle_daily_creature() -> dict:
    today = _usage_today()
    try:
        cache = json.loads(ENTERTAINMENT_DAILY_CACHE_PATH.read_text(encoding="utf-8")) if ENTERTAINMENT_DAILY_CACHE_PATH.is_file() else {}
    except Exception:
        cache = {}
    if cache.get("date") == today and isinstance(cache.get("creature"), dict):
        try:
            creature = validate_daily_creature(cache["creature"], today, strict=True)
        except Exception:
            cache = {}
            atomic_json_write(ENTERTAINMENT_DAILY_CACHE_PATH, cache)
        else:
            return {"ok": True, "cached": True, **creature}
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        creature = _deterministic_daily_creature(today)
        atomic_json_write(ENTERTAINMENT_DAILY_CACHE_PATH, {"date": today, "creature": creature})
        return creature
    schema = {"type": "object", "additionalProperties": False, "required": ["name", "color_theme", "sound", "favorite_motion", "line", "sequence_hint"], "properties": {"name": {"type": "string", "maxLength": 24}, "color_theme": {"type": "string", "maxLength": 32}, "sound": {"type": "string", "maxLength": 24}, "favorite_motion": {"type": "string", "maxLength": 32}, "line": {"type": "string", "maxLength": 64}, "sequence_hint": {"type": "string", "enum": sorted(entertainment_sequence_ids())}}}
    prompt = "Generate one family-safe fictional tiny creature for a private home display. No child names, no personal data, no work/log/system context, no questions, no URLs."
    try:
        response = _json_post_openai("https://api.openai.com/v1/responses", {"model": ENTERTAINMENT_LINE_MODEL, "input": [{"role": "system", "content": prompt}, {"role": "user", "content": f"date={today}"}], "text": {"format": {"type": "json_schema", "name": "hermes_daily_creature", "schema": schema, "strict": True}}}, api_key)
        output_text = response.get("output_text") or ""
        if not output_text:
            for item in response.get("output", []) or []:
                for content in item.get("content", []) or []:
                    if content.get("type") in {"output_text", "text"} and content.get("text"):
                        output_text = content.get("text")
                        break
        creature = validate_daily_creature(json.loads(output_text), today)
    except Exception:
        creature = _deterministic_daily_creature(today)
    atomic_json_write(ENTERTAINMENT_DAILY_CACHE_PATH, {"date": today, "creature": creature})
    return creature


class Handler(SimpleHTTPRequestHandler):
    directory = str(ROOT)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def setup(self) -> None:
        super().setup()
        try:
            self.request.settimeout(REQUEST_SOCKET_TIMEOUT_SECONDS)
        except Exception:
            pass

    def loopback_only(self, message: str = "operator-only endpoint accepts localhost requests only") -> bool:
        if is_loopback_request(self.client_address[0], self.headers.get("Host")):
            return True
        json_response(self, 403, {"error": "loopback_only", "message": message})
        return False

    def same_origin_only(self, message: str = "operator-only endpoint requires a same-origin request") -> bool:
        host = (self.headers.get("Host") or "").strip().lower()
        origin = (self.headers.get("Origin") or "").strip()
        try:
            parsed_origin = urlparse(origin)
        except ValueError:
            parsed_origin = None
        if (
            parsed_origin is not None
            and parsed_origin.scheme == "http"
            and parsed_origin.netloc.lower() == host
            and parsed_origin.path in {"", "/"}
            and not parsed_origin.params
            and not parsed_origin.query
            and not parsed_origin.fragment
        ):
            return True
        json_response(self, 403, {"error": "same_origin_only", "message": message})
        return False

    @staticmethod
    def static_source_path_allowed(path: str) -> bool:
        decoded_path = unquote(path)
        return (
            (decoded_path == "/src" or decoded_path.startswith("/src/"))
            and ".." not in Path(decoded_path).parts
        )

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/hermes-state":
            params = parse_qs(parsed.query)
            fixture = params.get("fixture", [None])[0]
            audience = params.get("audience", [None])[0]
            try:
                state = build_state_from_fixture_name(fixture) if fixture else cached_build_state()
            except FixtureLookupError:
                json_response(self, 404, {
                    "error": "fixture_not_found",
                    "message": "Display preview fixture not found. Use a fixture JSON filename from tests/fixtures/resolver/.",
                })
                return
            except Exception as exc:
                safe_reason = scrub(exc.__class__.__name__)
                print(f"Display state API degraded: {safe_reason}", flush=True)
                state = degraded_state(safe_reason)
                json_response(self, 503, family_safe_state(state) if audience == "family" else state)
                return
            json_response(self, 200, family_safe_state(state) if audience == "family" else state)
            return
        if parsed.path == "/api/augury-feed":
            if not self.loopback_only("Augury feed is operator-only and accepts localhost requests only"):
                return
            params = parse_qs(parsed.query)
            limit_raw = params.get("limit", [str(AUGURY_DEFAULT_LIMIT)])[0]
            minutes_raw = params.get("minutes", [str(AUGURY_DEFAULT_MINUTES)])[0]
            try:
                payload = build_augury_feed(limit=limit_raw, minutes=minutes_raw)
            except Exception as exc:
                safe = scrub(exc.__class__.__name__)
                print(f"Augury feed degraded: {safe}", flush=True)
                json_response(self, 503, {
                    "schema_version": AUGURY_SCHEMA_VERSION,
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "boundary": "home_private_lan",
                    "sensitivity": "home_private_redacted",
                    "error": "augury_feed_degraded",
                    "reason": safe,
                    "items": [],
                })
                return
            json_response(self, 200, payload)
            return
        if parsed.path == "/avatar-events/health":
            if not self.loopback_only():
                return
            json_response(self, 200, AVATAR_EVENT_BUS.health())
            return
        if parsed.path == "/avatar-events/stream":
            if not self.loopback_only():
                return
            audience = parse_qs(parsed.query).get("audience", [""])[0]
            if audience != "operator":
                self.send_error(404)
                return
            self.handle_avatar_event_stream()
            return
        if parsed.path == "/api/hermes-entertainment/daily-creature":
            if not self.loopback_only():
                return
            try:
                result = handle_daily_creature()
            except Exception as exc:
                print(f"Daily creature request failed: {exc.__class__.__name__}", flush=True)
                json_response(self, 400, {"ok": False, "error": "invalid_daily_creature", "reason": "invalid_request", **_deterministic_daily_creature(_usage_today())})
                return
            json_response(self, 200, result)
            return
        if parsed.path.startswith("/api/hermes-entertainment/tts-cache/"):
            if not self.loopback_only():
                return
            name = Path(parsed.path).name
            if not re.fullmatch(r"[a-f0-9]{64}\.mp3", name):
                json_response(self, 404, {"error": "not_found"})
                return
            path = ENTERTAINMENT_TTS_CACHE_DIR / name
            if not path.is_file():
                json_response(self, 404, {"error": "not_found"})
                return
            body = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_cache_control("private, max-age=86400")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if not self.static_source_path_allowed(parsed.path):
            self.send_error(404)
            return
        return super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if not self.static_source_path_allowed(parsed.path):
            self.send_error(404)
            return
        return super().do_HEAD()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/provider-route-rail/refresh":
            if not self.loopback_only("Route headroom refresh accepts localhost requests only"):
                return
            if not self.same_origin_only("Route headroom refresh requires a same-origin browser request"):
                return
            try:
                result = request_provider_route_rail_refresh()
            except Exception as exc:
                print(f"Route headroom refresh failed: {exc.__class__.__name__}", flush=True)
                json_response(self, 503, {"ok": False, "status": "unavailable"})
                return
            json_response(self, 202, result)
            return
        if parsed.path == "/api/watch-animation-log":
            if not self.loopback_only():
                return
            try:
                payload = _read_json_body(self, 512)
                record = write_watch_animation_log(payload)
            except Exception as exc:
                print(f"Watch animation log rejected: {exc.__class__.__name__}", flush=True)
                json_response(self, 400, {"error": "invalid_watch_animation_log", "reason": "invalid_request"})
                return
            json_response(self, 202, {"ok": True, "sequence_id": record["sequence_id"], "aborted": record["aborted"]})
            return
        if parsed.path == "/api/hermes-entertainment/tts":
            if not self.loopback_only():
                return
            try:
                payload = _read_json_body(self, MAX_TTS_REQUEST_BYTES)
                result = handle_entertainment_tts(payload)
            except Exception as exc:
                print(f"Entertainment TTS request rejected: {exc.__class__.__name__}", flush=True)
                json_response(self, 400, {"ok": False, "error": "invalid_tts_request", "reason": "invalid_request", "fallback": "browser_tts"})
                return
            json_response(self, 200, result)
            return
        if parsed.path == "/api/hermes-entertainment/line":
            if not self.loopback_only():
                return
            try:
                payload = _read_json_body(self, MAX_LINE_REQUEST_BYTES)
                result = handle_entertainment_line(payload)
            except Exception as exc:
                print(f"Entertainment line request rejected: {exc.__class__.__name__}", flush=True)
                json_response(self, 400, {"ok": False, "error": "invalid_line_request", "reason": "invalid_request", "fallback": "curated"})
                return
            json_response(self, 200, result)
            return
        if parsed.path == "/api/hermes-entertainment/micro-show":
            if not self.loopback_only():
                return
            try:
                payload = _read_json_body(self, MAX_LINE_REQUEST_BYTES)
                result = handle_entertainment_micro_show(payload)
            except Exception as exc:
                print(f"Entertainment micro-show request rejected: {exc.__class__.__name__}", flush=True)
                json_response(self, 400, {"ok": False, "error": "invalid_micro_show_request", "reason": "invalid_request", **_fallback_micro_show("invalid_request")})
                return
            json_response(self, 200, result)
            return
        if parsed.path != "/avatar-events/publish":
            self.send_error(404)
            return
        if not self.loopback_only():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            json_response(self, 400, {"error": "invalid_length"})
            return
        if length <= 0 or length > 2048:
            json_response(self, 413 if length > 2048 else 400, {"error": "invalid_event", "reason": "body exceeds max size"})
            return
        try:
            event = load_event_json(self.rfile.read(length))
            safe = AVATAR_EVENT_BUS.publish(event)
        except ValidationError as exc:
            AVATAR_EVENT_BUS.record_drop(str(exc))
            print(f"Avatar event rejected: {scrub(str(exc))}", flush=True)
            json_response(self, 400, {"error": "invalid_event", "reason": "validation_failed"})
            return
        print(f"Avatar event accepted: {safe.get('event')} {safe.get('id')}", flush=True)
        json_response(self, 202, {"ok": True, "id": safe.get("id"), "event": safe.get("event")})

    def handle_avatar_event_stream(self) -> None:
        subscriber = None
        try:
            subscriber = AVATAR_EVENT_BUS.subscribe()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(b": hermes avatar event stream\n\n")
            self.wfile.flush()
            while True:
                try:
                    event = subscriber.get(timeout=15)
                    if event is None:
                        break
                    self.wfile.write(sse_frame(event))
                except Exception as exc:
                    if exc.__class__.__name__ == "Empty":
                        self.wfile.write(b": keepalive\n\n")
                    else:
                        raise
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            if subscriber is not None:
                AVATAR_EVENT_BUS.unsubscribe(subscriber)

    def send_cache_control(self, value: str) -> None:
        self._hermes_cache_control_sent = True
        self.send_header("Cache-Control", value)

    def end_headers(self):
        if not getattr(self, "_hermes_cache_control_sent", False):
            self.send_header("Cache-Control", "no-cache")
        self._hermes_cache_control_sent = False
        super().end_headers()


def main() -> int:
    os.chdir(ROOT)
    host = os.environ.get("PERSONAL_DISPLAY_BIND", DEFAULT_BIND_HOST)
    port = int(os.environ.get("PERSONAL_DISPLAY_PORT", "8770"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Hermes display server listening on {host}:{port} root={ROOT}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
