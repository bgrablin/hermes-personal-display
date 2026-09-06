from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from display_state.collector import normalize_system_freshness  # noqa: E402


def test_absent_optional_pch_sensor_does_not_make_live_feed_stale() -> None:
    system, freshness = normalize_system_freshness(
        {
            "cpu": 0.06,
            "memory": 0.23,
            "temp_c": 61.0,
            "cpu_temp_c": 61.0,
            "pch_temp_c": None,
            "sensor_error": False,
        }
    )

    assert freshness == {
        "tier": "fresh",
        "valid_measurements": 4,
        "stale_measurements": [],
    }
    assert system["measurements"]["pch_temp_c"]["valid"] is False
    assert system["pch_temp_c"] is None
