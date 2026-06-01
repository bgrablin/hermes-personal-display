#!/usr/bin/env python3
"""Smoke checks for the local avatar event bus contract and loopback endpoint."""
from __future__ import annotations

import copy
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from avatar_event_bus import ValidationError, fixture_paths, is_loopback_request, validate_event  # noqa: E402


def expect_invalid(event: dict, label: str) -> None:
    try:
        validate_event(event)
    except ValidationError:
        return
    raise SystemExit(f"FAIL {label} was accepted")


def make_invalid_events(valid_event: dict) -> list[tuple[str, dict]]:
    bad_secret = copy.deepcopy(valid_event)
    bad_secret["display"]["label"] = "token=" + "abcdefghijklm" + "nopqrstuvwxyz123456"

    bad_boundary = copy.deepcopy(valid_event)
    bad_boundary["boundary"] = "lan"

    bad_unknown_top = copy.deepcopy(valid_event)
    bad_unknown_top["private_doc"] = "meeting notes"

    bad_sequence = copy.deepcopy(valid_event)
    bad_sequence["sequence"] = "1"

    bad_correlation_overlong = copy.deepcopy(valid_event)
    bad_correlation_overlong["correlation_id"] = "c" * 81

    bad_correlation_secret = copy.deepcopy(valid_event)
    bad_correlation_secret["correlation_id"] = "token=" + "abcdefghijklm" + "nopqrstuvwxyz123456"

    bad_path_label = copy.deepcopy(valid_event)
    bad_path_label["display"]["label"] = "/home/agent/private/file.txt"

    bad_relative_path_label = copy.deepcopy(valid_event)
    bad_relative_path_label["display"]["label"] = "logs/hermes-debug.log"

    bad_extensionless_relative_path_label = copy.deepcopy(valid_event)
    bad_extensionless_relative_path_label["display"]["label"] = "docs/private"

    bad_nested_extensionless_relative_path_label = copy.deepcopy(valid_event)
    bad_nested_extensionless_relative_path_label["display"]["label"] = "src/private/config"

    bad_windows_path_label = copy.deepcopy(valid_event)
    bad_windows_path_label["display"]["label"] = r"C:\\Users\\Operator\\secret.txt"

    bad_prompt_label = copy.deepcopy(valid_event)
    bad_prompt_label["display"]["label"] = "user prompt: private task"

    bad_log_label = copy.deepcopy(valid_event)
    bad_log_label["display"]["label"] = "ERROR: private failure"

    bad_path_source = copy.deepcopy(valid_event)
    bad_path_source["source"] = "src/private.py"

    bad_extensionless_path_source = copy.deepcopy(valid_event)
    bad_extensionless_path_source["source"] = "docs/private"

    return [
        ("secret-shaped label", bad_secret),
        ("non-local boundary", bad_boundary),
        ("unknown top-level private_doc", bad_unknown_top),
        ("string sequence", bad_sequence),
        ("overlong correlation_id", bad_correlation_overlong),
        ("unsafe correlation_id", bad_correlation_secret),
        ("path-like display label", bad_path_label),
        ("relative path display label", bad_relative_path_label),
        ("extensionless relative path display label", bad_extensionless_relative_path_label),
        ("nested extensionless relative path display label", bad_nested_extensionless_relative_path_label),
        ("windows path display label", bad_windows_path_label),
        ("prompt-like display label", bad_prompt_label),
        ("log-like display label", bad_log_label),
        ("path-like display-safe source", bad_path_source),
        ("extensionless path-like display-safe source", bad_extensionless_path_source),
    ]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request_json(url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Host": "127.0.0.1"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        return exc.code, json.loads(body) if body else {}


def wait_for_health(base: str) -> None:
    deadline = time.time() + 8
    last = None
    while time.time() < deadline:
        try:
            status, payload = request_json(f"{base}/avatar-events/health")
            if status == 200 and payload.get("ok"):
                return
        except Exception as exc:  # pragma: no cover - diagnostic path only
            last = exc
        time.sleep(0.15)
    raise SystemExit(f"FAIL avatar event health endpoint unavailable: {last}")


def main() -> int:
    fixtures = fixture_paths(ROOT)
    if not fixtures:
        raise SystemExit("FAIL no avatar event fixtures found")

    valid_event = json.loads(fixtures[0].read_text(encoding="utf-8"))
    validate_event(valid_event)
    invalid_events = make_invalid_events(valid_event)
    for label, invalid_event in invalid_events:
        expect_invalid(invalid_event, label)

    if not is_loopback_request("127.0.0.1", "127.0.0.1"):
        raise SystemExit("FAIL loopback request rejected")
    if is_loopback_request("203.0.113.20", "203.0.113.20"):
        raise SystemExit("FAIL LAN request accepted")

    port = free_port()
    env = os.environ.copy()
    env["PERSONAL_DISPLAY_BIND"] = "127.0.0.1"
    env["PERSONAL_DISPLAY_PORT"] = str(port)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts" / "hermes_display_server.py")],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        base = f"http://127.0.0.1:{port}"
        wait_for_health(base)
        status, payload = request_json(f"{base}/avatar-events/publish", valid_event)
        if status != 202 or payload.get("event") != valid_event["event"]:
            raise SystemExit(f"FAIL valid publish returned {status}: {payload}")
        for label, invalid_event in invalid_events:
            status, payload = request_json(f"{base}/avatar-events/publish", invalid_event)
            if status != 400 or payload.get("error") != "invalid_event":
                raise SystemExit(f"FAIL invalid publish accepted {label}: {status}: {payload}")
        status, payload = request_json(f"{base}/avatar-events/health")
        if payload.get("accepted", 0) < 1 or payload.get("dropped", 0) < len(invalid_events):
            raise SystemExit(f"FAIL health counters not updated: {payload}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=4)
        except subprocess.TimeoutExpired:
            proc.kill()

    print(f"OK avatar event bus smoke checks fixtures={len(fixtures)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
