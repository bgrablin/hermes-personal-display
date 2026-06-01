# Transformative Physical Display Reset Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the physical MINIX display visibly and behaviorally different enough that Brian can tell from across the room that this is a new direction, not a minor polish pass.

**Architecture:** Preserve the safe local SVG runtime and live telemetry feed, but stop treating the current layout as sacred. Add a cockpit-style visible command deck, stronger touch semantics, a larger/altered character presentation, and a mode grammar that makes touch and system state obvious. Break some cosmetic continuity if needed.

**Tech Stack:** Vanilla JS, SVG, CSS, existing Hermes local display server.

---

## Acceptance bar

- From 6 feet away, the display must no longer read as the previous dashboard.
- Touch controls must be visible as an interaction model, not hidden trivia.
- A single tap should visibly change state, not just show a toast.
- The character may be warped, scaled, filtered, or theatrically staged if that improves presence.
- Any regression must be reversible through git.

## Task 1: Add a cockpit command deck

**Objective:** Add a persistent bottom command deck with obvious actions: sensors, listen, work, quiet.

**Files:**
- Modify: `src/mascot-v2/app.js`
- Modify: `src/styles.css`

**Steps:**
1. Create `.command-deck` in kiosk touch setup.
2. Add update helpers for active command.
3. Show it on touch activity.
4. Style it as large, high-contrast cockpit controls.

**Verification:**
- Browser DOM contains `.command-deck`.
- Physical screenshot shows four large command controls.

## Task 2: Make touch behavior materially different

**Objective:** Change the single tap path from subtle listening toast to command-deck arming with a visible posture and larger response.

**Files:**
- Modify: `src/mascot-v2/app.js`

**Steps:**
1. Left rail: sensors deck + sensor overlay.
2. Right rail: work/activity deck + activity overlay.
3. Avatar single tap: command/listen deck, no immediate blocking overlay.
4. Avatar double tap: status deck + status overlay.
5. Long press: quiet deck + mute toggle.

**Verification:**
- `window.hermesMascotV2Touch.deck('listen')` visibly changes the deck.
- Existing tap-anywhere overlay reset still works.

## Task 3: Change the physical visual direction, not just text

**Objective:** Give the character a new stage treatment so the current direction is visibly experimental.

**Files:**
- Modify: `src/styles.css`

**Steps:**
1. Add stronger landscape background and radial stage ring.
2. Apply larger drop-shadows and mode-dependent puppet filters.
3. Move the proof strip to the top so the new command deck owns the bottom.
4. Use bold command deck colors as the primary touch affordance.

**Verification:**
- Screenshot shows new bottom command deck and different character staging.
- Live kiosk URL remains local-only.

## Task 4: Verify and reload physical kiosk

**Objective:** Run project verification, reload the live kiosk, and capture evidence.

**Files:**
- Existing scripts only.

**Commands:**
```bash
PYTHONDONTWRITEBYTECODE=1 ./scripts/verify-project.sh
```

**Verification:**
- Tests pass or any breakage is documented explicitly.
- DP-2 screenshot is captured after reload.
