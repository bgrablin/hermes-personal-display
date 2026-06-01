# Augury width and density adjustment

Date: 2026-05-24

## Request

Brian asked to reduce the dead space between the left Augury log rows and expand the stream from the prior 20-30% left rail toward roughly 45-50% of the display, while keeping it visually behind the central Concept B optic and fading out before it competes with the main graphics.

## Changes

- Expanded the Augury ambient layer to `min(50vw, 960px)`.
- Expanded individual Augury rows to `min(49vw, 940px)`.
- Increased row count from 6 to 11 to reduce vertical dead space.
- Added bounded echo rows when the live feed has fewer than 11 items so the rail stays visually populated without inventing new content.
- Tightened vertical spacing and row padding.
- Adjusted horizontal masking so logs remain visible farther into the center-left, then fade under/behind the optic.
- Kept the layer below the central optic z-index so the optic remains visually primary.
- Bumped runtime asset/build ID to `blink-lid-symmetric4` for kiosk cache-bust verification.
- Updated kiosk regression checks to enforce the wider/dense Augury contract.

## Verification

Passed:

- `node --check src/mascot-v2/app.js`
- `node --check scripts/check-kiosk-recommendation-regressions.js`
- `npm run check:kiosk`
- `npm run check:augury-feed`
- `npm run test:e2e -- --project=minix-sf10t-landscape --grep 'runtime exposes|renders without console errors|Augury|augury'` with 10 passing tests
- `./scripts/hermes-display fix`
- `./scripts/hermes-display verify`

Physical kiosk verification:

- Expected/live build ID: `blink-lid-symmetric4`
- Preview service active
- Physical kiosk service active
- State API OK
- Live Chromium URL contains `v=blink-lid-symmetric4`
- DP-2 connected primary at `1920x1280+0+0`

## Artifacts

- `final-dp2-v4.png` — final DP-2 screenshot after the stronger width/density pass.
- `final-dp2.png` — first DP-2 screenshot from the initial pass, kept for comparison.

## Visual acceptance notes

Final visual review found the requested behavior mostly satisfied:

- Logs are denser with less vertical dead space.
- The stream visually occupies roughly the left half of the display.
- Rows extend underneath the central optic.
- The optic remains visually dominant.
- Fade remains strong enough that Augury does not overpower the main graphics.

Minor remaining backlog: if Brian wants an even cleaner central focal zone, slightly increase attenuation where Augury intersects the optic area.
