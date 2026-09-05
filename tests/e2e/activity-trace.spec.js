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

test('observed trace follows live phases, freezes on loss, and releases waiting gaze', async ({ page }, testInfo) => {
  let mode = 'reading';
  let fail = false;
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => fail
    ? route.fulfill({ status: 503, body: '' })
    : route.fulfill({ json: packet(mode) }));
  await page.goto(url);
  const trace = page.locator('.cb-activity-trace');
  await expect(trace.locator('[aria-current="step"]')).toHaveAttribute('data-phase', 'reading');
  for (const next of ['reasoning', 'waiting_user', 'writing', 'complete']) {
    mode = next;
    await expect(trace.locator('[aria-current="step"]')).toHaveAttribute('data-phase', next);
    if (next === 'waiting_user') {
      await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-social-presence', 'waiting');
    }
    if (next === 'writing') {
      await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-social-presence', 'working');
      const eye = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
      expect(eye.forcedUntil).not.toBe(Infinity);
      expect(eye.targetName).not.toBe('viewer');
    }
  }
  await expect(trace.locator('li')).toHaveCount(5);
  await expect(trace).toHaveAttribute('data-status', 'live');
  await page.screenshot({ path: testInfo.outputPath('activity-trace-complete.png') });
  fail = true;
  // The first failed poll updates liveStatus; the second publishes a stale packet.
  await expect(trace).toHaveAttribute('data-status', 'stale', { timeout: 15000 });
  await expect(trace.locator('[data-trace-age]')).toBeEmpty();
  await expect(trace.locator('[aria-current]')).toHaveCount(0);
  await expect(trace.locator('li')).toHaveCount(5);
});

test('preview is labeled, privacy clears trace, and reduced motion stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${url}&mode=reasoning`);
  const trace = page.locator('.cb-activity-trace');
  await expect(trace).toHaveAttribute('data-status', 'preview');
  await expect(trace.locator('[data-trace-status]')).toHaveText('PREVIEW');
  expect(await trace.locator('[aria-current] .cb-trace-glyph').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.goto(`${url}&mode=reasoning&privacy=sensitive`);
  await expect(page.locator('.cb-activity-trace')).toBeHidden();
  await expect(page.locator('.cb-activity-trace li')).toHaveCount(0);
  await page.goto(`${url}&mode=idle_watch&audience=family`);
  await expect(page.locator('.cb-activity-trace')).toHaveCount(0);
});

test('a live turn interrupts automatic idle entertainment', async ({ page }) => {
  let mode = 'idle_watch';
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: packet(mode) }));
  await page.route('**/api/watch-animation-log', route => route.fulfill({ json: { ok: true } }));
  await page.goto(url);
  await expect(page.locator('.cb-activity-trace')).toHaveAttribute('data-status', 'live');
  await page.waitForFunction(() => window.HermesEntertainment?.ids().includes('aurora_breath'));
  expect(await page.evaluate(() => window.HermesEntertainment.playSequence('aurora_breath', { trigger: 'idle:attract' }))).toBe(true);
  mode = 'reasoning';
  await expect(page.locator('.cb-activity-trace [aria-current]')).toHaveAttribute('data-phase', 'reasoning');
  await expect.poll(() => page.evaluate(() => window.HermesEntertainment.getDebugState().current)).toBe(null);
});
