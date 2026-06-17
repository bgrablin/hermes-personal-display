"""logs, kanban, gateway, telemetry collectors.

Compatibility shim created to make the display-server application boundary explicit.
Move code here incrementally; keep hermes_display_server.py as HTTP routing only.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
from contextlib import closing
from pathlib import Path

from display_state.privacy import clean_log_msg

HERMES_HOME = Path.home() / ".hermes"
KANBAN_BOARD = os.environ.get("HERMES_DISPLAY_KANBAN_BOARD", "hermes-personal-display")
KANBAN_DB = HERMES_HOME / "kanban" / "boards" / KANBAN_BOARD / "kanban.db"
LEGACY_KANBAN_DB = HERMES_HOME / "kanban.db"

FRESHNESS_ORDER = {"fresh": 0, "aging": 1, "stale": 2, "lost": 3}
MEASUREMENT_KEYS = ("cpu", "memory", "temp_c", "cpu_temp_c", "pch_temp_c")


# === telemetry ===


def read_hwmon_temps() -> dict:
    """Return display-safe thermal readings, preferring Intel coretemp package."""
    readings: list[tuple[str, str, float]] = []
    for hwmon in Path("/sys/class/hwmon").glob("hwmon*"):
        try:
            chip = (hwmon / "name").read_text(encoding="utf-8").strip()
        except Exception:
            chip = hwmon.name
        for inp in hwmon.glob("temp*_input"):
            try:
                raw = int(inp.read_text(encoding="utf-8").strip()) / 1000
                if not (-20 < raw < 115):
                    continue
                label_path = inp.with_name(inp.name.replace("_input", "_label"))
                label = label_path.read_text(encoding="utf-8").strip() if label_path.exists() else inp.stem
                readings.append((chip, label, raw))
            except Exception:
                continue

    package = next((v for chip, label, v in readings if chip == "coretemp" and "package" in label.lower()), None)
    pch = next((v for chip, label, v in readings if chip.startswith("pch_") or "pch" in chip.lower()), None)
    fallback = max((v for _, _, v in readings), default=None)
    return {
        "temp_c": round(package if package is not None else fallback, 1) if (package is not None or fallback is not None) else None,
        "cpu_temp_c": round(package, 1) if package is not None else None,
        "pch_temp_c": round(pch, 1) if pch is not None else None,
        "thermal_readings": len(readings),
    }


def _system_snapshot_direct() -> dict:
    cpu = None
    mem = None
    sensor_error = False
    try:
        with open("/proc/loadavg", "r", encoding="utf-8") as fh:
            load1 = float(fh.read().split()[0])
        cpu = min(1.0, load1 / max(1, os.cpu_count() or 1))
    except Exception:
        sensor_error = True
    try:
        meminfo = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as fh:
            for line in fh:
                key, rest = line.split(":", 1)
                meminfo[key] = int(rest.strip().split()[0])
        total = meminfo.get("MemTotal")
        avail = meminfo.get("MemAvailable")
        if total and avail is not None:
            mem = max(0.0, min(1.0, (total - avail) / total))
        else:
            sensor_error = True
    except Exception:
        sensor_error = True
    temps = read_hwmon_temps()
    if temps["temp_c"] is None:
        sensor_error = True
    return {"cpu": round(cpu, 2) if cpu is not None else None, "memory": round(mem, 2) if mem is not None else None, "sensor_error": sensor_error, **temps}


def _system_snapshot_subprocess() -> dict | None:
    """Fresh-process telemetry fallback for stale long-running display servers."""
    code = r'''
import json, os
from pathlib import Path

def temps():
    readings=[]
    for hwmon in Path('/sys/class/hwmon').glob('hwmon*'):
        try:
            chip=(hwmon/'name').read_text(encoding='utf-8').strip()
        except Exception:
            chip=hwmon.name
        for inp in hwmon.glob('temp*_input'):
            try:
                raw=int(inp.read_text(encoding='utf-8').strip())/1000
                if not (-20 < raw < 115):
                    continue
                label_path=inp.with_name(inp.name.replace('_input','_label'))
                label=label_path.read_text(encoding='utf-8').strip() if label_path.exists() else inp.stem
                readings.append((chip,label,raw))
            except Exception:
                pass
    package=next((v for chip,label,v in readings if chip == 'coretemp' and 'package' in label.lower()), None)
    pch=next((v for chip,label,v in readings if chip.startswith('pch_') or 'pch' in chip.lower()), None)
    fallback=max((v for _,_,v in readings), default=None)
    return {
        'temp_c': round(package if package is not None else fallback, 1) if (package is not None or fallback is not None) else None,
        'cpu_temp_c': round(package, 1) if package is not None else None,
        'pch_temp_c': round(pch, 1) if pch is not None else None,
        'thermal_readings': len(readings),
    }

sensor_error=False
cpu=None
mem=None
try:
    load1=float(Path('/proc/loadavg').read_text(encoding='utf-8').split()[0])
    cpu=min(1.0, load1 / max(1, os.cpu_count() or 1))
except Exception:
    sensor_error=True
try:
    meminfo={}
    for line in Path('/proc/meminfo').read_text(encoding='utf-8').splitlines():
        key, rest = line.split(':', 1)
        meminfo[key]=int(rest.strip().split()[0])
    total=meminfo.get('MemTotal')
    avail=meminfo.get('MemAvailable')
    if total and avail is not None:
        mem=max(0.0, min(1.0, (total-avail)/total))
    else:
        sensor_error=True
except Exception:
    sensor_error=True
thermal=temps()
if thermal['temp_c'] is None:
    sensor_error=True
print(json.dumps({'cpu': round(cpu,2) if cpu is not None else None, 'memory': round(mem,2) if mem is not None else None, 'sensor_error': sensor_error, **thermal}))
'''
    try:
        out = subprocess.check_output(["python3", "-c", code], text=True, stderr=subprocess.DEVNULL, timeout=2.0)
        snap = json.loads(out)
        if isinstance(snap, dict):
            return snap
    except Exception:
        return None
    return None


def read_uptime() -> str | None:
    """Human-readable host uptime from /proc/uptime (e.g. "3d 4h", "5h 12m", "42m")."""
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as fh:
            seconds = float(fh.read().split()[0])
    except Exception:
        return None
    total_minutes = int(seconds // 60)
    days, rem = divmod(total_minutes, 1440)
    hours, minutes = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def system_snapshot() -> dict:
    uptime = read_uptime()
    snap = _system_snapshot_direct()
    if not snap.get("sensor_error"):
        if uptime:
            snap["uptime"] = uptime
        return snap

    # The kiosk backend has occasionally stayed alive but gone telemetry-blind
    # after a quiet period, returning 0%/n/a while the host sources remain fine.
    # If that happens, read telemetry in a fresh interpreter before degrading the
    # display. The screen should stay useful while Hermes is idle.
    fallback = _system_snapshot_subprocess()
    if fallback and not fallback.get("sensor_error"):
        fallback["telemetry_recovered"] = "subprocess"
        if uptime:
            fallback["uptime"] = uptime
        return fallback
    if uptime:
        snap["uptime"] = uptime
    return snap


# === kanban ===


def kanban_db_path() -> Path | None:
    """Return the active project board DB, with legacy fallback for older installs."""
    if KANBAN_DB.exists():
        return KANBAN_DB
    if LEGACY_KANBAN_DB.exists():
        return LEGACY_KANBAN_DB
    return None


def kanban_snapshot() -> dict:
    db_path = kanban_db_path()
    if not db_path:
        return {"active": 0, "summary": "kanban unavailable", "tasks": []}
    try:
        with closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=1.0)) as con:
            con.row_factory = sqlite3.Row
            rows = con.execute(
                """
                select title, status, assignee, priority, current_step_key, last_heartbeat_at
                from tasks
                where status in ('blocked','running','in_progress','active','claimed','pending')
                order by case status when 'blocked' then 0 when 'running' then 1 when 'in_progress' then 2 when 'active' then 3 else 4 end,
                         coalesce(last_heartbeat_at, started_at, created_at) desc
                limit 3
                """
            ).fetchall()
        tasks = []
        for r in rows:
            title = clean_log_msg(r["title"] or "task", 54) or "task"
            tasks.append({
                "title": title,
                "status": clean_log_msg(r["status"] or "unknown", 24),
                "assignee": clean_log_msg(r["assignee"] or "", 32),
                "step": clean_log_msg(r["current_step_key"] or "", 32),
            })
        return {"active": len(tasks), "summary": f"{len(tasks)} active task(s)", "tasks": tasks}
    except Exception as exc:
        print(f"kanban read issue: {exc.__class__.__name__}", flush=True)
        return {"active": 0, "summary": "kanban read issue", "tasks": []}


def blocked_kanban_task(kanban: dict) -> dict | None:
    for task in kanban.get("tasks") or []:
        if str(task.get("status", "")).lower() == "blocked":
            return task
    return None


# === measurement / format ===


def normalize_measurement(raw, *, age_seconds: float | int | None = None) -> dict:
    """Normalize a telemetry value without inventing fake zero readings."""
    if isinstance(raw, dict):
        value = raw.get("value")
        status = str(raw.get("status") or "").lower()
        age_seconds = raw.get("age_seconds", age_seconds)
    else:
        value = raw
        status = ""

    try:
        number = float(value)
        valid = number == number and number not in (float("inf"), float("-inf"))
    except Exception:
        number = None
        valid = False

    if not valid:
        return {"value": None, "status": "lost", "valid": False, "age_seconds": age_seconds}

    if age_seconds is not None:
        try:
            age = float(age_seconds)
        except Exception:
            age = 999999
        # Review-defined feed tiers: fresh <10s, aging 10-30s,
        # stale 30-120s, lost after 120s.
        status = "fresh" if age < 10 else "aging" if age <= 30 else "stale" if age <= 120 else "lost"
    elif status not in FRESHNESS_ORDER:
        status = "fresh"

    return {"value": round(number, 2), "status": status, "valid": status != "lost", "age_seconds": age_seconds}


def normalize_system_freshness(system: dict) -> tuple[dict, dict]:
    measurements = {key: normalize_measurement(system.get(key)) for key in MEASUREMENT_KEYS}
    worst = max((m["status"] for m in measurements.values()), key=lambda status: FRESHNESS_ORDER[status], default="lost")
    valid_count = sum(1 for m in measurements.values() if m["valid"])
    if valid_count == 0:
        worst = "lost"
    elif worst == "lost":
        # One failed sensor should not make the whole physical display claim FEED LOST
        # while other local measurements remain live. Show the failed measurement as
        # unavailable and keep the aggregate feed at a degraded/stale tier.
        worst = "stale"

    safe = dict(system)
    for key, measurement in measurements.items():
        safe[key] = measurement["value"] if measurement["valid"] else None
    safe["measurements"] = measurements
    safe["sensor_error"] = bool(system.get("sensor_error")) or worst == "lost"
    return safe, {
        "tier": worst,
        "valid_measurements": valid_count,
        "stale_measurements": [key for key, m in measurements.items() if m["status"] in {"aging", "stale", "lost"}],
    }


def pct(value) -> int | None:
    try:
        return int(round(float(value) * 100))
    except Exception:
        return None


def format_temp(value) -> str:
    if value is None:
        return "temp n/a"
    try:
        return f"{round(float(value))}°C"
    except Exception:
        return "temp n/a"


def metric_snippet(sys: dict, gateway_ok: bool, freshness: dict) -> str:
    cpu = pct(sys.get("cpu"))
    mem = pct(sys.get("memory"))
    parts = []
    parts.append(f"cpu {cpu}%" if cpu is not None else "cpu n/a")
    parts.append(format_temp(sys.get("temp_c")))
    parts.append(f"mem {mem}%" if mem is not None else "mem n/a")
    if freshness["tier"] != "fresh":
        parts.append(f"telemetry {freshness['tier']}")
    elif gateway_ok:
        parts.append("gateway ok")
    return " · ".join(parts)
