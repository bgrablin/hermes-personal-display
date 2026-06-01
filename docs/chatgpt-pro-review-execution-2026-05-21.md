# ChatGPT Pro review execution — 2026-05-21

## BLUF

The ChatGPT Pro Extended Thinking review has been converted into project controls and runtime changes. The live MINIX SF10T display now loads the current `display-sprint10` assets and shows a visible physical-QA mode proof strip: `PUPPET / TOOL/SHELL / DOWN-RIGHT GAZE · WING TENSION`.

## Implemented recommendations

| Recommendation | Status | Evidence |
| :--- | :--- | :--- |
| Rewrite personality thesis away from toy/constant-motion behavior | Done | Obsidian plan carries `Presence first, trust second, entertainment third`; runtime mode proof emphasizes intentional behavior. |
| Preserve current retro robot and avoid mascot replacement | Done | Runtime primary skins renamed to active retro-robot variants; old orb/sprite/sigil directions stay archived in planning notes. |
| Clean obsolete hardware-arrival/3.5-inch paths | Done | Active Obsidian plan marks MINIX SF10T on DP-2 as installed baseline. |
| Add display-sensitivity policy | Done | Obsidian plan defines display-sensitivity classes; local personality engine suppresses credential-shaped and blocked snippets. |
| Split `persona_packet` from `puppet_state_packet` | Done | `scripts/personality_engine.py` writes both `persona_packet.json` and `puppet_state_packet.json`. |
| Keep LLM/personality layer bounded and not renderer-authoritative | Done | Deterministic local engine chooses from approved expressions only; no external model route, no DOM/SVG selectors, no system actions. |
| Prefer SVG/vanilla runtime over PixiJS/Rive/etc. | Done | Production path remains SVG puppet + vanilla JS; no new runtime dependency. |
| Add visual acceptance gates | Done | `scripts/check-chatgpt-review-coverage.js` and physical DP-2 screenshot gate added. |
| Touch should feed avatar presence, not clutter | Done with correction | Avatar single-tap now produces only a short character/listening acknowledgment. Menus/details are reserved for side rails or double-tap status so physical tapping does not feel like a slideshow. |
| Make changes visible on physical display | Done with QA-only proof | The mode-proof strip remains available with `qa=1`/`debug=1` for physical QA, but is no longer permanent chrome on the normal kiosk URL. |

## Runtime changes

- Added `scripts/personality_engine.py`:
  - deterministic local Phase-2 personality scaffold;
  - writes `~/.hermes/display/persona_packet.json`;
  - writes `~/.hermes/display/puppet_state_packet.json`;
  - maintains `persona_history.jsonl`;
  - blocks credential-shaped snippets.
- Added `scripts/check-chatgpt-review-coverage.js`:
  - verifies Obsidian plan controls exist;
  - verifies runtime uses active retro-robot skin names;
  - verifies the opt-in QA mode-proof strip exists;
  - executes the local personality engine and confirms no credential-shaped leakage.
- Updated `scripts/verify-project.sh` to run the new coverage gate and compile the new engine.
- Updated `src/state.js`, fixtures, and schema to use active retro-robot skin names as the primary path.
- Updated `src/mascot-v2/app.js` and `src/styles.css` with the bottom mode-proof strip and mode-specific visual treatment.

## Physical verification

- Current kiosk URL after xsession reload: `character-runtime-v2.html?kiosk=1&orientation=landscape&v=display-sprint10`.
- Screenshot artifact: `docs/physical-review/2026-05-21/chatgpt-pro-execution/dp2-after-xsession-reload.png`.
- Vision review result: mode-proof strip visible; display remains legible, character-first, and free of stuck overlays.

## Deterministic verification

Command:

```bash
PYTHONDONTWRITEBYTECODE=1 ./scripts/verify-project.sh
```

Result: pass.

Includes:

- JS syntax checks.
- SVG XML parse.
- active-work display-safe caption/copy check.
- kiosk recommendation regression check.
- puppet behavior mapping check.
- puppet recommendation tracker check.
- client avatar-event validator negative cases.
- ChatGPT Pro review coverage and personality-engine gate.
- avatar event fixture validation.
- avatar event bus smoke checks.
- resolver fixture checks.
- preview HTTP checks.

## Remaining future polish

The current physical direction is accepted and now visibly changed. The remaining work is not unimplemented review cleanup; it is deeper visual acceptance:

- Capture a 30-60 second video or photo sequence across `idle_watch`, `reading`, `reasoning`, `tool_shell`, `waiting_user`, `blocked`, `complete`, and `degraded_offline`.
- Tune each mode until a viewer can identify the state without reading side rails.
- Decide whether the mode-proof strip should stay permanently, be hidden after burn-in, or become a debug/QA-only affordance.
