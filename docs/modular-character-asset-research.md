# Modular character asset research

Date: 2026-05-16
Task: `t_522ddac0`
Target: Hermes Personal Display, 320x480 portrait browser runtime

## BLUF

Best next prototype direction: **SuperBoxBot manually rigged in PixiJS/SVG**, with **RGS modular vector characters** as the best expression-mechanics reference and backup source for swappable eyes/mouths.

Reason: Brian liked the state-machine motion and expression range in `src/character-runtime.html`, but not the abstract SVG art. SuperBoxBot is the best license-clean bridge: it is a cute/recognizable robot, includes separated PNG parts plus SVG/PDF source, and can be animated by transforms without relying on Spine. RGS has richer expression coverage, but the art reads more fantasy/chibi humanoid than Hermes AI familiar.

Contact sheet for review:

- `assets/character-candidates/modular-parts/modular-character-candidates-contact-sheet.png`

Downloaded/evaluated asset roots:

- `assets/character-candidates/modular-parts/downloads/`
- `assets/character-candidates/modular-parts/extracted/`
- `assets/character-candidates/modular-parts/previews/`

## Recommendation

Prototype with **Candidate C: SuperBoxBot** first.

Recommended implementation shape for the next worker:

1. Ignore the bundled Spine project for now.
2. Use `SuperBoxBot_character_sheet.cdr.svg` or the separated PNGs as source parts.
3. Build a small part-rig in PixiJS or inline SVG:
   - body/head container
   - eye whites/iris or LED pupils
   - eyebrows/lids
   - shoulders/arms/hands
   - legs or simplified hover base
   - optional orbit/status overlays from the rejected abstract runtime
4. Port the state-machine behaviors from `src/character-runtime.html`:
   - `idle_watchful`: breathing, wandering gaze, soft blink
   - `thinking_focused`: narrowed eyes, scan sweep, faster orbit
   - `healthy_smug`: raised posture, asymmetric brow, small nod
   - `blocked_annoyed`: side-eye, red tint, slumped/tilted posture, tap/sigh
   - `night_sleepy`: dim palette, half lids, slow drift
5. Add a Hermes-specific palette and small display/status overlays so it does not look like a generic tutorial robot.

Keep **RGS modular vector characters** as a secondary experiment if SuperBoxBot feels too simple. RGS has the strongest raw expression inventory, but likely needs visual adaptation to avoid looking like a fantasy/alien shooter avatar.

## Candidate scorecard

Scale: 5 = strongest for this task, not general asset quality.

| ID | Candidate | License | Visual fit | Part richness | Expression potential | Runtime fit | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| A | RGS_Dev Modular Animated Vector Characters | 5 | 3 | 5 | 5 | 4 | Richest modular expression set, but not robot/familiar-native. |
| B | ColdCoffee robot for skeletal/rig animation | 5 | 4 | 3 | 3 | 3 | Good robot sheet, but single PNG parts sheet needs manual slicing. |
| C | SuperBoxBot character sheet | 5 | 5 | 4 | 4 | 5 | Best fit: cute robot, SVG/PNG parts, no editor lock-in if we ignore Spine. |
| D | BrawlBot | 5 | 3 | 4 | 3 | 4 | Technically strong, but more combat/mecha than friendly AI familiar. |
| E | Kenney Robot Pack | 5 | 3 | 3 | 2 | 5 | Clean/reputable CC0 source, but generic and less expressive. |
| F | Kenney Modular Characters | 5 | 2 | 5 | 5 | 4 | Excellent face parts, but generic human avatar direction. |
| G | Mix and Match Characters | 5 | 3 | 3 | 4 | 4 | Friendly SVG robots/kids; may feel too elementary clip-art. |
| H | Modular 64x Robots | 2 | 3 | 4 | 2 | 3 | Real modular robot parts, but CC-BY-SA and low-res pixel style. |

## Candidates

### A. RGS_Dev / OpenGameArt Free CC0 Modular Animated Vector Characters 2D

Sources:

- https://opengameart.org/content/free-cc0-modular-animated-vector-characters-2d
- https://rgsdev.itch.io/free-cc0-modular-animated-vector-characters-2d

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/rgs_modular_vector_characters.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/rgs_modular_vector_characters/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-a-rgs-modular-vector.png`

License evidence:

- OpenGameArt and itch.io pages list CC0/Public Domain.
- Extracted `License.txt` says: `This asset is under CC0 License`, `Public domain and free to use on any project, even commercial`, and `Credit is not required`.

Included formats/content:

- ZIP, about 72.7 MB from OpenGameArt.
- Local extraction found 2,000 files.
- PNG components on a 2048x2048 canvas.
- Animated body-part folders for bodies, eyes, heads, hair, mouths, hands, feet, wings, horns, and weapons.
- Full-body animated characters with and without hands.
- Animations include idle, walk, roll, jump/fall, hit, and death.
- Itch page notes Inkscape source files are available through Patreon, not in the free ZIP.

Part richness and expression potential:

- Strongest of all candidates for state-machine expression.
- 7 eye variants and 8 mouth variants give direct mappings to mood/state.
- White parts are designed for in-engine recoloring.
- Large canvas gives enough resolution for 320x480.

Risks/gotchas:

- Not inherently a robot or AI familiar. It reads as fantasy/chibi/top-down shooter characters.
- Many assets are weapon/combat-oriented. Avoid weapons for Hermes.
- Free ZIP appears to be PNG-only for runtime use. Source SVG/Inkscape files are not in the free archive.
- Large 2048 parts require cropping/atlas generation before kiosk use.

Assessment:

- Best expression-mechanics reference.
- Good backup if Brian wants a cute imp/creature direction instead of robot.
- Not my top visual recommendation for Hermes as a local technical familiar.

### B. ColdCoffee robot for skeletal/rig animation

Source:

- https://opengameart.org/content/robot-for-skeletalrig-animation

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/coldcoffee_robot_parts.png`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-b-coldcoffee-robot-parts.png`

License evidence:

- OpenGameArt page lists CC0/Public Domain.
- Page text says the asset was corrected from CC-BY to CC0 after a user noticed the mismatch.
- Author text says: `Use it however you want. I don't need credit/attribution.`

Included formats/content:

- Single PNG, `robot_parts.png`, about 300 KB.
- Contains a complete robot reference and every separate part to recompose in Spine, DragonBones, Unity, etc.

Part richness and expression potential:

- Good mechanical body parts for skeletal transforms.
- Robot silhouette is closer to Hermes than RGS.
- Expression potential is moderate because there are not many alternate eyes/mouths/brows.

Risks/gotchas:

- Single sheet means a next worker must slice/crop parts manually before runtime use.
- The art is more futuristic/mech than cute familiar.
- Page says suitable only for rig/bones/skeletal animation, not a ready spritesheet.

Assessment:

- Worth keeping as a robot parts source if SuperBoxBot is too simple.
- Less immediately expressive than SuperBoxBot or RGS.

### C. SuperBoxBot character sheet and Spine setup

Source:

- https://opengameart.org/content/superboxbot-character-sheet-and-spine-setup

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/superboxbot_character_sheet.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/superboxbot_character_sheet/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-c-superboxbot-parts.png`

License evidence:

- OpenGameArt page lists CC0/Public Domain.
- Web extraction and page text identify the asset as CC0.

Included formats/content:

- ZIP, about 226.7 KB.
- Local extraction found 29 files.
- Includes separated PNG parts: `head.png`, `body.png`, eyes, irises, eyebrows, shoulders, hands, legs, etc.
- Includes `SuperBoxBot_character_sheet.cdr.svg` and `SuperBoxBot_character_sheet.pdf`.
- Includes `SuperBotBox_v02.spine`, but this should be treated as optional/reference only.

Part richness and expression potential:

- Strong for a compact robot familiar.
- Separate eyes, irises, and eyebrows support side-eye, blink/lid simulation, smug brow, annoyed brow, sleepy state, and scan/focus behavior.
- Separate shoulders/hands/legs support wave, shrug, tap, slump, nod, recoil, and lean gestures.
- Vector source gives a clean path to recolor and adapt to Hermes branding.

Risks/gotchas:

- Original setup is a Spine tutorial asset. Avoid relying on Spine as a paid/editor workflow.
- The built-in art is simple and may need Hermes-specific overlays to feel intentional rather than tutorial-derived.
- Some individual parts have weak standalone visual read; the value is in the assembled rig.

Assessment:

- Best overall candidate.
- It matches the requirement to preserve state-machine expressiveness while replacing abstract SVG art with a recognizable robot.

### D. BrawlBot

Source:

- https://opengameart.org/content/robot-sprite-brawlbot

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/brawlbot_package.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/brawlbot_package/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-d-brawlbot-parts.png`

License evidence:

- OpenGameArt page lists CC0/Public Domain.
- Extracted `License.txt` says: `Brawlbot is distributed with a cc0 license. Free for personal and commercial use ( Do whatever you want! )`.

Included formats/content:

- ZIP, about 5.1 MB.
- Local extraction found 44 files.
- Separate PNGs for head, chest, abdomen, pelvis, collar, upper/fore arms, fists, thighs, knees, shins, feet.
- Includes `BrawlBot.scml`, a Spriter-style project file.
- Includes preview GIFs.

Part richness and expression potential:

- Strong mechanical body rig potential.
- Good for walking/posing/gestures.
- Weak facial expression range compared with SuperBoxBot/RGS because the face is not built around eyes/brows/mouth variants.

Risks/gotchas:

- Visual tone is combat/mecha/brawler, not calm local assistant.
- More complex anatomy increases rigging time.
- SCML is useful as a reference, but do not require Spriter or another editor in the runtime path.

Assessment:

- Technically clean and useful, but personality fit is weaker.
- Keep as backup if Brian wants a more detailed robot and is comfortable softening the style.

### E. Kenney Robot Pack

Sources:

- https://kenney.nl/assets/robot-pack
- https://opengameart.org/content/robot-pack

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/kenney_robot_pack.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/kenney_robot_pack/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-e-kenney-robot-pack.png`

License evidence:

- Kenney page lists Creative Commons CC0.
- Extracted `License.txt` says personal and commercial use are allowed, credit is nice but not mandatory.

Included formats/content:

- ZIP, about 369 KB.
- Local extraction found 63 files.
- PNG side view and top view robot parts/poses.
- Spritesheets and XML.
- SVG vector source files for top and side views.

Part richness and expression potential:

- Good technical fit and very clean license provenance.
- Robot body/treads are easy to animate with transforms.
- Expression range is limited unless we add custom eye/status overlays.

Risks/gotchas:

- Generic Kenney look. It may feel like a placeholder without custom Hermes treatment.
- Less expressive than SuperBoxBot because it lacks dedicated brows/lids/mouth variants.

Assessment:

- Safest fallback asset source.
- Best used as kitbash/base geometry, not as the final persona without overlays.

### F. Kenney Modular Characters

Sources:

- https://kenney.nl/assets/modular-characters
- https://opengameart.org/content/modular-character-pack

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/kenney_modular_characters.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/kenney_modular_characters/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-f-kenney-modular-human.png`

License evidence:

- Kenney page lists Creative Commons CC0.
- Extracted `license.txt` says CC0 and permits personal/commercial projects; credit is nice but not mandatory.

Included formats/content:

- ZIP, about 1.8 MB.
- Local extraction found 456 files.
- PNG parts, spritesheets/XML, and vector files.
- Face categories include complete faces, eyes, eyebrows, mouths, noses, etc.

Part richness and expression potential:

- Excellent for face/expression mechanics.
- Strong source for how to structure swappable eyebrows/eyes/mouths.

Risks/gotchas:

- Human-avatar direction conflicts with the goal to avoid generic human avatar if possible.
- Could be useful as an expression-parts donor or layout reference, but not as Hermes' main character.

Assessment:

- Strong reference, weak final visual fit.

### G. Mix and Match Characters

Source:

- https://opengameart.org/content/mix-and-match-characters

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/mixandmatch2020.svg`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-g-mix-and-match-svg.png`

License evidence:

- OpenGameArt page shows CC0 license.

Included formats/content:

- Single SVG file, about 300 KB.
- Collection of simple kid characters, robots, and an alien/squid monster.
- Hair and facial expressions can be swapped between characters.

Part richness and expression potential:

- Good for a simple SVG/CSS runtime.
- Robot characters exist, and the facial expression swapping concept maps well to the rejected runtime.

Risks/gotchas:

- Visual style skews elementary/kid clip-art.
- Large monolithic SVG would need extraction and grouping before runtime use.
- Less polished as a Hermes familiar than SuperBoxBot.

Assessment:

- Useful if Brian wants a softer/cartoonier direction.
- Not the strongest primary candidate.

### H. Modular 64x Robots

Source:

- https://opengameart.org/content/modular-64x-robots

Local files:

- Download: `assets/character-candidates/modular-parts/downloads/modular_64x_robots.zip`
- Extracted: `assets/character-candidates/modular-parts/extracted/modular_64x_robots/`
- Preview: `assets/character-candidates/modular-parts/previews/candidate-h-modular-64x-robots.png`

License evidence:

- OpenGameArt page shows CC-BY-SA, not CC0.
- Extracted `treadbots_README.txt` says the assets are licensed CC-BY-SA 4.0 and require attribution plus share-alike for derivatives.

Included formats/content:

- ZIP, about 51.7 KB.
- Local extraction found 29 files.
- 27 aligned 64x64 PNG parts plus Aseprite source.
- Parts include tracks, bodies, heads, side attachments, and back attachments.

Part richness and expression potential:

- Real modular robot construction kit.
- Low-res pixel style could work if the whole display adopts pixel art.
- Expression range is limited without adding custom eyes/lids/mouths.

Risks/gotchas:

- CC-BY-SA share-alike is the main problem. It complicates downstream derivative licensing and should not be mixed into a CC0-first asset base unless Brian explicitly accepts that constraint.
- 64x64 grid is small for high-res expressive runtime unless scaled as intentional pixel art.

Assessment:

- Good visual reference, poor license fit.
- Do not use in the prototype unless Brian explicitly accepts CC-BY-SA.

## Evidence and verification performed

Local evidence:

- Downloaded the candidate assets under `assets/character-candidates/modular-parts/downloads/`.
- Extracted ZIPs under `assets/character-candidates/modular-parts/extracted/`.
- Read local license files for RGS, Kenney Robot Pack, Kenney Modular Characters, BrawlBot, and Modular 64x Robots.
- Generated candidate preview cards and a combined contact sheet.
- Ran visual QA on the generated contact sheet with vision tooling. Second pass was readable enough; remaining minor issue is low contrast for dark assets in Kenney human and Modular 64x cards.

Source evidence:

- RGS/OpenGameArt page: CC0, 2048x2048 canvas, separated animated body parts, white parts for recoloring.
- RGS/itch page: CC0, free/commercial use, no credit required; notes Inkscape source via Patreon.
- Kenney Robot Pack page: Creative Commons CC0, 50 files.
- Kenney Modular Characters page: Creative Commons CC0, 425 files.
- SuperBoxBot page: CC0, Inkscape SVG/PDF, separated PNGs, Spine project.
- ColdCoffee robot page: CC0, separate parts in one PNG for Spine/DragonBones/Unity-style rigging.
- BrawlBot page and extracted license: CC0, separate PNGs and SCML.
- Mix and Match page: CC0, SVG with swappable hair/facial expressions, including robots.
- Modular 64x Robots page/readme: CC-BY-SA 4.0, not ideal.

## Risks/gotchas

- **Do not equate free download with usable license.** This research keeps the strongest picks CC0-first and flags the CC-BY-SA candidate.
- **Avoid paid editor lock-in.** SuperBoxBot includes Spine, and BrawlBot includes SCML, but both have directly usable separated PNGs. Use editor files as references only.
- **Avoid weapon/combat tone.** RGS, BrawlBot, and some robot packs include weapons or action-combat associations. Hermes should stay calm, cute, and operator-like.
- **License provenance should travel with assets.** If a next worker copies parts into `src/assets`, copy a concise `SOURCE-LICENSE.md` next to them.
- **Runtime should not load huge raw archives.** Crop/atlas selected parts before kiosk use.
- **SuperBoxBot still needs art direction.** Add Hermes colors, screen/status overlays, and maybe the orbit/status motes from the abstract runtime.

## Open questions

- Does Brian prefer the **boxy robot** direction (SuperBoxBot) or the **imp/creature** direction (RGS-like) for Hermes' familiar?
- Should the character be side-on/mascot stage, front-facing assistant, or a hybrid with body facing forward and eyes tracking the viewer?
- Is CC-BY-SA categorically excluded, or just lower preference? I recommend excluding it for now.

## Implementation handoff

Recommended next card for an engineer/integrator:

- Title: `display: prototype SuperBoxBot modular runtime`
- Assignee: engineer/integrator profile
- Scope:
  - Copy selected SuperBoxBot PNG/SVG parts into `src/assets/superboxbot-hermes/` with `SOURCE-LICENSE.md`.
  - Build a no-backend browser route that renders the parts as a scene graph in PixiJS or inline SVG.
  - Reuse persona packet/state controls from `src/character-runtime.html`.
  - Implement at least idle/thinking/blocked/night states with eyes/brows/pose transforms.
  - Do not use Spine runtime or require Spine editor.
- Avoid:
  - Pulling in CC-BY-SA assets.
  - Using weapon/combat parts.
  - Treating the first asset crop as final art direction.
