import { test, expect } from '@playwright/test';

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape';
function packet(mode) {
  const active = ['reasoning', 'reading', 'writing', 'tool_shell', 'searching'].includes(mode);
  return {
    schema_version: '0.1.0',
    behavior_mode: mode,
    optic_state_packet: { mode },
    mood: active ? 'thinking_focused' : 'idle_watchful',
    caption: { text: 'Display-safe fixture.' },
    safety: { contains_credentials: false },
    live: {
      gateway_ok: true,
      freshness: { tier: 'fresh' },
      current_work: { active, age_seconds: 1, visual_kind: mode, source: 'local' },
      system: { cpu: 0.2, memory: 0.3, temp_c: 50 },
    },
  };
}

test('presence follows revisited modes without building a workflow', async ({ page }) => {
  let mode = 'reading';
  let fail = false;
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => fail ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ json: packet(mode) }));
  await page.goto(url);
  const stage = page.locator('.cb-radial-stage');
  await expect(stage).toHaveAttribute('data-optic-mode', 'reading');
  for (const next of ['reasoning', 'reading', 'waiting_user', 'writing']) {
    mode = next;
    await expect(stage).toHaveAttribute('data-optic-mode', next);
    if (next === 'waiting_user') await expect(stage).toHaveAttribute('data-social-presence', 'waiting');
    if (next === 'writing') {
      await expect(stage).toHaveAttribute('data-social-presence', 'working');
      const eye = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
      expect(eye.forcedUntil).not.toBe(Infinity);
      expect(eye.targetName).not.toBe('viewer');
    }
  }
  await expect(page.locator('.cb-activity-trace, [aria-current="step"]')).toHaveCount(0);
  fail = true;
  await expect(page.locator('[data-cb-feed]')).toContainText('STALE', { timeout: 15000 });
});

test('preview is explicit and reduced-motion material is stationary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${url}&mode=reasoning`);
  await expect(page.locator('.cb-preview-proof')).toHaveText('PREVIEW');
  const folds = page.locator('.cb-presence-fold');
  await expect(folds).toHaveCount(6);
  const before = await folds.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
  await page.waitForTimeout(350);
  expect(await folds.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(before);
  await page.goto(`${url}&mode=idle_watch&audience=family`);
  await expect(page.locator('.cb-inspector, [data-inspect], .cb-activity-trace')).toHaveCount(0);
});

test('a live turn interrupts automatic idle entertainment', async ({ page }) => {
  let mode = 'idle_watch';
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: packet(mode) }));
  await page.route('**/api/watch-animation-log', route => route.fulfill({ json: { ok: true } }));
  await page.goto(url);
  await expect(page.locator('[data-cb-feed]')).toContainText('FRESH');
  await page.waitForFunction(() => window.HermesEntertainment?.ids().includes('aurora_breath'));
  expect(await page.evaluate(() => window.HermesEntertainment.playSequence('aurora_breath', { trigger: 'idle:attract' }))).toBe(true);
  mode = 'reasoning';
  await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'reasoning');
  await expect.poll(() => page.evaluate(() => window.HermesEntertainment.getDebugState().current)).toBe(null);
});
