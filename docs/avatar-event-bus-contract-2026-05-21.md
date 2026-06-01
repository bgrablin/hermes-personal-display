# Avatar Event Bus Contract

Project: Hermes Personal Display
Date: 2026-05-21
Status: v0.1 review contract, not wired to live interception
Boundary: localhost-only / same-user runtime

## BLUF

Add a local-only avatar event bus beside the existing state API and polling path. The bus carries display-safe lifecycle intents so the renderer can react faster to Hermes activity without becoming a chat/log renderer.

Recommendation: implement a loopback-only HTTP Server-Sent Events stream first, backed by a bounded in-process queue and optional append-only JSONL fallback under `~/.hermes/display/avatar-events.jsonl`. Bind only to `127.0.0.1` or `::1`, reject non-loopback Host/remote addresses, and keep the current polling state feed as the source of truth until the event path is proven.

Go/no-go: go for a local prototype after review. Do not add LAN exposure, prompt/final-answer payloads, or platform interception in the first implementation slice.

## Integration contract

```text
Hermes lifecycle adapters, local renderer touch handler, feed monitor
  -> avatar event bus publisher
  -> loopback-only SSE endpoint or local JSONL fallback
  -> renderer event adapter
  -> deterministic renderer state reducer
  -> SVG puppet/runtime DOM updates

Existing display_state/persona_packet polling remains in place.
```

The renderer remains the only DOM/SVG writer. Event consumers must treat events as inert data and reduce them into existing renderer intents such as gaze, blink, mouth, tool glyph, stale badge, and caption priority. The event bus does not replace `display_state.json`, `persona_packet.json`, or the current `/state`/polling path in the first phase.

## Transport recommendation

### Preferred MVP: loopback HTTP + SSE

Endpoint shape:

```text
Bind: 127.0.0.1 only by default
GET  /avatar-events/health
GET  /avatar-events/stream       text/event-stream
POST /avatar-events/publish      localhost publisher only, optional for test harness
```

SSE frame:

```text
event: assistant.tool_started
id: 2026-05-21T14:35:12.220Z-000042
data: {"schema_version":"0.1.0","event":"assistant.tool_started",...}
```

Why SSE first:

- Browser runtime can consume it natively with `EventSource`.
- One-way stream matches the renderer need: receive local lifecycle hints.
- Lower complexity than WebSocket and easier to keep deterministic.
- No filesystem permission edge cases for browser clients.
- Easy to degrade to polling when disconnected.

Hard requirements:

- Bind to loopback only. No `0.0.0.0` default.
- No unauthenticated LAN endpoint.
- Use CORS `same-origin` or no CORS header. Do not use wildcard CORS.
- Enforce a small event body size, recommended max 2048 bytes.
- Keep a bounded replay buffer, recommended 50-200 events or 5 minutes.
- Drop events that fail schema, privacy, or allowlist checks.
- Log only event type, event id, validation outcome, and sanitized reason.

### Fallback: local JSONL event queue

Path:

```text
~/.hermes/display/avatar-events.jsonl
```

Each line is one validated event object. Writers use temp file plus append/rename or a short file lock. Consumers track byte offset and tolerate truncation/rotation.

Use when:

- The renderer is not served by a local HTTP daemon.
- The SSE process is down but local file polling still works.
- A test fixture or replay harness needs deterministic input.

Tradeoff: files avoid ports but are slower for momentary animation cues and are awkward from a browser unless the existing local server exposes them.

### Deferred: Unix domain socket

A Unix socket is acceptable for Python/native consumers but not the browser renderer without an HTTP bridge. Keep it as a later internal publisher transport if the lifecycle adapters need stronger filesystem permission boundaries.

## Event schema

Schema version: `0.1.0`

Canonical JSON object:

```json
{
  "schema_version": "0.1.0",
  "id": "2026-05-21T14:35:12.220Z-000042",
  "event": "assistant.tool_started",
  "occurred_at": "2026-05-21T14:35:12.220Z",
  "source": "hermes.gateway.lifecycle",
  "boundary": "localhost_only",
  "privacy": "display_safe_intent",
  "ttl_ms": 12000,
  "priority": "normal",
  "sequence": 42,
  "correlation_id": "turn-7f3a9c",
  "display": {
    "intent": "tool_active",
    "visual_kind": "shell",
    "label": "tool running",
    "glyph": "terminal",
    "intensity": 0.7
  },
  "meta": {
    "tool_kind": "shell"
  }
}
```

Required fields:

| Field | Type | Rules |
|---|---|---|
| `schema_version` | string | `0.1.0` for this contract |
| `id` | string | Unique, sortable, max 96 chars |
| `event` | enum | One of the allowlisted event names below |
| `occurred_at` | RFC 3339 string | UTC preferred |
| `source` | string | Stable adapter name, max 80 chars |
| `boundary` | enum | Must be `localhost_only` in v0.1 |
| `privacy` | enum | Must be `display_safe_intent` in v0.1 |
| `ttl_ms` | integer | 250-300000; renderer ignores expired events |
| `priority` | enum | `ambient`, `normal`, `attention`, `recovery` |
| `display` | object | Renderer-facing visual intent only |

Optional fields:

| Field | Type | Rules |
|---|---|---|
| `sequence` | integer | Monotonic per publisher when available |
| `correlation_id` | string | Safe opaque id, max 80 chars; not a prompt/session dump |
| `meta` | object | Allowlisted compact enums/counters only |

### `display` object

Required:

| Field | Type | Rules |
|---|---|---|
| `intent` | enum | Renderer reducer intent |
| `label` | string | Display-safe short label, max 48 chars |

Optional:

| Field | Type | Rules |
|---|---|---|
| `visual_kind` | enum | `shell`, `python`, `reading`, `searching`, `patching`, `writing`, `planning`, `reasoning`, `recalling`, `compressing`, `touch`, `feed`, `recovery`, `unknown` |
| `glyph` | enum | `terminal`, `python`, `book`, `search`, `patch`, `pen`, `plan`, `brain`, `memory`, `zip`, `tap`, `warning`, `check`, `none` |
| `intensity` | number | 0.0-1.0, renderer clamps |
| `side` | enum | `left`, `center`, `right`, `top`, `bottom` for touch/location events |

Allowed `display.intent` values:

- `assistant_active`
- `tool_active`
- `tool_settled`
- `waiting_on_user`
- `finalizing`
- `final_complete`
- `display_recovered`
- `touch_tap`
- `touch_long_press`
- `feed_stale`
- `feed_lost`
- `feed_recovered`

### `meta` object rules

`meta` is optional and intentionally narrow. It may contain only compact display-safe fields:

- `tool_kind`: one of `shell`, `python`, `browser`, `web`, `file`, `kanban`, `home_assistant`, `cron`, `other`.
- `duration_ms`: non-negative integer for completed events.
- `result`: one of `ok`, `failed`, `cancelled`, `timeout`, `unknown`.
- `failure_kind`: one of `network`, `timeout`, `validation`, `unavailable`, `unknown`.
- `feed_age_ms`: non-negative integer for feed events.
- `tap_count`: small integer 1-5 for touch events.

No free-form prompt, answer, log, path dump, exception dump, or tool output belongs in `meta`.

## Event list and renderer mapping

| Event | Display intent | Typical visual mapping | TTL |
|---|---|---|---:|
| `assistant.started` | `assistant_active` | eyes focused, orbit tightens, subtle wake/perk | 15000 |
| `assistant.tool_started` | `tool_active` | tool glyph spark, gaze track activity, focused pulse | 12000 |
| `assistant.tool_finished` | `tool_settled` | glyph check/fade, blink single, return toward prior mood | 8000 |
| `assistant.waiting_on_user` | `waiting_on_user` | side-eye or attentive stare, attention badge | 300000 |
| `assistant.final_started` | `finalizing` | mouth/waveform motion, speaking/finalizing cue | 15000 |
| `assistant.final_complete` | `final_complete` | smug nod or calm blink, settle to idle/last packet | 10000 |
| `system.display_recovered` | `display_recovered` | recovery pulse, clear stale badge after fresh state | 15000 |
| `touch.tap` | `touch_tap` | touch ripple/rail glow plus gaze toward touch side | 3000 |
| `touch.long_press` | `touch_long_press` | diagnostic still or deliberate nod, never dangerous action by itself | 5000 |
| `feed.stale` | `feed_stale` | visible quiet/stale badge, preserve last-known mood briefly | 60000 |
| `feed.lost` | `feed_lost` | offline/degraded badge, dim orbit, avoid healthy-looking idle | 300000 |
| `feed.recovered` | `feed_recovered` | clear stale badge, recovery pulse, resume normal state | 15000 |

Event names are stable. Additive fields are allowed only under a schema version bump or explicitly optional fields. Unknown event names must be ignored by the renderer and counted as validation drops.

## Privacy and safety rules

Allowed content:

- Lifecycle state names from the allowlist.
- Display-safe labels such as `tool running`, `waiting`, `feed stale`, `finalizing`.
- Coarse tool categories and visual kinds.
- Small counters and durations.
- Opaque correlation ids that are not derived from raw prompts, answers, secrets, file paths, or logs.

Forbidden content:

- Raw prompts.
- Chain-of-thought or hidden reasoning.
- Final answers or answer excerpts.
- Tool inputs/outputs except coarse allowlisted categories.
- Logs, stack traces, exception text, private document contents, note contents, chat transcripts, email bodies, calendar bodies, or task bodies.
- Secrets or credential-shaped strings: tokens, cookies, passwords, private keys, SSH keys, bearer strings, API keys, session ids, `.env` values, seed phrases.
- CUI, proposal-sensitive, work-controlled, customer, medical, financial, or family-private content.
- Unredacted local file paths unless explicitly added later for a trusted debug mode.

Validation gate behavior:

1. Reject if `boundary != localhost_only`.
2. Reject if `privacy != display_safe_intent`.
3. Reject if `event` or `display.intent` is not allowlisted.
4. Reject if body exceeds max size.
5. Reject if any string matches credential-shaped patterns.
6. Reject if forbidden free-form fields are present.
7. Clamp `ttl_ms` and `display.intensity`.
8. Log sanitized rejection reason only.

## Fallback behavior

Renderer behavior when the event bus is unavailable:

- Continue the existing state/persona polling path.
- Keep current deterministic idle/live behavior.
- Show no scary error for short bus outages; the bus is enhancement-only.
- After sustained event-bus disconnect, optionally expose a small debug-only indicator, not a primary display alarm.

Renderer behavior when events are stale or missing:

- Expire events by `occurred_at + ttl_ms`.
- Return to the current persona packet or existing reducer state.
- Do not infer assistant inactivity solely from missing events.

Bus/server behavior on overload:

- Prefer dropping low-priority ambient events over blocking renderer updates.
- Coalesce repeated `assistant.tool_started` or `feed.stale` events by correlation/feed state.
- Keep last known feed and persona files authoritative.

Fallback order:

1. Live SSE event if connected and valid.
2. Last valid SSE replay event within TTL after reconnect.
3. JSONL queue polling if configured.
4. Existing state/persona polling.
5. Offline fallback persona only when state/persona feed is also stale/lost.

## Rollout steps

### Phase 0: review contract

- Review this document.
- Keep live Hermes interception untouched.
- Use fixture-only validation to prove the event shape.

### Phase 1: local bus scaffold

- Add a small same-user local server or extend the existing local display server with `/avatar-events/health` and `/avatar-events/stream` bound to loopback.
- Add schema/validator module and unit fixtures.
- Add a manual fixture publisher only. No gateway/session interception yet.
- Verify browser renderer can connect from the local kiosk page.

### Phase 2: renderer adapter

- Add an event reducer beside existing polling state reducer.
- Map event intents to existing deterministic puppet behaviors.
- Ensure polling state remains authoritative and can overwrite stale event-derived visuals.
- Add debug handle for recent accepted/dropped events.

### Phase 3: lifecycle publisher adapters

- Add explicit publisher hooks for safe lifecycle events only.
- Start with assistant/tool/final lifecycle from a local trusted adapter.
- Add touch events from renderer-local input path.
- Add feed stale/lost/recovered from the existing feed monitor.
- Keep all publishers behind config flags.

### Phase 4: hardening

- Add bounded replay, backpressure/drop counters, sanitized logs, and rejection metrics.
- Add systemd-user service only if the bus is separated from the current display server.
- Add review screenshots and browser-console verification.
- Consider Unix socket publisher transport only if multiple local writers need stricter same-user permissions.

## First implementation plan

Recommended first implementation slice after review:

1. `docs/avatar-event-bus.schema.json` or in-code equivalent for v0.1 event validation.
2. `scripts/validate-avatar-event-fixtures.py` validating fixtures and secret-shaped string rejection.
3. `tests/fixtures/avatar-events/*.json` covering started/tool/final/feed/touch cases.
4. Loopback-only SSE scaffold in the existing local server or a dedicated small process.
5. Renderer `EventSource` adapter that only records recent events and exposes debug state. Do not animate from events until validation and reconnect behavior are proven.
6. Second slice maps accepted events to deterministic puppet intents.

## Next implementation cards after review

1. `display: add avatar event schema and loopback SSE scaffold`
   - Assignee: integrator or implementation engineer.
   - Acceptance: loopback health/stream endpoint, validation gate, fixture publisher, no LAN bind, no live Hermes interception.

2. `display: add renderer EventSource adapter and debug replay panel`
   - Assignee: frontend/display engineer.
   - Acceptance: renderer connects locally, records accepted/dropped event counters, falls back cleanly to polling, no DOM writes outside renderer reducer.

3. `display: map avatar events to deterministic puppet lifecycle intents`
   - Assignee: frontend/display engineer.
   - Acceptance: visual mappings for assistant/tool/final/feed/touch events, stale events expire, polling persona remains authoritative.

4. `display: add safe Hermes lifecycle publishers behind config flag`
   - Assignee: integrator.
   - Acceptance: publishes allowlisted lifecycle events only, privacy validator rejects unsafe strings, sanitized logs, disabled by default until reviewed.

## Open decisions for Brian/review

- Whether to extend the existing display server or run a tiny separate loopback event-bus process.
- Whether the renderer should animate from events in phase 2 or only record/debug them until phase 3.
- Whether local JSONL fallback is required for MVP or only for tests/replay.

## Verification notes

This contract intentionally avoids live platform interception. The accompanying fixture/validation stub, if present, exercises only local JSON examples and privacy gates.
