#!/usr/bin/env python3
"""Export provider route-rail headroom as a Prometheus textfile.

Reads the route-rail artifact and writes a node_exporter textfile so the
Sentinel Prometheus can report every provider's remaining quota. Providers
without a confirmed reading publish ``confirmed 0`` and no percentage: a
missing number is honest, a guessed one is not.
"""

from __future__ import annotations

import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_ARTIFACT = Path.home() / ".hermes/display/provider_route_rail.json"
DEFAULT_TEXTFILE = Path("/var/lib/node_exporter/textfile/hermes_provider_quota.prom")

METRIC_HELP = {
    "hermes_provider_quota_remaining_percent": "Share of the provider quota still available (0-100) from a confirmed reading.",
    "hermes_provider_quota_secondary_remaining_percent": "Share of the provider secondary (weekly) quota still available (0-100).",
    "hermes_provider_quota_confirmed": "1 when the provider quota reading is confirmed, 0 when inferred or unknown.",
    "hermes_provider_quota_probe_rate_limited": "1 when the quota metadata endpoint returned HTTP 429 and its probe is in cooldown; not a subscription-exhaustion signal.",
    "hermes_provider_quota_reset_timestamp_seconds": "Unix timestamp when the provider quota resets, when published.",
    "hermes_provider_route_rail_active": "1 for the provider currently selected on the route rail.",
    "hermes_provider_route_rail_observed_timestamp_seconds": "Unix timestamp of the route-rail snapshot these values came from.",
    "hermes_provider_route_rail_age_seconds": "Age in seconds of the route-rail snapshot at export time.",
    "hermes_provider_quota_export_success": "1 when the exporter wrote a complete provider snapshot.",
}


def _sanitize_label_value(value: str) -> str:
    """Escape a Prometheus label value."""
    return str(value).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _sanitize_label_name(value: str) -> str:
    """Coerce an artifact string into a stable lowercase label value."""
    cleaned = [ch if (ch.isalnum() or ch in "._-") else "_" for ch in str(value).strip().lower()]
    return "".join(cleaned) or "unknown"


def _percent(value: object) -> float | None:
    """Return a 0-100 percentage from a 0-1 headroom ratio, else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number) or number < 0.0 or number > 1.0:
        return None
    return round(number * 100.0, 2)


def _labels(pairs: list[tuple[str, str]]) -> str:
    rendered = ",".join(f'{name}="{_sanitize_label_value(value)}"' for name, value in pairs if value)
    return "{" + rendered + "}" if rendered else ""


def render_textfile(artifact: dict, now: float | None = None) -> str:
    """Render the Prometheus textfile body for one route-rail artifact."""
    now = time.time() if now is None else now
    lines: list[str] = []
    providers = artifact.get("providers")
    providers = providers if isinstance(providers, list) else []
    observed_ms = artifact.get("as_of_ms")
    observed_s = observed_ms / 1000.0 if isinstance(observed_ms, (int, float)) and observed_ms > 0 else None
    active = str(artifact.get("active_provider_id") or "")

    samples: dict[str, list[str]] = {name: [] for name in METRIC_HELP}
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        pid = str(provider.get("id") or "").strip()
        if not pid:
            continue
        base = [
            ("provider", pid),
            ("label", str(provider.get("label") or "")),
            ("tier", _sanitize_label_name(provider.get("tier_label") or "")),
        ]
        confirmed = str(provider.get("state") or "") == "confirmed"
        samples["hermes_provider_quota_confirmed"].append(f"hermes_provider_quota_confirmed{_labels(base)} {1 if confirmed else 0}")
        if not confirmed and provider.get("quota_source_state") == "rate_limited":
            samples["hermes_provider_quota_probe_rate_limited"].append(
                f"hermes_provider_quota_probe_rate_limited{_labels(base)} 1"
            )
        if confirmed:
            remaining = _percent(provider.get("headroom"))
            if remaining is not None:
                samples["hermes_provider_quota_remaining_percent"].append(
                    f"hermes_provider_quota_remaining_percent{_labels(base)} {remaining}"
                )
            secondary = _percent(provider.get("secondary_headroom"))
            if secondary is not None:
                samples["hermes_provider_quota_secondary_remaining_percent"].append(
                    f"hermes_provider_quota_secondary_remaining_percent{_labels(base)} {secondary}"
                )
        reset_at = provider.get("reset_at_epoch_s")
        if isinstance(reset_at, (int, float)) and not isinstance(reset_at, bool) and reset_at > 0:
            samples["hermes_provider_quota_reset_timestamp_seconds"].append(
                f"hermes_provider_quota_reset_timestamp_seconds{_labels(base)} {int(reset_at)}"
            )
        if pid == active:
            samples["hermes_provider_route_rail_active"].append(
                f"hermes_provider_route_rail_active{_labels([('provider', pid), ('label', str(provider.get('label') or ''))])} 1"
            )

    if observed_s is not None:
        samples["hermes_provider_route_rail_observed_timestamp_seconds"].append(
            f"hermes_provider_route_rail_observed_timestamp_seconds {int(observed_s)}"
        )
        samples["hermes_provider_route_rail_age_seconds"].append(
            f"hermes_provider_route_rail_age_seconds {max(0.0, round(now - observed_s, 1))}"
        )
    samples["hermes_provider_quota_export_success"].append(f"hermes_provider_quota_export_success {1 if providers else 0}")

    for name in METRIC_HELP:
        if not samples[name]:
            continue
        lines.append(f"# HELP {name} {METRIC_HELP[name]}")
        lines.append(f"# TYPE {name} gauge")
        lines.extend(samples[name])
    return "\n".join(lines) + "\n"


def write_textfile(body: str, destination: Path) -> None:
    """Write the textfile atomically so Prometheus never reads a partial scrape."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_path = tempfile.mkstemp(dir=str(destination.parent), prefix=".quota-", suffix=".prom")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            stream.write(body)
        os.chmod(temp_path, 0o644)
        os.replace(temp_path, destination)
    except BaseException:
        Path(temp_path).unlink(missing_ok=True)
        raise


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    artifact_path = Path(os.environ.get("HERMES_ROUTE_RAIL_ARTIFACT") or DEFAULT_ARTIFACT)
    textfile_path = Path(os.environ.get("HERMES_PROVIDER_QUOTA_TEXTFILE") or DEFAULT_TEXTFILE)
    if argv:
        textfile_path = Path(argv[0])
    try:
        artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
        if not isinstance(artifact, dict):
            raise ValueError("artifact is not an object")
    except Exception as exc:
        print(f"provider quota export: cannot read {artifact_path}: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    try:
        write_textfile(render_textfile(artifact), textfile_path)
    except Exception as exc:
        print(f"provider quota export: cannot write {textfile_path}: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(f"provider quota export: wrote {textfile_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())