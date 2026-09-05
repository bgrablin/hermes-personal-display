# Private operator inspection

This follow-up builds on PR #3 (`7783257`) for Brian's private home touchscreen.
It changes operator content and inspection, with bounded reliability fixes. It does
not install a Hermes plugin or issue agent commands.

## Operator content

The canonical `?kiosk=1&orientation=landscape&augury=1` URL now shows the existing
Augury feed's redacted excerpts by default. Ordinary paths, task/request text,
commands, structured results and diagnostic vocabulary are useful context here.
Only credential-shaped values are masked in this feed. The server redacts before
truncating; the browser applies the same categories and uses textContent.
Excerpts remain bounded to 320 characters. They are observations from the log,
not a claim to expose hidden reasoning or every tool's complete output.

Use `auguryText=0` for compact titles without log bodies, or omit `augury=1` to
hide the rail. Compact mode is a presentation preference, not an authorization
boundary: the private feed is still fetched. Family mode mounts no operator
rail or inspector and makes no Augury requests. Existing loopback Host/Origin
checks remain. Broad ambient lifecycle packets and family-generated captions
retain their existing contracts; rich content stays in the private operator rail.

Credential masking covers assignment-shaped passwords and keys (including quoted
JSON values), authorization/cookie headers, bearer values, common API/PAT/JWT
shapes, signed URL credentials and PEM private-key blocks. It no longer assumes
that any long identifier or ordinary structured payload is a secret. This is
pattern-based redaction, not proof that arbitrary source text contains no secrets.

## Touch and keyboard

Tap an Augury observation, or focus it and press Enter/Space, to open its bounded
excerpt. The snapshot includes its kind/title and available age/session metadata.
The dialog marks it as pinned; the recorded age is the age at selection, not a live
clock. The list stays still while the dialog is open. Feed polling, feed-health
indicators, and the eye continue updating; closing the dialog renders the latest
pending rows. The selected excerpt never silently changes beneath the reader.

Close, Escape, or contact outside the dialog releases the hold. Unlike metric
inspection, a pinned observation does not dismiss after 15 seconds. The dialog
scrolls when needed, and log markup is rendered as text. Metric/provider controls
retain their existing behavior. CPU help now explains that the built-in metric is
normalized one-minute load, not sampled CPU utilization.

## Reliability scope

- Replayed events are ignored before lifecycle and animation side effects using
  producer + event ID. The page retains IDs through their event TTL, up to 4096
  entries. This protects normal reconnect replay; page reloads and eviction past
  that bound are not durable replay guarantees.
- An expired work observation and an old request without a fresh lifecycle record
  no longer say that work completed or that no turn is running. Compatibility
  `active=false` means there is no fresh evidence of active work; the copy says
  current work is unknown. This is not a new authoritative activity state.
- Producer epochs, snapshot/event ordering and headline/eye reconciliation are
  still separate follow-up work. Client receipt order cannot solve these safely.
- Session interruption/approval controls remain pending verification of the
  owner process and session identity. This PR sends no operational commands.

## Validation and rollout

Run `npm test`, `npm run check:client-events`, `npm run check:kiosk`,
`npm run check:augury-feed` and `npm run build`. Browser coverage in
`private-operator.spec.js` checks selection hold across real polling, dismissal,
keyboard access, inert markup, compact mode and family isolation. Existing
operator-touch and dashboard-balance tests cover adjacent interactions/layout.

The build-ID generator updates cache keys through the normal `npm run build`
process. After merge, deploy through the existing host checkout and documented
`hermes-display` workflow. Record the deployed commit, restart the display and
run `hermes-display verify`; verify real touch, orientation, readability and live
feed behavior separately. No host deployment is performed by this PR.

For a quick presentation rollback, add `auguryText=0`. For code rollback, return
the deployment checkout to its recorded previous commit, rebuild through the
normal build-ID process, restart and verify. Keep machine-specific configuration
outside Git.
