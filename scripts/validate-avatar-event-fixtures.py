#!/usr/bin/env python3
"""Validate avatar event bus JSON fixtures.

This is a deliberately small, stdlib-only v0.1 contract checker. The validation
rules live in scripts/avatar_event_bus.py so fixtures, server publishing, and
smoke tests share one privacy gate.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from avatar_event_bus import ValidationError, fixture_paths, validate_event  # noqa: E402


def fail(path: Path, message: str) -> str:
    return f"{path.relative_to(ROOT)}: {message}"


def main() -> int:
    paths = fixture_paths(ROOT)
    if not paths:
        print(f"no avatar event fixtures found under {ROOT / 'tests' / 'fixtures' / 'avatar-events'}", file=sys.stderr)
        return 1

    errors: list[str] = []
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            validate_event(data)
        except json.JSONDecodeError as exc:
            errors.append(fail(path, f"invalid JSON: {exc}"))
        except ValidationError as exc:
            errors.append(fail(path, str(exc)))
        except Exception as exc:
            errors.append(fail(path, f"unexpected validation error: {exc.__class__.__name__}"))

    if errors:
        print("avatar event fixture validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"validated {len(paths)} avatar event fixture(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
