import { test, expect } from '@playwright/test';

const snapshot = {
  schema_version: 1, coverage: 'observed',
  sources: [{ owner: 'observer-1', fresh: true, age_seconds: 2, sessions: [{ profile: '/home/brian/.hermes', session_id: 'parent', status: 'completed',
    processes: [{ session_id: 'proc-A', status: 'running' }], delegations: [{ delegation_id: 'batch', settled: false,
      units: [{ delegation_id: 'unit-A', task_indexes: [0], status: 'completed' }, { delegation_id: 'unit-B', task_indexes: [1], status: 'running' }] }],
    subagents: [{ subagent_id: 'child-1', child_session_id: 'child-session', role: 'leaf', goal: 'Review <img src=x onerror=alert(1)> optic spacing', status: 'running' }] }] }],
  rpc: { status: 'configured', sessions: [{ connection: 'home', profile: 'default', session_id: 'runtime', stored_session_id: 'stored', available: true, age_seconds: 2,
    control: { revision: 'rev1', goal: { title: '<img src=x onerror=alert(1)>', status: 'active' }, loop: null, heartbeat: null }, actions: ['goal.pause'],
    mcp: { checked_at: 123, servers: [{ name: 'context7', status: 'configured', transport: 'stdio', tools: 0 }] } }] },
  provider_calls: [{ model: 'test-model', provider: 'route', upstream: 'serving-provider', latency_seconds: 1.5, cache_write: 100, response_id: 'req-test' }],
  cron_incidents: { available: true, open: 1, recent: 1, summary: '1 open scheduler incident', incidents: [{
    id: 'job-1_abcd1234', job_id: 'job-1', job: 'Improve Hermes Display Screen', profile: 'silver',
    state: 'alerted', failure_type: 'timeout', first_seen_at: '2026-09-15T00:00:00+00:00',
    last_seen_at: '2026-09-15T01:00:00+00:00', age_seconds: 120, recent: true,
    error: 'Provider request timed out; verify before retrying.', output_file: '/home/brian/.hermes/cron/output/job-1/run.md',
  }] },
};

const uncertainSnapshot = structuredClone(snapshot);
uncertainSnapshot.sources[0].sessions[0].tool_outcome = {
  status: 'unknown', tool_name: 'mcp.crm.update',
  message: 'Operation may have completed; inspect <img src=x onerror=alert(2)> before retrying.',
};

const interruptedSnapshot = structuredClone(snapshot);
interruptedSnapshot.sources[0].sessions[0] = {
  profile: '/home/brian/.hermes', session_id: 'parent', status: 'interrupted',
  interruption: { reason: 'user_stop', invalidation_reason: 'session_interrupt', platform: 'tui' },
  processes: [], delegations: [], subagents: [],
};

// A non-user interruption reason must remain readable verbatim, not humanized.
const gatewayInterruptSnapshot = structuredClone(interruptedSnapshot);
gatewayInterruptSnapshot.sources[0].sessions[0].interruption = {
  reason: 'tool_invalidation', platform: 'gateway',
};

const concurrentToolsSnapshot = structuredClone(snapshot);
concurrentToolsSnapshot.sources[0].sessions[0] = {
  profile: '/home/brian/.hermes', session_id: 'parent', status: 'running',
  processes: [], delegations: [], subagents: [],
  tools: [
    { tool_call_id: 'call-search-1', turn_id: 'turn-7', tool_name: 'search_files', status: 'running', observed_started_at: 1 },
    { tool_call_id: 'call-read-2', turn_id: 'turn-7', tool_name: 'read_file', status: 'running', observed_started_at: 2 },
    { tool_call_id: 'call-done-3', turn_id: 'turn-7', tool_name: 'list_directory', status: 'completed', duration_ms: 830 },
  ],
};

test('concurrent tool calls remain separate and touch-readable', async ({ page }, info) => {
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: concurrentToolsSnapshot }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=working');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  await expect(panel.locator('.cb-work-summary')).toContainText('2 tool calls active');
  await expect(panel.locator('.cb-work-summary')).toHaveAttribute('data-state', 'active');
  await expect(panel.locator('.cb-work-summary')).toContainText('Tools: 3');
  await expect(panel).toContainText('OBSERVED TOOL CALLS');
  await expect(panel.locator('.cb-tool-activity-detail')).toHaveCount(3);
  await expect(panel.locator('.cb-tool-activity-detail').nth(0)).toContainText('search_files');
  await expect(panel.locator('.cb-tool-activity-detail').nth(0)).toContainText('Call call-search-1 · turn turn-7');
  await expect(panel.locator('.cb-tool-activity-detail').nth(1)).toContainText('read_file');
  await expect(panel.locator('.cb-tool-activity-detail').nth(2)).toContainText('list_directory');
  await expect(panel.locator('.cb-tool-activity-detail').nth(2)).toContainText('completed · 0.8s');
  await expect(panel.locator('.cb-tool-activity-detail').nth(0)).toBeInViewport();
  await page.screenshot({ path: `test-results/concurrent-tools-${info.project.name}.png`, animations: 'disabled' });
});

test('non-user interruption reason stays readable without an invalidation reason', async ({ page }) => {
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: gatewayInterruptSnapshot }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=completed');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  const card = panel.locator('.cb-interruption-detail');
  await expect(card).toContainText('TURN INTERRUPTED');
  await expect(card).toContainText('Interrupted: tool_invalidation');
  await expect(card).toContainText('Surface gateway');
  // The observed reason is rendered in the card body; the small line omits the
  // missing invalidation_reason rather than leaving an empty Reason entry.
  await expect(card).not.toContainText('Reason undefined');
  await expect(card).not.toContainText('Reason null');
});

test('private integration shows background units, exact controls and literal text', async ({ page }, info) => {
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: uncertainSnapshot }));
  let sent;
  await page.route('**/api/hermes-integration/control', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: false, status: 'control temporarily unavailable' } });
  });
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  await expect(panel).toBeVisible();
  await expect(page.getByLabel('Observed Hermes session').locator('option').first()).toHaveText(/\.hermes \/ parent/);
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('OBSERVED PROFILE');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('Profile /home/brian/.hermes');
  await expect(panel.locator(':scope > select + div > :first-child')).toHaveClass(/cb-owner-scope-detail/);
  await expect(panel).toContainText('Process proc-A: running');
  await expect(panel).toContainText('unit-B');
  await expect(panel).toContainText('OBSERVED SUBAGENTS');
  await expect(panel).toContainText('OUTCOME NEEDS VERIFICATION');
  await expect(panel).toContainText('mcp.crm.update · unknown');
  await expect(panel).toContainText('inspect <img src=x onerror=alert(2)> before retrying');
  await expect(panel).toContainText('Review <img src=x onerror=alert(1)> optic spacing');
  await expect(panel.locator('img')).toHaveCount(0);
  await expect(panel).toContainText('serving-provider');
  await expect(panel).toContainText('SCHEDULER INCIDENTS · READ-ONLY');
  await expect(panel.locator('.cb-cron-incident-detail')).toContainText('Improve Hermes Display Screen');
  await expect(panel.locator('.cb-cron-incident-detail')).toContainText('silver · job-1_abcd1234');
  await expect(panel.locator('.cb-cron-incident-detail')).toContainText('/home/brian/.hermes/cron/output/job-1/run.md');
  await page.screenshot({ path: `test-results/background-work-${info.project.name}.png`, animations: 'disabled' });
  await page.getByLabel('Observed Hermes session').selectOption('1');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('RPC OWNER VERIFIED');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('Connection home · runtime runtime · stored stored');
  await expect(panel).toContainText('<img src=x onerror=alert(1)>');
  await expect(panel.locator('img')).toHaveCount(0);
  await expect(panel).toContainText('cached observation');
  await panel.getByRole('button', { name: 'pause goal', exact: true }).click();
  expect(sent).toEqual({ connection: 'home', profile: 'default', session_id: 'runtime', stored_session_id: 'stored', revision: 'rev1', action: 'goal.pause' });
  await expect(panel).toContainText('control temporarily unavailable');
  await expect(panel.getByRole('button', { name: 'pause goal', exact: true })).toBeDisabled();
  const rect = await page.getByRole('dialog').boundingBox();
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.y + rect.height).toBeLessThanOrEqual(info.project.use.viewport.height + 1);
  await expect(page.getByRole('button', { name: 'Close detail' })).toBeInViewport();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(info.project.use.viewport.width + 1);
  await page.screenshot({ path: `test-results/integration-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('family mode does not request operator integration', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().includes('/api/hermes-integration')) requests.push(request.url()); });
  await page.goto('/src/character-runtime.html?kiosk=1&family=1');
  await page.waitForTimeout(400);
  expect(requests).toEqual([]);
});

test('interrupted turn has a distinct readable outcome card', async ({ page }, info) => {
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: interruptedSnapshot }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=completed');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  const card = panel.locator('.cb-interruption-detail');
  await expect(panel.locator('.cb-work-summary')).toContainText('Turn interrupted');
  await expect(card).toContainText('TURN INTERRUPTED');
  await expect(card).toContainText('Stopped by user request');
  await expect(card).toContainText('Surface tui · Reason session_interrupt');
  await expect(card).toBeInViewport();
  // The visual contract is "the eye moves, the words don't": the centered
  // operator activity copy must stay stationary when the card scrolls.
  // Baseline the panel, re-run the scoping operation, and require the activity
  // copy's frame geometry to be identical to home across the card operation.
  const captured = await page.evaluate(() => {
    const read = () => {
      const activity = document.querySelector('.cb-activity');
      const panel = document.querySelector('.cb-integration');
      return {
        activityBefore: activity?.getBoundingClientRect(),
        activityTransform: activity ? getComputedStyle(activity).transform : null,
        panelComputedTransform: panel ? getComputedStyle(panel).transform : null,
        activityText: (activity?.textContent || '').trim(),
      };
    };
    const home = read();
    const card = document.querySelector('.cb-interruption-detail');
    const before = card?.getBoundingClientRect();
    if (before) card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const after = card?.getBoundingClientRect();
    const cardDelta = before && after
      ? Math.hypot(after.top - before.top, after.left - before.left)
      : null;
    const moved = read();
    return { home, moved, cardDelta };
  });
  expect(captured.home.activityText.length).toBeGreaterThan(0);
  expect(captured.home.activityBefore.width).toBeGreaterThan(0);
  expect(captured.home.activityBefore.height).toBeGreaterThan(0);
  // The panel's own translateX(-50%) centering transform is fixed CSS, not a
  // scroll effect; require identical computed values across the card operation.
  expect(captured.moved.activityTransform).toBe(captured.home.activityTransform);
  expect(captured.moved.panelComputedTransform).toBe(captured.home.panelComputedTransform);
  // Before/after geometry is identical, not merely nonzero.
  expect(Math.hypot(
    captured.moved.activityBefore.right - captured.home.activityBefore.right,
    captured.moved.activityBefore.bottom - captured.home.activityBefore.bottom,
    captured.moved.activityBefore.top - captured.home.activityBefore.top,
    captured.moved.activityBefore.left - captured.home.activityBefore.left,
  )).toBe(0);
  expect(captured.cardDelta).toBeLessThanOrEqual(0.001);
  await page.screenshot({ path: `test-results/interrupted-turn-${info.project.name}.png`, animations: 'disabled' });
});

test('refresh preserves exact session and never substitutes a missing owner', async ({ page }) => {
  let data = structuredClone(snapshot);
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: data }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  await expect(panel.locator('.cb-work-summary')).toContainText('1 background command continuing');
  await page.getByLabel('Observed Hermes session').selectOption('1');
  data.sources.unshift({ owner: 'new-owner', fresh: true, age_seconds: 0, sessions: [{ session_id: 'new', status: 'running' }] });
  await panel.getByRole('button', { name: 'Refresh details' }).click();
  await expect(page.getByLabel('Observed Hermes session')).toHaveValue('2');
  await expect(panel).toContainText('cached observation');
  data.rpc.sessions[0].stored_session_id = 'replacement-owner';
  await panel.getByRole('button', { name: 'Refresh details' }).click();
  await expect(panel).toContainText('Selected session is no longer observed');
  await expect(panel.getByRole('button', { name: 'pause goal', exact: true })).toHaveCount(0);
  await page.getByLabel('Observed Hermes session').selectOption('1');
  data.sources[1].fresh = false;
  await panel.getByRole('button', { name: 'Refresh details' }).click();
  await expect(panel.locator('.cb-work-summary')).toHaveAttribute('data-state', 'unknown');
  await expect(panel.locator('.cb-work-summary')).toContainText('Last-known work · refresh to verify');
  await expect(panel.locator('.cb-owner-scope-detail')).toHaveAttribute('data-state', 'stale');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('OBSERVED PROFILE · STALE');
  data.rpc.sessions[0] = { ...data.rpc.sessions[0], available: false, actions: [], error: 'cached observation' };
  await panel.getByRole('button', { name: 'Refresh details' }).click();
  await page.getByLabel('Observed Hermes session').selectOption('2');
  await expect(panel.locator('.cb-owner-scope-detail')).toHaveAttribute('data-state', 'unavailable');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('RPC OWNER UNAVAILABLE');
});

test('same session id in two profiles remains visibly distinguishable', async ({ page }) => {
  const data = structuredClone(snapshot);
  data.sources[0].sessions.push({ ...structuredClone(data.sources[0].sessions[0]), profile: '/srv/other/.hermes', processes: [], delegations: [], subagents: [] });
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: data }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const select = page.getByLabel('Observed Hermes session');
  await expect(select.locator('option')).toHaveText([
    /\/home\/brian\/\.hermes \/ parent · observed/,
    /\/srv\/other\/\.hermes \/ parent · observed/,
    /home \/ default \/ runtime/,
  ]);
  await select.selectOption('1');
  await expect(page.locator('.cb-owner-scope-detail')).toContainText('Profile /srv/other/.hermes');
});

test('held details expire in place and require an explicit fresh read', async ({ page }, info) => {
  await page.clock.install();
  let reads = 0;
  let writes = 0;
  await page.route('**/api/hermes-integration', route => { reads++; return route.fulfill({ json: snapshot }); });
  await page.route('**/api/hermes-integration/control', route => { writes++; return route.fulfill({ json: { status: 'applied' } }); });
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  const select = page.getByLabel('Observed Hermes session');
  await select.selectOption('1');
  const pause = panel.getByRole('button', { name: 'pause goal', exact: true });
  await expect(pause).toBeEnabled();
  await expect(panel.locator('.cb-snapshot-freshness')).toContainText('SNAPSHOT');
  await pause.focus();
  const node = await panel.locator('.cb-owner-scope-detail').elementHandle();
  await page.clock.fastForward(21_000);
  await expect(panel.locator('.cb-snapshot-freshness')).toContainText('LAST-KNOWN');
  await expect(panel.locator('.cb-owner-scope-detail')).toContainText('RPC OWNER · LAST-KNOWN');
  await expect(pause).toBeDisabled();
  expect(await node.evaluate(el => el.isConnected)).toBe(true);
  // A programmatic late click also checks expiry before dispatch, even if timers were suspended.
  await pause.dispatchEvent('click');
  expect(writes).toBe(0);
  await select.selectOption('0');
  await expect(panel.locator('.cb-work-summary')).toContainText('Last-known work · refresh to verify');
  await expect(panel.locator('.cb-owner-scope-detail')).toHaveAttribute('data-state', 'stale');
  await expect(panel).toContainText('Process proc-A: running');
  await select.selectOption('1');
  await expect(pause).toBeDisabled();
  expect(reads).toBe(1);
  await panel.getByRole('button', { name: 'Refresh details' }).click();
  await expect(select).toHaveValue('1');
  await expect(pause).toBeEnabled();
  expect(reads).toBe(2);
  // Advance the wall clock without running intervals. The dispatch-time check
  // must catch staleness before the next UI timer (e.g. a suspended tablet).
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 21_000));
  await pause.dispatchEvent('click');
  await expect(pause).toBeDisabled();
  await panel.evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: `test-results/snapshot-expiry-${info.project.name}.png`, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await page.clock.fastForward(30_000);
  expect(reads).toBe(2);
  expect(writes).toBe(0);
});

test('unknown or already old ages never enable snapshot controls', async ({ page }) => {
  const data = structuredClone(snapshot);
  delete data.rpc.sessions[0].age_seconds;
  data.sources[0].age_seconds = 25;
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: data }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  await expect(panel.locator('.cb-snapshot-freshness')).toContainText('LAST-KNOWN');
  await page.getByLabel('Observed Hermes session').selectOption('1');
  await expect(panel.locator('.cb-snapshot-freshness')).toContainText('Age unavailable');
  await expect(panel.getByRole('button', { name: 'pause goal', exact: true })).toBeDisabled();
});
