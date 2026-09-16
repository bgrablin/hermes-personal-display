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
         now.isoformat(), "provider failed token=actual-secret-value", "/srv/hermes/.hermes/cron/output/job-1/run.md"),
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
        "summary": "Scheduler incident data unavailable",
        "incidents": [],
        "profiles_checked": 0,
        "read_errors": 0,
        "profiles_truncated": False,
        "discovery_error": False,
    }
    assert not (tmp_path / "cron").exists()


def test_pre_incident_database_is_unavailable_not_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir(parents=True)
    with sqlite3.connect(cron_dir / "executions.db") as con:
        con.execute("CREATE TABLE cron_executions (id TEXT PRIMARY KEY)")

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["summary"] == "Scheduler incident data unavailable"


def test_one_unreadable_profile_suppresses_partial_totals(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    broken = tmp_path / "profiles" / "broken" / "cron"
    broken.mkdir(parents=True)
    (broken / "executions.db").write_text("not sqlite", encoding="utf-8")

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["open"] == 0
    assert snapshot["recent"] == 0
    assert snapshot["incidents"] == []
    assert snapshot["read_errors"] == 1


def test_symlinked_profile_store_fails_closed_without_cross_profile_reads(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    external = tmp_path / "outside-profile"
    write_incidents(external, [
        ("inc-external", "job-external", "detected", "provider", now, now,
         "must not be read", None),
    ])
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "silver").symlink_to(external, target_is_directory=True)

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["open"] == 0
    assert snapshot["incidents"] == []
    assert snapshot["discovery_error"] is True
    assert "inc-external" not in json.dumps(snapshot)


def test_symlinked_cron_directory_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    external = tmp_path / "outside-cron"
    write_incidents(external, [
        ("inc-external", "job-external", "detected", "provider", now, now,
         "must not be read", None),
    ])
    profile = tmp_path / "profiles" / "silver"
    profile.mkdir(parents=True)
    (profile / "cron").symlink_to(external / "cron", target_is_directory=True)

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["read_errors"] == 1
    assert snapshot["open"] == 0
    assert "inc-external" not in json.dumps(snapshot)


def test_symlinked_database_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    external = tmp_path / "outside-db"
    write_incidents(external, [
        ("inc-external", "job-external", "detected", "provider", now, now,
         "must not be read", None),
    ])
    cron_dir = tmp_path / "cron"
    cron_dir.mkdir(parents=True)
    (cron_dir / "executions.db").symlink_to(external / "cron" / "executions.db")

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["read_errors"] == 1
    assert snapshot["open"] == 0
    assert "inc-external" not in json.dumps(snapshot)


def test_symlinked_job_manifest_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    external_jobs = tmp_path / "outside-jobs.json"
    external_jobs.write_text(json.dumps({"jobs": [{"id": "job-default", "name": "private name"}]}), encoding="utf-8")
    (tmp_path / "cron" / "jobs.json").symlink_to(external_jobs)

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["read_errors"] == 1
    assert snapshot["open"] == 0


def test_profile_enumeration_overflow_fails_closed_before_sorting(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    for index in range(collector.CRON_PROFILE_LIMIT + 1):
        (profiles / f"profile-{index:02d}").mkdir()

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["open"] == 0
    assert snapshot["incidents"] == []
    assert snapshot["profiles_truncated"] is True
    assert snapshot["discovery_error"] is False


def test_profile_discovery_error_fails_closed_for_malformed_entry(tmp_path, monkeypatch):
    monkeypatch.setattr(collector, "HERMES_HOME", tmp_path)
    now = datetime.now(timezone.utc).isoformat()
    write_incidents(tmp_path, [
        ("inc-default", "job-default", "detected", "provider", now, now,
         "provider unavailable", None),
    ])
    profiles = tmp_path / "profiles"
    profiles.mkdir()
    (profiles / "not-a-profile").write_text("malformed profile entry", encoding="utf-8")

    snapshot = collector.cron_incident_snapshot()

    assert snapshot["available"] is False
    assert snapshot["open"] == 0
    assert snapshot["discovery_error"] is True
