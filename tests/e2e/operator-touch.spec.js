import { test, expect } from '@playwright/test';

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning';

test('operator drag follows contact, returns to work, and never starts entertainment', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  const requests = [];
  page.on('request', request => { if (/tts|speak|entertainment.*line/.test(request.url())) requests.push(request.url()); });
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => window.HermesTouchFxController?.mode())).toBe('inspect');
  const stage = page.locator('.cb-radial-stage');
  await page.mouse.move(950, 550);
  await page.mouse.down();
  await expect(page.locator('.cb-contact')).toBeVisible();
  await page.mouse.move(1160, 430, { steps: 12 });
  await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().targetX)).toBeGreaterThan(0);
  await expect(stage).toHaveAttribute('data-optic-mode', 'reasoning');
  await page.mouse.up();
  await expect(page.locator('.cb-contact')).toBeHidden();
  await expect(stage).toHaveAttribute('data-social-presence', 'working');
  await expect(page.locator('.touch-fx-layer, .touch-fx-trail, .touch-fx-spark')).toHaveCount(0);
  expect(await page.evaluate(() => window.HermesEntertainment.getDebugState().current)).toBe(null);
  expect(requests).toEqual([]);
});

test('metric inspection is keyboard accessible and preserves observed values', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  await page.goto(url);
  const metric = page.getByRole('button', { name: 'Inspect CPU', exact: true });
  const visibleValue = await metric.locator('.cb-arc-value').textContent();
  await metric.press('Enter');
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-inspector-value]')).toHaveText(visibleValue);
  await expect(page.getByRole('button', { name: 'Close detail' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(metric).toBeFocused();
  await metric.locator('.cb-metric-hit').click();
  await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Close detail' }).click();
  await expect(panel).toBeHidden();
});

test('cancelled touch clears feedback and restores waiting attention', async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display geometry');
  await page.goto(url.replace('reasoning', 'waiting_user'));
  await page.dispatchEvent('body', 'pointerdown', { pointerId: 51, pointerType: 'touch', clientX: 920, clientY: 530, button: 0 });
  await expect(page.locator('.cb-contact')).toBeVisible();
  await page.dispatchEvent('body', 'pointercancel', { pointerId: 51, pointerType: 'touch' });
  await expect(page.locator('.cb-contact')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.HermesTouchFxController.activeCount())).toBe(0);
  await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-social-presence', 'waiting');
  await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'waiting_user');
});
