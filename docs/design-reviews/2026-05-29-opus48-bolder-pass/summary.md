# Opus 4.8 bolder Concept B pass — 2026-05-29

## Rollback point
- Tag: `rollback/pre-opus48-bolder-20260529-091117`
- Baseline commit: `0e57906`

## Intent
Brian liked the previous Opus 4.8 truth/legibility pass and authorized going a little further, accepting rollback risk if the visual direction regressed.

## Accepted changes
- Route rail title now reads `ROUTE · HEADROOM`.
- Route headroom values are fixed-aligned instead of horizontally shifting by percentage.
- Unknown/inactive route values render explicit `UNK`/`OFF`/`ERR` instead of a bare dash.
- Augury real rows are slightly more legible while empty rows remain hidden; no duplicate/echo rows are reintroduced.
- Active-turn state gets a subtle non-red optic/card glow using the existing Concept B accent.
- Runtime build/cache token bumped to `concept-b-opus48-bolder1`.
- Regression checker now guards route alignment, explicit route unknown copy, no fake Augury density, arc label legibility, cache-bust coupling, and no unearned `GATEWAY DOWN` semantics.

## Verification
- `node --check src/mascot-v2/app.js`
- `node --check scripts/check-kiosk-recommendation-regressions.js`
- `npm run check:kiosk`
- `npm test`
- `git diff --check`
- `./scripts/hermes-display fix`
- `./scripts/hermes-display verify`
- Physical DP-2 screenshot: `docs/review-artifacts/hermes-display-dp2-20260529-092754.png`

## Visual QA result
The physical DP-2 screenshot is visible and healthy. Route/headroom panel is clearer, Augury remains ambient but less invisible, active turn is clear, and bottom health indicators remain explicit: Gateway OK, Feed Fresh, Honcho UP. No major visual regression observed.

## Deferred
- Stronger severity encoding for high CPU/temp/provider states.
- More readable Augury if Brian wants it as active scan text rather than atmospheric context.
- Further route micro-element strengthening if the right rail still feels delicate compared to the central optic.
