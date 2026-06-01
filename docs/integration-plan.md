# Hermes Personal Display Integration Plan

Project: Hermes Personal Display Portal
Target: 320x480 portrait, 3.5 inch trusted-home display
Status: phase-0 integration plan for post-prototype implementation

## BLUF

Use a local-first file contract for the MVP: a read-only status collector writes `~/.hermes/display/display_state.json`; a constrained `personality_engine.py` reads that state plus recent history and writes `~/.hermes/display/persona_packet.json`; the renderer polls the persona packet and falls back to a cached/offline packet when anything upstream fails.

Do not expose the state feed to the WAN. Do not send raw logs, credentials, full messages, or controlled/work-sensitive content to model providers. The display is a trusted-home surface, so sanitized local snippets and wry status text are allowed, but external model prompts must use redacted summaries and explicitly approved routes.

## Recommended architecture

```text
Hermes local services / Kanban / cron / gateway / host sensors
  -> scripts/display_state_collector.py
  -> ~/.hermes/display/display_state.json
  -> src/personality_engine.py
  -> ~/.hermes/display/persona_packet.json
  -> 320x480 renderer prototype
```

Keep the display pipeline one-way and read-mostly:

1. Collect state from local sources.
2. Sanitize and collapse it into display-safe counters, bands, labels, and snippets.
3. Optionally ask a low-cost/local model to choose expressive state.
4. Validate the returned persona packet against `docs/persona-packet.schema.json`.
5. Atomically write the current packet and append compact history.
6. Renderer treats all packets as inert data and never executes model output.

## Integration contract

Runtime files:

| Path | Producer | Consumer | Cadence | Notes |
|---|---|---|---:|---|
| `~/.hermes/display/display_state.json` | status collector | personality engine, debug renderer | 10-30 seconds | Sanitized local context and counters |
| `~/.hermes/display/persona_packet.json` | personality engine | renderer | 60-180 seconds active, 5-15 minutes quiet/night | Current expression packet |
| `~/.hermes/display/persona_packet.last_good.json` | personality engine | renderer, engine fallback | on valid packet | Last known valid packet |
| `~/.hermes/display/persona_history.jsonl` | personality engine | personality engine | append per valid packet | Rolling repeat-suppression history |
| `~/.hermes/display/manual_override.json` | Brian/operator | collector/engine | optional | Local-only forced mood/status for demos or review |
| `~/.hermes/logs/personal-display-collector.log` | collector | operator | on events/errors | No secrets, short operational logs |
| `~/.hermes/logs/personal-display-engine.log` | personality engine | operator | on events/errors | No prompts containing private raw content |

Repository files:

| Path | Purpose |
|---|---|
| `docs/persona-packet-schema.md` | Human-readable data contract |
| `docs/persona-packet.schema.json` | Formal schema for display state and persona packets |
| `docs/character-bible.md` | Character identity, moods, skins, motion vocabulary |
| `docs/animation-library-research.md` | Renderer stack recommendation |
| `docs/hardware-intake-checklist.md` | Read-only hardware arrival and driver safety checklist |
| `docs/integration-plan.md` | This integration plan |
| `tests/fixtures/*.json` | Known-good schema fixtures |

## `state.json` vs local API

### MVP recommendation: files first

Use JSON files first, not a daemon API.

Why:

- Lowest operational surface area.
- No open port, token, CORS, or LAN exposure risk.
- Easy renderer polling and debug inspection.
- Atomic writes are enough for a 320x480 status display.
- Works whether the final renderer is browser kiosk, Pygame/framebuffer, or a terminal fallback.

Implementation rule: write to a temporary file in the same directory, validate, then `os.replace()` into place.

Example runtime path:

```text
~/.hermes/display/display_state.json
~/.hermes/display/persona_packet.json
```

### When to add a local API

Add a loopback-only API only after the file contract is proven and there is a concrete need, such as:

- Browser kiosk cannot read local files safely in the selected launch mode.
- Multiple renderer/debug clients need the same feed.
- Health endpoint is needed for systemd watchdog or Home Assistant read-only status.
- Server-sent events become useful to avoid polling.

If added, keep it bound to loopback by default:

```text
127.0.0.1:8765
GET /health
GET /display_state
GET /persona_packet
```

LAN exposure is not part of the MVP. If Brian later wants LAN diagnostics, add token protection, redacted output, and explicit bind configuration. Never expose admin/session/config surfaces through this API.

## State collector location and responsibilities

Recommended path for implementation:

```text
scripts/display_state_collector.py
```

Runtime output directory:

```text
~/.hermes/display/
```

Collector responsibilities:

1. Create `~/.hermes/display/` with restrictive user-owned permissions where practical.
2. Read local state from approved sources only.
3. Convert raw source data into display-safe fields.
4. Redact or drop secret-shaped strings before writing state.
5. Mark freshness with UTC timestamps.
6. Set `overall_status` from the worst meaningful condition, not from a single brittle check.
7. Write `display_state.json` atomically.
8. Avoid slow model calls or renderer logic. The collector is factual, not expressive.

Suggested source adapters:

| Source | Collection method | Initial fields | Caveats |
|---|---|---|---|
| Hermes gateway | `systemctl --user is-active hermes-gateway.service` | service state label | Do not parse full logs for MVP |
| Signal daemon | `systemctl --user is-active signal-cli.service` or local health if available | service state label | Do not display message bodies |
| Home Assistant reachability | loopback/LAN health check only if credentials are already configured safely | service state label | No device actions from display collector |
| Obsidian sync | service status or known sync watchdog output | `ok/stale/unknown` | Do not display private note titles by default |
| Kanban | SQLite/read-only helper or Hermes Kanban API/CLI when available | counts: ready/running/blocked | Do not display raw bodies; titles only if display-safe |
| Cron | Hermes cron status/list, recent failures | failed/running counts | Avoid raw job output |
| Host resources | `psutil` or `/proc` | CPU/RAM/disk/temp bands | Numeric bands preferred over noisy precision |
| Manual override | `manual_override.json` | forced mode/status/caption for demos | Local-only, short TTL |

Preferred initial update cadence:

- Collector: every 10 seconds while renderer is running, 30 seconds if daemonized always-on.
- Host/resource fields: every collector tick.
- Service status fields: every 30 seconds or on alternating ticks.
- Kanban/cron summaries: every 30-60 seconds unless a cheap native API exists.
- Obsidian/Home Assistant checks: every 60-300 seconds to avoid noisy local dependencies.

## `personality_engine.py` responsibilities

Recommended path for implementation:

```text
src/personality_engine.py
```

The personality engine is the expressive middle layer. It does not collect raw system state and it does not render.

Responsibilities:

1. Load `display_state.json` and reject stale/invalid state.
2. Load a bounded recent-history window from `persona_history.jsonl`.
3. Select whether a model call is needed or a deterministic/cache path is sufficient.
4. Build a boundary-aware prompt/context packet using only allowed state and snippets.
5. Call a configured low-cost/local model with strict timeout and budget controls, if allowed.
6. Validate model output against `docs/persona-packet.schema.json`.
7. Repair only safe, mechanical issues such as missing optional fields or overlong captions. Do not repair unsafe content into acceptability silently.
8. Drop/refuse packets containing credential-shaped material or `safety.contains_credentials=true`.
9. Write `persona_packet.json` and `persona_packet.last_good.json` atomically.
10. Append a compact history record for repeat suppression.
11. Fall back to deterministic procedural packets when the model fails, times out, returns invalid JSON, exceeds budget, or is disabled.

The engine decides expression only:

- mood
- skin
- energy/playfulness/focus/impatience
- eyes and posture
- palette
- micro-actions
- caption and optional snippet

The engine must not:

- run shell commands from model output
- control Home Assistant devices
- modify Kanban tasks
- read credentials directly
- expose state to WAN
- depend on raw chat logs or full message bodies

## Model routing and cost strategy

### Default posture

Start with deterministic fallback and static quip pools so the display works without a model. Add model-assisted variation only after the renderer consumes validated packets reliably.

### Local or included-quota first

Candidate routes, in priority order:

1. Deterministic local rules plus static approved quips for MVP reliability.
2. Local model endpoint if installed and fast enough on the NUC, for example llama.cpp or Ollama serving a small instruct model that can return JSON.
3. Existing Hermes subscription/included-quota route, if configured and stable.
4. Cheap hosted structured-output-capable model using redacted/summarized prompt context only.
5. Premium PAYG route only as an explicitly enabled safety net, not a default background loop.

Use Brian's model-routing preference: prefer subscription/included-quota routes before PAYG API-key routes, while balancing capability and cost.

### Call policy

Recommended settings:

| Mode | Model call cadence | Max latency | Behavior |
|---|---:|---:|---|
| Active/thinking/working | 60-180 seconds | 3 seconds | model allowed if budget healthy |
| Idle/healthy | 3-10 minutes | 3 seconds | mostly cache/light mutation |
| Night/quiet | 5-15 minutes | 2 seconds | deterministic or very sparse model use |
| Attention/blocked | immediately on transition, then 2-5 minutes | 3 seconds | model allowed for short annoyed/wry caption if safe |
| Model degraded | none until backoff expires | n/a | deterministic fallback |

Suggested budget controls:

- Daily call cap for external models.
- Monthly cost cap if provider exposes cost telemetry.
- Exponential backoff after failures.
- Disable external calls automatically if schema validation fails repeatedly.
- Log only route name, outcome, latency, and token/cost summary if available. Do not log raw sensitive prompts.

## Prompt and boundary behavior

External model prompt input should be a reduced expression context, not the whole `display_state`.

Allowed in model prompts:

- schema version and allowed enums
- time band: morning/day/evening/night
- overall status: healthy/busy/degraded/blocked/offline
- service labels without secrets
- activity counts and coarse resource bands
- recent mood/caption/action summaries
- display-safe snippets or redacted summaries
- style constraints from `docs/character-bible.md`

Do not send to external models:

- credential material
- raw logs
- `.env` contents
- raw chat transcripts
- full message bodies
- private note contents
- work-controlled/CUI/proposal-sensitive content
- unredacted file paths that reveal sensitive details

Local trusted display output can be richer than external prompts, but still must not include credentials or raw sensitive logs.

Boundary decisions:

| Boundary | Allowed behavior |
|---|---|
| Local trusted display | Show sanitized useful status, short display-safe snippets, playful captions, task counts, blocked summaries |
| Trusted LAN debug | Same as local display if explicitly enabled and not WAN-routed |
| External model prompt | Redacted counters, bands, safe snippets, strict schema, no secrets/raw private content |
| WAN | No display feed or renderer exposure by default |

## Cache and history files

`persona_history.jsonl` should keep a compact rolling record, not full packets forever.

Recommended line shape:

```json
{"at":"2026-05-16T15:10:00Z","mood":"blocked_annoyed","skin":"incident-imp","caption":"Waiting on a human-shaped API.","micro_actions":["side_eye_hold","impatient_bounce"],"source":"model"}
```

Retention:

- Keep last 200 entries or last 7 days, whichever is smaller.
- Do not store raw model prompts by default.
- Do not store private snippets unless already display-safe and short-lived.
- Keep enough caption/action history to avoid repetitive behavior.

Cache files:

- `persona_packet.last_good.json`: last schema-valid safe packet.
- `model_backoff.json`: route failure counts, next retry time, and budget status.
- `collector_status.json`: optional self-health for debug and service watchdog.

## Fallback behavior

Fallback must preserve the illusion of life even when upstream systems fail.

### Collector failure

Renderer behavior:

- If `persona_packet.json` is fresh, continue using it until its stale threshold.
- If state is stale beyond threshold, shift to `offline_fallback` packet.
- Caption examples: `State feed stale. Still watching.`, `Local pulse missing.`, `Dim, not gone.`

Engine behavior:

- If `display_state.json` is missing/invalid/stale, use last-good packet or generate deterministic `offline_fallback`.
- Do not call external models with stale/unknown state.

### Model failure

Engine behavior:

- Validate failure mode and record short operational log.
- Back off the failing route.
- Generate deterministic packet from current state and static quip pools.
- Preserve recent-history suppression even for fallback captions.

Fallback mapping:

| `overall_status` | fallback mood | skin | example caption |
|---|---|---|---|
| `healthy` | `healthy_smug` | `operator-familiar` | `All green. I remain unconvinced.` |
| `busy` | `working_autonomous` | `operator-familiar` | `Background goblins are moving.` |
| `degraded` | `degraded_skeptical` | `incident-imp` | `Something is sulking.` |
| `attention_needed` | `attention_needed` | `incident-imp` | `This needs Brian, not vibes.` |
| `blocked` | `blocked_annoyed` | `incident-imp` | `Blocked. I have developed a stare.` |
| `offline` | `offline_fallback` | `night-watcher` | `Dim, not gone.` |

### Renderer failure

Renderer should be restartable without corrupting state:

- On startup, load `persona_packet.json`.
- If invalid, load `persona_packet.last_good.json`.
- If both invalid/missing, synthesize internal `offline_fallback` without writing upstream files.
- Keep animation running with procedural breathing/blinking even with no data.

## Staged MVP

### Stage 0: current phase, no hardware required

Deliverables already present or planned:

- `docs/character-bible.md`
- `docs/animation-library-research.md`
- `docs/persona-packet-schema.md`
- `docs/persona-packet.schema.json`
- `tests/fixtures/*.json`
- `docs/hardware-intake-checklist.md`
- `docs/integration-plan.md`

Acceptance:

- The renderer/prototype team has a stable schema and visual grammar.
- Hardware work remains read-only until the monitor arrives and Brian approves changes.
- Integration plan avoids WAN exposure and credential leakage.

### Stage 1: file-fed local loop

Goal: prove the state-to-personality-to-renderer loop using mocked or local-safe state.

Tasks:

1. Implement `scripts/display_state_collector.py` with safe local service/resource/Kanban counters.
2. Implement `src/personality_engine.py` with deterministic fallback only.
3. Add `tests/test_display_state_collector.py` for redaction, atomic writes, and stale-state handling.
4. Add `tests/test_personality_engine.py` for schema validation, fallback mapping, repeat suppression, and credential refusal.
5. Teach the renderer prototype to poll `persona_packet.json` and enter `offline_fallback` on invalid/stale packets.

Acceptance:

- Running one command updates `display_state.json`.
- Running the engine produces schema-valid `persona_packet.json`.
- Renderer can run entirely without a model.
- Fixture validation passes.

### Stage 2: model-assisted personality

Goal: add controlled variation without making the display dependent on external services.

Tasks:

1. Add model route configuration file or environment-driven settings with no secrets committed.
2. Implement route selection: deterministic, local endpoint, Hermes provider, external redacted provider.
3. Add prompt builder that accepts only reduced expression context.
4. Add timeout, backoff, budget cap, and route health tracking.
5. Add tests with mocked model responses: valid JSON, invalid JSON, unsafe text, timeout, repeated captions.

Acceptance:

- Model disabled path still works.
- Model enabled path produces schema-valid packets.
- Unsafe/model-invalid output falls back cleanly.
- External prompt context is redacted and bounded.

### Stage 3: service wrappers

Goal: make the local loop durable under normal NUC operation.

Tasks:

1. Create `systemd --user` service for collector.
2. Create `systemd --user` service or timer for personality engine, depending on whether it runs daemonized or periodic.
3. Log to journald or `~/.hermes/logs/` without secrets.
4. Add start/stop/status commands to a runbook.
5. Add health check script that verifies file freshness and schema validity.

Acceptance:

- Services can start/stop/restart cleanly.
- Logs are useful and safe.
- Display keeps working across engine/model failures.

### Stage 4: hardware-aware renderer/kiosk

Goal: bind the already-working local feed to the actual monitor after hardware intake.

Prerequisite: monitor physically arrives and hardware intake card completes.

Tasks:

1. Use `docs/hardware-intake-checklist.md` to determine display class.
2. If normal output, launch Chromium/kiosk against local renderer.
3. If framebuffer/USB-specific, adapt renderer output path without changing state/persona contract.
4. Test rotation, resolution, power behavior, and 30-minute burn-in.
5. Add manual disable/rollback commands.

Acceptance:

- Hermes display runs on the 320x480 monitor.
- It updates live without manual refresh.
- It survives renderer restart.
- It does not require unreviewed vendor/root display changes.

## Implementation tasks/cards to create next

Recommended next implementation cards after review/synthesis approval:

1. `display: implement safe state collector and atomic display_state.json`
   - Assignee: `engineer`
   - Depends on schema and integration plan.
   - Deliverables: collector script, tests, sample output.

2. `display: implement deterministic personality_engine.py fallback path`
   - Assignee: `engineer`
   - Depends on collector and persona schema.
   - Deliverables: engine module, history/cache writes, fallback packet generation, tests.

3. `display: wire renderer prototype to persona_packet.json`
   - Assignee: `engineer`
   - Depends on renderer prototype and engine output.
   - Deliverables: polling file loader, stale/invalid fallback behavior, demo controls, screenshot.

4. `display: add model-assisted personality route with redaction and budget controls`
   - Assignee: `integrator`
   - Depends on deterministic engine passing tests.
   - Deliverables: route config, prompt builder, mocked model tests, safety/backoff behavior.

5. `display: user-service wrappers for collector and personality engine`
   - Assignee: `integrator`
   - Depends on collector and engine implementation.
   - Deliverables: systemd user units, health check, runbook, rollback commands.

6. `display: hardware arrival bring-up and kiosk binding`
   - Assignee: `engineer`
   - Depends on monitor arrival and Brian approval for any non-read-only display changes.
   - Deliverables: display target decision, launch command/service, photo/screenshot, limitations.

7. `display: security/reliability review for local feed and model boundary`
   - Assignee: `reviewer`
   - Depends on collector, engine, and renderer integration.
   - Deliverables: approval or findings, no-secrets verification, WAN exposure check, fallback validation.

## Validation approach

Before implementation is considered ready:

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
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)
for path in Path('tests/fixtures').glob('*.json'):
    validator.validate(json.loads(path.read_text()))
    print('ok', path)
PY
```

For implementation tasks, add tests for:

- schema validity
- atomic writes
- stale-state fallback
- model timeout fallback
- invalid JSON fallback
- credential-shaped string refusal
- snippet sensitivity/boundary filtering
- repeat suppression
- no WAN bind by default

## Operational handoff

The integration boundary is intentionally boring: file bus first, optional loopback API later. That keeps the fun part, Hermes' visible personality, separate from the risky part, local system and model integration.

The recommended implementation order is:

1. deterministic local loop
2. renderer polling/fallback
3. tests and schema validation
4. service wrappers
5. model-assisted variation
6. hardware/kiosk binding after monitor arrival

No vendor display drivers, kernel/display configuration changes, or WAN exposure are part of this plan before hardware intake and Brian approval.
