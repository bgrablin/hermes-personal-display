# Project manifest

This repository is intentionally trimmed to the files needed to run, test, and operate the current Hermes personal display.

## Current runtime

- `src/character-runtime-v2.html` — canonical browser/kiosk entrypoint.
- `src/mascot-v2/` — current SVG puppet runtime, behavior machine, touch effects, audio hooks, and entertainment/watch logic.
- `src/styles.css` and `src/mascot-v2/styles.css` — current runtime styling.
- `src/state.js` — display-state normalization and contract consumption.
- `src/vendor/` — vendored browser libraries used directly by the runtime.
- `src/generated/display-contract.js` — generated browser contract constants.

## Server and state contract

- `scripts/hermes_display_server.py` — local static server and `/api/hermes-state` API.
- `scripts/avatar_event_bus.py` — loopback avatar event validation and SSE support.
- `scripts/display_state/` — display-state helper module boundary.
- `scripts/generated/display_contract.py` — generated Python contract constants.
- `schemas/` — source JSON contract and preset/posture definitions.

## Operation

- `scripts/hermes-display` — local status/restart/verify helper for the live kiosk.
- `scripts/serve-preview.sh` — preview server entrypoint used by systemd.
- `scripts/xsession-minix-kiosk.sh` — current MINIX/SF10T X11 Chromium kiosk session.
- `deploy/systemd-user/` — preview and generic user-kiosk templates.
- `deploy/systemd-system/` — accepted MINIX/thermal system snippets.
- `docs/minix-sf10t-bringup.md` and `docs/systemd-user-units.md` — current operational notes.

## Tests and quality gates

- `package.json` / `package-lock.json` — pinned Node tooling.
- `tests/` — unit, fixture, and Playwright tests.
- `playwright.config.js` / `vite.config.js` — browser test/build configuration.
- `scripts/check-*.js`, `scripts/check-*.py`, and `scripts/generate_display_contract.py` — active checks referenced by package scripts or `scripts/verify-project.sh`.

## Removed from the source tree

Historical Foozle, Gum Bot, RGS, p5, static concept-art, old design-review, raw screenshot, USB-panel, and one-off thermal/prototype artifacts were removed from the working tree. Deleted `docs/` content was archived in Obsidian at:

- `Personal/AI/Hermes/Personal Display/Archive/repo-docs-archived-2026-06-08/Personal Display Repo Docs Archive - 2026-06-08.md`

The removed repo files remain recoverable from Git history if needed, but they are no longer part of the current display runtime.

## Known naming cleanup

The current runtime still uses historical path/API names such as `character-runtime-v2.html`, `mascot-v2/`, and `window.hermesMascotV2`. Those are implementation names, not product names. User-facing labels have been cleaned up, but a full path/API rename should be a separate migration with tests and live-kiosk verification.
