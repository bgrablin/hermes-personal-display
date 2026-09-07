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
