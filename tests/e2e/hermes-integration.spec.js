import { test, expect } from '@playwright/test';

const snapshot = {
  schema_version: 1, coverage: 'observed',
  sources: [{ owner: 'observer-1', fresh: true, age_seconds: 2, sessions: [{ session_id: 'parent', status: 'completed',
    processes: [{ session_id: 'proc-A', status: 'running' }], delegations: [{ delegation_id: 'batch', settled: false,
      units: [{ delegation_id: 'unit-A', task_indexes: [0], status: 'completed' }, { delegation_id: 'unit-B', task_indexes: [1], status: 'running' }] }] }] }],
  rpc: { status: 'configured', sessions: [{ connection: 'home', profile: 'default', session_id: 'runtime', stored_session_id: 'stored', available: true,
    control: { revision: 'rev1', goal: { title: '<img src=x onerror=alert(1)>', status: 'active' }, loop: null, heartbeat: null }, actions: ['goal.pause'],
    mcp: { checked_at: 123, servers: [{ name: 'context7', status: 'configured', transport: 'stdio', tools: 0 }] } }] },
  provider_calls: [{ model: 'test-model', provider: 'route', upstream: 'serving-provider', latency_seconds: 1.5, cache_write: 100, response_id: 'req-test' }],
};

test('private integration shows background units, exact controls and literal text', async ({ page }, info) => {
  await page.route('**/api/hermes-integration', route => route.fulfill({ json: snapshot }));
  let sent;
  await page.route('**/api/hermes-integration/control', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: false, status: 'control temporarily unavailable' } });
  });
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning');
  await page.locator('.cb-bottom-rail .cb-cell').last().press('Enter');
  const panel = page.locator('.cb-integration');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Process proc-A: running');
  await expect(panel).toContainText('unit-B');
  await expect(panel).toContainText('serving-provider');
  await page.getByLabel('Observed Hermes session').selectOption('1');
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
