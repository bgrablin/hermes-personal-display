#!/usr/bin/env python3
"""Display-safe avatar event validation and in-process event queue.

This module is intentionally stdlib-only. It is shared by the fixture validator,
the local display server, and smoke tests so the privacy gate stays consistent.
"""
from __future__ import annotations

import copy
import json
import queue
import re
import threading
from collections import deque
from datetime import datetime, timezone
from ipaddress import ip_address
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "0.1.0"
ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,96}$")
MAX_EVENT_BYTES = 2048
REPLAY_LIMIT = 100
MAX_SUBSCRIBERS = 16

EVENTS = {
    "assistant.started",
    "assistant.tool_started",
    "assistant.tool_finished",
    "assistant.waiting_on_user",
    "assistant.final_started",
    "assistant.final_complete",
    "system.display_recovered",
    "touch.tap",
    "touch.long_press",
    "feed.stale",
    "feed.lost",
    "feed.recovered",
}

INTENTS = {
    "assistant_active",
    "tool_active",
    "tool_settled",
    "waiting_on_user",
    "finalizing",
    "final_complete",
    "display_recovered",
    "touch_tap",
    "touch_long_press",
    "feed_stale",
    "feed_lost",
    "feed_recovered",
}

PRIORITIES = {"ambient", "normal", "attention", "recovery"}
VISUAL_KINDS = {
    "shell",
    "python",
    "reading",
    "searching",
    "patching",
    "writing",
    "planning",
    "reasoning",
    "recalling",
    "compressing",
    "touch",
    "feed",
    "recovery",
    "unknown",
}
GLYPHS = {
    "terminal",
    "python",
    "book",
    "search",
    "patch",
    "pen",
    "plan",
    "brain",
    "memory",
    "zip",
    "tap",
    "warning",
    "check",
    "none",
}
SIDES = {"left", "center", "right", "top", "bottom"}
TOOL_KINDS = {"shell", "python", "browser", "web", "file", "kanban", "home_assistant", "cron", "other"}
RESULTS = {"ok", "failed", "cancelled", "timeout", "unknown"}
FAILURE_KINDS = {"network", "timeout", "validation", "unavailable", "unknown"}
ALLOWED_META = {"tool_kind", "duration_ms", "result", "failure_kind", "feed_age_ms", "tap_count"}

SECRET_PATTERNS = [
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\b(bearer|token|api[_-]?key|password|passwd|secret|cookie)\b\s*[:=]\s*['\"]?[^\s'\"]{8,}"),
    re.compile(r"\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
]

DISPLAY_UNSAFE_PATTERNS = [
    # Absolute or home-relative paths. Keep display strings semantic, never raw filesystem context.
    re.compile(r"(^|\s)(?:/[A-Za-z0-9._~@+-][^\s]{1,}|~(?:/|\\)[^\s]+|[A-Za-z]:\\[^\s]+)"),
    # Relative path-shaped values, including extensionless project paths like docs/private.
    re.compile(r"(?i)\b[A-Za-z0-9._-]+(?:/|\\)[A-Za-z0-9._/\\-]+\b"),
    # Prompt/raw-response and chain-of-thought shaped snippets.
    re.compile(r"(?i)\b(system|developer|user|assistant)\s+prompt\b|\bprompt\s*[:=]|\bchain[-_ ]?of[-_ ]?thought\b|\bcot\s*[:=]"),
    # Log/traceback shaped text should stay in logs, not on the appliance display.
    re.compile(r"(?i)\b(traceback \(most recent call last\)|uncaught (?:type|reference|syntax)?error|exception\s*[:=]|(?:error|warn|info|debug)\s*[:=])"),
]

FORBIDDEN_KEYS = {
    "prompt",
    "chain_of_thought",
    "cot",
    "final_answer",
    "answer",
    "log",
    "logs",
    "traceback",
    "exception",
    "raw",
    "body",
    "message_body",
    "tool_output",
    "tool_input",
    "file_path",
    "env",
}

REQUIRED_FIELDS = {
    "schema_version",
    "id",
    "event",
    "occurred_at",
    "source",
    "boundary",
    "privacy",
    "ttl_ms",
    "priority",
    "display",
}
OPTIONAL_FIELDS = {"sequence", "correlation_id", "meta"}
ALLOWED_TOP_LEVEL_FIELDS = REQUIRED_FIELDS | OPTIONAL_FIELDS


def walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        out: list[str] = []
        for item in value:
            out.extend(walk_strings(item))
        return out
    if isinstance(value, dict):
        out: list[str] = []
        for key, item in value.items():
            out.append(str(key))
            out.extend(walk_strings(item))
        return out
    return []


def parse_rfc3339(value: str) -> datetime:
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError("timestamp must be RFC3339 string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return parsed.astimezone(timezone.utc)


def is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    value = host.strip().lower()
    if not value:
        return False
    if value.startswith("["):
        value = value.split("]", 1)[0].lstrip("[")
    elif ":" in value:
        value = value.rsplit(":", 1)[0]
    if value in {"localhost", "localhost.localdomain"}:
        return True
    try:
        return ip_address(value).is_loopback
    except ValueError:
        return False


def is_loopback_request(client_host: str | None, host_header: str | None) -> bool:
    try:
        client_ok = bool(client_host) and ip_address(str(client_host)).is_loopback
    except ValueError:
        client_ok = False
    return client_ok and is_loopback_host(host_header)


class ValidationError(ValueError):
    """Display-safe validation failure with a sanitized reason."""


def validation_errors(event: dict[str, Any], *, max_bytes: int = MAX_EVENT_BYTES) -> list[str]:
    errors: list[str] = []
    encoded_len = len(json.dumps(event, separators=(",", ":")).encode("utf-8"))
    if encoded_len > max_bytes:
        errors.append("body exceeds max size")

    missing = REQUIRED_FIELDS - event.keys()
    if missing:
        errors.append(f"missing required fields: {sorted(missing)}")

    unknown_top = set(event.keys()) - ALLOWED_TOP_LEVEL_FIELDS
    if unknown_top:
        errors.append(f"unknown top-level fields: {sorted(str(key) for key in unknown_top)}")

    lower_keys = {str(key).lower() for key in event.keys()}
    forbidden_top = lower_keys & FORBIDDEN_KEYS
    if forbidden_top:
        errors.append(f"forbidden top-level keys: {sorted(forbidden_top)}")

    if "sequence" in event and not isinstance(event["sequence"], int):
        errors.append("sequence must be an integer when present")

    if "correlation_id" in event:
        correlation_id = event["correlation_id"]
        if not isinstance(correlation_id, str) or not 1 <= len(correlation_id) <= 80:
            errors.append("correlation_id must be 1..80 chars when present")

    if event.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version must be {SCHEMA_VERSION}")
    event_id = event.get("id")
    if not isinstance(event_id, str) or not ID_PATTERN.fullmatch(event_id):
        errors.append("id must be 1..96 safe SSE id chars")
    if event.get("event") not in EVENTS:
        errors.append(f"event not allowlisted: {event.get('event')!r}")
    if not isinstance(event.get("source"), str) or not 1 <= len(event.get("source", "")) <= 80:
        errors.append("source must be 1..80 chars")
    if event.get("boundary") != "localhost_only":
        errors.append("boundary must be localhost_only")
    if event.get("privacy") != "display_safe_intent":
        errors.append("privacy must be display_safe_intent")
    if event.get("priority") not in PRIORITIES:
        errors.append(f"priority not allowlisted: {event.get('priority')!r}")
    if not isinstance(event.get("ttl_ms"), int) or not 250 <= event.get("ttl_ms", 0) <= 300000:
        errors.append("ttl_ms must be integer 250..300000")

    occurred_at = event.get("occurred_at")
    try:
        if not isinstance(occurred_at, str):
            raise ValueError("timestamp must be string")
        parse_rfc3339(occurred_at)
    except Exception:
        errors.append("occurred_at must be RFC3339 with timezone")

    display = event.get("display")
    if not isinstance(display, dict):
        errors.append("display must be an object")
    else:
        unknown_display = set(display) - {"intent", "label", "visual_kind", "glyph", "intensity", "side"}
        if unknown_display:
            errors.append(f"unknown display fields: {sorted(unknown_display)}")
        if display.get("intent") not in INTENTS:
            errors.append(f"display.intent not allowlisted: {display.get('intent')!r}")
        label = display.get("label")
        if not isinstance(label, str) or not 1 <= len(label) <= 48:
            errors.append("display.label must be 1..48 chars")
        if "visual_kind" in display and display["visual_kind"] not in VISUAL_KINDS:
            errors.append(f"visual_kind not allowlisted: {display['visual_kind']!r}")
        if "glyph" in display and display["glyph"] not in GLYPHS:
            errors.append(f"glyph not allowlisted: {display['glyph']!r}")
        if "side" in display and display["side"] not in SIDES:
            errors.append(f"side not allowlisted: {display['side']!r}")
        if "intensity" in display:
            intensity = display["intensity"]
            if not isinstance(intensity, (int, float)) or not 0 <= intensity <= 1:
                errors.append("display.intensity must be 0..1")

    meta = event.get("meta", {})
    if "meta" in event and meta is None:
        errors.append("meta must be an object when present")
    elif meta is not None:
        if not isinstance(meta, dict):
            errors.append("meta must be an object when present")
        else:
            unknown = set(meta) - ALLOWED_META
            if unknown:
                errors.append(f"unknown meta fields: {sorted(unknown)}")
            lower_meta_keys = {str(key).lower() for key in meta.keys()}
            forbidden_meta = lower_meta_keys & FORBIDDEN_KEYS
            if forbidden_meta:
                errors.append(f"forbidden meta keys: {sorted(forbidden_meta)}")
            if "tool_kind" in meta and meta["tool_kind"] not in TOOL_KINDS:
                errors.append(f"meta.tool_kind not allowlisted: {meta['tool_kind']!r}")
            if "result" in meta and meta["result"] not in RESULTS:
                errors.append(f"meta.result not allowlisted: {meta['result']!r}")
            if "failure_kind" in meta and meta["failure_kind"] not in FAILURE_KINDS:
                errors.append(f"meta.failure_kind not allowlisted: {meta['failure_kind']!r}")
            for key in ("duration_ms", "feed_age_ms"):
                if key in meta and (not isinstance(meta[key], int) or meta[key] < 0):
                    errors.append(f"meta.{key} must be non-negative integer")
            if "tap_count" in meta and (not isinstance(meta["tap_count"], int) or not 1 <= meta["tap_count"] <= 5):
                errors.append("meta.tap_count must be integer 1..5")

    for text in walk_strings(event):
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors.append("credential-shaped string detected")
                return errors
        for pattern in DISPLAY_UNSAFE_PATTERNS:
            if pattern.search(text):
                errors.append("display-unsafe string detected")
                return errors

    return errors


def validate_event(event: dict[str, Any], *, max_bytes: int = MAX_EVENT_BYTES) -> dict[str, Any]:
    if not isinstance(event, dict):
        raise ValidationError("event root must be an object")
    errors = validation_errors(event, max_bytes=max_bytes)
    if errors:
        raise ValidationError(errors[0])
    safe = copy.deepcopy(event)
    safe["occurred_at"] = parse_rfc3339(safe["occurred_at"]).isoformat().replace("+00:00", "Z")
    safe["ttl_ms"] = max(250, min(300000, int(safe["ttl_ms"])))
    if "intensity" in safe["display"]:
        safe["display"]["intensity"] = max(0.0, min(1.0, float(safe["display"]["intensity"])))
    return safe


def load_event_json(raw: bytes) -> dict[str, Any]:
    if len(raw) > MAX_EVENT_BYTES:
        raise ValidationError("body exceeds max size")
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ValidationError("invalid JSON") from exc
    return validate_event(data)


class AvatarEventBus:
    def __init__(self, replay_limit: int = REPLAY_LIMIT, max_subscribers: int = MAX_SUBSCRIBERS) -> None:
        self.replay: deque[dict[str, Any]] = deque(maxlen=replay_limit)
        self.subscribers: set[queue.Queue[Any]] = set()
        self.max_subscribers = max(1, int(max_subscribers))
        self.lock = threading.Lock()
        self.accepted = 0
        self.dropped = 0
        self.last_rejection = ""

    def publish(self, event: dict[str, Any]) -> dict[str, Any]:
        try:
            safe = validate_event(event)
        except ValidationError as exc:
            with self.lock:
                self.dropped += 1
                self.last_rejection = str(exc)
            raise
        with self.lock:
            self.accepted += 1
            self.replay.append(safe)
            subscribers = list(self.subscribers)
        stale_subscribers: list[queue.Queue[Any]] = []
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(safe)
            except queue.Full:
                stale_subscribers.append(subscriber)
        if stale_subscribers:
            for subscriber in stale_subscribers:
                self._signal_close(subscriber)
            with self.lock:
                for subscriber in stale_subscribers:
                    self.subscribers.discard(subscriber)
        return safe

    @staticmethod
    def _signal_close(subscriber: queue.Queue[Any]) -> None:
        """Tell a subscriber stream to close so EventSource reconnects."""
        attempts = max(1, getattr(subscriber, "maxsize", 1) or 1) + 1
        for _ in range(attempts):
            try:
                subscriber.put_nowait(None)
                return
            except queue.Full:
                try:
                    subscriber.get_nowait()
                except queue.Empty:
                    return

    def record_drop(self, reason: str) -> None:
        with self.lock:
            self.dropped += 1
            self.last_rejection = str(reason or "invalid_event")[:120]

    def subscribe(self) -> queue.Queue[Any]:
        subscriber: queue.Queue[Any] = queue.Queue(maxsize=25)
        evicted: queue.Queue[Any] | None = None
        with self.lock:
            if len(self.subscribers) >= self.max_subscribers:
                evicted = max(self.subscribers, key=lambda item: item.qsize(), default=None)
                if evicted is not None:
                    self.subscribers.discard(evicted)
            self.subscribers.add(subscriber)
            replay = list(self.replay)[-25:]
        if evicted is not None:
            self._signal_close(evicted)
        for event in replay:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                break
        return subscriber

    def unsubscribe(self, subscriber: queue.Queue[dict[str, Any]]) -> None:
        with self.lock:
            self.subscribers.discard(subscriber)

    def health(self) -> dict[str, Any]:
        with self.lock:
            return {
                "ok": True,
                "schema_version": SCHEMA_VERSION,
                "boundary": "localhost_only",
                "accepted": self.accepted,
                "dropped": self.dropped,
                "last_rejection": self.last_rejection,
                "replay_depth": len(self.replay),
                "subscribers": len(self.subscribers),
            }


def sse_frame(event: dict[str, Any]) -> bytes:
    payload = json.dumps(event, separators=(",", ":"))
    name = event.get("event", "message")
    event_id = event.get("id", "")
    return f"event: {name}\nid: {event_id}\ndata: {payload}\n\n".encode("utf-8")


def fixture_paths(root: Path) -> list[Path]:
    return sorted((root / "tests" / "fixtures" / "avatar-events").glob("*.json"))
