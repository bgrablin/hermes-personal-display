"""Opt-in RPC monitor for explicitly configured owning Hermes dashboard connections.

Never resumes/activates a session, submits prompts, acknowledges approvals, or retries mutations.
"""

from __future__ import annotations

import json
import os
import queue
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

from display_state.integration import clean

ACTIONS = frozenset(
    f"{kind}.{action}"
    for kind in ("goal", "loop", "heartbeat")
    for action in ("pause", "resume")
)


class ConfigError(ValueError):
    """Fixed, credential-free configuration diagnostics suitable for the UI."""


class RpcError(Exception):
    def __init__(self, code):
        self.code = code


class Connection:
    def __init__(self, config):
        self.config = config
        self.jobs = queue.Queue(maxsize=8)
        self.lock = threading.Lock()
        self.rows = {}
        self.counter = 0
        self.ws = None
        self.watermarks = {}

    def event(self, message):
        params = message.get("params") or {}
        if params.get("type") != "session.control.update":
            return
        sid = params.get("session_id")
        # Profiles are bound by configured targets; duplicate runtime IDs are rejected at load.
        target = next(
            (t for t in self.config["sessions"] if t["session_id"] == sid), None
        )
        if target is None:
            return
        seq = params.get("seq")
        if not isinstance(seq, int) or seq <= self.watermarks.get(sid, -1):
            return
        self.watermarks[sid] = seq
        # Events invalidate a snapshot, rather than racing an in-flight read response.
        # The single reader hydrates again on its next cycle, including after message.complete.
        with self.lock:
            row = self.rows.get(sid)
            if row is not None:
                row["refresh_pending"] = True

    @staticmethod
    def set_control(row, control):
        if (
            row.get("control", {}).get("revision") != control.get("revision")
            or "control" not in row
        ):
            row["control"] = clean(control)

    def call(self, method, params):
        self.counter += 1
        rid = self.counter
        self.ws.send(
            json.dumps(
                {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
            )
        )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            for line in self.ws.recv(
                timeout=max(0.01, deadline - time.monotonic())
            ).splitlines():
                message = json.loads(line)
                if message.get("id") == rid:
                    if "error" in message:
                        raise RpcError(message["error"].get("code"))
                    return message.get("result") or {}
                self.event(message)
        raise TimeoutError()

    def hydrate(self, target):
        params = {"session_id": target["session_id"], "profile": target["profile"]}
        sid = target["session_id"]
        with self.lock:
            previous = dict(self.rows.get(sid, {}))
        owner = {k: target[k] for k in ("session_id", "profile", "stored_session_id")}
        owner["connection"] = self.config["name"]
        row = {
            **previous,
            **{k: target[k] for k in ("session_id", "profile", "stored_session_id")},
            "connection": self.config["name"],
            "available": False,
        }
        try:
            # Verify durable identity without resuming/reattaching or stealing another client transport.
            status = self.call("session.status", params)
            identity = f"Session ID: {target['stored_session_id']}"
            if identity not in str(status.get("output", "")).splitlines():
                raise RpcError("identity_mismatch")
            control = self.call("session.control.read", params).get("control")
            if not isinstance(control, dict):
                raise RpcError("invalid_snapshot")
            self.set_control(row, control)
            row.update(
                available=True,
                observed_at=time.time(),
                error=None,
                refresh_pending=False,
                last_known=False,
                actions=sorted(ACTIONS) if target.get("allow_controls") else [],
            )
        except RpcError as exc:
            if exc.code != 4009:
                # Failed verification invalidates cached details and their timestamps.
                row = {**owner, "available": False}
            else:
                row["last_known"] = True
            row.update(
                error="control temporarily unavailable"
                if exc.code == 4009
                else "unsupported or unavailable",
                actions=[],
            )
        with self.lock:
            self.rows[sid] = row
        return row

    def mutate(self, job):
        target, revision, action, done, result, expires = job
        try:
            if time.monotonic() >= expires:
                result.update(ok=False, status="expired; no action sent")
                return
            current = self.hydrate(target)
            if time.monotonic() >= expires:
                result.update(ok=False, status="expired; no action sent")
            elif not current["available"] or action not in current.get("actions", []):
                result.update(ok=False, status="unavailable")
            elif current["control"].get("revision") != revision:
                result.update(ok=False, status="changed; inspect again")
            else:
                response = self.call(
                    "session.control",
                    {
                        "session_id": target["session_id"],
                        "profile": target["profile"],
                        "action": action,
                    },
                )
                control = response.get("control")
                desired = "paused" if action.endswith(".pause") else "active"
                actual = (
                    (control.get(action.split(".")[0]) or {}).get("status")
                    if isinstance(control, dict)
                    else None
                )
                result.update(
                    ok=actual == desired,
                    status="applied"
                    if actual == desired
                    else "request returned; inspect resulting state",
                )
                if isinstance(control, dict):
                    with self.lock:
                        self.set_control(
                            self.rows[target["session_id"]], response["control"]
                        )
        except RpcError as exc:
            result.update(
                ok=False,
                status="control temporarily unavailable"
                if exc.code == 4009
                else "outcome unknown; inspect before retrying"
                if exc.code == 5031
                else "rejected",
            )
        except Exception:
            result.update(ok=False, status="outcome unknown; inspect before retrying")
            raise
        finally:
            done.set()

    def run(self):
        from websockets.sync.client import connect

        while True:
            try:
                with connect(
                    self.config["url"], open_timeout=5, max_size=1_000_000
                ) as self.ws:
                    self.watermarks.clear()
                    while True:
                        for target in self.config["sessions"]:
                            self.hydrate(target)
                        profiles = {t["profile"] for t in self.config["sessions"]}
                        for profile in profiles:
                            try:
                                mcp = self.call(
                                    "mcp.servers.status", {"profile": profile}
                                )
                                with self.lock:
                                    for row in self.rows.values():
                                        if row["profile"] == profile and (
                                            row.get("available")
                                            or row.get("last_known")
                                        ):
                                            row["mcp"] = clean(mcp)
                                            row["mcp_unavailable"] = False
                            except RpcError:
                                with self.lock:
                                    for row in self.rows.values():
                                        if row["profile"] == profile:
                                            row["mcp_unavailable"] = True
                        try:
                            job = self.jobs.get(timeout=3)
                        except queue.Empty:
                            continue
                        self.mutate(job)
            except Exception:
                with self.lock:
                    for row in self.rows.values():
                        row.update(
                            available=False, actions=[], error="connection unavailable"
                        )
                # Queued clicks are rejected, never sent on a replacement connection.
                while True:
                    try:
                        _, _, _, done, result, _ = self.jobs.get_nowait()
                    except queue.Empty:
                        break
                    result.update(ok=False, status="connection unavailable")
                    done.set()
                time.sleep(5)

    def snapshot(self):
        with self.lock:
            rows = json.loads(json.dumps(list(self.rows.values())))
        for row in rows:
            if time.time() - row.get("observed_at", 0) > 20:
                row.update(available=False, actions=[])
        return rows


class Monitor:
    def __init__(self):
        self.connections = []
        self.error = None
        path = os.environ.get("HERMES_DISPLAY_RPC_CONFIG")
        if not path:
            return
        try:
            from websockets.sync.client import connect  # noqa: F401

            configs = json.loads(Path(path).read_text())["connections"]
            if len(configs) > 8:
                raise ConfigError("Connection limit exceeded (maximum 8)")
            names = set()
            for config in configs:
                url = urlparse(config["url"])
                if url.scheme not in ("ws", "wss") or url.hostname not in (
                    "localhost",
                    "127.0.0.1",
                    "::1",
                ):
                    raise ConfigError(
                        "Local endpoint required; use an SSH tunnel for a remote owner"
                    )
                if config["name"] in names:
                    raise ConfigError("Duplicate connection name")
                names.add(config["name"])
                if len(config["sessions"]) > 16:
                    raise ConfigError(
                        "Session limit exceeded (maximum 16 per connection)"
                    )
                ids = set()
                for target in config["sessions"]:
                    if not all(
                        isinstance(target.get(k), str) and target[k]
                        for k in ("session_id", "profile", "stored_session_id")
                    ):
                        raise ConfigError("Explicit owner required")
                    if target["session_id"] in ids:
                        raise ConfigError("Duplicate runtime session ID")
                    ids.add(target["session_id"])
                self.connections.append(Connection(config))
        except ConfigError as exc:
            self.connections = []
            self.error = str(exc)
        except (ImportError, OSError, ValueError, TypeError, KeyError, AttributeError):
            self.connections = []
            self.error = (
                "RPC configuration or optional websockets dependency unavailable"
            )
        for connection in self.connections:
            threading.Thread(
                target=connection.run, daemon=True, name="display-rpc"
            ).start()

    def snapshot(self):
        return {
            "sessions": [row for c in self.connections for row in c.snapshot()],
            "status": self.error
            or ("configured" if self.connections else "not configured"),
        }

    def action(self, payload):
        action = payload.get("action")
        if action not in ACTIONS or not isinstance(payload.get("revision"), str):
            return {"ok": False, "status": "invalid action"}
        for connection in self.connections:
            if connection.config["name"] != payload.get("connection"):
                continue
            for target in connection.config["sessions"]:
                if all(
                    target[k] == payload.get(k)
                    for k in ("session_id", "stored_session_id", "profile")
                ) and target.get("allow_controls"):
                    current = next(
                        (
                            r
                            for r in connection.snapshot()
                            if r["session_id"] == target["session_id"]
                        ),
                        {},
                    )
                    if not current.get("available"):
                        return {"ok": False, "status": "unavailable"}
                    done, result = threading.Event(), {}
                    try:
                        connection.jobs.put_nowait(
                            (
                                target,
                                payload["revision"],
                                action,
                                done,
                                result,
                                time.monotonic() + 12,
                            )
                        )
                    except queue.Full:
                        return {"ok": False, "status": "busy"}
                    if not done.wait(18):
                        return {
                            "ok": False,
                            "status": "outcome unknown; inspect before retrying",
                        }
                    return result
        return {"ok": False, "status": "owner unavailable"}
