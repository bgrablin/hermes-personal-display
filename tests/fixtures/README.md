# Test fixtures

These fixtures are display-safe inputs used by the local preview server and regression checks. They are intentionally committed because they document the contract boundary between raw local state and browser-facing packets.

## Fixture groups

| Path | Purpose | Primary consumers |
| --- | --- | --- |
| `avatar-events/*.json` | Valid avatar lifecycle/event payloads for the avatar event bus. | `scripts/avatar_event_bus.py`, `scripts/check-avatar-event-bus.py`, `scripts/validate-avatar-event-fixtures.py`, client event validation checks |
| `resolver/*.json` | Display-state resolver scenarios for live preview and state normalization checks. | `scripts/hermes_display_server.py`, `scripts/check-kanban-snapshot.py`, `src/mascot/app.js` via `/api/hermes-state?fixture=<name>` |
| `display-state-*.json` | Browser-facing display-state examples for healthy and blocked states. | Contract checks, local preview, privacy regression review |
| `persona-packet-*.json` | Legacy persona/optic packet examples retained for compatibility coverage while the display contract evolves. | Resolver and generated-contract compatibility checks |
| `combined-feed-blocked.json` | Combined feed example for blocked/degraded state handling. | Display-state resolver and privacy-boundary regression checks |

## Safety expectations

Fixtures should be representative, not realistic dumps. Do not paste raw Hermes conversations, raw logs, stack traces, file paths from private work, URLs with tokens, API keys, credentials, CUI/customer/government terms, or other sensitive operational data into these files.

If a fixture needs to exercise privacy rejection, use synthetic values that are obviously fake and scoped to the test. Keep those examples small and make sure the relevant validator rejects them.

## Adding or changing fixtures

1. Keep each fixture focused on one state or boundary condition.
2. Prefer stable, deterministic values so screenshot and regression artifacts are comparable.
3. Run the relevant checks before committing:

```bash
npm run check:client-events
python3 scripts/check-avatar-event-bus.py
python3 scripts/check-kanban-snapshot.py
```

For a full local gate, run:

```bash
npm test
```
