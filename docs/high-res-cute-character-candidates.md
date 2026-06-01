# Higher-res cute character candidates

Date: 2026-05-16
Task: `t_f7dbe611`
Target: Hermes Personal Display character, 320x480 portrait browser prototype

## BLUF

The strongest two non-heavy-pixel options are:

1. **Kenney Robot Pack, side-view robot parts**
   - Best practical next prototype if Brian wants license-clean, polished, non-pixel robot art.
   - CC0 from a highly reputable asset source, includes PNG plus vector/source-style assets, and can be rigged/animated locally.
   - Main tradeoff: generic game-robot look unless we add Hermes-specific screen/eye/status overlays.

2. **Foozle Cute Platformer Robot**
   - Best immediately cute animated character if the side-scroller silhouette is acceptable.
   - CC0, animated, readable, daughter-friendly, and less pixel-heavy than Gum Bot.
   - Main tradeoff: looks more like a platformer avatar than a dry local-operator familiar.

If Brian wants the most characterful vector-rig option rather than fastest implementation, **SuperBoxBot** is the interesting dark horse. It has a boxy cute face, separated PNG parts, and SVG source, but needs custom rigging and possibly cleanup.

Contact sheet:

- `assets/character-candidates/high-res-cute-contact-sheet.png`

Preview images collected:

- `assets/character-candidates/previews/candidate-a-kenney-blue-drive.png`
- `assets/character-candidates/previews/candidate-b-kenney-top-blue.png`
- `assets/character-candidates/previews/candidate-source-foozle-cute-platformer-robot.png`
- `assets/character-candidates/previews/candidate-source-oga-superboxbot.jpg`
- `assets/character-candidates/previews/candidate-f-mix-and-match-svg.png`
- `assets/character-candidates/previews/candidate-e-the-robot-idle.png`
- `assets/character-candidates/previews/candidate-source-oga-platformer-sprites.png`
- `assets/character-candidates/previews/candidate-source-styloo-robot-character.jpg`

## Candidate scoring

Scale: 5 = strongest. Scores are fit-for-this-display, not general art quality.

| ID | Candidate | License confidence | Visual fit | Implementation fit | Notes |
|---|---|---:|---:|---:|---|
| A | Kenney Robot Pack, side-view robot | 5 | 4 | 4 | Best license-clean polished 2D source; needs personality overlays. |
| B | Kenney Robot Pack, top/front-ish robot | 5 | 3 | 4 | Useful if Brian wants a frontal/display-facing mascot, but less expressive. |
| C | Foozle Cute Platformer Robot | 5 | 4 | 5 | Ready animated cute robot; side-scroller style is the main aesthetic question. |
| D | SuperBoxBot | 5 | 4 | 3 | Strong boxy familiar potential; needs custom rigging/cleanup. |
| E | Mix and Match Characters robots | 5 | 3 | 3 | Simple SVG kid-character style; may skew too childish/generic. |
| F | The Robot - Free Sprite | 5 | 2 | 4 | High-res and animated, but action/combat robot tone is weaker for Hermes. |
| G | Platformer Sprites / Roborunner kit | 4 | 2 | 2 | CC0 pack with robot assets, but visually cluttered and less mascot-ready. |
| H | styloo Robot Character | 5 | 3 | 2 | Polished 3D source; too much pipeline overhead for first browser prototype. |

## Candidates

### A. Kenney Robot Pack, side-view robot

Source:

- https://kenney.nl/assets/robot-pack
- Mirrored OpenGameArt page: https://opengameart.org/content/robot-pack

License evidence:

- Kenney Robot Pack page lists `License: Creative Commons CC0`.
- Kenney support page says all game assets on Kenney asset pages are public domain licensed CC0 and free for commercial projects.
- Kenney support page says attribution is not required; if crediting, mention `Kenney` and do not use the Kenney logo.
- Creative Commons CC0 deed says the work can be copied, modified, distributed, and performed, even commercially, without asking permission.

Collected preview:

- `assets/character-candidates/previews/candidate-a-kenney-blue-drive.png`

Visual fit:

- Clean, rounded, readable robot body with treads.
- Less pixelated than Gum Bot and should scale cleanly on 320x480.
- Blue/silver palette fits the existing Hermes display direction.
- It is cute enough, but not inherently distinctive. It needs Hermes-specific overlays: screen glow, small terminal caption, subtle status particles, dry expression changes.

Implementation fit:

- Strong. Pack includes PNG side/top views, spritesheets, and vector source according to OpenGameArt summary and local archive inspection from the source ZIP.
- Best path is PixiJS Container rigging or simple frame/part switching:
  - body base
  - treads/drive pose
  - eye/status light overlay
  - small antenna/head bob
  - display state tint

Tradeoff:

- Safest and cleanest technically, but risks feeling like a generic placeholder unless art direction is added.

### B. Kenney Robot Pack, top/front-ish robot

Source:

- https://kenney.nl/assets/robot-pack
- https://opengameart.org/content/robot-pack

License evidence:

- Same as Candidate A: Kenney Robot Pack is CC0; attribution not required.

Collected preview:

- `assets/character-candidates/previews/candidate-b-kenney-top-blue.png`

Visual fit:

- More display-facing than the side-view robot, which may work better for a personal dashboard mascot.
- Still simple and modular, but less expressive than Candidate A or SuperBoxBot.
- Could be staged as a tiny operator drone hovering over status panels.

Implementation fit:

- Strong if used as a simple icon/mascot layer.
- Less suitable for rich character animation unless we build procedural movement around it.

Tradeoff:

- Better frontal relationship with the viewer, weaker character read.

### C. Foozle Cute Platformer Robot

Source:

- https://foozlecc.itch.io/cute-platformer-robot

License evidence:

- itch.io page lists Creative Commons Zero v1.0 Universal / CC0.
- Page text says the content is free to use and modify for all projects, including commercial projects, and attribution is not required.
- Page also states no generative AI was used.

Collected preview:

- `assets/character-candidates/previews/candidate-source-foozle-cute-platformer-robot.png`

Visual fit:

- Very cute, rounded, clean, readable silhouette.
- Less pixel-heavy than Gum Bot.
- Likely good for family-friendly sidekick energy.
- Strongest immediate “friendly robot” look, but it reads like a side-scrolling game avatar rather than a front-facing local operator.

Implementation fit:

- Excellent. Page lists four animations: idle, jump, walk, run, plus individual sprite parts.
- Best path is PixiJS AnimatedSprite with a small Hermes state machine.

Tradeoff:

- Easiest animated win. The aesthetic risk is that it may look too much like a platformer character dropped into a dashboard.

### D. SuperBoxBot character sheet and Spine setup

Source:

- https://opengameart.org/content/superboxbot-character-sheet-and-spine-setup

License evidence:

- OpenGameArt page shows CC0/Public Domain.
- Extracted page text identifies the asset as CC0 and lists SVG, PDF, separated PNG parts, and a Spine project.

Collected preview:

- `assets/character-candidates/previews/candidate-source-oga-superboxbot.jpg`

Visual fit:

- Boxy robot with expressive eyes. Stronger “familiar” potential than the generic Kenney robots.
- Clean vector-style art, not heavy pixel art.
- Good match for a dry assistant if we make the face slightly unimpressed/sleepy rather than hyper-cute.

Implementation fit:

- Moderate. The pack includes separated PNG parts and SVG source, but the included Spine project is not useful unless we use Spine tooling/runtime, which is not recommended for this no-cost browser path.
- Best path is to ignore Spine and rig parts manually in PixiJS or SVG/CSS.

Tradeoff:

- Most promising for a custom Hermes persona, but more work than Kenney/Foozle.

### E. Mix and Match Characters robots

Source:

- https://opengameart.org/content/mix-and-match-characters

License evidence:

- OpenGameArt page shows the CC0 license icon.
- Page describes a collection of simple SVG kid characters, including a few robots and an alien squid monster.
- It provides the SVG file directly: `mixandmatch2020.svg`.

Collected preview:

- `assets/character-candidates/previews/candidate-f-mix-and-match-svg.png`

Visual fit:

- Friendly, simple, child-safe, and vector-native.
- Cute enough, but may skew too elementary-school clip-art for Hermes.
- Useful as a parts/style reference if Brian wants a softer, less game-like mascot.

Implementation fit:

- Moderate. SVG is easy to embed and recolor, but animation would require selecting/extracting specific robot elements from the large SVG and then animating groups.

Tradeoff:

- License and friendliness are strong. Personality fit is questionable.

### F. The Robot - Free Sprite

Source:

- https://opengameart.org/content/the-robot-free-sprite

License evidence:

- OpenGameArt page lists CC0/Public Domain.
- Extracted page text says the asset is CC0, with separate PNG sequence files and 10 animation states.

Collected preview:

- `assets/character-candidates/previews/candidate-e-the-robot-idle.png`

Visual fit:

- High-resolution and polished.
- Too action-game/combat-oriented for Hermes as a calm local operator.
- Weapon/shooter associations are a poor match for “cute sidekick Brian’s daughter might like.”

Implementation fit:

- Strong technically. PNG sequences are browser-friendly with PixiJS.
- Would need heavy curation to avoid combat states and reduce hero/shooter tone.

Tradeoff:

- Technically good, personality weak.

### G. Platformer Sprites / Roborunner kit

Source:

- https://opengameart.org/content/platformer-sprites

License evidence:

- OpenGameArt page lists CC0/Public Domain.
- Extracted page text describes a complete kit with 2D sprites, robots/mechs/characters, environment, UI, 3D assets, and SVG files.
- Caveat: page says some pieces were borrowed from CC0 resources. That is probably acceptable because the page is CC0, but it is less clean than Kenney/Foozle/SuperBoxBot as a single-purpose character source.

Collected preview:

- `assets/character-candidates/previews/candidate-source-oga-platformer-sprites.png`

Visual fit:

- Has robot/platformer material, but preview is cluttered and less polished as a single mascot.
- More useful as background UI/lab/factory dressing than a primary Hermes character.

Implementation fit:

- Weak-to-moderate. Requires digging through a broad pack and extracting a usable character.

Tradeoff:

- Could support the scene, but should not be the primary mascot pick.

### H. styloo Robot Character

Source:

- https://styloo.itch.io/robot-character

License evidence:

- itch.io page lists Creative Commons Zero v1.0 Universal.
- Page says no generative AI was used.
- Extracted page text and author comments indicate CC0, commercial use permitted, and “you can do whatever you want.”

Collected preview:

- `assets/character-candidates/previews/candidate-source-styloo-robot-character.jpg`

Visual fit:

- Polished 3D model with a screen-like body and enough personality to be interesting.
- Some weapon/combat styling, but less obviously aggressive in neutral/hello poses.
- Could become a strong Hermes avatar if rendered to 2D with a consistent orthographic style.

Implementation fit:

- Weak for this immediate task. It requires Blender/rendering or a live 3D pipeline.
- Browser use is possible via GLTF/Three.js, but that is unnecessary complexity for the small 320x480 display.

Tradeoff:

- Good later 3D/rendered-sprite option; not a first prototype candidate.

## Recommendation

Prototype in this order after Brian reviews the contact sheet:

1. **Kenney Robot Pack side-view robot**, if Brian wants polished, license-clean, simple, and not-heavy-pixel.
   - Use the blue/silver robot as the base.
   - Add Hermes identity through overlay and staging, not source-art edits first:
     - tiny terminal/status panel
     - eye/screen glow
     - small “operator annoyed” brow/tilt
     - blue/amber/red state colors
     - idle tread bob and subtle hover/shadow

2. **Foozle Cute Platformer Robot**, if Brian wants “cute animated sidekick” first and accepts the side-view platformer style.
   - Fastest route to an animated prototype.
   - Use idle/walk/run loops as Hermes states.
   - Keep the scene constrained so it does not look like a generic platformer game.

3. **SuperBoxBot**, if Brian likes the boxy familiar look and is willing to fund one extra implementation pass for custom rigging.
   - Ignore Spine tooling.
   - Use SVG/PNG parts in PixiJS or SVG/CSS.
   - This is the best route for a distinctive Hermes character, but not the fastest.

## Assets to avoid as primary choices

- **The Robot - Free Sprite**: high-res and useful, but too combat/action-coded.
- **Platformer Sprites / Roborunner kit**: good CC0 scene material, weak as a primary mascot.
- **styloo Robot Character**: promising but too much 3D/rendering overhead for this prototype.
- Any asset page that is only “free download” without an explicit license field or clear redistribution terms.

## Evidence and source notes

- Kenney Robot Pack page: lists 50 files and Creative Commons CC0.
- Kenney support page: confirms Kenney asset-page game assets are CC0/public domain, commercial use allowed, attribution not required, and Kenney logo should not be used.
- OpenGameArt Robot Pack page: confirms Kenney author, CC0, PNG files, spritesheets, side/top views, and vector source files.
- Foozle Cute Platformer Robot page: CC0, attribution not required, commercial use allowed, no generative AI label, four animations.
- OpenGameArt SuperBoxBot page: CC0, SVG/PDF/separated PNG parts, Spine project.
- OpenGameArt Mix and Match Characters page: CC0 icon and downloadable SVG with simple kid characters including robots.
- OpenGameArt The Robot page: CC0/Public Domain, high-res PNG sequences, 10 animation states.
- Creative Commons CC0 deed: copy/modify/distribute/perform, even commercially, without asking permission; patent/trademark/publicity/privacy rights are not affected and no endorsement should be implied.

## Open questions for Brian review

1. Does he prefer a **side-view mascot** that lives in a little scene, or a **front-facing familiar** that looks back at the viewer?
2. Does he want Hermes to skew **cute daughter-friendly** or **dry operator gremlin**? Those point to Foozle vs SuperBoxBot/Kenney overlays.
3. Is “generic but clean” acceptable if the personality comes from animation and overlays, or does the base character itself need to be distinctive?
