# Animation Library Research for Hermes Personal Display

Date: 2026-05-16
Task: `t_e4e6aa73`
Target: 320x480 portrait kiosk on Brian's Intel NUC, local/offline-first, no WAN exposure, no vendor display/kernel changes before hardware arrives.

## BLUF

Recommendation: use a small local browser renderer with **PixiJS as the 2D rendering/runtime layer**, **Anime.js for lightweight timeline/state transitions**, and optionally **p5.js only for procedural ambient effects**. This gives Hermes a recognizable character, eyes, skins, orbiting status glyphs, and JSON-driven state changes without requiring proprietary asset authoring tools or overbuilding a game engine.

Do **not** start with Rive, Live2D, Spine, or Three.js as the primary runtime.

- Rive is the strongest authored-character runner-up because its MIT web runtime and state machines are a clean match for mood/state inputs, but it adds a Rive-editor asset pipeline.
- Lottie is good for designer-authored one-shot loops, but weak for a live, stateful character with procedural eyes, moods, and local data integration.
- Live2D and Spine are capable character systems, but licensing/tooling and asset-authoring overhead are not worth it for this private 320x480 Hermes display.
- Three.js/WebGL is useful only for shader/postprocess polish, not as the primary character runtime.

Practical first prototype stack:

```text
Vite or static HTML
  + PixiJS v8 canvas/WebGL renderer
  + Anime.js v4 for timelines/easing/state transitions
  + local JSON file/API: display_state.json + persona_packet.json
  + optional p5.js sketch or custom shader layer for ambient particles/noise
  + Chromium kiosk later, after hardware/display target is known
```

## Requirements interpreted

The runtime should support:

1. A persistent, recognizable Hermes character with at least eyes.
2. Optional skins that keep the same character identity.
3. Constant idle motion: breathing, blinking, eye tracking, orbiting motes, attention pulses.
4. Mood states driven by JSON: idle, thinking, speaking, autonomous work, degraded, blocked/annoyed, night.
5. Local/offline hosting on the NUC.
6. Small portrait layout at 320x480.
7. Good performance on Intel NUC integrated graphics.
8. Low operational risk. No driver/kernel/display changes until hardware arrives.
9. No credential material or WAN-visible dashboard exposure.

## Scoring summary

Scores are relative for this specific Hermes display, 5 is best.

| Option | License/runtime posture | Authoring burden | JSON/state control | Character/eyes/skins | 320x480 kiosk fit | NUC performance | Complexity | Fit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| PixiJS + Anime.js | 5 | 4 | 5 | 5 | 5 | 5 | 4 | **Best default** |
| Rive runtime | 5 | 2 | 5 | 5 | 5 | 5 | 3 | Best authored-character runner-up |
| p5.js | 3 | 5 | 4 | 3 | 5 | 4 | 5 | Good prototype/procedural layer |
| Lottie/lottie-web | 5 | 2 | 2 | 3 | 5 | 4 | 4 | Good loops, weak live character brain |
| Anime.js or GSAP alone | 3-5 | 4 | 4 | 2 | 5 | 5 | 4 | Useful helper, not enough alone |
| Three.js | 5 | 3 | 4 | 3 | 4 | 4 | 2 | Overkill unless 3D/shaders matter |
| Live2D Cubism | 2 | 1 | 4 | 5 | 4 | 4 | 1 | Capable but licensing/tooling drag |
| Spine | 1 | 1 | 4 | 5 | 4 | 5 | 1 | Capable but paid editor/runtime terms |

## Recommendation

### Use PixiJS as the core renderer

PixiJS is the best fit for a living character rendered on a tiny local display:

- MIT licensed runtime.
- Built for fast 2D graphics in the browser using WebGL/WebGPU where available.
- Works well with sprites, vector-ish shapes, masks, filters, particles, texture atlases, and layered composition.
- Easy to drive from local JSON because the app owns the scene graph and animation state.
- Supports a stable character anatomy: core/body, eyes, pupils, eyelids, orbiting glyphs, status rings, skins, captions.
- Avoids Rive/After Effects/Live2D/Spine authoring dependency for the first version.

Recommended character model:

```json
{
  "mood": "watchful",
  "skin": "terminal-familiar",
  "energy": 0.42,
  "focus": 0.35,
  "eye": "slow-scan",
  "palette": "cyan-violet-low",
  "micro_actions": ["blink-double", "mote-reorder"],
  "caption": "quiet systems, suspiciously behaved"
}
```

PixiJS should clamp and interpret that packet as data only. It should never execute model output.

### Use Anime.js for timelines and easing

Anime.js is a good companion for PixiJS because it can animate JavaScript object properties, not only DOM/CSS. Use it for:

- Eye blink timelines.
- Squint/annoyed transitions.
- Breathing pulse curves.
- State transition easing.
- Mote reordering bursts.
- Caption fade/slide.

Keep Anime.js as the small timeline engine. Do not build the whole character out of DOM nodes unless the prototype proves SVG/DOM is enough.

### Use p5.js selectively, not as the main runtime

p5.js is excellent for fast creative prototypes and procedural ambience. It is less ideal as the long-term character runtime because the global sketch/draw-loop model encourages hand-coded drawing logic rather than a maintainable scene graph.

Good p5.js uses here:

- Prototype visual identity quickly.
- Generate ambient noise, particles, scanlines, and background fields.
- Explore procedural motion vocabulary.

Less good p5.js uses here:

- Long-lived production character runtime with skins, layered anatomy, status glyphs, JSON state, and maintainable animation modules.

### Keep Rive as runner-up if authored animation becomes the priority

Rive is the strongest alternative if Brian wants a more designer-authored animated character. Its web runtime is MIT licensed and supports state machines with runtime inputs such as triggers, booleans, and numbers. That maps well to Hermes mood/state packets.

Rive becomes attractive if:

- A designer creates a polished `.riv` character.
- The character needs rich authored deformation and transitions.
- The project wants state-machine authoring in a visual tool.

Rive is less attractive for the first prototype because:

- It requires a Rive asset-authoring workflow.
- Open-source runtime does not eliminate dependency on a hosted/proprietary editor/tooling path for comfortable asset creation.
- Procedural status glyphs and local data overlays still need app code around the Rive canvas.

Recommended Rive role: second-stage character asset experiment, not first-stage platform choice.

## Option details

### 1. PixiJS

Assessment:

- Runtime license: MIT.
- Offline/local hosting: good via bundled npm assets or local static files.
- Asset authoring: flexible. Can start with code-drawn shapes, SVGs, PNG atlases, or generated assets.
- JSON/state control: excellent. The app owns all scene objects and can map JSON fields directly into display state.
- Character/eyes/skins: excellent. Build the character as a stable scene graph with replaceable skin textures/palettes.
- 320x480 kiosk fit: excellent. Fixed canvas and pixelDensity control are straightforward.
- NUC performance: very likely fine. Workload is tiny for WebGL on an Intel NUC.
- Complexity: moderate. More structure than p5.js, less asset/tooling complexity than Rive/Live2D/Spine.

Best use:

- Main Hermes display renderer.
- State-driven character, motes, rings, captions, and procedural overlays.

Risks:

- Needs a little architecture discipline to avoid becoming a pile of animation callbacks.
- WebGPU/WebGL availability depends on the kiosk browser/session, but PixiJS can be tested before hardware arrives.
- Text legibility at 320x480 must be tested on real hardware.

### 2. Anime.js / GSAP-style timelines

Assessment:

- Anime.js license: MIT.
- GSAP license: free no-charge standard license since Webflow acquisition, but not MIT/open-source in the same simple sense.
- Offline/local hosting: good if vendored/bundled.
- Asset authoring: not an asset system, only animation/tweening.
- JSON/state control: good. Animate object properties or DOM/SVG attributes from state packets.
- Character/eyes/skins: weak alone, good as a helper.
- 320x480 kiosk fit: excellent.
- NUC performance: excellent for small scenes.
- Complexity: low as a helper, risky if used as the whole architecture.

Best use:

- Anime.js as timeline/easing helper for PixiJS object properties.
- GSAP only if the project later needs advanced SVG morphing or a designer specifically prefers it.

Risks:

- Timeline libraries do not solve rendering, asset layering, or character anatomy.
- GSAP is no longer a paid blocker for normal use, but its license remains a custom standard license, not MIT. For simplicity, prefer Anime.js first.

### 3. p5.js

Assessment:

- License: LGPL 2.1 in the current repository license file.
- Offline/local hosting: good.
- Asset authoring: code-first, no special authoring tools.
- JSON/state control: good enough. Load/poll JSON and change draw-state.
- Character/eyes/skins: possible, but code-heavy and less structured.
- 320x480 kiosk fit: excellent.
- NUC performance: fine if pixelDensity(1), friendly errors disabled, and draw calls stay modest.
- Complexity: low for prototypes, moderate/high for a maintainable production character.

Best use:

- Rapid visual prototypes.
- Procedural background, particles, scanline/noise, idle motion experiments.

Risks:

- Easy to produce tutorial-looking output if not carefully designed.
- Long-lived stateful character code can get messy without a scene graph.
- LGPL is usually manageable for a local app, but MIT dependencies are simpler.

### 4. Rive runtimes

Assessment:

- Runtime license: MIT for `rive-wasm`.
- Offline/local hosting: good. `.riv` files and runtime can be local.
- Asset authoring: requires Rive editor/workflow for best results.
- JSON/state control: excellent. Rive state machines respond to runtime inputs like triggers, booleans, and numbers.
- Character/eyes/skins: excellent if authored in Rive.
- 320x480 kiosk fit: excellent.
- NUC performance: likely excellent for a small canvas. WebGL2 runtime exists; canvas runtime may also be available depending package choice.
- Complexity: moderate because of editor/runtime split.

Best use:

- Polished authored character once the visual identity is stable.
- A `.riv` mascot with state-machine inputs for moods and micro-actions.

Risks:

- Asset-authoring dependency is the main blocker.
- If Brian/Hermes wants frequent procedural skin changes, Rive may feel constrained without repeated editor work.
- Still needs an outer app for local status data, captions, and policy filtering.

### 5. Lottie / lottie-web

Assessment:

- Runtime license: MIT.
- Offline/local hosting: good. JSON assets and player can be local.
- Asset authoring: typically Adobe After Effects plus Bodymovin export.
- JSON/state control: limited. Can play/pause, seek, adjust speed, and play frame segments, but not naturally drive a live expressive state machine.
- Character/eyes/skins: good for authored loops, weak for procedural/live variation.
- 320x480 kiosk fit: excellent.
- NUC performance: likely fine for small SVG/canvas animations if assets are optimized.
- Complexity: low runtime, high asset pipeline if AE is not already part of the workflow.

Best use:

- One-off loops: boot animation, alert sparkle, idle glyph animation, tiny icons.

Risks:

- AE/Bodymovin dependency is not ideal for this project.
- Not well suited to an agentic personality layer selecting gestures dynamically.
- Complex SVG Lottie files can become heavier than expected.

### 6. Three.js / WebGL

Assessment:

- License: MIT.
- Offline/local hosting: good.
- Asset authoring: broad but overkill unless using 3D models/shaders.
- JSON/state control: good.
- Character/eyes/skins: possible, but building a 2D expressive character in Three.js is unnecessary complexity.
- 320x480 kiosk fit: good, but 3D detail may be wasted at tiny size.
- NUC performance: likely fine for simple scenes, but avoid excessive postprocessing.
- Complexity: high relative to the display need.

Best use:

- Optional shader background, 3D halo, or postprocessing later.
- Not the primary character runtime.

Risks:

- Overbuilds the problem.
- More browser/GPU edge cases than needed for a reliable kiosk.

### 7. Live2D Cubism

Assessment:

- Runtime/license posture: mixed. Cubism Web Framework is under Live2D Open Software License; Cubism Core is proprietary; business users above the stated revenue threshold need a Cubism SDK Release License for publication.
- Offline/local hosting: possible.
- Asset authoring: requires Cubism Editor and a rigged Live2D model.
- JSON/state control: good through parameters/motions once the model exists.
- Character/eyes/skins: excellent for avatar-style 2D characters.
- 320x480 kiosk fit: technically fine, but the style may imply VTuber/anime avatar rather than Hermes familiar.
- NUC performance: likely fine for one model.
- Complexity: high.

Best use:

- Only if Brian explicitly wants a Live2D-style rigged character.

Risks:

- Licensing review needed before use beyond experimentation.
- Proprietary core and editor workflow conflict with the desired simple open/local stack.
- Too much pipeline for a tiny operational display.

### 8. Spine

Assessment:

- Runtime/license posture: source is available, but runtime use is tied to the Spine Editor license terms. License text states products require users to obtain their own Spine Editor license unless integrated under the editor license agreement terms.
- Offline/local hosting: possible.
- Asset authoring: requires paid Spine editor for practical production.
- JSON/state control: good through skeleton/animation mixing.
- Character/eyes/skins: excellent for skeletal 2D game characters.
- 320x480 kiosk fit: technically good.
- NUC performance: likely excellent.
- Complexity: high.

Best use:

- Game-style skeletal character if Brian already owns/uses Spine.

Risks:

- Not an acceptable default due to licensing/tooling burden.
- Overkill for first prototype.

## Practical first prototype

Build a single local browser app at 320x480 portrait:

```text
docs/animation-library-research.md
src/display/
  index.html
  main.js
  renderer/HermesCharacter.js
  renderer/skins.js
  renderer/timelines.js
  state/loadState.js
  state/sample-persona-packet.json
```

Prototype behavior:

1. Fixed logical canvas: 320x480.
2. Dark layered background with subtle texture/scanline.
3. Central Hermes core/eye character:
   - body/core glow,
   - two expressive eyes or one binocular/sigil eye with clear gaze,
   - eyelids for blink/squint/annoyed states,
   - orbiting motes/status glyphs.
4. Bottom one-line caption.
5. State packet loaded from a local JSON file or in-memory mock.
6. Mood transitions:
   - idle: slow breathing, relaxed blinks,
   - thinking: tighter pupil, faster motes,
   - speaking: waveform/core pulse,
   - working: sparks/progress ring,
   - degraded: amber flicker/skeptical squint,
   - blocked: magenta/red accent, annoyed half-lid, pointed caption,
   - night: dim sleepy presence.
7. Runtime never executes model output. It only validates/clamps a known schema.

Recommended prototype implementation choices:

- Plain Vite app or even static HTML first.
- PixiJS v8 from local `node_modules` bundle or vendored file.
- Anime.js v4 for property animation.
- No remote CDN in the production kiosk.
- No display-driver work until hardware arrives and Brian approves.

## Data contract shape

Use two input files or endpoints:

### `display_state.json`

```json
{
  "status": "healthy",
  "active_sessions": 1,
  "active_workers": 0,
  "blocked_cards": 0,
  "recent_event": "cron radar completed",
  "cpu_band": "low",
  "memory_band": "normal",
  "time_band": "morning"
}
```

### `persona_packet.json`

```json
{
  "mood": "watchful",
  "skin": "terminal-familiar",
  "energy": 0.42,
  "curiosity": 0.68,
  "playfulness": 0.74,
  "focus": 0.35,
  "posture": "relaxed-tilt-left",
  "eye": "slow-scan",
  "palette": "cyan-violet-low",
  "micro_actions": ["blink-double", "track-left", "mote-reorder"],
  "caption": "quiet systems, suspiciously behaved",
  "snippet": "cron radar completed",
  "duration_seconds": 90
}
```

Renderer rules:

- Clamp all numbers to `[0, 1]` unless explicitly documented otherwise.
- Enforce enum allow-lists for mood, skin, posture, eye, palette, and micro_actions.
- Limit caption/snippet length for legibility and safety.
- Drop credential-like text patterns before display.
- Fall back to deterministic idle state if JSON is missing, invalid, or stale.

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Hardware may not appear as a normal display | Renderer target may change | Keep app browser-based until hardware intake; do not install vendor drivers yet |
| CDN dependency breaks offline/local operation | Kiosk may fail without internet | Vendor/bundle JS dependencies locally for production |
| Tiny screen makes text unreadable | Display becomes decorative only | Use 320x480 from day one; keep text to one short line; test on hardware |
| Character becomes generic dashboard mascot | Fails project intent | Design around a stable face/eyes/core, constant motion, and wry captions |
| State logic becomes brittle if/then mapping | Feels predictable | Use persona_packet layer with latent drives, recent-history penalty, and procedural variation |
| Rive/Lottie asset pipelines slow iteration | Delays prototype | Start procedural PixiJS; test authored assets later |
| Live2D/Spine licensing ambiguity | Legal/tooling risk | Avoid unless Brian explicitly chooses that path after review |
| Browser GPU/rendering issues in kiosk | Display instability | Provide reduced-effects mode and static fallback; test under final display session |
| Sensitive text appears on display | Privacy/security issue | Treat display as trusted-home only, still redact credential-like material and never expose WAN |

## Decision matrix notes

### Why PixiJS over p5.js for production

p5.js is faster for artistic sketching, but PixiJS is better for a durable application. Hermes needs a stable scene graph, layered sprites/shapes, replaceable skins, filters, text, and status glyphs. PixiJS fits that architecture more naturally.

### Why Anime.js over GSAP first

Anime.js has a simpler MIT posture and is enough for blink/breath/squint/timeline work. GSAP is powerful and now free under Webflow's standard no-charge license, but that custom license is unnecessary complexity unless advanced SVG morphing becomes important.

### Why not Rive first

Rive is probably the best if the character is primarily designer-authored. The current project needs fast iteration, local data-driven behavior, and procedural personality before the exact character anatomy is fixed. Starting in PixiJS keeps the first prototype under Hermes' control. Rive can be introduced later for a polished character asset once the expression vocabulary is proven.

## Recommendation details for next worker

Next implementation card should build a first prototype using:

- Renderer: PixiJS.
- Timeline helper: Anime.js.
- Optional procedural layer: custom PixiJS particles first; p5.js only if a separate sketch proves useful.
- Canvas: fixed 320x480 logical coordinates, portrait.
- Data: mock `persona_packet.json` with 6-7 moods.
- Local only: no remote CDN in committed production prototype.
- Visual acceptance: recognizable Hermes character with eyes, at least idle/thinking/blocked/night states, constant motion, readable bottom caption.

Avoid:

- Installing display drivers or touching kernel/display services.
- Starting with Live2D/Spine.
- Building a full React app unless there is a clear UI reason.
- Depending on a cloud animation editor for the first functional prototype.

## Sources

1. Rive WASM runtime GitHub, MIT license and runtime overview: https://github.com/rive-app/rive-wasm
2. Rive Web JS getting started, `@rive-app/webgl2`, local `.riv`/canvas runtime setup: https://rive.app/community/doc/web-js/docvlgbnS1mp
3. Rive state machine playback, runtime inputs such as triggers, booleans, and numbers: https://rive.app/docs/runtimes/state-machines
4. lottie-web GitHub, MIT license, Bodymovin/After Effects JSON export and player API: https://github.com/airbnb/lottie-web
5. PixiJS GitHub, MIT license and high-performance 2D WebGL/WebGPU renderer description: https://github.com/pixijs/pixijs
6. p5.js official site, free/open-source creative coding library: https://p5js.org/
7. p5.js GitHub license file, LGPL 2.1: https://github.com/processing/p5.js
8. Anime.js GitHub, MIT license and JS object/CSS/SVG animation support: https://github.com/juliangarnier/anime
9. Anime.js documentation landing page, v4 docs: https://animejs.com/documentation/
10. GSAP GitHub, capability overview and Webflow free-use update pointer: https://github.com/greensock/GSAP
11. GSAP standard no-charge license page, effective 2025: https://gsap.com/standard-license/
12. three.js docs and GitHub, MIT license, WebGL/WebGPU 3D library: https://threejs.org/docs/ and https://github.com/mrdoob/three.js
13. Live2D Cubism SDK overview and publication license summary: https://www.live2d.com/en/sdk/about/
14. Live2D Cubism Web Framework GitHub and license note: https://github.com/Live2D/CubismWebFramework
15. Spine runtimes page, runtime support and export formats: https://en.esotericsoftware.com/spine-runtimes
16. Spine runtime license text: https://github.com/EsotericSoftware/spine-runtimes/blob/4.2/LICENSE

## Confidence

Moderate-high. The recommendation is based on official docs, source repositories, and license files available during this research run. Final kiosk behavior still depends on how the physical monitor appears to Linux after hardware intake.
