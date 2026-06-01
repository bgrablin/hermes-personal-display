# Sprite-Based Hermes Character Direction

Project: Hermes Personal Display
Target: 320x480 portrait, 3.5 inch local display
Status: fresh character-first direction after abstract/procedural character rejection

## BLUF

The next Hermes display character should start from a real free-to-use sprite or mascot asset, not from abstract procedural geometry. The base character must read first as a character: recognizable body silhouette, face/eyes, posture, and a few emotionally useful animation frames. UI, particles, rings, skins, captions, and status effects are supporting layers only.

Recommended direction: adapt a CC0 robot/mascot sprite into a small dry-witted technical familiar. Start with the researcher shortlist in this order:

1. Foozle Cute Platformer Robot for the fastest recognizable animated robot.
2. OpenGameArt Gum Bot for a stronger tiny mascot/pixel-familiar identity.
3. Kenney Robot Pack as a clean CC0 parts/style source if a custom assembled mascot is needed.

Do not hide the chosen sprite behind glow, status widgets, or procedural effects. If the silhouette disappears when particles and captions are removed, the direction has failed.

## 1. What Was Wrong With the Abstract Shape Approach

The previous direction had good mood, color, and state vocabulary, but it asked simple shapes to do too much character work.

### Main failures

- It read as a mashup of shapes, not a being.
  - Orbs, rings, eyes, motes, wings, and glows can suggest presence, but they do not automatically create a mascot.
  - Without clear anatomy, every state collapsed into glow changes, jitter, ring motion, and caption swaps.

- The silhouette was not stable enough.
  - At 320x480, a viewer needs one dominant read: head/body, face, posture.
  - A floating core with ornaments can look different in every state, which makes Hermes feel like a widget skin rather than the same character.

- The eyes had too much responsibility.
  - Eyes can carry emotion, but they need support from head angle, limbs, body lean, ears/antennae, or posture.
  - When the body is abstract, annoyed/thinking/sleepy all become variations of squint plus color.

- UI effects competed with identity.
  - Rings, motes, captions, and status glyphs are useful, but they started acting like the character.
  - Hermes should own the UI props, not be replaced by them.

- Procedural geometry made the design feel invented by code.
  - The display needs a character with inherited visual coherence: proportions, animation frames, face placement, and a tested readable silhouette.
  - Starting from a real sprite gives the prototype a character baseline before adding Hermes-specific personality.

### Keep from the old direction

- Dark graphite/cyan/teal operator palette.
- Dry, competent, mildly dramatic personality.
- State names: `idle_watchful`, `thinking_focused`, `working_autonomous`, `healthy_smug`, `blocked_annoyed`, `night_sleepy`.
- Sparse status text and local-safe privacy rules.
- Motes/rings as working-memory props, not core identity.

## 2. New Design Rules for a Sprite-Based Hermes Mascot

### Rule 1: Character first, effects second

The base sprite must be understandable with all UI removed.

Minimum character read:

- Recognizable body silhouette.
- Clear face or eye region.
- A default idle pose with personality.
- At least one readable alternate pose or frame that can imply motion.

Effects may enhance state, but cannot be required to understand who Hermes is.

### Rule 2: Preserve the source silhouette

Do not over-kitbash the first pass. Pick the asset because its body already works.

Safe modifications:

- Palette remap.
- Eye glow overlay.
- Small accessory layer.
- Shadow/grounding layer.
- Separate status props around the sprite.
- Minor frame timing changes.

Risky modifications:

- Replacing the head or face.
- Covering the body with panels/widgets.
- Adding large wings, halos, or armor that change the outline.
- Combining pieces from multiple unrelated art styles.
- Scaling smoothing that makes pixel sprites blurry.

### Rule 3: Eyes must remain the focal point

The expressive face/eyes are the emotional interface.

Requirements:

- Eyes visible at normal display brightness.
- Eyes not covered by text, particles, scanlines, or accessory layers.
- Eye state readable from 1-2 meters away on a 3.5 inch screen.
- If the source sprite has weak eyes, add a subtle overlay rather than repainting the entire face.

Eye overlay options:

- Cyan/teal emissive eye pixels.
- Separate eyelid masks for blink/squint.
- Tiny highlight dot for eye tracking.
- Amber/magenta accent only for blocked/degraded/attention states.

### Rule 4: Hermes is a technical familiar, not a game hero

A platformer robot can work, but the staging must move it from game-avatar to desk-familiar.

Use:

- Small stage, shadow, and ambient terminal glow.
- Tool motes that orbit like assistant working memory.
- Tiny status captions that feel like thoughts or operator remarks.
- Calm idle timing, not constant running.

Avoid:

- Weapon/combat states.
- Large action effects.
- Jump/run loops as default idle.
- Character posing that implies a side-scroller level unless intentionally framed as a tiny local stage.

### Rule 5: Skins are costumes, not new characters

Optional skins can exist, but the base mascot remains recognizable.

A skin may change:

- Palette.
- Glow color.
- Accessory accent.
- Background props.
- Particle/mote style.
- Caption voice within the approved Hermes personality.

A skin must not change:

- Main sprite identity.
- Eye placement.
- Body proportions.
- Core idle silhouette.
- State readability.

### Rule 6: State changes should use animation frames plus overlays

Use real sprite frames where they exist. Use overlays only for missing emotions.

Preferred layer stack:

1. Background and stage shadow.
2. Base sprite animation.
3. Eye/face overlay if needed.
4. Accessory overlay.
5. Motes/status props behind or beside the sprite.
6. Sparse text outside the face/body area.
7. Brief transition effects.

Do not use a full-screen canvas effect as the state language.

## 3. How to Evaluate Candidate Sprites From Researcher

Evaluate candidates with this scorecard before implementation. A candidate should pass licensing first, then readability.

| Criterion | Pass condition | Reject or defer if |
|---|---|---|
| License | CC0/Public Domain or clearly permissive for modification/redistribution/commercial use | `free` only, personal-use only, unclear marketplace terms, AI stock ambiguity |
| Source trust | Direct creator page, OpenGameArt asset page, Kenney, itch.io page with explicit license | Rehosted ZIPs, Pinterest/stock mirrors, collection metadata only |
| Silhouette | Recognizable robot/mascot at 80-160 px tall | Looks like generic armor, vehicle, icon, or blob |
| Face/eyes | Emotionally useful eye/face region | No readable face, eyes too tiny, face hidden by helmet detail |
| Animation | Idle or equivalent loop available; extra poses helpful | Only static image unless art is exceptional and easy to rig |
| Style fit | Compatible with graphite/cyan technical display | Too childish, too violent, too busy, too corporate chatbot |
| 320x480 fit | Works centered in portrait with room for top/bottom text | Requires landscape scene, huge detail, or tiny unreadable scale |
| Modification safety | Palette/accessory changes can personalize without redrawing | Needs major anatomy edits to feel like Hermes |
| Runtime practicality | PNG sheet/frames/SVG parts usable locally in browser | Requires paid editor, Flash pipeline, 3D render setup for first pass |

### Candidate-specific read

#### Foozle Cute Platformer Robot

Use first if the goal is a quick recognizable animated character.

Strengths:

- Explicit CC0 and browser-prototype friendly.
- Clear robot body and cute face.
- Existing idle/walk/run/jump loops.
- Enough polish to avoid the shape-mashup problem.

Design risk:

- Side-view platformer pose may feel like a game avatar instead of Hermes.

Adaptation approach:

- Stage him as a small operator robot on a dark local-console plinth.
- Use idle as the default. Use walk/run only as contained `working_autonomous` energy, not locomotion across the whole screen.
- Add Hermes identity through palette, eyes, accessory, motes, and captions.

#### OpenGameArt Gum Bot

Use if Brian wants the strongest tiny mascot/familiar feel.

Strengths:

- CC0.
- Compact, charming, immediately mascot-like.
- Built-in blinking, flicker, surprise, powered-down vocabulary.
- Pixel art can look crisp on 320x480 with nearest-neighbor scaling.

Design risk:

- Low resolution may feel intentionally retro rather than polished unless the whole composition supports it.

Adaptation approach:

- Lean into pixel-terminal mode.
- Scale cleanly with image smoothing disabled.
- Keep UI extra minimal so the pixel character owns the screen.

#### Kenney Robot Pack

Use as a parts/style fallback.

Strengths:

- Reputable CC0 source.
- Good for coherent robot parts or style references.
- Clean legal posture.

Design risk:

- May not include a ready expressive animated mascot.
- Could become kitbash-heavy if the team over-assembles parts.

Adaptation approach:

- Pick one complete character/pose if present.
- If assembling from parts, maintain one coherent style and export a small rig with stable anatomy.
- Do not mix Kenney pieces with unrelated sprite art in the first pass.

### License and attribution handling

- Prefer CC0 assets.
- Keep a local `docs/asset-credits.md` or section in implementation docs even when attribution is not required.
- Record source URL, license URL, download date, and any creator credit text.
- Do not imply source creator endorsement.
- Do not use source logos or trademarks as part of Hermes.
- Do not ingest unknown `free` assets just because they can be downloaded.

## 4. Adaptation Concepts

### Base palette

Default palette should make the free sprite feel native to Hermes without erasing it.

Recommended tokens:

- Background: `#070A0F` graphite, `#0B1020` deep navy.
- Primary glow: `#55E6FF` cyan.
- Secondary glow: `#22D3A6` teal.
- Quiet violet: `#8B5CF6`.
- Healthy accent: `#48F2A2`.
- Warning accent: `#FFB020`.
- Blocked accent: `#FF3D81` used sparingly.
- Text: `#D8F7FF` primary, `#7A8FA6` muted.

Sprite recolor guidance:

- Preserve value contrast from the original sprite.
- Recolor large body surfaces to dark graphite/slate only if the sprite still separates from the background.
- Use cyan/teal mainly in eyes, screen panels, seams, and small highlights.
- Use amber/magenta as state accents, not permanent body colors.
- Test at actual 320x480 scale after every palette pass.

### Accessories

Accessories should identify Hermes, not costume over the character.

Safe accessory ideas:

- Tiny cyan terminal badge or belly screen.
- Small wing-like antenna tabs if they do not break the original silhouette.
- One shoulder/side glyph resembling a local operator mark.
- Tool motes that hover near the sprite as props.
- A faint floor shadow or plinth suggesting the NUC/display environment.

Avoid:

- Literal caduceus art as a large emblem.
- Big hats, wings, capes, or armor.
- Text labels on the character body.
- Anything that hides arms, head, or eyes.

### Eyes

If the source eyes are strong:

- Preserve the original shape.
- Add subtle glow/highlight only.
- Create blink/squint through frame timing or small overlay masks.

If the source eyes are weak:

- Add a small emissive eye overlay matching the face position.
- Keep overlay pixel-aligned for pixel assets.
- Add at most three eye states for first prototype: open, half-lid, squint/side-eye.

Expression vocabulary:

- Idle: open, relaxed, occasional blink.
- Thinking: narrowed/centered, brighter highlight.
- Healthy/smug: half-lid asymmetry.
- Blocked/annoyed: side-eye, flatter upper lids, small amber/magenta edge.
- Night: low crescents or dim screen-flicker.

### Expressions

Do not rely on mouth shapes. Hermes' dry personality should come from eyes, posture, timing, and captions.

Minimum expression set:

- `idle_watchful`: relaxed, alive, not cute-for-cute's-sake.
- `thinking_focused`: forward focus, tight timing, tool motes wake up.
- `healthy_smug`: tiny satisfied settle, half-lid confidence.
- `blocked_annoyed`: side-eye, crossed/clustered props, impatient hold.
- `night_sleepy`: dim, slow, still present.

Optional later expressions:

- `degraded_skeptical`: one brow/eye lower, amber flicker.
- `attention_needed`: upright/wide-eyed, brief magenta flash.
- `offline_fallback`: desaturated diagnostic blink.

### Idle loop

Intent: Hermes is alive and watchful, not bouncing for attention.

Recommended idle layers:

- Base sprite idle loop at original intended timing or slightly slower.
- Blink every 3-9 seconds with recent-history randomness if not already in the sprite.
- Tiny vertical hover or breathing offset of 1-3 px.
- One rare micro-fidget every 15-35 seconds.
- 2-5 motes drifting behind or beside the character, not over the face.
- Caption suppressed by default or rotated slowly with long cooldowns.

Avoid:

- Constant running/walking.
- Continuous shake.
- Large glow pulsing.
- More than one simultaneous attention-grabbing loop.

### Annoyed state

Intent: visibly blocked, dryly impatient, not alarmed unless urgent.

Animation recipe:

1. Entry: 250-400 ms settle downward or lean.
2. Eyes: side-eye or narrowed eye overlay.
3. Props: motes bunch to one side or cross paths like folded arms.
4. Body: hold a still annoyed pose longer than expected, 1.2-1.8 seconds.
5. Loop: one impatient tap/bob every 8-18 seconds.
6. Caption: short, dry, actionable.

Caption examples:

- `Blocked. I have a stare.`
- `This needs Brian, not vibes.`
- `Waiting on reality.`
- `Approval wall detected.`

Avoid:

- Full red screen.
- Fast vibration.
- Repeating the same joke every few seconds.
- Hiding the character behind warning banners.

### Thinking state

Intent: focused internal work.

Animation recipe:

1. Entry: quick focus snap, 180-260 ms.
2. Eyes: narrower and brighter, pupils/highlights centered.
3. Motes: form a tighter crown or orbit above/behind the character.
4. Body: slight forward lean or tighter idle amplitude.
5. Loop: slow scanline or small tool spark every 2-4 seconds.
6. Caption: optional, one line max.

Caption examples:

- `Chasing a thread.`
- `Poking the machinery.`
- `Logs are judging us.`

Avoid:

- Turning thinking into frantic activity.
- Covering the sprite with code rain or dense icons.

### Night state

Intent: dim guardian presence, not off and not dead.

Animation recipe:

1. Dim global sprite brightness 40-70%, depending on hardware readability.
2. Keep eyes visible as low cyan/teal points or crescents.
3. Slow idle to 50-70% speed.
4. Reduce motes to 1-3 firefly-like points.
5. Shift position by 1-3 px over minutes for burn-in mitigation.
6. Suppress nonessential captions and footer ticks.

Caption examples:

- `Night watch.`
- `Dim, not gone.`
- `Guard mode: sleepy edition.`

Avoid:

- Pure black screen unless display sleep is intentionally separate.
- Bright clock/status blocks.
- High-saturation blue at night.

## 5. UI Composition Rules

### Layout at 320x480

Use the screen as a portrait stage, not a mini dashboard.

Recommended regions:

```text
0-34 px      top micro-line: time/state/freshness, low contrast
34-374 px    character stage: sprite is dominant focal point
374-438 px   bottom status/quip: one line, optional second micro-line only when useful
438-480 px   tiny footer ticks or nothing, especially in night mode
```

Character sizing:

- Main sprite should occupy roughly 45-65% of vertical height including idle motion and props.
- Eye region should land in the upper-middle of the screen, roughly y=145-230 depending on sprite proportions.
- Keep at least 8-12 px safe margin around the full animated bounds.
- For pixel art, scale by integer multiples where possible and disable smoothing.
- For high-res sprites, scale down with clean edges and verify no facial details vanish.

### Focal hierarchy

1. Eyes/face.
2. Body silhouette/posture.
3. State motion.
4. Motes/accessories.
5. Text/status.
6. Background texture.

If text or motes pull attention before the eyes, reduce them.

### Text rules

- Keep bottom status to 26-34 characters when possible.
- Use a second line only for actionable attention states.
- Never place text over the sprite face.
- Avoid continuous scrolling by default.
- Use static approved quips or sanitized state packets only.
- Never show secrets, raw logs, credentials, private keys, `.env` values, sensitive work/proposal details, or uncontrolled message snippets.

### Status props

Motes and rings are allowed only as character props.

Use them for:

- Active tool count.
- Background job activity.
- Kanban blocked/ready count at a glance.
- Gateway/sync/health freshness.

Rules:

- 2-7 motes max in normal mode.
- Keep motes behind, beside, or below the face.
- Do not make a full dashboard orbit unless the sprite remains visually dominant.
- Use color sparingly: cyan/teal normal, green healthy, amber degraded, magenta blocked/attention.

### Skins and clutter budget

Each skin gets a strict clutter budget.

Allowed per skin:

- One palette shift.
- One small accessory or motif.
- One background treatment.
- One motion variation.

Not allowed:

- Multiple accessories plus new background plus extra particles plus different typography.
- Any skin that makes Brian ask whether it is still the same character.

### State visibility without captions

The prototype should pass a caption-off test:

- Idle: relaxed and alive.
- Thinking: focused and internally busy.
- Healthy/smug: satisfied or quietly pleased.
- Blocked/annoyed: impatient or judging.
- Night: sleepy but present.

If a state only reads with the caption visible, improve sprite frame choice, eye overlay, posture, or prop behavior before adding more UI.

## Implementation Notes

### Runtime approach

Use PixiJS or equivalent canvas sprite rendering for the first implementation.

Recommended structure:

```text
src/character/
  assets/                 # local CC0 sprite frames/sheets, credits nearby
  spriteAtlas.js           # frame definitions or generated atlas loader
  HermesSpriteCharacter.js # base sprite + overlays + props
  expressions.js           # eye overlays and state-specific settings
  skins.js                 # palette/accessory/background variants
  stateMapper.js           # persona/display state -> animation state
  composition.js           # 320x480 layout constants
```

No remote CDN in kiosk mode. Keep assets local once license is verified.

### Adaptation workflow

1. Select one candidate sprite.
2. Save license/source notes before modifying.
3. Create a neutral 320x480 stage with no extra UI.
4. Place the sprite at final display scale.
5. Validate silhouette and face from normal viewing distance.
6. Add only the minimum eye/palette/accessory overlays needed for Hermes identity.
7. Add state mapping for idle, thinking, blocked, night, and healthy/smug.
8. Add bottom caption and top micro-line last.
9. Run caption-off and effects-off reviews.

### Modification safety

For CC0 assets, modification is allowed, but the design still needs provenance hygiene.

- Keep the original asset archive or source URL documented.
- Keep modified derivatives separate from originals.
- Name derivatives clearly, e.g. `foozle-robot-hermes-palette.png`.
- Note voluntary credit text even when not required.
- Do not claim the adapted character is endorsed by the original artist.
- Do not use creator logos or trademarks.

## Acceptance Criteria

This direction is successful when:

- Hermes reads as a character before he reads as UI.
- The selected sprite has a license-clean source, preferably CC0.
- The base silhouette remains recognizable with effects hidden.
- Eyes/face stay readable in all required states.
- Idle feels alive without screensaver noise.
- Thinking, annoyed, smug/healthy, and night states are identifiable with captions hidden.
- Optional skins preserve the same base mascot.
- UI composition keeps the sprite as the focal point at 320x480.
- No paid tools, paid assets, unclear licenses, or remote runtime dependencies are required.
- Credits/provenance are documented even when attribution is optional.

## Final Recommendation

Prototype the Foozle Cute Platformer Robot first because it is CC0, recognizable, animated, and likely to resolve the shape-mashup problem fastest. If it feels too much like a side-view game avatar, switch to Gum Bot and commit to a crisp pixel-familiar style. Use Kenney only if the team needs a clean parts library after the first two options fail the character-readability test.

The key design constraint for the next worker: do less around the character. Pick a good sprite, make Hermes' eyes and dry operator personality unmistakable, and keep the display UI subordinate to the mascot.
