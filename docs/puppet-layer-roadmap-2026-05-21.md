---
type: project-note
status: active
created: 2026-05-21
updated: 2026-05-21
tags:
  - project/personal-display
  - hermes/display
  - avatar/puppet-layer
source: ChatGPT Pro extended-thinking review provided by Brian on 2026-05-21
---

# Hermes physical display puppet-layer roadmap — 2026-05-21

## Verdict

**Evolve the current character. Do not replace him.** The compact retro robot, dark face screen, green expressive eyes, and winged Hermes helmet are accepted as the right direction. The gap is behavioral: the avatar currently reads too much like a polished status mascot because the face, posture, helmet, and glow are mostly fixed while the side rail says he is reasoning.

The next phase is a **puppet layer**: eyes, eyelids, pupils, mouth, helmet rim, wings, posture, glow, shadow, transition grammar, and attention memory.

## Top priorities

1. Build the eye system: pupils, catchlights, eyelids, blink timing, gaze targets.
2. Implement behavior modes as parameters: `idle_watch`, `notice`, `reading`, `reasoning`, `tool_shell`, `writing`, `waiting_user`, `blocked`, `complete`, `degraded_offline`.
3. Add transition continuity: `notice → orient → commit → sustain → resolve`.
4. Separate puppet layers: eyes, eyelids, mouth, helmet rim, wings, head, body, glow, shadow.
5. Reduce emblem behavior through tiny state-driven asymmetry while preserving the winged-helmet identity.

## Integration tracker

- [x] 1. Replace glowing eye dots with a real eye rig: iris glow, pupil, catchlight, soft bloom, gaze targets, slight asymmetry.
- [x] 2. Add eyelid masks for blinking, squinting, focus, fatigue, and contextual state-change blinks.
- [x] 3. Define gaze grammar for assistant work: idle, reading, reasoning, listening, shell/tool, searching, waiting, blocked, complete.
- [x] 4. Make the mouth expressive but restrained: neutral, listening, thinking, amused, blocked, complete, degraded/offline.
- [x] 5. Use helmet rim as brow substitute: 1-3 degree tilt/lift and wing tension without flapping.
- [x] 6. Add subtle posture: lean, settle, breath, shadow anchoring, blocked slump, completion perk.
- [x] 7. Add a “Hermes noticed something” transient state for new request, touch, alert, tool result, or side-rail update.
- [x] 8. Replace pose-switching with transition grammar: notice, orient, commit, sustain, resolve.
- [x] 9. Make reasoning look internal, not busy: stillness, narrowed eyes, slow blink, subtle glow pulse.
- [x] 10. Differentiate reading, searching, shell/tool work, and writing through distinct gaze/posture presets.
- [x] 11. Make waiting on Brian a social state: patient direct attention, softened eyelids, relaxed posture.
- [x] 12. Treat blocked, degraded, and offline as trust states with calm visual distinctions.
- [x] 13. Add attention memory via a small attention stack so interruptions return to previous focus.
- [x] 14. Reduce permanent symmetry and badge-like staging through small bounded asymmetry.

## Recommended behavior mode set

- `idle_watch`: calm forward presence, occasional soft glance.
- `notice`: brief orienting response to a meaningful event.
- `listening`: direct attentive gaze, open lids.
- `reading`: structured scan path.
- `reasoning`: stillness, narrowed focus, slow glow.
- `searching`: wider gaze sweeps, faster fixations.
- `tool_shell`: down/side gaze, terminal-like face reflection.
- `writing`: output-oriented gaze, small mouth cadence.
- `waiting_user`: patient direct attention.
- `blocked`: tilt, narrowed lids, flat mouth.
- `complete`: center, brighten, small smile.
- `degraded_offline`: desaturated, dimmer, slower, still.

Each mode should set parameters, not play a hardcoded animation: `gazeTarget`, `gazePace`, `lidOpen`, `blinkRate`, `mouthShape`, `posture`, `helmetTilt`, `wingTension`, `faceGlow`, `motionAmplitude`, and `interruptibility`.

## Candidate libraries

Recommended stack if/when dependency value outweighs hand-authored code:

- XState: explicit behavior modes, transient states, interruption handling, attention stack.
- Anime.js: SVG eye/lid/mouth/helmet/glow/posture animation.
- SVG.js or raw SVG: cleaner puppet manipulation if DOM code gets messy.
- Theatre.js: design-time timing editor only, licensing noted.
- Lottie/Rive: optional future path, not foundational.

Default for now: **raw SVG/CSS/JS first**. Add libraries only when the current puppet layer becomes hard to maintain.

> Hardware baseline correction: this roadmap targets the installed **MINIX SF10T 10.5 inch portable monitor** on DP-2, current Xorg `1920x1280` inverted landscape. Older 3.5 inch / `320x480` sensor-panel assumptions are obsolete and should only be treated as historical prototype context.

> Anime.js consideration: before adding Anime.js, evaluate whether it materially simplifies the puppet layer versus the current deterministic raw SVG/CSS/JS runtime. Candidate use is timeline orchestration for gaze/lids/mouth/helmet/posture transitions, not replacing the behavior-state model or adding decorative busy motion.

## Avoid

- More side-panel telemetry as a substitute for avatar behavior.
- Wing flapping, hands, teeth, big smiles, anime brows, chatbot bubbles, particle storms, spinner metaphors, or fake busy “AI thinking particles.”
- Constant idle movement. Use selective motion with intent.
- Raw chat/tool/chain-of-thought display content. Use display-safe avatar intents.


## Current integration status — 2026-05-21

- **Integrated:** 1 eye rig, 2 contextual eyelid/blink grammar, 3 first-class gaze grammar, 4 restrained mouth grammar, 5 helmet rim/wing tension, 6 subtle posture, 7 local notice/event hooks, 8 transition phases, 9 calmer internal reasoning, 10 differentiated work types, 11 waiting-user social state, 12 degraded_offline trust state, 13 attention memory, 14 bounded asymmetry.
- **Integrated in bounded raw-SVG/vanilla-JS slice:** 2 contextual eyelid/blink grammar, 3 first-class gaze grammar, 4 restrained mouth grammar, 5 helmet rim/wing tension as brow substitute, 7 local notice/event hooks, 8 named transition phase machine, 12 explicit degraded_offline trust state, 13 display-safe attention memory.
- **Verification artifacts:** `scripts/check-puppet-behavior-mapping.js`, `scripts/check-puppet-layer-recommendations.js`, and `tests/fixtures/puppet-layer/recommendation-status.json`.

## Implementation gates

- [ ] Static validation: JS syntax checks and existing project verification pass.
- [ ] Behavioral validation: deterministic tests cover behavior-mode to puppet-parameter mapping.
- [ ] Visual validation: DP-2 screenshot shows character-first readability and no clipped rails.
- [ ] Physical validation: live kiosk reloads without raw 404/blank display.
- [ ] Tracking validation: each of the 14 recommendations is marked integrated, partially addressed with rationale, or deferred with rationale.

## Related project notes

- `docs/daily-improvement/2026-05-21/summary.md`
- `docs/physical-review/2026-05-21/`
