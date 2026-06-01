# Foozle Hermes Design Direction

Project: Hermes Personal Display
Target: 320x480 portrait, 3.5 inch local display
Base character: Foozle Cute Platformer Robot only
Status: selected character direction for implementation polish

## BLUF

Use the Foozle Cute Platformer Robot as a large, dominant desk-familiar, not as a tiny side-scroller avatar. The robot should own the center of the display, with sparse operator-status text and very light ambient UI around it.

The design goal is: family-friendly enough to read as approachable, dry enough to still feel like Hermes. The character should read as a small competent local operator living on the NUC: friendly, watchful, occasionally smug, and visibly annoyed when blocked.

Do not rebuild the character from shapes, do not mash it with unrelated sprites, and do not hide it behind rings, particles, dashboards, or tiny text.

## Source and license notes

Primary source:

- Foozle Cute Platformer Robot
- https://foozlecc.itch.io/cute-platformer-robot

License notes preserved from the researcher handoff:

- The itch.io page lists Creative Commons Zero v1.0 Universal / CC0.
- The page text says the content is free to use and modify for all projects, including commercial projects.
- Attribution is not required.
- The page states no generative AI was used.

Local preview/reference:

- `assets/character-candidates/previews/candidate-source-foozle-cute-platformer-robot.png`

Implementation note: before final renderer work, verify the full Foozle asset archive is present locally and preserve the source URL/license note beside the imported asset. If the full archive is not already in the repo, download only from the source page above or another source that preserves the same license metadata.

## Design direction

### Concept

Hermes is a tiny platformer robot who got promoted into local systems operations.

He is still rounded, friendly, and readable, but the staging changes the meaning:

- Not: game character waiting for a level to start.
- Not: childish toy mascot.
- Not: abstract glowing assistant orb.
- Yes: desk-side technical familiar, local operator, small dry-witted robot with visible state.

The Foozle silhouette stays intact. Hermes-specific identity comes from palette treatment, eye/screen glow, state overlays, stage lighting, tiny operator motifs, and caption voice.

### Tone guardrails

Use:

- Calm, observant idle behavior.
- Small wry reactions rather than broad cartoon panic.
- Operator cues: terminal glow, tiny diagnostic motes, local-status glyphs.
- One dominant character with supporting UI.

Avoid:

- Platformer level scenery, coins, enemies, or action-game framing.
- Large speech bubbles.
- Constant running or jumping as the default state.
- Big halos, wings, armor, or accessories that change the silhouette.
- Cute baby talk, exaggerated emoji language, or goofy mascot branding.
- Dense dashboards behind or around the character.

## 320x480 layout

### Canvas zones

Use a simple three-zone portrait layout:

```text
0-48 px      top status strip
49-370 px    character stage
371-480 px   caption/status footer
```

This is a visual hierarchy, not a hard widget grid. The character stage can breathe into adjacent zones when text is absent.

### Character scale and position

Target character size:

- Normal idle height: 185-220 px.
- Maximum state height including bounce/jump/sleep overlays: 235 px.
- Width safe zone: keep at least 18-24 px clear on both left and right edges.
- Character visual center: x = 160 px.
- Character baseline/shadow center: y = 330-350 px.
- Eye/screen region should land roughly around y = 205-245 px in idle.

Rationale:

- The contact-sheet preview reads clearly but would be too small if treated like a normal platformer sprite.
- On the physical 3.5 inch display, Hermes needs to be recognizable from 1-2 meters away.
- The face/screen glow must be the focal point before any text is read.

### Stage and grounding

Use a minimal dark local-console stage:

- Soft oval shadow under the robot, not a platformer floor.
- Very subtle terminal glow behind the body.
- No scene horizon, tilemap, landscape, or platform edge.
- Optional thin baseline/grid only if it improves grounding.

Recommended stage density:

- Background: 5-10% visual density.
- Character: 70-80% of attention.
- Ambient/status effects: 10-15%.
- Text: 5-10%, only when useful.

### Text placement

Top status strip:

- Use for one short system/state label.
- Examples: `LOCAL`, `THINKING`, `HEALTHY`, `BLOCKED`, `NIGHT WATCH`.
- Keep it small, all-caps or compact title case, low contrast until attention is needed.
- Do not place text over the character's face or body.

Footer caption/status:

- Use for one line of dry Hermes copy or one compact operational fact.
- Max target: 28-36 visible characters.
- Prefer sparse, rotating snippets over a permanent dashboard.
- If status is sensitive or too long, show a safe generic caption instead.

Examples:

- Idle: `Standing by. Mostly.`
- Thinking: `Indexing the obvious.`
- Healthy: `All green. Suspiciously tidy.`
- Blocked: `Blocked. Naturally.`
- Night: `Low glow. Still watching.`

## Visual treatment

### Palette

Base direction:

- Background: near-black graphite/navy, `#071016` to `#0B1118`.
- Character body: preserve Foozle dark greys, optionally remap cooler toward graphite/slate.
- Primary glow: Hermes cyan/teal, `#4DEBFF`, `#22C7D8`, `#5CF2D6`.
- Secondary calm accent: muted violet/blue, `#6D7CFF`, used sparingly.
- Attention accent: amber, `#FFB84D`, for blocked/degraded states.
- Critical/error accent: avoid default red unless truly needed; prefer amber-magenta for annoyance.

Do not over-saturate the whole sprite. The eyes/screen should be the brightest element.

### Screen glow / eye tint

The Foozle face/screen is the main emotional interface.

Requirements:

- Add a separate glow layer on top of the source face/screen, not a repaint of the whole head.
- Use opacity and color shifts to express state.
- Use eyelid/squint overlays only if needed, and keep them aligned with the source face.
- Blink should be infrequent and intentional, not a constant idle twitch.

State tint guidance:

- Idle: steady cyan, soft pulse every 5-7 seconds.
- Thinking: cyan-white sweep or small scanline across the face.
- Healthy: teal-cyan brightening with brief smug half-lid overlay.
- Blocked/annoyed: amber edge glow plus narrowed eye overlay.
- Night/sleepy: dim blue-cyan, low opacity, half-closed eyelid overlay.

### Hermes-specific accessories

Keep accessories tiny and removable. They should read as operator props, not costume pieces.

Allowed first-pass motifs:

- One small antenna/caret accent above or behind the head, if it does not alter the silhouette too much.
- A tiny terminal prompt badge near the torso or stage, e.g. `>_`.
- 2-4 small diagnostic motes around the robot, used like working-memory tools.
- A slim status underline or small corner glyph.
- Optional faint caduceus/messenger-wing line motif only as a 1-2 px decorative accent, not a logo.

Avoid:

- Large hats, wings, capes, armor, headphones, or backpack rigs.
- Multiple badges competing with the face.
- Any accessory that makes the source character unrecognizable.

### Background density

Background should feel like a dark local console, not a dashboard.

Use:

- Low-contrast radial glow behind the character.
- Very faint 1 px scanline/noise layer if it does not shimmer on hardware.
- 2-4 drifting motes max.
- Small corner telemetry dots only when state needs them.

Avoid:

- Full-screen particle fields.
- Multiple panels.
- Live charts behind the character.
- Bright borders or heavy chrome.

## State and behavior model

The available Foozle animation vocabulary from the source page is: idle, jump, walk, run, plus individual sprite parts. Use the real frames first. Use overlays only to express emotions the frames do not provide.

### State mapping table

| Hermes state | Base Foozle animation | Overlay / behavior | Text posture |
|---|---|---|---|
| Idle / watchful | Idle loop | Slow breathing pulse, rare blink, 1-2 motes drifting behind shoulders | Optional footer quip every few minutes |
| Thinking / focused | Idle loop with small forward lean, occasional first jump anticipation frame if available | Face scanline, faster mote orbit, cyan-white glow, small head/torso dip | Show `THINKING`; footer can show terse activity |
| Healthy / smug | Idle loop, slight upward bob | Bright teal eye glow, half-lid/smug overlay, one tiny sparkle, posture centered | Show `HEALTHY` briefly, then return to quiet |
| Blocked / annoyed | Idle held pose or walk frame frozen into weight shift | Amber edge glow, narrowed eyes, arms/shoulders look tense if source allows, one impatient foot/stage tap | Show `BLOCKED`; footer dry and short |
| Night / sleepy | Slow idle, reduced FPS | Dimmed body, half-closed eyes, one slow firefly mote, background nearly black | Show `NIGHT WATCH` or no top text |

### Idle / watchful

Behavior:

- Default most of the time.
- Use the Foozle idle loop at a calm frame rate.
- Add a 5-7 second subtle glow/breath cycle.
- Blink every 12-25 seconds, randomized.
- One mote may drift slowly, but the robot remains dominant.

Expression:

- Neutral-friendly.
- Eyes bright but not alert.
- No running, jumping, or full-screen motion.

### Thinking / focused

Behavior:

- Keep feet/stage mostly planted.
- Lean or bob forward subtly rather than pacing.
- Use scanline/face sweep and faster motes to show cognition.
- If using jump frames, use only anticipation/compression as a thinking dip, not a full jump.

Expression:

- Slight squint.
- Cyan-white eye/screen sweep.
- Motes form a small partial crown or side orbit.

### Healthy / smug

Behavior:

- One small satisfied bob, then return to idle.
- Brighten eyes briefly.
- Optional tiny sparkle or check glyph near shoulder, not in front of face.

Expression:

- Half-lid smugness if overlay is available.
- Reads as `of course it works`, not celebration.

### Blocked / annoyed

Behavior:

- Brief freeze or slow weight shift.
- One tap/dip every 3-5 seconds while blocked.
- Amber accent appears at edges or motes, not full red alarm.
- If walk frames help imply impatience, use a two-frame in-place shuffle only.

Expression:

- Narrowed eyes or side-eye overlay.
- Slight lowered body/shoulder posture.
- Caption should be dry, not frantic.

### Night / sleepy

Behavior:

- Reduce animation speed and brightness.
- Idle loop becomes very slow.
- Background fades to near-black navy.
- One mote becomes a slow firefly.
- Avoid bright captions unless there is an actionable event.

Expression:

- Half-closed eyes.
- Dim cyan/blue glow.
- Character remains present but unobtrusive.

## Interaction and motion vocabulary

Use layered animation instead of one animation per state:

1. Base Foozle frame loop.
2. State posture adjustment.
3. Face/screen glow overlay.
4. Small mote/status prop behavior.
5. Optional one-shot gesture with cooldown.
6. Text change.

Motion timing:

- Idle loop: calm, slower than game default if needed.
- State transitions: 180-350 ms.
- One-shot gestures: under 900 ms.
- Repeated annoyed taps: no more than once every 3 seconds.
- Thinking scanline: 1.2-2 seconds per pass.
- Night pulse: 8-12 seconds.

Motion constraints:

- Avoid constant camera shake.
- Avoid large lateral movement.
- Avoid full jumps unless used as a rare playful flourish.
- Keep eyes visible in every frame.
- No animation should clip the 320 px width.

## Implementation notes for engineer

This is a design spec only, not an implementation task.

Recommended first implementation choices:

- Use PixiJS `AnimatedSprite` or equivalent sprite-frame animation for Foozle loops.
- Keep overlays as separate layers so the source sprite remains untouched.
- Add `image-rendering`/smoothing deliberately based on source resolution. The goal is clean, not Gum Bot pixelated.
- Define state names compatible with existing Hermes vocabulary:
  - `idle_watchful`
  - `thinking_focused`
  - `working_autonomous` if needed as a later walk/run variation
  - `healthy_smug`
  - `blocked_annoyed`
  - `night_sleepy`
- Keep all assets local. No CDN dependency required for the character.
- Preserve license/source metadata in the repo near the imported source asset.

Layer order:

1. Background graphite/navy fill.
2. Subtle radial glow and optional scanline/noise.
3. Stage shadow.
4. Foozle base sprite animation.
5. Face/screen glow and eyelid overlays.
6. Tiny accessory/status motif.
7. Motes behind or beside character, never over face.
8. Top status strip.
9. Footer caption/status.
10. Brief transition flashes.

## Acceptance criteria

Engineer acceptance checks:

- The prototype uses Foozle Cute Platformer Robot as the only base character for this pass.
- Source URL and CC0/license notes are preserved in the asset documentation or adjacent metadata.
- The display is 320x480 portrait.
- The character is visually dominant: normal idle height is roughly 185-220 px and the eyes/screen are readable from 1-2 meters.
- The robot is centered with safe margins and does not clip during idle, thinking, blocked, healthy, or night states.
- Text never covers the face/screen or body.
- Background is sparse and dark; no dense dashboard, platformer scene, or heavy particle field competes with the character.
- Idle uses a calm Foozle idle loop, not running/jumping as default.
- Thinking, healthy, blocked/annoyed, and night/sleepy states are visually distinguishable without relying only on captions.
- Blocked/annoyed uses amber/dry impatience, not full red emergency styling unless there is a real critical condition.
- Night/sleepy meaningfully reduces brightness and motion.
- The design avoids prior failures: no abstract orb, no shape mashup, no confusing face placement, no tiny sprite staging, and no overly pixelated Gum Bot feel.
- Captions follow Hermes tone: concise, dry, operator-like, and safe for local display.

## Open questions for later polish

These should not block the first Foozle prototype:

- Whether to recolor the full sprite or keep the original body and only recolor glow/overlays.
- Whether the final default should face left, right, or subtly alternate within idle constraints.
- Whether `working_autonomous` should use in-place walk/run frames or remain a thinking-style state with faster motes.
- Whether a tiny `>_` prompt badge improves Hermes identity or adds clutter on physical hardware.
