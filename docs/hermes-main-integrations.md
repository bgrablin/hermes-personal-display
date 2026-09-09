# Hermes main integrations

Current follow-up baseline: display `main` **cefe1d646162b0b43aa5d9e92fbba6d508fe4222**.
Upstream contracts inspected through Hermes `main` **4a39a3ff8bea45ab5a6b646ce26ced88a8fed079**.
Branch: `feat/observed-subagent-cards`. This document describes repository behavior, including the proposed follow-up, not the deployed display.

## Merged capability inventory

| Upstream contract | Display integration | Evidence |
| --- | --- | --- |
| Redirected terminal work yields to background | Track returned process ID independently from the parent turn; show continuing, exited/exit code, or unknown | [4632923](https://github.com/NousResearch/hermes-agent/commit/463292351fec7ea74013e8ff6080eba82806cab3), `tools/terminal_tool.py` |
| Foreground timeout promotion | Same entity handling when `promoted_from_foreground` is returned, including when completion notification is unavailable | [55d61f1](https://github.com/NousResearch/hermes-agent/commit/55d61f16bab79826d5cced66ee604c8df8037ecd) |
| Session automation RPCs | Read goals, subgoals, gates, waits, loops and heartbeat; opt-in pause/resume of goal/loop/heartbeat | [#104246](https://github.com/NousResearch/hermes-agent/pull/104246), `tui_gateway/methods_session_control.py` |
| Provider call telemetry | Touch details include model, actual upstream, request latency, input/output/total, cache read/write, response ID and log timestamp prefix | [6d2645e](https://github.com/NousResearch/hermes-agent/commit/6d2645e64ec4a4e54b407d9dc35969b39371d6e8), `agent/turn_usage.py` |
| Profile-scoped cached MCP health | RPC inspection lists server name, transport, tool count and status with `checked_at`; no probe, OAuth or connect action | [#104527](https://github.com/NousResearch/hermes-agent/pull/104527) |
| Delegation completion units | Preserve explicit `units[].delegation_id`, group and task indexes; overall settlement requires all expected units terminal | [028fe2c](https://github.com/NousResearch/hermes-agent/commit/028fe2c4c857710ab335a8455f5cbbcc52cbf795), `tools/delegate_tool_dispatch.py` |
| Existing reconnect settling error | `4009` disables controls, retains the last snapshot and retries only reads; no automatic prompt or mutation replay | `tui_gateway` RPC error contract |
| Existing lifecycle observers | In-process plugin observes tool/API/turn hooks across CLI and gateway; keeps source epoch, profile and session identity | `hermes_cli/plugins.py`, `model_tools.py`, hooks documentation |
| Subagent lifecycle hooks | Keep a bounded, credential-redacted task name and exact child session/subagent identity from `subagent_start`; settle only the matching child session on `subagent_stop` | `tools/delegate_tool.py`, `tools/delegate_tool_results.py` |

Rechecked September 7: #103954 (overview), #103950 (compression rollback), #103961 and #101911 (Kanban restart ownership), #104189 (reconnect sentinel repair), and #91475 (durable turn receipts) remain open/unmerged. Their proposed APIs are not implemented. Compression events do not trigger a success claim. Observed hook `turn_id` may be retained, but is not treated as a durable receipt.

## Architecture and state behavior

The optional `integrations/display-observer` plugin runs inside the actual Hermes process. Hook callbacks extract bounded metadata into a queue. A daemon snapshots it every two seconds into private, atomic per-process files. It reads the existing process registry without calling `poll`, `wait`, or draining completion notifications. Delegations use the upstream read-only registry snapshot and exact dispatch-unit IDs. A child stop is never interpreted as a batch stop.

The display collector reads these snapshots without importing Hermes or launching an agent. Positive observed work drives the existing resolver and eye/headline contract. A background command survives parent completion. Missing registry entities, stale process epochs, and event loss produce unknown rather than idle or successful completion. Sources older than 20 seconds are stale. The latest terminal observation is presented briefly; failed/interrupted work gets attention, rather than a successful-completion presentation. A process exit code is separate from the parent outcome.

The private endpoint `/api/hermes-integration` contains lifecycle sources, RPC inspection and recent provider telemetry. It accepts loopback requests only. Its schema lives in `schemas/hermes-integration.schema.json` and is included in generated browser/Python contracts. Private details are not added to the family state projection or public avatar-event bus. Strings use the existing credential-only private redactor before bounding; the browser inserts them as text. Provider telemetry is explicitly a recent log observation, not a current route, cumulative billing figure, or quota estimate. Missing cache values remain unknown.

The optional RPC monitor connects only to explicitly configured local WebSocket endpoints. Use an SSH tunnel for another host. It does not start, resume, activate, or reattach sessions. Each target is pinned to connection name, profile, runtime ID and durable ID. `session.status` verifies the durable ID before `session.control.read` or any action. Unavailable targets remain unavailable; no foreground-session fallback exists.

RPC reads continue after `message.complete`. Revision equality deduplicates identical control snapshots. Matching sequenced `session.control.update` events invalidate the exact target; serialized periodic reads hydrate it again. Events do not overwrite in-flight reads. Reconnection clears event watermarks and hydrates from the owning process. This is polling with event invalidation, not an assertion of a globally ordered event log.

### September 9 subagent contract decision

Hermes main now has `subagent.list`, `subagent.tail`, `subagent.steer` and `subagent.interrupt` for TUI and Desktop clients. The roster and tail are useful, but the server intentionally grants them only to a transport already attached to the exact live session. The display monitor is a separate passive transport and does not call `session.resume`, because attaching would update session membership/liveness and cancel orphan cleanup. This follow-up therefore does not call those RPCs or expose steer/interrupt. It uses the stable observer hooks already invoked by CLI, gateway, TUI and Desktop execution instead.

The merged upstream implementation is [8b01df9](https://github.com/NousResearch/hermes-agent/commit/8b01df963d2e121ce800bccece3d750002c24ffd), with ownership/progress hardening in [924c5de](https://github.com/NousResearch/hermes-agent/commit/924c5ded2eca54070e1e1e239ea8d6a1540aa064) and shared-transport authority in [68ed3ff](https://github.com/NousResearch/hermes-agent/commit/68ed3ffd105faebeec7f0022f1438b80a704d860). A future passive-reader contract must identify the owner and generation without making the display a session member. Until then, the live transcript and action controls remain intentionally absent.

## Touch and interaction specification

Tap a provider rail row or the Tasks cell to open **Sessions & automation**. Choose a source-qualified session. Inspect background processes, dispatch units, observed subagent cards, automation state and cached MCP health. A subagent card shows the bounded task name, role, exact subagent and child-session IDs, observed status and duration when available. Provider call details appear beneath the selected session. The panel stays open and scrolls; Refresh updates the snapshot. Escape and Close dismiss it. All action targets are at least 44 px tall. Existing smaller eye, blue motes, eye drag, Augury pinning, palette and family interactions remain intact.

When enabled for that exact configured target, pause/resume buttons are available for configured goal, loop and heartbeat entities. Feedback distinguishes applied, changed revision, unavailable, rejected and unknown outcome. Buttons disable after a click until details are refreshed. POST requires loopback plus same-origin. The backend re-reads owner identity and revision before dispatch. Queued requests expire; disconnect rejects queued requests. A transmitted action is never retried automatically. Upstream does not offer atomic revision compare-and-set: the read-before-action check narrows, but cannot eliminate, the race. These limited pause/resume operations avoid arbitrary commands and destructive automation edits.

Interrupt, redirect, execution approvals, gate execution, clear/stop, subagent steer/interrupt, and subgoal mutations are deliberately not exposed as touch commands in this PR. The merged state for those objects is readable. Pause automation is not Stop agent.

## Install and configure

Keep machine paths, tokens and session IDs outside Git. The example URL is illustrative; use the actual dashboard endpoint and its required authentication.

1. Install the display branch normally and build it with `npm ci && npm run build`.
2. Link the observer into each Hermes profile that should report work. Replace the checkout path:

   ```bash
   mkdir -p ~/.hermes/plugins
   ln -s /absolute/path/hermes-personal-display/integrations/display-observer ~/.hermes/plugins/display-observer
   ```

   The symlink is intentional: the plugin resolves the repository's tested Python modules. Do not copy only its two entrypoint files. Follow the profile's normal plugin enable/reload process and restart that Hermes process during your maintenance window. No upstream fork is required. The plugin does not load historical work that started before installation.

   Validate the source package from the repository root before enabling it:

   ```bash
   hermes plugins doctor integrations/display-observer --ci
   hermes plugins compat integrations/display-observer
   ```

   Plugin Doctor copies the entrypoint into an isolated home. The entrypoint therefore supports the live symlink target, repository-root discovery during isolated validation, and the updater's complete immutable project archives. It rejects partial trees that contain the observer module without the project manifest and verification script; a copied standalone plugin remains intentionally unsupported because it would separate the observer from the tested display modules.

3. Both Hermes and the display must use the same local `HERMES_DISPLAY_INTEGRATION_DIR` when they do not share `~/.hermes/display/integration`. Directory/file modes are 0700/0600. Do not point it at another user's untrusted directory. Old epoch files are retained as stale evidence; archive them deliberately after resolving their outstanding work. Reads are limited to the newest 32 sources and 512 KB per source; each source retains up to 64 sessions and 64 processes/delegations per session. Capacity loss is explicitly reported.
4. For RPC features, install the optional dependency in the display server's Python environment:

   ```bash
   python3 -m pip install -r integrations/requirements.txt
   ```

   Copy `integrations/rpc-config.example.json` outside Git, fill the exact owning dashboard connection, profile, runtime and stored session IDs, restrict the file to mode 0600, and set `HERMES_DISPLAY_RPC_CONFIG` to that absolute file in the display service environment. Obtain IDs from the existing owning client's session metadata; do not create/resume a session just to get an ID. Keep `allow_controls: false` for read-only commissioning, then enable only the targets you intend to control. The server reads configuration once at startup.
5. Open provider/Tasks inspection and verify the selected owner, freshness, automation and MCP coverage. A standalone Discord/Telegram/CLI process may supply lifecycle observations but have no session in the configured TUI/dashboard server. Its automation controls must remain unavailable until an actual owning RPC session exists.

## Validation and acceptance

Automated evidence is recorded in the PR. Python tests cover redirected/promoted processes surviving parent completion, authoritative registry settlement, missing processes, exact delegation units, profile isolation, stale snapshots, redaction, optional telemetry, RPC revision/identity checks, 4009 retention, mutation expiration/no retries, real local WebSocket RPC framing, and real HTTP loopback/origin/family boundaries. Browser tests exercise both 1920×1280 and 320×480 inspection, literal markup, exact target/action payloads, failure feedback, scrolling/dismissal, and family isolation. Existing private Augury and touch regression tests also run.

R03/R05 gain authoritative background-state handling; R04 gains useful operational inspection and bounded actions; R07 gains provider and operational detail; R09 gains contracts, deployment guidance and source evidence. R01/R02/R06/R08 remain the accepted visual baseline. No physical viewing-distance, touchscreen mapping, live Hermes deployment, or upgraded-host performance measurement is claimed. Synthetic browser screenshots are labeled as preview evidence.

## Rollback and remaining limits

To disable integration, remove the observer symlink and restart the affected Hermes process; unset `HERMES_DISPLAY_RPC_CONFIG` and restart the display server. Archive observer snapshot files if you want the legacy collector restored immediately rather than showing stale unsettled work. To roll back code, revert the integration PR, regenerate the build identity, rebuild and restart the display using its existing deployment procedure. No upstream state files are modified by observation. Applied automation changes persist upstream; reverse them explicitly in Hermes if needed.

Process/async registry and subagent lifecycle observations are best effort, tied to the pinned upstream version, and cannot reconstruct every event lost during a crash. A `subagent_stop` without its earlier start is explicitly labeled instead of being joined by role or order. Missing entities and previous epochs stay unknown. RPC session status currently returns text; exact durable-ID line verification fails closed if that contract changes. No global gateway inventory or cross-process command router is invented. Poll latency grows with configured targets; old rows disable controls at 20 seconds. Credential patterns cannot prove arbitrary upstream prose secret-free. Validate the actual profile/host topology, auth setup, long-running command completion and physical touch before deployment acceptance.

### Follow-up verification, September 9

- Hermes plugin compatibility scan reports zero deprecated imports for `integrations/display-observer`; the observer is not disabled by the September 14 compatibility cutoff.
- Subagent regression coverage includes exact start/stop identity, useful task/path preservation, credential masking, unmatched-stop labeling, family projection isolation and inert markup rendering.
- [Synthetic subagent-card preview](observed-subagent-cards-2026-09-09.svg) shows the proposed operator-only hierarchy and state colors. It is a layout preview, not a physical-panel photograph.

### Local verification, September 7

- `npm test`: 53 JavaScript tests and 137 Python tests, plus stack, generated contract and build-ID checks passed.
- Focused new Python integration suite: 14 tests, including real loopback HTTP and WebSocket traffic.
- Focused browser suite: nine executed tests passed, five viewport-inapplicable cases skipped. After the compact-header correction, all four new browser cases passed again across both viewports.
- Production build, client-event negative cases, kiosk and Augury checks passed. Focused Ruff and JavaScript syntax checks passed. Chromium 149 was used locally because the Playwright-matching Chromium 148 download timed out; CI uses its matching browser.
- [Synthetic 1920×1280 inspection preview](hermes-integration-preview-2026-09-07.png). The literal `<img>` text is an intentional inert-markup test, and all session/provider data in this screenshot is synthetic.

### PR review correction

Failed RPC verification now discards cached control/MCP details and observation timestamps. Only the explicit `4009` RPC error retains last-known details, with actions disabled and the original observation time. The MCP polling pass does not repopulate a row whose session verification failed. Valid subsequent hydration replaces the discarded control snapshot.

Configuration diagnostics distinguish duplicate connection names, the eight-connection limit, duplicate runtime session IDs, and the sixteen-session limit. Only fixed messages reach the UI; parser/dependency failures retain a generic message that cannot expose configuration credentials. The observer precedence docstring now includes observation gaps and stale unsettled work.
