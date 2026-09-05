# Hermes display review

Reviewed baseline: `11e13109e8b3da308a2dd392dbd8c8ef89cdb483` on 2026-09-05.

The strongest direction is an expressive instrument: the eye communicates attention,
the surrounding display explains observed work, and entertainment fills genuinely
idle moments. The existing fixed socket, clipped iris, upper-lid blink, two
catchlights, touch response, and privacy contract are worth retaining. Adding more
continuous particle effects would compete with those strengths.

This review covers the browser runtime, state machine, normalization, event bus,
entertainment scheduler, privacy gates, deployment documentation, build pipeline,
and automated tests. It does not establish behavior on a live Hermes installation
or certify GPU load, acoustics, brightness, or touch alignment on the physical panel.

## Changes proposed in this review

| Finding | Evidence on the baseline | Proposed change |
| --- | --- | --- |
| Lifecycle observations can be ignored | `behavior-machine.js`: partial `TRANSITIONS` tables reject tool events in some modes and final completion in idle; every tool-start maps to shell | PR #1 uses explicit mode transitions and classifies allowlisted tool kinds; exhaustive tests cover both state-machine implementations |
| No visible sequence of work | `app.js`: activity headline and source describe a snapshot, while `avatarEventStatus.recent` is exposed only through debugging | Add five observed phases with elapsed time since the current phase was first seen; retain no transcript or session metadata |
| Waiting gaze can survive resumed work | `acknowledgeViewer('waiting', 0)` sets `forcedUntil` to infinity; polled `setTarget` changes do not release it | Drive social presence on mode changes, release old fixation holds, and preserve repeated-poll stability |
| Automatic entertainment is allowed during work | `entertainment.js:safeForIdleAttract` only excludes blocked/critical/offline | Require fresh, healthy, visible idle watch; interrupt automatic performances when work starts; vary three short wordless catalog pieces |
| Dark lens detail is difficult to distinguish | Baseline screenshot and lens/iris CSS | Add an opaque depth gradient and brighter iris filaments; preserve socket geometry and avoid extra filters or animation loops |
| Input requests recede with ordinary social presence | `.cb-activity` dims to 0.62 for waiting as well as acknowledgement | Keep the activity copy fully visible during waiting-for-input eye contact |
| UI regressions are absent from CI | `.github/workflows/ci.yml` runs only non-browser gates; Linux Playwright requires `/snap/bin/chromium` | PR #2 installs matching Chromium, tests both viewports, supports an explicit physical-browser override, and retains failure evidence |
| Blink test mixes two behaviors | Blink sampling begins immediately after mode creation, during the 500ms iris/pupil posture transition | PR #2 settles an explicit posture before measuring blink anatomy; the original anchoring tolerance remains unchanged |

## How the activity trace should be read

- The trace contains phases observed since the page opened. It is not a persisted
  session history, tool-call count, progress percentage, or estimated completion time.
- Consecutive samples of the same phase are coalesced. A feed gap stops the observed
  duration; recovery begins a new observation even if the reported phase is unchanged.
- `PREVIEW` identifies deterministic mode previews. A live page starts with
  `AWAITING TELEMETRY`; a stale connection shows last-observed phases without a current marker.
- Family mode creates no trace. Sensitive display mode clears the in-memory history
  and hides the trace. Only allowlisted phase names, glyphs, and local timestamps are retained.
- Five phase nodes are reused between changes. The age uses the existing five-second
  status timer. There is no new render loop, model request, database write, or network endpoint.

## Remaining priorities

| Priority | Improvement | Evidence and acceptance criterion |
| --- | --- | --- |
| High | Reconcile polling and SSE with source revisions | `installLiveHermesState` and `applyAvatarEvent` independently replace state. Introduce a producer-issued revision/epoch plus a documented authority policy; a delayed poll or replay must not overwrite newer observed activity. Do not use unrelated client arrival timestamps as a global ordering guarantee. |
| High | Make event replay idempotent | `AvatarEventBus.subscribe` replays up to 25 entries; the browser validates shape/TTL but does not deduplicate IDs. Reconnecting must not repeat completion celebrations or regress the phase sequence. Cover duplicate IDs, stream restart, and concurrent turns. |
| High | Unify headline and eye lifecycle state | `packetForAvatarEvent` changes mode while retaining the previous `live.current_work` and resolver context. A completion event after active work must produce matching headline, task rail, and eye state, without erasing health signals. |
| High | Tighten the browser contract deliberately | `displayStateSchemaFromJsonSchema` makes most boundary fields optional and passes richer fields through. Server-side privacy gates remain important, but the browser validator is not a full implementation of the JSON schema. Add explicit malformed-packet and privacy downgrade cases before tightening producers and consumers together. |
| Medium | Make the render budget govern every animation layer | Adaptive thermal policy sets dataset/CSS values, while several eye-loop guards inspect the OS reduced-motion preference directly. Measure DOM mutations, frame time, process CPU, and GPU load at each thermal tier, then consolidate one effective motion policy. No temperature improvement is claimed here. |
| Medium | Show overlapping agents accurately | One eye and one `current_work` slot cannot explain parallel sessions. Add bounded, pseudonymous activity counts or small satellite indicators only after the producer contract supplies reliable concurrent-turn identity. Avoid manufacturing progress from CPU utilization. |
| Medium | Expose upcoming scheduled work | Show the next approved scheduled task and time only when the producer supplies a display-safe label. Distinguish “scheduled,” “running,” “waiting,” and “finished”; never infer task completion from a quiet process. |
| Medium | Improve the operator's reading hierarchy | The private Augury overlay and provider rail can become extremely faint during active/direct-presence states. Test at normal viewing distance in daylight before globally increasing contrast. Keep input requests and actual faults prominent. |
| Medium | Split the 4,359-line baseline runtime | Extract transport reconciliation, status panels, and optic rig behind explicit interfaces. Preserve the generated contract and the existing animation ownership model; use behavior tests rather than widening source-pattern exceptions. |

## Visual and operational acceptance

Use synthetic fixtures first, followed by the real panel:

1. Idle: relaxed, occasional gaze; no implied work or invented alerts.
2. Start: brief direct acknowledgement before attention turns to work.
3. Reading/thinking/searching/tools/writing: distinct posture and trace phases.
4. Waiting: sustained eye contact with a readable input request.
5. Complete: one bounded return-to-viewer gesture, followed by quiet presence.
6. Stale/offline: stop claiming a current observation; preserve useful last-known context.
7. Entertainment: wordless variation only in eligible idle time; real work interrupts it.
8. Privacy/family: no operational history survives the boundary.
9. Reduced motion/night/thermal load: verify all applicable layers and quiet-hour audio.

Browser fixtures can establish state, DOM, and layout behavior. Physical acceptance
still requires the actual 1920×1280 MINIX panel, touch mapping, normal viewing
distance, and sustained CPU/GPU measurements. The host thermal policy and live
kiosk services are outside these PRs and have not been changed.
