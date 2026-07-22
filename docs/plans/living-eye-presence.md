# Living Eye Presence Implementation Plan

> **For Hermes:** Execute task-by-task with strict RED → GREEN → REFACTOR and physical-panel visual QA.

**Goal:** Make the Hermes optic read as a living robotic eye that acknowledges the viewer, looks away to work, and returns with intent while preserving the operator-console identity and the current `main` baseline.

**Architecture:** Keep the socket, lens rim, lids, brow, and corneal surface fixed. Move a clipped inner iris/pupil group with intentional saccades. Add a small social-presence state machine to the existing optic rig, driven by privacy-safe avatar/touch/motion events. Reduce continuous ambient field work so purposeful ocular motion receives the visual and GPU budget.

**Tech stack:** Vanilla JavaScript modules, SVG, anime.js, CSS, Playwright, Vitest, Vite, physical Chromium kiosk on DP-2.

**Safety boundary:** Do not enable a camera. Accept only normalized local presence coordinates through a disabled-by-default event seam; touch, conversation lifecycle, and motion-entry events are the active inputs.

---

### Task 1: Preserve the baseline and establish the branch

**Files:** No production edits.

1. Verify `main` is clean and matches `origin/main` at `e3658eb`.
2. Create `feature/living-eye-presence` from that exact commit.
3. Keep all implementation and review on this branch; do not merge or push without approval.

### Task 2: Specify fixed-socket and inner-eye behavior

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`

1. Add a test requiring `.cb-eye-socket` to remain outside `.cb-eye-gaze`.
2. Require only the clipped iris/pupil contents inside `.cb-eye-gaze`.
3. Force left/right gaze and assert the inner group transform changes while the socket transform remains fixed.
4. Run the focused Playwright test and verify RED because the current DOM moves the entire assembly.
5. Refactor `src/mascot/app.js` minimally to satisfy the contract.
6. Re-run and verify GREEN.

### Task 3: Specify ocular blink anatomy

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/mascot/app.js`

1. Replace the symmetric-blink assertion with an upper-lid-dominant closure assertion.
2. Require iris/pupil scale to remain anchored through the blink.
3. Verify RED against the current symmetric shutter.
4. Implement approximately 82% upper-lid travel and 18% lower-lid travel, with gaze-aware curve apex.
5. Preserve 70 ms close, 35 ms hold, and 115 ms reopen timing.
6. Verify GREEN and inspect a forced-blink frame sequence.

### Task 4: Specify stable catchlights and readable gaze

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/mascot/app.js`
- Modify: `src/styles.css`

1. Add a test requiring two catchlights, not three independently orbiting points.
2. Require catchlight displacement to counter-parallax gaze without independent orbital drift.
3. Verify RED.
4. Remove the tertiary catchlight and replace `driftDots()` with fixed-light counter-parallax plus schema-driven posture opacity.
5. Verify GREEN and compare centered, left, right, and down gaze screenshots.

### Task 5: Specify conversational eye-contact choreography

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/mascot/app.js`

1. Add a test for a public `acknowledgeViewer()` optic-rig method.
2. Require `assistant.started` to enter `acknowledge`, target `viewer`, lift the upper lid, and briefly dilate the pupil.
3. Require `assistant.tool_started` to transition to `working` and release direct gaze.
4. Require `assistant.waiting_on_user` and `assistant.final_complete` to enter sustained direct-presence states.
5. Verify RED.
6. Implement bounded social-presence state, dataset exposure, and lifecycle mapping in `applyAvatarEvent()`.
7. Verify GREEN.

### Task 6: Specify touch, motion-entry, and normalized local presence

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/mascot/app.js`
- Modify: `src/mascot/entertainment.js`

1. Add tests that touch and `sensor:motion:entry` acknowledge the viewer before any entertainment sequence.
2. Add a test for `hermes-viewer-presence` accepting only finite normalized `x/y` values in `[-1, 1]` and rejecting malformed details.
3. Verify RED.
4. Implement the event seam without opening or invoking camera APIs.
5. Verify GREEN.

### Task 7: Specify social-presence visual hierarchy

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/styles.css`

1. Add a test requiring route rail, bottom rail, and activity copy to recede during direct presence.
2. Require blocked/critical/offline states to retain operational visibility and override social dimming.
3. Verify RED.
4. Add `data-social-presence` CSS treatments that dim peripheral UI and field motes without hiding alerts.
5. Verify GREEN at 1920x1280.

### Task 8: Reduce ambient field work

**Files:**
- Modify: `tests/e2e/kiosk.spec.js`
- Modify: `src/mascot/app.js`

1. Add a MutationObserver test proving field ring updates are bounded near 30 fps while ocular gaze remains responsive.
2. Verify RED against the current per-frame field updates.
3. Throttle field-only SVG updates to approximately 30 fps; keep the eye spring on requestAnimationFrame.
4. Verify GREEN and compare physical CPU/GPU process measurements before and after without overclaiming causality.

### Task 9: Regenerate cache identity and verify

**Files:**
- Generated: `src/generated/build-id.js`
- Modified automatically: first-party `?v=` references in `src/character-runtime.html`

1. Run `npm run generate:build-id` after runtime asset changes.
2. Run focused Playwright tests for each new behavior.
3. Run `npm run test` and `npm run build`.
4. Run `npm run check:kiosk`, `git diff --check`, and the full landscape Playwright project.
5. Restart the service-owned physical kiosk on the branch build.
6. Capture live motion, forced blink, direct gaze, work-away gaze, waiting, complete, blocked, and offline states.
7. Verify one managed browser root and visibly rendered framebuffer.

### Task 10: Independent review and handoff

1. Freeze the intended staged diff and record its SHA-256.
2. Obtain a fail-closed independent review of that exact diff.
3. Correct findings and repeat affected tests.
4. Present the branch, screenshots/video, measured behavior, remaining risks, and rollback command.
5. Do not merge to `main` or push without Brian's approval.
