# Claude/Codex dashboard iteration - 2026-05-24

## Inputs

- Claude Code read-only review: `claude-review-final.md`
- Codex read-only review: `codex-review-final.md`
- Baseline physical screenshot: `baseline-dp2.png`
- Final physical screenshot: `final-settled-dp2.png`

## Chosen implementation slice

The two external reviews converged on a bounded, low-risk slice:

1. Make Augury readable as a left-side instrument without expanding beyond the left 20-30% contract.
2. Remove raw packet fallback labels such as `work`, `detail`, `caption`, and `snippet` from visible Augury copy.
3. Strip timestamp/session/module prefixes from Augury log items so the stream reads as operator events, not raw log dumps.
4. Stop exposing manual-override exception class names as display captions.
5. Prevent failed telemetry reads from rendering fake `0%` CPU/MEM values.
6. Treat partial telemetry loss as degraded/stale rather than global `FEED LOST` when other measurements remain valid.
7. Correct the topbar fallback from `LOCAL UPTIME` to `LOCAL TIME`.
8. Bump the runtime build id to `blink-lid-symmetric2` and refresh the physical kiosk.

## Files changed by this pass

- `scripts/hermes_display_server.py`
- `src/mascot-v2/app.js`
- `src/styles.css`
- `src/character-runtime-v2.html`
- `scripts/check-kiosk-recommendation-regressions.js`
- `tests/e2e/kiosk.spec.js`

Note: this working tree already had broader Augury/adopted-stack changes before this pass. This summary captures the controller slice applied after the Claude/Codex reviews.

## Verification

- `node --check src/mascot-v2/app.js`
- `node --check scripts/check-kiosk-recommendation-regressions.js`
- `python3 -m py_compile scripts/hermes_display_server.py`
- `npm run check:kiosk`
- `npm run check:augury-feed`
- `npm test`
- `npm run test:e2e -- --project=minix-sf10t-landscape --grep 'runtime exposes|renders without console errors|Augury|augury|landscape runtime preserves Concept B optic DOM contract'`
- `./scripts/hermes-display fix`
- `./scripts/hermes-display verify`
- DP-2 physical screenshots captured before and after.

## Physical verdict

Final settled screenshot shows:

- Live CPU/MEM/TEMP values: CPU 66%, MEM 34%, TEMP 75°C at capture time.
- Augury visible and readable on the left without taking over the optic.
- No obvious raw timestamp/session/copy artifacts in the visible feed.
- Topbar uses coherent `LOCAL TIME`/uptime language.
- Kiosk loaded build `blink-lid-symmetric2`.

## Remaining backlog

- Consider a second visual pass to increase Augury contrast one more notch if Brian wants the left stream to be readable from farther than desk distance.
- Consider a small right-side signal-confidence lane only after Brian explicitly approves using that empty visual space.
- Consider clarifying whether the optic ring segments encode CPU/temp/work state or are intentionally atmospheric.
