# Mascot v2 strategy: custom SVG puppet

## Decision

Do not keep polishing the RGS puppet as the main path. RGS improved after curation, but its art constraints remain visible: mitten/boxing-glove hands, weak mouth set, baked gaze, and game-sprite bounce. The issue is not only implementation; it is asset/rig mismatch.

Best next path: build a custom SVG puppet designed specifically for the existing `character-runtime.html` motion system.

## Why

Brian liked the abstract runtime's motion language: deliberate gaze, blinks, side-eye, breathing, orbits/motes, state-card feel. He rejected generic shapes, not the animation architecture.

A custom SVG puppet gives:

- native gaze control via pupil coordinates
- native blink/squint via eyelid geometry
- mouth morphs via SVG path changes
- no boxing-glove hands if the character has no hands
- deliberate restrained idle instead of random whole-body bouncing
- exact 320x480 composition control
- no runtime/editor/license lock-in

Image generation is useful for concept direction only, not final riggable runtime parts.

## Concept options generated

Files under `assets/mascot-v2/concepts/`:

- `option-a-bust-winged-hat.png`
- `option-b-helmet-creature.png`
- `option-c-spirit-wisp.png`
- `mascot-v2-concepts-contact-sheet.png`

Current recommendation: Option C, spirit/wisp. It avoids hands entirely, supports a large expressive face, and makes restrained floating motion feel intentional rather than jittery.

## Acceptance criteria

Static gate:

- Brian prefers the new neutral still over current RGS.
- Neutral does not always look right.
- Side-eye left/right are obvious as separate stills.
- Blocked/night/thinking are distinguishable without relying only on labels.

Motion gate:

- Idle has no distracting constant bounce.
- Gaze looks deliberate: center, left, right, up-left, down-right.
- Blink cadence feels natural, with occasional double blink.
- Random nudge triggers a named visible intention, not generic jitter.
- Motion quality matches or beats `src/character-runtime.html`.

Technical gate:

- Local HTML/CSS/JS/SVG only.
- No external dependencies.
- Runs at 320x480.
- Browser verified: no console errors.

## Next implementation target

Create:

- `src/mascot-v2/hermes-puppet.svg`
- `src/mascot-v2/runtime.js`
- `src/mascot-v2/styles.css`
- `src/mascot-v2/states.js`
- `src/mascot-v2-debug.html`
- `src/character-runtime-v2.html`

Use Claude Code CLI for implementation with max effort.
