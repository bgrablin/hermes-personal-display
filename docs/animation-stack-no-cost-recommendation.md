# No-Cost Animation Stack Recommendation

Date: 2026-05-16
Task: `t_32f288a5`
Target: Hermes Personal Display character, 320x480 portrait kiosk on Brian's Intel NUC
Constraint: no paid tools, no paid exports, no paid assets, no required cloud service

## 1. BLUF recommendation

Use **PixiJS as the core character/runtime layer**, with a small local state machine and procedural animation code. Keep **p5.js only for ambient/procedural experiments** or retire it from the production character path if it keeps producing orb/shake behavior. Use **Lottie/dotLottie only for optional authored loops** such as boot, alert sparkle, or small glyph effects. Do **not** choose Rive as the no-cost default right now.

Reason: Rive's runtimes are MIT licensed and technically excellent, but Rive's own pricing now frames the product as **"Free to create, $9/mo to ship"** and the free plan has **no exports**. That violates Brian's no-pay constraint for any new custom `.riv` production asset. PixiJS has the cleanest no-cost path: MIT runtime, local bundling, no export gate, no proprietary editor dependency, and enough control to build the NUC Gremlin Familiar with real posture, eyes, ears, arms, motes, and captions.

Recommended next prototype stack:

```text
static HTML or Vite later if needed
  + PixiJS local bundle/runtime
  + tiny hand-written state machine
  + simple tween/easing helpers, or Anime.js only if already vendored under MIT
  + local JSON persona/display state packets
  + optional Lottie/dotLottie loops for non-core effects
  + no CDN dependency in kiosk mode
```

Decision: **PixiJS-first hybrid. Rive only if a free, legally usable, already-exported `.riv` asset is proven and accepted as disposable. Lottie as optional loop playback, not the character brain.**

## 2. License and cost findings

### Rive

Findings:

- Rive runtimes are open source and MIT licensed. Rive's runtime page says the runtimes are "Entirely open-source" and MIT licensed. The runtime license file is also MIT. Sources: https://rive.app/runtimes and https://raw.githubusercontent.com/rive-app/rive-runtime/main/LICENSE
- Rive's pricing page states **"Free to create $9/mo to ship"**. The fetched pricing summary lists the Free plan as exploration/learning and says Free has **no exports**. Source: https://rive.app/pricing
- Rive's pricing update says exports moved to paid plans, the Editor stays free for learning, runtimes remain MIT, and production exports require Cadet or above. Source: https://rive.app/blog/rive-s-new-9-mo-plan
- Rive marketplace files may be useful for learning/remixing, but they are risky as a no-cost production dependency unless the exact asset license, export status, and local `.riv` availability are verified per asset. Rive's marketplace docs describe opening others' files directly in the Rive editor for sharing, feedback, and learning. Source: https://rive.app/docs/community/marketplace-overview

Assessment:

Rive is technically the best authored-character system in this comparison, but it is not the best no-cost system under the current constraint. The runtime is free, but the practical authoring/export path is not free for new production assets. An already-exported free `.riv` sample could be tested, but it should not be the architecture bet.

### Lottie and dotLottie

Findings:

- `lottie-web` is MIT licensed. Source: https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md
- `@lottiefiles/dotlottie-web` is MIT licensed. Source: https://raw.githubusercontent.com/LottieFiles/dotlottie-web/main/LICENSE
- dotLottie Web supports Lottie JSON and `.lottie`, with WebAssembly, Canvas 2D, WebGL2/WebGPU backends, worker support, segments, themes, and state-machine events. Source: https://github.com/LottieFiles/dotlottie-web
- dotLottie state machines exist and support inputs, events, and transitions. The docs describe numeric/string/boolean/event inputs and state transitions. Sources: https://github.com/LottieFiles/dotlottie-web/wiki/State-Machines and https://lottiefiles.com/state-machine

Assessment:

Lottie is no-cost at runtime and useful for small authored loops. It is weaker as the primary Hermes character runtime because the project needs a living stateful mascot with procedural gaze, posture, ears, arms, cooldown gestures, motes, and local JSON state. dotLottie state machines improve the story, but the authoring workflow still leans toward external creator tooling and authored animation segments. It is a good secondary asset format, not the character engine.

### PixiJS

Findings:

- PixiJS is MIT licensed. Source: https://raw.githubusercontent.com/pixijs/pixijs/dev/LICENSE
- PixiJS describes itself as an HTML5 creation engine and fast, flexible 2D WebGL renderer. Source: https://pixijs.com/
- PixiJS can be bundled locally from npm or vendored into a static kiosk app, so no CDN or paid runtime is required.

Assessment:

PixiJS is the best no-cost default. It provides a durable scene graph and fast 2D rendering while letting the app own the state machine, rig controls, asset choices, and safety filtering. The burden is that we must build the character rig and animation vocabulary ourselves, but that is also what avoids editor lock-in.

### p5.js

Findings:

- p5.js is free/open-source creative coding software. Source: https://github.com/processing/p5.js/
- The p5.js library is LGPL 2.1. Sources: https://p5js.org/copyright/ and https://raw.githubusercontent.com/processing/p5.js/main/license.txt

Assessment:

p5.js is good for exploration, generative ambience, and quick sketches. It should not remain the core character runtime unless the implementation is explicitly refactored into named rig parts and pose controls. For this project, p5.js has already shown the likely failure mode: too much procedural motion and not enough character anatomy, resulting in shaking/status-widget behavior.

## 3. Practical implementation path for the next prototype

No code should be implemented in this research task, but the next implementation card should use this path.

### Step 1: Choose the no-cost default

Use PixiJS as the main renderer. Do not start with Rive. Do not start with a Lottie-only character.

### Step 2: Build a real rig, not another orb

Implement the Direction A "NUC Gremlin Familiar" as named parts:

```text
HermesCharacter
  background layer
  shadow/hover layer
  body shell
  belly/core terminal panel
  left/right eyes
  eyelids and brows
  left/right wing-ear fins
  left/right arms or wing-arms
  orbiting motes/status glyphs
  caption layer
  foreground sparkle/scanline layer
```

The design problem is not just the animation library. The character needs anatomy that can express state without text. The next prototype must make idle, thinking, smug, blocked, night, and working states readable with captions hidden.

### Step 3: Use a small local state machine

Define state targets as data, then interpolate rig controls:

```text
idle_watchful
thinking_focused
healthy_smug
blocked_annoyed
night_sleepy
working_autonomous
```

Rig controls should include:

```text
body scale, rotation, lean, glow
left/right eye openness
pupil x/y
brow angle
left/right ear angle
left/right arm pose
orbit speed/radius/clump
caption opacity
accent palette
```

Use hand-written easing first. Add Anime.js only if the implementation wants a maintained MIT tween helper and bundles it locally.

### Step 4: Keep Lottie/dotLottie as optional effects

Use Lottie only where authored loops are a win:

- boot animation
- alert sparkle
- completed-task flourish
- tiny loading glyph
- decorative status icon

Do not rely on Lottie for the core face, posture, eyes, ears, arms, or state machine unless a no-cost authoring path is proven.

### Step 5: Keep p5.js out of the core character

Acceptable p5.js roles:

- one-off concept sketches
- procedural background fields
- particle/scanline experiments
- fallback ambient layer

Retire p5.js from the production character path if it continues to encourage a single draw loop with shake/glow/ring changes instead of named rig anatomy.

### Step 6: Bundle locally for kiosk mode

Production kiosk mode should not depend on CDN URLs. Vendor or bundle runtime JS locally and run from a local static server or local file path, depending on browser/CORS needs.

## 4. Risks and pitfalls

| Risk | Impact | Mitigation |
|---|---|---|
| Rive editor/export lock-in | Free runtime does not matter if new production `.riv` exports require a paid plan | Do not choose Rive unless an already-exported, license-clear `.riv` asset is proven and accepted as disposable |
| Marketplace/sample asset ambiguity | Free examples may be fine for learning but unsafe as production identity assets without per-asset terms | Treat Rive marketplace files as research only until license and export rights are verified |
| Lottie authoring burden | Runtime is free, but polished custom loops usually require design/export tooling | Use Lottie only for optional loops, not as the character foundation |
| dotLottie state-machine novelty | More capable than old Lottie, but still an authored-file workflow | Keep core state machine in app code where Hermes can own it |
| PixiJS state-machine burden | We must implement rig controls, poses, transitions, cooldowns, and safety filtering | Keep the first rig small, with 6 states and explicit named controls |
| p5.js prototype gravity | Easy to regress into procedural screensaver effects and shaking | Restrict p5.js to ambient/prototype work, or enforce rig classes and pose data if used |
| CDN reliance | Kiosk may fail or hang without internet | Bundle or vendor all JS dependencies locally |
| 320x480 legibility | Text and micro-icons can become decorative noise | Test at fixed 320x480 from the first frame; keep captions short and shape language bold |
| NUC/browser GPU variance | WebGL/WebGPU behavior depends on browser session and display setup | Use PixiJS with reduced-effects fallback; avoid heavy shaders until hardware intake confirms behavior |
| Asset authoring burden | Building an expressive mascot from primitives still takes design discipline | Implement only one silhouette first: NUC Gremlin Familiar, with body, eyes, ears, and arms |
| Safety/privacy | Captions could display sensitive local/system text | Treat display text as allow-listed status/caption strings, not raw logs or model output |

## 5. Decision matrix

Scores are for Brian's no-cost Hermes Personal Display constraint. 5 is best.

| Option | Cost fit | License/runtime simplicity | Expressive character fit | State-machine control | Authoring burden | Local/offline kiosk fit | Recommendation |
|---|---:|---:|---:|---:|---:|---:|---|
| PixiJS core | 5 | 5 | 4 | 5 | 3 | 5 | **Use as default** |
| PixiJS + optional Lottie loops | 5 | 5 | 5 | 5 | 3 | 5 | **Best hybrid** |
| Lottie/dotLottie core | 4 | 5 | 3 | 3-4 | 2 | 5 | Use only for loops unless authoring path is proven |
| p5.js core | 5 | 3 | 3 | 3 | 4 | 5 | Retire from core or enforce strict rig architecture |
| p5.js ambient layer | 5 | 3 | 2 | 3 | 5 | 5 | Keep as optional procedural layer |
| Rive runtime with custom new asset | 1 | 5 runtime, 2 workflow | 5 | 5 | 3 | 5 | Do not use under no-pay constraint |
| Rive with proven free exported sample | 3 | 4 | 4 | 5 | 4 | 5 | Research-only or disposable experiment |
| SVG/CSS state machine + Pixi particles | 5 | 5 | 3-4 | 4 | 4 | 5 | Acceptable fallback if PixiJS feels heavy |

## Recommendation for Brian

Choose **PixiJS core + local app-owned state machine** for the next prototype. This is the only option that satisfies all of the following at once:

- no paid editor
- no paid export
- no paid runtime
- no cloud dependency
- enough structure for a real character
- enough flexibility for procedural personality
- good fit for 320x480 local kiosk display

Use Lottie/dotLottie as a secondary loop format only after the character reads well in PixiJS. Keep p5.js as a sketchpad or ambient layer. Put Rive on hold until Brian is willing to pay for export or a free already-exported `.riv` file is verified for license, quality, and local runtime behavior.

## Implementation handoff

Next worker should build a PixiJS prototype using the Direction A NUC Gremlin Familiar. Acceptance should require:

1. Fixed 320x480 logical canvas.
2. Body plus eyes plus eyelids/brows plus ears/fins plus arms/wing-arms.
3. Idle, thinking, healthy/smug, blocked/annoyed, night, and working states.
4. At least one non-looping gesture with cooldown.
5. No continuous shaking as the main animation cue.
6. No CDN dependency in production/kiosk mode.
7. No paid asset/editor/export requirement.

If the worker wants to test Rive, scope it as a separate disposable spike: verify exact asset terms, confirm an already-exported `.riv` is available without payment, load it locally, and prove state-machine inputs work. Do not block the PixiJS prototype on that spike.

## Sources

- Rive pricing: https://rive.app/pricing
- Rive pricing update, exports moved to paid plans: https://rive.app/blog/rive-s-new-9-mo-plan
- Rive runtimes, open-source and MIT runtime posture: https://rive.app/runtimes
- Rive runtime MIT license: https://raw.githubusercontent.com/rive-app/rive-runtime/main/LICENSE
- Rive marketplace overview: https://rive.app/docs/community/marketplace-overview
- PixiJS official site: https://pixijs.com/
- PixiJS MIT license: https://raw.githubusercontent.com/pixijs/pixijs/dev/LICENSE
- dotLottie Web repository and capabilities: https://github.com/LottieFiles/dotlottie-web
- dotLottie Web MIT license: https://raw.githubusercontent.com/LottieFiles/dotlottie-web/main/LICENSE
- dotLottie state-machine docs: https://github.com/LottieFiles/dotlottie-web/wiki/State-Machines
- Lottie state-machine overview: https://lottiefiles.com/state-machine
- lottie-web MIT license: https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md
- p5.js GitHub: https://github.com/processing/p5.js/
- p5.js copyright and license summary: https://p5js.org/copyright/
- p5.js LGPL 2.1 license text: https://raw.githubusercontent.com/processing/p5.js/main/license.txt

## Confidence

High on the stack recommendation and cost/licensing direction. Moderate on exact per-asset Rive marketplace usability because that depends on each asset's terms and whether a local exported `.riv` is available without payment.
