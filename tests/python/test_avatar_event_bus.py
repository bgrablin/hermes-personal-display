from __future__ import annotations

import sys

import pytest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from avatar_event_bus import AvatarEventBus, ValidationError, validate_event  # noqa: E402


def sample_event(event_id: str = "evt-1") -> dict:
    return {
        "schema_version": "0.1.0",
        "id": event_id,
        "event": "assistant.started",
        "occurred_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "pytest",
        "boundary": "localhost_only",
        "privacy": "display_safe_intent",
        "ttl_ms": 1000,
        "priority": "normal",
        "display": {
            "intent": "assistant_active",
            "visual_kind": "reasoning",
            "glyph": "brain",
            "label": "display-safe test event",
            "side": "center",
            "intensity": 0.5,
        },
    }


def drain_until_close(subscriber, limit: int = 40) -> bool:
    for _ in range(limit):
        if subscriber.get_nowait() is None:
            return True
    return False


def test_event_id_rejects_crlf_sse_frame_injection() -> None:
    with pytest.raises(ValidationError, match='safe SSE id'):
        validate_event(sample_event('evt-1\nid: injected'))
    with pytest.raises(ValidationError, match='safe SSE id'):
        validate_event(sample_event('evt-1\r\nevent: injected'))


def test_full_slow_subscriber_is_closed_on_publish() -> None:
    bus = AvatarEventBus(max_subscribers=2)
    subscriber = bus.subscribe()
    for index in range(subscriber.maxsize):
        subscriber.put_nowait(sample_event(f"queued-{index}"))

    bus.publish(sample_event("new-event"))

    assert subscriber not in bus.subscribers
    assert drain_until_close(subscriber)


def test_subscriber_cap_eviction_closes_evicted_stream() -> None:
    bus = AvatarEventBus(max_subscribers=1)
    first = bus.subscribe()
    second = bus.subscribe()

    assert first not in bus.subscribers
    assert second in bus.subscribers
    assert first.get_nowait() is None
