import { test, expect } from '@playwright/test';

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape&augury=1&mode=reasoning';

test('private Augury expands inert text and holds the selected observation across updates', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display interaction');
  let text = 'Reading /home/brian/src/state.js token usage: 123 <img src=x onerror=window.injected=true> ' + 'Result details '.repeat(12);
  let polls = 0;
  await page.route('**/api/augury-feed**', route => {
    polls++;
    return route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool read_file', text, age_seconds: 12, session_id: 'test-session' },
    ] } });
  });
  await page.goto(url + '&auguryText=1');
  const row = page.getByRole('button', { name: 'Inspect read_file', exact: true });
  await expect(row).toContainText('/home/brian/src/state.js');
  await row.click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('token usage: 123');
  await expect(panel).toContainText('PINNED OBSERVATION');
  await expect(panel.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  const original = await panel.locator('[data-inspector-value]').textContent();
  text = 'A newer observation';
  const previousPolls = polls;
  await expect.poll(() => polls, { timeout: 8000 }).toBeGreaterThan(previousPolls);
  await expect(panel.locator('[data-inspector-value]')).toHaveText(original);
  await expect(row).not.toContainText('A newer observation');
  await page.screenshot({ path: 'test-results/private-operator-inspection.png' });
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(row).toContainText('A newer observation');
  await row.press('Enter');
  await expect(panel).toContainText('A newer observation');
  await page.getByRole('button', { name: 'Close detail' }).click();
  await expect(panel).toBeHidden();
});

test('default compact mode never exposes body text through inspection and family never fetches it', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display interaction');
  let polls = 0;
  await page.route('**/api/augury-feed**', route => {
    polls++;
    return route.fulfill({ json: { schema_version: '0.1.0', items: [
      { kind: 'tool', title: 'tool read_file', text: 'PRIVATE BODY', safeText: true },
    ] } });
  });
  await page.goto(url);
  const row = page.getByRole('button', { name: 'Inspect read_file', exact: true });
  await row.press('Enter');
  await expect(page.getByRole('dialog')).not.toContainText('PRIVATE BODY');
  const previousPolls = polls;
  await page.goto(url + '&audience=family');
  await expect(page.locator('.augury-ambient, .cb-inspector')).toHaveCount(0);
  expect(polls).toBe(previousPolls);
});
