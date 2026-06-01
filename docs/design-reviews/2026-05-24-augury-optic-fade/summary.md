# Augury optic-area fade

Date: 2026-05-24

## Request

Brian marked the central optic area in screenshots and asked for Augury/log content to fade away there so it does not take away from the main element. Follow-up feedback asked for the fade to be stronger, then corrected that the strong pass went too far: sensors were not showing in the screenshot and the left logs were almost completely invisible.

## Changes

Initial pass:

- Added an optic-protection radial/elliptical CSS mask to the Augury ambient layer.
- Centered the mask on the Concept B optic region.
- Preserved the existing horizontal fade and top/bottom fade.
- Kept Augury behind the optic via z-index discipline.
- Bumped runtime build/cache token to `blink-lid-symmetric5`.

Strong pass, later rejected as too aggressive:

- Expanded the optic-protection ellipse to `36vw 42vh` and increased the transparent center.
- This protected the optic but over-suppressed the left-side Augury stream.
- Bumped runtime build/cache token to `blink-lid-symmetric6`.

Balanced correction:

- Narrowed and refocused the optic-protection ellipse to `24vw 39vh at 50.5vw 49.2vh`.
- Kept the center/optic fade strong enough to hide text over the main graphic.
- Restored far-left log visibility by reducing the mask footprint and slightly raising far-left row/background presence.
- Increased low-opacity echo rows from `0.58` to `0.66` opacity so the rail does not disappear.
- Bumped runtime build/cache token to `blink-lid-symmetric7`.
- Updated kiosk regression checks to require the focused optic-protection mask.

## Verification

Passed after the balanced correction:

- `node --check src/mascot-v2/app.js`
- `node --check scripts/check-kiosk-recommendation-regressions.js`
- `npm run check:kiosk`
- `npm run check:augury-feed`
- `npm run test:e2e -- --project=minix-sf10t-landscape --grep 'runtime exposes|renders without console errors|Augury|augury'` with 10 passing tests
- `./scripts/hermes-display fix`
- `./scripts/hermes-display verify`

Physical kiosk proof:

- Expected/live build ID: `blink-lid-symmetric7`
- Preview service active
- Physical kiosk service active
- State API OK
- Live Chromium URL contains `v=blink-lid-symmetric7`
- DP-2 connected primary at `1920x1280+0+0`

Live state after settling:

- `gateway_ok: true`
- freshness tier: `fresh`
- valid measurements: `5`
- CPU measurement valid
- memory measurement valid
- temperature measurement valid

## Visual acceptance

Final DP-2 visual review found the balanced correction successful:

- Sensors are visible and populated.
- Left-side Augury logs are visible again and readable enough to feel alive.
- Text is still heavily suppressed in the central optic/circled area.
- The main graphic remains dominant.
- The result is close to balanced, with only faint transition-zone text near the left edge of the optic.

## Artifacts

- `final-dp2.png` — initial optic fade pass.
- `final-dp2-strong.png` — stronger pass, rejected as too aggressive.
- `final-dp2-balanced.png` — balanced accepted correction.
