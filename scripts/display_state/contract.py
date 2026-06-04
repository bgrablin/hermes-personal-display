"""Public display contract boundary.

Generated constants come from schemas/*.json and are shared with the browser via
src/generated/display-contract.js. Server collectors should emit only packets
that satisfy this boundary: display-safe state/events, no raw prompts/logs/tool
I/O, and no credentials.
"""
from __future__ import annotations

from generated.display_contract import (
    DISPLAY_CONTRACT_SCHEMAS,
    DISPLAY_PRESETS,
    DISPLAY_PRESET_LABELS,
    DISPLAY_PRESET_MOTION,
    OPTIC_MODE_BY_PRESET,
    OPTIC_STATE_BY_MODE,
)

DISPLAY_SAFETY_BOUNDARY = "local_trusted_display"
DISPLAY_REDACTION_LEVEL = "display_safe"

def apply_display_defaults(packet: dict) -> dict:
    """Attach contract defaults for a state_preset without widening sensitivity."""
    preset = str((packet or {}).get("state_preset") or "quiet_watch")
    defaults = DISPLAY_PRESETS.get(preset, DISPLAY_PRESETS["quiet_watch"])
    merged = dict(packet or {})
    merged.setdefault("mood", defaults["mood"])
    merged.setdefault("skin", defaults["skin"])
    merged.setdefault("state_label", defaults["label"])
    merged.setdefault("motion", dict(defaults["motion"]))
    merged.setdefault("safety", {
        "boundary": DISPLAY_SAFETY_BOUNDARY,
        "redaction_level": DISPLAY_REDACTION_LEVEL,
        "contains_credentials": False,
    })
    return merged

def assert_display_safe(packet: dict) -> None:
    safety = (packet or {}).get("safety") or {}
    if safety.get("contains_credentials") is not False:
        raise ValueError("display packet rejected: contains_credentials must be false")
    if safety.get("boundary") not in {None, DISPLAY_SAFETY_BOUNDARY}:
        raise ValueError("display packet rejected: invalid safety boundary")
