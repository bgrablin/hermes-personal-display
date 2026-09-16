import { test, expect } from '@playwright/test';

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape&mode=reasoning&preview=1&live=1';

async function synthetic(page) {
  await page.route('**/api/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: {
    schema_version: '0.1.0', behavior_mode: 'reasoning', optic_state_packet: { mode: 'reasoning' },
    caption: { text: 'Synthetic material review.' }, safety: { contains_credentials: false },
    live: {
      gateway_ok: true, freshness: { tier: 'fresh' },
      current_work: { active: true, kind: 'tool', visual_kind: 'reasoning', source: 'hermes_observer', age_seconds: 1, summary: 'Reviewing the display.' },
      system: { cpu: .18, memory: .31, temp_c: 58 },
      route_rail: { as_of_ms: Date.now(), age_seconds: 0, active_provider_id: 'openai-codex', providers: [
        { id: 'openai-codex', state: 'confirmed', headroom: .72, reachable: true },
        { id: 'xai-oauth', state: 'unknown', headroom: null, reachable: false },
      ] },
    },
  } }));
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical landscape composition');
  await synthetic(page);
});

test('material housing stays outside moving optics and words remain fixed', async ({ page }, info) => {
  await page.goto(url);
  await expect(page.locator('[data-cb-source]')).toHaveText('LIVE · REASONING');
  const housing = page.locator('.cb-eye-housing');
  await expect(housing).toBeVisible();
  expect(await housing.evaluate(node => node.closest('.cb-eye-gaze'))).toBe(null);
  expect(await housing.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
  const activity = page.locator('.cb-activity');
  const origin = await activity.boundingBox();
  const frames = [];
  for (const target of ['augury_left', 'route_right']) {
    await page.evaluate(name => window.__HERMES_CONCEPT_B_EYE_MOTION.forceGaze(name, 4000), target);
    await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().x))
      [target === 'augury_left' ? 'toBeLessThan' : 'toBeGreaterThan'](target === 'augury_left' ? -12 : 12);
    for (let i = 0; i < 3; i++) {
      frames.push(await page.evaluate(() => {
        const rig = window.__HERMES_CONCEPT_B_EYE_MOTION.debug();
        return { x: rig.x, y: rig.y, blink: rig.blink,
          housingTransform: document.querySelector('.cb-eye-housing').getAttribute('transform'),
          socketTransform: document.querySelector('.cb-eye-socket').getAttribute('transform'),
          activityTransform: getComputedStyle(document.querySelector('.cb-activity')).transform };
      }));
      await page.waitForTimeout(100);
    }
    const current = await activity.boundingBox();
    expect(current.x).toBeCloseTo(origin.x, 1);
    expect(current.y).toBeCloseTo(origin.y, 1);
    await page.screenshot({ path: info.outputPath(`${target}.png`) });
  }
  expect(new Set(frames.map(f => f.housingTransform)).size).toBe(1);
  expect(new Set(frames.map(f => f.socketTransform)).size).toBe(1);
  expect(new Set(frames.map(f => f.activityTransform)).size).toBe(1);
  expect(frames.every(f => Math.abs(f.x) <= 34 && Math.abs(f.y) <= 30)).toBe(true);
  await info.attach('gaze-samples', { body: JSON.stringify(frames, null, 2), contentType: 'application/json' });
});

test('instrument material preserves unknowns, touch targets, and preview separation', async ({ page }) => {
  await page.goto(url);
  const unknown = page.locator('.cb-route-row[data-state="unknown"]').last();
  await expect(unknown).toBeVisible();
  await expect.poll(() => unknown.locator('.cb-route-whisker').evaluate(n => Number(getComputedStyle(n).opacity))).toBe(0);
  await expect.poll(() => unknown.locator('.cb-route-track').evaluate(n => Number(getComputedStyle(n).opacity))).toBe(0);
  expect(await page.locator('.cb-route-rail').evaluate(n => getComputedStyle(n, '::before').pointerEvents)).toBe('none');
  const preview = await page.locator('.cb-preview-proof').boundingBox();
  const cpu = page.getByRole('button', { name: 'Inspect CPU', exact: true });
  const hit = await cpu.locator('.cb-metric-hit').boundingBox();
  expect(hit.width).toBeGreaterThanOrEqual(44);
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(preview.y).toBeGreaterThan(hit.y + hit.height);
  expect(await cpu.locator('.cb-arc-label').evaluate(n => getComputedStyle(n).textDecorationLine)).toContain('underline');
  await cpu.locator('.cb-metric-hit').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-inspector-value]')).toHaveText('18%');
  await page.getByRole('button', { name: 'Close detail' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(cpu).toBeFocused();
  expect(await page.locator('body').innerText()).not.toMatch(/hermes_observer|\/home\/|github_pat_/);

  await page.goto(`${url}&augury=1`);
  const augury = page.locator('.augury-ambient');
  await expect(augury).toBeVisible();
  await expect.poll(() => augury.evaluate((node) => getComputedStyle(node, '::after').borderTopWidth)).toBe('0px');
});
