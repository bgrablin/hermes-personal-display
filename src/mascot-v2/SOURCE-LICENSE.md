# mascot-v2 source and provenance

## Status

The accepted `src/mascot-v2/` retro-robot familiar is **project-authored for this repo**.

It is not derived from the older rejected RGS/Foozle/Gumbot asset packs. The canonical artwork and runtime for this path live here:

- `src/mascot-v2/hermes-puppet.svg` — project-authored SVG puppet art
- `src/mascot-v2/states.js` — project-authored pose/gaze/motion state definitions
- `src/mascot-v2/runtime.js` — project-authored local SVG runtime and animation logic
- `src/mascot-v2/app.js` — project-authored runtime controls/debug wiring
- `src/mascot-v2/approval.js` — project-authored contact-sheet/review harness
- `src/mascot-v2/styles.css` — project-authored styling for the mascot runtime/debug pages

## Dependency note

The accepted mascot-v2 review path is local-only.

Runtime pages:

- `src/character-runtime-v2.html`
- `src/mascot-v2-debug.html`

load only relative/local files from this repository. There are no CDN or third-party runtime dependencies in the accepted mascot-v2 path.

## Review artifacts

Current Brian-review artifacts for this path are stored under:

- `docs/review-artifacts/mascot-v2-runtime-review.png`
- `docs/review-artifacts/mascot-v2-contact-sheet-review.png`

These are generated from the local served runtime/debug pages and committed as stable review references.

## Historical note

Older prototype/research routes retain their own provenance where applicable, for example `src/assets/rgs-hermes/SOURCE-LICENSE.md`. Those notes do not govern the accepted mascot-v2 retro-robot path.
