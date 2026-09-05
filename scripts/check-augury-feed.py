#!/usr/bin/env python3
"""Smoke checks for the /api/augury-feed builder and hard-credential redaction.

Exercises augury helpers directly with a synthetic agent.log so the test is
hermetic (no dependency on the live ~/.hermes/logs directory). Verifies:

  * prompt / tool / thinking / log item extraction
  * narrow Augury credential redaction
  * response bounds (limit, minutes, item char cap, schema metadata)
  * normal prompt/log text survives so the overlay is visually useful
"""
from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import hermes_display_server as srv  # noqa: E402


FAILURES: list[str] = []


def expect(condition: bool, label: str) -> None:
    if not condition:
        FAILURES.append(label)
        print(f"FAIL {label}")
    else:
        print(f"  ok   {label}")


def ts(seconds_ago: int, base: datetime | None = None) -> str:
    base = base or datetime.now()
    return (base - timedelta(seconds=seconds_ago)).strftime("%Y-%m-%d %H:%M:%S")


def write_synthetic_log(path: Path) -> None:
    lines = [
        # Real conversation prompt — text should pass through.
        f'{ts(20)} INFO [20260523_120000_aaaa] agent.conversation_loop: '
        f'conversation turn: session=20260523_120000_aaaa platform=cli '
        f'msg="refactor the OAuth middleware so we can drop legacy bearer tokens"',
        # Tool execution line.
        f'{ts(18)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        f'tool search_files completed (0.18s, 1234 chars)',
        # API call line — should become "thinking".
        f'{ts(15)} INFO [20260523_120000_aaaa] agent.conversation_loop: '
        f'API call #7: model=gpt-5.5 provider=openai-codex in=1024 out=64 latency=2.1s',
        # Warning log — should become "log".
        f'{ts(12)} WARNING [20260523_120000_aaaa] agent.tool_executor: '
        f'Tool terminal returned error (0.4s): subprocess timed out',
        # Credential-leaking prompt: hard credential must be redacted, rest kept.
        f'{ts(8)} INFO [20260523_120000_aaaa] agent.conversation_loop: '
        f'conversation turn: session=20260523_120000_aaaa platform=telegram '
        'msg="my token is ' + 'sk-' + 'aaa...4455 please dont leak"',
        # Bearer in a tool line.
        f'{ts(5)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        'tool web_search completed (Authorization: Bearer ' + 'abcdef...cdef sent)',
        # GitHub PAT shape.
        f'{ts(3)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        'tool terminal completed gh ' + 'ghp_' + 'aa...iiii pushed branch',
        # Long base64-like blob.
        f'{ts(2)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        f'tool patch completed payload={"x" * 80}',
        # Recent normal log line that should survive intact.
        f'{ts(1)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        f'tool read_file completed (0.05s, 240 chars)',
        # Normal paths are useful operator context and should survive Augury.
        f'{ts(1)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        f'tool read_file completed /home/brian/.hermes/projects/personal-display/src/state.js',
        # Ordinary structured results are useful private operator context.
        f'{ts(4)} INFO [20260523_120000_aaaa] agent.tool_executor: '
        f'tool terminal completed payload={{"role":"user","content":"hi"}}',
        # Old line outside the minutes window — must NOT appear when minutes=2.
        f'{ts(60 * 60)} INFO [20260523_100000_bbbb] agent.tool_executor: '
        f'tool terminal completed ancient activity',
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_extraction_checks(log: Path) -> None:
    feed = srv.build_augury_feed(limit=20, minutes=30, log_path=log)
    expect(feed["schema_version"] == "0.1.0", "schema_version is 0.1.0")
    expect(feed["boundary"] == "home_private_lan", "boundary is home_private_lan")
    expect(feed["sensitivity"] == "home_private_redacted", "sensitivity is home_private_redacted")
    expect("generated_at" in feed and bool(feed["generated_at"]), "generated_at present")
    expect(feed["valid_for_seconds"] >= 1, "valid_for_seconds positive")

    policy = feed.get("policy") or {}
    expect(policy.get("purpose") == "ambient_log_visualization", "policy.purpose set")
    expect(policy.get("redaction") == "credentials_only_private_operator", "policy.redaction set")
    expect(policy.get("limit") == 20, "policy.limit echoes request")
    expect(policy.get("minutes") == 30, "policy.minutes echoes request")
    expect(policy.get("max_item_chars") == srv.AUGURY_MAX_ITEM_CHARS, "policy.max_item_chars matches constant")
    expect("current_work" in feed, "current_work present in feed")

    items = feed["items"]
    kinds = {item["kind"] for item in items}
    expect("prompt" in kinds, "prompt items extracted")
    expect("tool" in kinds, "tool items extracted")
    expect("thinking" in kinds, "thinking items extracted (API call)")
    expect("log" in kinds, "log items extracted (warning)")

    for item in items:
        for key in ("kind", "source", "timestamp", "age_seconds", "title", "text"):
            expect(key in item, f"item has {key} field")
        expect(len(item["text"]) <= srv.AUGURY_MAX_ITEM_CHARS, "item text within max_item_chars")
        expect(item["source"] == "agent.log", "item source labels agent.log")


def run_redaction_checks(log: Path) -> None:
    feed = srv.build_augury_feed(limit=25, minutes=30, log_path=log)
    blob = " ".join(item["text"] for item in feed["items"])

    expect(('sk-' + 'aaa...4455') not in blob, "raw sk- API key not present")
    expect("abcdef0123456789abcdef" not in blob, "raw bearer secret not present")
    expect(('ghp_' + 'aa...iiii') not in blob, "raw GitHub PAT not present")
    expect("[redacted]" in blob, "[redacted] placeholder appears at least once")
    expect("payload" in blob.lower(), "private operator payload context preserved")
    expect("role" in blob and "content" in blob, "ordinary structured results preserved")

    # Normal text must survive so the overlay is visually useful.
    expect("OAuth middleware" in blob, "normal prompt text preserved")
    expect("subprocess timed out" in blob, "normal warning text preserved")
    expect("search_files completed" in blob, "tool activity text preserved")
    expect("/home/brian/.hermes/projects/personal-display/src/state.js" in blob, "normal file path preserved")

    # JWT shape direct redaction.
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb"
    expect("[redacted]" in srv.augury_clean(f"jwt={jwt}"), "JWT-shaped string redacted")

    # Private key block redaction.
    expect("[redacted]" in srv.augury_clean("-----BEGIN " + "RSA PRIVATE KEY-----"), "private key block redacted")

    # Long strings alone are not evidence of a credential.
    base64_blob = "A" * 72
    expect(base64_blob in srv.augury_clean(f"data={base64_blob}"), "long ordinary identifiers are not assumed credentials")


def run_bounds_checks(log: Path) -> None:
    # Clamp oversize limit / minutes requests.
    clamped = srv.build_augury_feed(limit=999, minutes=999999, log_path=log)
    expect(clamped["policy"]["limit"] == srv.AUGURY_MAX_LIMIT, "limit clamps to AUGURY_MAX_LIMIT")
    expect(clamped["policy"]["minutes"] == srv.AUGURY_MAX_MINUTES, "minutes clamps to AUGURY_MAX_MINUTES")

    # Garbage limit/minutes -> fall back to defaults.
    fallback = srv.build_augury_feed(limit="banana", minutes=None, log_path=log)
    expect(fallback["policy"]["limit"] == srv.AUGURY_DEFAULT_LIMIT, "non-numeric limit falls back to default")
    expect(fallback["policy"]["minutes"] == srv.AUGURY_DEFAULT_MINUTES, "non-numeric minutes falls back to default")

    # minutes=1 should drop the line we wrote 60 minutes ago.
    narrow = srv.build_augury_feed(limit=25, minutes=1, log_path=log)
    expect(
        all("ancient activity" not in item["text"] for item in narrow["items"]),
        "minutes window excludes old lines",
    )

    # limit=3 caps item count.
    tiny = srv.build_augury_feed(limit=3, minutes=30, log_path=log)
    expect(len(tiny["items"]) <= 3, "limit caps returned items")
    expect(tiny["policy"]["limit"] == 3, "policy.limit echoes the clamped request")

    # max_item_chars enforced when a single line exceeds the cap.
    long_line_text = "msg=" + ("x " * 400)
    long_clean = srv.augury_clean(long_line_text, srv.AUGURY_MAX_ITEM_CHARS)
    expect(len(long_clean) <= srv.AUGURY_MAX_ITEM_CHARS, "augury_clean enforces max_item_chars")
    expect(long_clean.endswith("…"), "augury_clean ellipsizes when truncating")


def run_metadata_checks(log: Path) -> None:
    # Item from a conversation line should expose the prompt message, not the raw log.
    feed = srv.build_augury_feed(limit=25, minutes=30, log_path=log)
    prompt_items = [item for item in feed["items"] if item["kind"] == "prompt"]
    expect(len(prompt_items) >= 1, "at least one prompt item")
    expect(
        any("OAuth middleware" in item["text"] for item in prompt_items),
        "prompt item text contains the human message body",
    )
    expect(
        all(item.get("session_id", "") and len(item["session_id"]) <= 64 for item in prompt_items),
        "prompt items carry a bounded session_id",
    )

    tool_items = [item for item in feed["items"] if item["kind"] == "tool"]
    expect(len(tool_items) >= 1, "at least one tool item")
    expect(
        any("search_files" in item["title"] or "search_files" in item["text"] for item in tool_items),
        "tool item references the real tool name",
    )

    current_work = feed["current_work"]
    for key in ("active", "kind", "summary", "detail", "session_id", "session_label", "age_seconds"):
        expect(key in current_work, f"current_work has {key}")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        log = Path(tmp) / "agent.log"
        write_synthetic_log(log)
        run_extraction_checks(log)
        run_redaction_checks(log)
        run_bounds_checks(log)
        run_metadata_checks(log)

    if FAILURES:
        print(f"FAIL augury feed checks: {len(FAILURES)} failure(s)")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print("OK augury feed smoke checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
