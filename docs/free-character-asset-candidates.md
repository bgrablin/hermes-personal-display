# Free Character Asset Candidates

Date: 2026-05-16
Task: `t_4bff5b00`
Target: Hermes Personal Display character, 320x480 portrait browser prototype
Constraint: no paid tools/assets; prefer CC0/Public Domain or clearly permissive licenses; do not download assets until source and license are acceptable.

## 1. BLUF recommendation

Top candidates:

1. **Foozle Cute Platformer Robot**
   - Best immediate browser-prototype candidate.
   - CC0, explicitly free for commercial projects, attribution not required.
   - Has a recognizable cute robot silhouette and four browser-friendly animation loops: idle, jump, walk, run.
   - Strong fit for PixiJS sprite animation at 320x480.

2. **OpenGameArt Gum Bot sprites**
   - Best tiny mascot/familiar option.
   - CC0, compact sprite sheet, charming non-threatening robot shape.
   - Includes blinking, screen flicker, powered-down, walking, surprise, and turn-around sprites.
   - Lower resolution means it needs nearest-neighbor scaling or pixel-art treatment, but that may work well on a 3.5 inch display.

3. **Kenney Robot Pack**
   - Best license-clean kitbash/source-pack option.
   - Kenney asset pages are CC0, attribution not required.
   - Good for building a mascot rig from parts or using a coherent robot visual style, but it is less immediately useful as an animated sprite because the page advertises 50 files, not a ready idle/run sprite sheet.

Use **Foozle Cute Platformer Robot** first if the goal is a recognizable animated character quickly. Use **Gum Bot** if Brian wants a smaller, more mascot-like pixel familiar. Keep **Kenney Robot Pack** as a clean parts/style source rather than the first animated character.

## 2. Candidate details

### Candidate A: Foozle Cute Platformer Robot

Source:
- https://foozlecc.itch.io/cute-platformer-robot

License evidence:
- The itch.io asset page lists the asset license as **Creative Commons Zero v1.0 Universal**.
- The page text says: `License: (Creative Commons Zero, CC0)` and links to `http://creativecommons.org/publicdomain/zero/1.0/`.
- The page further states: `This content is free to use and modify for all projects, including commercial projects. Attribution not required.`
- The page also carries the `No generative AI was used` content label.

Visual/character fit:
- Clear cute robot silhouette, readable as a character rather than decorative shapes.
- Friendly enough for a desk display; not too weaponized or aggressive.
- Likely works well against the existing dark Hermes display direction.
- It is a platformer side-view character, so the next prototype should treat it as a mascot avatar rather than a full front-facing assistant. A side-view robot can still read well if placed in a small stage/terminal scene.

Animation/frame availability:
- Page says it includes **4 animations**: idle, jump, walk, run.
- Also includes individual sprite parts, useful if a later worker wants additional poses or expression variants.

Integration approach:
- Prefer **PixiJS AnimatedSprite** using a texture atlas generated from the sprite frames.
- Use a local state machine to map Hermes states to loops:
  - `idle_watchful` -> idle
  - `working_autonomous` -> walk or run at low speed
  - `thinking_focused` -> idle with procedural head/eye tint overlays if available
  - `blocked_annoyed` -> jump anticipation frame or CSS/Pixi tint/pulse overlay
  - `night_sleepy` -> idle slowed, dimmed, with overlay eyelids if needed
- Avoid CSS-only animation for the character itself unless the asset is packaged as a single GIF. PixiJS gives better control over timing, scaling, state transitions, and future effects.

Attribution:
- Not required under CC0.
- Appreciated text if included voluntarily: `Cute Platformer Robot by Foozle, CC0.`

Assessment:
- **Recommended first pick.** It is the strongest mix of recognizable robot, explicit CC0 terms, no attribution requirement, no AI ambiguity, and ready animation loops.

### Candidate B: OpenGameArt Gum Bot sprites

Source:
- https://opengameart.org/content/gum-bot-sprites

License evidence:
- OpenGameArt page shows the CC0 license icon.
- The page title and file are hosted directly on OpenGameArt as `Gum Bot sprites.png`.
- OpenGameArt comments clarify that the blue robot is the animated one; other colors are available for recoloring.

Visual/character fit:
- Very strong mascot/familiar silhouette: small, cute, boxy robot with a face/screen feel.
- The screen-flicker and blinking states are especially compatible with a Hermes personal display personality.
- Pixel-art style may look intentional and crisp on 320x480 if scaled with nearest-neighbor and framed properly.
- Less visually rich than Foozle, but more distinctive as a desktop gremlin/familiar.

Animation/frame availability:
- Page says it includes turn-around, surprise, walking, blinking, screen flickering, and powered-down sprites.
- Comment by the creator says the blue one is the animated one and the others are recolor bases.
- Single PNG sheet, small file size listed as 3.5 KB.

Integration approach:
- Prefer **PixiJS sprite sheet** with manual frame rectangles or a generated JSON atlas.
- Use nearest-neighbor scaling and no smoothing.
- This can also work as CSS `steps()` animation from a PNG sprite sheet, but PixiJS is still better because Hermes needs state overlays, particles, captions, and future transitions.
- Good fit for a fixed 320x480 stage with the bot at 3x-6x scale plus a terminal/status backdrop.

Attribution:
- Not required under CC0.
- Appreciated text if included voluntarily: `Gum Bot sprites by GrafxKid, CC0, via OpenGameArt.`

Assessment:
- **Recommended second pick.** It may solve Brian's objection better than a custom procedural character because it is immediately readable as a character. Main tradeoff is low resolution/pixel-art style.

### Candidate C: Kenney Robot Pack

Source:
- https://kenney.nl/assets/robot-pack

License evidence:
- Kenney Robot Pack page lists license as **Creative Commons CC0** and links to the CC0 deed.
- Kenney support page says all game assets on Kenney asset pages are public domain licensed CC0, free for commercial projects.
- Kenney support page says attribution is not required; if giving credit, mention `Kenney`, and do not use the Kenney logo.

Visual/character fit:
- Clean robot/character pack from a reputable CC0 asset creator.
- Likely cohesive and safe as a long-term asset dependency.
- More generic than Gum Bot or Foozle. It may need selection, staging, and animation work before it reads as the Hermes mascot.

Animation/frame availability:
- Robot Pack page lists `Files 50x`, but the extracted page evidence does not prove a ready idle animation or sprite sheet.
- Treat as a parts/source pack unless the archive contents are inspected in a later implementation task after approval.

Integration approach:
- If the pack has separate PNG/SVG parts, use **PixiJS Container** rigging: body, arms, eyes/screen, antenna/accessory, shadow.
- If it has complete character poses, use PixiJS textures and small procedural transitions.
- Could also be used as SVG/CSS if the files are SVG and simple, but PixiJS remains the better display runtime because of the existing no-cost stack recommendation.

Attribution:
- Not required.
- If included voluntarily: `Robot Pack by Kenney, CC0.`
- Do not use the Kenney logo in project credits or UI.

Assessment:
- **Recommended third pick / fallback.** Very clean licensing and reputable source, but less clearly ready as an animated mascot from page evidence alone.

### Candidate D: OpenGameArt The Robot - Free Sprite

Source:
- https://opengameart.org/content/the-robot-free-sprite

License evidence:
- OpenGameArt summary lists license as **CC0 / Public Domain**.
- Download listed as `RobotFree.zip`.

Visual/character fit:
- High-detail side-scrolling robot, suitable for action/platformer/shooter/runner contexts.
- More game-character than desk-familiar. It may look too much like a stock platformer player unless heavily staged.
- The source also points to the creator's premium assets, but this specific asset is listed as free/CC0.

Animation/frame availability:
- Summary says separate PNG sequence files and **10 distinct animation states**.
- Good raw material if the project wants more poses than Foozle.

Integration approach:
- PixiJS AnimatedSprite from PNG sequences.
- Convert to a local texture atlas before kiosk use to avoid loading many individual images.

Attribution:
- Not required under CC0.
- Appreciated text if included voluntarily: `The Robot - Free Sprite by pzUH, CC0, via OpenGameArt.`

Assessment:
- **Viable but not top pick.** Strong animation coverage, but less mascot-like and potentially more visually busy for 320x480.

### Candidate E: OpenGameArt Red-Bot Hero

Source:
- https://opengameart.org/content/red-bot-hero

License evidence:
- OpenGameArt page shows the CC0 license icon.
- Search result metadata for the page lists `License(s): CC0`.

Visual/character fit:
- Polished red robot hero. Good readability and strong silhouette.
- More weapon/action-hero flavored than a calm Hermes familiar. Might not match the desired assistant personality unless modified.

Animation/frame availability:
- Page lists: Idle, Run, Run Shoot, Slide, Jump, Flip, Flip Shoot, Hit, Crouch, Crouch Shoot, Death, plus character parts.
- Formats include AI, EPS, FLA, and high-resolution PNG.

Integration approach:
- PixiJS AnimatedSprite for PNG exports.
- Avoid Flash/FLA dependency. Use PNG frames only.
- Potentially useful as a parts reference if the implementation can ignore weapon/combat states.

Attribution:
- Not required under CC0.
- Appreciated text if included voluntarily: `Red-Bot Hero by MikeMac2D, CC0, via OpenGameArt.`

Assessment:
- **Good technical asset, weaker personality fit.** Keep as backup if Foozle/Gum Bot do not satisfy visual taste.

### Candidate F: styloo Robot character

Source:
- https://styloo.itch.io/robot-character

License evidence:
- itch.io page lists asset license as **Creative Commons Zero v1.0 Universal**.
- The author comments: `it's cc0, you can do whatever you want :)` in response to commercial-use/removal questions.
- Page carries `No generative AI was used`.

Visual/character fit:
- Full 3D rigged robot, more sophisticated than a 2D sprite.
- Includes weapon/gun styling and a more action-game tone.
- Not directly a browser sprite candidate unless rendered to 2D frames first. That introduces Blender/export workflow overhead.

Animation/frame availability:
- Page says fully rigged with **11 animations**.
- Provides animated GIF previews.

Integration approach:
- Not recommended for the first browser prototype because it requires a 3D import/render pipeline or live Three.js model handling.
- Could be rendered to transparent PNG sprite sheets later, but that violates the near-term goal of using a browser-ready sprite/character with minimal tooling.

Attribution:
- Not required under CC0.
- Appreciated text if included voluntarily: `Robot character by styloo, CC0.`

Assessment:
- **License-clean but not first-pass practical.** Keep as a later 3D/rendered-sprite option.

## 3. Licensing notes

CC0 source reference:
- https://creativecommons.org/publicdomain/zero/1.0/
- The CC0 deed says the work can be copied, modified, distributed, and performed, even for commercial purposes, without asking permission.
- Caveat: CC0 does not affect patent/trademark/publicity/privacy rights, carries no warranty, and should not imply author endorsement.

OpenGameArt caution:
- OpenGameArt collection-generated credits files can contain warnings and may not be accurate. If any OpenGameArt collection-level credits file is used, manually verify it and remove the generated warning text before shipping.
- For the specific candidates above, prefer the individual asset page license evidence over collection metadata.

itch.io caution:
- Use pages where itch.io's `Asset license` field explicitly says CC0 or where the page text clearly states CC0.
- Avoid generic `free` pages without license fields; free-to-download is not the same as redistributable.

## 4. Integration recommendation

Use this implementation path for the next prototype:

1. Start with **Foozle Cute Platformer Robot**.
2. Build a 320x480 PixiJS stage with local assets only.
3. Convert sprite frames into a local atlas, or manually define frame rectangles if the download already provides sheets.
4. Use a tiny state machine over named loops:
   - `idle_watchful`
   - `thinking_focused`
   - `working_autonomous`
   - `healthy_smug`
   - `blocked_annoyed`
   - `night_sleepy`
5. Add Hermes-specific personality using overlays rather than modifying source art immediately:
   - subtle terminal glow
   - small orbiting motes
   - status caption layer
   - color tint/accent per state
   - blink/eye overlay only if the asset supports it cleanly
6. If Foozle feels too side-scroller/game-like, swap to **Gum Bot** and lean into pixel-art mascot mode.

Recommended runtime remains **PixiJS**, consistent with `docs/animation-stack-no-cost-recommendation.md`. CSS `steps()` can work for a single idle loop, but PixiJS is better for state, particles, scaling, and future transitions. SVG/CSS is best reserved for Kenney-style vector/part rigs if the pack contents support that.

## 5. Assets to avoid for now

Avoid these until proven otherwise:

- AI stock/image sites with vague `free` terms or unclear training/provenance.
- Marketplace assets that are free to download but not redistributable.
- Rive community/marketplace assets unless the exact file export, license, and production rights are verified.
- Assets requiring paid editor/export tooling.
- Character packs that only grant a personal-use license.
- Weapon-heavy or combat-only robots unless Brian explicitly wants that tone.

## 6. Final recommendation

Prototype **Foozle Cute Platformer Robot** first. It is the cleanest combination of recognizable robot character, CC0 license, no-attribution requirement, no generative-AI label, and ready idle/walk/run/jump animations.

If Brian wants a more distinctive familiar instead of a platformer avatar, prototype **Gum Bot** next. It has the stronger mascot feel and screen/blink vocabulary, but the pixel-art resolution is a deliberate aesthetic choice rather than a polished modern character look.
