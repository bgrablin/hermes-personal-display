# Display contract and generated bindings

The display contract is the project boundary. Hermes Agent, local monitors, preview fixtures, and the browser kiosk should communicate through display-safe packets, not raw prompts, raw logs, tool output, file paths, or secrets.

## Source schemas

Authoritative contract sources live in `schemas/`:

| File | Purpose |
| --- | --- |
| `schemas/hermes-display-state.schema.json` | Browser-facing display state packet shape. |
| `schemas/hermes-avatar-event.schema.json` | Avatar lifecycle/event packet shape for the event bus. |
| `schemas/hermes-optic-state.schema.json` | Optic/character state packet shape. |
| `schemas/hermes-display-presets.json` | Shared display-state presets. |
| `schemas/hermes-optic-postures.json` | Shared optic/character posture definitions. |

## Generated outputs

Do not hand-edit generated bindings:

| Generated file | Consumer |
| --- | --- |
| `src/generated/display-contract.js` | Browser/runtime JavaScript. |
| `scripts/generated/display_contract.py` | Python display server and checks. |

Regenerate both outputs after changing `schemas/`:

```bash
python3 scripts/generate_display_contract.py
```

The generated files are committed so runtime code and tests can use the same constants without requiring generation during normal startup.

Check that the committed outputs are current without rewriting them:

```bash
npm run check:contract
```

## Validation path

Relevant checks:

```bash
npm run check:contract
npm run check:client-events
python3 scripts/check-avatar-event-bus.py
python3 scripts/check-kanban-snapshot.py
npm test
```

`npm test` already runs the non-mutating generated-contract freshness check. Use `npm run generate:contract` only when intentionally updating schema-derived outputs.

## Privacy rules

The contract allows display-safe state only. It should not carry:

- raw prompts or answers
- raw logs, tracebacks, or tool output
- private file paths
- credential-shaped strings
- URLs carrying tokens
- private operational terms
- unbounded free-text diagnostic payloads

Use `tests/fixtures/README.md` when adding fixtures so examples stay synthetic and auditable.
