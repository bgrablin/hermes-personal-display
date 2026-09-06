# Project manifest

This repository is intentionally trimmed to the files needed to run, test, and operate the current Hermes personal display.

## Current runtime

- `src/character-runtime.html` — canonical browser/kiosk entrypoint.
- `src/mascot/` — current optic/orb runtime, behavior machine, touch effects, audio hooks, and entertainment/watch logic.
- `src/styles.css` — current runtime styling.
- `src/state.js` — display-state normalization and contract consumption.
- `src/vendor/` — vendored browser libraries used directly by the runtime.
- `src/generated/display-contract.js` — generated browser contract constants.
- `src/generated/build-id.js` — generated content-hash build id used by the runtime, cache keys, and kiosk verification.

## Server and state contract

- `scripts/hermes_display_server.py` — local static server and `/api/hermes-state` API.
- `scripts/avatar_event_bus.py` — loopback avatar event validation and SSE support.
- `scripts/display_state/` — display-state helper module boundary.
- `scripts/generated/display_contract.py` — generated Python contract constants.
- `schemas/` — source JSON contract and preset/posture definitions.

## Operation

- Canonical operator runtime: `/src/character-runtime.html?kiosk=1&orientation=landscape&augury=1`.
- Canonical family runtime: `/src/character-runtime.html?kiosk=1&orientation=landscape&audience=family&touch=fun`.
- Physical panel source of truth: DP-2, 1920x1280, inverted, primary, position 0x0.
- Canonical control path: `hermes-display status|verify|restart|fix|screenshot|build-id|url`.
- `scripts/hermes-display` — local status/restart/verify helper for the live kiosk.
- `scripts/serve-preview.sh` — preview server entrypoint used by systemd.
- `scripts/xsession-minix-kiosk.sh` — current MINIX/SF10T X11 session; selects the default Chromium kiosk or the opt-in terminal renderer.
- `scripts/herdr-monitor-raw-compositor.py` — optional fixed-size Alacritty/tmux terminal renderer.
- `scripts/launch-herdr-monitor-display.sh` — validates dependencies and launches the optional terminal renderer.
- `scripts/generate-build-id.js` — synchronizes `src/generated/build-id.js` and first-party runtime `?v=` cache keys.
- `deploy/systemd-user/` — preview and generic user-kiosk templates.
- `deploy/systemd-system/` — MINIX/thermal system unit templates and drop-ins; install/render live kiosk unit via `scripts/install-system-unit.sh`.
- `docs/minix-sf10t-bringup.md` and `docs/systemd-user-units.md` — current operational notes.

## Tests and quality gates

- `package.json` / `package-lock.json` — pinned Node tooling.
- `tests/` — unit, fixture, and Playwright tests.
- `playwright.config.js` / `vite.config.js` — browser test/build configuration.
- `scripts/check-*.js`, `scripts/check-*.py`, and `scripts/generate_display_contract.py` — active checks referenced by package scripts or `scripts/verify-project.sh`.

## Removed from the source tree

Historical design-review, raw screenshot, USB-panel, and one-off thermal/prototype artifacts were removed from the working tree. Deleted `docs/` content was archived in Obsidian at:

- `Personal/AI/Hermes/Personal Display/Archive/repo-docs-archived-2026-06-08/Personal Display Repo Docs Archive - 2026-06-08.md`

The removed repo files remain recoverable from Git history if needed, but they are no longer part of the current display runtime.

## Display URL/API naming

The runtime, paths, and browser globals use canonical names with no implementation
version suffix:

- Page: `src/character-runtime.html` (was `src/character-runtime-v2.html`).
- Debug page: `src/mascot-debug.html` (was `src/mascot-v2-debug.html`).
- Runtime assets: `src/mascot/` (was `src/mascot-v2/`).
- Globals: `window.HermesDisplayRuntime`, `window.HermesDisplayStates`,
  `window.HermesTouch`, and `window.HermesTouchFxController` (the installed instance
  of the existing `window.HermesTouchFx` factory). These replace the former
  `hermesMascotV2*` / `HermesMascotV2*` names.

The v2 compatibility shim (server-side 302 redirects from the retired
`/src/character-runtime-v2.html` / `/src/mascot-v2-debug.html` entrypoints, plus
broadened `character-runtime` substring matches in `scripts/hermes-display` and
`scripts/xsession-minix-kiosk.sh`) was removed on 2026-06-10 after confirming the only
deployed kiosk (the local NUC, `~/.config/hermes-personal-display.env`) launches the
canonical URL. Retired v2 paths now 404; `scripts/verify-project.sh` asserts they are
not aliased back to current modules.
