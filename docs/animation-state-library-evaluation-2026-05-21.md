---
type: evaluation
status: active
created: 2026-05-21
tags:
  - personal-display
  - animation
  - state-machines
  - svg-puppet
---

# Hermes Personal Display: animation/state library evaluation

Scope: XState, SVG.js, Motion (`motiondivision/motion`), Theatre.js, Lottie-web, and Rive Web runtime (`rive-wasm`). Anime.js is not re-evaluated; it remains only a comparison point: previously deferred except for a bounded adapter-value spike.

Context assumed: Hermes Personal Display is a kiosk-like local Chromium/Xorg/Openbox display on the installed MINIX SF10T monitor, with a character-first retro robot SVG puppet. Current default remains SVG puppet layers + vanilla JS. Priorities: presence first, trust second, entertainment third. Bias: deterministic, offline, vendorable, low moving parts.

## Measurement notes

- Package facts were measured on 2026-05-21 with `npm view` and temporary local `npm install --omit=dev` on host tooling.
- Raw file and gzip sizes are package artifact sizes, not full app bundle sizes. Tree-shaking/build choices can change shipped bytes.
- “Integrate now” means add to the actual renderer path. “Spike” means bounded proof only, not production adoption.

## Summary ranking

1. **XState** — *Best candidate for later state orchestration spike, not animation.* Strong fit if Hermes behavior modes become hard to reason about; not needed for today’s simple deterministic renderer.
2. **SVG.js** — *Most compatible with SVG puppet concept, but currently redundant.* Defer unless vanilla SVG manipulation becomes painful.
3. **Motion** — *Potentially useful as an adapter-value animation engine, similar to Anime.js spike territory.* Defer; do not let it own the puppet state loop.
4. **Rive Web runtime** — *Powerful interactive character runtime, but implies a workflow/runtime shift away from SVG puppet.* Spike only if intentionally evaluating a Rive-authored replacement puppet.
5. **Lottie-web** — *Good for exported After Effects clips; poor fit for live, stateful, deterministic puppet control.* Reject for core character; possible isolated decorative clip only.
6. **Theatre.js** — *Authoring tool more than lightweight runtime; Studio license/heaviness makes it wrong for kiosk runtime.* Reject runtime integration; possibly use offline as a design/reference tool only.

## Quick decision matrix

- **Adopt now:** none.
- **Most reasonable future spike:** XState for behavior statecharts; Motion only as a narrow adapter-value experiment; Rive only if considering a whole character authoring workflow switch.
- **Defer:** SVG.js, Motion, XState.
- **Reject for core renderer:** Theatre.js, Lottie-web, Rive unless replacing the SVG puppet approach.

---

## 1. XState

**Verdict:** **Defer; bounded behavior-state spike later if mode logic grows.** Do not add now just for blink/idle animation.

### Best use

- Explicit behavior states: `idle`, `listening`, `thinking`, `speaking`, `error`, `sleep`, `recovering`.
- Guarded transitions and timed behaviors.
- Making emotional/attention state auditable and testable.
- Keeping “what state is Hermes in?” separate from “how are SVG values drawn?”

### Current package/repo facts

- npm package: `xstate`
- Current measured version: **5.31.1**
- License: **MIT**
- Repository: `https://github.com/statelyai/xstate.git`
- npm unpacked size: **2,282,701 bytes** (~2.18 MiB)
- Dependencies: npm reported no runtime dependencies for `xstate`.
- Measured distributable examples:
  - `dist/xstate.esm.js`: **17.1 KiB raw**, **4.9 KiB gzip**
  - `dist/xstate.umd.min.js`: **45.8 KiB raw**, **14.1 KiB gzip**

### Browser/kiosk/offline/vendoring fit

- Good. Pure JS, no WASM, no remote service required.
- Vendoring is straightforward via npm package or pinned ESM bundle.
- Fits kiosk/offline use if Stately Studio/cloud tooling is not required.

### Dependency/heaviness notes

- Core library is not large at runtime, but the mental model is large.
- Adds formal statechart concepts, actors, events, guards, effects. That is valuable only when behavior complexity justifies it.
- Risk is architectural over-specification for a tiny single-display puppet.

### Licensing gotchas

- Core package is MIT. No apparent runtime licensing issue.
- Stately Studio is separate; do not make cloud tooling a runtime dependency.

### Risk to deterministic renderer

- **Low if used correctly.** XState can improve determinism by centralizing allowed transitions.
- **Medium if overused.** Actors/timers/invoked promises can obscure simple render timing if mixed directly into animation frames.

### Bounded spike recommendation

Only spike when Hermes has at least 5–7 behavior modes or when state bugs appear.

Spike boundary:

- Build a standalone `behaviorMachine.js` with states only; no DOM writes.
- Inputs: local events such as `WAKE`, `USER_SPEAKING`, `ASSISTANT_THINKING`, `ASSISTANT_SPEAKING`, `ERROR`, `IDLE_TIMEOUT`.
- Output: a plain snapshot `{mode, affect, attention, intensity}` consumed by the existing vanilla renderer.
- Timebox: 1 day.
- Success criteria: fewer ad-hoc booleans, reproducible transition tests, no frame-loop dependency.

---

## 2. SVG.js

**Verdict:** **Defer.** Compatible with SVG puppet layers, but vanilla DOM/SVG is still the better default until pain is proven.

### Best use

- Programmatic SVG creation/manipulation.
- Convenience around SVG element APIs, geometry, transforms, and simple animations.
- Useful if the puppet becomes generated/configurable rather than hand-authored SVG layers.

### Current package/repo facts

- npm package: `@svgdotjs/svg.js`
- Current measured version: **3.2.5**
- License: **MIT**
- Repository: `https://github.com/svgdotjs/svg.js.git`
- npm unpacked size: **2,644,860 bytes** (~2.52 MiB)
- Dependencies: project positions itself as dependency-free; npm did not report runtime dependencies.
- Measured distributables:
  - `dist/svg.min.js`: **77.7 KiB raw**, **24.6 KiB gzip**
  - `dist/svg.esm.js`: **176.7 KiB raw**, **46.3 KiB gzip**

### Browser/kiosk/offline/vendoring fit

- Good. Browser-friendly, MIT, no runtime network requirement.
- Can be vendored as a local JS file.
- Works naturally with Chromium/SVG.

### Dependency/heaviness notes

- It is not huge, but it duplicates browser-native SVG APIs already available.
- Adds an abstraction layer and its own animation model/queues.
- For a fixed, hand-authored puppet, direct `querySelector` + attributes/styles is simpler and more transparent.

### Licensing gotchas

- MIT; no obvious gotchas.

### Risk to deterministic renderer

- **Medium-low.** SVG.js can stay deterministic if used only for setup/manipulation.
- Risk rises if its animation queue/timeline becomes a second scheduler alongside Hermes’ own render loop.

### Bounded spike recommendation

No immediate spike. If SVG authoring/manipulation code becomes noisy:

- Spike only static setup helpers, not runtime animation.
- Replace no more than 3–5 repetitive SVG DOM utilities.
- Success: reduced code without changing render-loop ownership.
- Failure: if debugging DOM output becomes less direct than vanilla SVG.

---

## 3. Motion (`motiondivision/motion`)

**Verdict:** **Defer; possible bounded adapter-value spike, same caution class as Anime.js.** It is attractive but can easily compete with the deterministic puppet loop.

### Best use

- High-quality transitions, springs, keyframes, and DOM/SVG attribute animation.
- Short-lived expressive motion bursts: antenna bounce, eye focus shift, panel settle, notification pulse.
- Animating plain JS objects and feeding values into the existing renderer, rather than letting Motion directly own DOM state.

### Current package/repo facts

- npm package: `motion`
- Current measured version: **12.40.0**
- License: **MIT**
- Repository: `https://github.com/motiondivision/motion.git`
- npm unpacked size for `motion`: **634,088 bytes** (~619 KiB)
- Reported dependencies:
  - `framer-motion ^12.40.0`
  - `tslib ^2.4.0`
- Reported peer dependencies include React/React DOM for React entrypoints:
  - `react ^18.0.0 || ^19.0.0`
  - `react-dom ^18.0.0 || ^19.0.0`
  - `@emotion/is-prop-valid *`
- Related package measured: `framer-motion` unpacked size **4,731,457 bytes** (~4.51 MiB), with `motion-dom`, `motion-utils`, `tslib` dependencies.
- Measured installed files:
  - `motion/dist/motion.js`: **132.1 KiB raw**, **43.7 KiB gzip**
  - `motion-dom/dist/motion-dom.js`: **117.8 KiB raw**, **38.1 KiB gzip**

### Browser/kiosk/offline/vendoring fit

- Good if pinned and locally vendored.
- Use JS/DOM entrypoints only; avoid React imports entirely.
- Docs advertise script-tag and package-manager use, but kiosk should pin exact versions and avoid CDN.

### Dependency/heaviness notes

- The package story is broader than a tiny imperative animator: React/Vue ecosystem, Framer Motion lineage, examples, premium Motion+ ecosystem.
- For Hermes’ current vanilla SVG renderer, this is more library than strictly necessary.
- It is less obviously “small and isolated” than Anime.js for simple value tweening, because package exports span multiple platforms/entrypoints.

### Licensing gotchas

- Runtime package is MIT.
- Motion+ and Motion Studio are commercial/editorial ecosystem offerings; do not depend on them for the kiosk runtime.

### Risk to deterministic renderer

- **Medium.** Any RAF-based animation library can create hidden concurrent timelines.
- Highest risk: direct DOM writes from Motion while Hermes also writes the same attributes/styles.
- Lower risk: Motion animates plain numbers into a controlled adapter that Hermes samples/applies.

### Bounded spike recommendation

If doing an Anime.js-style adapter-value spike, Motion can be compared directly.

Spike boundary:

- Animate only a plain JS object, e.g. `{eyeY, antennaTilt, glow}`.
- Hermes renderer remains sole DOM writer.
- No React, no scroll/in-view gestures, no layout animation, no direct `animate(svgElement, ...)` in production path.
- Timebox: half day to 1 day.
- Success: expressive spring/easing with deterministic cancellation and no dropped frames on the kiosk.
- Failure: if cancellation/state ownership is less clear than a tiny in-house tween helper.

---

## 4. Theatre.js

**Verdict:** **Reject for runtime integration.** Possible offline/reference authoring tool only; do not ship Studio in Hermes.

### Best use

- Visual motion design and timeline authoring.
- Complex choreographed sequences, especially 3D/THREE.js or high-fidelity interactive art.
- Exporting project state JSON consumed by `@theatre/core`.

### Current package/repo facts

Use the scoped packages, not the old unscoped `theatre` package.

- npm package: `@theatre/core`
  - Current measured version: **0.7.2**
  - License: **Apache-2.0**
  - Repository: `https://github.com/AriaMinaei/theatre` from npm metadata; active GitHub/docs branding is `theatre-js/theatre`
  - npm unpacked size: **903,189 bytes** (~882 KiB)
  - Dependency: `@theatre/dataverse 0.7.2`
  - Measured `dist/index.js`: **219.8 KiB raw**, **49.0 KiB gzip**
- npm package: `@theatre/studio`
  - Current measured version: **0.7.2**
  - License: **AGPL-3.0-only**
  - npm unpacked size: **22,283,657 bytes** (~21.25 MiB)
  - Dependency: `@theatre/dataverse 0.7.2`
  - Peer dependency: `@theatre/core *`
  - Measured `dist/index.js`: **758.0 KiB raw**, **239.3 KiB gzip**
- npm package `theatre` exists at **0.2.3** with nonstandard license metadata; treat it as not the current Theatre.js runtime path.

### Browser/kiosk/offline/vendoring fit

- `@theatre/core` can run offline with exported JSON state.
- `@theatre/studio` is too heavy and license-sensitive for a kiosk production bundle.
- Theatre’s workflow is centered on authoring/timelines, not a tiny deterministic always-on display loop.

### Dependency/heaviness notes

- Core is not absurd, but it brings a project/sheet/object/sequence abstraction.
- Studio is large and not appropriate for display runtime.
- Docs state project state is JSON, stored in localStorage when Studio is open and exportable as JSON.

### Licensing gotchas

- Important split:
  - `@theatre/core`: Apache-2.0
  - `@theatre/studio`: AGPL-3.0-only
- Do not ship `@theatre/studio` in Hermes unless the AGPL implications are deliberately accepted.
- Even if only core ships, the authoring workflow adds dependency on Theatre project state semantics.

### Risk to deterministic renderer

- **High for Hermes’ current needs.** Theatre wants to be a timeline/authoring system. That can fight with a state-driven character loop unless strongly isolated.
- It increases conceptual and operational surface area for little benefit to presence/trust.

### Bounded spike recommendation

No runtime spike recommended.

If Brian wants to explore Theatre creatively:

- Use it outside the kiosk repo to prototype 1–2 gestures.
- Export timing/value curves as reference data.
- Re-implement chosen curves in the vanilla renderer.
- Do not add `@theatre/studio` or Theatre project state to production Hermes.

---

## 5. Lottie-web

**Verdict:** **Reject for the core character renderer.** It is good for preauthored clips, not a live expressive puppet controlled by Hermes state.

### Best use

- Playing Adobe After Effects / Bodymovin-exported animation JSON.
- Self-contained decorative animations, splash screens, “success” moments, loading loops.
- Designer-authored sequences where code-level articulation is not needed.

### Current package/repo facts

- npm package: `lottie-web`
- Current measured version: **5.13.0**
- License: **MIT**
- Repository: `https://github.com/airbnb/lottie-web.git`
- npm unpacked size: **25,415,905 bytes** (~24.24 MiB). This includes docs/test/demo/source artifacts, not just the browser player.
- Dependencies: npm did not report runtime dependencies.
- Measured browser players:
  - `build/player/lottie.min.js`: **298.5 KiB raw**, **74.5 KiB gzip**
  - `build/player/lottie_light.min.js`: **164.4 KiB raw**, **45.5 KiB gzip**

### Browser/kiosk/offline/vendoring fit

- Can run offline if player JS and JSON/assets are local.
- Supports SVG/canvas/html renderers, but exported animations may include images/fonts/effects that must also be packaged.
- For deterministic kiosk behavior, every animation JSON must be curated and pinned.

### Dependency/heaviness notes

- Player is moderate; asset JSON can become large quickly.
- Adds an After Effects/Bodymovin pipeline dependency.
- Runtime is designed to interpret exported animation data, not expose a simple skeletal puppet API.

### Licensing gotchas

- `lottie-web` itself is MIT.
- Gotchas are mostly asset/tooling related: After Effects, Bodymovin plugin workflow, third-party art/fonts/images, and licensing of downloaded Lottie assets.
- Do not import random marketplace Lotties without checking asset rights.

### Risk to deterministic renderer

- **High for core puppet.** Lottie owns its own playback clock, renderer, and scene graph.
- Fine for isolated one-shot clips that do not overlap with puppet-owned SVG parts.
- Poor for “Hermes is always alive and responsive” unless treated as a separate layer with explicit play/stop control.

### Bounded spike recommendation

No core spike recommended.

Acceptable tiny spike only if there is a specific decorative need:

- One local JSON, no remote assets, no expressions, no images unless vendored.
- Render in a separate container/layer, never into the puppet SVG.
- Measure CPU/frame stability on MINIX display.
- Success: clip can be fully paused/destroyed and consumes no resources while idle.

---

## 6. Rive Web runtime (`rive-wasm`)

**Verdict:** **Spike only if evaluating a replacement character workflow.** Do not integrate into the current SVG puppet renderer casually.

### Best use

- Interactive vector characters authored in Rive with state machines and inputs.
- Runtime-controlled artboards/animations in canvas/WebGL.
- Rich designer/developer collaboration around a `.riv` asset.

### Current package/repo facts

The source repo is `rive-app/rive-wasm`, but current docs point web users toward newer packages such as `@rive-app/webgl2`.

Measured npm packages:

- `@rive-app/canvas`
  - Current measured version: **2.37.8**
  - License: **MIT**
  - Repository: `https://github.com/rive-app/rive-wasm.git#master`
  - npm unpacked size: **4,622,051 bytes** (~4.41 MiB)
  - Dependencies: `{}`
  - Measured files:
    - `rive.js`: **317.3 KiB raw**, **68.4 KiB gzip**
    - `rive.wasm`: **1,847.1 KiB raw**, **689.6 KiB gzip**
- `@rive-app/webgl2`
  - Current measured version: **2.37.8**
  - License: **MIT**
  - Repository: `https://github.com/rive-app/rive-wasm.git#master`
  - npm unpacked size: **5,636,405 bytes** (~5.38 MiB)
  - Dependencies: `{}`
  - Measured files:
    - `rive.js`: **322.4 KiB raw**, **69.7 KiB gzip**
    - `rive.wasm`: **2,337.0 KiB raw**, **791.3 KiB gzip**
- `@rive-app/webgl-advanced`
  - Current measured version: **2.37.0**
  - License: **MIT**
  - npm unpacked size: **11,535,810 bytes** (~11.0 MiB)
  - Measured files:
    - `webgl_advanced.mjs`: **112.0 KiB raw**, **30.8 KiB gzip**
    - `rive.wasm`: **5,556.6 KiB raw**, **1,928.5 KiB gzip**

### Browser/kiosk/offline/vendoring fit

- Can work offline if JS, WASM, and `.riv` files are local and WASM MIME/loading paths are handled.
- Requires canvas/WebGL/WASM runtime path; this is a bigger operational surface than SVG DOM.
- Chromium kiosk should support this, but GPU/WebGL behavior needs testing on the actual MINIX SF10T setup.

### Dependency/heaviness notes

- No npm dependencies reported, but the WASM runtime is the real dependency.
- File size is dominated by WASM.
- Adds a binary asset format (`.riv`) plus Rive editor workflow.

### Licensing gotchas

- Rive runtimes are advertised as MIT-licensed and npm packages report MIT.
- Rive editor/service/marketplace assets are separate considerations. The runtime license does not automatically grant rights to third-party `.riv` assets or remove dependence on Rive’s editor terms for authoring.
- Keep authored assets local and rights-cleared.

### Risk to deterministic renderer

- **High if mixed into the existing SVG puppet.** Rive wants to own rendering inside canvas/WebGL.
- It could be deterministic inside its own state machine, but it is a separate renderer, asset pipeline, event/input system, and render loop.
- Best treated as an alternative character engine, not a helper library.

### Bounded spike recommendation

Only run this spike if Brian is willing to compare “SVG puppet” vs “Rive puppet.”

Spike boundary:

- Build one tiny local `.riv` robot face with 3 states: idle, listening, speaking.
- Use `@rive-app/webgl2` or `@rive-app/canvas`, pinned version, all files local.
- No network/CDN. No marketplace asset.
- Measure startup, CPU/GPU, memory, frame stability, and recovery after Chromium reload.
- Compare editability against current SVG layers.
- Success: expressive improvement is large enough to justify replacing the SVG puppet pipeline.
- Failure: any WASM loading fragility, GPU quirks, or workflow lock-in that reduces trust/reliability.

---

## Practical recommendation for Hermes now

Keep the current default:

- Hand-authored retro robot SVG puppet layers.
- Vanilla JS renderer owns all DOM writes.
- Small internal tween/easing helpers first.
- Treat Anime.js and Motion as adapter-value spike candidates only.
- Treat XState as a future behavior orchestration candidate, not an animation library.
- Avoid Theatre.js, Lottie-web, and Rive in the production path unless the project deliberately changes from “SVG puppet renderer” to “authored animation runtime.”

## Sources used

- XState GitHub: https://github.com/statelyai/xstate
- XState docs: https://stately.ai/docs
- npm `xstate`: https://www.npmjs.com/package/xstate
- SVG.js GitHub: https://github.com/svgdotjs/svg.js
- SVG.js docs: https://svgjs.dev/docs/3.0/
- npm `@svgdotjs/svg.js`: https://www.npmjs.com/package/@svgdotjs/svg.js
- Motion GitHub: https://github.com/motiondivision/motion
- Motion quick start docs: https://motion.dev/docs/quick-start
- npm `motion`: https://www.npmjs.com/package/motion
- npm `framer-motion`: https://www.npmjs.com/package/framer-motion
- Theatre.js GitHub: https://github.com/theatre-js/theatre
- Theatre.js projects docs: https://www.theatrejs.com/docs/latest/manual/projects
- npm `@theatre/core`: https://www.npmjs.com/package/@theatre/core
- npm `@theatre/studio`: https://www.npmjs.com/package/@theatre/studio
- Lottie-web GitHub: https://github.com/airbnb/lottie-web
- Lottie renderer settings wiki: https://github.com/airbnb/lottie-web/wiki/Renderer-Settings
- npm `lottie-web`: https://www.npmjs.com/package/lottie-web
- Rive WASM GitHub: https://github.com/rive-app/rive-wasm
- Rive Web JS docs: https://rive.app/community/doc/web-js/docvlgbnS1mp
- Rive runtimes page/licensing statement: https://rive.app/runtimes
- npm `@rive-app/canvas`: https://www.npmjs.com/package/@rive-app/canvas
- npm `@rive-app/webgl2`: https://www.npmjs.com/package/@rive-app/webgl2
- npm `@rive-app/webgl-advanced`: https://www.npmjs.com/package/@rive-app/webgl-advanced
