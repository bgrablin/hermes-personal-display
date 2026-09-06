# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Local browser kiosk / ambient status display for Hermes Agent. A Vite-built SVG character runtime
(`src/character-runtime.html` + `src/mascot/`) renders display-safe agent state on a small physical
touchscreen (MINIX SF10T on a NUC, Chromium kiosk via systemd user services). A Python server
(`scripts/hermes_display_server.py`) serves static files plus `/api/hermes-state` and an avatar
event SSE bus. JS side has no framework — vanilla modules with vendored anime.js/xstate/zod/dompurify.

## Commands

```bash
npm run dev                  # Vite dev server on 0.0.0.0:8770
npm run build                # Vite build (dist/)
npm test                     # vitest unit + check:stack + Python server checks
npm run test:unit            # vitest only
npx vitest run tests/adopted-stack.test.js -t "name"   # single unit test
npm run test:e2e             # Playwright (builds + serves preview on 4173 itself)
npx playwright test -g "family"                        # filtered e2e
npm run check:kiosk          # kiosk regression guard (pattern-matches source)
npm run check:client-events  # client avatar-event validator guard
npm run check:augury-feed    # Augury feed privacy check
npm run check:contract       # verify generated display contract without rewriting files
npm run generate:contract    # regenerate contract bindings from schemas/
npm run generate:build-id    # regenerate content-hash cache keys for first-party runtime assets
npm run test:all             # full local gate incl. both Playwright projects
npm run install:hooks        # point git at .githooks (do this once per clone)
```

Dev URL: `http://127.0.0.1:8770/src/character-runtime.html?kiosk=1&orientation=landscape`.
The live physical kiosk is controlled via `hermes-display status|verify|restart|fix|screenshot|build-id|url`
(symlink to `scripts/hermes-display`).

## Architecture

Data flow: Hermes Agent / local monitors → display-safe state packets → `schemas/*.json` contract →
generated constants → `scripts/hermes_display_server.py` (`/api/hermes-state`, SSE) → browser runtime
(`src/state.js` normalization → `src/mascot/app.js` + behavior machine → SVG/DOM render).

- `schemas/` — authoritative contract sources (display-state, avatar-event, optic-state schemas plus
  shared presets/postures).
- `src/generated/display-contract.js` and `scripts/generated/display_contract.py` — **generated, never
  hand-edit**. After any `schemas/` change run `npm run generate:contract` and commit both outputs
  (they are committed deliberately so runtime/tests share constants without a build step). Use
  `npm run check:contract` for non-mutating freshness checks.
- `src/generated/build-id.js` — **generated, never hand-edit**. `npm run generate:build-id` computes a
  deterministic content hash from first-party runtime assets and synchronizes the first-party `?v=` cache
  keys in `src/character-runtime.html`.
- `scripts/display_state/` — server-side helper boundary: collector, resolver, contract, privacy,
  persistence, route rail, remote memory, entertainment, fixtures. Extraction is incremental;
  `scripts/hermes_display_server.py` still owns the HTTP route surface and some orchestration glue.
- `src/mascot/` — character runtime: `app.js` (entry, kiosk/family mode, hold gestures),
  `behavior-machine.js`, `states.js`, `touch-fx.js`, `sanitize.js`, `entertainment.js`.
- `tests/fixtures/` — synthetic display-safe fixtures only; see `tests/fixtures/README.md` before adding.

## Privacy boundary (the actual product)

The display contract is the project boundary. Browser-facing packets must never carry: raw prompts or
answers, raw logs/tracebacks/tool output, private file paths, URLs with tokens, credential-shaped
strings, private operational terms, or unbounded free text. Validators and checks reject these —
treat a check failure as a design signal, not an obstacle to pattern around.

Augury is an operator-only private overlay, so its redaction policy is intentionally narrower than
browser-facing display-state cards: redact credential/token/log-payload shapes, but preserve normal
file paths when they are useful operational context. Do not apply blanket path redaction to Augury
without also updating privacy tests and this policy.

Operating modes: Safe Display Mode is the default. Family/Entertainment mode
(`audience=family` or `family=1`) suppresses operator overlays (Augury) and receives no work/personal
data; exiting family mode back to operator is a privacy boundary (hence the longer exit hold).
Local services bind loopback by default.

## Conventions that will bite you

- **Build-id cache keys:** do not hand-edit runtime build ids or first-party `?v=` query strings.
  Run `npm run generate:build-id` after visual/runtime asset changes. The generated content hash in
  `src/generated/build-id.js` is the single source of truth used by `src/mascot/app.js`, first-party
  asset cache keys in `src/character-runtime.html`, and `hermes-display verify`. Vendor refs keep their
  own stable cache pins unless re-vendored.
- **check scripts are intentional stiffness:** `scripts/check-kiosk-recommendation-regressions.js` and
  friends pattern-match exact source lines and numeric constants. Refactoring guarded code requires
  updating the guard in the same change — that is by design, not an accident to work around.
- **Git hooks:** pre-commit auto-refreshes `docs/current-dashboard.png` from bounded synthetic state when frontend files change
  (skip with `HERMES_SKIP_DASHBOARD_CAPTURE=1`); pre-push blocks non-main refs to the public
  `bgrablin/hermes-personal-display` remote.
- **No legacy v2 aliases:** the retired `-v2` entrypoints must 404
  (`scripts/verify-project.sh` asserts this). Do not reintroduce redirects from retired
  paths to current modules.
- Versions are pinned exactly in `package.json`; keep them pinned.
- Machine-specific values (display paths, session vars) live in local env files
  (`deploy/systemd-user/hermes-personal-display.env.example` is the template), never in Git.

## Canonical kiosk URLs

```text
Operator: /src/character-runtime.html?kiosk=1&orientation=landscape&augury=1
Family:   /src/character-runtime.html?kiosk=1&orientation=landscape&audience=family&touch=fun
Panel:    DP-2, 1920x1280, inverted, primary, position 0x0
```
