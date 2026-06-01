# RGS Hermes character direction

Task: `t_0fc11f16`
Target: Hermes Personal Display, 320x480 portrait browser runtime
Asset root: `assets/character-candidates/modular-parts/extracted/rgs_modular_vector_characters/Free 2D Animated Vector Game Character Sprites/`

## BLUF

Use RGS as a cute, floating AI familiar only if we treat it as a modular puppet, not as a shooter/fantasy avatar. The best base is **Char 4 / smooth round head / small body / soft hands**, with the existing `src/character-runtime.html` motion language preserved: breathing, gaze, blinks, side-eye, state transitions, motes/orbits, posture changes, blocked annoyance, and sleepy night drift.

The character concept is **Hermes Runtime Familiar**: a small white modular gremlin-console with luminous cyan/teal recolored parts, soft hands, no weapons, no monster teeth, no combat actions, and only subtle technical background/status effects from the abstract runtime.

## Source and license notes

RGS archive is already local:

- Archive: `assets/character-candidates/modular-parts/downloads/rgs_modular_vector_characters.zip`
- Extracted root: `assets/character-candidates/modular-parts/extracted/rgs_modular_vector_characters/`
- Inventory: `assets/character-candidates/rgs-acquisition/rgs-asset-inventory.md`
- Contact sheet created for this direction: `assets/character-candidates/rgs-acquisition/rgs-selected-parts-contact-sheet.png`

Local `License.txt` says the asset is CC0/public domain, free for commercial use, and credit is not required. Keep a copied source/license note beside any cropped runtime parts anyway.

## Base character selection

Use **Full body animated characters / Char 4** as the reference, but build the runtime from separated animated body parts so expressions can swap cleanly.

Recommended reference frame:

- `Full body animated characters/Char 4/with hands/idle_0.png`

Why Char 4:

- Smooth round head reads more like a friendly bot/familiar than the hair/horn variants.
- Minimal silhouette is the least fantasy/combat-heavy of the four examples.
- It gives a usable alignment reference for body, head, eyes, mouth, and hands on the shared 2048x2048 canvas.
- It is closest to Brian's liked abstract runtime in character role: simple face, expressive motion, orbit/status effects doing the technical work.

Avoid Char 1-3 as bases:

- Char 1: too emo/fantasy.
- Char 2: too humanoid/hair-avatar.
- Char 3: too punk/aggressive.

## Character assembly concept

Name: **Hermes Runtime Familiar**

Core idea:

- A small floating modular RGS character, centered around x=160, y=205 in the 320x480 coordinate system.
- Use actual RGS PNG parts for head, body, eyes, mouth, and hands.
- Preserve the current abstract runtime's orbiting motes, scan lines, top bar, and bottom status band as environmental/status effects only.
- Use color/tint to make the white RGS parts feel like Hermes hardware: graphite shadows, cyan/teal glow, violet secondary accents, amber/magenta warning accents.

Visual read:

- Cute AI familiar / technical sidekick.
- Compact, round, hovering, watchful.
- Slightly dry personality through eyes, mouth swaps, posture, and orbit behavior.
- Not a game enemy, demon, shooter avatar, or generic dashboard widget.

## Exact RGS parts to use

All paths below are relative to:

`assets/character-candidates/modular-parts/extracted/rgs_modular_vector_characters/Free 2D Animated Vector Game Character Sprites/`

### Primary body and alignment

Use these for first implementation:

- Body: `Animated body parts/Bodies/body1/idle_0.png`
- Head: `Animated body parts/Heads/head1/idle_0.png`
- Left hand: `Animated body parts/Left hands/handL1/idle_0.png`
- Right hand: `Animated body parts/Right hands/handR1/idle_0.png`
- Alignment/reference: `Full body animated characters/Char 4/with hands/idle_0.png`

Use the shared 2048x2048 canvas for initial alignment. For production, crop transparent bounds into an atlas but preserve original anchor metadata.

Observed useful idle-frame bounds from the 2048 source canvas:

- `body1/idle_0.png`: `(928, 1534, 1109, 1732)`
- `head1/idle_0.png`: `(798, 1179, 1232, 1612)`
- `handL1/idle_0.png`: `(1103, 1583, 1237, 1720)`
- `handR1/idle_0.png`: `(799, 1585, 934, 1720)`
- `Char 4/with hands/idle_0.png`: `(798, 1179, 1237, 1785)`

### Eyes

Use RGS eye variants as swappable expression parts. Do not draw custom fake eyes over a finished full-body PNG.

Recommended state mapping:

- Idle/curious: `Animated body parts/Eyes/eyes2/idle_0.png`
- Friendly/default alternate: `Animated body parts/Eyes/eyes1/idle_0.png`
- Thinking/focused: `Animated body parts/Eyes/eyes6/idle_0.png`
- Healthy/smug: `Animated body parts/Eyes/eyes7/idle_0.png`, with low amplitude head lift/nod
- Blocked/annoyed: `Animated body parts/Eyes/eyes3/idle_0.png` or `eyes4/idle_0.png`, held in side-eye pose
- Sleepy/night: `Animated body parts/Eyes/eyes5/idle_0.png` or dimmed `eyes6/idle_0.png`

Blink strategy:

- First pass: quick opacity/scale close-open on the eye image layer, using the existing blink cadence from `renderer-character-svg.js`.
- Better pass: swap to matching animation-frame eye parts if a later worker verifies the frames read correctly.
- Do not use abstract eyelid shapes as the primary expression. A small mask/clip is acceptable only to hide/reveal the actual RGS eye part during blink.

### Mouths

Use RGS mouth variants as expression/speech parts. Avoid custom SVG waveform mouths on the character itself unless Brian explicitly chooses a hybrid style later.

Recommended state mapping:

- Idle/neutral: `Animated body parts/Mouths/mouth4/idle_0.png` or `mouth1/idle_0.png`
- Thinking: `Animated body parts/Mouths/mouth3/idle_0.png` or `mouth7/idle_0.png`
- Healthy/smug: `Animated body parts/Mouths/mouth6/idle_0.png` or `mouth2/idle_0.png`
- Blocked/annoyed: `Animated body parts/Mouths/mouth1/idle_0.png` held flat, optionally `mouth2` for skeptical curve
- Sleepy/night: `Animated body parts/Mouths/mouth3/idle_0.png` or `mouth7/idle_0.png` for a tiny yawn

Avoid:

- `mouth5`: fangs, too monster/fantasy.
- `mouth8`: jagged red monster mouth, too combat/creepy.

### Accessories

Default implementation should use no hair, no horns, no wings, and no weapons.

Allowed only as optional later skin experiments:

- Tiny wing silhouette from `Left wings/wingL1` and `Right wings/wingR1` if heavily dimmed/recolored and used as Hermes messenger/sigil accents, not demon wings.
- No horns in default. If ever used, `horn1`/`horn2` only as tiny antenna-like silhouettes after recolor and scale reduction. Do not use large demonic horns.

Hard avoid:

- All `Right weapons/*`
- Top-level `Weapons/*`
- `Extras/bullet.png`, `Extras/crosshair.png`, `Extras/muzzle.png`
- Death, hit, weapon, roll, and combat-looking full-body animations
- `head3` saw/blade head
- `mouth5`, `mouth8`
- Aggressive horns/wings as default silhouette

## Motion language to preserve from the abstract runtime

The current `src/character-runtime.html` and `src/renderer-character-svg.js` have the best movement/state feel so far. Preserve the state graph and animation grammar, but replace generic SVG anatomy with RGS image layers.

### Runtime structure

Recommended renderer model:

```text
stage 320x480
  background/status effects       existing abstract runtime style allowed
  orbit-back                      existing motes/rings allowed
  character-root                  transform translate/rotate/scale
    body-root                     RGS body + whole-character breath
      shadow/glow                 status effect only
      body-image                  RGS body1
      head-root                   RGS head1 + face layers
        head-image
        eyes-image                current RGS eye variant
        mouth-image               current RGS mouth variant
      left-hand-root              RGS left hand
      right-hand-root             RGS right hand
  orbit-front                     existing motes/rings allowed
  status-band                     current UI, sparse and display-safe
```

### Shared animation primitives

Port these directly from `renderer-character-svg.js`:

- State transition easing: 650-850 ms cubic ease, with a brief color/state flash.
- `breath_core`: sinusoidal root scale and y drift.
- `eye_track`: subtle eye-layer or head offset, not free-floating custom pupils unless using real eye parts.
- `blink_soft`: cadence-driven eye image squeeze/mask.
- `side_eye`: hold head/eyes left for blocked state.
- `impatient_bounce`: blocked-state dip/rebound every 8-18 seconds.
- `dramatic_sigh`: outward ripple from character center, status effect only.
- `scanline_sweep`: thinking-state scan line through the head/face, status effect only.
- `orbit_motes`: existing orbit ellipses and glyph motes, kept as Hermes status layer.
- `orbit_reorder`: motes speed/reorder on state transition.
- `sleep_drift`: slow night-mode random walk within 2-5 px.
- `layout_shift`: tiny burn-in mitigation shift over minutes.

### State mapping

| State | RGS parts | Pose/motion | Effects |
|---|---|---|---|
| `idle_watchful` | `head1`, `body1`, `eyes2`, `mouth4`, hands relaxed | slow breath, 1-3 px float, occasional blink, wandering head/eye offset | cyan/teal dim orbit, sparse motes |
| `thinking_focused` | `eyes6`, `mouth3` or `mouth7` | forward lean, faster gaze cadence, smaller eye aperture, hand lifts slightly | scan sweep, faster orbit, violet/cyan pulse |
| `healthy_smug` | `eyes7`, `mouth6` | posture rises 3-6 px, tiny satisfied nod, slight asymmetry | green/teal calm halo, orbit stable |
| `blocked_annoyed` | `eyes3` or `eyes4`, `mouth1` | side-eye hold, tilt 4-7 degrees, slumped y offset, impatient hand tap/bounce | amber/magenta accent, crossed/clustered motes, dramatic sigh ripple |
| `night_sleepy` | `eyes5` or dim `eyes6`, `mouth3`/`mouth7` | slow drift, half-speed breath, rare yawn mouth swap, reduced scale motion | low brightness, slow orbit, muted top/status text |

## 320x480 composition

Keep the current runtime layout:

- Top bar: y 16-52, tiny state label/health dot.
- Character stage: y 65-345.
- Character center: approximately x=160, y=215.
- Character visible body height after cropping/scaling: 165-210 px.
- Orbit radius: 80-115 px, allowed behind/in front of the character.
- Status band: y 354-460, one caption plus one optional microline.

Recommended character scale:

- Crop from the RGS source to transparent bounds.
- Assemble at source alignment first, then fit group to about 185 px tall in the browser coordinate system.
- Keep eyes readable. If the face feels too small, scale head/face layers up 6-10 percent rather than enlarging the whole body.

## Color and style treatment

RGS parts are mostly white/gray with black outlines. Keep the clean shape but make it feel like Hermes:

- Apply subtle cyan/teal glow to the character group, not a large bright blob.
- Use CSS/SVG/Pixi filters only for tint/glow/status, not to replace missing expression art.
- Dark graphite/navy background remains from the abstract runtime.
- Warning states use amber/magenta locally in eyes, orbit, state dot, and sigh ripple. Avoid full red screens.
- Night mode reduces brightness and orbit opacity rather than turning the display off.

## Guardrails

Do:

- Use actual RGS separated parts for head/body/eyes/mouth/hands.
- Preserve the liked abstract runtime's state machine and motion timing.
- Crop/atlas selected 2048 PNGs before kiosk use.
- Keep source/license notes with copied runtime assets.
- Keep background/status effects abstract, technical, and secondary.

Do not:

- Do not use generic abstract SVG primitives as fallback character anatomy.
- Do not paste fake eyes/mouth overlays onto a finished full-body PNG.
- Do not use tiny low-res sprites.
- Do not use weapons, bullets, crosshairs, muzzle flashes, hit/death/combat poses, or aggressive fantasy accessories.
- Do not let horns/wings define the default silhouette.
- Do not depend on paid editors or external runtimes.
- Do not show sensitive raw task/log content in the status band.

## Implementation handoff

Recommended next engineer task:

1. Copy only the selected RGS PNG parts into a runtime folder, e.g. `src/assets/rgs-hermes/`, plus `SOURCE-LICENSE.md`.
2. Generate cropped PNGs or an atlas from the selected idle parts and keep anchor metadata from the 2048 canvas.
3. Build `renderer-character-rgs.js` as a scene graph parallel to `renderer-character-svg.js`.
4. Reuse the same normalized persona packet/state controls from `character-runtime.html`.
5. Implement the five review states first: idle, thinking, healthy, blocked, night.
6. Keep the existing top bar, orbit motes, scan/sigh effects, bottom status band, and transition timing.
7. Add a local demo page or toggle so Brian can compare the current abstract runtime and the RGS runtime side by side.

## Acceptance criteria

Engineer output is acceptable when:

- At 320x480, Hermes reads as a cute AI familiar/technical sidekick using RGS character parts, not generic abstract shapes.
- The runtime uses separated RGS parts for body, head, eyes, mouth, and hands.
- The five states are visually distinct without changing to unrelated characters.
- `blocked_annoyed` clearly shows side-eye, slumped/tilted posture, impatient motion, and a restrained amber/magenta accent.
- `night_sleepy` is dim, slow, and still visibly alive.
- Orbiting motes, scan sweep, blink cadence, breathing, state flash, and sigh ripple preserve the feel of `src/character-runtime.html`.
- No weapon/combat/death/hit/crosshair/bullet/muzzle assets appear in the runtime.
- No fake expression overlays are pasted onto full-body sprites; expressions come from modular RGS eye/mouth parts, with masks/transforms only for animation.
- Runtime assets are cropped/optimized enough for LAN preview and do not load the raw 72 MB archive.
- A source/license note travels with copied assets.
