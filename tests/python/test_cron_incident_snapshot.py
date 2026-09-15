from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from display_state import collector


def write_incidents(home: Path, rows: list[tuple]) -> None:
    cron_dir = home / "cron"
    cron_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(cron_dir / "executions.db") as con:
        con.execute(
            """CREATE TABLE cron_incidents (
                 id TEXT PRIMARY KEY, job_id TEXT NOT NULL, state TEXT NOT NULL,
                 failure_type TEXT, first_seen_at TEXT, last_seen_at TEXT,
                 error TEXT, output_file TEXT
               )"""
        )
        con.executemany(
            "INSERT INTO cron_incidents VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows
        )


def test_cron_incidents_are_profile_scoped_named_and_credential_redacted(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc)
    profile = tmp_path / "profiles" / "silver"
    (profile / "cron").mkdir(parents=True)
    (profile / "cron" / "jobs.json").write_text(json.dumps({
        "jobs": [{"id": "job-1", "name": "Improve Hermes Display Screen"}]
    }), encoding="utf-8")
    write_incidents(profile, [
        ("inc-open", "job-1", "alerted", "provider", (now - timedelta(hours=2)).isoformat(),
         now.isoformat(), "provider failed token=actual-secret-value", "/home/brian/.hermes/cron/output/job-1/run.md"),
        ("inc-resolved", "job-1", "resolved", "provider", now.isoformat(), now.isoformat(),
         "already recovered", None),
    ])

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is True
    assert snapshot["open"] == 1
    assert snapshot["recent"] == 1
    assert len(snapshot["incidents"]) == 1
    incident = snapshot["incidents"][0]
    assert incident["profile"] == "silver"
    assert incident["job"] == "Improve Hermes Display Screen"
    assert incident["state"] == "alerted"
    assert "actual-secret-value" not in incident["error"]
    assert "[redacted]" in incident["error"]
    assert incident["output_file"].endswith("/cron/output/job-1/run.md")


def test_old_open_incident_remains_inspectable_without_recent_alert(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    old = datetime.now(timezone.utc) - timedelta(days=3)
    write_incidents(tmp_path, [
        ("inc-old", "job-old", "detected", "timeout", old.isoformat(), old.isoformat(),
         "request timed out", None),
    ])

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["open"] == 1
    assert snapshot["recent"] == 0
    assert snapshot["incidents"][0]["recent"] is False


def test_recent_count_is_not_limited_to_visible_incident_cards(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc)
    write_incidents(tmp_path, [
        (f"inc-{index}", f"job-{index}", "detected", "provider", now.isoformat(),
         (now - timedelta(minutes=index)).isoformat(), "provider unavailable", None)
        for index in range(collector.CRON_INCIDENT_LIMIT + 2)
    ])

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["open"] == collector.CRON_INCIDENT_LIMIT + 2
    assert snapshot["recent"] == collector.CRON_INCIDENT_LIMIT + 2
    assert len(snapshot["incidents"]) == collector.CRON_INCIDENT_LIMIT


def test_missing_incident_store_is_read_only_and_unavailable(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)

    snapshot = collector.cron_incident_snapshot()

    assert snapshot == {
        "available": False,
        "open": 0,
        "recent": 0,
        "summary": "0 open scheduler incidents",
        "incidents": [],
        "profiles_checked": 0,
        "read_errors": 0,
    }
    assert not (tmp_path / "cron").exists()
