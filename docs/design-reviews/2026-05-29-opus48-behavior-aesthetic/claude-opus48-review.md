Read-only review complete. I traced the live kiosk path (`character-runtime-v2.html?kiosk=1&orientation=landscape` → `installLandscapePanels()`), the optic packet pipeline (`state.js` `MODE_OPTIC_POSTURE`/`opticPacketToPersonaPacket`), the eye-motion rig, the chrome (top bar, telemetry arcs, route rail, bottom health rail, Augury), and `styles.css`. No files modified.

# Hermes Personal Display — Behavior/Aesthetic Review

## Orientation: what's actually on the glass

The deployed dashboard is the Concept B optic built entirely in `src/mascot-v2/app.js` `installLandscapePanels()` (1307) — a single SVG eye with three telemetry arcs (CPU top, MEM right, TEMP left), a right-edge ROUTE rail, a bottom health rail (GATEWAY / FEED / REMOTE MEMORY=HONCHO / TASKS), and a centered activity card (state label · sentence · source chip). The legacy puppet (`PRESETS` with brows/wings/mouth in `states.js`) is dead code on this path — `state.js:390`+ is the live truth. The state mapping, freshness/thermal logic, and display-safe redaction are solid and honest; degradation copy ("Keeping the last local view on screen") is genuinely truthful. My findings are mostly about **legibility hierarchy** and **a couple of honesty leaks**, not architecture.

---

## Recommendations, ranked by visible impact × (inverse) risk

### 1. Route rail: stop position-encoding the percentage; clarify what the number means *(high impact, medium risk)*
The provider values shift horizontally by headroom: `styles.css:1550` sets `.cb-route-label right: calc(72px + 118px * var(--route-headroom))`, driven by `app.js:1712`. At desk distance this reads as misalignment/jitter, not as a quantity — the eye can't decode "further left = more headroom." Worse, a bare "95%" next to "CLAUDE" has no legend: a viewer doesn't know if that's quota remaining, success rate, or load. Recommend: anchor all four values in one fixed right-aligned column, render headroom as a short explicit bar (or sparkline) in a dedicated track, and add a tiny persistent legend on `.cb-route-title` ("ROUTE · HEADROOM"). Keep the confirmed/inferred/stale glyph vocabulary — that part is excellent.

### 2. Telemetry arc labels are sub-legible *(high impact, low risk)* — SAFE PASS
`.cb-arc-value` is 30px bright (`styles.css:1299`) but `.cb-arc-label` ("CPU"/"MEM"/"TEMP") is 12px at `--cb-fg-2` (`styles.css:1293`). From a desk, the viewer sees a prominent "77%" / "64°C" / "36%" with a near-invisible label — a bare "77%" with no readable referent is both a legibility and a mild truthfulness gap (which metric is 77%?). Bumping the label to ~16px and `--cb-fg-1` closes it with zero behavioral risk.

### 3. Augury fabricates density by repeating real items *(medium-high impact, low-medium risk)* — SAFE PASS
`renderRows` pads to `MAX_STRANDS = 11` by cycling the real items: `visible = Array.from({length: 11}, (_, idx) => safe[idx % safe.length])` (`app.js:1217`), tagged `data-echo="true"` at 0.5 opacity (`styles.css:2219`). So three real log lines render as eleven strands. That violates operational truthfulness — the screen looks busier than the machine is. Recommend rendering only the real strand count and leaving the rest hidden (they already collapse via `data-populated="false"`). This declutters the field around the eye *and* makes density honest.

### 4. "GATEWAY WATCH" understates a hard-down gateway *(medium impact, low risk)* — SAFE PASS candidate
`app.js:1537/1594` collapse everything non-OK into "GATEWAY WATCH", and `conceptBAttentionReason` (2674) does the same. A fully unreachable gateway and a momentarily-degraded one render identically. Since `live.gateway_ok === false` is already a distinct signal, surface "GATEWAY DOWN" (rust dot) when it's false, reserving "WATCH" for the freshness-degraded-but-reachable case. Small, truthful, preserves the explicit-health mandate.

### 5. Idle gaze/blink can read twitchy at desk distance *(medium impact, medium risk)*
`FIXATION_POOLS.idle_watch` (`app.js:2224`) interleaves `augury_left`/`route_right` darts (900–1500ms dwell) with front gaze, and `setFixation` triggers a `contextualBlink` on any >22px move (2271). Combined with route/Augury change-driven `forceGaze` pulses (1692, 1212), quiet watch may glance around more than a calm presence should. Consider lengthening idle dwell floors and rate-limiting the change-driven glances. Medium risk because you recently tuned micro-saccades (per session memory) — re-validate against a capture before/after, don't eyeball it.

### 6. Activity source chip semantics ("TELEMETRY"/"TELESCOPE"?) *(medium impact, low risk)*
`.cb-source` (13px, `styles.css:1349`) shows `activitySourceChip` output (`app.js:2899`). In the current screenshot it's barely resolvable and ambiguous as a label. Either drop it to a small leading icon + word at higher contrast, or fold it into the chips already computed in `buildActivityChips`. Low risk; defer behind 1–4.

---

## Safe to implement in one supervised pass

These are bounded, reversible, and don't touch state mapping or motion timing:

1. **Arc-label legibility** — edit `.cb-arc-label` in `src/styles.css:1293` (font-size 12→16px, fill `--cb-fg-2`→`--cb-fg-1`). Optionally tighten the label/value vertical offset in `updateConceptBArc` (`src/mascot-v2/app.js:2708-2713`). Pure CSS/positioning.
2. **Augury honesty** — in `installAuguryOverlay` → `renderRows` (`src/mascot-v2/app.js:1217`), replace the `idx % safe.length` cycling with `safe[idx] || null` so only real items populate. The `data-echo` styling (`styles.css:2219`) becomes dead and can stay or be removed. No feed/schema changes.
3. **Gateway DOWN wording** — in `installLandscapePanels`'s `updatePanelFromPacket` (`src/mascot-v2/app.js:1594`) and `conceptBAttentionReason` (`2674`), branch on `live.gateway_ok === false` → "GATEWAY DOWN" + `rust` dot class, keeping "WATCH" for the freshness-only case. Verify against `tests/fixtures/resolver/gateway-watch.json` and add a fixture for true-down.

Each should be gated through the existing Playwright kiosk spec (`tests/e2e/kiosk.spec.js`) plus a fresh `docs/current-dashboard.png` capture, since this is a physical DP-2 where pixel legibility is the acceptance test.

---

## What NOT to do

- **Don't revive or refactor the puppet layer.** `states.js` (brows/mouth/wings) and the `PRESETS` eyes/posture in `state.js` are not on the kiosk path. Touching them is pure risk with zero on-glass effect; quarantine, don't edit.
- **Don't add color to differentiate the working modes.** Amber is intentionally shared across idle/reading/reasoning/tool_shell/writing (`state.js` `MODE_OPTIC_POSTURE`), with hue reserved for exceptions (rust blocked, moss complete, ochre waiting, steel offline). Keep color as an exception signal, not a mode dial.
- **Don't widen motion budgets or speed up cadences for "liveliness."** Thermal discipline is load-bearing here — `deriveAdaptiveMotion` (`state.js:490`) scales motion down at 72/80/88°C and the screenshot already shows 64°C. The single-writer RAF rig and anime.js cadence loops are tuned; adding animation is the fastest way to reintroduce the 92°C throttle from the archive notes.
- **Don't loosen `safeDisplayText`/credential redaction** (`app.js:2945`, `state.js:410`, Augury `credentialLike` `app.js:1142`) to gain "visual richness." The display-safe boundary is the point of the appliance.
- **Don't add a loud persistent touch affordance.** The clean dark field is the aesthetic; if touch discoverability matters, make it a faint, dismissible hint — not chrome that competes with the optic.
- **Don't bulk-restyle the route rail and arcs in the same pass.** Ship #2/#3/#4 first, recapture, then take on the rail (#1) as its own change — it's the one with real layout-regression surface.

One caveat on my confidence: I reviewed the live render path statically plus the committed screenshot; I did **not** run the kiosk to measure actual desk-distance legibility or current temps. The legibility claims (arc labels, route values) should be confirmed against a real capture at the physical viewing distance before you commit.