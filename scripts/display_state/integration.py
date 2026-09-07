"""Bounded private integration snapshots shared by the observer and display server."""

from __future__ import annotations

import json
import math
import os
import re
import time
from pathlib import Path

from display_state.privacy import augury_clean

TERMINAL = frozenset(
    {"completed", "failed", "interrupted", "error", "exited", "stalled", "cancelled"}
)
ACTIVE = frozenset({"running", "dispatched", "finalizing", "stalling"})
MAX_AGE = 20


def integration_dir():
    return Path(
        os.environ.get(
            "HERMES_DISPLAY_INTEGRATION_DIR",
            str(Path.home() / ".hermes/display/integration"),
        )
    )


def clean(value, depth=0):
    """Credential redaction precedes bounds; never render upstream values as HTML."""
    if depth > 12:
        return None
    if isinstance(value, str):
        return augury_clean(value, 800)
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, list):
        return [clean(v, depth + 1) for v in value[:64]]
    if isinstance(value, dict):
        return {
            augury_clean(k, 80): clean(v, depth + 1)
            for k, v in list(value.items())[:64]
            if not re.search(
                r"(?i)^(?:password|secret|api_key|authorization|cookie|access_token|refresh_token)$",
                str(k),
            )
        }
    return None


def write_snapshot(owner, snapshot, directory=None):
    directory = directory or integration_dir()
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / f"{owner}.json"
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        os.chmod(temporary, 0o600)
        json.dump(clean(snapshot), stream, allow_nan=False)
    temporary.replace(path)


def read_snapshots(directory=None, now=None):
    now = time.time() if now is None else now
    result = []
    directory = directory or integration_dir()
    try:
        paths = sorted(
            directory.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True
        )[:32]
    except OSError:
        paths = []
    for path in paths:
        try:
            if path.stat().st_size > 512_000:
                continue
            row = json.loads(path.read_text())
            if not isinstance(row, dict) or row.get("schema_version") != 1:
                continue
            age = max(0, now - float(row["observed_at"]))
            row = clean(row)
            row["age_seconds"] = round(age)
            row["fresh"] = age <= MAX_AGE
            result.append(row)
        except (OSError, ValueError, TypeError, KeyError):
            continue
    return {
        "schema_version": 1,
        "sources": result,
        "coverage": "observed" if result else "unavailable",
    }


def observed_work(snapshot):
    """Prefer observer evidence, including gaps and stale unsettled work, over log inference."""
    for source in snapshot["sources"]:
        if source.get("fresh") and source.get("dropped_events"):
            return {
                "active": False,
                "state": "unknown",
                "kind": "tool",
                "summary": "Observation gap; work outcome unknown",
                "detail": "Some lifecycle observations were lost",
                "source": "hermes_observer",
                "age_seconds": source["age_seconds"],
            }
        for session in source.get("sessions", []):
            pending = [
                p
                for p in session.get("processes", [])
                if p.get("status") not in TERMINAL
            ]
            units = [
                u
                for d in session.get("delegations", [])
                for u in d.get("units", [])
                if u.get("status") not in TERMINAL
            ]
            active = session.get("status") in ACTIVE or bool(pending or units)
            if not active:
                continue
            fresh = source["fresh"] and not source.get("dropped_events")
            summary = (
                "Command continuing in background"
                if pending
                else "Delegated work continuing"
                if units
                else "Hermes turn active"
            )
            if not fresh or any(p.get("status") == "unknown" for p in pending + units):
                summary = "Work outcome unknown; observation unavailable"
            return {
                "active": fresh
                and not any(p.get("status") == "unknown" for p in pending + units),
                "state": "active"
                if fresh
                and not any(p.get("status") == "unknown" for p in pending + units)
                else "unknown",
                "kind": "tool",
                "summary": summary,
                "detail": summary,
                "source": "hermes_observer",
                "session_id": session.get("session_id"),
                "age_seconds": source["age_seconds"],
                "valid_for_seconds": MAX_AGE,
                "expires_in_seconds": max(0, MAX_AGE - source["age_seconds"]),
            }
    for source in snapshot["sources"]:
        if not source["fresh"] or source.get("dropped_events"):
            continue
        for session in source.get("sessions", []):
            age = max(0, time.time() - session.get("last_event_at", 0))
            if session.get("status") in TERMINAL and age < 30:
                failed = (
                    session["status"] != "completed"
                    or any(
                        u.get("status") != "completed"
                        for d in session.get("delegations", [])
                        for u in d.get("units", [])
                    )
                    or any(
                        p.get("exit_code") not in (None, 0)
                        for p in session.get("processes", [])
                    )
                )
                summary = (
                    "Observed work ended with an error or interruption"
                    if failed
                    else "Observed turn and background work settled"
                )
                return {
                    "active": False,
                    "state": "failed" if failed else "recent_activity",
                    "kind": "tool",
                    "summary": summary,
                    "detail": summary,
                    "source": "hermes_observer",
                    "session_id": session["session_id"],
                    "age_seconds": age,
                }
    return None


def provider_telemetry(text):
    """Parse completed call telemetry without guessing absent usage or cache values."""
    rows = []
    pattern = re.compile(
        r"API call #(\d+): model=(.*?) provider=(\S+) in=(\d+|\?) out=(\d+|\?) total=(\d+|\?) latency=([\d.]+)s(.*)"
    )
    for line in text.splitlines():
        match = pattern.search(line)
        if not match:
            continue
        call, model, provider, inp, out, total, latency, suffix = match.groups()
        row = {
            "call": int(call),
            "model": model,
            "provider": provider,
            "input": None if inp == "?" else int(inp),
            "output": None if out == "?" else int(out),
            "total": None if total == "?" else int(total),
            "latency_seconds": float(latency),
        }
        for key, expr in [
            ("cache_read", r" cache=(\d+)/"),
            ("cache_write", r" write=(\d+)"),
        ]:
            found = re.search(expr, suffix)
            row[key] = int(found[1]) if found else None
        for key, expr in [
            ("response_id", r" id=(\S+)"),
            ("upstream", r" upstream=(.+)$"),
        ]:
            found = re.search(expr, suffix)
            row[key] = found[1] if found else None
        row["observation"] = line[: match.start()].strip()
        rows.append(clean(row))
    return rows[-8:]
