# Hermes Personal Display Character Redesign Direction

Project: Hermes Personal Display
Target: 320x480 portrait, 3.5 inch local display
Status: revised character-first direction after current p5.js prototype feedback

## BLUF

The current prototype has useful bones, but the character direction is still too orb/status-widget adjacent. The next iteration should stop treating Hermes as a glowing core with eyes and start treating him as a small living mascot with an explicit body, posture, face rig, and state-machine animation vocabulary.

Recommendation: build the first improved prototype as a hybrid: PixiJS scene graph plus Anime.js-style timelines for the main character, with p5.js or custom canvas only as a procedural ambient layer. Keep Rive as the strongest future option once the character silhouette is chosen, but do not block the next prototype on proprietary/authored assets.

The strongest direction is Direction A, "NUC Gremlin Familiar": a compact desk-creature/operator imp with a glass terminal belly, expressive eyes, tiny wing-ear fins, and simple arm/limb gestures. It preserves Hermes' technical identity while giving engineers enough anatomy to animate real emotion.

## Problem to Solve

Brian's feedback is directionally right: weak motion and mostly shaking will not produce the intended playful, expressive, living-character feel. This is not a p5.js limitation alone. The design problem is that the character anatomy is under-specified. If the only durable parts are an orb, rings, motes, and eyes, most states collapse into glow changes, jitter, and caption swaps.

The redesign needs:

- A stronger silhouette recognizable at 320x480.
- Eyes that carry emotion at postage-stamp size.
- Body posture, ears/wings, and small limbs so states can read without text.
- Idle motion that feels intentional, not screensaver noise.
- A finite animation state machine with layered loops and one-shot gestures.
- A prototype path that does not require purchased/proprietary assets.

## Direction A: NUC Gremlin Familiar

### Concept

Hermes is a tiny technical familiar living inside the NUC: part desk pet, part operator imp, part terminal sprite. He is not cute in a childish way. He is compact, wry, competent, and visibly opinionated.

### Silhouette

- Body: rounded vertical capsule, squat teardrop, or small bean-shaped torso, roughly 120x150 px.
- Head/face: integrated into upper half of body, not a separate human head.
- Ears/wings: two small wing-like fins or antenna ears on left/right. These are critical for silhouette and emotion.
- Arms: two short noodle/arc arms that can fold, point, shrug, or tap.
- Feet/base: optional tiny hover feet or shadow pads. Use only if they improve posture readability.
- Status halo: reduced from main identity to secondary accessory. Motes orbit around the character as tools/thoughts, not as the character itself.

### Face / Eyes

- Two large luminous eyes, horizontally oval by default.
- Eyelids are separate rig parts: top lid, lower lid, brow/crease.
- Pupils/highlights can track activity targets.
- No normal mouth. Speaking is a small waveform slit or belly/core equalizer.
- Expression must remain readable if the caption is hidden.

### Body / Limbs / Mascot Geometry

- Glass terminal belly on the torso can show small pulses, not detailed dashboards.
- Arms are simple tapered strokes with mitten-like dots or small triangular hands.
- Wing-ears flap, droop, perk, or twitch.
- The body can squash/stretch 3-7%, but should not just shake.

### Idle Motion

Layered idle loops:

- Slow breathing: torso scale and glow, 5-7 second cycle.
- Eye scan: pupils drift toward orbiting motes, then return.
- Ear micro-flick: one ear twitches every 12-25 seconds.
- Arm rest shift: one arm changes resting pose every 20-40 seconds.
- Motes behave like working memory: lazy orbit with occasional tiny handoff spark.

### Emotional States

- Thinking: body leans forward, eyes narrow, ears angle forward, one hand touches belly/face, motes form a fast crown.
- Pleased/smug: half-lid smile-equivalent through eyes, tiny upward bob, arms behind/back or one hand-on-hip pose.
- Blocked/annoyed: arms fold, ears flatten asymmetrically, side-eye locks for 1-2 seconds, one foot/base tap or impatient dip.
- Night/sleepy: ears droop, body compresses slightly, eyes half-closed, one mote becomes a slow firefly.
- Alert/working: posture straightens, ears perk, eyes widen/sharpen, arms point or conduct sparks between tool motes.

### Skins

- `operator-gremlin`: graphite body, cyan eyes, teal belly glow, tiny wing-ear fins.
- `terminal-gremlin`: phosphor scanlines, pixel eyes, prompt-caret belly waveform.
- `incident-imp`: sharper ear fins, amber/magenta accents, crossed-arm blocked pose.
- `night-familiar`: dim navy body, soft cyan eyes, slow firefly motes.
- `hermetic-messenger`: subtle gold caduceus linework on belly/ears, violet/cyan palette.

### Why This Direction Works

This is the best fit because it adds enough anatomy for expression without becoming a human/anime avatar. It can be built from primitive shapes immediately in PixiJS or p5.js, then upgraded to Rive later if Brian wants authored polish.

## Direction B: Terminal Owl / Watcher

### Concept

Hermes is a tiny nocturnal systems owl: watchful, judgmental, calm, and clever. The owl is abstract and technical, not naturalistic. It reads instantly on a small screen because eyes and silhouette dominate.

### Silhouette

- Body: compact hooded owl shape, rounded diamond or shield, 130x145 px.
- Head: broad brow/hood around large eyes.
- Ears: two small horn/antenna tufts that encode mood.
- Wings: side panels that open, tuck, shrug, or fold.
- Feet: optional tiny talons/hover ticks at base.
- Halo: tool motes orbit as a constellation behind/around wings.

### Face / Eyes

- Two oversized circular or rounded-hex eyes with eyelid masks.
- Brow hood creates strong expressions: skeptical, sleepy, focused, pleased.
- Pupils are small cyan/white dots or vertical slits.
- Beak is optional and should be a tiny geometric caret, not a bird mouth. It can double as a command prompt marker.

### Body / Limbs / Mascot Geometry

- Wings act as arms: fold across chest, fan outward, point with one feather segment.
- Belly panel is a small terminal window or status crystal.
- Feather detail is abstract: 3-5 circuit-like arcs, never detailed illustration.

### Idle Motion

- Slow head/body bob with subtle parallax.
- Rare blink where eyelids close diagonally like a real owl.
- Tuft twitch and tiny head tilt every 10-20 seconds.
- Motes drift like fireflies or diagnostic stars.

### Emotional States

- Thinking: eyes contract, head tilts 6-10 degrees, wings tuck, motes arrange into a question-ring.
- Pleased/smug: one eye half-lids slightly more than the other, tiny nod, wing tips lift.
- Blocked/annoyed: full owl stare, brows drop, wings fold across belly, one mote bounces off the orbit like a rejected request.
- Night/sleepy: eyes become thin glowing crescents, body dims, tufts droop.
- Alert/working: wings open 20-30 degrees, eyes brighten, belly panel pulses with tool sparks.

### Skins

- `watch-owl`: cyan/teal graphite default.
- `night-owl`: navy/violet low-glow mode.
- `audit-owl`: amber monocle-like diagnostic ring, skeptical brow.
- `packet-owl`: small square/pixel feather pattern for CLI activity.

### Why This Direction Works

The owl gives instant eye-first readability and a strong sleepy/night metaphor. Risk: it may feel more like a themed mascot than Hermes' own technical familiar unless the terminal/circuit language is strong.

## Direction C: Pocket Console Buddy

### Concept

Hermes is a tiny living handheld console/terminal with eyes, stubby limbs, and a reactive glass display belly. It is closer to a toy-like device mascot than a creature.

### Silhouette

- Body: rounded rectangle or capsule console, 125x150 px.
- Face: eyes in the upper screen area.
- Side controls: tiny side fins/buttons that animate like ears.
- Arms/legs: minimal stub limbs. Arms can point, fold, or tap side of body.
- Antenna/cable tail: optional small cable loop or messenger-wing accent.

### Face / Eyes

- Eyes are rendered as terminal pixels, rounded LEDs, or screen glyphs.
- Eyelids can be pixel masks or scanline shutters.
- Expressions are screen-state changes: narrowed pixel eyes, `>_` prompt mouth, waveform equalizer.

### Body / Limbs / Mascot Geometry

- The belly/screen is the face and status panel, so text must remain scarce.
- Arms and buttons provide personality without relying on detailed illustration.
- Side buttons can glow as health/status indicators.

### Idle Motion

- CRT-style breathing glow.
- Pixel eyes blink with 2-3 frame shutter animation.
- Tiny antenna/cable sways.
- One hand occasionally taps the body like waiting for input.

### Emotional States

- Thinking: screen cursor sweeps across eyes, body leans forward, side buttons pulse in sequence.
- Pleased/smug: one pixel eyebrow rises, small screen sparkle, satisfied bounce.
- Blocked/annoyed: eyes become flat `- -`, arms fold, red/amber side button blinks, body does one slow irritated tilt.
- Night/sleepy: screen dims to low phosphor, eyelids as scanlines, cable droops.
- Alert/working: antenna sparks, screen expands slightly, tool glyphs dock to side buttons.

### Skins

- `graphite-console`: dark glass/cyan terminal default.
- `retro-phosphor`: green/amber phosphor with scanline texture.
- `field-kit`: rugged diagnostic device with caution amber accents.
- `midnight-console`: dim navy/violet night mode.

### Why This Direction Works

This is easiest to build procedurally and most aligned with local-operator tooling. Risk: if overdone, it becomes a gadget with eyes rather than a living character. The limbs and posture system are non-negotiable if this direction is chosen.

## Comparative Recommendation

| Direction | Expressiveness | Hermes fit | Implementation ease | Risk |
|---|---:|---:|---:|---|
| A. NUC Gremlin Familiar | High | High | Medium | Could become too cute if proportions are wrong |
| B. Terminal Owl / Watcher | High | Medium-high | Medium | Could feel themed rather than native |
| C. Pocket Console Buddy | Medium-high | High | High | Could regress into status gadget |

Recommended path: start with Direction A. Borrow Direction C's terminal belly and Direction B's strong brow/eye readability. Do not continue with a pure orb.

## Animation Vocabulary

Use a layered state-machine model: base loops always run, state overlays adjust posture and timing, and one-shot gestures fire with cooldowns. Avoid mapping each state to one repetitive animation.

### Shared Rig Controls

The prototype should expose these normalized controls regardless of renderer:

- `body.x`, `body.y`
- `body.scale_x`, `body.scale_y`
- `body.rotation`
- `body.squash`
- `body.glow`
- `eye.open_left`, `eye.open_right`
- `eye.pupil_x`, `eye.pupil_y`
- `eye.brow_left`, `eye.brow_right`
- `ear.left_angle`, `ear.right_angle`
- `arm.left_pose`, `arm.right_pose`
- `orbit.radius`, `orbit.speed`, `orbit.clump`, `orbit.spark_rate`
- `palette.accent_mix`
- `caption.opacity`

### Idle

Intent: alive, watchful, quietly entertaining.

Base loops:

- Breath: 5-7 second sinusoid, body scale changes 2-3%, glow follows at half amplitude.
- Blink: every 3-9 seconds with recent-history randomness; occasional double blink.
- Eye drift: pupils track a mote for 1 second, then ease back to center.
- Ear/wing twitch: one side only, every 12-25 seconds.
- Micro posture shift: body leans left/right by 1-2 degrees every 20-40 seconds.

Avoid: constant vibration, large orbital noise, repeated caption cycling.

### Thinking

Intent: focused, internally busy, smart.

Animation:

1. `focus_snap`: 180-260 ms. Eyes narrow, pupils center, ears/wing fins angle forward.
2. `mote_crown`: motes accelerate and form a tighter ring above/around the head.
3. `hand_to_chin` or `hand_to_belly`: one arm moves to a thinking pose.
4. `scan_pulse`: thin scanline crosses eyes/belly every 2-4 seconds.
5. Body leans forward 3-5 degrees with very small breathing amplitude.

Timing:

- State entry should feel crisp, not floaty.
- Loop should sustain quietly for long tool calls.

### Pleased / Smug

Intent: competent satisfaction, dry amusement.

Animation:

1. Eyes half-lid asymmetrically, pupils slightly upward or sideways.
2. Body does a tiny upward bob and settle, 300-450 ms.
3. One ear/wing perks higher than the other.
4. Arms move to relaxed `hands-on-hips`, behind-back, or small flourish.
5. Halo clears into a clean smooth orbit; one sparkle travels around the ring.

Notes:

- No big smile needed. The eyes and posture should do the joke.
- Use this after healthy checks, completed jobs, or successful recovery.

### Blocked / Annoyed

Intent: visibly waiting on human/input/reality, amusing but not obnoxious.

Animation:

1. `annoyed_entry`: 300 ms. Body dips, eyes narrow, ears flatten.
2. `arms_cross`: arms fold across belly or wings close over torso.
3. `side_eye_hold`: pupils glance left/right and hold 1.2-1.8 seconds.
4. `mote_clump`: motes bunch to one side or form crossed paths like folded arms.
5. `impatient_tap`: one tiny bounce/tap every 8-18 seconds, not constant.
6. `dramatic_sigh`: optional slow outward ripple, cooldown 30-90 seconds.

Avoid:

- Full-screen red unless urgent.
- Continuous shaking.
- Rapid blinking that reads as broken.

### Night / Sleepy

Intent: dim guardian presence, still alive.

Animation:

1. Eyes become low crescents with rare slow blink.
2. Body compresses slightly and drifts within 2-4 px.
3. Ears/wing fins droop.
4. Orbit slows; only 2-4 motes remain visible.
5. Glow brightness drops by 50-70%, with warm ember pinpoints.
6. Occasional tiny yawn-equivalent: belly waveform expands then fades.

Notes:

- Night mode should not feel dead.
- Prevent burn-in with minute-scale position shifts and low brightness.

### Alert / Working

Intent: active operator at work, energized but controlled.

Animation:

1. `perk_up`: ears lift, body straightens, eyes widen/sharpen over 160-240 ms.
2. `tool_sparks`: particles move between glyphs and belly panel.
3. `conducting_arm`: one arm points at an active mote or traces a small arc.
4. `progress_orbit`: one ring segment advances around the character.
5. `state_flash`: cyan/teal for normal work, amber/magenta for attention, decays within 2-4 seconds.

Avoid:

- Looking like an alarm for normal background work.
- Dense unreadable micro-icons.

## Renderer Recommendation

### Best immediate fit: PixiJS + Anime.js-style timelines + procedural canvas layer

Use PixiJS as the main character renderer because Hermes now needs a scene graph, not just a draw loop. The rig should be composed from named parts:

- background layer
- shadow/hover layer
- body shell
- belly/core panel
- eyes and eyelids
- brows
- ears/wings
- arms
- orbit/motes
- text/caption layer
- optional foreground sparkle/scanline layer

Use Anime.js or a small local tween/timeline helper to animate numeric properties on those parts. This makes gestures like `arms_cross`, `focus_snap`, and `side_eye_hold` explicit and composable.

Use p5.js only for:

- quick visual sketches,
- ambient noise/particles,
- prototype exploration,
- fallback procedural renderer if PixiJS bundling is delayed.

### Rive recommendation

Rive is the best long-term authored-character option if Brian wants the mascot to feel closer to a polished game/app character. Its state-machine model maps well to Hermes state packets. However, Rive should be a second-stage experiment after choosing the silhouette and expression vocabulary.

Use Rive when:

- A designer-authored `.riv` file exists.
- The team wants richer deformation, authored transitions, and visual state-machine editing.
- Hermes' anatomy is stable enough to avoid re-authoring every few days.

Do not use Rive as the next prototype blocker.

### Spine / Live2D

Do not use Spine or Live2D by default. They are capable, but their licensing, authoring burden, and style implications are not worth it for this private 320x480 local display unless Brian explicitly asks for that pipeline.

### p5.js procedural fallback

If the next engineer stays in p5.js for one more prototype, the fix is not more particles. The fix is explicit rig anatomy:

- Draw body, ears, arms, eyes, eyelids as separate functions/classes.
- Store pose parameters in objects, not scattered equations.
- Add named gestures with timers and cooldowns.
- Treat rings/motes as supporting props.
- Replace shake-based emphasis with squash/stretch, arm poses, ear positions, and eye/brow changes.

## Practical First Improved Prototype

The first improved prototype should be possible without proprietary assets or paid tools.

### Scope

Build one character direction, not all three. Recommended: Direction A.

Minimum prototype states:

- `idle_watchful`
- `thinking_focused`
- `healthy_smug`
- `blocked_annoyed`
- `night_sleepy`
- `working_autonomous`

### Required visual anatomy

- Body shell with readable non-orb silhouette.
- Two expressive eyes with eyelids and brows.
- Two ear/wing fins that move independently.
- Two simple arms or wing-arms with at least three poses: rest, thinking, crossed/annoyed.
- Belly/core panel for waveform/status glow.
- Orbiting motes reduced to supporting status props.
- Bottom caption kept to one display-safe line.

### Suggested implementation structure

```text
src/character/
  HermesCharacter.js      # scene graph / rig assembly
  rigControls.js          # normalized pose properties and clamps
  poses.js                # idle/thinking/smug/blocked/night/working target poses
  gestures.js             # one-shot timelines with cooldowns
  skins.js                # palette + shape variants
  stateMapper.js          # persona packet -> pose/gesture controls
```

For a static/no-build prototype, the same structure can be approximated with separate JS files under `src/` and vendored PixiJS/Anime.js, but avoid a single monolithic renderer file.

### Pose targets

Example target pose model:

```json
{
  "pose": "blocked_annoyed",
  "body": { "x": 160, "y": 202, "scale_x": 1.03, "scale_y": 0.97, "rotation": -0.05, "glow": 0.62 },
  "eyes": { "open_left": 0.42, "open_right": 0.36, "pupil_x": -0.55, "pupil_y": 0.05, "brow_left": -0.45, "brow_right": -0.25 },
  "ears": { "left_angle": -0.55, "right_angle": 0.35 },
  "arms": { "left_pose": "cross", "right_pose": "cross" },
  "orbit": { "speed": 0.35, "radius": 82, "clump": 0.75, "spark_rate": 0.05 },
  "accent": "amber_magenta"
}
```

This makes the renderer implementable in PixiJS, Rive, or p5.js because the important design contract is rig controls, not a specific library.

### Gesture cooldowns

- Blink: randomized 3-9 seconds.
- Ear twitch: 12-25 seconds.
- Idle fidget: 20-40 seconds.
- Annoyed tap: 8-18 seconds while blocked.
- Dramatic sigh: 30-90 seconds while blocked.
- Smug sparkle: on entry plus 20-60 second cooldown if healthy persists.
- Alert flash: on entry only, decay in 2-4 seconds.

### Performance and display constraints

- Fixed logical canvas: 320x480.
- Target: 60 fps on NUC in browser; acceptable minimum 30 fps.
- Pixel density: 1.
- No remote CDN in kiosk mode.
- Avoid large static bright regions for burn-in.
- Keep red/magenta localized and brief.
- Keep captions 26-34 characters when possible.

## Acceptance Criteria for Next Prototype

A first improved prototype is acceptable when:

- It is no longer primarily an orb. The silhouette has body plus ears/wings and arms/wing-arms.
- Eyes remain visible and expressive in every state.
- Idle looks alive through layered micro-motion, not shaking.
- Thinking, smug, blocked, night, and working states can be identified with captions hidden.
- Blocked state uses crossed arms or equivalent posture plus side-eye, not just red color/jitter.
- At least one state includes a non-looping one-shot gesture with a cooldown.
- Motes/status glyphs support the character instead of dominating it.
- The implementation can be built from primitive vector shapes and local JS dependencies.
- No proprietary assets, external editor, or hardware/display-driver changes are required.

## Review Notes

- The current p5.js prototype was reachable on the LAN and shows a competent starting scaffold with visible eyes, orbiting motes, and a polished dark/cyan palette. It still needs a stronger character concept because an egg/orb with eyes will naturally regress into glow, shake, ring, and caption changes.
- The previous `docs/character-bible.md` remains useful for safety, state names, copy rules, and palette. This document supersedes its silhouette/anatomy direction by making body, ear/wing fins, and arms/wing-arms required for the next expressive prototype.
- The previous `docs/animation-library-research.md` recommendation still stands: PixiJS + Anime.js is the durable default, p5.js is a prototype/procedural layer, Rive is the authored-character runner-up.
- Main design risk: Direction A can become too childish if proportions are too cute. Keep the face wry, colors dark/technical, and gestures dry rather than bouncy-cartoon.
- Secondary risk: overfitting to a mascot may reduce glanceable status. Solve this by putting status into the character's props and belly panel, not by returning to dashboard widgets.
