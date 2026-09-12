# Profile-scoped operator inspection

Hermes `main` now contains a maintainer-authored set of multiplex-gateway fixes that prevent a secondary profile from borrowing the default profile's transport, credentials, or MCP environment. This display change does not claim to verify those upstream internals. It makes the identity already present in the display's passive observation and owner-checked RPC contracts legible before an operator interprets detail or uses an allowed control.

## Display behavior

- The route rail is labeled **ROUTE · PROVIDERS**. The former **ROUTE · HEADROOM** title was stale product wording after Headroom was removed from this installation. Internal `headroom` fields continue to mean ordinary remaining quota.
- Observed-session choices include a compact profile label before the runtime session ID. If compact names collide, both choices expand to their full profile paths, so equal session IDs remain visibly distinguishable.
- Stale observer ownership is stated in text as well as color, and the identity card remains the first detail before work state.
- The selected row begins with a profile identity card. Passive rows show the full observed profile, runtime session and observer owner. RPC rows distinguish a verified owner from an unavailable owner and show connection, runtime and durable session identity.
- Identity values use text rendering. Useful private-home paths remain visible, while the existing credential-specific redaction and family-mode separation are unchanged.
- No new attach, replay, approval, automation or subagent control is added.

## Upstream basis

The relevant fixes are merged on Hermes `main` after `v2026.9.7`: `45a6101f`, `c3e01c75`, `e253ea02`, `580322ef`, `89fb1d02`, `08830efd`, `2b4deeb3`, and `3b044261`. Teknium authored/committed all except `89fb1d02`, which was authored by Nick Seelert and committed by Teknium. These are human-maintainer commits, not inferred approval of an open proposal.

The display remains a passive observer. Its profile card says which identity the display observed or owner-checked; it is not proof that an older Hermes gateway routed every external effect correctly. Upgrade/restart Hermes before relying on secondary-profile delivery or secrets.

Separately, upstream issue #98382 remains open: concurrent calls to the same observer hook can be dropped before the display plugin receives them. Until upstream exposes loss evidence or queues those calls, a fresh display snapshot is exact for received events but cannot prove that every concurrent hook invocation was delivered.

## Review and rollback

The synthetic preview is `docs/profile-scoped-inspection-2026-09-11.svg`. It shows the compact option labels and the full-path identity card without using production data.

Rollback is one display commit. No Hermes configuration or durable state is migrated. After merge, rebuild/restart the display normally; a Python observer restart is not required because this change is browser-only.
