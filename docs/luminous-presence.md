# Luminous presence

This revision removes the ordered activity strip. An agent can return to reading,
reconsider an answer, use several tools, and pause without following any fixed
visual sequence. The display should be a presence you can observe and interact with.

## Visual decisions

- Use a 1.18 scale for the central body, about 28% smaller in diameter than the
  first luminous revision. CPU, memory, and temperature stay anchored outside it.
- Restore five luminous blue motes in the space around the eye. Integrate their
  orbital phase continuously, so activity changes adjust speed without jumps.
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

## Activity color and Augury

The iris, aura, surface reflections, background light, and both rail headings
share one gently transitioning activity accent. Rest uses blue, reasoning uses
periwinkle, tool work uses teal, waiting uses amber, blocked/fault states use coral,
completion uses green, and unavailable telemetry uses slate. Actual metric and
provider warning colors remain independent. The small orbiting lights stay blue.

Augury occupies a left rail aligned with the provider rail. It pins the latest
display-safe work summary and useful detail above recent tool/request titles.
Repeated observations collapse into one row with a repeat count; five rows bound
the display. Identical polls update ages without restarting an animation. New
observations enter gently and existing rows retain their identity as they move.

The rail has no fading text loop or opacity masks. Waiting and faults subdue it
slightly while leaving context readable. Family mode still creates no Augury UI
and makes no Augury requests. Raw log bodies still require `auguryText=1`; a feed
item cannot grant itself permission with a `safeText` flag. A feed failure labels
retained log context as delayed, while current packet observations continue updating.

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
surface writes only six paths at display cadence with a 16 ms floor, falling to
20 updates per second in quiet mode and parking in night, hidden, or OS reduced-motion states. It does
not accrue elapsed animation time while parked. Posture and observed mode changes
still render. No additional continuous RAF loop was added.

The upgraded host uses less restrictive defaults. Adaptive motion now eases at
86°C, reduces at 92°C, and enters its critical tier at 96°C. CPU utilization alone
can ease motion at 95%, but does not force reduced motion. Absolute load-average
limits from the old NUC no longer apply by default. Operator and family effects
share a budget that eases above 86°C or 40 ms p95 frame time, and falls back further
above 92°C or 55 ms. The actual temperature warning indicators remain at 82°C/90°C.

`performance=conservative` restores the previous thermal/effects thresholds,
half-rate orbital field, and 25 Hz surface budget for older hosts. This does not
consolidate every older animation under one thermal policy. Sustained physical
CPU/GPU measurements remain necessary before making hardware performance claims.

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
