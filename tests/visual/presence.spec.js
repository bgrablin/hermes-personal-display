import { test, expect } from '@playwright/test';

test('visual rehearsal: returning attention, focus, interruption, and rest', async ({ page }, testInfo) => {
  let mode = 'idle_watch';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/hermes-state**', route => {
    const active = ['reading', 'reasoning', 'searching', 'writing', 'tool_shell'].includes(mode);
    const summaries = {
      idle_watch: 'A quiet moment.', reading: 'Reading the material.',
      reasoning: 'Considering the possibilities.', searching: 'Looking a little further.',
      tool_shell: 'Putting the idea to work.', waiting_user: 'Ready when you are.',
      writing: 'Bringing it together.', complete: 'That part is done.',
    };
    return route.fulfill({ json: {
      schema_version: '0.1.0', behavior_mode: mode, optic_state_packet: { mode },
      mood: active ? 'thinking_focused' : 'idle_watchful',
      caption: { text: summaries[mode] }, safety: { contains_credentials: false },
      live: {
        gateway_ok: true, freshness: { tier: 'fresh' },
        resolver: { display_state: mode === 'waiting_user' ? 'needs_attention' : active ? 'active_work' : 'idle' },
        current_work: { active, age_seconds: 1, visual_kind: mode, source: 'local', summary: summaries[mode] },
        system: { cpu: .18, memory: .32, temp_c: 50 },
        tasks: { active: active ? 1 : 0, queued: 0 },
      },
    } });
  });
  await page.route('**/api/watch-animation-log', route => route.fulfill({ json: { ok: true } }));
  await page.goto('/src/character-runtime.html?kiosk=1&orientation=landscape&mode=idle_watch&live=1&preview=1&touchtest=1');
  await expect(page.locator('.cb-radial-stage')).toBeVisible();
  // Deliberately revisit phases. This is a rehearsal, never a prescribed lifecycle.
  for (const next of ['idle_watch', 'reasoning', 'reading', 'reasoning', 'waiting_user', 'tool_shell', 'idle_watch']) {
    mode = next;
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', mode);
    await page.waitForTimeout(3200);
    await page.screenshot({ path: testInfo.outputPath(`${mode}.png`) });
    if (next === 'waiting_user') {
      await page.mouse.move(970, 540);
      await page.mouse.down();
      await page.mouse.move(1130, 460, { steps: 24 });
      await page.waitForTimeout(750);
      await page.mouse.move(830, 570, { steps: 24 });
      await page.waitForTimeout(750);
      await page.mouse.up();
      await page.waitForTimeout(1200);
    }
  }
  await page.getByRole('button', { name: 'Inspect CPU', exact: true }).locator('.cb-metric-hit').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: testInfo.outputPath('touch-inspection.png') });
  await page.getByRole('button', { name: 'Close detail' }).click();
  expect(errors).toEqual([]);
});
