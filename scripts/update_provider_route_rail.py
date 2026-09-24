#!/usr/bin/env python3
"""Refresh provider_route_rail.json from local agent.log activity.

Reads a rolling window of recent `API call #N` lines from
~/.hermes/logs/agent.log, aggregates per-provider requests, and writes a
sanitized route-rail artifact at ~/.hermes/display/provider_route_rail.json.

State vocabulary used here matches the renderer's allowlist:
  * confirmed — headroom read from a provider/account quota endpoint
  * inferred  — headroom derived from local activity when no quota endpoint is available
  * unknown   — provider configured but no signal available

Designed to run every ~5 minutes via systemd user timer.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

HOME = Path(os.path.expanduser("~"))
PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = HOME / ".hermes/logs/agent.log"
OUT_PATH = HOME / ".hermes/display/provider_route_rail.json"
CCUSAGE_BIN = Path(os.environ.get("HERMES_DISPLAY_CCUSAGE_BIN", PROJECT_ROOT / "node_modules/.bin/ccusage"))

# Per-provider fallback signals. Request counts are not provider quota and must
# only be used where the row is explicitly documented as an estimate.
PROVIDER_PLAN = {
    "openai-codex": {
        "label": "CHATGPT",
        "tier_label": "PROLITE 5H",
        "rank": 1,
        # ChatGPT quota comes from WHAM. Local request counts do not map to
        # five-hour or weekly usage and must never become percentage headroom.
        "window_minutes": None,
        "request_cap": None,
    },
    "anthropic": {
        "label": "CLAUDE",
        "tier_label": "5H/7D",
        "rank": 2,
        "window_minutes": 300,
        "request_cap": 800,
    },
    "alibaba-token-plan": {
        # Alibaba Cloud Model Studio Token Plan ($10/mo flat-token tier).
        # Monthly usage comes from the console's own usage API, replayed with the
        # operator's exported console session cookie (see fetch_alibaba_token_plan_usage).
        # The PLAN API KEY is never used for this: the Token Plan terms restrict it to
        # interactive coding/agent tool use. Without a usable console session the row
        # degrades to inferred READY and never invents a percentage.
        "label": "ALIBABA",
        "tier_label": "TOKEN PLAN",
        "rank": 3,
        "window_minutes": None,
        "request_cap": None,
    },
    "opencode-go": {
        # Confirmed quota comes from OpenCode Go's authenticated usage endpoint
        # (rolling/weekly/monthly percent windows). Local request counts do not
        # map to those windows and must never become percentage headroom.
        "label": "OCGO",
        "tier_label": "GO",
        "rank": 4,
        "window_minutes": None,
        "request_cap": None,
    },
    "xai-oauth": {
        # xAI exposes authenticated inference but no supported machine-readable
        # subscription quota endpoint. Show route readiness without inventing
        # a percentage; the renderer labels this READY and hides the gauge.
        "label": "XAI",
        "tier_label": "SUPERGROK",
        "rank": 5,
        "window_minutes": None,
        "request_cap": None,
    },
}

ALLOWED_PROVIDER_IDS = set(PROVIDER_PLAN.keys())

# Match either the standalone API-call summary or the surrounding client
# create/close noise. Only the API-call summary carries token counts but the
# client-create line is what tells us provider was actually contacted.
API_CALL_RE = re.compile(
    r"API call #\d+:.*?\bprovider=(?P<provider>[A-Za-z0-9._-]+)"
)
TS_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")

ACTIVE_WINDOW_S = 600  # consider a provider "active" if used in last 10 min

# ccusage estimates Claude Code subscription block usage in dollars. Recent
# exhausted Max 5x blocks on this host land around this value, and it maps the
# current Claude Code block to the ~59% remaining Brian sees in Claude Code far
# better than counting Hermes agent.log provider calls. This remains
# display-only inferred headroom, not a confirmed Anthropic quota API reading.
CLAUDE_MAX_5H_COST_CAP = 47.5


def parse_ts(line: str) -> float | None:
    m = TS_RE.match(line)
    if not m:
        return None
    try:
        return dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").timestamp()
    except ValueError:
        return None


def scan_log(path: Path, oldest_needed: float) -> dict[str, dict]:
    """Return {provider_id: {requests:int, last_ts:float}} for entries within window."""
    counts: dict[str, dict] = {}
    if not path.is_file():
        return counts
    current_ts: float | None = None
    try:
        # Read whole file; agent.log rotates at ~2MB so cost is small.
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                ts = parse_ts(line)
                if ts is not None:
                    current_ts = ts
                if current_ts is None or current_ts < oldest_needed:
                    continue
                m = API_CALL_RE.search(line)
                if not m:
                    continue
                prov = m.group("provider")
                if prov not in ALLOWED_PROVIDER_IDS:
                    continue
                bucket = counts.setdefault(
                    prov, {"requests": 0, "last_ts": 0.0}
                )
                bucket["requests"] += 1
                if current_ts > bucket["last_ts"]:
                    bucket["last_ts"] = current_ts
    except OSError as exc:
        print(f"agent.log read failed: {exc}", file=sys.stderr)
    return counts



def _hermes_agent_path() -> Path:
    return HOME / ".hermes/hermes-agent"


def _load_hermes_env_and_path() -> None:
    """Make Hermes internals importable without echoing secrets."""
    agent_path = _hermes_agent_path()
    if str(agent_path) not in sys.path:
        sys.path.insert(0, str(agent_path))
    try:
        from hermes_cli.env_loader import load_hermes_dotenv
        load_hermes_dotenv()
    except Exception:
        # Quota probes fail closed to the log-derived/unknown rows.
        pass


def _codex_usage_url(base_url: str | None) -> str:
    normalized = (base_url or "https://chatgpt.com/backend-api/codex").strip().rstrip("/")
    if normalized.endswith("/codex"):
        normalized = normalized[: -len("/codex")]
    if "/backend-api" in normalized:
        return f"{normalized}/wham/usage"
    return f"{normalized}/api/codex/usage"


def _codex_window_duration_label(value: Any) -> str | None:
    try:
        seconds = int(value)
    except (TypeError, ValueError):
        return None
    if seconds <= 0:
        return None
    if seconds % 86_400 == 0:
        return f"{seconds // 86_400}D"
    if seconds % 3_600 == 0:
        return f"{seconds // 3_600}H"
    return None


def fetch_codex_headroom() -> tuple[float | None, float | None, str | None, float | None]:
    """Return confirmed ChatGPT/Codex primary and secondary headroom.

    Returns (primary_headroom, secondary_headroom, tier_label, reset_at_epoch_s).
    reset_at_epoch_s is the Unix timestamp when the primary rate-limit window resets.
    """
    try:
        _load_hermes_env_and_path()
        from agent.credential_pool import load_pool

        pool = load_pool("openai-codex")
        # select() refreshes an expiring OAuth credential before returning it.
        # A read-only timer that uses peek() can hold a stale access token and
        # emit 401s until some unrelated model request refreshes the pool.
        #
        # select() skips exhausted entries, but the WHAM/usage endpoint is a
        # read-only GET that may still work with an exhausted token.  Try
        # the usable subset first, then fall through to any credential so
        # we can surface the real used_percent even when quota is exhausted.
        entry = pool.select() if pool else None
        if entry is None:
            entries = getattr(pool, "_entries", None) or []
            if entries:
                first = entries[0] if entries else None
                if first and getattr(first, "access_token", ""):
                    entry = first
        token = str(getattr(entry, "runtime_api_key", "") or "").strip() if entry else ""
        if not token:
            return None, None, None, None
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "codex-cli",
        }
        account_id = str((getattr(entry, "extra", None) or {}).get("account_id") or "").strip()
        if account_id:
            headers["ChatGPT-Account-Id"] = account_id
        req = urllib.request.Request(
            _codex_usage_url(getattr(entry, "runtime_base_url", None)),
            headers=headers,
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=12.0) as resp:
            payload = json.loads(resp.read().decode("utf-8")) or {}
        rate_limit = payload.get("rate_limit") or {}
        primary = rate_limit.get("primary_window") or {}
        secondary = rate_limit.get("secondary_window") or {}
        used = float(primary.get("used_percent"))
        headroom = max(0.0, min(1.0, 1.0 - used / 100.0))
        secondary_headroom = None
        if secondary.get("used_percent") is not None:
            secondary_headroom = max(0.0, min(1.0, 1.0 - float(secondary.get("used_percent")) / 100.0))
        tier = str(payload.get("plan_type") or "").strip().upper().replace("_", "-") or None
        duration_label = _codex_window_duration_label(primary.get("limit_window_seconds"))
        if duration_label:
            tier = f"{tier} {duration_label}" if tier else duration_label
        # When the credential pool marks this entry as exhausted (a real 429
        # was received) and the pool's reset time is still in the future,
        # that signal is more trustworthy than the WHAM primary_window.
        # The WHAM window can roll to a fresh 5h period while the actual
        # rate-limit that blocked the session has not expired yet.  In that
        # case force 0 % headroom and use the credential reset time so the
        # display matches `hermes auth list`.
        cred_reset = getattr(entry, "last_error_reset_at", None) if entry else None
        cred_exhausted = str(getattr(entry, "last_status", "") or "").lower() == "exhausted"
        if cred_exhausted and isinstance(cred_reset, (int, float)) and cred_reset > time.time():
            headroom = 0.0
            secondary_headroom = None
            reset_at = cred_reset
        else:
            reset_at = primary.get("reset_at")
            if reset_at is None:
                reset_at = cred_reset
        return headroom, secondary_headroom, tier, reset_at
    except Exception as exc:
        print(f"codex quota probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None, None


ANTHROPIC_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
ANTHROPIC_PROBE_TIMEOUT_S = 12.0
ANTHROPIC_MAX_PROBE_ATTEMPTS = 4
ANTHROPIC_429_BACKOFF_S = 1800


def anthropic_probe_rate_limited() -> bool:
    """Whether a recent 429 is holding off this read-only quota probe."""
    try:
        path = HOME / ".hermes/state/anthropic-quota-probe.json"
        retry_after = json.loads(path.read_text(encoding="utf-8")).get("retry_after", 0)
        return isinstance(retry_after, (int, float)) and not isinstance(retry_after, bool) and retry_after > time.time()
    except (OSError, ValueError, AttributeError):
        return False


def _anthropic_pool_tokens() -> list[str]:
    """Pooled Anthropic OAuth tokens, highest priority first. Values are never logged."""
    from agent.credential_pool import load_pool

    pool = load_pool("anthropic")
    entries = list(getattr(pool, "_entries", None) or []) if pool is not None else []
    if not entries and pool is not None:
        entry = pool.peek()
        entries = [entry] if entry else []
    tokens: list[str] = []
    for entry in sorted(entries, key=lambda item: getattr(item, "priority", 0)):
        token = str(getattr(entry, "runtime_api_key", "") or getattr(entry, "access_token", "") or "").strip()
        if token and token not in tokens:
            tokens.append(token)
    return tokens


def _anthropic_usage_window(payload: dict[str, Any], name: str) -> tuple[float | None, float | None]:
    """Return (headroom, reset_at_epoch_s) for one usage window, or (None, None)."""
    node = payload.get(name)
    if not isinstance(node, dict):
        return None, None
    used = node.get("utilization")
    if isinstance(used, bool) or not isinstance(used, (int, float)):
        return None, None
    used = float(used)
    if 0.0 <= used <= 1.0:
        used *= 100.0  # the endpoint has shipped both fraction and percent scales
    if not math.isfinite(used) or used < 0.0 or used > 100.0:
        return None, None
    reset_at = None
    raw_reset = str(node.get("resets_at") or "").strip()
    if raw_reset:
        try:
            reset_at = dt.datetime.fromisoformat(raw_reset.replace("Z", "+00:00")).timestamp()
        except ValueError:
            reset_at = None
    return max(0.0, min(1.0, 1.0 - used / 100.0)), reset_at


def _parse_anthropic_usage(payload: dict[str, Any]) -> tuple[float | None, float | None, float | None]:
    """Map an oauth usage payload to (5h headroom, weekly headroom, primary reset)."""
    primary, primary_reset = _anthropic_usage_window(payload, "five_hour")
    secondary, _ = _anthropic_usage_window(payload, "seven_day")
    return primary, secondary, primary_reset


def fetch_anthropic_headroom() -> tuple[float | None, float | None, float | None]:
    """Return confirmed Anthropic five-hour/weekly headroom and primary reset.

    Every pooled OAuth credential is tried in priority order and the first usable
    answer wins. A single rate-limited (429) or expired top-priority entry must
    not blank the row while a healthy lower-priority credential exists, which is
    how the CLAUDE row used to disappear overnight.
    """
    try:
        state_path = HOME / ".hermes/state/anthropic-quota-probe.json"
        if anthropic_probe_rate_limited():
            return None, None, None
        _load_hermes_env_and_path()
        tokens = _anthropic_pool_tokens()[:ANTHROPIC_MAX_PROBE_ATTEMPTS]
        failures: list[str] = []
        rate_limited = False
        for token in tokens:
            try:
                request = urllib.request.Request(
                    ANTHROPIC_USAGE_URL,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                        "anthropic-beta": "oauth-2025-04-20",
                        "User-Agent": "hermes-personal-display",
                    },
                )
                with urllib.request.urlopen(request, timeout=ANTHROPIC_PROBE_TIMEOUT_S) as response:
                    decoded = json.loads(response.read().decode("utf-8", "replace")) or {}
            except urllib.error.HTTPError as exc:
                rate_limited |= exc.code == 429
                failures.append(f"HTTP {exc.code}")
                continue
            except Exception as exc:
                failures.append(type(exc).__name__)
                continue
            primary, secondary, primary_reset = _parse_anthropic_usage(decoded if isinstance(decoded, dict) else {})
            if primary is not None:
                state_path.unlink(missing_ok=True)
                return primary, secondary, primary_reset
            failures.append("no-windows")
        if failures:
            if rate_limited:
                state_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path = state_path.with_suffix(".tmp")
                descriptor = os.open(temp_path, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
                with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                    json.dump({"retry_after": time.time() + ANTHROPIC_429_BACKOFF_S}, stream)
                os.replace(temp_path, state_path)
            print(f"anthropic quota probe: no credential answered ({', '.join(failures)})", file=sys.stderr)
            return None, None, None
        return _anthropic_headroom_from_hermes_snapshot()
    except Exception as exc:
        print(f"anthropic quota probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None


def _anthropic_headroom_from_hermes_snapshot() -> tuple[float | None, float | None, float | None]:
    """Last resort when the credential pool exposes no token: Hermes' own resolution."""
    from agent.account_usage import fetch_account_usage

    snap = fetch_account_usage("anthropic")
    if not snap or not snap.windows:
        return None, None, None
    primary = None
    primary_reset = None
    secondary = None
    for window in snap.windows:
        label = str(window.label or "").lower()
        if window.used_percent is None:
            continue
        remaining = max(0.0, min(1.0, 1.0 - float(window.used_percent) / 100.0))
        if primary is None and ("session" in label or "five" in label):
            primary = remaining
            primary_reset = window.reset_at.timestamp() if window.reset_at else None
        elif secondary is None and "week" in label:
            secondary = remaining
    if primary is None and snap.windows[0].used_percent is not None:
        primary = max(0.0, min(1.0, 1.0 - float(snap.windows[0].used_percent) / 100.0))
        primary_reset = snap.windows[0].reset_at.timestamp() if snap.windows[0].reset_at else None
    return primary, secondary, primary_reset


def alibaba_route_configured() -> bool:
    """Return whether a Token Plan credential is configured locally.

    Deliberately makes NO network call: the Token Plan terms restrict the plan
    API key to interactive coding/agent tool use, so an unattended timer must
    never send it anywhere. A configured pooled credential is readiness
    evidence only; headroom stays None and the row renders as inferred READY.
    """
    try:
        _load_hermes_env_and_path()
        from agent.credential_pool import load_pool

        pool = load_pool("alibaba-token-plan")
        entry = pool.peek() if pool else None
        if entry is None:
            entries = getattr(pool, "_entries", None) or []
            entry = entries[0] if entries else None
        if entry is None:
            return False
        return bool(
            str(getattr(entry, "runtime_api_key", "") or "").strip()
            and str(getattr(entry, "runtime_base_url", "") or "").strip()
        )
    except Exception as exc:
        print(f"alibaba credential check failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return False


ALIBABA_CONSOLE_PAGE = "https://modelstudio.console.alibabacloud.com/ap-southeast-1/subscription/token-plan/personal"
ALIBABA_CONSOLE_API = "https://bailian-singapore-cs.alibabacloud.com/data/api.json"
ALIBABA_USAGE_ACTION = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage"
ALIBABA_SUBSCRIPTION_ACTION = "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription"
ALIBABA_SUBSCRIPTION_COMMODITY = "sfm_tokenplansolo_public_intl"
ALIBABA_COOKIE_JAR = Path(
    os.environ.get("HERMES_ALIBABA_COOKIE_JAR") or (HOME / ".hermes" / "state" / "aliyun-console-cookies.txt")
)
ALIBABA_CONSOLE_TIMEOUT_S = 12.0


def load_alibaba_cookie_header(jar: Path | None = None) -> str:
    """Return the console Cookie header from the operator's exported jar, or "".

    The jar holds a live Model Studio console session for this host only (0600).
    It is never copied into a display artifact; the rail publishes numbers only.
    """
    path = jar or ALIBABA_COOKIE_JAR
    try:
        raw = path.read_text(encoding="utf-8", errors="replace").strip()
    except OSError:
        return ""
    parts = [chunk.strip() for chunk in raw.split(";") if "=" in chunk]
    return "; ".join(parts)


def _alibaba_console_call(action: str, data: dict[str, Any], cookie_header: str) -> dict[str, Any]:
    """POST one Model Studio console gateway call and return the decoded envelope."""
    payload: dict[str, Any] = {
        "Api": action,
        "V": "1.0",
        "Data": {
            "cornerstoneParam": {
                "feTraceId": str(uuid.uuid4()),
                "feURL": ALIBABA_CONSOLE_PAGE,
                "protocol": "V2",
                "console": "ONE_CONSOLE",
                "productCode": "p_efm",
                "switchAgent": 1620176,
                "switchUserType": 3,
                "domain": "modelstudio.console.alibabacloud.com",
                "consoleSite": "MODELSTUDIO_ALBABACLOUD",
                "userNickName": "",
                "userPrincipalName": "",
                "xsp_lang": "en-US",
            },
            **data,
        },
    }
    body = urllib.parse.urlencode({"params": json.dumps(payload, separators=(",", ":"))}).encode("utf-8")
    request = urllib.request.Request(
        f"{ALIBABA_CONSOLE_API}?action=IntlBroadScopeAspnGateway&product=sfm_bailian&api={action}&_v=",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": ALIBABA_CONSOLE_PAGE,
            "User-Agent": "hermes-personal-display",
            "Cookie": cookie_header,
        },
    )
    with urllib.request.urlopen(request, timeout=ALIBABA_CONSOLE_TIMEOUT_S) as response:
        decoded = json.loads(response.read().decode("utf-8", "replace")) or {}
    return decoded if isinstance(decoded, dict) else {}


def _alibaba_payload(doc: dict[str, Any]) -> dict[str, Any] | None:
    """Return the inner data object of a console envelope, or None when not SUCCESS."""
    node = ((doc.get("data") or {}).get("DataV2") or {}).get("data")
    if not isinstance(node, dict):
        return None
    if str(node.get("code") or "").upper() not in {"", "SUCCESS"}:
        return None
    inner = node.get("data")
    return inner if isinstance(inner, dict) else None


def fetch_alibaba_token_plan_usage() -> tuple[float | None, str | None, float | None]:
    """Return (headroom, tier_label, reset_at_epoch_s) from the console usage API.

    The endpoint reports the share of the subscription month already consumed.
    The rail renders remaining headroom, as it does for every other row. Every
    failure mode (no jar, expired console session, changed payload) returns None
    so the row degrades to inferred READY instead of a fabricated percentage.
    """
    cookie = load_alibaba_cookie_header()
    if not cookie:
        print("alibaba usage: no console cookie jar; row stays READY", file=sys.stderr)
        return None, None, None
    try:
        usage = _alibaba_payload(_alibaba_console_call(ALIBABA_USAGE_ACTION, {}, cookie))
        if usage is None:
            print("alibaba usage: console session rejected; row stays READY", file=sys.stderr)
            return None, None, None
        used = usage.get("per1MonthPercentage")
        if isinstance(used, bool) or not isinstance(used, (int, float)):
            return None, None, None
        used = float(used)
        if 0.0 <= used <= 1.0:
            used *= 100.0  # the console reports a fraction of the monthly allowance
        if not math.isfinite(used) or used < 0.0 or used > 100.0:
            return None, None, None
        headroom = max(0.0, min(1.0, 1.0 - used / 100.0))
        reset_at = None
        reset_ms = usage.get("per1MonthResetTime")
        if isinstance(reset_ms, (int, float)) and not isinstance(reset_ms, bool) and reset_ms > 0:
            reset_at = float(reset_ms) / 1000.0
        tier = None
        subscription = _alibaba_payload(
            _alibaba_console_call(
                ALIBABA_SUBSCRIPTION_ACTION,
                {"queryInstanceInfoRequest": {"commodityCode": ALIBABA_SUBSCRIPTION_COMMODITY}},
                cookie,
            )
        )
        if subscription:
            spec = str(subscription.get("specCode") or "").strip().upper()
            tier = spec or None
        return headroom, tier or PROVIDER_PLAN["alibaba-token-plan"]["tier_label"], reset_at
    except Exception as exc:
        print(f"alibaba usage probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None


def apply_alibaba_usage(providers: list[dict]) -> None:
    """Fill the Alibaba row from the console usage API when the session works."""
    headroom, tier, reset_at = fetch_alibaba_token_plan_usage()
    if headroom is None:
        return
    for provider in providers:
        if provider.get("id") != "alibaba-token-plan":
            continue
        provider["state"] = "confirmed"
        provider["headroom"] = headroom
        provider["secondary_headroom"] = None
        provider["tier_label"] = tier or PROVIDER_PLAN["alibaba-token-plan"]["tier_label"]
        provider["reset_at_epoch_s"] = reset_at
        provider["last_used_age_s"] = 0


OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"


def fetch_opencode_go_headroom() -> tuple[float | None, float | None, str | None, float | None]:
    """Return confirmed OpenCode Go headroom from its authenticated usage endpoint.

    Returns (primary_headroom, secondary_headroom, tier_label, reset_at_epoch_s).
    The endpoint reports percent-used per window; the 5-hour rolling window is
    primary and the weekly window is secondary. A window may be absent, null,
    or report a non-ok status; each failure mode degrades independently instead
    of inventing a number.
    """
    try:
        _load_hermes_env_and_path()
        token = str(os.environ.get("OPENCODE_GO_API_KEY") or "").strip()
        if not token:
            return None, None, None, None
        request = urllib.request.Request(
            OPENCODE_GO_USAGE_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "User-Agent": "hermes-personal-display",
            },
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=12.0) as response:
            payload = json.loads(response.read().decode("utf-8")) or {}
        windows = (payload.get("usage") or {}) if isinstance(payload, dict) else {}

        def window_used_percent(name: str) -> tuple[float | None, float | None]:
            window = windows.get(name)
            if not isinstance(window, dict):
                return None, None
            if str(window.get("status") or "").lower() not in {"", "ok"}:
                return None, None
            used = window.get("percent")
            if isinstance(used, bool) or not isinstance(used, (int, float)):
                return None, None
            used = float(used)
            if not math.isfinite(used) or used < 0 or used > 100:
                return None, None
            headroom = max(0.0, min(1.0, 1.0 - used / 100.0))
            reset_at = None
            raw_reset = str(window.get("resetsAt") or "").strip()
            if raw_reset:
                try:
                    reset_at = dt.datetime.fromisoformat(raw_reset.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    reset_at = None
            return headroom, reset_at

        primary, primary_reset = window_used_percent("rolling")
        secondary, _ = window_used_percent("weekly")
        if primary is None:
            return None, None, None, None
        return primary, secondary, PROVIDER_PLAN["opencode-go"]["tier_label"], primary_reset
    except Exception as exc:
        print(f"opencode-go quota probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None, None


def load_config_fallback_routes() -> dict[str, tuple[str, str]]:
    """Map display row ids to the configured provider/model route to resolve."""
    try:
        import yaml

        cfg = yaml.safe_load((HOME / ".hermes/config.yaml").read_text(encoding="utf-8")) or {}
    except Exception:
        cfg = {}
    routes: dict[str, tuple[str, str]] = {}
    model_cfg = cfg.get("model") or {}
    if model_cfg.get("provider") and model_cfg.get("default"):
        routes[str(model_cfg["provider"])] = (str(model_cfg["provider"]), str(model_cfg["default"]))
    fallback_routes = cfg.get("fallback_providers") or []
    if not isinstance(fallback_routes, list):
        fallback_routes = []
    for entry in fallback_routes:
        if not isinstance(entry, dict):
            continue
        provider = str(entry.get("provider") or "").strip()
        model = str(entry.get("model") or "").strip()
        if provider and model:
            routes[provider] = (provider, model)
    return routes


def route_resolves(provider: str, model: str) -> bool:
    """Return whether Hermes can resolve provider/model without making a live call."""
    try:
        _load_hermes_env_and_path()
        from hermes_cli.runtime_provider import resolve_runtime_provider

        resolved = resolve_runtime_provider(requested=provider, target_model=model)
        if isinstance(resolved, dict):
            # Some API-key providers return a structural route with an empty key;
            # that is not a usable authenticated route.
            if provider in {"gemini", "anthropic", "openrouter", "opencode-go", "openai-codex", "alibaba-token-plan"}:
                return bool(str(resolved.get("api_key") or "").strip())
        return True
    except Exception:
        return False


def apply_route_availability(providers: list[dict]) -> None:
    """Show authenticated but unmetered fallback routes as inferred, not UNK.

    This intentionally distinguishes quota certainty from route availability:
    confirmed rows come from quota APIs; inferred rows mean the configured route
    resolves and is likely callable, but no safe headroom API is available.
    """
    routes = load_config_fallback_routes()
    for row in providers:
        if row.get("state") not in {"unknown", None, ""}:
            continue
        row_id = str(row.get("id") or "")
        route = routes.get(row_id)
        if not route:
            continue
        provider, model = route
        if route_resolves(provider, model):
            row["state"] = "inferred"
            # Reachability is not quota. Keep headroom empty so the renderer
            # shows READY without a percentage or gauge.
            row["headroom"] = None
            row["secondary_headroom"] = None
            row["tier_label"] = row.get("tier_label") or "ROUTE"
            row["last_used_age_s"] = 0


def apply_confirmed_quota(providers: list[dict]) -> None:
    codex_headroom, codex_secondary, codex_tier, codex_reset_at = fetch_codex_headroom()
    anthropic_headroom, anthropic_secondary, anthropic_reset_at = fetch_anthropic_headroom()
    opencode_go_headroom, opencode_go_secondary, opencode_go_tier, opencode_go_reset_at = fetch_opencode_go_headroom()

    quota_updates: dict[str, dict[str, Any]] = {}
    if codex_headroom is not None:
        quota_updates["openai-codex"] = {
            "state": "confirmed",
            "headroom": codex_headroom,
            "secondary_headroom": codex_secondary,
            "tier_label": codex_tier or PROVIDER_PLAN["openai-codex"]["tier_label"],
            "reset_at_epoch_s": codex_reset_at,
            "last_used_age_s": 0,
        }
    if anthropic_headroom is not None:
        quota_updates["anthropic"] = {
            "state": "confirmed",
            "headroom": anthropic_headroom,
            "secondary_headroom": anthropic_secondary,
            "tier_label": PROVIDER_PLAN["anthropic"]["tier_label"],
            "reset_at_epoch_s": anthropic_reset_at,
            "last_used_age_s": 0,
        }
    if opencode_go_headroom is not None:
        quota_updates["opencode-go"] = {
            "state": "confirmed",
            "headroom": opencode_go_headroom,
            "secondary_headroom": opencode_go_secondary,
            "tier_label": opencode_go_tier or PROVIDER_PLAN["opencode-go"]["tier_label"],
            "reset_at_epoch_s": opencode_go_reset_at,
            "last_used_age_s": 0,
        }

    for provider in providers:
        update = quota_updates.get(provider["id"])
        if update:
            provider.update(update)
        elif provider["id"] == "anthropic" and anthropic_probe_rate_limited():
            provider["quota_source_state"] = "rate_limited"


def apply_alibaba_readiness(providers: list[dict]) -> None:
    """Show the Alibaba Token Plan row as inferred READY when a credential exists.

    Local-only check; the plan key never leaves this host from the timer.
    Headroom stays None so the renderer shows READY without a percentage or
    gauge. No configured credential leaves the row unknown.
    """
    for provider in providers:
        if provider["id"] != "alibaba-token-plan" or provider.get("state") not in {"unknown", None, ""}:
            continue
        if alibaba_route_configured():
            provider["state"] = "inferred"
            provider["headroom"] = None
            provider["secondary_headroom"] = None
            provider["tier_label"] = PROVIDER_PLAN["alibaba-token-plan"]["tier_label"]
            provider["last_used_age_s"] = 0


def build_providers(now: float, counts: dict[str, dict]) -> tuple[list[dict], str]:
    rows: list[dict] = []
    active_id = ""
    most_recent_ts = 0.0
    for prov_id, plan in PROVIDER_PLAN.items():
        window_s = (plan["window_minutes"] or 0) * 60
        cap = plan["request_cap"]
        c = counts.get(prov_id) or {"requests": 0, "last_ts": 0.0}

        if cap is None or window_s == 0:
            # No quota signal possible (e.g. Copilot).
            state = "unknown"
            headroom = None
            last_age = (
                int(now - c["last_ts"]) if c["last_ts"] > 0 else None
            )
        else:
            # Re-filter requests to this provider's actual window. No observed
            # request in-window is not proof of full quota. Render unknown
            # rather than manufacturing a confident 100% headroom row.
            window_cutoff = now - window_s
            if c["last_ts"] <= 0 or c["last_ts"] < window_cutoff:
                headroom = None
                state = "unknown"
                last_age = int(now - c["last_ts"]) if c["last_ts"] > 0 else None
            else:
                used = max(0, int(c["requests"] or 0))
                headroom = max(0.0, 1.0 - used / cap)
                state = "inferred"
                last_age = int(now - c["last_ts"])

        row = {
            "id": prov_id,
            "label": plan["label"],
            "tier_label": plan["tier_label"],
            "rank": plan["rank"],
            "state": state,
            "headroom": headroom,
            "secondary_headroom": None,
            "credits_used": None,
            "credits_limit": None,
            "reachable": True,
            "last_used_age_s": last_age,
            "stale_age_s": None,
        }
        rows.append(row)
        if (
            c["last_ts"] > most_recent_ts
            and (now - c["last_ts"]) <= ACTIVE_WINDOW_S
        ):
            most_recent_ts = c["last_ts"]
            active_id = prov_id

    rows.sort(key=lambda r: r["rank"])
    return rows, active_id


def load_claude_code_headroom() -> tuple[float | None, int | None]:
    """Return inferred Claude Code headroom from ccusage's active block.

    Claude Code activity is stored under ~/.claude, not Hermes agent.log. If we
    only count Hermes API-call summaries, Claude looks idle/100% even after a
    heavy Claude Code run. ccusage already knows Claude Code's JSONL format, so
    use it when available and fail closed to the log-derived value.
    """

    # This display service is a local appliance path. Do not run
    # `npx ... @latest` from the timer: even with --offline it leaves package
    # resolution ambiguous and can fail differently depending on cache state.
    # Use the project-pinned ccusage binary when present; otherwise fail closed
    # to the log-derived/unknown row.
    if not CCUSAGE_BIN.is_file():
        return None, None

    try:
        proc = subprocess.run(
            [
                str(CCUSAGE_BIN),
                "blocks",
                "--json",
                "--timezone",
                "America/Chicago",
                "--offline",
            ],
            text=True,
            capture_output=True,
            timeout=12,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None, None
    if proc.returncode != 0 or not proc.stdout.strip():
        return None, None
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, None
    active_blocks = [b for b in data.get("blocks", []) if b.get("isActive") and not b.get("isGap")]
    if not active_blocks:
        return None, None
    block = active_blocks[-1]
    models = " ".join(str(m) for m in block.get("models") or [])
    if "claude" not in models.lower():
        return None, None
    try:
        cost = float(block.get("costUSD") or 0.0)
    except (TypeError, ValueError):
        return None, None
    if cost <= 0:
        return None, None
    headroom = max(0.0, min(1.0, 1.0 - (cost / CLAUDE_MAX_5H_COST_CAP)))
    last_age = None
    actual_end = block.get("actualEndTime")
    start_time = block.get("startTime")
    try:
        if actual_end:
            ts = dt.datetime.fromisoformat(str(actual_end).replace("Z", "+00:00")).timestamp()
            last_age = max(0, int(time.time() - ts))
        elif start_time:
            # Active blocks may not have an end timestamp yet. Use start age as
            # a conservative freshness guard so malformed/ancient artifacts do
            # not keep the route rail looking fresh forever.
            ts = dt.datetime.fromisoformat(str(start_time).replace("Z", "+00:00")).timestamp()
            last_age = max(0, int(time.time() - ts))
    except (TypeError, ValueError):
        return None, None
    if last_age is not None and last_age > PROVIDER_PLAN["anthropic"]["window_minutes"] * 60:
        return None, None
    return headroom, last_age


def main() -> int:
    now = time.time()
    # Scan window = longest configured provider window; default to 5h.
    longest_minutes = max(
        (p["window_minutes"] or 0) for p in PROVIDER_PLAN.values()
    )
    oldest_needed = now - (longest_minutes * 60 if longest_minutes else 3600)

    counts = scan_log(LOG_PATH, oldest_needed)
    providers, active_id = build_providers(now, counts)

    # Prefer real provider/account quota signals. This restores the
    # percentage rail Brian expects for ChatGPT/Codex, Claude, and OpenCode Go.
    apply_confirmed_quota(providers)

    # Alibaba Token Plan monthly usage from the operator's exported console
    # session. When that session is missing or expired the row falls through to
    # the local credential-readiness path below and shows READY, never a guess.
    apply_alibaba_usage(providers)

    # Alibaba Token Plan fallback: the plan key must not be sent by unattended
    # timers; local credential presence shows READY without a percentage.
    apply_alibaba_readiness(providers)

    # Fallback only: ccusage estimates Claude Code blocks when the Anthropic
    # OAuth usage endpoint is unavailable. Do not overwrite confirmed usage.
    claude_headroom, claude_last_age = load_claude_code_headroom()
    if claude_headroom is not None:
        for provider in providers:
            if provider["id"] == "anthropic" and provider.get("state") != "confirmed":
                provider["headroom"] = claude_headroom
                provider["state"] = "inferred"
                if claude_last_age is not None:
                    provider["last_used_age_s"] = claude_last_age
                break

    # Last resort: configured fallback routes that resolve show READY without a
    # fabricated percentage.
    apply_route_availability(providers)

    payload = {
        "as_of_ms": int(now * 1000),
        "active_provider_id": active_id,
        "providers": providers,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, indent=2, allow_nan=False))
    os.replace(tmp, OUT_PATH)
    print(
        f"route-rail updated: active={active_id or '-'} "
        f"providers={len(providers)} at {dt.datetime.fromtimestamp(now).isoformat(timespec='seconds')}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
