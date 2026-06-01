# Mascot v2 motion recommendation

## Scope

This is a runtime/animation recommendation for the Hermes 320×480 personal display mascot in:

- `src/mascot-v2/states.js`
- `src/mascot-v2/runtime.js`
- `src/character-runtime-v2.html`
- `src/mascot-v2-debug.html`

Goal: stop the character from reading as "always looking right" and "constantly bouncing at different rates," while preserving the desired motion language:

- deliberate gaze
- natural blinks
- clear side-eye
- breathing
- restrained motes/orbits
- no generic random bounce

## What is happening now

### 1) The runtime has several sources of rightward read

The current implementation is not globally hard-right, but it creates enough right-biased cases that the overall impression can still skew right.

#### Evidence from state gaze pools

From `src/mascot-v2/states.js`:

- `idle_watchful` is mostly centered, but still includes `right`, `down_right`, and `smug`.
- `healthy_smug` is strongly right-biased:
  - weighted right-target share: `0.80`
  - expected gaze X: about `+3.84`
- `night_sleepy` has no left targets at all:
  - weighted right-target share: `0.36`
  - center share: `0.64`
  - expected gaze X: about `+1.13`

Computed local summary:

- `idle_watchful`: mean gaze X `+0.22`
- `thinking_focused`: mean gaze X `-0.83`
- `healthy_smug`: mean gaze X `+3.84`
- `blocked_annoyed`: mean gaze X `-7.53`
- `night_sleepy`: mean gaze X `+1.13`

So the issue is not "every state is right-biased"; it is that some visible/default-friendly states still bias screen-right enough to dominate the memory of the character.

#### Runtime behavior that weakens the sense of deliberate holds

In `src/mascot-v2/runtime.js`, `updateGaze()` does all of the following at once:

- chooses a new weighted target on a timer
- adds continuous micro motion every frame
- eases toward the target every frame with a fixed `0.18` smoothing factor

That means the eyes are almost never truly still. Even during a supposed dwell, they keep drifting due to:

- `microX = sin(...) * 0.4`
- `microY = cos(...) * 0.25`
- per-eye jitter in `updateEyes()`

This reduces the feeling of "the mascot chose to look there and is holding it" and instead reads closer to constant roaming.

### 2) The runtime has too many simultaneous oscillators

The root complaint about bounce is credible even though the explicit body amplitudes are numerically small.

The current frame loop layers motion from many systems at once:

- root body drift X/Y
- breath Y + body scale
- body tilt sine
- tail sway
- helmet drift
- wing flap
- satchel sway
- orbit rotation
- mote pulse/reorder motion
- ambient line wave motion
- footer tick pulsing
- status-dot pulsing
- random intent body offsets

The character may only move a small number of pixels, but the *scene* is always busy, and many channels move at different frequencies. That creates beat-frequency noise, which reads as "bouncing at different rates."

#### Root/body motion today

Base root vertical amplitude is approximately:

- `idle_watchful`: `0.60`
- `thinking_focused`: `0.51`
- `healthy_smug`: `0.43`
- `blocked_annoyed`: `0.55`
- `night_sleepy`: `0.41`

Those numbers alone do not explain the complaint. The stronger cause is the combination of:

- root Y motion
- root tilt
- secondary appendage motion
- periodic intent body offsets

#### Intents are still injecting body motion into otherwise calm states

Examples from `src/mascot-v2/states.js`:

- `settle` adds `bodyBob: 2.0`
- `tiny_perk` adds `body.y: -4`
- `smug_nod` adds `body.y: 3`
- `dramatic_sigh` adds `body.y: 3`
- `sleep_drift` adds `body.y: 6`

And automatic intent firing is enabled per state via `intentEveryMs`, including idle. That means even if the idle loop is restrained, the system periodically re-injects visible body movement.

## Diagnosis

### Why it reads as right-looking

Primary causes:

1. `healthy_smug` is heavily right-biased by design.
2. `night_sleepy` has no leftward targets.
3. Gaze never really settles because micro motion and smoothing are always active.
4. Neutral readability depends on a live loop; if a user catches a transition or a right-biased state, the memory becomes "it looks right again."

### Why it reads as bouncing

Primary causes:

1. Too many independent oscillators are active all the time.
2. Root motion, appendage motion, and UI FX are not separated by a strict motion budget.
3. Auto-intents keep adding body Y impulses in states that should mostly breathe and watch.
4. Different frequencies across root, helmet, wings, satchel, motes, and status chrome create the impression of random motion rather than one intentional idle.

## Recommendation: runtime architecture changes

## 1) Split motion into four explicit channels

Use separate controllers instead of one blended frame soup.

### A. `poseChannel`
Owns only whole-character/root motion:

- root X
- root Y
- root tilt
- root scale

Rules:

- idle/healthy/night: root Y is breath only
- no independent idle drift Y
- root X drift either removed or reduced to near-zero
- body impulses only allowed during explicit named intents

### B. `gazeChannel`
Owns:

- gaze target selection
- saccade timing
- dwell timing
- hold micro-settle
- side-eye overrides

Rules:

- gaze should be event-based, not continuously wandering
- one saccade, then a true hold
- micro motion only during hold, and much smaller than current

### C. `blinkFaceChannel`
Owns:

- blink timing
- lid position
- squint overlays
- brow/mouth overlays

Rules:

- face animation can remain active without moving the whole body
- most idle expressiveness should come from lids/brows/mouth, not root displacement

### D. `fxChannel`
Owns:

- motes
- orbit rings
- ambient lines
- footer ticks
- status pulses

Rules:

- FX must support the character, not compete with it
- focused/blocked can be more active
- idle/night should be visibly quieter

## 2) Replace continuous gaze lerp with saccade → hold

Current gaze should be replaced with a small state machine:

- `select_target`
- `saccade`
- `hold`
- optional `micro_adjust`

Suggested timings:

- saccade duration: `90–180 ms`
- hold duration, idle: `1800–4200 ms`
- hold duration, healthy/night: `2400–5200 ms`
- hold duration, thinking: `700–1600 ms`
- micro-adjust: optional, `1` small correction per hold max

Implementation change:

- during `saccade`, interpolate from old gaze to new gaze with a dedicated easing curve
- during `hold`, stop chasing a moving target
- reduce hold jitter to about `±0.08 px` to `±0.15 px` screen-space equivalent, not `±0.4`
- remove per-eye extra jitter unless needed for a very subtle alive effect

This is the most important fix for the "deliberate gaze" requirement.

## 3) Remove idle root drift Y; let breath own vertical motion

In `draw()` today, root Y is built from both `driftY` and `breath`.

Recommendation:

- idle/healthy/night: set `bodyDriftY = 0`
- keep one breath curve only
- optionally keep tiny root X drift in idle, but cap it hard

Suggested root budgets:

- idle root Y peak amplitude: `<= 1.0 px`
- healthy root Y peak amplitude: `<= 1.0 px`
- night root Y peak amplitude: `<= 1.4 px`
- idle root X peak amplitude: `<= 0.5 px`
- healthy/night root X peak amplitude: `<= 0.3 px`

If drift remains, it should read as hover bias, not bobbing.

## 4) Restrict auto-intents in calm states to face/gaze only

For `idle_watchful`, `healthy_smug`, and `night_sleepy`:

- automatic intents should not use `body.y`, `bodyBob`, or large tilt
- auto-intents should mainly be:
  - glance left/right
  - side-eye hold
  - slow blink/double blink
  - brow pop
  - tiny mouth shift

Move body-motion intents to manual trigger only, or to more active states like `thinking_focused` and `blocked_annoyed`.

Specifically:

- remove `settle.bodyBob` from idle auto-pool
- remove `tiny_perk.body.y` from idle auto-pool or reduce it to facial-only
- keep `smug_nod` for healthy, but lower frequency and isolate it as the only body event in that state

Suggested auto-intent cadence:

- idle: `1 every 10–18 s`
- healthy: `1 every 12–20 s`
- night: `1 every 14–24 s`
- thinking: `1 every 5–9 s`
- blocked: `1 every 6–10 s`

## 5) Rebalance gaze pools so neutral states prove they are not stuck right

### Idle
Current idle is acceptable numerically, but should be even more obviously centered.

Recommend:

- `center` dominant
- matched left/right counts
- only occasional diagonal looks

Target distribution for idle:

- center / forward focus: `55–70%`
- left family: `12–18%`
- right family: `12–18%`
- up/down diagonals combined: `8–15%`

### Healthy
Healthy can keep a rightward personality, but it should not read like a bug.

Recommend:

- keep right as favored
- add at least one left glance and a center hold with real dwell

Target distribution for healthy:

- right-family: `40–55%`
- center: `25–35%`
- left-family: `10–20%`
- diagonals: remainder

### Night
Night should not be right-only. It should feel downward/centered, slightly drowsy.

Recommend:

- add `down_left` or `left`
- keep `down`/`sleepy` dominant

Target distribution for night:

- down/sleepy/center: `70–85%`
- left-family: `8–15%`
- right-family: `8–15%`

## 6) Quiet secondary motion in calm states

Reduce or gate these in idle/healthy/night:

- wings
- satchel sway
- helmet drift
- orbit speed
- mote scale pulse
- ambient line amplitude
- footer tick opacity animation
- state-dot pulse amplitude

Suggested calm-state policy:

- wings: nearly still outside explicit perk/thinking states
- satchel: move only when root moves meaningfully
- helmet: no independent sine drift; inherit from root tilt only
- motes: slow drift, no frequent bunch/reorder behavior
- ambient lines/footer/status dot: lower contrast and lower amplitude

The desired read is: *the mascot is breathing and watching while the display remains alive,* not *every layer is animating independently.*

## Concrete code changes

## `src/mascot-v2/runtime.js`

### Change `updateGaze()`

Replace the current always-on target + micro motion logic with:

- `this.gazeMode = 'hold' | 'saccade'`
- `this.gazeFrom`
- `this.gazeTo`
- `this.gazeMoveStart`
- `this.gazeMoveDuration`
- `this.gazeHoldUntil`

Behavior:

1. On target change, store `from` and `to`, enter `saccade`.
2. During `saccade`, interpolate exactly.
3. When complete, snap into `hold`.
4. During `hold`, keep gaze fixed except for tiny low-frequency drift.

### Change root motion assembly in `draw()`

Current:

- `driftY + breath * 0.6 + intentBodyY + intentBob`
- independent body tilt sine

Recommend:

- breath is the only idle Y source
- remove independent idle tilt sine, or cut it by at least half
- root tilt should mainly come from state pose and explicit intents

### Gate body-moving intents

Introduce a flag per intent, for example:

- `channel: 'face' | 'pose' | 'mixed'`
- `autoAllowed: true/false`

Then auto-trigger only `autoAllowed` intents.

## `src/mascot-v2/states.js`

### Add per-state motion budgets

Suggested fields:

- `rootMotion: { xMax, yMax, tiltMax, scaleMax }`
- `fxIntensity`
- `autoIntentMode: 'face_only' | 'mixed'`
- `gazeProfile: { saccadeMs, dwellMs, holdJitterPx }`

This makes the animation policy explicit instead of implicit.

### Rebalance gaze pools

Update especially:

- `healthy_smug`
- `night_sleepy`

And optionally tighten idle to make centered holds more obvious.

## `src/mascot-v2-debug.html` and `approval.js`

Add one more verification card:

- `idle hold center`

This card should force:

- centered gaze
- no auto-intent
- no active root drift

Purpose: prove that the rig can read neutral and front-facing without label help.

Also consider a simple debug overlay with:

- current gaze target name
- gaze mode (`saccade` / `hold`)
- root X/Y
- current intent name

That will make future tuning much faster.

## Measurable acceptance criteria

## Gaze acceptance

### Idle neutrality
Observe `idle_watchful` for `60 s`.

Pass if all are true:

- mean gaze X is within `±1.0 px`
- center/forward-hold time is `>= 50%`
- left-family and right-family dwell counts differ by no more than `25%`
- at least `3` holds last `>= 1.8 s` with visibly stable eyes

### Healthy personality
Observe `healthy_smug` for `45 s`.

Pass if:

- it still feels slightly right-biased
- mean gaze X stays below `+4.5 px`
- at least `1` center hold and `1` leftward glance occur within the sample

### Night neutrality
Observe `night_sleepy` for `60 s`.

Pass if:

- it reads sleepy/downward, not right-stuck
- at least `1` leftward dwell occurs in the sample
- mean gaze X remains within `±1.5 px`

### Side-eye clarity
Using the debug page stills:

Pass if:

- side-eye left and side-eye right are obviously different without label help
- neutral still reads centered/front-facing

## Root-motion acceptance

### Calm-state body motion
Sample `idle_watchful`, `healthy_smug`, and `night_sleepy` for `60 s` each.

Pass if:

- root Y peak-to-peak motion is `<= 2.0 px` in idle/healthy
- root Y peak-to-peak motion is `<= 2.8 px` in night
- root X peak-to-peak motion is `<= 1.0 px` in calm states
- there is no repeated periodic hop read

### Auto-intent budget
Pass if:

- idle auto-intents occur `<= 4/min`
- healthy auto-intents occur `<= 3/min`
- night auto-intents occur `<= 3/min`
- zero idle/night auto-intents include body Y impulses greater than `1 px`

## FX acceptance

Pass if, in idle and night:

- motes/orbits are visibly alive but secondary
- disabling the character root motion does not make the screen still feel "bouncy"
- focus remains on face first, body second, FX third

## Recommended implementation order

1. Replace gaze controller with `saccade → hold`.
2. Remove idle root drift Y and reduce independent tilt.
3. Gate auto-intents so calm states stop injecting body motion.
4. Rebalance `healthy_smug` and `night_sleepy` gaze pools.
5. Quiet FX in calm states.
6. Add debug overlay and acceptance pass.

## Bottom line

The current runtime is close in *parts*, but not in *motion hierarchy*.

The main problem is not a single bad value. It is that:

- gaze is always in motion instead of making choices and holding them
- too many systems animate at once
- calm states still allow body-moving auto-intents
- a few states retain enough right bias to keep reviving the old complaint

If the runtime is restructured around:

- one calm root-breath channel
- one deliberate gaze channel
- face-first expression
- quieter background FX

then it should land much closer to the target: a mascot that watches, blinks, side-eyes, and breathes, instead of roaming and bouncing.