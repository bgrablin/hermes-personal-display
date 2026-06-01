# Provider route sidebar design synthesis

Date: 2026-05-24
Scope: Read-only visual design recommendation for the right-side dead space under LOCAL TIME / UPTIME on the Hermes Personal Display.

## Recommendation

Build the **Subscription Mast**: a thin vertical etched instrument rail pinned to the right edge, with four provider stations and left-extending headroom whiskers.

This is the best fit because it:

- uses the empty right side without turning it into a boxed widget
- preserves the central optic as the visual hero
- makes unknown quota visually honest by drawing no whisker
- reads top-to-bottom as route preference / fallback order
- feels native to Concept B: hairlines, ticks, small caps, muted amber/steel

## Core layout

- Anchor near right edge, roughly x=1620-1880, y=132-760 on 1920x1280.
- One vertical 1px spine, 44px from right bezel.
- Header: `ROUTE`, small caps, above the mast.
- Four rows only: CHATGPT, CLAUDE, GEMINI, COPILOT.
- Generous vertical spacing around 155px.
- Each row contains:
  - node on spine
  - confidence glyph to the right
  - horizontal whisker extending left when quota/headroom is known
  - provider label and value at whisker terminus
  - optional tiny tier/window label

## Visual grammar

- Active provider: amber row plus one faint hairline back toward the optic.
- Confirmed quota: solid node and solid whisker.
- Inferred quota: solid node and dashed whisker, value prefixed `~`.
- Stale quota: hollow node, dotted whisker, stale age shown.
- Unknown quota: hollow node, no whisker, value `—`.
- Error: broken node / rust glyph, no whisker.
- Disabled: very low opacity outline, no value.

## Why this beats a normal quota panel

A conventional widget would add cards, progress bars, and too much text. That would compete with the Augury stream and make the right side feel like a SaaS dashboard. The mast treats quota as an instrument reading, not a table.

## Provider mapping from live tests

- CHATGPT: confirmed, 87%, tier `PROLITE 5H`, secondary 95% weekly.
- CLAUDE: confirmed, 78%, tier `MAX 5H/7D`, secondary 81% weekly.
- GEMINI: confirmed, 100%, tier `STD`.
- COPILOT: reachable, quota unknown, no whisker, value `—`.

## Minimum frontend schema

```json
{
  "route_rail": {
    "as_of_ms": 1716543210000,
    "active_provider_id": "anthropic",
    "providers": [
      {
        "id": "openai-codex",
        "label": "CHATGPT",
        "tier_label": "PROLITE 5H",
        "rank": 1,
        "state": "confirmed",
        "headroom": 0.87,
        "secondary_headroom": 0.95,
        "reachable": true,
        "last_used_age_s": 240,
        "stale_age_s": null
      }
    ]
  }
}
```

Renderer should allowlist fields. Forbidden: account IDs, org IDs, emails, key prefixes, raw errors, request IDs, project IDs, token counts, model IDs, dollar amounts.

## Acceptance gates

- Optic remains visually dominant.
- Rail stays narrow and right-edge aligned.
- At least 60px vertical gap below uptime before `ROUTE` header.
- No rail element crosses into the optic gutter.
- COPILOT unknown state is not mistakable for 0% or 100%.
- Stale data degrades visibly and does not present old percentages as fresh.
- No provider secrets or identifier-like strings appear in DOM.
- No per-frame JS animation. Only optional CSS breath pulse for active hairline.
- SVG node count remains stable over polling updates.

## More dramatic alternative

Claude proposed a `Ribbon Braid`: four thin provider ribbons falling from the clock area and braiding around the optic field. It would be visually striking, but I do not recommend it for the normal dashboard. It risks competing with the optic and is slower to read. Keep it as a possible idle/screensaver mode, not the operational view.

## Final direction

Implement the Subscription Mast as the normal right-side provider route/quota display.
