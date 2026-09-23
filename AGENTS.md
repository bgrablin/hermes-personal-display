# Hermes personal display

This repository is a local browser kiosk and ambient status display for Hermes Agent. A Vite-built vanilla JavaScript/SVG runtime renders display-safe agent state; a Python server serves static files, `/api/hermes-state`, and avatar-event SSE. The default deployment is a Chromium kiosk with optional systemd services on a local touchscreen host.

# Project map

- `src/character-runtime.html` is the canonical runtime; `src/mascot/` contains behavior and rendering; `src/state.js` normalizes display packets.
- `schemas/` contains authoritative display-state, avatar-event, and optic-state contracts plus presets; generated bindings live under `src/generated/` and `scripts/generated/`.
- `scripts/hermes_display_server.py` owns the local HTTP boundary; `scripts/display_state/` contains collection, resolution, privacy, persistence, and integration helpers.
- `tests/` contains Vitest, pytest, Playwright end-to-end, and visual tests; `deploy/` contains systemd templates; `integrations/` contains optional Hermes observer/RPC pieces; `docs/` contains operational and contract notes.
- JavaScript is framework-free and uses vendored anime.js, xstate, zod, and DOMPurify.

# Setup and development

- Requirements are Node.js 20+, Python 3.11+, npm, and Chromium or Chrome; CI currently uses Node 22 and Python 3.12.
- Run `npm ci`; install Python test dependencies with `python3 -m pip install -r requirements-dev.txt`, preferably in a virtual environment.
- Run `npm run dev`, then open `http://127.0.0.1:8770/src/character-runtime.html?kiosk=1&orientation=landscape`.
- `npm run build` writes `dist/`; `npm run preview` serves the built output on port 8770.

# Tests and verification

- The default completion gate is `npm test`; it runs unit, stack, contract-freshness, Python server, publication-safety, and build-id checks.
- `NODE_ENV=production` in the ambient environment makes `npm install` (and `hermes verify`'s bootstrap) prune devDependencies, so the gate dies at `test:unit` with exit 127 and vitest missing. Run it with `env -u NODE_ENV npm test`, or restore the tree with `env -u NODE_ENV npm ci`.
- For UI or runtime changes, also run `npx playwright install --with-deps chromium` when needed and `npm run test:e2e -- --workers=1`; `npm run test:all` is the full local gate.
- Run focused guards as relevant: `npm run check:client-events`, `npm run check:kiosk`, `npm run check:augury-feed`, and `./scripts/verify-project.sh`.
- `npm run review:presence` records the synthetic visual rehearsal under `test-results/presence/`.

# Contracts and privacy

- After changing `schemas/`, run `npm run generate:contract` and `npm run check:contract`; never hand-edit generated contract bindings.
- After frontend or runtime asset changes, run `npm run generate:build-id`; never hand-edit `src/generated/build-id.js` or first-party `?v=` cache keys.
- Browser-facing packets and fixtures must not contain prompts, answers, raw logs or tracebacks, tool output, private paths, tokenized URLs, credentials, private operational terms, or unbounded free text.
- Safe Display Mode is the default; Family/Entertainment Mode receives no work or personal data; local services bind to loopback by default.
- Keep fixtures synthetic and deterministic. Treat privacy-check failures as design signals, not obstacles to bypass.
- Keep dependency versions pinned, update exact-source guard scripts with intentional refactors, and keep retired `-v2` entrypoints at 404.
- Keep machine-specific paths, session values, and secrets in local environment files, never in Git.

# Kiosk deployment

- Inspect the graphical session and display before choosing values: `./scripts/detect-display-env.sh .review-tmp/display-env-report.txt`.
- Install user templates with `./scripts/install-user-units.sh`; edit `~/.config/hermes-personal-display.env` only with detected display/session values.
- Reload and enable user services with `systemctl --user daemon-reload`, `systemctl --user enable --now hermes-personal-display-preview.service`, and the route-rail/watchdog timers as needed.
- The live MINIX/SF10T kiosk uses system-level `hermes-personal-display-minix.service` and `scripts/xsession-minix-kiosk.sh`, not the legacy user-session launcher.
- Restore the system unit with `./scripts/install-system-unit.sh`; install the thermal-policy unit, reload systemd, enable it, restart the kiosk service, then run `./scripts/hermes-display verify`.
- Use `hermes-display status|verify|restart|fix|screenshot|build-id|url` for service-aware operation; verify after every restart or deployment change.
- Reference panel settings are DP-2, 1920x1280, inverted, primary, position 0x0; detect the live output before hard-coding overrides.
- Chromium is the default renderer. `PERSONAL_DISPLAY_RENDERER=herdr-monitor` is opt-in and requires the configured read-only health monitor, btop config, and physical framebuffer verification.
- Canonical operator URL: `/src/character-runtime.html?kiosk=1&orientation=landscape&augury=1`; family URL: `/src/character-runtime.html?kiosk=1&orientation=landscape&audience=family&touch=fun`.

# Before changing or declaring done

Read the relevant README and docs, preserve the display privacy boundary, keep generated files current, and run the smallest relevant checks plus `npm test`. Do not claim kiosk work is verified from code checks alone; physical framebuffer review is required for physical-display acceptance.
