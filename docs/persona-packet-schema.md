# Hermes Personal Display Persona Packet Schema

Project: Hermes Personal Display Portal
Target: 320x480 portrait, trusted-home display
Status: v0.1 integration contract for renderer prototype

## BLUF

This contract separates three concerns:

1. `display_state` is the trusted local context feed produced by Hermes collectors.
2. `persona_packet` is the constrained expression packet produced by the personality engine.
3. The renderer treats `persona_packet` as inert data only, clamps it, and draws allowed primitives.

The local home display may show richer status and short snippets because the audience is trusted household/LAN. Credential material is never allowed. Anything sent to WAN or external model providers must use a redacted/allowed route.

Formal JSON Schema: `docs/persona-packet.schema.json`
Example fixtures: `tests/fixtures/display-state-*.json` and `tests/fixtures/persona-packet-*.json`

## Integration contract

```text
Hermes services / Kanban / cron / gateway / host sensors
  -> status collector
  -> display_state.json
  -> personality engine
  -> persona_packet.json
  -> renderer
```

The renderer should be able to run from a cached `persona_packet` if the personality engine or model route is unavailable. The personality engine should be able to run from a sanitized `display_state` without direct access to secrets, raw logs, credentials, or unrestricted chat transcripts.

## File boundaries

Recommended local paths for the first prototype:

| File | Producer | Consumer | Purpose |
|---|---|---|---|
| `~/.hermes/display/display_state.json` | status collector | personality engine, optional debug renderer | Current local context and counters |
| `~/.hermes/display/persona_packet.json` | personality engine | renderer | Current expressive state |
| `~/.hermes/display/persona_history.jsonl` | personality engine | personality engine | Rolling recent-history suppression |

Prototype fixtures in this repo mirror those runtime shapes.

## Trust boundaries

### Local trusted display / trusted LAN

Allowed when sanitized:

- Service health labels: `gateway ok`, `kanban blocked`, `cron stale`.
- Counts and bands: active jobs, blocked cards, CPU/RAM/disk bands, queue counts.
- Short display-safe task titles or summaries.
- Useful local snippets selected for glanceability.
- Wry captions and micro-quips.

Still forbidden:

- API keys, tokens, cookies, private keys, passwords, seed phrases, `.env` values.
- Raw logs likely to contain secrets or uncontrolled third-party/private data.
- Full message bodies unless a collector explicitly marks the summary as display-safe.
- Anything that would make the display feed useful to an attacker if exposed.

### WAN / external model prompts

Before leaving the host or trusted LAN:

- Redact credential-like strings and identifiers not needed for expression.
- Summarize snippets instead of sending raw text.
- Use only explicitly approved/preconfigured model routes.
- Include enums, counters, bands, and short safe summaries, not raw logs.
- Never expose the renderer, state feed, or admin/debug endpoints to the WAN by default.

## Top-level feed shape

The combined runtime feed is an object with two primary children:

```json
{
  "schema_version": "0.1.0",
  "generated_at": "2026-05-16T14:30:00Z",
  "display_state": {},
  "persona_packet": {}
}
```

For runtime simplicity the files may also be split into `display_state.json` and `persona_packet.json`. The schema supports both concepts under `$defs`.

## `display_state`

`display_state` is the input context. It should be factual, compact, and sanitized before use.

Required fields:

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | Contract version, currently `0.1.0`. |
| `generated_at` | string date-time | UTC generation time. |
| `source` | string | Collector name, e.g. `hermes-display-collector`. |
| `boundary` | enum | `local_trusted_display`, `trusted_lan`, `external_redacted`. |
| `mode` | enum | `day`, `evening`, `night`, `quiet`, `focus`, `maintenance`. |
| `overall_status` | enum | `healthy`, `busy`, `degraded`, `attention_needed`, `blocked`, `offline`. |
| `status_summary` | string | Short display-safe status line. |
| `services` | object | Per-service health/status. |
| `activity` | object | Session, gateway, cron, Kanban, and worker counters. |
| `system` | object | Host resource bands and display-safe health indicators. |
| `display_policy` | object | Redaction, route, and snippet permissions. |
| `recent_persona` | array | Recent moods/captions/actions for repeat suppression. |

Optional fields:

| Field | Type | Notes |
|---|---|---|
| `snippets` | array | Sanitized candidate snippets. Each snippet has a `sensitivity` and allowed boundary. |
| `attention` | object | Approval/blocker/failure summary. |
| `weather`, `home`, `calendar` | object | Future safe local summaries, if explicitly collected. |

### `display_state.services`

Service entries are keyed by stable service name:

```json
"services": {
  "gateway": {
    "state": "ok",
    "label": "gateway ok",
    "severity": "info",
    "last_change": "2026-05-16T14:22:00Z"
  }
}
```

Allowed `state`: `ok`, `busy`, `degraded`, `failed`, `blocked`, `unknown`, `stale`.
Allowed `severity`: `info`, `success`, `warning`, `critical`.

### `display_state.activity`

Recommended counters:

```json
"activity": {
  "active_sessions": 1,
  "active_tools": 0,
  "active_workers": 2,
  "cron_running": 0,
  "cron_failed_recent": 0,
  "kanban_ready": 3,
  "kanban_running": 1,
  "kanban_blocked": 0,
  "last_gateway_event": "2026-05-16T14:29:40Z"
}
```

Use counts and short titles, not raw durable task history, unless a collector has specifically marked the title or summary as display-safe.

### `display_state.snippets`

Snippets are optional display candidates. The collector, not the renderer, is responsible for sanitizing them.

```json
{
  "id": "cron-radar-1",
  "text": "trend radar finished cleanly",
  "kind": "cron",
  "sensitivity": "display_safe",
  "allowed_boundaries": ["local_trusted_display", "trusted_lan"],
  "ttl_seconds": 600
}
```

Allowed `sensitivity`:

- `public`
- `display_safe`
- `private_local`
- `redacted_only`
- `forbidden`

The personality engine may use `public`, `display_safe`, and `private_local` only for local trusted display/LAN output. External model prompts should receive only `public`, `display_safe`, or redacted summaries from `redacted_only`. `forbidden` is never shown or sent.

## `persona_packet`

`persona_packet` is the renderer-facing expression contract. It is not code. It is a constrained decision packet.

Required fields:

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | Contract version, currently `0.1.0`. |
| `generated_at` | string date-time | UTC generation time. |
| `valid_for_seconds` | integer | Renderer may keep packet active for this duration. |
| `mood` | enum | Primary state/mood. |
| `skin` | enum | Recognizable Hermes skin. |
| `playfulness` | number 0-1 | Tone intensity. |
| `energy` | number 0-1 | Motion/activity intensity. |
| `focus` | number 0-1 | Attention/focus intensity. |
| `curiosity` | number 0-1 | Ambient exploratory behavior. |
| `impatience` | number 0-1 | Blocked/annoyed pressure. |
| `eyes` | object | Eye expression and behavior. |
| `posture` | object | Body pose and motion bias. |
| `palette` | object | Named palette plus concrete color hints. |
| `micro_actions` | array | Small allowed animation motifs. |
| `caption` | object | One-line display text. |
| `snippet` | object or null | Optional display-safe local snippet. |
| `duration` | object | Timing hints for packet and sub-actions. |
| `avoid_repeating` | object | Repeat-suppression hints. |
| `safety` | object | Boundary and redaction assertions. |

### Mood enum

Allowed values:

- `idle_watchful`
- `thinking_focused`
- `speaking_waveform`
- `working_autonomous`
- `healthy_smug`
- `degraded_skeptical`
- `attention_needed`
- `blocked_annoyed`
- `night_sleepy`
- `offline_fallback`

The renderer may map unknown moods to `offline_fallback`.

### Skin enum

Allowed values:

- `operator-familiar`
- `hermetic-companion`
- `terminal-sprite`
- `night-watcher`
- `incident-imp`

The renderer should preserve the recognizable core anatomy across skins: face/eyes, central body posture, and orbiting status glyphs.

### `eyes`

```json
"eyes": {
  "expression": "relaxed",
  "gaze": "center",
  "blink_rate": "normal",
  "pupil": "soft",
  "intensity": 0.42
}
```

Allowed `expression`: `relaxed`, `focused`, `wide`, `squint`, `side_eye`, `half_lidded`, `sleepy`, `smug`, `offline_blink`.
Allowed `gaze`: `center`, `left`, `right`, `up`, `down`, `wander`, `track_activity`.
Allowed `blink_rate`: `rare`, `slow`, `normal`, `fast`, `staccato`.
Allowed `pupil`: `soft`, `pinpoint`, `scanline`, `waveform`, `spark`, `dim`.

### `posture`

```json
"posture": {
  "pose": "hover_center",
  "tilt": "none",
  "motion": "breathing",
  "orbit": "lazy",
  "scale": 1.0
}
```

Allowed `pose`: `hover_center`, `lean_left`, `lean_right`, `upright_alert`, `slumped_annoyed`, `sleepy_drift`, `diagnostic_still`.
Allowed `tilt`: `none`, `left_small`, `right_small`, `forward`, `back`.
Allowed `motion`: `breathing`, `focused_pulse`, `waveform_pulse`, `work_spark`, `impatient_bounce`, `slow_drift`, `diagnostic_blink`.
Allowed `orbit`: `lazy`, `focused`, `fast`, `clustered`, `crossed`, `dim`, `paused`.

### `palette`

```json
"palette": {
  "name": "cyan-violet-low",
  "background": "#070A12",
  "primary": "#65F3FF",
  "secondary": "#7B61FF",
  "accent": "#FFB84D",
  "danger": "#FF4D7A",
  "brightness": 0.72
}
```

Allowed `name`: `cyan-violet-low`, `graphite-teal`, `phosphor-green`, `amber-skeptic`, `magenta-alert`, `night-ember`, `offline-mono`.

Renderer should clamp brightness to `0.05..1.0`, and may ignore individual colors if a named palette is easier.

### `micro_actions`

Each action is a small motif. The renderer may play zero or more within the packet duration.

```json
{
  "name": "blink_double",
  "weight": 0.8,
  "cooldown_seconds": 18,
  "params": { "count": 2 }
}
```

Allowed action names:

- `blink_single`
- `blink_double`
- `eye_track_left`
- `eye_track_right`
- `mote_reorder`
- `ring_pulse`
- `tool_glyph_spark`
- `gateway_wave`
- `speech_waveform`
- `side_eye_hold`
- `impatient_bounce`
- `glyph_arms_cross`
- `approval_stare`
- `dramatic_sigh_wave`
- `smug_nod`
- `sleepy_yawn_wave`
- `diagnostic_scan`
- `offline_blink`

Unknown actions are ignored, not executed.

### `caption`

```json
"caption": {
  "text": "All green. I remain unconvinced.",
  "tone": "dry",
  "priority": "ambient",
  "max_width_chars": 42
}
```

Guidance:

- Prefer 18-42 characters.
- One line on the 320px display unless the renderer explicitly supports two lines.
- No secrets, raw logs, tokens, credentials, or uncontrolled private text.
- Dry/wry is welcome. Do not become chaotic or childish.

Allowed `tone`: `calm`, `dry`, `wry`, `playful`, `focused`, `skeptical`, `annoyed`, `sleepy`, `urgent`.
Allowed `priority`: `ambient`, `status`, `attention`, `blocked`, `failure`.

### `snippet`

```json
"snippet": {
  "text": "one blocked card wants a human",
  "kind": "kanban",
  "sensitivity": "display_safe",
  "ttl_seconds": 300
}
```

The renderer should display snippets opportunistically, not permanently. It may omit a snippet when space is tight or safety assertions fail.

### `duration`

```json
"duration": {
  "packet_seconds": 90,
  "transition_ms": 600,
  "min_hold_seconds": 20,
  "max_hold_seconds": 120
}
```

Renderer behavior:

- Use `packet_seconds` as a hint, not a hard schedule.
- Fall back to cached packet until stale timeout.
- If no fresh packet exists, use `offline_fallback` and local procedural idle.

### `avoid_repeating`

```json
"avoid_repeating": {
  "captions": ["All green. I remain unconvinced."],
  "micro_actions": ["smug_nod", "ring_pulse"],
  "skins": ["operator-familiar"],
  "moods": ["healthy_smug"],
  "window_seconds": 900
}
```

The personality engine should use this to avoid predictable `if state then exact animation` behavior. The renderer may also use it as a local suppression hint.

### `safety`

```json
"safety": {
  "boundary": "local_trusted_display",
  "redaction_level": "display_safe",
  "contains_credentials": false,
  "external_model_safe": false,
  "notes": ["snippet allowed only for local display"]
}
```

Allowed `boundary`: `local_trusted_display`, `trusted_lan`, `external_redacted`.
Allowed `redaction_level`: `public`, `display_safe`, `private_local`, `redacted`, `blocked`.

If `contains_credentials` is true, the renderer must refuse the packet and use fallback. If `redaction_level` is `blocked`, the renderer must ignore `caption` and `snippet` text.

## Renderer requirements

The renderer must:

1. Treat JSON as data only. Never evaluate strings, script URLs, HTML, templates, CSS, or commands from packets.
2. Validate required fields and clamp enum/numeric values.
3. Ignore unknown fields for forward compatibility.
4. Fall back to `offline_fallback` if validation fails.
5. Enforce text limits and strip control characters.
6. Refuse packets claiming `contains_credentials: true`.
7. Keep the display local-only unless Brian explicitly approves a broader exposure.

## Personality engine requirements

The personality engine should:

1. Consume sanitized `display_state` plus recent packet history.
2. Optionally call a low-cost model only with the allowed boundary context.
3. Return strict JSON matching `persona_packet`.
4. Validate and repair/drop invalid model output before writing the renderer-facing file.
5. Cache the last valid packet.
6. Penalize recent repeats of mood, skin, caption, and action clusters.
7. Prefer expression choices over system actions. The display personality does not control devices or services.

## Versioning

Current version: `0.1.0`

Compatibility rules:

- Minor additions may add optional fields.
- Renderer should ignore unknown fields.
- Breaking changes require `schema_version` bump and fixture updates.
- Keep sample fixtures valid against the formal schema.

## Validation

Basic validation commands from the project root:

```bash
python3 -m json.tool docs/persona-packet.schema.json >/dev/null
python3 -m json.tool tests/fixtures/display-state-healthy.json >/dev/null
python3 -m json.tool tests/fixtures/display-state-blocked.json >/dev/null
python3 -m json.tool tests/fixtures/persona-packet-healthy.json >/dev/null
python3 -m json.tool tests/fixtures/persona-packet-blocked.json >/dev/null
python3 -m json.tool tests/fixtures/persona-packet-thinking.json >/dev/null
```

If `jsonschema` is installed:

```bash
python3 - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator
schema = json.loads(Path('docs/persona-packet.schema.json').read_text())
validator = Draft202012Validator(schema)
for path in Path('tests/fixtures').glob('*.json'):
    data = json.loads(path.read_text())
    validator.validate(data)
    print('ok', path)
PY
```
