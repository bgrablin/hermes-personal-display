# Accepted baseline: Concept B touch-zone dashboard

Date: 2026-05-22T09:02:55

Purpose: rollback anchor for the current accepted Hermes Personal Display dashboard before further iterative development from the MINIX SF10T Obsidian plan.

## Visual contract

- Concept B living-instrument / single-eye radial dashboard.
- Normal kiosk mode has no visible touch-zone/debug overlay.
- Five-zone touch contract:
  - Top: diagnostics on long press.
  - Left: glance previous.
  - Right: glance next.
  - Center: single-tap acknowledge.
  - Bottom: safe reset / hide details.
- Top-left/top-right header text enlarged for physical readability.
- CPU/MEM/TEMP radial metrics render real live values, not null-as-zero placeholders.
- Footer keeps explicit `GATEWAY OK/WATCH`, `FEED FRESH/STALE/LOST`, and `TASKS` semantics.

## Evidence

- Physical DP-2 screenshot: `dp2-crop.png`
- Screenshot SHA256: `6b51bb4a54a199fd83c7fb46b3dcb4a94abc1848ce155f7abf5537a5ffc51899`

## Restore

Use the git tag created with this baseline commit. Expected tag format:

```bash
git checkout baseline/concept-b-touchzones-20260522
```

If the tag is not available, restore from this directory plus the commit referenced by git history around this README.

## Status at baseline save

```text
 M scripts/check-chatgpt-review-coverage.js
 M scripts/check-kiosk-recommendation-regressions.js
 M scripts/xsession-minix-kiosk.sh
 M src/character-runtime-v2.html
 M src/mascot-v2/app.js
 M src/styles.css
?? docs/baselines/
?? docs/design-imports/
?? docs/physical-review/2026-05-21/redraw-191957/
?? docs/physical-review/2026-05-21/redraw-192020/
?? docs/physical-review/2026-05-21/redraw-final-192525/
?? docs/physical-review/2026-05-21/redraw-final2-192743/
?? docs/physical-review/2026-05-22/
```

## Diffstat of dashboard files

```text
 scripts/check-chatgpt-review-coverage.js          |   5 +-
 scripts/check-kiosk-recommendation-regressions.js | 193 +++---
 scripts/xsession-minix-kiosk.sh                   |   9 +-
 src/character-runtime-v2.html                     |  14 +-
 src/mascot-v2/app.js                              | 462 ++++++++------
 src/styles.css                                    | 742 ++++++++++++----------
 6 files changed, 776 insertions(+), 649 deletions(-)
```
