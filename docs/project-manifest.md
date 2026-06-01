# Project manifest

## Canonical current path

- `README.md` — current project status and operating notes.
- `src/character-runtime-v2.html` — current runtime review page.
- `src/mascot-v2-debug.html` — current debug/contact-sheet page.
- `src/mascot-v2/` — current accepted retro robot face mascot implementation.
- `src/mascot-v2/SOURCE-LICENSE.md` — provenance note for the accepted retro robot path.
- `docs/review-artifacts/mascot-v2-runtime-review.png` — current runtime screenshot artifact.
- `docs/review-artifacts/mascot-v2-contact-sheet-review.png` — current contact-sheet screenshot artifact.
- `docs/systemd-user-units.md` — monitor-ready kiosk and user-unit prep.

- `deploy/systemd-user/` — checked-in preview/kiosk unit templates and env example.
- `scripts/detect-display-env.sh` — graphical-session discovery helper for physical monitor bring-up.
- `scripts/install-user-units.sh` — installs checked-in unit templates into the user systemd directory.
- `docs/hermes-familiar-recovery-synthesis.md` — recovered design decision and future revamp path.
- `docs/mascot-v2-motion-recommendation.md` — motion/gaze hardening recommendations.
- `docs/hermes-familiar-asset-tooling-recommendation.md` — asset/tooling recommendation for future redesign.

## Historical prototypes retained for reference

These are not the current path, but should not be deleted yet:

- `src/character-runtime.html` — original abstract runtime Brian liked for motion feel.
- `src/rgs-runtime.html`, `src/app-rgs.js`, `src/renderer-character-rgs.js` — rejected RGS prototype, useful as a lesson.
- `src/foozle-runtime.html`, `src/app-foozle.js`, `src/renderer-foozle.js` — rejected Foozle path.
- `src/gumbot-runtime.html`, `src/app-gumbot.js`, `src/renderer-gumbot.js` — older robot experiment.
- Historical research docs may reference externally archived asset packs; raw packs are intentionally not tracked.

## Future cleanup rule

The physical display is live and the accepted runtime path is stable. Keep the repo source-focused: commit runtime code, tests, fixtures, concise decisions, and curated baseline images only. Keep local review scratch, raw screenshots/videos, agent transcripts, bulky third-party asset packs, and environment/process captures out of Git.
