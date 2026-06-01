# Hermes display aggressive sprint gates - 2026-05-20

Goal: implement as many combined review recommendations as practical while preserving the accepted winged-helmet Hermes identity and the live physical-display contract.

## Non-negotiable product rule

Hermes first. State second. Telemetry third. Detail only on touch.

## Gate 0: baseline and rollback

- Local git baseline exists before edits.
- Changes remain concentrated in display runtime/server/test files.
- No secrets, raw prompts, file paths, terminal output, CUI, or credential-shaped strings are displayed.

## Gate 1: visual hierarchy

- Character-centered three-panel landscape layout preserved.
- Right state label readable but subordinate to Hermes.
- Clock is ambient, not the dominant gold object.
- Gold is reserved for trim/planning/accent, not body paragraphs.
- Panel borders/decorative glow are quieter than eyes/state/gateway.

## Gate 2: telemetry truthfulness

- CPU, memory, and thermal bars use fixed scales and threshold classes.
- CPU: green <70%, amber 70-90%, red >90%.
- Memory: green <80%, amber 80-92%, red >92%.
- Temps: fixed 30-95C scale, green <70C, amber 70-82C, red >82C.
- Invalid/unavailable measurements render as unavailable, never fake 0.
- Per-measurement freshness is represented when available.

## Gate 3: state resolver and stale behavior

- Central resolver priority is honored: critical, blocked, attention, active work, recent completion, stale/lost feed, quiet/night.
- Active work plus stale telemetry remains active work with secondary feed warning.
- Feed freshness has clear fresh/aging/stale/lost tiers.
- Red only for critical or genuinely hot resource thresholds.

## Gate 4: activity model

- Activity copy is display-safe and human-readable.
- No redundant `planning ·` prefixes.
- Current work expires after the configured TTL.
- Idle falls back to quiet-watch / systems-steady ambient copy.
- Metadata is chips, not terminal log text.

## Gate 5: touch and character behavior

- Touch starts with character reaction: gaze/perk/blink before overlay meaning.
- Left/right/center taps map to sensors/activity/work details.
- Detail overlays close on next tap and auto-dismiss after 8-12s.
- Debug/admin remains gated.
- Reasoning looks focused, not sad or alarmed.

## Gate 6: verification

Commands:

```bash
python3 -m py_compile scripts/hermes_display_server.py
node --check src/mascot-v2/app.js
node --check src/mascot-v2/runtime.js
node --check src/mascot-v2/states.js
node --check src/state.js
node scripts/check-kiosk-recommendation-regressions.js
node scripts/check-active-work-overflow.js
scripts/verify-project.sh
```

Runtime checks:

- `/api/hermes-state` returns display-safe JSON.
- Fixture URLs for idle, active, stale, gateway-watch, telemetry failure, and high CPU return expected state labels.
- Browser/kiosk page loads with no real JS errors.
- Physical DISPLAY=:0 screenshot captured when possible.
