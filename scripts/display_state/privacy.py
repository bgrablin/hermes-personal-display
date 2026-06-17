"""Display-state scrub/redaction/safety policy."""
from __future__ import annotations

import re
from typing import Any

from avatar_event_bus import SECRET_PATTERNS

CURRENT_WORK_MAX_AGE_SECONDS = 4 * 60
AUGURY_MAX_ITEM_CHARS = 320
AUGURY_REDACTED_PLACEHOLDER = "[redacted]"
AUGURY_REDACTION_POLICY = "credentials_log_payloads_preserve_paths"

AUGURY_HARD_REDACT_PATTERNS: list[re.Pattern[str]] = [
    *SECRET_PATTERNS,
    # Augury is operator-only and intentionally keeps useful operational text,
    # including normal file paths. Redact raw payload-shaped fields that are
    # likely to contain prompts/log bodies, plus hard credential shapes below.
    re.compile(
        r"(?i)\b(?:raw[_-]?)?(?:prompt|messages?|tool[_-]?output|traceback|log[_-]?payload|payload|request[_-]?body|response[_-]?body|headers?)\s*[:=]\s*"
        r"(?:\{[^\n{}]{0,240}\}|\[[^\n\[\]]{0,240}\]|\"[^\n\"]{0,240}\"|'[^\n']{0,240}'|\S{12,})"
    ),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~\-+/=]{16,}\b"),
    re.compile(r"(?i)\bauthorization\s*[:=]\s*[^\s'\"]{12,}"),
    re.compile(r"(?i)\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret)\s+[A-Za-z0-9._~\-+/=]{12,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{2,}\.\.\.[A-Za-z0-9_-]{2,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{2,}\.\.\.[A-Za-z0-9_]{2,}\b"),
    re.compile(r"\b[A-Za-z0-9+/]{60,}={0,2}\b"),
]

SCRUB_RISKY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?i)(token|secret|password|api[_-]?key|authorization|bearer)\s*[:=]\s*\S+"),
    re.compile(r"(?i)(BEGIN|END) [A-Z ]*(PRIVATE KEY|TOKEN|CERTIFICATE)"),
    # Long base64-like encoded blobs are often logs, payloads, or secrets; hide them.
    re.compile(r"\b[A-Za-z0-9+/]{48,}={0,2}\b"),
    re.compile(r"(?:^|\s)(?:[A-Za-z]:\\|\\\\[\w.$-]+\\[\w.$-]+|~[/\\]|/[^\s]+|\.\.?[/\\][^\s]+|(?:[\w.-]+[/\\]){1,}[\w.-]+)"),
    re.compile(r"https?://[^\s?]+\?[^\s]*(?:token|secret|key|auth|signature|sig)=[^\s]+", re.I),
]

CURRENT_WORK_ALLOWED_KEYS = {
    "active", "state", "kind", "summary", "detail", "tool", "source",
    "visual_kind", "session_id", "session_label", "age_seconds",
    "valid_for_seconds", "expires_in_seconds",
}

CURRENT_WORK_FORBIDDEN_KEYS = {
    "prompt", "raw_prompt", "tool_output", "output", "path", "cwd", "tokens",
}


def augury_redact(text: str) -> str:
    """Mask hard credentials and payload-shaped fields while preserving useful operator text."""
    if not text:
        return ""
    redacted = str(text)
    for pattern in AUGURY_HARD_REDACT_PATTERNS:
        redacted = pattern.sub(AUGURY_REDACTED_PLACEHOLDER, redacted)
    return redacted


def ellipsize(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    if len(text) <= max_chars:
        return text
    if max_chars == 1:
        return "…"
    return text[: max_chars - 1].rstrip() + "…"


def augury_clean(text: str | None, max_chars: int = AUGURY_MAX_ITEM_CHARS) -> str:
    """Normalize whitespace, redact hard credentials, and bound length."""
    if text is None:
        return ""
    collapsed = re.sub(r"\s+", " ", str(text).replace("\r", " ").replace("\t", " ")).strip()
    if not collapsed:
        return ""
    return ellipsize(augury_redact(collapsed), max_chars)


def scrub(text: Any) -> str:
    text = str(text or "")
    if any(pattern.search(text) for pattern in SCRUB_RISKY_PATTERNS):
        return "[display-safe detail hidden]"
    text = re.sub(r"/home/[^/]+/[^\s]+", "~/…", text)
    return text.replace("\n", " ")


def clean_log_msg(text: Any, max_chars: int = 78) -> str:
    value = str(text or "").replace("\\n", " ").replace("\n", " ").replace("\\'", "'").replace('\\"', '"')
    value = scrub(value)
    value = re.sub(r"\s+", " ", value).strip(" '\"")
    return value[:max_chars]


def current_work_timing(age_seconds: Any, max_age_seconds: int = CURRENT_WORK_MAX_AGE_SECONDS) -> dict:
    """Return TTL metadata for display-safe current_work cards."""
    try:
        age = max(0, int(round(float(age_seconds))))
    except Exception:
        age = None
    expires_in = 0 if age is None else max(0, max_age_seconds - age)
    return {
        "valid_for_seconds": max_age_seconds,
        "expires_in_seconds": expires_in,
    }


def sanitize_current_work(work: dict, *, max_age_seconds: int = CURRENT_WORK_MAX_AGE_SECONDS) -> dict:
    """Keep backend current_work display-safe, allowlisted, and time-bounded."""
    safe = dict(work or {})
    for key in CURRENT_WORK_FORBIDDEN_KEYS:
        safe.pop(key, None)

    safe["summary"] = clean_log_msg(str(safe.get("summary") or "Working on the current request."), 86)
    safe["detail"] = clean_log_msg(str(safe.get("detail") or safe["summary"]), 86)
    safe["source"] = clean_log_msg(str(safe.get("source") or safe.get("session_label") or "Hermes session"), 48)
    if safe.get("session_label"):
        safe["session_label"] = clean_log_msg(str(safe.get("session_label")), 48)
    if safe.get("tool"):
        safe["tool"] = clean_log_msg(str(safe.get("tool")), 32)

    safe.update(current_work_timing(safe.get("age_seconds"), max_age_seconds))
    try:
        raw_age = safe.get("age_seconds")
        if raw_age is None:
            raise ValueError("no age")
        age = float(raw_age)
        if age > max_age_seconds and safe.get("active"):
            safe["active"] = False
            safe["state"] = "quiet_watch"
            safe["summary"] = "Quiet watch. No active turn is running."
            safe["detail"] = "Recent activity expired from the display-safe current work window."
            safe["expires_in_seconds"] = 0
    except Exception:
        pass

    return {key: value for key, value in safe.items() if key in CURRENT_WORK_ALLOWED_KEYS}
