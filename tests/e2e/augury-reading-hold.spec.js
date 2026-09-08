import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape&augury=1&auguryText=1&mode=reasoning';

test('hold rows keeps a readable snapshot while polling and inspection continue', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  let polls = 0;
  let text = 'Reading /home/brian/project/state.js';
  await page.route('**/api/augury-feed**', route => {
    polls++;
    return route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool read_file', text, age_seconds: 12 },
    ] } });
  });
  await page.goto(url);
  const row = page.getByRole('button', { name: 'Inspect read_file', exact: true });
  await expect(row).toContainText(text);
  const hold = page.getByRole('button', { name: 'Hold rows', exact: true });
  await expect(hold).toHaveAttribute('aria-pressed', 'false');
  const bounds = await hold.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  const headingBounds = await page.locator('.augury-heading').boundingBox();
  const listBounds = await page.locator('.augury-list').boundingBox();
  expect(bounds.y).toBeGreaterThan(headingBounds.y + headingBounds.height);
  expect(bounds.y + bounds.height).toBeLessThan(listBounds.y);
  await page.screenshot({ path: 'test-results/augury-reading-live.png' });
  await hold.tap();
  const resume = page.getByRole('button', { name: 'Resume rows', exact: true });
  await expect(resume).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · HELD');
  text = 'New observation <img src=x onerror=window.injected=true>';
  const before = polls;
  await expect.poll(() => polls, { timeout: 8000 }).toBeGreaterThan(before);
  await expect(row).toContainText('/home/brian/project/state.js');
  await expect(page.locator('.augury-feed-status')).toContainText('RECENT LOG');
  await row.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('/home/brian/project/state.js');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(row).toContainText('/home/brian/project/state.js');
  await expect(resume).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/augury-reading-hold.png' });
  await resume.press('Space');
  await expect(row).toContainText(text);
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · ACTIVITY');
  await expect(page.locator('.augury-list img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('resuming rows does not unpin an open excerpt and family exposes no hold control', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  let polls = 0;
  await page.route('**/api/augury-feed**', route => {
    polls++;
    return route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool inspect', text: 'Selected observation' },
    ] } });
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Hold rows', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Inspect inspect', exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Resume rows', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · HELD');
  await page.keyboard.press('Escape');
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · ACTIVITY');
  const before = polls;
  await page.goto(url + '&audience=family');
  await expect(page.locator('.augury-ambient, .augury-hold, .cb-inspector')).toHaveCount(0);
  expect(polls).toBe(before);
});

test('held rows keep eye reactions active when a new observation arrives', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  let polls = 0;
  let text = 'Initial observation';
  await page.route('**/api/augury-feed**', route => {
    polls++;
    return route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool inspect', text },
    ] } });
  });
  await page.goto(url);
  const row = page.getByRole('button', { name: 'Inspect inspect', exact: true });
  await expect(row).toContainText('Initial observation');
  await page.evaluate(() => { window.__HERMES_LAST_AUGURY_GLANCE_AT = 0; });
  await page.getByRole('button', { name: 'Hold rows', exact: true }).tap();
  text = 'Replacement observation';
  const before = polls;
  await expect.poll(() => polls, { timeout: 8000 }).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => window.__HERMES_LAST_AUGURY_GLANCE_AT), { timeout: 8000 }).toBeGreaterThan(0);
  await expect(row).toContainText('Initial observation');
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · HELD');
});

test('held rows never conceal a delayed live feed', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  let failed = false;
  await page.route('**/api/augury-feed**', route => failed
    ? route.fulfill({ status: 503, body: 'Unavailable' })
    : route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool inspect', text: 'Last observed result' },
    ] } }));
  await page.goto(url);
  await expect(page.locator('.augury-list')).toContainText('Last observed result');
  await page.getByRole('button', { name: 'Hold rows', exact: true }).tap();
  failed = true;
  await expect(page.locator('.augury-feed-status')).toContainText('LOG DELAYED', { timeout: 8000 });
  await expect(page.locator('.augury-heading')).toHaveText('AUGURY · HELD');
  await expect(page.locator('.augury-list')).toContainText('Last observed result');
  await expect(page.locator('.augury-ambient')).toHaveAttribute('data-feed-health', 'stale');
});
