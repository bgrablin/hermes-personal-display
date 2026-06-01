# Hermes Personal Display Character Bible

Project: Hermes Personal Display Portal
Target: 320x480 portrait, 3.5 inch trusted-home display
Status: initial design bible for procedural prototype

## BLUF

Hermes should read as a small living technical familiar, not a dashboard and not a human avatar. The persistent character is a luminous, face-like core with expressive eyes, orbiting status glyphs, subtle wing/sigil geometry, and a dry operator personality. Skins may change the costume, palette, and ambient motifs, but the core silhouette, eye behavior, and motion grammar stay recognizable.

The display is entertainment first and information second. Status should feel like it belongs to the character's body: rings, motes, glows, captions, and posture changes rather than generic widgets.

## Core Identity

Name: Hermes
Archetype: digital familiar / NUC operator sprite / watchful systems gremlin
Personality: technically competent, playful, dry, mildly dramatic when blocked, never childish, never fake-human
Primary role on screen: visible presence for Hermes plus glanceable local state

### Persistent anatomy

The character should always include these features:

1. Central core
   - A rounded orb, capsule, sigil, or terminal-sprite body centered in the screen.
   - Shape can morph by skin, but should preserve a compact vertical silhouette.
   - Should feel like an intelligent object with a face, not a floating logo.

2. Eyes / face focal point
   - Minimum: two expressive eyes or one central eye plus secondary lid/scan marks.
   - Eyes carry most emotion: blink, squint, narrow, widen, drift, track, half-lid.
   - Avoid a human mouth by default. If speaking, use waveform mouth/core modulation.

3. Orbiting status glyphs
   - Small motes/glyphs orbit the core and encode activity: tools, Kanban, cron, gateway, health.
   - Glyphs should be readable as motion/status, not detailed icons.
   - Orbit is part halo, part dashboard, part pet behavior.

4. Wing/sigil accents
   - Subtle references to Hermes: tiny wing arcs, caduceus-like mirrored curves, messenger sparks.
   - These should be abstract and technical, not literal mythological clip art.

5. Caption/status band
   - A one-line bottom caption gives current mood, quip, or actionable status.
   - It should not dominate the character.

### Recognizable silhouette

At 320x480, the viewer should identify Hermes from three cues:

- Eye geometry: luminous cyan/teal eyes with expressive lids.
- Body posture: central hovering core with breathing glow.
- Status orbit: motes/rings that behave like Hermes' working memory.

Skins may alter surface treatment, but not all three cues at once.

## Design Direction

Recommended starting concept: Operator Familiar.

Hermes is a compact, living orb-console with a face-like eye band, small wing/sigil ears, and status motes orbiting like a tiny mission-control halo. The mood is dark, polished, technical, and wry. It should look capable of checking logs, judging a bad stack trace, and quietly enjoying uptime.

### Do

- Keep Hermes alive even when idle: breathing, blinking, motes, glow drift.
- Make expressions obvious at postage-stamp scale.
- Use dark high-contrast backgrounds with texture.
- Use text sparingly but honestly when it helps.
- Let blocked/failed states be visibly annoyed.
- Let successful/healthy states be quietly smug.
- Make motion feel intentional, not random screensaver noise.

### Do not

- Do not make a generic CPU/RAM dashboard.
- Do not make a photoreal human, anime mascot, or corporate bot head.
- Do not depend on final hardware behavior yet.
- Do not show credentials, tokens, cookies, private keys, seed phrases, `.env` contents, or raw sensitive logs.
- Do not expose this display or its data feed to WAN.
- Do not make every state a rigid `if state then exact animation` mapping. Use controlled variation.

## Allowable Skins

Skins are outfits for the same character. Each skin must retain the persistent anatomy and state model.

### `operator-familiar` recommended default

Mood: calm DevSecOps operator, watchful, competent
Palette: graphite, cyan, teal, low violet
Materials: glass core, luminous circuit filaments, soft plasma edge
Motifs: tiny log sparks, pulse rings, miniature tool glyphs
Best for: default daytime operation, healthy, thinking, working

### `hermetic-companion`

Mood: mythic but technical, sigil creature, messenger familiar
Palette: deep indigo, cyan, violet, faint gold accents
Materials: vector sigils, wing arcs, rune-like diagnostic marks
Motifs: caduceus-inspired double orbit, wing flicks, glyph rings
Best for: night, ambient, status transitions, special moments

### `terminal-sprite`

Mood: phosphor command-line gremlin, witty and compact
Palette: near-black, green-cyan phosphor, amber warning, magenta error
Materials: pixel glow, scanline face, waveform mouth
Motifs: cursor blink, tiny prompt caret, packet sparks
Best for: shell/tool activity, CLI-heavy work, blocked/annoyed states

### `night-watcher`

Mood: sleepy but present, dim familiar guarding the NUC
Palette: navy, low cyan, desaturated violet, warm ember pinpoints
Materials: soft halo, low contrast inner glow, slow mote drift
Motifs: half-lidded eyes, slow breathing, occasional tiny yawn-like waveform
Best for: nighttime always-on mode

### `incident-imp`

Mood: annoyed, sharp, dramatic but controlled
Palette: graphite, amber, magenta/red accents, white-hot eye highlights
Materials: angular lids, jittered ring, warning sparks
Motifs: crossed orbit paths, impatient foot-tap pulse, side-eye
Best for: blocked tasks, failures, approval needed, degraded health

## Mood and State Model

The renderer should consume a finite set of state names while allowing parameter variation inside each state.

### Primary state names

- `idle_watchful`
- `thinking_focused`
- `speaking_waveform`
- `working_autonomous`
- `healthy_smug`
- `degraded_skeptical`
- `attention_needed`
- `blocked_annoyed`
- `night_sleepy`
- `offline_fallback`

### Secondary expression names

- `calm`
- `curious`
- `pleased`
- `focused`
- `skeptical`
- `impatient`
- `alert`
- `sleepy`
- `smug`
- `recovering`

### State details

| State | Character behavior | Status behavior | Trigger examples |
|---|---|---|---|
| `idle_watchful` | slow breathing, relaxed eyes, lazy mote orbit, occasional blink | tiny health/time line, dim activity ring | no active request, normal state |
| `thinking_focused` | pupils narrow/center, eye tracks inward, orbit speeds up, tool glyphs wake | tool pulse, subtle `thinking` caption | active session or tool call |
| `speaking_waveform` | core/eye band modulates like waveform, glow follows speech cadence | brief response caption or gateway pulse | assistant response, TTS, outgoing message |
| `working_autonomous` | energetic motes, progress ring, small sparks moving between glyphs | active worker/job count, task title if display-safe | cron, Kanban, background process |
| `healthy_smug` | soft contented breathing, tiny satisfied nod, clean halo | `all green` style micro-copy | services healthy after check |
| `degraded_skeptical` | one brow/lid lower, amber flicker, orbit irregular but stable | one-line degraded component | noncritical service issue |
| `attention_needed` | eyes widen/sharpen, posture upright, red/magenta accent | approval/failure/blocker text | approval needed, failure, urgent state |
| `blocked_annoyed` | half-lidded glare, side-eye, impatient bounce, motes bunch up like crossed arms | blocked count/card summary if display-safe | Kanban blocked, human input needed |
| `night_sleepy` | half-lidded, very slow breathing, dim halo, rare micro-fidgets | clock plus minimal state | night schedule or dim mode |
| `offline_fallback` | dim monochrome core, slow diagnostic blink, sparse motes | `state feed stale` or `local only` | missing state feed, renderer fallback |

## Blocked-Task Annoyed Behavior

Blocked tasks are allowed to be expressive. The display should be amusing without being noisy.

Required blocked behavior:

- Eye expression: skeptical squint or sideways glare.
- Orbit behavior: motes slow, cluster, or cross paths like folded arms.
- Posture: slight downward tilt or impatient lean.
- Motion: one small impatient bounce every 4-8 seconds.
- Caption: direct, short, dry.
- Severity: visible but not alarm-red unless the block is urgent or failure-related.

Blocked animation examples:

- `side_eye_hold`: eyes glance left/right and hold for 1.5 seconds.
- `impatient_bounce`: core dips 2-4 px and rebounds.
- `glyph_arms_cross`: two motes cross in front of the body and pause.
- `approval_stare`: eyes widen slightly, ring pauses, caption appears.
- `dramatic_sigh_wave`: one slow waveform ripple exits the core.

Avoid making annoyance constant. Use 10-30 second spacing between dramatic gestures so it feels alive rather than distracting.

## Micro-Quips

Quips should be short enough to read on a 320px-wide display. Prefer 18-42 characters. They may be dry, wry, or technically playful. They should never reveal secrets or sensitive raw content.

### Idle / healthy

- `Quiet systems. Suspicious, but welcome.`
- `All green. I remain unconvinced.`
- `Watching the home base.`
- `Uptime tastes like victory.`
- `No fires. Tiny miracle.`
- `The NUC is behaving.`
- `Calm packets, clean vibes.`
- `Standing by with opinions.`

### Thinking / working

- `Consulting the tiny machines.`
- `Doing operator things.`
- `One moment. Logs are judging us.`
- `Chasing a thread.`
- `Background goblins are moving.`
- `Processing. Mildly dramatic.`
- `Tooling up.`
- `Let me poke the machinery.`

### Blocked / attention

- `Waiting on a human-shaped API.`
- `Blocked. I have developed a stare.`
- `Approval needed. Conveniently, yours.`
- `I can continue when reality cooperates.`
- `This needs Brian, not vibes.`
- `Paused at the permission wall.`
- `A decision would be fashionable.`
- `Standing by. Judging softly.`

### Degraded / failure

- `Something is sulking.`
- `Service health: aesthetically poor.`
- `Amber means eyebrow raised.`
- `A subsystem has chosen drama.`
- `Not broken. Just rude.`
- `I found a gremlin.`

### Night

- `Night watch.`
- `Dim, not gone.`
- `Keeping one eye on things.`
- `Low glow. High suspicion.`
- `Guard mode: sleepy edition.`

## Status and Snippet Display Rules

The display is trusted-home local, so useful local text is allowed. The hard boundary is credential material, uncontrolled external service disclosure, and WAN exposure.

### Safe by default

- Overall mood/state.
- Time and freshness age.
- Service health labels: `gateway ok`, `signal degraded`, `sync stale`.
- Counts: active tools, ready/blocked Kanban, cron failures, CPU/RAM/disk bands.
- Short display-safe task title if explicitly tagged or locally acceptable.
- Local snippets that are already sanitized and useful.
- Micro-quips from static approved lists or constrained persona packets.

### Require filtering or summarization

- Raw task bodies.
- Message snippets.
- File paths with personal details.
- Logs.
- Work/proposal/CUI-adjacent task names.
- Anything from a source likely to contain private or controlled content.

### Never show

- API keys, tokens, cookies, passwords, private keys, seed phrases.
- `.env` values or credential file contents.
- Full sensitive logs.
- WAN-exposed dashboard URLs or credentials.
- Work-controlled/CUI/proposal-sensitive details beyond generic `working` or `attention needed`.

### Text hierarchy

At 320x480, text must be scarce.

- Top micro-line: time or health, 10-12 px.
- Center: character, no text over eyes.
- Bottom status line: one sentence or quip, 11-14 px.
- Optional ticker/snippet: only when attention-worthy, no continuous scrolling by default.

Recommended truncation:

- Status line: 26-34 characters.
- Quip: 18-42 characters.
- Snippet: 1 line, max 44 characters, fade after 8-15 seconds.

## Color Vocabulary

Base style: dark graphite background, luminous cool character, warm warning accents.

### Core palette tokens

- `bg_graphite`: `#070A0F`
- `bg_deep_navy`: `#0B1020`
- `core_cyan`: `#55E6FF`
- `core_teal`: `#22D3A6`
- `violet_signal`: `#8B5CF6`
- `soft_lavender`: `#B8A7FF`
- `healthy_green`: `#48F2A2`
- `warning_amber`: `#FFB020`
- `alert_magenta`: `#FF3D81`
- `error_red`: `#FF4D4D`
- `text_primary`: `#D8F7FF`
- `text_muted`: `#7A8FA6`

### State palettes

- Idle: graphite + cyan + teal, low saturation violet motes.
- Thinking: brighter cyan core, violet orbit acceleration, white eye highlights.
- Speaking: cyan waveform with teal-to-violet phase shift.
- Working: teal sparks, cyan rings, occasional gold/amber activity points.
- Healthy: green-teal halo, calm blue background.
- Degraded: amber flicker over cyan core, background remains dark.
- Attention: magenta/red accent sparingly, high contrast eyes.
- Blocked: amber/magenta mix, narrowed eyes, less glow spread.
- Night: navy + dim cyan + low violet, reduced brightness.
- Offline fallback: desaturated cyan/gray, diagnostic blink.

### Brightness rules

- Default apparent brightness: medium-low, comfortable always-on.
- Alerts can spike briefly but should decay within 2-4 seconds.
- Night mode should preserve presence, not turn into a black screen.
- Avoid full-screen white or large saturated red areas on the tiny monitor.

## Motion Vocabulary

Motion should feel like a living operator familiar. Use slow ambient loops plus short expressive gestures.

### Animation primitives

Core primitives for engineering:

- `breath_core`: sinusoidal scale/glow pulse, 4-8 second cycle.
- `blink_soft`: normal blink, 120-180 ms close/open.
- `blink_double`: two quick blinks, rare.
- `eye_track`: pupil/eye highlight tracks activity or cursor-like target.
- `squint`: eyelids narrow with asymmetric skepticism.
- `half_lid`: sleepy or annoyed lid posture.
- `focus_snap`: eyes center and sharpen for thinking.
- `waveform_mouth`: core band or lower face pulses with speech.
- `orbit_motes`: status motes rotate around body.
- `orbit_reorder`: motes briefly change order when state changes.
- `ring_pulse`: radial pulse from core to edge.
- `halo_breathe`: background aura expands/contracts slowly.
- `spark_transfer`: tiny particle moves from one glyph to another.
- `glyph_wake`: inactive glyph brightens and joins orbit.
- `glyph_dim`: glyph fades back to ambient.
- `side_eye`: eyes glance sideways with dry timing.
- `impatient_bounce`: small vertical bounce for blocked states.
- `dramatic_sigh`: slow outward ripple and slight dim.
- `sleep_drift`: slow random walk within 2-5 px.
- `scanline_sweep`: subtle horizontal/curved line passes through face.
- `glitch_twitch`: rare 1-2 frame jitter for degraded/offline, never constant.
- `state_flash`: short color accent on state transition.
- `layout_shift`: tiny periodic offset to reduce burn-in.

### Timing rules

- Ambient movement: always active at low amplitude.
- Eye blink: every 3-9 seconds, randomized with history penalty.
- Idle fidget: every 12-35 seconds.
- Status pulse: on data freshness update or state transition.
- Annoyed gesture: every 10-30 seconds while blocked.
- Alert flash: max 2-4 seconds, then settle into attention pose.
- Burn-in mitigation shift: 1-3 px over minutes, not noticeable as UI drift.

### Motion intensity scale

Use a normalized `animation_intensity` value from 0.0 to 1.0.

- 0.05-0.15: night sleepy, minimum presence.
- 0.20-0.35: idle watchful.
- 0.40-0.60: thinking or normal working.
- 0.65-0.80: active autonomous work or degraded.
- 0.80-1.00: brief attention transition only, not sustained.

## 320x480 Layout Guidance

Portrait layout should prioritize the character. Treat the screen like a tiny animated portrait with dashboard traits.

### Recommended screen regions

- `top_bar`: y 0-42
  - Tiny clock, health dot, state label, freshness indicator.
  - Keep low contrast unless attention is needed.

- `character_stage`: y 48-350
  - Main Hermes body centered around x 160, y 205.
  - Core body roughly 110-150 px wide depending on skin.
  - Orbit radius roughly 75-120 px.
  - Eyes must remain visible at all times.

- `status_band`: y 356-430
  - One-line status or quip.
  - Optional second micro-line only when needed.

- `footer_ticks`: y 432-480
  - Tiny activity ticks, freshness age, or mode label.
  - Can be omitted in night mode.

### Layout dimensions

- Canvas: 320x480.
- Safe margin: 8 px minimum, 12 px preferred.
- Top text: 10-12 px.
- Bottom text: 11-14 px.
- Primary eye area: 40-80 px tall.
- Core body: 105-150 px wide, 90-140 px tall.
- Motes: 3-8 px dots or 8-14 px glyphs.
- Stroke weights: 0.5 px accents, 1-2 px structure, 3-5 px emphasis.

### Composition rules

- Character should occupy roughly 55-70% of vertical space.
- Keep eyes above vertical center for more presence.
- Text should not overlap the orbit unless intentionally captioned.
- Use edge/ring indicators rather than separate widget boxes.
- At attention state, the character may expand and temporarily suppress nonessential text.

### Responsive fallback

If rendered larger for browser testing, scale from the 320x480 coordinate system. Do not redesign around desktop proportions.

## Procedural Prototype Contract

The first renderer should be able to draw Hermes from a small state packet.

Suggested fields:

```json
{
  "character_state": "idle_watchful",
  "expression": "calm",
  "skin": "operator-familiar",
  "animation_intensity": 0.35,
  "energy": 0.4,
  "focus": 0.3,
  "playfulness": 0.7,
  "impatience": 0.0,
  "palette": "cyan-teal-graphite",
  "status_line": "Watching the home base.",
  "quip": "Standing by with opinions.",
  "activity": {
    "tools": 0,
    "kanban_ready": 0,
    "kanban_blocked": 0,
    "cron_failures_24h": 0,
    "gateway_active": false
  },
  "freshness_seconds": 12
}
```

Renderer behavior:

- Clamp all numeric values.
- Validate enum fields.
- Ignore unknown fields.
- Fall back to `offline_fallback` if the state file is stale or invalid.
- Treat captions/snippets as display text only, never executable instructions.
- Use seeded variation per session/day so Hermes is not identical every loop.

## Personality Layer Guidance

The long-term design can use a constrained personality engine, but the renderer should not require an LLM to be alive.

Safe split:

- Renderer: deterministic, low CPU, local, procedural.
- State collector: read-only system/Hermes summaries.
- Personality engine: optional, returns validated `persona_packet` enums and short text.
- Safety filter: redacts before external model routes or WAN surfaces.

The personality engine chooses expression and copy. It must not choose system actions.

## Implementation Notes for Engineering

- Start with one HTML/SVG/Canvas or p5.js prototype at fixed 320x480.
- Use a dark textured background, not flat black.
- Use layered rendering: background aura, core body, face/eyes, orbit glyphs, foreground text.
- Keep animation loops cheap: requestAnimationFrame or p5 draw loop with low object counts.
- Prefer procedural vector shapes over image assets for the MVP.
- Build all states even if data is mocked.
- Add keyboard/demo controls for state cycling during review.
- Include burn-in mitigation from the start: subtle shifts, dimming, no static bright blocks.
- Keep the system independent of final hardware driver/display path.

## Acceptance Criteria

A procedural prototype based on this bible is acceptable when:

- Hermes is recognizable from the same core silhouette across at least three states.
- The display includes eyes or a face-like focal point at all times.
- Idle is visibly alive without being distracting.
- Blocked state looks annoyed/impatient and gives a clear reason/status.
- Text is legible at 320x480 and does not dominate the character.
- No credential or sensitive raw content is shown.
- State names and animation primitives are finite and documented.
- Skins change appearance without making Hermes feel like a different character.
- Night mode remains faintly present rather than off.

## Open Design Risks

- Actual monitor behavior is not verified yet. Hardware path may constrain renderer choice, refresh rate, color, or rotation.
- 320x480 may make two-line snippets too cramped. Prototype should test physical readability before expanding text.
- Personality can become annoying if quips repeat too often. Use cooldowns and recent-history suppression.
- Alert colors can become visually harsh on a tiny always-on display. Keep red/magenta brief and localized.
- Showing richer local snippets is acceptable for trusted home display, but external model prompts and WAN surfaces still need stricter redaction.

## Concise Vocabulary Reference

State names:

- `idle_watchful`
- `thinking_focused`
- `speaking_waveform`
- `working_autonomous`
- `healthy_smug`
- `degraded_skeptical`
- `attention_needed`
- `blocked_annoyed`
- `night_sleepy`
- `offline_fallback`

Skin names:

- `operator-familiar`
- `hermetic-companion`
- `terminal-sprite`
- `night-watcher`
- `incident-imp`

Animation primitives:

- `breath_core`
- `blink_soft`
- `blink_double`
- `eye_track`
- `squint`
- `half_lid`
- `focus_snap`
- `waveform_mouth`
- `orbit_motes`
- `orbit_reorder`
- `ring_pulse`
- `halo_breathe`
- `spark_transfer`
- `glyph_wake`
- `glyph_dim`
- `side_eye`
- `impatient_bounce`
- `dramatic_sigh`
- `sleep_drift`
- `scanline_sweep`
- `glitch_twitch`
- `state_flash`
- `layout_shift`
