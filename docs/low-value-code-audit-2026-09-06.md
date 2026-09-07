# Low-value code audit, 2026-09-06

Baseline: `main` at `1bd49bc99b088c177d4c3abeb76b64dc12c0a747`.
Implementation branch: `chore/low-value-code-audit`, proposed for merge into `main`.
This is a behavior-preserving cleanup. No deployment or design change is claimed.

## Removed, with safety evidence

| Removal | Evidence |
| --- | --- |
| Empty `scripts/display_state/{entertainment,fixtures,remote_memory,route_rail}.py` | Each contained only a docstring and a future import. No tracked imports, path references, or dynamic module discovery used them. Actual features remain in the server. |
| `apply_display_defaults`, `assert_display_safe`, and their two private constants in `contract.py` | Function names occurred only at their definitions. Constants occurred only in those functions. Server construction, sanitization, generated contract exports, and validators remain intact. |
| `load_json_dict` and unused `typing.Any` import in `persistence.py` | No caller of the reader. Existing atomic writes and locked JSONL appends are unchanged. |
| `clear_state_cache` in the server | No caller or route. Existing cache locking, refresh, and expiration are unchanged. |
| `record_entertainment_usage` in the server | No caller. Active budget reservation still checks and records usage under the existing lock. |
| Earlier `clamp01` declaration in `src/mascot/app.js` | Both declarations occupied the same function scope. JavaScript used the later declaration before this edit. The later body is byte-identical; 20 direct before/after coercion and boundary cases match, including infinities and NaN. |

Replaced stale extraction-placeholder docstrings with descriptions of implemented modules and corrected the architecture inventory in `CLAUDE.md`. Preserved the instruction to place new backend code in the helper modules.

Regenerated build/cache identity using `npm run generate:build-id`: `h572fd1fc9f5d` becomes `h8b7206185467`. HTML changes contain generated cache keys only. No schemas or generated contract bindings changed.

## Directory coverage and retained code

| Inspected area | Disposition |
| --- | --- |
| Root configuration, README, and repository guidance | Inspected commands, pinned dependencies, build copying, and architecture. Preserved configuration. |
| `.github/workflows`, `.githooks` | Inspected CI and commit/push policy. Repeated CI/package checks and source-pattern guards are explicit project gates; retained. |
| `deploy/systemd-user`, `deploy/systemd-system`, service drop-ins | Inspected launch paths, templates, optional terminal mode, and thermal configuration. Similar deployment files serve separate installation paths; retained. |
| `docs`, `docs/plans` | Inspected manifest, operating/architecture references, current review context, and document inventory. Historical design and hardware notes remain reference material. |
| `schemas`, `src/generated`, `scripts/generated` | Inspected schema sources, generator, consumers, and freshness checks. Retained contract boundaries and generated outputs. |
| `src`, `src/mascot`, `src/vendor` | Inspected runtime entrypoints, helpers, duplicate declarations, compatibility adapters, and vendor loading. DOM setter wrappers avoid repeated mutations; watch-sequence compatibility is explicitly guarded. Retained both. |
| `scripts`, `scripts/display_state` | Inspected server routes/imports, collectors, persistence/privacy/resolution, provider/runtime checks, and operational scripts. Removed only unreferenced helpers and empty placeholders. Fresh-process telemetry fallback retained. |
| `tests/python`, JavaScript unit tests | Inspected coverage and helper/reference usage. Similar tests exercise different boundaries, especially XState/fallback and direct/HTTP validation. No test removed. |
| `tests/e2e`, `tests/visual`, `tests/fixtures` | Inspected test inventory, runtime interactions, preview harness, fixture policy, and consumers. Browser checks and synthetic fixtures retained. |

Inventory covered every tracked top-level directory and its major subdirectories. This was a targeted redundancy audit, not a line-by-line correctness review of every vendor or generated asset.

## Verification

| Check | Result |
| --- | --- |
| `npm test`, before and after | 49 JavaScript and 123 Python tests passed both times; stack, contract, Kanban, entertainment, compile, and build-ID gates passed. |
| `npm run check:client-events` | Passed, including 11 negative cases. |
| `npm run check:kiosk` | Passed. |
| `npm run check:augury-feed` | Passed. |
| `python3 scripts/check-avatar-event-bus.py` | Passed direct and real loopback HTTP acceptance/rejection smoke checks. |
| `python3 scripts/validate-avatar-event-fixtures.py` | Three fixtures validated. |
| `npm run build` | Passed. Classic-script warnings reflect the existing copy-based runtime build. |
| Ruff 0.16.6, isolated `E9,F63,F7,F82` selection on backend helpers/server | Passed. |
| Ruff isolated `F401` on changed persistence module | Passed. |
| `node --check src/mascot/app.js`; `git diff --check` | Passed. |
| Python AST comparison with baseline | All retained top-level functions/classes in the three edited implementation modules are unchanged; only the five named functions were removed. |
| Direct JavaScript hoisting/coercion comparison | Later implementation unchanged; all 20 baseline/current cases identical. |

An additional unrestricted Ruff check on persistence reported five existing `S110`/`BLE001` exception-handling findings. The baseline reproduces all five, plus two findings removed by this cleanup. No claim of repository-wide lint cleanliness is made; this repository defines no dedicated lint command.

Playwright's matching Chromium download failed after repeated 30-second timeouts. No browser suite, screenshot refresh, or physical-panel acceptance is claimed. No live host was accessed; deployed commit and out-of-repository Python consumers are unverified.

## Handoff

No tests, dependencies, security filters, deployment settings, or active API behavior were removed. The initial audit was committed locally as `e8f58201928c539fb0f46e71808bb98e2f147d33`. Brian subsequently requested a detailed PR, explicitly authorizing publication of this cleanup branch for review. No merge or deployment is authorized or claimed.

Next action: review the PR diff and its CI results, including the existing browser job, before integration. If integrated, rollback is a normal revert of the cleanup commit, including its generated build/cache files. Physical acceptance remains separate from this cleanup.
