# Luminous presence

This revision removes the ordered activity strip. An agent can return to reading,
reconsider an answer, use several tools, and pause without following any fixed
visual sequence. The display should be a presence you can observe and interact with.

## Visual decisions

- Increase the central body to 1.65 times its former diameter while keeping real
  CPU, memory, and temperature readings anchored outside it.
- Replace straight machined spokes with 180 seeded curved fibers, 60 shadowed
  branches, and an irregular collarette. A teal/blue outer iris and warm inner
  fibers create depth; a black aperture and asymmetric glass reflections anchor it.
- Taper the lids around the cornea. They meet below the optical center, preserving
  the upper lid's dominant travel without compressing or moving the pupil on blinks.
- Replace continuous iris revolutions with at most 1.4 degrees of settling torsion.
  Six gently deforming contours give the surrounding surface a material quality.
- Retire the decorative status rings, compass, axes, gaze trace, grid projection,
  and radar projection from the visible composition. The existing telemetry modes
  remain compatible. Real measurement arcs still describe actual measurements.

The folds are not a heartbeat monitor, progress indication, or a view into private
reasoning. They change tension with the observed mode. Gaze, current-state text,
and feed health carry the actual meaning.

## Touch behavior

| Interaction | Operator mode |
| --- | --- |
| Contact outside a control | A brief acknowledgement and a small contact ring |
| Drag | The eye follows the contact within its anatomical bounds |
| Release or cancellation | Contact feedback clears; after 650 ms the eye returns to the current observation, including sustained waiting attention |
| Tap a metric, provider, or bottom status reading | Inspect the current value and a short explanation |
| Enter or Space on a focused reading | Open the same detail, with focus on its close button |
| Escape, close, or outside contact | Dismiss details; keyboard dismissal restores focus |
| No interaction for 15 seconds | Dismiss details automatically |

Inspection reads only safe text already displayed. It introduces no producer field,
network call, model request, transcript storage, or operational command. The detail
refreshes once per second while open. A touch never sends a lifecycle event.

Family mode keeps its existing entertainment controls and receives no operator
inspection UI. Explicit `touch=fun` preserves the old operator entertainment option;
the canonical operator URL uses inspection by default. The deliberate audience
hold and provider refresh button retain their own event handlers.

## Animation ownership and limits

The existing ocular RAF remains the only continuous render owner. Iris geometry is
built once, rather than regenerating hundreds of fibers every frame. The material
surface writes only six paths at a maximum of 25 updates per second, falling to
10 in quiet mode and parking in night, hidden, or OS reduced-motion states. It does
not accrue elapsed animation time while parked. Posture and observed mode changes
still render. No additional continuous RAF loop was added.

This does not consolidate every older animation under one thermal policy. That
remains a separate review priority. CPU/GPU and thermal performance on the physical
NUC and panel must be measured before making performance claims.

## Reproduce the visual review

```bash
npm ci
npx playwright install --with-deps chromium ffmpeg
npm run review:presence
```

`playwright.presence.config.js` uses the real production runtime at 1920 × 1280.
The test supplies only synthetic safe packets, revisits modes rather than following
a pipeline, demonstrates a drag and a metric inspection, and saves video plus stills
under `test-results/presence/`. The visible `PREVIEW` label identifies the rehearsal.
Use `HERMES_TEST_CHROMIUM` to select an installed Chromium for local verification.

Review the film for continuity and tempo, then verify on the actual panel for
brightness, touch alignment, glance readability, and sustained resource usage.
