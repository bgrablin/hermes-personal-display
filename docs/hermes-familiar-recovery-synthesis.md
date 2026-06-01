# Hermes familiar recovery synthesis

Date: 2026-05-16
Context: recovery from failed/unfinished mixture-style recommendation after Brian rejected the RGS/custom SVG mascot iteration as only marginally better than the busted-teeth version.

## BLUF

The failure was treating this as a renderer tweak after Brian was rejecting the character itself.

Best next path: **stop polishing the current RGS/custom-wisp prototype as the final mascot**. Build the next iteration around an explicitly approved character model and a stricter motion system:

1. **Static character approval first.** Produce/review stills at real 320×480 scale before more runtime work.
2. **Primary visual path:** use a high-quality riggable base character, with **SuperBoxBot** as the best immediate no-cost candidate already available locally, or inspect/buy a better robot/familiar pack if Brian wants higher polish.
3. **Runtime path:** keep the liked `character-runtime.html` behavior, but replace continuous wandering/bouncing with a `saccade → hold` gaze FSM and a hard motion budget.
4. **Image generation:** use it only for style/concept targets, not as pasted final runtime art.
5. **No OpenRouter dependency.** Use Claude Code Max/subscription for implementation, local files/tools for verification, and image generation only through included/subscription routes unless Brian approves spend.

## What the prior prototypes taught us

### RGS route

RGS was not a code failure. It was an asset mismatch:

- hands read as mittens/boxing gloves,
- mouth set was weak and included bad tooth/monster variants,
- gaze was mostly baked into sprites,
- frame animation made the body feel like a game sprite bouncing,
- curation removed the worst defects but could not create a believable Hermes familiar.

### Custom SVG/wisp v2 route

The custom SVG solved symptoms:

- no teeth,
- no hands,
- direct pupil control,
- morphable mouth,
- local/no dependency lock-in.

But it still did not solve Brian's actual objection: it did not yet feel like a polished, recognizable **our guy / Hermes familiar**. It risks reading as custom-code art or a generic ghost rather than a beloved assistant avatar.

## Product/design recommendation

The target should be a **Hermes Courier Familiar**:

- cute local operator / courier spirit / small robot familiar,
- large readable face,
- clear Hermes cue such as winged hood, winged helmet silhouette, scarf, courier satchel, or message motes,
- no teeth ever,
- no boxing-glove hands,
- no tiny pixel-art primary character,
- no pasted face/chest overlays,
- state changes through eyes, brows, mouth, posture, palette, motes, and stage lighting.

Static approval poses required before implementation:

- neutral / idle facing viewer,
- looking left,
- looking right,
- side-eye left,
- side-eye right,
- thinking,
- blocked / annoyed,
- healthy / smug,
- sleepy / night.

Acceptance bar: Brian should be able to recognize the mascot as Hermes from still images before animation is allowed to hide weak art.

## Asset/tooling recommendation

Use a **riggable asset base** as the art foundation, not hand-authored primitive SVG from scratch.

Recommended order:

1. **SuperBoxBot manually rigged from PNG/SVG parts**
   - Already extracted locally under `assets/character-candidates/modular-parts/extracted/superboxbot_character_sheet/`.
   - Has separated head/body/eyes/irises/eyebrows/limbs and SVG/PDF source.
   - Local docs record CC0/Public Domain provenance.
   - Ignore the bundled Spine file except as rigging reference.

2. **If visual polish is still insufficient, inspect/download/buy better robot/familiar packs**
   - GameDevMarket Animated Robot first.
   - CraftPix Free Robot Sprite second.
   - Wahyuprot robot sheets if purchase/licensing friction is acceptable.
   - Use parts only, not Spriter/Spine/DragonBones runtimes.

3. **Keep custom SVG/wisp as fallback and architecture reference**
   - Useful for mouth/gaze/blink mechanics.
   - Not the best final visual identity unless art quality is substantially upgraded.

4. **Avoid Live2D/Rive/Spine as the default**
   - They are capable, but they solve authoring/runtime complexity before solving the character-art problem.
   - Use them only if Brian later has or commissions a real asset in that format.

## Motion/runtime recommendation

The current v2 can plausibly read as right-looking and bouncy even though it has gaze control. Local analysis found:

- `healthy_smug` is strongly right-biased.
- `night_sleepy` has no leftward targets.
- gaze never fully holds still because target lerp, micro motion, and per-eye jitter run continuously.
- many oscillators run together: root drift, breath, tilt, tail, helmet, wings, satchel, orbits, motes, status pulses, and intent body offsets.
- auto-intents inject body Y motion even during calm states.

Required runtime changes for the next implementation:

1. Split motion channels:
   - `poseChannel`: root X/Y/tilt/scale only.
   - `gazeChannel`: target selection, saccade, hold, side-eye.
   - `blinkFaceChannel`: lids/brows/mouth/squint.
   - `fxChannel`: motes/orbits/status chrome.

2. Replace continuous gaze wandering with `saccade → hold`:
   - saccade: 90–180 ms,
   - idle hold: 1.8–4.2 s,
   - thinking hold: 0.7–1.6 s,
   - healthy/night hold: 2.4–5.2 s,
   - hold jitter near zero, not constant roaming.

3. Apply a strict calm-state motion budget:
   - idle/healthy/night root Y <= 1 px equivalent,
   - no independent idle vertical drift,
   - no auto body-bob intents during idle unless explicitly triggered,
   - face/lids/brows/motes do most of the expressiveness.

4. Debug/QA instrumentation:
   - visible current gaze target,
   - visible current state/intent,
   - freeze button,
   - side-by-side still contact sheet,
   - automated sample of gaze distribution and root motion budget.

## Proposed Kanban path

Create a new phase instead of marking the current v2 as final:

1. `display: Hermes familiar static model-sheet gate`
   - assignee: designer
   - output: still contact sheet at 320×480 using SuperBoxBot and/or improved concept targets.
   - gate: Brian review before engineering.

2. `display: SuperBoxBot/Hermes rig prototype via Claude Code`
   - assignee: engineer
   - dependency: static model-sheet gate.
   - output: local runtime using separated parts, no pasted overlays, no constant bounce.

3. `display: motion-budget and gaze FSM hardening`
   - assignee: engineer
   - dependency: rig prototype or applied to v2 if needed.
   - output: `saccade → hold`, calmer idle, instrumented debug.

4. `display: reviewer acceptance pass for familiar identity and motion`
   - assignee: reviewer
   - dependency: engineering cards.
   - output: block for Brian review only if it meets acceptance criteria.

## Final decision

The best available option is **not** more RGS cleanup and not blind polishing of the current wisp. The best option is a new gated iteration: approved character model first, likely based on SuperBoxBot or a better riggable robot/familiar asset, then Claude Code implementation of a restrained gaze-first runtime.
