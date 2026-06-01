# Broader modular character asset research

Date: 2026-05-16
Task: `t_35e8c8e5`
Target: Hermes Personal Display, 320x480 portrait local browser runtime
Scope: personal/local use; CC0 no longer mandatory; free/personal-use/noncommercial/low-cost assets considered; no pirated assets; no paid runtime/editor lock-in.

## BLUF

Recommendation: **do not continue RGS as the primary art direction. Keep SuperBoxBot as the best no-cost primary candidate unless Brian wants to buy a more polished robot pack, in which case the strongest upgrade path is CraftPix/Wahyuprot-style vector robot packs used only as exported PNG/vector parts, not through Spriter/Spine/DragonBones runtime.**

RGS remains the best expression-mechanics reference, but it is still visually off-target: fantasy/chibi modular avatar parts with combat baggage, not a recognizable Hermes AI familiar. The broader search found better robot/familiar candidates, but the better-looking packs either have weaker face-expression part separation, are combat/enemy themed, or are paid/download-gated.

Contact sheet:

- `assets/character-candidates/modular-parts-broader/broader-modular-character-candidates-contact-sheet.png`

Local artifacts:

- `assets/character-candidates/modular-parts-broader/previews/`
- `assets/character-candidates/modular-parts-broader/source-page-snapshots/candidate-sources.json`

## Recommendation

Use this decision tree:

1. **If no-cost and low-license-friction matter most:** switch from RGS to **SuperBoxBot**.
   - It has CC0 provenance, separated PNG parts, SVG/PDF source, brows/eyes/hands, and enough resolution for a 320x480 runtime.
   - Ignore the bundled Spine file. Treat it as reference only.
2. **If Brian is willing to accept a marketplace license and possible login/purchase friction:** evaluate **GameDevMarket Animated robot game sprite** first, then **CraftPix Free Robot Sprite**.
   - GameDevMarket’s free robot is mechanically promising: PNG/GIF/SCML/AI/EPS, Spriter-originated, free under GDM Pro License.
   - CraftPix Free Robot Sprite is visually more polished and includes PNG/SCML plus vector-source lineage, but its face/expression range is weaker without custom overlays.
3. **Do not choose RGS as final art unless Brian wants a creature/imp avatar instead of a robot.**
   - Keep RGS as a reference for state mapping: blink, gaze, mouth variants, side-eye, posture shifts.

## Candidate scorecard

Scale: 5 = strongest for this Hermes display task, not general art quality.

| ID | Candidate | Cost/license fit | Visual fit | Part/rigger fit | Expression potential | Runtime fit | Overall | Call |
|---|---|---:|---:|---:|---:|---:|---:|---|
| A | RGS modular vector characters | 5 | 3 | 5 | 5 | 4 | 4.0 | Baseline/reference, not primary |
| B | SuperBoxBot | 5 | 4 | 4 | 4 | 5 | 4.4 | Best no-cost primary candidate |
| C | CraftPix Free Robot Sprite | 4 | 4 | 3 | 2 | 4 | 3.4 | Good polished robot donor, needs custom face overlays |
| D | CraftPix Flying Robot 2D Sprites | 2 | 4 | 4 | 2 | 4 | 3.2 | Strong drone option, but paid/combat-ish |
| E | CraftPix Boss Robot 2D Sprites | 2 | 2 | 4 | 2 | 4 | 2.8 | Technically rich, wrong combat/boss tone |
| F | Wahyuprot 3 Robot Character Sheets | 2 | 4 | 5 | 3 | 4 | 3.6 | Best polished paid candidate, if purchase is acceptable |
| G | GameDevMarket Animated robot game sprite | 4 | 4 | 4 | 3 | 4 | 3.8 | Best non-CC0 marketplace candidate to inspect next |
| H | Kenney Robot Pack | 5 | 3 | 3 | 2 | 5 | 3.6 | Safest fallback/kitbash source |
| I | Mix and Match SVG characters | 5 | 3 | 3 | 4 | 4 | 3.8 | Soft SVG direction, not polished enough as final |

## Candidates

### A. RGS modular vector characters baseline

Sources:

- https://rgsdev.itch.io/free-cc0-modular-animated-vector-characters-2d
- https://opengameart.org/content/free-cc0-modular-animated-vector-characters-2d

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-a-rgs-modular-vector-characters.png`

License/source notes:

- Prior task verified CC0/Public Domain on OpenGameArt and itch.
- Extracted `License.txt` in the prior local archive says CC0, public domain, free for commercial use, no credit required.

Formats/technical fit:

- Prior local extraction found many 2048x2048 PNG body-part frames.
- Parts cover bodies, eyes, heads, mouths, hands, feet, wings, horns, and weapons.
- Strong state-machine mechanics: eyes, mouths, posture, hit/roll/death/walk/idle animation references.

Visual fit:

- Still weak as Hermes final art. It reads fantasy/chibi/top-down shooter more than local AI familiar.
- Combat parts and weapons must be excluded.

Assessment:

- Use as expression reference only unless Brian explicitly prefers a creature/imp mascot.

### B. SuperBoxBot

Source:

- https://opengameart.org/content/superboxbot-character-sheet-and-spine-setup

Local artifacts:

- `assets/character-candidates/modular-parts-broader/previews/candidate-b-superboxbot.png`
- Prior extracted files remain under `assets/character-candidates/modular-parts/extracted/superboxbot_character_sheet/`

License/source notes:

- Prior research verified OpenGameArt page lists CC0/Public Domain.

Formats/technical fit:

- Separated PNG parts for head, body, eyes, irises, eyebrows, shoulders, hands, legs.
- Includes `SuperBoxBot_character_sheet.cdr.svg` and PDF source.
- Includes a Spine file, but use that only as reference to avoid runtime/editor lock-in.

Visual fit:

- Best no-cost fit: cute recognizable robot, simple enough for 320x480, expressive enough for Brian’s liked runtime states.
- Needs Hermes-specific styling so it does not look like a tutorial robot.

State mapping:

- Breathing: torso/head container scale/translate.
- Gaze/blink/side-eye: iris + lid/brow transforms.
- Thinking: narrowed eyes, scan overlay, faster idle jitter.
- Blocked/annoyed: side-eye, red tint, slumped/tilted posture, hand tap.
- Sleepy: dim palette, half lids, slow drift.

Assessment:

- Best primary candidate under no-cost/no-lock-in constraints.

### C. CraftPix Free Robot Sprite / Free Game Assets itch mirror

Sources:

- https://free-game-assets.itch.io/free-2d-robot-sprite
- https://craftpix.net/freebies/free-robot-sprite/
- https://craftpix.net/file-licenses/

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-c-craftpix-free-robot-sprite.png`

License/source notes:

- Itch page exposes free download and links to CraftPix license.
- Page comments state commercial use is allowed and point to CraftPix file licenses.
- CraftPix freebie license allows personal and commercial projects, modification, inclusion in games/apps/websites/printed materials, and no required attribution.
- Restrictions: do not resell/source-redistribute assets, do not create apps/templates that let users extract the artwork, and do not use assets for AI/ML training.

Formats/technical fit:

- CraftPix page says the free pack includes 3 robot characters, AI/EPS vector files, SCML Spriter files, PNG animations, and body parts.
- Itch page summary says PNG files and SCML files are included.

Visual fit:

- More polished robot art than SuperBoxBot.
- Reads enemy/platformer robot, not necessarily cute assistant.

Riggability/expression:

- Good body/limb rig source.
- Weak facial expression inventory. Would need Hermes-owned eye/lid/mouth overlay added in JS/SVG.

Assessment:

- Good secondary donor if SuperBoxBot feels too simple. Not obviously better for state-machine expression without custom facial overlays.

### D. CraftPix Flying Robot 2D Sprites

Sources:

- https://free-game-assets.itch.io/flying-robot-2d-sprites
- https://craftpix.net/file-licenses/

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-d-craftpix-flying-robot-2d-sprites.png`

License/source notes:

- Current itch listing is paid/download-gated at $0.70 sale price from $7.00, not free.
- CraftPix license would allow use in personal/commercial projects if acquired, with no source redistribution/extraction and no AI training.

Formats/technical fit:

- Page reports AI/EPS vector files, SCML Spriter project files, PNG animations, and PNG body parts.
- Large 329 MB package.

Visual fit:

- Strongest drone/hovering-familiar silhouette from this pass.
- Could map nicely to a 320x480 portrait display without legs.

Riggability/expression:

- Great for hover/bob/scan/alert motions.
- Face/expression range appears limited, so use custom eye/visor overlays.

Assessment:

- Interesting if Brian wants Hermes to be a floating drone familiar. Paid/download-gated and action-oriented, so not the default pick.

### E. CraftPix Boss Robot 2D Sprites

Sources:

- https://free-game-assets.itch.io/boss-robot-2d-sprites
- https://craftpix.net/file-licenses/

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-e-craftpix-boss-robot-2d-sprites.png`

License/source notes:

- Current itch listing is paid/download-gated at $0.60 sale price from $6.00.
- CraftPix license is usable for games/projects after acquisition, but prohibits source redistribution/extraction and AI training.

Formats/technical fit:

- Page reports AI/EPS vector source, SCML animation files, PNG sequences, and individual body parts.
- Large 721 MB package.

Visual fit:

- Too boss/combat/mecha for Hermes unless heavily softened.
- Good technical asset, wrong personality.

Assessment:

- Do not use as primary. Only useful as a rigging/reference example.

### F. Wahyuprot 3 Robot Character Sprite Sheets

Sources:

- https://wahyuprot.itch.io/3-robot-character-sprite-sheets
- Related GDM/wahyuprot listing pattern: https://www.gamedevmarket.net/asset/robot-dragon-character-sprites

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-f-wahyuprot-3-robot-character-sheets.png`

License/source notes:

- Itch listing is paid at $5.00, not a free/personal-use pack.
- Page says no generative AI was used.
- If using the GameDevMarket route for similar wahyuprot assets, the GDM Pro License permits unlimited commercial/noncommercial media products but forbids raw asset redistribution, end-user extraction, NFT use, and AI training.

Formats/technical fit:

- Itch page says Affinity Designer source, EPS, SVG, DragonBones file, DBJSON, SpineJSON, and separated PNG folders are included.
- The extracted search result/user comments emphasize many body parts and flexible movement refinement.

Visual fit:

- Stronger robot personality than RGS and more polished than Kenney/SuperBoxBot.
- Still enemy/broken-robot themed.

Riggability/expression:

- Technically the strongest riggable candidate in the broader set if purchase is acceptable.
- Face expression depends on the actual separated parts; likely better body movement than facial nuance.

Assessment:

- Best polished paid candidate. Do not buy/use unless Brian explicitly accepts paid asset acquisition and marketplace license constraints.

### G. GameDevMarket Animated robot game sprite

Source:

- https://www.gamedevmarket.net/asset/animated-robot-game-sprite

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-g-gamedevmarket-animated-robot-game-sprite.png`

License/source notes:

- Page lists the asset as **FREE**.
- GameDevMarket states all assets use its standard Pro License.
- Page technical details say AI training is not allowed.
- GDM license summary permits modification and use in unlimited personal/commercial media products, but prohibits raw asset redistribution, end-user extraction, logos/trademarks, NFTs, and AI training.

Formats/technical fit:

- Included formats: PNG, GIF, SCML, AI, EPS.
- Created in Adobe Illustrator and Spriter Pro.
- File size about 11.9 MB.

Visual fit:

- Friendly enough robot silhouette, less aggressive than CraftPix boss/flying robots.
- Simple face/antenna shape may be easier to adapt into a Hermes display familiar.

Riggability/expression:

- Spriter/SCML plus AI/EPS are useful as references and source art.
- Need to inspect actual downloadable contents before final adoption. Do not depend on Spriter runtime.
- Likely requires custom eye/lid/status overlays for Brian’s liked blocked/thinking/sleepy states.

Assessment:

- Best newly found non-CC0 free-marketplace candidate. Worth a manual download/inspection if Brian is comfortable with GDM account/download flow and Pro License constraints.

### H. Kenney Robot Pack

Sources:

- https://kenney.nl/assets/robot-pack
- https://opengameart.org/content/robot-pack

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-h-kenney-robot-pack.png`

License/source notes:

- Prior local research verified Kenney page lists CC0 and extracted `License.txt` permits personal/commercial use with optional credit.

Formats/technical fit:

- PNG parts/poses, spritesheets/XML, SVG source files for top and side views.

Visual fit:

- Safe, clean, generic robot style.
- More placeholder-like than SuperBoxBot or CraftPix.

Assessment:

- Excellent license-safe kitbash/reference source. Weak final persona unless heavily customized.

### I. Mix and Match SVG characters

Source:

- https://opengameart.org/content/mix-and-match-characters

Local artifact:

- `assets/character-candidates/modular-parts-broader/previews/candidate-i-mix-and-match-svg-characters.png`

License/source notes:

- Prior research verified OpenGameArt page lists CC0.

Formats/technical fit:

- Single SVG containing simple kids, robots, and alien/squid monster parts.
- Hair/facial expressions are swappable.

Visual fit:

- Cute and soft, but skews elementary clip-art.
- Could support a very simple browser SVG runtime.

Assessment:

- Useful as a fallback or expression-layout reference. Not polished enough to beat SuperBoxBot as final art.

## Rejected/not promoted

- **Misteremio DragonBones Characters**: free/name-your-own-price and includes DragonBones/PSD-style files, but visual fit is wrong for Hermes and license terms were not clear enough from the page extract. Requires DragonBones 5.6.2 for project files, which is acceptable only as optional reference, not runtime dependency.
- **GameDevMarket Robot Game Enemies Sprite Art Pack 2**: technically relevant PNG/SVG/AI/EPS body-part pack, but $10 and enemy/combat focused. Not better enough to justify purchase.
- **GameDevMarket Robot Dragon Character Sprites**: technically strong wahyuprot-style pack, but $5 and creature/combat themed. Similar constraints to Candidate F.
- **OpenGameArt Modular 64x Robots**: real modular robot construction kit, but too low-res/pixel-style and CC-BY-SA share-alike complicates derivative use.

## License and usage cautions

- **Personal/local display is low-risk, but license constraints still matter.** Avoid source redistribution in the repo if the repo ever becomes public.
- **Marketplace licenses are not CC0.** CraftPix and GameDevMarket permit use in media/game products but restrict raw source redistribution, end-user extraction, and AI training.
- **Do not use Spriter/Spine/DragonBones runtime as a requirement.** Treat SCML/Spine/DB files as reference only. Export/slice PNG/SVG parts into an app-owned JS scene graph.
- **Do not train or fine-tune models on these assets.** CraftPix and GameDevMarket both restrict AI/ML training use.
- **Avoid combat tone.** Many higher-quality robot packs are enemy/boss/weapon oriented. Hermes should be calm, cute, and operator-like.

## Motion/state preservation from `src/character-runtime.html`

The chosen character should preserve these behaviors from the liked runtime:

- `idle_watchful`: soft breathing, subtle float, wandering gaze, occasional blink.
- `thinking_focused`: narrowed eyes, visor/scan sweep, faster orbit/status pulse.
- `healthy_smug`: higher posture, asymmetric brow, small nod.
- `blocked_annoyed`: side-eye, red/orange accent, slumped/tilted posture, tap/sigh.
- `night_sleepy`: dim palette, half lids, slow drift.

Best mapping by candidate:

- **SuperBoxBot**: easiest no-cost mapping because brows/eyes/iris/hands are already separate.
- **GameDevMarket Animated robot**: good body movement, needs inspection/custom facial overlays.
- **CraftPix Free Robot**: polished body source, but likely needs custom Hermes eyes/visor/lids.
- **RGS**: strongest expression mechanics, weakest robot/familiar identity.

## Evidence and verification performed

Local evidence:

- Read prior `docs/modular-character-asset-research.md` and `src/character-runtime.html`.
- Reused existing verified previews for RGS, SuperBoxBot, Kenney Robot Pack, and Mix and Match SVG.
- Downloaded preview/screenshot images for broader candidates into `assets/character-candidates/modular-parts-broader/previews/`.
- Generated `assets/character-candidates/modular-parts-broader/broader-modular-character-candidates-contact-sheet.png`.
- Ran visual QA on the generated contact sheet twice; final pass confirmed all nine tiles show useful preview art and labels.

Web/source evidence:

- CraftPix Free Robot Sprite page: free robot pack with AI/EPS/SCML/PNG/body parts.
- CraftPix license page: freebie assets allowed in personal/commercial projects; no required attribution; no source resale/extraction; no AI/ML training.
- Itch Free 2D Robot Sprite page: free download, links to CraftPix license, comment confirms commercial use.
- CraftPix Flying Robot and Boss Robot itch pages: paid/download-gated, include AI/EPS/SCML/PNG body parts.
- Wahyuprot 3 Robot Character Sprite Sheets page: $5, Affinity Designer/EPS/SVG/DragonBones/SpineJSON/separated PNGs.
- GameDevMarket Animated robot game sprite page: FREE, PNG/GIF/SCML/AI/EPS, created in Illustrator/Spriter Pro, GDM Pro License, AI training not allowed.
- Prior local research: RGS, SuperBoxBot, Kenney Robot Pack, and Mix and Match SVG licensing and formats.

## Open questions

- Is Brian willing to create/download from GameDevMarket or CraftPix accounts for non-CC0 marketplace assets, or should the next prototype stay CC0/no-account only?
- Does Brian prefer a **boxy robot assistant** (SuperBoxBot/GameDevMarket), **hovering drone familiar** (CraftPix Flying Robot), or **creature/imp familiar** (RGS-like)?
- Should repository artifacts assume private-only storage, or should we keep the asset tree public-repo-safe by copying only CC0 assets and source-license notes?

## Implementation handoff

If proceeding with no-cost/no-lock-in:

- Next card: `display: prototype SuperBoxBot modular runtime`
- Copy selected SuperBoxBot parts into `src/assets/superboxbot-hermes/` with a `SOURCE-LICENSE.md`.
- Build the runtime as app-owned SVG/PixiJS parts with JS state transforms.
- Do not use Spine runtime/editor.
- Add Hermes-specific overlays: eye/visor layer, status light/orbit, terminal palette, alert/night colors.

If Brian wants to inspect the broader marketplace option first:

- Next card: `display: inspect GameDevMarket free animated robot sprite package`
- Manual or browser-auth download may be required.
- Verify actual package contents and license file before use.
- Extract only PNG/AI/EPS-derived parts needed for local private runtime; do not redistribute raw marketplace asset files.

Final call: **switch away from RGS as the primary visual candidate; use SuperBoxBot first, with GameDevMarket Animated Robot as the only newly found candidate strong enough to justify a follow-up inspection.**
