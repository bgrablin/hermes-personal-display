# RGS expression inventory and curation

Task: `t_5e52a35f`
Target: Hermes Personal Display, 320x480 portrait browser runtime
Source pack root: `assets/character-candidates/modular-parts/extracted/rgs_modular_vector_characters/Free 2D Animated Vector Game Character Sprites/`
Generated inventory artifacts: `assets/character-candidates/rgs-inventory/`

## BLUF

Use RGS only as a friendly modular puppet with a tightly curated expression set. Brian's rejection is valid: the current prototype let monster/zombie teeth into the runtime and its random nudge does not produce a visible character change.

Next implementation should use:

- Base puppet: `body1`, `head1`, `handL1`, `handR1`, optional low-emphasis `footL1` / `footR1`.
- Safe eyes: `eyes1`, `eyes2`.
- Caution eyes: `eyes5`, `eyes6` only for sleepy/thinking cases.
- Banned eyes: `eyes3`, `eyes4`, `eyes7` unless Brian explicitly asks for angry/suspicious expressions.
- Safe mouths: `mouth1`, `mouth2`, `mouth4`.
- Caution mouth: `mouth3` only for small surprise/thinking/yawn accents.
- Banned mouths: `mouth5`, `mouth6`, `mouth7`, `mouth8`.

Hard rule: `mouth5`, `mouth6`, `mouth7`, and `mouth8` are banned unless Brian explicitly overrides. Night mode must not use teeth, red mouth interiors, zombie mouths, monster mouths, or toothy yawns.

## Evidence inspected

Generated contact sheets:

- `assets/character-candidates/rgs-inventory/rgs-mouths-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-eyes-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-heads-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-bodies-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-left-hands-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-left-feet-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-fullbody-action-variants.png`

Inventory files:

- `assets/character-candidates/rgs-inventory/rgs-full-inventory.md`
- `assets/character-candidates/rgs-inventory/rgs-png-inventory.json`

Prior direction reviewed:

- `docs/rgs-hermes-character-direction.md`
- `scripts/stage_rgs_runtime.py`
- `src/assets/rgs-hermes/manifest.json`
- `src/renderer-character-rgs.js`

## Mouth inventory and curation

Contact sheet: `assets/character-candidates/rgs-inventory/rgs-mouths-variants.png`

| Variant | Status | Use | Reason |
|---|---|---|---|
| `mouth1` | Safe | Neutral, blocked-flat, low-expression idle alternate | Simple black line. Non-threatening. Lower readability than `mouth4`, but safe. |
| `mouth2` | Safe | Skeptical/neutral alternate, slight attitude | Simple curved line. Safe and non-toothy. Use sparingly if it reads as smirk rather than frown. |
| `mouth3` | Caution | Surprise, tiny yawn, thinking dot | Circular open mouth. Not scary, but can read as shocked. Do not use as default. In night mode, dim and scale down if used. |
| `mouth4` | Safe, primary | Default friendly mouth | Best friendly option. Clear simple smile, no teeth, no monster cue. |
| `mouth5` | Banned | Do not use | Sharp fang shape. Reads predatory/monster. Explicitly banned unless Brian overrides. |
| `mouth6` | Banned | Do not use | Uneven/blocky teeth. Reads zombie/ghoul/dopey monster. Explicitly banned unless Brian overrides. |
| `mouth7` | Banned | Do not use | Broken/rotting tooth read. The prior night/yawn use was wrong. Explicitly banned unless Brian overrides. |
| `mouth8` | Banned | Do not use | Red interior plus jagged teeth. Overt monster/aggression. Explicitly banned unless Brian overrides. |

Mouth frame guidance:

- Use only idle-frame mouth swaps for expression, not full action-frame mouth sets, until a prototype proves action-frame alignment reads cleanly.
- Preferred frame paths:
  - `Animated body parts/Mouths/mouth4/idle_0.png` through `idle_5.png`
  - `Animated body parts/Mouths/mouth1/idle_0.png` through `idle_5.png`
  - `Animated body parts/Mouths/mouth2/idle_0.png` through `idle_5.png`
  - `Animated body parts/Mouths/mouth3/idle_0.png` through `idle_5.png` only as caution accent
- Remove all staged runtime references to:
  - `mouth5_*`
  - `mouth6_*`
  - `mouth7_*`
  - `mouth8_*`

## Eye inventory and curation

Contact sheet: `assets/character-candidates/rgs-inventory/rgs-eyes-variants.png`

| Variant | Status | Use | Reason |
|---|---|---|---|
| `eyes1` | Safe, primary | Default active/friendly, alive gaze | Pupils make the character look alive and intentional. Best all-around friendly read. |
| `eyes2` | Safe | Curious/neutral/waiting | Wide-eyed and readable. Slight caution that pupil-less eyes can feel blank, but still safe compared with aggressive variants. |
| `eyes3` | Banned | Do not use by default | Slanted/heavy-brow angry look. Reads hostile or annoyed rather than dry/funny. |
| `eyes4` | Banned | Do not use by default | Similar aggression/suspicion. Too hostile for the default familiar. |
| `eyes5` | Caution | Sleepy/offline only, if brightened or dimly accented | Small black dots can disappear on dark background and may read dead/empty. Use only with supporting sleepy posture, never with teeth. |
| `eyes6` | Caution | Thinking/focused, low-energy night alternate | Sleek/robotic crescent read. Can look powered-down rather than friendly. Safe only for focused/sleep states. |
| `eyes7` | Banned | Do not use by default | Slanted white slivers read angry/aggressive and become harsh in night mode. |

Eye frame guidance:

- Preferred frame paths:
  - `Animated body parts/Eyes/eyes1/idle_0.png` through `idle_5.png`
  - `Animated body parts/Eyes/eyes2/idle_0.png` through `idle_5.png`
  - `Animated body parts/Eyes/eyes6/idle_0.png` through `idle_5.png` as caution/focus
  - `Animated body parts/Eyes/eyes5/idle_0.png` through `idle_5.png` as caution/sleep only
- Do not use `eyes3`, `eyes4`, or `eyes7` in the default runtime state graph.
- If Brian later wants an annoyed state, achieve it with posture, side-eye offset, orbit bunching, and `mouth1` rather than angry eye assets.

## Head, body, hands, and feet curation

### Heads

Contact sheet: `assets/character-candidates/rgs-inventory/rgs-heads-variants.png`

| Variant | Status | Use | Reason |
|---|---|---|---|
| `head1` | Safe, primary | Default head | Smooth round silhouette. Friendly, clean, least noisy at small display scale. |
| `head2` | Caution | Optional lunar/skin variant only | Crater texture can become noise or look blemished/diseased when scaled down. |
| `head3` | Banned | Do not use | Saw/cog/blade edge reads dangerous and aliases badly. |

Use `Animated body parts/Heads/head1/{idle,walk,jumpStart,fall}_*.png` for the next runtime set.

### Bodies

Contact sheet: `assets/character-candidates/rgs-inventory/rgs-bodies-variants.png`

Only `body1` is present. It is safe and suitable: simple, shield-like, high contrast, and aligned with a technical familiar. Use `Animated body parts/Bodies/body1/{idle,walk,jumpStart,fall}_*.png`.

### Hands

Contact sheets:

- `assets/character-candidates/rgs-inventory/rgs-left-hands-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-right-hands-variants.png`

`handL1` and `handR1` are content-safe but low-contrast and mitten-like. They are useful for broad gesture reads only: small wave, lift, tap, or hover. Do not rely on them for pointing or precise UI intent.

Implementation guidance:

- Keep hands as secondary silhouette accents.
- Add cyan/teal tint or glow only enough to separate them from the dark background.
- Use posture and whole-body motion for expression before hand details.

### Feet

Contact sheets:

- `assets/character-candidates/rgs-inventory/rgs-left-feet-variants.png`
- `assets/character-candidates/rgs-inventory/rgs-right-feet-variants.png`

`footL1` and `footR1` are safe but minimalist. They should be de-emphasized. For a floating Hermes familiar, feet are not the personality source.

Implementation guidance:

- Use feet to stabilize the assembled puppet if needed.
- Keep feet visually subordinate to head/eyes/mouth/orbit motion.
- Do not make foot-tap the primary random nudge unless it creates visible whole-character motion too.

## Full-body character/action candidates

Contact sheet: `assets/character-candidates/rgs-inventory/rgs-fullbody-action-variants.png`

The full-body set is useful as a reference for silhouette, action readability, and source alignment, but the runtime should still be built from modular parts so expression swaps stay curated.

### Character candidates

| Candidate | Status | Notes |
|---|---|---|
| `Char 4 / with hands` | Best alignment/reference candidate | Smooth bald head, simple non-hair silhouette, closest to the modular `head1` direction. Use as alignment reference, not as a final flattened sprite. |
| `Char 4 / no hands` | Safe fallback reference | Cleaner but less lively. Use only if hands are too noisy. |
| `Char 2 / with hands` | Caution alternative | Sunglasses/hair create a distinct technical/cool silhouette, but it becomes a humanoid avatar rather than the round Hermes familiar direction. |
| `Char 1` | Banned/default avoid | Blue spiky hair feels fantasy/emo and can shimmer at low scale. |
| `Char 3` | Banned/default avoid | Hair tuft and stance can read punk/aggressive. |
| `Enemies/*` | Banned | Enemy semantics and monster silhouettes conflict with Hermes. |

### Action candidates

| Action | Status | Use | Reason |
|---|---|---|---|
| `idle` | Safe, primary | Default breathing loop | Most readable and least noisy. Six frames available. |
| `walk` | Safe if localized | Blocked shuffle, visible nudge, hand/foot tap | Eight frames. Provides visible motion without combat semantics if not used as literal walking. |
| `jumpStart` | Safe/caution | Alert perk, thinking lean-in, successful task pop | Two frames. Reads like anticipation/attention. Keep amplitude small. |
| `fall` | Caution | Sleepy droop only if subtle | Five frames. Can read tired if slow, but can also look distressed if overdone. |
| `jumpEnd` | Banned for default runtime | Do not use next pass | Squash/impact can read crushed, glitchy, or zombie-like at 320x480. |
| `roll` | Banned for default runtime | Do not use next pass | Tucked/obscured face reads injured, violent, or broken. |
| `hit` | Banned | Do not use | Combat/damage semantics. |
| `death` | Banned | Do not use | Death/injury semantics. |

## Recommended runtime frame sets

These are exact source-frame families for the next implementation. Paths are relative to the RGS source pack root.

### Base puppet frames

Use these modular parts:

- `Animated body parts/Bodies/body1/idle_0.png` through `idle_5.png`
- `Animated body parts/Bodies/body1/walk_0.png` through `walk_7.png`
- `Animated body parts/Bodies/body1/jumpStart_0.png` through `jumpStart_1.png`
- `Animated body parts/Bodies/body1/fall_0.png` through `fall_4.png`
- `Animated body parts/Heads/head1/idle_0.png` through `idle_5.png`
- `Animated body parts/Heads/head1/walk_0.png` through `walk_7.png`
- `Animated body parts/Heads/head1/jumpStart_0.png` through `jumpStart_1.png`
- `Animated body parts/Heads/head1/fall_0.png` through `fall_4.png`
- `Animated body parts/Left hands/handL1/idle_0.png` through `idle_5.png`
- `Animated body parts/Left hands/handL1/walk_0.png` through `walk_7.png`
- `Animated body parts/Left hands/handL1/jumpStart_0.png` through `jumpStart_1.png`
- `Animated body parts/Left hands/handL1/fall_0.png` through `fall_4.png`
- `Animated body parts/Right hands/handR1/idle_0.png` through `idle_5.png`
- `Animated body parts/Right hands/handR1/walk_0.png` through `walk_7.png`
- `Animated body parts/Right hands/handR1/jumpStart_0.png` through `jumpStart_1.png`
- `Animated body parts/Right hands/handR1/fall_0.png` through `fall_4.png`
- Optional, low emphasis: `Animated body parts/Left feet/footL1/{idle,walk,jumpStart,fall}_*.png`
- Optional, low emphasis: `Animated body parts/Right feet/footR1/{idle,walk,jumpStart,fall}_*.png`

Exclude these base action families from the next implementation:

- `jumpEnd_*`
- `roll_*`
- `hit_*`
- `death_*`

### Expression frames

Use these expression parts:

- `Animated body parts/Eyes/eyes1/idle_0.png` through `idle_5.png`
- `Animated body parts/Eyes/eyes2/idle_0.png` through `idle_5.png`
- `Animated body parts/Eyes/eyes6/idle_0.png` through `idle_5.png` only for thinking/sleep caution states
- `Animated body parts/Eyes/eyes5/idle_0.png` through `idle_5.png` only for sleepy/offline caution states
- `Animated body parts/Mouths/mouth4/idle_0.png` through `idle_5.png`
- `Animated body parts/Mouths/mouth1/idle_0.png` through `idle_5.png`
- `Animated body parts/Mouths/mouth2/idle_0.png` through `idle_5.png`
- `Animated body parts/Mouths/mouth3/idle_0.png` through `idle_5.png` only as caution accent

Do not stage or reference:

- `Animated body parts/Mouths/mouth5/**`
- `Animated body parts/Mouths/mouth6/**`
- `Animated body parts/Mouths/mouth7/**`
- `Animated body parts/Mouths/mouth8/**`
- `Animated body parts/Eyes/eyes3/**`
- `Animated body parts/Eyes/eyes4/**`
- `Animated body parts/Eyes/eyes7/**`
- `Animated body parts/Heads/head3/**`
- `Animated body parts/Horns/**`
- `Animated body parts/Hairs/**`
- `Animated body parts/Left wings/**`
- `Animated body parts/Right wings/**`
- `Animated body parts/Right weapons/**`
- `Weapons/**`
- `Extras/bullet.png`
- `Extras/crosshair.png`
- `Extras/muzzle.png`
- `Generic death animation/**`
- `Full body animated characters/Enemies/**`

## State mapping for next implementation

| Runtime state | Base frame set | Eyes | Mouth | Motion |
|---|---|---|---|---|
| `idle_watchful` | `idle` | `eyes1` primary, `eyes2` alternate | `mouth4` | Slow breath, subtle head/gaze drift, occasional blink. |
| `thinking_focused` | `idle` plus tiny `jumpStart` lean | `eyes6` caution | `mouth3` caution or `mouth1` | Scanline/orbit activity. No teeth. |
| `healthy_smug` | `idle` | `eyes1` or `eyes2` | `mouth2` or `mouth4` | Small satisfied nod via transform, not `jumpEnd`. |
| `blocked_annoyed` | `idle` plus localized `walk` shuffle | `eyes1`/`eyes2` with side-eye offset, not angry assets | `mouth1` | Slump, tilt, orbit bunch, restrained amber/magenta. |
| `night_sleepy` | `idle`, optional very slow `fall` droop | `eyes5` caution or dim `eyes6` | `mouth1`, `mouth3` tiny yawn only | Low brightness, slow drift, no teeth/zombie mouth. |
| `random_nudge` | `walk`, `jumpStart`, or transform burst | Current state's safe eyes/mouth | Current state's safe mouth | Must visibly move silhouette, not just orbit particles. |

## Random-nudge acceptance criteria

A random nudge is acceptable only if it visibly changes the character, not just the background or orbit effects.

Required visible change:

- At least one whole-character transform must occur: x/y offset, scale pulse, tilt, squash/stretch, or 2-4 frame base animation swap.
- The change must be visible at normal 320x480 viewing distance on the actual panel or browser preview.
- Minimum perceptual amplitude:
  - root y movement: 6-12 px, or
  - root x movement: 4-8 px, or
  - tilt: 4-8 degrees, or
  - scale pulse: 4-7 percent, or
  - action-frame swap: at least 2 distinct frames from `walk` or `jumpStart`.
- Duration: 450-1200 ms for normal nudges; 1200-2200 ms only for sleepy/night mode.
- Cooldown: no more than once every 8-18 seconds in idle, no more than once every 15-35 seconds in night mode.
- Expression safety: random nudge must preserve the current state's safe/caution expression set and must never swap into banned mouths/eyes.
- State clarity: after the nudge, the character must return to the same semantic state. It should not look like injury, death, combat, or a different character.

Suggested nudge types:

1. `peek`: head/root shifts 6 px sideways, eyes offset 2 px, returns with cubic easing.
2. `perk`: 2-frame `jumpStart` lift, root y moves up 8 px, mouth remains `mouth4` or `mouth1`.
3. `shuffle`: 2-3 frames from `walk`, root x rocks 5 px, hands/feet move enough to see.
4. `blink_squint`: eye mask squeeze plus root tilt 5 degrees, safe for blocked/idle.
5. `sleep_drift`: slow y drift 8 px over 1.8 seconds, no mouth teeth, no sudden impact.

Rejected nudge types:

- Orbit-only changes.
- Color-only flashes.
- Mouth-only swaps smaller than 4 px perceived change.
- `jumpEnd`, `roll`, `hit`, or `death` frame usage.
- Any nudge that introduces teeth, red mouth interiors, angry eyes, weapons, or enemy parts.

## Exact next-implementation changes

The current staged runtime manifest and renderer contain banned choices. These are design-level instructions for the next engineer pass, not prototype work in this task.

### Fix staging script

File: `scripts/stage_rgs_runtime.py`

Change `SAFE_STATES` from including `jumpEnd` and `roll` to:

```python
SAFE_STATES = {
    "idle": 6,
    "walk": 8,
    "jumpStart": 2,
    "fall": 5,
}
```

Change `EXPRESSION_PARTS` to include only:

```python
EXPRESSION_PARTS = [
    ("eyes1", "Animated body parts/Eyes/eyes1", [("idle", 6)]),
    ("eyes2", "Animated body parts/Eyes/eyes2", [("idle", 6)]),
    ("eyes6", "Animated body parts/Eyes/eyes6", [("idle", 6)]),
    ("eyes5", "Animated body parts/Eyes/eyes5", [("idle", 6)]),
    ("mouth4", "Animated body parts/Mouths/mouth4", [("idle", 6)]),
    ("mouth1", "Animated body parts/Mouths/mouth1", [("idle", 6)]),
    ("mouth2", "Animated body parts/Mouths/mouth2", [("idle", 6)]),
    ("mouth3", "Animated body parts/Mouths/mouth3", [("idle", 6)]),
]
```

Update `excluded_states` to include:

```python
["jumpEnd", "roll", "death", "hit"]
```

Update `excluded_parts` to include the banned expression variants explicitly:

```python
[
    "Mouths/mouth5", "Mouths/mouth6", "Mouths/mouth7", "Mouths/mouth8",
    "Eyes/eyes3", "Eyes/eyes4", "Eyes/eyes7",
    "Heads/head3",
    "Weapons", "Horns", "Hairs", "Left wings", "Right wings", "Enemies",
    "Generic death animation", "Right weapons",
]
```

### Fix runtime state graph

File: `src/renderer-character-rgs.js`

Change expression mappings:

- `idle_watchful`: `eyes: 'eyes1'`, `mouth: 'mouth4'`
- `thinking_focused`: `eyes: 'eyes6'`, `mouth: 'mouth3'`
- `healthy_smug`: `eyes: 'eyes2'` or `eyes1`, `mouth: 'mouth2'` or `mouth4`; remove `gestureState: 'jumpEnd'`
- `blocked_annoyed`: `eyes: 'eyes1'` or `eyes2` with side-eye offset, `mouth: 'mouth1'`; remove `eyes3`
- `night_sleepy`: `eyes: 'eyes5'` or `eyes6`, `mouth: 'mouth1'` or tiny `mouth3`; remove `mouth7`

Change gesture/action usage:

- Replace `smug_nod` use of `jumpStart`/`jumpEnd` with transform-only nod or `jumpStart` only.
- Replace `sleepy_droop` use of `fall` only if it remains slow and non-distressed. Prefer transform-only droop first.
- Keep `foot_tap`/blocked shuffle based on `walk`, but add root tilt/y/x movement so it is visible.
- Add an explicit random-nudge action that uses one of the accepted nudge types above.

### Regenerate runtime assets

After script changes, regenerate `src/assets/rgs-hermes/` so the manifest no longer contains banned mouths/eyes/actions.

Expected staged asset families should include:

- `body1_idle_*`, `body1_walk_*`, `body1_jumpStart_*`, `body1_fall_*`
- `head1_idle_*`, `head1_walk_*`, `head1_jumpStart_*`, `head1_fall_*`
- `handL1_*`, `handR1_*`, optional `footL1_*`, `footR1_*` for those same four action families
- `eyes1_idle_*`, `eyes2_idle_*`, `eyes5_idle_*`, `eyes6_idle_*`
- `mouth1_idle_*`, `mouth2_idle_*`, `mouth3_idle_*`, `mouth4_idle_*`

Expected manifest must not contain:

- `mouth5`, `mouth6`, `mouth7`, `mouth8`
- `eyes3`, `eyes4`, `eyes7`
- `jumpEnd`, `roll`, `hit`, `death`

## Acceptance criteria for the next prototype pass

The next implementation is acceptable only if:

- No banned mouth files are copied, staged, loaded, or referenced.
- `mouth5` through `mouth8` are absent from `src/assets/rgs-hermes/manifest.json` and from runtime code.
- Night mode uses no teeth, no red mouth, no zombie/monster mouth, and no `mouth7`.
- No angry eye variants (`eyes3`, `eyes4`, `eyes7`) are present in the default runtime state graph.
- The default face reads friendly at 320x480 using `eyes1` or `eyes2` plus `mouth4`.
- Blocked/annoyed reads as dry impatience via posture and motion, not hostile eyes or monster teeth.
- Random nudge changes the character silhouette enough to notice on the physical display or 320x480 browser preview.
- No `jumpEnd`, `roll`, `hit`, `death`, weapon, enemy, horn, wing, bullet, crosshair, or muzzle assets appear in the runtime.
- Source/license note remains with staged assets.
- The prototype preserves the technical familiar context: top bar/status band/orbit effects are secondary, while the character visibly carries the state.
