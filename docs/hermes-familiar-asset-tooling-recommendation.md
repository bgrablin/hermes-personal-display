# Hermes familiar asset/tooling recommendation

Date: 2026-05-16
Target: 320x480 local personal display
Scope: best practical route using local tools/capabilities and subscription/included-quota routes; no OpenRouter; personal/noncommercial assets acceptable if clearly better.

## BLUF

The best next move is **not more hand-authored SVG from scratch** and not a full Live2D/Rive/Spine pipeline. Use a **high-quality riggable character asset as the base**, then animate it in an **app-owned local SVG/PixiJS-style scene graph** with Hermes-specific state controls.

Recommended order:

1. **Primary no-cost/no-lock-in route: SuperBoxBot manually rigged from PNG/SVG parts.**
   - CC0/Public Domain provenance in local research.
   - Already has separated parts: head, body, eyes, irises, eyebrows, shoulders, hands, legs.
   - Better fit than the current custom SVG because it starts as a recognizable cute robot/familiar, not hand-drawn primitive shapes.
   - Ignore the included Spine project except as reference.
2. **Best asset-upgrade route if Brian is willing to search/download/buy later: inspect GameDevMarket Animated Robot first, then CraftPix/Wahyuprot robot packs.**
   - Use their PNG/SVG/AI/EPS/body-part exports as source parts only.
   - Do not depend on Spriter/Spine/DragonBones runtime/editor for the kiosk.
   - Respect marketplace license limits: no raw source redistribution, no extraction-friendly public bundle, no AI training.
3. **Use image generation only for concept exploration and style targets.**
   - It can help find silhouette/style directions with included-quota/subscription tools.
   - It should not be the final riggable runtime asset unless it is redrawn/sliced into clean legal parts afterward.
4. **Keep the custom SVG spirit-wisp as a fallback/prototype, not the best final option.**
   - It solves hands/teeth/gaze but still risks feeling custom-code-art rather than a polished familiar.
5. **Do not default to Live2D/Rive/Spine.**
   - They are capable but add authoring/export/license/tooling friction disproportionate to a 320x480 private local display.

## Why not continue current hand-authored SVG as the main path

The current custom SVG puppet is technically successful: no teeth, no hands, precise gaze, blink, mouth morphs, state control, and no dependency lock-in. It is the strongest purely local handcrafted route.

But the user specifically says the custom SVG is "not enough". The missing piece is art quality/coherence, not runtime mechanics. More hand-authoring by code will likely produce diminishing returns unless an artist-quality SVG is supplied.

Conclusion: keep the runtime lessons, replace the art source.

## Asset choice recommendation

### Best immediate route: SuperBoxBot

Use SuperBoxBot as the next serious Hermes familiar base.

Local evidence already captured:

- `docs/modular-character-asset-research.md`
- `docs/broader-modular-character-asset-research.md`
- Preview/contact sheets under `assets/character-candidates/`

Why it wins:

- Cute/recognizable robot identity.
- CC0 / low license friction.
- Separate expressive face parts: eyes, irises, eyebrows.
- Separate body/limb parts for shrug, tap, slump, nod, side-eye, sleepy drift.
- SVG/PDF source exists for cleanup/recoloring.
- No need to use Spine runtime.

Implementation shape:

- Copy selected parts into `src/assets/superboxbot-hermes/` with `SOURCE-LICENSE.md`.
- Build a renderer that treats parts as named rig layers:
  - body/head container
  - eyes/irises
  - eyelid/brow overlays if source parts are insufficient
  - shoulders/arms/hands/legs or simplified hover base
  - shadow/stage
  - status motes/orbits as secondary props
- Port state behaviors from the liked runtime:
  - `idle_watchful`: slow breath, gaze, blink
  - `thinking_focused`: narrowed eyes, scan sweep
  - `healthy_smug`: raised posture, asymmetric brow, tiny nod
  - `blocked_annoyed`: side-eye, amber/magenta accent, slumped tilt, tap/sigh
  - `night_sleepy`: dim palette, half lids, slow drift

### Secondary free/clean choices

- **Foozle Cute Platformer Robot**: fastest cute animated win, but Brian already disliked pasted synthetic overlays on it; future expression changes must come from source-compatible art/rigging, not fake face/badge overlays.
- **Kenney Robot Pack**: very clean CC0 fallback, but generic and weaker facial expression unless heavily customized.
- **RGS**: keep only as expression-mechanics reference. It has strong modular expression but the hands/mouths/body tone remain visually off-target.

### Buy/search later candidates

If Brian wants the best visual polish and accepts personal-use/noncommercial or marketplace-license constraints, search/buy later rather than forcing local freebies:

- **GameDevMarket Animated robot game sprite**: best free-marketplace follow-up candidate; PNG/GIF/SCML/AI/EPS; inspect actual download before adopting.
- **CraftPix Free Robot Sprite**: polished body source, likely needs Hermes-owned face/visor overlay.
- **Wahyuprot 3 Robot Character Sprite Sheets**: strongest riggable paid-looking candidate in prior research; includes separated PNGs and rig formats, but enemy/broken-robot tone must be softened.
- **CraftPix Flying Robot**: best hovering-drone silhouette if Brian wants a floating familiar; paid/download-gated and likely limited facial expression.

For these, treat SCML/Spine/DragonBones files as **reference/import data**, not runtime dependencies.

## Tooling recommendation

### Runtime/rendering

Use a local browser runtime with an app-owned rig:

- SVG/DOM renderer is enough for SuperBoxBot-scale parts.
- PixiJS is a better durable renderer if part count/texture transforms grow.
- Keep all dependencies local; no CDN for kiosk mode.
- Keep state machine in JS data/code, not inside an editor-specific asset.

### Image generation

Use image generation for:

- concept sheets
- style references
- silhouette exploration
- palette/lighting mood boards
- prompts to guide a later asset search or manual redraw

Do not use image generation directly as final runtime art unless it is converted into clean, separately riggable parts and the legal/use policy is acceptable. Generated flat images are not automatically riggable and can reintroduce hand/teeth/anatomy artifacts.

Use subscription/included-quota image tools first if available through Hermes/ChatGPT/Gemini/etc.; avoid PAYG unless explicitly approved. Do not use OpenRouter for this task.

### Rive

Do not choose Rive as the default path.

- Rive runtime is good/MIT, but the production value comes from an authored `.riv` file.
- Prior local research found Rive export/pricing friction: free creation is not the same as free production export.
- A random `.riv` sample would only prove the runtime loads, not improve Hermes.

Use Rive only if Brian later has or commissions a real Hermes `.riv` asset with clear export/runtime rights.

### Spine / Live2D / DragonBones / Spriter

Do not default to these.

- They are powerful but add editor/toolchain/licensing burden.
- For marketplace packs, rig files can be useful to understand pivots and animations, but the local display should ship app-owned PNG/SVG parts and JS transforms.
- Live2D is especially mismatched unless Brian wants an anime/VTuber-style assistant.
- Spine is not worth adopting just because SuperBoxBot includes a Spine file.

## Practical next steps

1. **Prototype SuperBoxBot rig.**
   - Copy only needed CC0 parts into `src/assets/superboxbot-hermes/`.
   - Preserve source URL/license notes in `SOURCE-LICENSE.md`.
   - Create a 320x480 debug page with static approval cards first.
2. **Build the minimal state rig.**
   - Idle, thinking, healthy/smug, blocked/annoyed, night.
   - Require obvious side-eye left/right, no teeth, no pasted UI badge, no constant bounce.
3. **Use image generation only to make a style target sheet.**
   - Prompt for "cute boxy local-operator robot familiar, front/three-quarter, riggable parts, no teeth, no hands emphasis".
   - Use results as direction, not pasted assets.
4. **If SuperBoxBot is still not visually good enough, search/buy.**
   - Inspect GameDevMarket Animated Robot and CraftPix/Wahyuprot packs.
   - Prefer packs with source vectors + separated PNG parts.
   - Avoid combat/weapon/enemy-coded packs unless the neutral art is very strong.
5. **Only after asset acceptance, consider PixiJS hardening.**
   - SVG/JS is fine for approval.
   - PixiJS is better if many bitmap layers, filters, or smoother motion are needed.

## Final call

For the best possible Hermes familiar in this environment: **use SuperBoxBot or a better purchased/search-found riggable robot asset as the visual foundation, animate it with the existing local state-machine approach, and reserve image generation for concept direction.**

The core mistake to avoid is choosing a sophisticated animation editor before choosing good character art. The display needs a lovable, high-quality, riggable familiar first; the runtime can remain simple and local.
