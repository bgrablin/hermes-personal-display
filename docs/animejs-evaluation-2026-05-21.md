# Anime.js evaluation for Hermes Personal Display — 2026-05-21

## Verdict

**Do not integrate Anime.js into the live MINIX SF10T kiosk yet.** It is technically suitable for the puppet layer, but the current runtime already has a deterministic `requestAnimationFrame` loop, explicit state packets, gaze FSM, blink scheduling, bounded motion budgets, and thermal/reduced-motion throttling. A direct Anime.js adoption would add another scheduler and failure mode before we have a clean event bus/transition grammar.

Best path: use Anime.js first as an **optional local spike/prototyping helper** for transition grammar, then promote only a tiny adapter if it proves it reduces code complexity without breaking determinism.

## Current library facts verified

- Package: `animejs`
- Current npm version checked: `4.4.1`
- License: MIT
- NPM package unpacked size: about `1.96 MB`
- Browser UMD bundle:
  - `dist/bundles/anime.umd.min.js`
  - raw: `115,317` bytes
  - gzip: `39,646` bytes
  - global: `window.anime`
- ESM bundle:
  - `dist/bundles/anime.esm.min.js`
  - raw: `115,942` bytes
  - gzip: `39,891` bytes
- V4 usage is ESM-first, but the npm package still includes UMD, CJS, ESM, and modular exports.
- It supports CSS properties, SVG, DOM attributes, and JavaScript objects.

Sources checked:

- `https://github.com/juliangarnier/anime`
- `https://animejs.com/documentation/`
- `npm view animejs ...`
- `npm pack animejs`

## Fit for our current runtime

Current Hermes runtime characteristics:

- Local-only static browser app, no package/build pipeline.
- Loaded by script tags from `character-runtime-v2.html`.
- Kiosk must work offline and should avoid CDN dependencies.
- Runtime already animates directly in `src/mascot-v2/runtime.js`:
  - `requestAnimationFrame` loop
  - pose channel
  - gaze FSM
  - blink/face channel
  - FX channel
  - thermal/reduced-motion perf profiles
  - explicit bounded motion budgets
  - state packet interpolation
  - attention stack and notice transient

Anime.js strengths for this use case:

- Cleaner authored timelines for `notice → orient → commit → sustain → resolve`.
- Good SVG/DOM attribute support for eye/lid/mouth/helmet transforms.
- Better easing/timeline ergonomics than hand-rolled timers.
- Could make one-shot transitions easier to read and tune.

Anime.js weaknesses/risks here:

- Adds a second animation scheduler next to the existing runtime frame loop.
- UMD bundle is ~115 KB raw, ~40 KB gzip. Fine for desktop, unnecessary for a local kiosk if it does not remove complexity.
- V4 is ESM-first. Our runtime is script-tag based with no bundler/package pipeline.
- Directly animating SVG attributes from Anime.js could fight the existing `draw()` loop, which overwrites transforms/attrs every frame.
- If used for continuous idle animation, it could violate the current bounded-motion/thermal throttling model.
- CDN use is inappropriate for this local always-on display. If used, vendor the dependency locally.

## Integration options

### Option A — Do nothing now

Keep raw SVG/CSS/JS.

Pros:

- Lowest risk.
- Current tests pass.
- No new dependency.
- No scheduler conflict.

Cons:

- Transition grammar remains verbose to author manually.
- Complex one-shot timelines require more custom code.

Recommended for immediate live kiosk work.

### Option B — Local spike only

Vendor Anime.js into a scratch/prototype route, not the live kiosk.

Suggested files:

- `vendor/animejs/anime.umd.min.js`
- `src/mascot-v2/anime-spike.js`
- `src/mascot-v2-debug.html?anime=1` or a separate `src/mascot-v2-anime-spike.html`

Spike target:

- One `notice → orient → commit → sustain → resolve` transition.
- Animate a JS object model only, not raw DOM directly, then let existing `draw()` apply values.
- Measure whether this reduces runtime complexity.

Pros:

- Low operational risk.
- Lets us compare motion quality and code complexity.
- Avoids breaking kiosk.

Cons:

- Still introduces dependency review and local vendoring.
- May prove unnecessary.

Recommended next if Brian wants to test Anime.js seriously.

### Option C — Production adapter

Use Anime.js only for one-shot transition timelines, not continuous idle animation.

Possible architecture:

```js
class PuppetTimelineAdapter {
  constructor(renderer) {
    this.renderer = renderer;
    this.active = null;
    this.model = {
      notice: 0,
      orient: 0,
      commit: 0,
      resolve: 0,
      gazeX: 0,
      gazeY: 0,
      lid: 0,
      helmetTilt: 0,
      postureY: 0
    };
  }

  playNotice(source) {
    this.cancel();
    this.active = anime.createTimeline({ autoplay: true })
      .add(this.model, { notice: 1, duration: 120, ease: 'outQuad' })
      .add(this.model, { orient: 1, duration: 180, ease: 'outCubic' })
      .add(this.model, { commit: 1, duration: 260, ease: 'inOutQuad' })
      .add(this.model, { resolve: 1, duration: 220, ease: 'outQuad' });
  }

  cancel() {
    if (this.active) this.active.cancel();
    this.active = null;
  }
}
```

Important rule: Anime.js should animate **adapter-owned numeric intent values**, not the SVG nodes directly. The renderer remains authoritative.

Pros:

- Preserves deterministic renderer ownership.
- Gives timeline ergonomics where they help most.
- Avoids Anime.js fighting `draw()`.

Cons:

- Requires careful adapter design and tests.
- Adds dependency to live kiosk.
- Still less important than the local avatar event bus.

Possible later, after the spike.

## Recommendation

Decision: **defer production integration, approve a bounded spike.**

Anime.js is worth testing for transition grammar, but not worth pushing into the live kiosk today. The current runtime is already custom and safety-bounded. The highest-value next work remains the avatar event bus and explicit behavior/event model. Anime.js can help once we have those events and want better authored transitions.

## Acceptance criteria for any future Anime.js adoption

- No CDN. Dependency must be vendored or locally built.
- No direct DOM/SVG animation for values owned by `draw()`.
- Anime.js may animate adapter-owned JS numbers; renderer applies them.
- Reduced-motion and thermal perf tiers must pause, reduce, or skip Anime timelines.
- New verification must prove no regression in:
  - `scripts/check-puppet-behavior-mapping.js`
  - `scripts/check-puppet-layer-recommendations.js`
  - `scripts/check-kiosk-recommendation-regressions.js`
  - physical DP-2 screenshot review
- Bundle must be loaded only on routes that need it, or gated behind an explicit feature flag until accepted.

## Practical next step

If proceeding with a spike, implement **one** feature only:

`notice(source)` transition as Anime.js timeline over adapter-owned numbers.

Do not convert blink, idle, gaze FSM, or continuous posture loops yet.
