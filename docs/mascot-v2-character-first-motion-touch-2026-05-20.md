# Mascot v2 character-first motion/touch implementation

Date: 2026-05-20

Scope:
- Character body language and display-preset variants for quiet watch, reasoning, planning, working, blocked, feed-stale, and night watch.
- CSS-variable-driven microinteractions tied to adaptive motion variables.
- Character-first touch reactions before kiosk detail overlays.

Implemented behavior:
- Quiet watch is calmer and more watchful: half-lidded, slower blinks, centered gaze bias, smaller wing/tail motion.
- Reasoning is focused instead of sad: focused brows/mouth, upward/forward gaze, scan beam available.
- Planning is attentive/perky: raised brow, brighter eyes, upward gaze, tiny perk/brow-pop intent pool.
- Working is calm/intent: constrained root motion, reduced wing/tail movement, scan/glance intent pool.
- Blocked is serious amber rather than angry red: calmer face-only automatic intents, tight mouth, amber attention colors from runtime color resolver.
- Feed stale gets a diagnostic glance profile: side/down telemetry glances, scan beam, amber alert pulse.
- Night watch remains sleepy/dim with low glow and reduced body motion.
- Runtime now applies bounded CSS variables on the SVG for float duration, blink interval, eye glow, accent intensity, alert pulse, motion scale, and touch highlight opacity.
- Runtime honors `prefers-reduced-motion` directly in addition to packet adaptive-motion flags.
- Wings/visor/eyes now get low-cost expressive opacity/glow cues using existing SVG IDs/classes.
- Touch reactions use `renderer.reactToTouch(zone)` so left/right/center taps first make Hermes glance/perk/blink and briefly highlight before showing overlays.

Notes:
- No mascot artwork was replaced.
- Audio behavior was not changed.
- Thermal/load adaptive motion remains handled through packet motion variables and renderer perf tiers.
