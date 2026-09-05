import { test, expect } from '@playwright/test';

const url = '/src/character-runtime.html?kiosk=1&orientation=landscape&augury=1';
function observation(mode = 'reasoning', summary = 'Reviewing the display behavior.') {
  return {
    schema_version: '0.1.0', behavior_mode: mode, optic_state_packet: { mode },
    caption: { text: summary }, safety: { contains_credentials: false },
    live: {
      gateway_ok: true, freshness: { tier: 'fresh' },
      resolver: { display_state: mode === 'waiting_user' ? 'needs_attention' : mode === 'blocked' ? 'blocked_user_task' : 'active_work' },
      current_work: { active: true, summary, detail: 'Comparing the visible observations.', age_seconds: 1, visual_kind: mode },
      system: { cpu: .84, temp_c: 81, memory: .32, load_average_1m: 8 },
    },
  };
}

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'minix-sf10t-landscape', 'Physical display composition');
  await page.route('**/avatar-events/stream**', route => route.fulfill({ contentType: 'text/event-stream', body: '' }));
});

test('Augury prioritizes fresh work, groups repeats, and shows private excerpts when explicitly enabled', async ({ page }) => {
  let packet = observation();
  let feedFailed = false;
  let feedAge = 12;
  const item = { kind: 'tool', title: 'tool Browser', text: 'PRIVATE RAW TOOL BODY', safeText: true, age_seconds: 12 };
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: packet }));
  await page.route('**/api/augury-feed**', route => feedFailed ? route.fulfill({ status: 503, body: '' }) : route.fulfill({ json: {
    schema_version: '0.1.0', current_work: { summary: 'An older feed summary.', active: true, age_seconds: 12 },
    items: [{ ...item, age_seconds: feedAge++ }, { ...item, age_seconds: feedAge + 4 }, { kind: 'log', title: 'log', age_seconds: 18 }],
  } }));
  await page.goto(url + '&auguryText=1');
  const rail = page.getByRole('complementary', { name: 'Augury activity' });
  await expect(rail).toContainText('Reviewing the display behavior.');
  await expect(rail).not.toContainText('An older feed summary.');
  await expect(rail).toContainText('PRIVATE RAW TOOL BODY');
  await expect(rail.locator('[data-populated="true"][data-kind="tool"]')).toHaveCount(1);
  await expect(rail).toContainText('×2');
  await page.waitForTimeout(800);
  const geometry = await rail.evaluate(node => {
    const other = document.querySelector('.cb-route-rail');
    const text = node.querySelector('.augury-strand[data-populated="true"] .augury-text');
    return { top: node.getBoundingClientRect().top, rightTop: other.getBoundingClientRect().top,
      opacity: Number(getComputedStyle(node).opacity), mask: getComputedStyle(node).maskImage,
      textOpacity: Number(getComputedStyle(text).opacity), font: parseFloat(getComputedStyle(text).fontSize) };
  });
  expect(geometry.top).toBe(geometry.rightTop);
  expect(geometry.opacity * geometry.textOpacity).toBeGreaterThan(.8);
  expect(geometry.mask).toBe('none');
  expect(geometry.font).toBeGreaterThanOrEqual(20);

  packet = observation('reading', 'Reading the revised display settings.');
  await expect(rail).toContainText('Reading the revised display settings.');
  await expect(rail).not.toContainText('Reviewing the display behavior.');
  await page.waitForTimeout(900);
  // Observe entrance animation calls across a whole age-only poll, including
  // animations that could start and finish before a single snapshot assertion.
  await page.evaluate(() => {
    window.__auguryTransitionCount = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.classList.contains('augury-strand')) window.__auguryTransitionCount += 1;
      return original.apply(this, args);
    };
  });
  const previousMeta = await rail.locator('[data-kind="tool"] .augury-meta').textContent();
  await expect(rail.locator('[data-kind="tool"] .augury-meta')).not.toHaveText(previousMeta, { timeout: 8000 });
  expect(await page.evaluate(() => window.__auguryTransitionCount)).toBe(0);
  feedFailed = true;
  await expect(rail).toHaveAttribute('data-feed-health', 'stale', { timeout: 8000 });
  await expect(rail).toContainText('LOG DELAYED');
  await expect(rail).toContainText('Reading the revised display settings.');
});

test('the activity palette reaches iris, lighting, and both rails through interrupted modes', async ({ page }) => {
  let packet = observation();
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: packet }));
  await page.route('**/api/augury-feed**', route => route.fulfill({ json: { schema_version: '0.1.0', items: [] } }));
  await page.goto(url);
  const sample = () => page.evaluate(() => ({
    iris: getComputedStyle(document.querySelector('#cb-iris-body stop:nth-child(3)')).stopColor,
    aura: getComputedStyle(document.querySelector('.cb-eye-aura')).fill,
    left: getComputedStyle(document.querySelector('.augury-heading')).color,
    right: getComputedStyle(document.querySelector('.cb-route-title')).color,
  }));
  let previous;
  for (const [mode, theme] of [['reasoning', 'thinking'], ['tool_shell', 'working'], ['blocked', 'error'], ['waiting_user', 'waiting'], ['reasoning', 'thinking']]) {
    packet = observation(mode);
    await expect(page.locator('body')).toHaveAttribute('data-dashboard-theme', theme);
    await page.waitForTimeout(1250);
    const colors = await sample();
    expect(colors.left).toBe(colors.right);
    if (previous) for (const key of ['iris', 'aura', 'left']) expect(colors[key]).not.toBe(previous[key]);
    previous = colors;
    await expect(page.locator('.augury-ambient')).toBeVisible();
    if (mode === 'blocked') {
      const boxes = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { alert: box('.cb-top-alert'), cpu: box('[data-cb-arc="cpu"] .cb-arc-label'),
          attention: box('.cb-attention'), hint: box('.cb-touch-hint') };
      });
      expect(boxes.alert.bottom).toBeLessThan(boxes.cpu.top);
      expect(boxes.attention.bottom).toBeLessThan(boxes.hint.top);
    }
  }
});

test('blue motes remain outside the smaller eye and move smoothly at the expanded budget', async ({ page }) => {
  await page.route('**/api/hermes-state**', route => route.fulfill({ json: observation('idle_watch') }));
  await page.goto(url);
  await expect(page.locator('.cb-field-mote')).toHaveCount(5);
  await page.waitForTimeout(900);
  const sample = () => page.evaluate(() => ({
    motion: window.__HERMES_CONCEPT_B_EYE_MOTION.debug(),
    budget: window.HermesTouchFxController.entertainmentBudget(),
    reduced: document.documentElement.dataset.hermesReducedMotion,
    motes: [...document.querySelectorAll('.cb-field-mote')].map(node => ({
      x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')),
      opacity: Number(getComputedStyle(node).opacity), color: getComputedStyle(node).fill,
    })),
  }));
  const before = await sample();
  await page.waitForTimeout(450);
  const after = await sample();
  expect(after.budget).toBe('high');
  expect(after.reduced).toBe('false');
  for (let i = 0; i < after.motes.length; i++) {
    const mote = after.motes[i];
    expect(Math.hypot(mote.x - 550, mote.y - 550)).toBeGreaterThan(260);
    expect(mote.opacity).toBeGreaterThan(.5);
    expect(mote.color).toBe('rgb(163, 232, 255)');
    const travel = Math.hypot(mote.x - before.motes[i].x, mote.y - before.motes[i].y);
    expect(travel).toBeGreaterThan(5);
    expect(travel).toBeLessThan(65);
  }
  const eyeFrames = after.motion.eyeRenderCount - before.motion.eyeRenderCount;
  const fieldFrames = after.motion.fieldRenderCount - before.motion.fieldRenderCount;
  expect(fieldFrames).toBeGreaterThan(eyeFrames * .65);
  expect(fieldFrames).toBeLessThanOrEqual(eyeFrames);
});
