# Hermes personal display

A local, browser-based companion display for [Hermes Agent](https://github.com/NousResearch/hermes-agent). It turns a small screen attached to a home-lab machine into an ambient status panel for an AI operator: current activity, tool use, health, degraded states, touch cues, and a lightweight character runtime.

![Hermes personal display screenshot](docs/current-dashboard.png)

This repo is useful if you are running Hermes Agent on a local box and want something more physical than a chat window: a kiosk display that shows what the agent is doing without leaking prompts, answers, secrets, or raw logs.

## Why this exists

Hermes can run as a practical local operator: reading files, using tools, monitoring services, and coordinating work. That creates a UX problem. If the assistant is doing real work, the human should be able to see enough state to trust it without staring at terminal logs.

Hermes personal display is one answer:

- A local kiosk UI for a small HDMI/USB-C display.
- A character-style runtime that reacts to assistant state.
- Display-safe status packets instead of raw conversation transcripts.
- Local-only service templates for preview and kiosk operation.
- Tests and fixtures for state normalization, event validation, and privacy boundaries.

## What it shows

The display is intentionally not a second chat client. It is an ambient instrument panel.

Current capabilities include:

- Assistant state: idle, active, waiting, finalizing, complete, blocked, degraded.
- Tool activity hints: shell, Python, file reads, search, patch/write, browser, web, planning.
- Provider/model route rail for quick visibility into active backend routing.
- Health rails for display feed freshness, local service state, and degraded conditions.
- A character runtime with gaze, blink, mouth, status badges, touch effects, and motion states.
- Local touch/entertainment hooks for physical-display experiments.
- A loopback-first avatar event bus contract for safe lifecycle events.

## Why Hermes Agent users may care

If you are using Hermes as a persistent local agent, this repo gives you patterns for:

- Turning agent activity into display-safe state.
- Separating UX signals from private conversation content.
- Running a kiosk UI from a local systemd user service.
- Building trust cues around tool use and degraded states.
- Testing that fixtures, state packets, and event streams do not carry secrets.
- Designing a physical presence for a home-lab or office AI assistant.

The most reusable pieces are not the mascot art. They are the boundaries: loopback by default, allowlisted display intents, bounded event payloads, deterministic rendering, and tests that reject credential-shaped strings.

## Architecture

```text
Hermes Agent runtime / local monitors
        |
        | display-safe state, lifecycle hints, health signals
        v
scripts/hermes_display_server.py
        |
        | /api/hermes-state and optional avatar event stream
        v
Browser kiosk runtime
        |
        | deterministic reducer + SVG/DOM renderer
        v
Small physical display
```

Core paths:

- `src/character-runtime-v2.html` - current kiosk/runtime page.
- `src/mascot-v2/` - character runtime, behavior machine, touch effects, audio hooks, sanitization.
- `src/state.js` - state resolver and display packet handling.
- `scripts/hermes_display_server.py` - local static server plus display-state API.
- `scripts/avatar_event_bus.py` - avatar event validation and SSE helpers.
- `deploy/systemd-user/` - preview/kiosk user service templates.
- `docs/avatar-event-bus-contract-2026-05-21.md` - privacy and event contract.
- `docs/systemd-user-units.md` - systemd user service notes.
- `docs/project-manifest.md` - current source map and retained prototypes.

## Privacy model

The display should show what the agent is doing, not what the human said.

Design rules used in this repo:

- Bind local services to loopback by default.
- Treat browser-facing state as display-safe data, not raw logs.
- Use allowlisted lifecycle events and compact labels.
- Reject credential-shaped strings in event fixtures and validators.
- Keep environment-specific values in local env files, not Git.
- Keep raw screenshots, review dumps, transcripts, and bulky asset packs out of the repo.

This is still an experimental local-display project. Review the code and defaults before exposing anything beyond localhost.

## Quick start

Requirements:

- Node.js 20+
- npm
- Python 3.11+
- Chromium or Chrome for kiosk mode

Install dependencies:

```bash
npm ci
```

Run the Vite dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8770/src/character-runtime-v2.html
```

For kiosk mode:

```text
http://127.0.0.1:8770/src/character-runtime-v2.html?kiosk=1
```

The Python display server is also available for local state API work:

```bash
python3 scripts/hermes_display_server.py --host 127.0.0.1 --port 8770
```

## Tests

Run the main test suite:

```bash
npm test
```

Additional checks:

```bash
npm run check:client-events
npm run check:kiosk
npm run check:augury-feed
npm run build
```

Full local gate, including Playwright projects:

```bash
npm run test:all
```

## Kiosk deployment

The repo includes systemd user unit templates under `deploy/systemd-user/`.

Typical flow:

```bash
scripts/detect-display-env.sh
scripts/install-user-units.sh
systemctl --user daemon-reload
systemctl --user start hermes-personal-display-preview.service
systemctl --user start hermes-personal-display-kiosk.service
```

Keep machine-specific values in your local environment file. Start from:

```text
deploy/systemd-user/hermes-personal-display.env.example
```

Do not commit live display paths, session values, API keys, or machine-specific secrets.

## Project status

This is a working personal-display runtime extracted from a private home-lab setup and scrubbed for public release. It is not a polished product or a generic Hermes plugin yet.

Good fit today:

- Hermes Agent users building a local physical dashboard.
- Home-lab operators experimenting with ambient agent presence.
- Developers looking for patterns around display-safe agent state.
- People interested in browser kiosk UIs for local AI systems.

Not a good fit yet:

- Hosted multi-user dashboards.
- Cloud-first telemetry.
- Remote monitoring over the public internet.
- A drop-in package with one-command Hermes integration.

## Roadmap ideas

Useful next steps for contributors:

- Document a minimal Hermes Agent integration path.
- Add a small sample state publisher that does not depend on a specific home setup.
- Split reusable event-bus/state contracts into a cleaner package boundary.
- Add screenshots or short clips for major display states.
- Add GitHub Actions for tests and secret scanning.
- Add a documented theme/character customization path.

## Keywords

Hermes Agent, local AI assistant, AI agent dashboard, personal display, ambient agent UI, home-lab AI, browser kiosk, SVG character runtime, local-first automation, systemd user service, display-safe telemetry, avatar event bus, AI operator UX.

## License

No repository-level license has been selected yet. Check third-party asset provenance files under `src/**/SOURCE-LICENSE.md` before reusing visual assets.
