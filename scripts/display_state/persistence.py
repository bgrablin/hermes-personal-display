"""Display bus persistence helpers."""
from __future__ import annotations

import fcntl
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from .privacy import scrub


def atomic_json_write(path: Path, payload: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
                tmp_file.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
            os.replace(tmp, path)
        finally:
            try:
                if tmp.exists():
                    tmp.unlink()
            except Exception:
                pass
    except Exception as exc:
        detail = f"{exc.__class__.__name__}:{getattr(exc, 'errno', '') or ''}".rstrip(':')
        print(f"Display file-bus write failed for {path.name}: {scrub(detail)}", flush=True)


def load_json_dict(path: Path, fallback: dict | None = None) -> dict:
    if fallback is None:
        fallback = {}
    try:
        if not path.is_file():
            return dict(fallback)
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else dict(fallback)
    except Exception:
        return dict(fallback)


def append_bounded_jsonl(path: Path, record: dict, max_lines: int = 500) -> None:
    """Append one JSONL record while holding an advisory file lock.

    The old read-truncate-write sequence raced concurrent writers. Lock a sibling
    file for the full read/write/replace window so bounded history files remain
    coherent across display-server threads.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(path.suffix + ".lock")
    with lock_path.open("a+") as lock_fh:
        fcntl.flock(lock_fh.fileno(), fcntl.LOCK_EX)
        try:
            existing: list[str] = []
            if path.is_file():
                existing = path.read_text(encoding="utf-8", errors="replace").splitlines()[-max_lines + 1:]
            existing.append(json.dumps(record, separators=(",", ":")))
            fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
            tmp = Path(tmp_name)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as tmp_fh:
                    tmp_fh.write("\n".join(existing) + "\n")
                os.replace(tmp, path)
            finally:
                try:
                    if tmp.exists():
                        tmp.unlink()
                except Exception:
                    pass
        finally:
            fcntl.flock(lock_fh.fileno(), fcntl.LOCK_UN)
