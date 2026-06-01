# Hermes Courier Familiar static model-sheet gate

Date: 2026-05-16
Task: `t_ea5f75e3`
Target display: 320×480 portrait Hermes personal display

## BLUF

Recommend moving forward to Brian review with **SuperBoxBot as the Hermes Courier Familiar base**, using the generated 320×480 contact sheet as the approval gate before any runtime animation work.

Primary artifact:

- `assets/character-candidates/hermes-familiar-model-sheet/hermes-courier-familiar-contact-sheet-320x480.png`

Generator/source artifact:

- `scripts/generate-hermes-familiar-contact-sheet.py`

This direction is intentionally a still model-sheet gate, not a runtime implementation. It demonstrates the character identity and required expression states at actual display size before animation can hide weak art.

## Recommendation

Use **SuperBoxBot** as the no-cost riggable base for the next Hermes familiar iteration.

Why this is the right default:

- It is already local and extracted.
- Local research records CC0/Public Domain provenance from OpenGameArt.
- It has separated PNG parts for head, body, eyes, irises, brows, shoulders, and legs.
- It reads as a recognizable small robot/familiar at 320×480, unlike the RGS direction that kept reading as fantasy/combat modular sprite art.
- It supports real gaze control through iris placement rather than baked-looking frame animation.
- It avoids the current failure mode: no teeth, no monster mouths, no pasted badge/face overlay, and no constant animated bounce.

Do not switch to a paid/download-gated asset yet. CraftPix/GameDevMarket/Wahyuprot may be stronger later, but the local evidence does not justify new marketplace/license friction before Brian approves the basic Hermes familiar direction.

## Design direction

Name: **Hermes Courier Familiar**

Character read:

- Small local operator robot familiar.
- Courier/messenger cue through wing-like hood fins and a scarf accent.
- Large readable face and gaze.
- Expression comes from pupils, lids, brows, posture, palette, and motes.
- Hands are omitted/tucked for this gate to avoid the SuperBoxBot nub/boxing-glove problem.
- No mouth/teeth are added. The colored scarf/chin accent is a state cue, not a talking mouth.

The model sheet deliberately stays close to the source character while adding minimal Hermes identity. This keeps the next engineering step feasible: a local scene graph can move the same separated parts without needing a new artist pipeline.

## Static state model

The contact sheet covers the required nine review states.

| State | Required read | Static treatment | Runtime implication later |
|---|---|---|---|
| Neutral | Calm, available, "our guy" | Forward gaze, even brows, cyan courier accent | Default idle with very low root motion |
| Look-left | Visibly looking left | Pupils shifted left, no body bounce | `saccade → hold`, not continuous wandering |
| Look-right | Visibly looking right | Pupils shifted right, no body bounce | Same as left, symmetric distribution |
| Side-eye-left | Skeptical left glance | Narrowed eyes, left pupil edge, amber accent, lowered brows | Used for warnings/blockers or "I see that" moments |
| Side-eye-right | Skeptical right glance | Narrowed eyes, right pupil edge, amber accent, lowered brows | Must be visually distinct from look-right |
| Thinking | Focused processing | Slight squint, asymmetric brows, violet motes | Shorter gaze holds, subtle scan only |
| Blocked/annoyed | Friction/problem state | Lowered brows, red accent, slight slumped posture | No angry teeth/mouth; state carried by brow/lids/posture |
| Healthy/smug | Confident/working | Raised posture, green accent, smug brow/eye curve | Small nod allowed, not a bounce loop |
| Night/sleepy | Dim, low-attention | Blue tint, half lids, reduced motes, no brows | Slow blink/drift only, minimal light output |

## Contact sheet specification

The generated PNG is exactly 320×480. It uses a 3×3 grid so Brian can judge the states at display scale.

Layout:

- 320×480 portrait canvas.
- Dark technical/grid background to match Hermes system display context.
- Header: `Hermes Courier Familiar: static gate`.
- Subheader: `SuperBoxBot CC0 base · no teeth · hands omitted · gaze-first states`.
- Nine labeled cards: neutral, look left, look right, side-eye L, side-eye R, thinking, blocked, healthy, night.

Character construction:

- Source parts from `assets/character-candidates/modular-parts/extracted/superboxbot_character_sheet/`.
- Uses head/body/eyes/irises/brows/shoulders/legs.
- Does not use `handL*`, `handR*`, `handLGun.png`, or `splash.png`.
- Adds small drawn wing fins and scarf/state accent as Hermes identity cues.
- Uses direct pupil placement for gaze states.
- Uses simple lid/brow overlays for side-eye, thinking, blocked, healthy, and night.

## Asset and license notes

Local source artifact:

- `assets/character-candidates/modular-parts/extracted/superboxbot_character_sheet/`

Source page recorded in project research:

- OpenGameArt: `https://opengameart.org/content/superboxbot-character-sheet-and-spine-setup`

License status from local research:

- `docs/broader-modular-character-asset-research.md` records SuperBoxBot as CC0/Public Domain.
- `docs/hermes-familiar-asset-tooling-recommendation.md` repeats CC0/Public Domain provenance and recommends treating the included Spine file as reference only.

Operational license guidance:

- Preserve source URL/license notes when staging parts into application assets.
- Do not depend on the bundled Spine runtime/editor.
- Do not redistribute raw source assets externally unless the final license review confirms the CC0 provenance directly from the source page.
- Avoid `handLGun.png` and combat/splash effects entirely for Hermes.

## Acceptance criteria for Brian review

Brian should approve or reject the static model-sheet direction using these exact checks.

### Character identity

- At 320×480, the character reads as a coherent Hermes familiar, not a generic sprite dump.
- The character feels like a small local operator/courier robot, not a combat enemy, fantasy imp, or random game asset.
- The wing/scarf cues feel integrated into the character, not like a pasted logo or UI badge.
- The character is large enough to be the primary display subject.

### Required state coverage

- Neutral, look-left, look-right, side-eye-left, side-eye-right, thinking, blocked/annoyed, healthy/smug, and night/sleepy are all present and labeled.
- Looking left and looking right are visibly distinguishable from neutral.
- Side-eye-left and side-eye-right are visibly distinguishable from ordinary look-left/look-right.
- Blocked/annoyed reads as frustrated without teeth, monster mouth, or aggression.
- Healthy/smug reads confident/pleased without becoming goofy or smug in an annoying way.
- Night/sleepy reads dim/sleepy and appropriate for low-attention display mode.

### Explicit rejection checks

- No teeth in any state.
- No boxing-glove hands or mitten hands.
- No weapon, gun, muzzle flash, impact/splash, combat, enemy, or boss cues.
- No pasted UI badge on the chest or face.
- No pasted synthetic face overlay that fights the source art.
- No tiny pixel-art primary character.
- No runtime animation work is accepted under this card.

### Runtime guardrails for the next engineering card

These are not implemented yet, but approval should be conditional on engineering preserving them later:

- Gaze must use `saccade → hold`, not constant wandering.
- Idle/healthy/night root Y motion must stay at or below roughly 1 px equivalent.
- Character should not continuously bounce.
- State should be carried primarily by gaze, lids, brows, palette, posture, and subtle motes.
- Include a freeze/debug mode and a still contact-sheet comparison in the runtime prototype.

## Design caveats

- The original SuperBoxBot hands are the weakest part of the asset; they read as nubs/boxing gloves. The static gate omits them. If hands return later, they need redesign or must stay tucked/minimal.
- The base art is still a simple free asset, not a commissioned mascot. If Brian rejects the identity as too generic, the next move should be a higher-polish asset search/purchase or commissioned/vector redraw, not more renderer polish.
- The contact sheet is intentionally conservative. It proves the identity/state system first; it does not attempt full brand polish or animation charm.

## Designer recommendation

Present the generated contact sheet to Brian and ask for a binary direction decision:

1. **Approve SuperBoxBot Hermes Courier Familiar** and proceed to the rig prototype.
2. **Reject as too generic/simple** and authorize a better asset search/purchase or commissioned/custom redraw.
3. **Approve with changes** to the static model sheet only, before engineering starts.

Do not start runtime animation until this gate is approved.
