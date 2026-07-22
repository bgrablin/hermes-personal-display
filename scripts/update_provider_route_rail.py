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
from pathlib import Path
from typing import Any
import urllib.error
import urllib.parse
import urllib.request

HOME = Path(os.path.expanduser("~"))
PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = HOME / ".hermes/logs/agent.log"
OUT_PATH = HOME / ".hermes/display/provider_route_rail.json"
CCUSAGE_BIN = Path(os.environ.get("HERMES_DISPLAY_CCUSAGE_BIN", PROJECT_ROOT / "node_modules/.bin/ccusage"))
GH_BIN = Path(os.environ.get("HERMES_DISPLAY_GH_BIN", HOME / ".local/bin/gh"))
GITHUB_API_VERSION = "2026-03-10"
COPILOT_PLAN_CREDIT_LIMITS = {
    "pro": 1500.0,
    "pro-plus": 7000.0,
    "max": 20000.0,
}

# Per-provider plan budgets, expressed as a rolling-window request cap.
# Subscription tier caps are public guidance; tune as needed.
PROVIDER_PLAN = {
    # Caps are API-call counts per rolling window (each agent turn fires
    # multiple internal calls — tune from observed agent.log volume).
    "openai-codex": {
        "label": "CHATGPT",
        "tier_label": "PROLITE 5H",
        "rank": 1,
        "window_minutes": 300,
        "request_cap": 1200,
    },
    "anthropic": {
        "label": "CLAUDE",
        "tier_label": "MAX 5H/7D",
        "rank": 2,
        "window_minutes": 300,
        "request_cap": 800,
    },
    "nous": {
        "label": "GEMINI",
        "tier_label": "NOUS",
        "rank": 3,
        "window_minutes": 60,
        "request_cap": 600,
    },
    "copilot": {
        # No usable local quota signal for Copilot today — render as
        # reachable-but-unknown rather than fabricate a number.
        "label": "COPILOT",
        "tier_label": None,
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

ALLOWED_PROVIDER_IDS = set(PROVIDER_PLAN.keys()) | {"google-gemini", "google-gemini-cli", "gemini"}

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
                if prov in {"google-gemini", "google-gemini-cli", "gemini"}:
                    prov = "nous"
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


def fetch_codex_headroom() -> tuple[float | None, float | None, str | None, float | None]:
    """Return confirmed ChatGPT/Codex primary and secondary headroom.

    Returns (primary_headroom, secondary_headroom, tier_label, reset_at_epoch_s).
    reset_at_epoch_s is the Unix timestamp when the primary rate-limit window resets.
    """
    try:
        _load_hermes_env_and_path()
        from agent.credential_pool import load_pool

        pool = load_pool("openai-codex")
        # peek() skips exhausted entries, but the WHAM/usage endpoint is a
        # read-only GET that may still work with an exhausted token.  Try
        # the usable subset first, then fall through to any credential so
        # we can surface the real used_percent even when quota is exhausted.
        entry = pool.peek() if pool else None
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


def fetch_anthropic_headroom() -> tuple[float | None, float | None, float | None]:
    """Return confirmed Anthropic five-hour/weekly headroom and primary reset."""
    try:
        _load_hermes_env_and_path()
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
    except Exception as exc:
        print(f"anthropic quota probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None


def fetch_nous_headroom() -> tuple[float | None, str | None, float | None]:
    """Return confirmed Nous credit headroom, plan, and subscription reset."""
    try:
        _load_hermes_env_and_path()
        from agent.account_usage import build_nous_credits_snapshot
        from hermes_cli.nous_account import get_nous_portal_account_info

        account = get_nous_portal_account_info(force_fresh=True)
        snapshot = build_nous_credits_snapshot(account)
        if not snapshot or not snapshot.windows:
            return None, None, None
        window = snapshot.windows[0]
        if window.used_percent is None:
            return None, None, None
        headroom = max(0.0, min(1.0, 1.0 - float(window.used_percent) / 100.0))
        tier = str(snapshot.plan or "NOUS").strip().upper()[:12] or "NOUS"
        reset_at = None
        period_end = getattr(getattr(account, "subscription", None), "current_period_end", None)
        if period_end:
            try:
                reset_at = dt.datetime.fromisoformat(str(period_end).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                reset_at = None
        return headroom, tier, reset_at
    except Exception as exc:
        print(f"nous quota probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None, None, None


def fetch_copilot_reachable() -> bool:
    """Verify Copilot auth with the read-only model catalog endpoint."""
    try:
        _load_hermes_env_and_path()
        from agent.credential_pool import load_pool

        pool = load_pool("copilot")
        entries = pool.entries() if pool else []
        for entry in entries:
            token = str(getattr(entry, "runtime_api_key", "") or "").strip()
            if not token:
                continue
            request = urllib.request.Request(
                "https://api.githubcopilot.com/models",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json",
                    "Editor-Version": "vscode/1.95.0",
                    "Editor-Plugin-Version": "copilot-chat/0.22.0",
                    "User-Agent": "GitHubCopilotChat/0.22.0",
                },
                method="GET",
            )
            try:
                with urllib.request.urlopen(request, timeout=10.0) as response:
                    payload = json.loads(response.read().decode("utf-8")) or {}
                models = payload.get("data") if isinstance(payload, dict) else payload
                if isinstance(models, list) and models:
                    return True
            except Exception:
                continue
    except Exception as exc:
        print(f"copilot catalog probe failed: {type(exc).__name__}: {exc}", file=sys.stderr)
    return False


def _copilot_plan() -> str:
    raw = str(os.environ.get("HERMES_DISPLAY_COPILOT_PLAN") or "").strip().lower()
    normalized = raw.replace("_", "-").replace("+", "-plus").replace(" ", "-")
    aliases = {
        "proplus": "pro-plus",
        "pro--plus": "pro-plus",
        "copilot-pro": "pro",
        "copilot-pro-plus": "pro-plus",
        "copilot-max": "max",
    }
    return aliases.get(normalized, normalized)


def _copilot_credit_limit() -> float | None:
    override = str(os.environ.get("HERMES_DISPLAY_COPILOT_CREDIT_LIMIT") or "").strip()
    if override:
        try:
            value = float(override)
            if math.isfinite(value) and 0 < value <= 1_000_000_000:
                return value
        except ValueError:
            return None
        return None
    return COPILOT_PLAN_CREDIT_LIMITS.get(_copilot_plan())


def _next_month_reset_epoch(now: dt.datetime) -> float:
    if now.month == 12:
        reset = dt.datetime(now.year + 1, 1, 1, tzinfo=dt.timezone.utc)
    else:
        reset = dt.datetime(now.year, now.month + 1, 1, tzinfo=dt.timezone.utc)
    return reset.timestamp()


def _copilot_billing_tokens() -> list[str]:
    _load_hermes_env_and_path()
    tokens: list[str] = []
    for name in (
        "HERMES_DISPLAY_GITHUB_TOKEN",
        "GITHUB_TOKEN",
        "GH_TOKEN",
        "COPILOT_GITHUB_TOKEN",
    ):
        token = str(os.environ.get(name) or "").strip()
        if token and token not in tokens:
            tokens.append(token)
    if GH_BIN.is_file():
        try:
            result = subprocess.run(
                [str(GH_BIN), "auth", "token"],
                text=True,
                capture_output=True,
                timeout=5,
                check=False,
            )
            token = result.stdout.strip() if result.returncode == 0 else ""
            if token and token not in tokens:
                tokens.append(token)
        except (OSError, subprocess.TimeoutExpired):
            pass
    return tokens


def _github_json(url: str, token: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
            "User-Agent": "hermes-personal-display",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=12.0) as response:
        payload = json.loads(response.read().decode("utf-8")) or {}
    return payload if isinstance(payload, dict) else {}


def _copilot_billing_account(token: str) -> str | None:
    configured = str(os.environ.get("HERMES_DISPLAY_COPILOT_ACCOUNT") or "").strip()
    account_pattern = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?"
    if configured:
        return configured if re.fullmatch(account_pattern, configured) else None
    payload = _github_json("https://api.github.com/user", token)
    login = str(payload.get("login") or "").strip()
    return login if login and re.fullmatch(account_pattern, login) else None


def fetch_copilot_usage() -> dict[str, Any] | None:
    """Return confirmed Copilot AI-credit usage from GitHub's billing API.

    Personal-plan allowance comes from an explicit local plan or credit-limit
    setting. If GitHub reports consumption but no limit is configured, retain
    the confirmed credits-used value without inventing percentage headroom.
    """
    try:
        tokens = _copilot_billing_tokens()
    except Exception as exc:
        print(f"copilot billing credential load failed: {type(exc).__name__}", file=sys.stderr)
        return None
    if not tokens:
        return None

    now = dt.datetime.now(dt.timezone.utc)
    query = urllib.parse.urlencode({"year": now.year, "month": now.month})
    for token in tokens:
        try:
            account = _copilot_billing_account(token)
            if not account:
                continue
            payload = _github_json(
                f"https://api.github.com/users/{account}/settings/billing/ai_credit/usage?{query}",
                token,
            )
            items = payload.get("usageItems")
            if not isinstance(items, list):
                continue
            credits_used = 0.0
            recognized_items = 0
            malformed_items = False
            for item in items:
                if not isinstance(item, dict):
                    malformed_items = True
                    break
                unit = str(item.get("unitType") or "").strip().lower()
                if unit not in {"ai-credits", "credits"}:
                    malformed_items = True
                    break
                # grossQuantity is total AI-credit consumption before included
                # allowance discounts. netQuantity can be zero while allowance
                # was still consumed.
                raw_quantity = item.get("grossQuantity")
                if isinstance(raw_quantity, bool) or not isinstance(raw_quantity, (int, float, str)):
                    malformed_items = True
                    break
                try:
                    quantity = float(raw_quantity)
                except (TypeError, ValueError):
                    malformed_items = True
                    break
                if not math.isfinite(quantity) or quantity < 0:
                    malformed_items = True
                    break
                recognized_items += 1
                credits_used += quantity
            if malformed_items or (items and recognized_items == 0) or not math.isfinite(credits_used):
                continue
            credit_limit = _copilot_credit_limit()
            headroom = None
            if credit_limit is not None:
                headroom = max(0.0, min(1.0, 1.0 - credits_used / credit_limit))
            plan = _copilot_plan()
            tier = {"pro": "PRO", "pro-plus": "PRO+", "max": "MAX"}.get(plan, "CREDITS")
            return {
                "headroom": headroom,
                "credits_used": credits_used,
                "credits_limit": credit_limit,
                "tier_label": tier,
                "reset_at_epoch_s": _next_month_reset_epoch(now),
            }
        except Exception:
            continue
    return None


def apply_verified_reachability(providers: list[dict]) -> None:
    """Promote safely probed unmetered providers to READY semantics."""
    if not fetch_copilot_reachable():
        return
    for provider in providers:
        if provider.get("id") == "copilot" and provider.get("state") == "unknown":
            provider.update(
                state="inferred",
                headroom=None,
                secondary_headroom=None,
                tier_label="CATALOG",
                last_used_age_s=0,
            )
            return


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
    for entry in cfg.get("fallback_providers") or []:
        provider = str(entry.get("provider") or "").strip()
        model = str(entry.get("model") or "").strip()
        if provider and model:
            routes[provider] = (provider, model)
            # The route rail's Gemini row is backed by the configured Nous
            # Gemini fallback, not the removed google-gemini-cli provider.
            if provider == "nous" and "gemini" in model.lower():
                routes["nous"] = (provider, model)
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
            if provider in {"gemini", "anthropic", "openrouter", "nous", "copilot", "openai-codex"}:
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
    nous_headroom, nous_tier, nous_reset_at = fetch_nous_headroom()
    copilot_usage = fetch_copilot_usage()

    quota_updates: dict[str, dict[str, Any]] = {}
    if codex_headroom is not None:
        quota_updates["openai-codex"] = {
            "state": "confirmed",
            "headroom": codex_headroom,
            "secondary_headroom": codex_secondary,
            "tier_label": f"{codex_tier} 5H" if codex_tier else PROVIDER_PLAN["openai-codex"]["tier_label"],
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
    if nous_headroom is not None:
        quota_updates["nous"] = {
            "state": "confirmed",
            "headroom": nous_headroom,
            "secondary_headroom": None,
            "tier_label": nous_tier or PROVIDER_PLAN["nous"]["tier_label"],
            "reset_at_epoch_s": nous_reset_at,
            "last_used_age_s": 0,
        }
    if copilot_usage is not None:
        quota_updates["copilot"] = {
            "state": "confirmed",
            "headroom": copilot_usage.get("headroom"),
            "secondary_headroom": None,
            "credits_used": copilot_usage.get("credits_used"),
            "credits_limit": copilot_usage.get("credits_limit"),
            "tier_label": copilot_usage.get("tier_label") or "CREDITS",
            "reset_at_epoch_s": copilot_usage.get("reset_at_epoch_s"),
            "last_used_age_s": 0,
        }

    for provider in providers:
        update = quota_updates.get(provider["id"])
        if update:
            provider.update(update)


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
    # percentage rail Brian expects for ChatGPT/Codex, Claude, and Gemini.
    apply_confirmed_quota(providers)

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

    # Last resort: safely probed unmetered providers and configured routes show
    # READY without a fabricated percentage.
    apply_verified_reachability(providers)
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
