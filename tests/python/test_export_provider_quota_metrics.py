"""Provider quota → Prometheus textfile exporter."""
from __future__ import annotations

import importlib.util
import json
import os
import stat
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "export_provider_quota_metrics", ROOT / "scripts/export_provider_quota_metrics.py"
)
assert SPEC and SPEC.loader
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


def artifact(**overrides):
    base = {
        "as_of_ms": 1_790_000_000_000,
        "active_provider_id": "anthropic",
        "providers": [
            {
                "id": "anthropic",
                "label": "CLAUDE",
                "tier_label": "MAX 5H/7D",
                "state": "confirmed",
                "headroom": 0.57,
                "secondary_headroom": 1.0,
                "reset_at_epoch_s": 1_790_005_000,
            },
            {
                "id": "xai-oauth",
                "label": "XAI",
                "tier_label": "PLUS WEEK",
                "state": "confirmed",
                "headroom": 0.0,
                "secondary_headroom": None,
                "reset_at_epoch_s": 1_790_073_210,
            },
            {
                "id": "opencode-go",
                "label": "OCGO",
                "tier_label": "GO",
                "state": "unknown",
                "headroom": None,
                "secondary_headroom": None,
                "reset_at_epoch_s": None,
            },
        ],
    }
    base.update(overrides)
    return base


def lines(body):
    return [line for line in body.splitlines() if line and not line.startswith("#")]


def primary_lines(body):
    """Only the primary (non-secondary) remaining-quota samples."""
    return [line for line in lines(body) if line.startswith("hermes_provider_quota_remaining_percent{")]


def test_confirmed_providers_publish_remaining_percent():
    body = exporter.render_textfile(artifact(), now=1_790_000_060.0)
    assert 'hermes_provider_quota_remaining_percent{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 57.0' in body
    assert 'hermes_provider_quota_remaining_percent{provider="xai-oauth",label="XAI",tier="plus_week"} 0.0' in body
    assert 'hermes_provider_quota_secondary_remaining_percent{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 100.0' in body


def test_unconfirmed_provider_publishes_no_percentage():
    body = exporter.render_textfile(artifact(), now=1_790_000_060.0)
    assert 'hermes_provider_quota_confirmed{provider="opencode-go",label="OCGO",tier="go"} 0' in body
    assert 'hermes_provider_quota_confirmed{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 1' in body
    assert 'provider="opencode-go"' not in "\n".join(primary_lines(body))


def test_rate_limited_source_exports_diagnostic_without_fabricating_quota():
    snapshot = artifact()
    claude = snapshot["providers"][0]
    claude.update(state="unknown", headroom=None, secondary_headroom=None, quota_source_state="rate_limited")
    body = exporter.render_textfile(snapshot, now=1_790_000_060.0)
    assert 'hermes_provider_quota_probe_rate_limited{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 1' in body
    assert 'provider="anthropic"' not in "\n".join(primary_lines(body))
    assert 'provider="anthropic"' not in "\n".join(
        line for line in lines(body) if line.startswith("hermes_provider_quota_secondary_remaining_percent{")
    )


@pytest.mark.parametrize("bad", [None, 1.5, -0.2, True, "57"])
def test_unusable_headroom_values_are_omitted(bad):
    snapshot = artifact()
    snapshot["providers"][0]["headroom"] = bad
    body = exporter.render_textfile(snapshot, now=1_790_000_060.0)
    assert 'provider="anthropic"' not in "\n".join(primary_lines(body))
    assert 'hermes_provider_quota_confirmed{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 1' in body


def test_active_provider_and_reset_and_age_are_published():
    body = exporter.render_textfile(artifact(), now=1_790_000_060.0)
    assert 'hermes_provider_route_rail_active{provider="anthropic",label="CLAUDE"} 1' in body
    assert 'hermes_provider_quota_reset_timestamp_seconds{provider="xai-oauth",label="XAI",tier="plus_week"} 1790073210' in body
    assert "hermes_provider_route_rail_observed_timestamp_seconds 1790000000" in body
    assert "hermes_provider_route_rail_age_seconds 60.0" in body
    assert "hermes_provider_quota_export_success 1" in body


def test_empty_provider_list_is_reported_as_failed_export():
    body = exporter.render_textfile({"as_of_ms": 1_790_000_000_000, "providers": []}, now=1_790_000_060.0)
    assert "hermes_provider_quota_export_success 0" in body


def test_labels_are_escaped():
    snapshot = artifact(providers=[{"id": 'we"ird\\id', "label": "line\nbreak", "tier_label": "", "state": "confirmed", "headroom": 0.5}])
    body = exporter.render_textfile(snapshot, now=1.0)
    assert 'provider="we\\"ird\\\\id"' in body
    assert 'label="line\\nbreak"' in body


def test_write_textfile_is_atomic_and_readable(tmp_path):
    destination = tmp_path / "sub" / "hermes_provider_quota.prom"
    exporter.write_textfile(exporter.render_textfile(artifact()), destination)
    assert destination.read_text(encoding="utf-8").startswith("# HELP hermes_provider_quota_remaining_percent")
    assert stat.S_IMODE(destination.stat().st_mode) == 0o644
    assert [p.name for p in destination.parent.iterdir()] == ["hermes_provider_quota.prom"]


def test_main_reports_missing_artifact_without_writing(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_ROUTE_RAIL_ARTIFACT", str(tmp_path / "absent.json"))
    destination = tmp_path / "out.prom"
    assert exporter.main([str(destination)]) == 1
    assert not destination.exists()


def test_main_writes_from_environment_paths(tmp_path, monkeypatch):
    source = tmp_path / "rail.json"
    source.write_text(json.dumps(artifact()), encoding="utf-8")
    destination = tmp_path / "out.prom"
    monkeypatch.setenv("HERMES_ROUTE_RAIL_ARTIFACT", str(source))
    assert exporter.main([str(destination)]) == 0
    body = destination.read_text(encoding="utf-8")
    assert 'hermes_provider_quota_remaining_percent{provider="anthropic",label="CLAUDE",tier="max_5h_7d"} 57.0' in body