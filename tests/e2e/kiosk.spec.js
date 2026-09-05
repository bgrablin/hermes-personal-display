import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const modes = ['idle_watch', 'reasoning', 'tool_shell', 'searching', 'writing', 'waiting_user', 'blocked', 'complete', 'degraded_offline'];
const landscapeModes = ['idle_watch', 'reasoning', 'searching', 'tool_shell', 'waiting_user', 'blocked', 'complete', 'degraded_offline'];
const root = path.resolve(import.meta.dirname, '../..');
const EXPECTED_BUILD_ID = readDisplayBuildId();

function readDisplayBuildId() {
  const buildIdSource = fs.readFileSync(path.join(root, 'src/generated/build-id.js'), 'utf8');
  const match = buildIdSource.match(/window\.__HERMES_DISPLAY_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('__HERMES_DISPLAY_BUILD_ID not found in src/generated/build-id.js; run npm run generate:build-id');
  return match[1];
}

function runtimeUrl(mode, testInfo) {
  const params = new URLSearchParams({ kiosk: '1', mode, v: EXPECTED_BUILD_ID });
  if (testInfo.project.name === 'minix-sf10t-landscape') params.set('orientation', 'landscape');
  return `/src/character-runtime.html?${params.toString()}`;
}

function funRuntimeUrl(mode, testInfo) { return `${runtimeUrl(mode, testInfo)}&touch=fun`; }

async function expectNoPageErrors(page, action) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await action();
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
}

test.describe('Hermes kiosk smoke and visual regression anchors', () => {
  for (const mode of modes) {
    test(`${mode} renders without console errors`, async ({ page }, testInfo) => {
      await expectNoPageErrors(page, async () => {
        await page.goto(runtimeUrl(mode, testInfo));
        await expect(page.locator('body.kiosk-mode.kiosk-landscape.claude-concept-b')).toBeVisible();
        await expect(page.locator('.cb-radial-stage')).toBeVisible();
        await expect(page.locator('.cb-state')).toBeVisible();
        await expect(page.locator('.shell')).toHaveCount(0);
        await expect(page.locator('#display-root > svg.mascot-stage')).toHaveCount(0);
      });
    });
  }

  test('status-change ticks are event-only and reduced-motion safe', async ({ page }, testInfo) => {
    const packet = (preset, summary) => ({
      schema_version: '0.1.0',
      state_preset: preset,
      mood: preset === 'working' ? 'thinking_focused' : 'idle_watchful',
      skin: 'retro-robot-core',
      caption: { text: summary, tone: 'focused', priority: 'ambient' },
      live: {
        gateway_ok: true,
        freshness: { tier: 'fresh', valid_measurements: 3, stale_measurements: [] },
        resolver: { display_state: preset === 'working' ? 'active_work' : 'idle' },
        current_work: preset === 'working'
          ? { active: true, kind: 'shell', visual_kind: 'shell', state: 'tool_shell', summary, age_seconds: 1, source: 'terminal' }
          : { active: false, summary, age_seconds: 0, source: 'local' },
        system: { cpu: 0.18, memory: 0.32, temp_c: 54, cpu_temp_c: 54 },
        tasks: { queued: 0, active: preset === 'working' ? 1 : 0 },
      },
    });

    await page.goto(runtimeUrl('idle_watch', testInfo));
    await expect(page.locator('[data-cb-state]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__HERMES_STATUS_TICKS)).toBe(0);

    let requestCount = 0;
    await page.route('**/api/hermes-state**', async (route) => {
      requestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(requestCount === 1 ? packet('quiet_watch', 'Systems steady.') : packet('working', 'Running focused local work.')),
      });
    });

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect.poll(() => page.evaluate(() => window.__HERMES_STATUS_TICKS)).toBeGreaterThan(0);

    const reducedPage = page;
    await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
    requestCount = 0;
    await reducedPage.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1&case=reduced`);
    await expect.poll(() => reducedPage.evaluate(() => window.__HERMES_STATUS_TICKS)).toBe(0);
  });

  test('caption sanitizer keeps unsafe html out of display text', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    const sanitized = await page.evaluate(() => window.HermesSanitize.captionText('<img src=x onerror=alert(1)>Visible<script>x</script>'));
    expect(sanitized).toBe('Visible');
  });

  test('explicit fun touch uses entertainment FX without legacy detail overlays', async ({ page }, testInfo) => {
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    await expect(page.locator('.touch-zones')).toHaveCount(0);
    await expect(page.locator('.detail-overlay')).toHaveCount(0);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);
    await expect(page.locator('text=DIAGNOSTICS')).toHaveCount(0);
    await expect(page.locator('text=SAFE RESET')).toHaveCount(0);
    await expect(page.locator('text=GLANCE PREV')).toHaveCount(0);
    await expect(page.locator('.touch-fx-layer')).toBeVisible();

    const viewport = page.viewportSize();
    const midY = Math.round((viewport?.height || 480) / 2);
    await page.mouse.click(12, midY);
    await page.mouse.click((viewport?.width || 320) - 12, midY);
    await expect(page.locator('.detail-overlay')).toHaveCount(0);
    await expect(page.locator('.touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);
    await expect.poll(() => page.locator('.touch-fx-ripple, .touch-fx-spark, .touch-fx-comet, .touch-fx-resonance').count()).toBeGreaterThan(0);
  });

  test('touch motes stay anchored to the optic field', async ({ page }, testInfo) => {
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    await expect(page.locator('.cb-radial-stage')).toBeVisible();
    await expect(page.locator('.touch-fx-mote').first()).toBeVisible();
    await page.waitForTimeout(250);

    const geometry = await page.evaluate(() => {
      const optic = document.querySelector('.cb-radial-stage')?.getBoundingClientRect();
      const motes = Array.from(document.querySelectorAll('.touch-fx-mote')).map((mote) => {
        const rect = mote.getBoundingClientRect();
        const style = getComputedStyle(mote);
        const x = Number.parseFloat(mote.style.getPropertyValue('--x'));
        const y = Number.parseFloat(mote.style.getPropertyValue('--y'));
        return {
          x,
          y,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          orbit: Number.parseFloat(mote.style.getPropertyValue('--orbit-radius')),
          visible: style.display !== 'none' && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0,
        };
      });
      return {
        optic: optic ? {
          cx: optic.left + optic.width / 2,
          cy: optic.top + optic.height / 2,
          radius: Math.min(optic.width, optic.height) / 2,
        } : null,
        motes,
      };
    });

    expect(geometry.optic).not.toBeNull();
    expect(geometry.motes.length).toBeGreaterThan(0);
    const optic = geometry.optic;
    for (const mote of geometry.motes) {
      expect(Math.abs(mote.x - optic.cx)).toBeLessThanOrEqual(2);
      expect(Math.abs(mote.y - optic.cy)).toBeLessThanOrEqual(2);
      expect(mote.orbit).toBeLessThanOrEqual(Math.min(340, optic.radius * 0.64) + 1);
      const distance = Math.hypot(mote.cx - optic.cx, mote.cy - optic.cy);
      expect(distance).toBeLessThanOrEqual(Math.min(340, optic.radius * 0.64) + 18);
    }
  });

  for (const [name, query] of [
    ['touchzones alone', 'touchzones=1'],
    ['touch test mode', 'touchtest=1'],
    ['debug without legacy touch', 'debug=1&touchzones=1'],
  ]) {
    test(`Concept B developer touch grid stays hidden for ${name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B touch grid');
      await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&${query}`);
      await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
      await expect(page.locator('.cb-touch')).toHaveCount(0);
      await expect(page.locator('text=DIAGNOSTICS')).toHaveCount(0);
      await expect(page.locator('text=SAFE RESET')).toHaveCount(0);
      await expect(page.locator('text=GLANCE PREV')).toHaveCount(0);
    });
  }

  test('Concept B developer touch grid requires explicit legacy debug flags', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B touch grid');
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touch=legacy&debug=1&touchzones=1`);
    await expect(page.locator('.cb-touch-zones')).toBeVisible();
    await expect(page.locator('.cb-touch')).toHaveCount(5);
    const devLabels = await page.locator('.cb-touch span').allTextContents();
    expect(devLabels.join(' ')).toContain('DEVELOPER');
    expect(devLabels.join(' ')).toContain('DIAGNOSTICS');
  });

  test('kiosk touch FX does not mutate behavior mode', async ({ page }, testInfo) => {
    await page.goto(`${funRuntimeUrl('tool_shell', testInfo)}&touchtest=1`);
    const before = await page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode || null);
    const viewport = page.viewportSize();
    const w = viewport?.width || 320;
    const h = viewport?.height || 480;
    await page.mouse.click(12, Math.round(h / 2));
    await page.mouse.click(w - 12, Math.round(h / 2));
    await page.mouse.click(Math.round(w / 2), 12);
    await page.mouse.click(Math.round(w / 2), h - 12);
    const after = await page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode || null);
    expect(after).toBe(before);
    await expect(page.locator('.detail-overlay')).toHaveCount(0);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);
  });

  test('kiosk touch FX exposes multitouch orbit and reduced-motion-safe effects', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    const snapshot = await page.evaluate(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      window.HermesTouchFxController.testSpawnMultiTouch([
        { x: w * 0.42, y: h * 0.50 },
        { x: w * 0.58, y: h * 0.50 },
        { x: w * 0.50, y: h * 0.40 },
      ]);
      const nodes = Array.from(document.querySelectorAll('.touch-fx-layer *'));
      return {
        orbitCount: document.querySelectorAll('.touch-fx-orbit').length,
        fxCount: window.HermesTouchFxController.fxCount(),
        heavyMotionCount: document.querySelectorAll('.touch-fx-comet, .touch-fx-trail, .touch-fx-firefly, .touch-fx-vortex, .touch-fx-mote').length,
        maxDurationMs: Math.max(...nodes.map((node) => {
          const duration = getComputedStyle(node).animationDuration.trim();
          if (duration.endsWith('ms')) return Number.parseFloat(duration);
          if (duration.endsWith('s')) return Number.parseFloat(duration) * 1000;
          return 0;
        })),
      };
    });
    expect(snapshot.orbitCount).toBeGreaterThan(0);
    expect(snapshot.fxCount).toBeLessThanOrEqual(90);
    expect(snapshot.heavyMotionCount).toBe(0);
    expect(snapshot.maxDurationMs).toBeLessThanOrEqual(700);
  });

  test('touch off disables visual FX layer and tap click listener', async ({ page }, testInfo) => {
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touch=off&touchtest=1`);
    await expect(page.locator('.touch-fx-layer')).toHaveCount(0);
    const audioState = await page.evaluate(() => ({
      hasTouchFx: Boolean(window.HermesTouchFxController),
      tapClickInstalled: Boolean(window.HermesAudio?.tapClickInstalled),
    }));
    expect(audioState.hasTouchFx).toBe(false);
    expect(audioState.tapClickInstalled).toBe(false);
  });

  test('family theater mode hides operational chrome and preserves behavior mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
    await page.goto(`${runtimeUrl('tool_shell', testInfo)}&touchtest=1&audience=family`);
    await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
    await expect(page.locator('.cb-radial-stage')).toBeVisible();
    await expect(page.locator('.cb-route-rail')).toBeHidden();
    await expect(page.locator('.cb-bottom-rail')).toBeHidden();
    await expect(page.locator('.cb-topbar')).toBeHidden();
    const before = await page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode || null);
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/ROUTE|HEADROOM|CPU|MEM|TEMP|CURRENT TURN|GATEWAY|REMOTE MEMORY|TOOLS?|PROMPT|PRIVATE AUGURY|KANBAN|AUGURY/i);
    expect(text).toMatch(/HERMES|SPARKLE|WATCHING|THINKING/i);
    expect(text).toMatch(/HOLD CORNER TO LEAVE|OPERATOR HOLD/i);
    await expect(page.locator('.cb-mode-hold')).toBeVisible();
    const familyHoldOpacity = Number(await page.locator('.cb-mode-hold').evaluate((el) => getComputedStyle(el).opacity));
    expect(familyHoldOpacity).toBeGreaterThan(0.4);
    expect(familyHoldOpacity).toBeLessThan(0.85);
    await page.mouse.click(Math.round((page.viewportSize()?.width || 1920) / 2), Math.round((page.viewportSize()?.height || 1280) / 2));
    const after = await page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode || null);
    expect(after).toBe(before);
  });

  test('family=1 suppresses Augury fetch and private overlay even when augury=1', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
    let auguryFetches = 0;
    await page.route('**/api/augury-feed**', async (route) => {
      auguryFetches += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema_version: '0.1.0', items: [{ text: 'PRIVATE_AUGURY_SENTINEL_TOKEN' }] }) });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1&family=1&debug=1`);
    await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
    await expect(page.locator('.augury-ambient')).toHaveCount(0);
    await expect(page.locator('.augury-proof')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.dataset.auguryPresence)).toBe('hidden');
    expect(await page.evaluate(() => document.documentElement.outerHTML.includes('PRIVATE_AUGURY_SENTINEL_TOKEN'))).toBe(false);
    expect(await page.evaluate(() => JSON.stringify(window.__HERMES_AUGURY_FEED__ || '').includes('PRIVATE_AUGURY_SENTINEL_TOKEN'))).toBe(false);
    expect(auguryFetches).toBe(0);
  });

  test('kiosk=1&family=1 boots family-first with no transient operator audience', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
    let auguryFetches = 0;
    await page.route('**/api/augury-feed**', async (route) => {
      auguryFetches += 1;
      await route.fulfill({ status: 500, body: 'family mode should not fetch augury' });
    });
    // Record every data-audience value the body ever carries. The duplicated parser bug
    // let applyPageMode drop family=1 and stamp a transient operator audience at boot
    // before the unified familyAudience path corrected it.
    await page.addInitScript(() => {
      window.__AUDIENCE_HISTORY = [];
      // Init scripts run before documentElement exists, so observe the document node.
      // The observer callback fires after the boot script's synchronous writes finish,
      // so the transient value only survives in each mutation record's oldValue; the
      // current attribute read at callback time would always show the corrected value.
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.target.nodeName === 'BODY' && mutation.attributeName === 'data-audience') {
            if (mutation.oldValue !== null) window.__AUDIENCE_HISTORY.push(mutation.oldValue);
            window.__AUDIENCE_HISTORY.push(mutation.target.getAttribute('data-audience'));
          }
        }
      }).observe(document, { attributes: true, subtree: true, attributeOldValue: true, attributeFilter: ['data-audience'] });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&family=1&augury=1`);
    await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
    const audienceHistory = await page.evaluate(() => window.__AUDIENCE_HISTORY);
    expect(audienceHistory.length).toBeGreaterThan(0);
    expect(audienceHistory).not.toContain('operator');
    await expect(page.locator('.cb-topbar')).toBeHidden();
    await expect(page.locator('.cb-bottom-rail')).toBeHidden();
    await expect(page.locator('.cb-route-rail')).toBeHidden();
    await expect(page.locator('.augury-ambient')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.dataset.auguryPresence)).toBe('hidden');
    expect(auguryFetches).toBe(0);
  });

  test.describe('family mode hold toggle', () => {
    const holdChip = async (page) => {
      const box = await page.locator('.cb-mode-hold').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
    };

    test('hold gesture rewrites the URL into family mode and keeps Augury suppressed', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
      let auguryFetches = 0;
      await page.route('**/api/augury-feed**', async (route) => {
        auguryFetches += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema_version: '0.1.0', items: [] }) });
      });
      await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1`);
      await expect(page.locator('body[data-audience="operator"]')).toBeVisible();
      const chip = page.locator('.cb-mode-hold');
      await expect(chip).toHaveAttribute('data-mode-target', 'family');
      await expect(chip.locator('.cb-mode-hold-label')).toHaveText('FAMILY HOLD');
      // Operator -> family is the harmless direction and uses the shorter entry hold.
      expect(await page.evaluate(() => window.__HERMES_FAMILY_TOGGLE.holdMs === window.__HERMES_FAMILY_TOGGLE.enterHoldMs)).toBe(true);

      // A short press must not switch modes; the hold gate is the safety.
      await holdChip(page);
      await page.waitForTimeout(350);
      await page.mouse.up();
      await page.waitForTimeout(400);
      expect(page.url()).not.toContain('audience=family');
      await expect(chip).toHaveAttribute('data-hold-state', 'idle');

      // A full hold shows progress, engages, and navigates into family mode.
      await holdChip(page);
      await expect(chip).toHaveAttribute('data-hold-state', 'holding');
      await page.waitForURL(/audience=family/);
      await page.mouse.up();
      await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
      // Operator query round-trips through the URL; the family gate keeps augury inert.
      expect(page.url()).toContain('augury=1');
      await expect(page.locator('.cb-topbar')).toBeHidden();
      await expect(page.locator('.cb-bottom-rail')).toBeHidden();
      await expect(page.locator('.augury-ambient')).toHaveCount(0);
      expect(await page.evaluate(() => document.body.dataset.auguryPresence)).toBe('hidden');
      auguryFetches = 0;
      await page.waitForTimeout(900);
      expect(auguryFetches).toBe(0);
      await expect(page.locator('.cb-mode-hold-label')).toHaveText('OPERATOR HOLD');
    });

    test('operator hold returns from family mode and restores operator chrome and Augury', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
      let auguryFetches = 0;
      await page.route('**/api/augury-feed**', async (route) => {
        auguryFetches += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ schema_version: '0.1.0', items: [] }) });
      });
      await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1&audience=family`);
      await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
      expect(auguryFetches).toBe(0);
      const chip = page.locator('.cb-mode-hold');
      await expect(chip).toHaveAttribute('data-mode-target', 'operator');
      await expect(chip.locator('.cb-mode-hold-label')).toHaveText('OPERATOR HOLD');

      // The operator return is the privacy boundary: its hold must be materially
      // longer than the harmless family entry hold, and the active duration must
      // be the exit one while in family mode.
      const holds = await page.evaluate(() => ({
        holdMs: window.__HERMES_FAMILY_TOGGLE.holdMs,
        enterHoldMs: window.__HERMES_FAMILY_TOGGLE.enterHoldMs,
        exitHoldMs: window.__HERMES_FAMILY_TOGGLE.exitHoldMs,
      }));
      expect(holds.exitHoldMs).toBeGreaterThan(holds.enterHoldMs);
      expect(holds.holdMs).toBe(holds.exitHoldMs);

      // A partial hold that would already satisfy the entry duration must NOT
      // restore operator mode; only the full longer exit hold may.
      await holdChip(page);
      await page.waitForTimeout(holds.enterHoldMs + 400);
      await page.mouse.up();
      await page.waitForTimeout(400);
      expect(page.url()).toContain('audience=family');
      await expect(chip).toHaveAttribute('data-hold-state', 'idle');
      expect(await page.evaluate(() => window.__HERMES_FAMILY_TOGGLE.progress())).toBe(0);
      expect(auguryFetches).toBe(0);

      await holdChip(page);
      await page.waitForURL((url) => !url.search.includes('audience=family'));
      await page.mouse.up();
      await expect(page.locator('body[data-audience="operator"]')).toBeVisible();
      expect(page.url()).toContain('augury=1');
      await expect(page.locator('.cb-topbar')).toBeVisible();
      await expect(page.locator('.cb-bottom-rail')).toBeVisible();
      await expect(chip.locator('.cb-mode-hold-label')).toHaveText('FAMILY HOLD');
      await expect.poll(() => auguryFetches).toBeGreaterThan(0);
    });

    test('reduced motion hold uses discrete progress and leaves no running animation after cancel', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(runtimeUrl('idle_watch', testInfo));
      const chip = page.locator('.cb-mode-hold');

      await holdChip(page);
      await expect(chip).toHaveAttribute('data-hold-state', 'holding');
      await page.waitForTimeout(700);
      // Discrete quarter steps, not a continuous RAF sweep.
      const midProgress = await page.evaluate(() => window.__HERMES_FAMILY_TOGGLE.progress());
      expect([0.25, 0.5, 0.75]).toContain(midProgress);
      await page.mouse.up();
      await expect(chip).toHaveAttribute('data-hold-state', 'idle');
      const snapshot = await page.evaluate(() => {
        const el = document.querySelector('.cb-mode-hold');
        return {
          progress: window.__HERMES_FAMILY_TOGGLE.progress(),
          runningAnimations: el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
          ringAnimationName: getComputedStyle(el.querySelector('.cb-mode-hold-ring')).animationName,
        };
      });
      expect(snapshot.progress).toBe(0);
      expect(snapshot.runningAnimations).toBe(0);
      expect(snapshot.ringAnimationName).toBe('none');

      // A full hold still activates family mode under reduced motion.
      await holdChip(page);
      await page.waitForURL(/audience=family/);
      await page.mouse.up();
      await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
    });

    test('reduced motion exit hold paces discrete steps over the longer exit duration', async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B family mode');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${runtimeUrl('idle_watch', testInfo)}&audience=family`);
      await expect(page.locator('body.family-theater[data-audience="family"]')).toBeVisible();
      const chip = page.locator('.cb-mode-hold');
      const holds = await page.evaluate(() => ({
        enterHoldMs: window.__HERMES_FAMILY_TOGGLE.enterHoldMs,
        exitHoldMs: window.__HERMES_FAMILY_TOGGLE.exitHoldMs,
      }));

      // Hold past the full ENTRY duration: the exit direction must still be
      // mid-step (not engaged), because its steps pace over the longer duration.
      await holdChip(page);
      await expect(chip).toHaveAttribute('data-hold-state', 'holding');
      await page.waitForTimeout(holds.enterHoldMs + 400);
      const midProgress = await page.evaluate(() => window.__HERMES_FAMILY_TOGGLE.progress());
      expect([0.25, 0.5, 0.75]).toContain(midProgress);
      expect(page.url()).toContain('audience=family');
      await page.mouse.up();
      await expect(chip).toHaveAttribute('data-hold-state', 'idle');

      // Cancel must leave no pending step timer: progress stays 0 and the URL
      // stays family even after another step interval would have fired.
      await page.waitForTimeout(holds.exitHoldMs / 4 + 300);
      expect(await page.evaluate(() => window.__HERMES_FAMILY_TOGGLE.progress())).toBe(0);
      expect(page.url()).toContain('audience=family');

      // A full exit hold still restores operator mode under reduced motion.
      await holdChip(page);
      await page.waitForURL((url) => !url.search.includes('audience=family'));
      await page.mouse.up();
      await expect(page.locator('body[data-audience="operator"]')).toBeVisible();
    });
  });

  test('Augury stays readable during alerts and raw text requires auguryText=1', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B Augury mode');
    const feed = {
      schema_version: '0.1.0',
      current_work: { active: true, kind: 'shell', summary: 'SAFE WORK SUMMARY from the display-safe card', detail: 'SAFE WORK DETAIL line', session_id: 'sess_workr1', age_seconds: 6 },
      items: [{ kind: 'prompt', title: 'USER PROMPT TITLE', text: 'RAW PROMPT BODY /tmp/secret should not show by default', age_seconds: 12, session_id: '20260101_010101_61cd7e', safeText: true }],
    };
    await page.route('**/api/augury-feed**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(feed) }));
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1&debug=1`);
    await expect(page.locator('.augury-ambient')).toBeVisible();
    await expect(page.locator('.augury-proof')).toHaveText('PRIVATE AUGURY');
    // Display-safe current_work rows render their text without auguryText=1.
    await expect(page.locator('.augury-ambient')).toContainText('SAFE WORK SUMMARY');
    // Raw log items show only structural trace data: title plus age/session meta.
    const promptStrand = page.locator('.augury-strand[data-kind="prompt"]').first();
    await expect(promptStrand.locator('.augury-title')).toHaveText('USER PROMPT TITLE');
    await expect(promptStrand.locator('.augury-meta')).toContainText('61CD7E');
    await expect(promptStrand.locator('.augury-meta')).toContainText('T-12S');
    // A feed-supplied safeText flag must not bypass the auguryText gate.
    expect(await page.locator('.augury-ambient').innerText()).not.toContain('RAW PROMPT BODY');

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1&auguryText=1&debug=1`);
    await expect(page.locator('.augury-ambient')).toContainText('RAW PROMPT BODY');

    await page.goto(`${runtimeUrl('blocked', testInfo)}&augury=1&auguryText=1`);
    await expect.poll(() => page.evaluate(() => document.body.dataset.auguryPresence)).toBe('subdued');
  });

  test('Augury strand flow and background veil respect reduced motion', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B Augury mode');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1`);
    await expect(page.locator('.augury-ambient')).toBeVisible();
    const anims = await page.evaluate(() => {
      const ambient = document.querySelector('.augury-ambient');
      const strand = document.querySelector('.augury-strand');
      return {
        strand: getComputedStyle(strand).animationName,
        veil: getComputedStyle(ambient, '::before').animationName,
        band: getComputedStyle(ambient, '::after').animationName,
      };
    });
    expect(anims.strand).toBe('none');
    expect(anims.veil).toBe('none');
    expect(anims.band).toBe('none');
  });

  test('canonical alert ribbon and readability floors cover high-load operator states', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B alert mode');
    await page.route('**/api/hermes-state', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: '0.1.0',
        state_preset: 'working',
        state_label: 'ACTIVE TURN',
        caption: { text: 'Checking thermal load.', tone: 'focused', priority: 'active' },
        live: {
          gateway_ok: true,
          freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
          resolver: { display_state: 'active_work' },
          system: { cpu: 0.96, memory: 0.35, temp_c: 91, cpu_temp_c: 91, uptime: '3h' },
          current_work: { active: true, kind: 'shell', visual_kind: 'shell', state: 'tool_shell', summary: 'Running a local command with a deliberately long summary for two-line wrapping.', age_seconds: 4, source: 'terminal' },
          route_rail: {
            as_of_ms: Date.now(), age_seconds: 0, active_provider_id: 'openai-codex',
            providers: [
              { id: 'openai-codex', label: 'CHATGPT', state: 'confirmed', headroom: 0.76, reachable: true },
              { id: 'anthropic', label: 'CLAUDE', state: 'inferred', headroom: 0.54, reachable: true },
              { id: 'google-gemini-cli', label: 'GEMINI', state: 'stale', headroom: 0.25, reachable: true, stale_age_s: 670 },
              { id: 'copilot', label: 'COPILOT', state: 'unknown', headroom: null, reachable: true },
            ],
          },
        },
      }),
    }));
    await page.goto(`${runtimeUrl('tool_shell', testInfo)}&live=1&augury=1`);
    await expect(page.locator('.cb-top-alert')).toBeVisible();
    await expect(page.locator('[data-cb-top-alert]')).toHaveText('TEMP HIGH');
    expect(await page.evaluate(() => document.body.dataset.systemLoad)).toBe('hot');
    expect(await page.evaluate(() => document.body.dataset.auguryPresence)).toBe('subdued');
    const fontSizes = await page.evaluate(() => Object.fromEntries(Object.entries({
      routeLabel: '.cb-route-label strong', routeValue: '.cb-route-label span', source: '.cb-source', offline: '.cb-offline-bubble strong', topAlert: '.cb-top-alert', bottomEm: '.cb-cell em',
    }).map(([key, selector]) => [key, Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
    expect(fontSizes.routeLabel).toBeGreaterThanOrEqual(24);
    expect(fontSizes.routeValue).toBeGreaterThanOrEqual(24);
    expect(fontSizes.source).toBeGreaterThanOrEqual(17);
    expect(fontSizes.offline).toBeGreaterThanOrEqual(26);
    expect(fontSizes.topAlert).toBeGreaterThanOrEqual(24);
    expect(fontSizes.bottomEm).toBeGreaterThanOrEqual(16);
  });

  test('high CPU usage stays visually neutral and does not show load-watch alert text', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B CPU neutral mode');
    await page.route('**/api/hermes-state', async (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        schema_version: '0.1.0',
        state_preset: 'quiet_watch',
        caption: { text: 'Quiet watch.', tone: 'calm', priority: 'ambient' },
        live: {
          gateway_ok: true,
          freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
          resolver: { display_state: 'quiet_watch' },
          system: { cpu: 0.96, memory: 0.35, temp_c: 55, cpu_temp_c: 55, uptime: '3h' },
          current_work: { active: false, visual_kind: 'idle', state: 'quiet_watch', summary: '', age_seconds: 0 },
        },
      }),
    }));
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect(page.locator('[data-cb-arc="cpu"]')).toHaveAttribute('data-severity', 'ok');
    await expect(page.locator('.cb-top-alert')).toHaveClass(/quiet/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/LOAD WATCH|LOAD HIGH|CPU HEADROOM/i);
    expect(await page.evaluate(() => document.body.dataset.systemLoad)).toBe('ok');
  });

  test('family audience requests the family-safe state contract', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only family privacy boundary');
    const stateRequests = [];
    const avatarStreamRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/avatar-events/stream') avatarStreamRequests.push(request.url());
    });
    await page.route('**/api/hermes-state**', async (route) => {
      stateRequests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          state_preset: 'quiet_watch',
          state_label: 'FAMILY MODE',
          caption: { text: 'Family mode.', tone: 'calm', priority: 'ambient' },
          safety: { boundary: 'local_trusted_display', redaction_level: 'public_status', contains_credentials: false },
          live: { family_mode: true, system: { cpu: 0.2, temp_c: 52 } },
        }),
      });
    });

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1&audience=family`);
    await expect.poll(() => stateRequests.length).toBeGreaterThan(0);
    expect(stateRequests.every((url) => new URL(url).searchParams.get('audience') === 'family')).toBe(true);
    expect(avatarStreamRequests).toEqual([]);
  });

  test('route rail offers a discreet manual quota refresh control', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only route rail control');
    let refreshRequests = 0;
    await page.route('**/api/provider-route-rail/refresh', async (route) => {
      refreshRequests += 1;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, status: 'queued' }),
      });
    });

    await page.goto(runtimeUrl('idle_watch', testInfo));
    const refresh = page.locator('.cb-route-refresh');
    await expect(refresh).toBeVisible();
    await expect(refresh).toHaveAttribute('aria-label', 'Refresh model availability and quota headroom');
    await refresh.evaluate((element) => {
      window.__HERMES_ROUTE_REFRESH_STATES = [element.dataset.refreshState];
      new MutationObserver(() => {
        window.__HERMES_ROUTE_REFRESH_STATES.push(element.dataset.refreshState);
      }).observe(element, { attributes: true, attributeFilter: ['data-refresh-state'] });
    });
    await refresh.click();
    await expect.poll(() => refreshRequests).toBe(1);
    await expect.poll(
      () => page.evaluate(() => window.__HERMES_ROUTE_REFRESH_STATES),
    ).toContain('queued');
  });

  test('touch FX creates optic resonance, constellation stars, motes, and Concept B touch pulse', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B touch integration');
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    const result = await page.evaluate(() => {
      const pulseCalls = [];
      const motion = window.__HERMES_CONCEPT_B_EYE_MOTION;
      const originalPulse = motion?.touchPulse;
      const beforeDebug = motion?.debug?.();
      const beforeMode = window.__HERMES_DISPLAY_BEHAVIOR?.mode || null;
      if (motion) {
        motion.touchPulse = (detail) => {
          const applied = originalPulse?.call(motion, detail);
          pulseCalls.push({ detail, applied, debug: motion.debug?.() });
          return applied;
        };
      }
      const w = window.innerWidth;
      const h = window.innerHeight;
      window.HermesTouchFxController.spawnForZone('boop', w * 0.78, h * 0.47);
      const afterDebug = motion?.debug?.();
      const afterMode = window.__HERMES_DISPLAY_BEHAVIOR?.mode || null;
      return {
        motes: document.querySelectorAll('.touch-fx-mote').length,
        resonance: document.querySelectorAll('.touch-fx-resonance').length,
        pulseCalls: pulseCalls.map((call) => ({
          zone: call.detail.zone,
          distance: call.detail.distance,
          angle: call.detail.angle,
          applied: call.applied,
          targetX: call.debug?.targetX,
          targetY: call.debug?.targetY,
          targetName: call.debug?.targetName,
          forcedUntil: call.debug?.forcedUntil,
        })),
        beforeDebug,
        afterDebug,
        beforeMode,
        afterMode,
        vectorDistance: window.HermesTouchFxController.touchVectorFromOptic(w * 0.78, h * 0.47).distance,
      };
    });
    expect(result.motes).toBeGreaterThan(0);
    expect(result.resonance).toBeGreaterThan(0);
    const boopPulse = result.pulseCalls.find((call) => call.zone === 'boop');
    expect(boopPulse).toBeTruthy();
    expect(boopPulse.applied.x).toBeGreaterThan(0);
    expect(boopPulse.targetName).toBe('user_touch');
    expect(boopPulse.forcedUntil).toBeGreaterThan(result.beforeDebug.forcedUntil || 0);
    expect(result.afterDebug.touchTarget.pointerCount).toBeGreaterThanOrEqual(1);
    expect(result.afterDebug.targetName).toBe('user_touch');
    expect(result.afterDebug.targetX).toBeCloseTo(boopPulse.applied.x, 4);
    expect(result.afterMode).toBe(result.beforeMode);
    const starResult = await page.evaluate(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      window.HermesTouchFxController.testLongPressStar(w * 0.52, h * 0.52);
      return {
        stars: document.querySelectorAll('.touch-fx-constellation-star').length,
        playMemory: window.HermesTouchFxController.playMemory(),
      };
    });
    expect(starResult.stars).toBeGreaterThan(0);
    expect(Number.isFinite(result.vectorDistance)).toBe(true);
    expect(starResult.playMemory.taps).toBeGreaterThan(0);
  });

  test('touch FX keeps side comets and bottom fireflies despite thermal reduced display state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only touch FX integration');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    const result = await page.evaluate(() => {
      document.documentElement.dataset.hermesReducedMotion = 'true';
      const fx = window.HermesTouchFxController;
      const w = window.innerWidth;
      const h = window.innerHeight;
      fx.spawnForZone('floor', w * 0.5, h * 0.93);
      fx.spawnForZone('left', w * 0.04, h * 0.5);
      fx.spawnForZone('right', w * 0.96, h * 0.5);
      return {
        mediaReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        datasetReduced: document.documentElement.dataset.hermesReducedMotion,
        fireflies: document.querySelectorAll('.touch-fx-firefly').length,
        cometsLeft: document.querySelectorAll('.touch-fx-comet.from-left').length,
        cometsRight: document.querySelectorAll('.touch-fx-comet.from-right').length,
        ground: document.querySelectorAll('.touch-fx-orbit.ground-wave').length,
      };
    });
    expect(result.mediaReduced).toBe(false);
    expect(result.datasetReduced).toBe('true');
    expect(result.fireflies).toBeGreaterThan(0);
    expect(result.cometsLeft).toBeGreaterThan(0);
    expect(result.cometsRight).toBeGreaterThan(0);
    expect(result.ground).toBeGreaterThan(0);
  });

  test('Concept B touch particles return behind the iris when idle', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only iris layering');
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    const state = await page.evaluate(() => {
      const layer = document.querySelector('.touch-fx-layer');
      const read = () => ({
        fxState: window.HermesTouchFxController.touchFxState(),
        zIndex: getComputedStyle(layer).zIndex,
        attracted: document.querySelectorAll('.touch-fx-mote.attracted').length,
      });
      const before = read();
      window.HermesTouchFxController.spawnForZone('boop', window.innerWidth * 0.5, window.innerHeight * 0.5);
      const active = read();
      window.HermesTouchFxController.testForceIdle();
      const idle = read();
      return { before, active, idle };
    });
    expect(state.before.fxState).toBe('idle');
    expect(state.before.zIndex).toBe('1');
    expect(state.active.fxState).toBe('active');
    expect(state.active.zIndex).toBe('9');
    expect(state.active.attracted).toBeGreaterThan(0);
    expect(state.idle.fxState).toBe('idle');
    expect(state.idle.zIndex).toBe('1');
    expect(state.idle.attracted).toBe(0);
  });

  test('Concept B optic vitals: hippus wanders when alive and parks in stopped modes', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION?.debug));
    const first = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
    expect(first.vitals).toBeTruthy();
    expect(first.vitals.mode).toBe('idle_watch');
    expect(first.vitals.nextSighAt).toBeGreaterThan(0);
    expect(first.vitals.nextRegardAt).toBeGreaterThan(0);
    await expect.poll(
      () => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().hippus),
      { timeout: 3000 },
    ).not.toBe(first.hippus);
    const second = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
    // Continuous pupillary unrest: the hippus scalar moves between samples but stays subtle.
    expect(second.hippus).not.toBe(first.hippus);
    expect(Math.abs(second.hippus)).toBeLessThanOrEqual(0.04);

    // Stopped modes park involuntary pupil life entirely (same rule as the iris lattice).
    await page.goto(runtimeUrl('blocked', testInfo));
    await page.waitForFunction(() => window.__HERMES_CONCEPT_B_EYE_MOTION?.debug?.().mode === 'blocked');
    await page.waitForTimeout(300);
    const parked = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
    expect(parked.hippus).toBe(0);
  });

  test('Concept B optic vitals stay inert under reduced motion', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION?.debug));
    await page.waitForTimeout(600);
    const snapshots = await page.evaluate(async () => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      const idle = rig.debug();
      rig.acknowledgeViewer('presence', 300);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { idle, acknowledged: rig.debug() };
    });
    expect(snapshots.idle.hippus).toBe(0);
    expect(snapshots.idle.regard).toBe(0);
    expect(snapshots.idle.vitals.sighing).toBe(false);
    expect(snapshots.acknowledged.regard).toBe(0);
    expect(snapshots.acknowledged.socialLift).toBe(0);
  });

  test('Concept B optic regard stays inert when anime is unavailable', async ({ page }, testInfo) => {
    await page.route('**/vendor/anime.iife.min.js*', (route) => route.abort());
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION?.debug));

    const vitals = await page.evaluate(async () => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      rig.acknowledgeViewer('presence', 300);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { ...rig.debug(), animeAvailable: Boolean(window.anime) };
    });

    expect(vitals.regard).toBe(0);
    expect(vitals.socialLift).toBe(0);
    expect(vitals.animeAvailable).toBe(false);
  });

  test('legacy mood-only preset JSON normalizes before rich behavior enrichment', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    const packet = await page.evaluate(() => {
      const preset = { ...window.HermesDisplayState.PRESETS.thinking_focused };
      delete preset.behavior_mode;
      delete preset.state_preset;
      delete preset.optic_state_packet;
      delete preset.puppet_state_packet;
      const normalized = window.HermesDisplayState.normalizePersonaPacket(preset);
      return window.HermesDisplayState.opticPacketToPersonaPacket({ mode: normalized.state_preset }, normalized);
    });
    expect(packet.mood).toBe('thinking_focused');
    expect(packet.state_preset).toBe('reasoning');
    expect(packet.optic_state_packet?.mode).toBe('reasoning');
  });

  test('Concept B route rail fallback stays honest when provider data is absent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await expect(page.locator('.cb-route-rail')).toBeVisible();
    await expect(page.locator('.cb-route-title')).toHaveText('ROUTE · HEADROOM');
    await expect(page.locator('.cb-route-standby')).toHaveText('ROUTE UNKNOWN');
    const rows = page.locator('.cb-route-row');
    await expect(rows).toHaveCount(5);
    const snapshot = await rows.evaluateAll((nodes) => nodes.map((node) => {
      const whisker = node.querySelector('.cb-route-whisker');
      const style = getComputedStyle(whisker);
      return {
        label: node.querySelector('[data-route-label]')?.textContent,
        value: node.querySelector('[data-route-value]')?.textContent,
        glyph: node.querySelector('[data-route-glyph]')?.textContent,
        state: node.dataset.state,
        active: node.dataset.active,
        headroomTier: node.dataset.headroomTier,
        collapsed: node.dataset.collapsed,
        rowOpacity: Number.parseFloat(getComputedStyle(node).opacity),
        whiskerWidth: Number.parseFloat(style.width),
        whiskerTransform: style.transform,
        whiskerOpacity: Number.parseFloat(style.opacity),
        trackOpacity: Number.parseFloat(getComputedStyle(node.querySelector('.cb-route-track')).opacity),
      };
    }));
    expect(snapshot.map((row) => row.label)).toEqual(['CHATGPT', 'CLAUDE', 'GEMINI', 'COPILOT', 'XAI']);
    for (const row of snapshot) {
      expect(row).toMatchObject({ value: 'UNK', glyph: '○', state: 'unknown', active: 'false', headroomTier: 'none', collapsed: 'true' });
      expect(row.rowOpacity).toBeGreaterThan(.45); // Unknown remains readable.
      expect(row.rowOpacity).toBeLessThan(.75); // Verified provider rows retain emphasis.
      expect(row.whiskerWidth).toBeGreaterThan(38);
      expect(row.whiskerTransform).toBe('matrix(0, 0, 0, 1, 0, 0)');
      expect(row.whiskerOpacity).toBe(0);
      expect(row.trackOpacity).toBe(0);
    }
    await expect(page.locator('.cb-route-rail')).toHaveAttribute('data-rail-quiet', 'true');
    expect(Number(await page.locator('.cb-route-active-hairline').evaluate((node) => window.getComputedStyle(node).opacity))).toBe(0);
    const unsafeText = await page.locator('.cb-route-rail').textContent();
    expect(unsafeText).not.toMatch(/org_|req_|sk-|gh[pousr]_|\$\d|@/i);
  });

  test('Concept B route rail value lane clears max headroom whiskers', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'thinking_focused',
          skin: 'retro-robot-core',
          state_preset: 'working',
          state_label: 'ACTIVE TURN',
          caption: { text: 'Working in the shell.', tone: 'focused', priority: 'active' },
          snippet: { id: 'test', text: 'display-safe route rail test', kind: 'system', sensitivity: 'display_safe' },
          live: {
            gateway_ok: true,
            tasks: 0,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.77, memory: 0.35, temp_c: 69, cpu_temp_c: 69, uptime: '3h' },
            current_work: { active: true, kind: 'shell', state: 'tool_shell', summary: 'Working in the shell.', detail: 'Running a local command.', age_seconds: 4, source: 'cli' },
            route_rail: {
              as_of_ms: Date.now(),
              age_seconds: 0,
              active_provider_id: 'google-gemini-cli',
              providers: [
                { id: 'openai-codex', label: 'CHATGPT', tier_label: 'PRO', state: 'confirmed', headroom: 0.79, reachable: true },
                { id: 'anthropic', label: 'CLAUDE', tier_label: 'MAX', state: 'confirmed', headroom: 0.95, reset_at_epoch_s: Date.now() / 1000 + 10_800, reachable: true },
                { id: 'google-gemini-cli', label: 'GEMINI', tier_label: 'CLI', state: 'confirmed', headroom: 1.0, reachable: true },
                { id: 'copilot', label: 'COPILOT', tier_label: 'PRO', state: 'confirmed', headroom: 0.7, credits_used: 450, credits_limit: 1500, reset_at_epoch_s: Date.now() / 1000 + 900_000, reachable: true },
                { id: 'xai-oauth', label: 'XAI', tier_label: 'SUPERGROK', state: 'inferred', headroom: null, reachable: true },
              ],
            },
          },
          optic_state_packet: { mode: 'tool_shell', special: 'grid_8x8', halo: { color: 'cyan', opacity: 0.5 }, ring: { period_s: 26, opacity: 0.5 }, breath: { period_s: 4.8, scale: 1.02 }, blink: { interval_ms: 5200 }, eyes: { lid_open: 1, pupil_scale: 1, iris_scale: 1 }, gaze: { offset_x: 0, offset_y: 0 } },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('tool_shell', testInfo)}&live=1`);
    await expect(page.locator('.cb-route-rail')).toBeVisible();
    await expect(page.locator('[data-route-value]').nth(2)).toHaveText('100%');
    await expect(page.locator('[data-route-tier]').nth(1)).toContainText('reset 2h');
    await expect.poll(() => page.locator('.cb-route-row').evaluateAll((rows) => rows.slice(0, 3).every((row) => {
      const whiskerEl = row.querySelector('.cb-route-whisker');
      return Number.parseFloat(getComputedStyle(whiskerEl).width) > 30;
    }))).toBe(true);
    const collapseState = await page.locator('.cb-route-row').evaluateAll((rows) => rows.map((row) => ({
      label: row.querySelector('[data-route-label]')?.textContent,
      state: row.dataset.state,
      collapsed: row.dataset.collapsed,
      opacity: Number.parseFloat(getComputedStyle(row).opacity),
    })));
    expect(collapseState.slice(0, 3).every((row) => row.collapsed === 'false' && row.opacity > 0.8)).toBe(true);
    expect(collapseState[3]).toMatchObject({ label: 'COPILOT', state: 'confirmed', collapsed: 'false' });
    expect(collapseState[3].opacity).toBeGreaterThan(0.8);
    await expect(page.locator('[data-route-value]').nth(3)).toHaveText('70%');
    await expect(page.locator('[data-route-tier]').nth(3)).toContainText('450/1.5K CR');
    await expect(page.locator('[data-route-tier]').nth(3)).toContainText('PRO');
    await expect(page.locator('[data-route-label]').nth(4)).toHaveText('XAI');
    await expect(page.locator('[data-route-value]').nth(4)).toHaveText('READY');
    await expect(page.locator('[data-route-tier]').nth(4)).toContainText('SUPERGROK');
    await expect(page.locator('.cb-route-row').nth(4)).toHaveAttribute('data-has-headroom', 'false');
    expect(await page.locator('.cb-route-row').nth(4).evaluate((row) => ({
      track: Number.parseFloat(getComputedStyle(row.querySelector('.cb-route-track')).opacity),
      whisker: Number.parseFloat(getComputedStyle(row.querySelector('.cb-route-whisker')).opacity),
    }))).toEqual({ track: 0, whisker: 0 });
    await expect(page.locator('.cb-route-rail')).toHaveAttribute('data-rail-quiet', 'false');
    const geometry = await page.locator('.cb-route-row').evaluateAll((rows) => rows.map((row) => {
      const value = row.querySelector('[data-route-value]').getBoundingClientRect();
      const whisker = row.querySelector('.cb-route-whisker').getBoundingClientRect();
      const node = row.querySelector('.cb-route-node').getBoundingClientRect();
      return {
        valueRight: value.right,
        whiskerLeft: whisker.left,
        nodeLeft: node.left,
      };
    }));
    for (const [idx, row] of geometry.entries()) {
      if (idx < 3) {
        expect(row.valueRight).toBeLessThanOrEqual(row.whiskerLeft - 4);
      }
      expect(row.valueRight).toBeLessThanOrEqual(row.nodeLeft - 8);
    }
  });

  test('Concept B route rail shows confirmed Copilot credits used without fake headroom', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'idle_watchful',
          skin: 'retro-robot-core',
          state_preset: 'quiet_watch',
          state_label: 'LOCAL WATCH',
          caption: { text: 'Systems steady.', tone: 'calm', priority: 'ambient' },
          snippet: { id: 'test', text: 'display-safe credits-used route test', kind: 'system', sensitivity: 'display_safe' },
          live: {
            gateway_ok: true,
            tasks: 0,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.12, memory: 0.31, temp_c: 52, cpu_temp_c: 52, uptime: '3h' },
            current_work: { active: false, summary: 'Systems steady.', age_seconds: 0, source: 'local' },
            route_rail: {
              as_of_ms: Date.now(),
              age_seconds: 0,
              active_provider_id: '',
              providers: [
                { id: 'openai-codex', label: 'CHATGPT', state: 'unknown', headroom: null, reachable: true },
                { id: 'anthropic', label: 'CLAUDE', state: 'unknown', headroom: null, reachable: true },
                { id: 'google-gemini-cli', label: 'GEMINI', state: 'unknown', headroom: null, reachable: true },
                { id: 'copilot', label: 'COPILOT', tier_label: 'CREDITS', state: 'confirmed', headroom: null, credits_used: 126.25, credits_limit: null, reachable: true },
                { id: 'xai-oauth', label: 'XAI', state: 'unknown', headroom: null, reachable: true },
              ],
            },
          },
          optic_state_packet: { mode: 'idle_watch', special: 'none', halo: { color: 'cyan', opacity: 0.3 }, ring: { period_s: 40, opacity: 0.35 }, breath: { period_s: 6, scale: 1.01 }, blink: { interval_ms: 6200 }, eyes: { lid_open: 1, pupil_scale: 1, iris_scale: 1 }, gaze: { offset_x: 0, offset_y: 0 } },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    const copilot = page.locator('.cb-route-row').nth(3);
    await expect(copilot).toHaveAttribute('data-state', 'confirmed');
    await expect(copilot).toHaveAttribute('data-has-headroom', 'false');
    await expect(copilot.locator('[data-route-value]')).toHaveText('126');
    await expect(copilot.locator('[data-route-tier]')).toContainText('126 CR USED');
    await expect(copilot.locator('[data-route-tier]')).toContainText('CREDITS');
    expect(await copilot.evaluate((row) => ({
      track: Number.parseFloat(getComputedStyle(row.querySelector('.cb-route-track')).opacity),
      whisker: Number.parseFloat(getComputedStyle(row.querySelector('.cb-route-whisker')).opacity),
    }))).toEqual({ track: 0, whisker: 0 });
  });

  test('Concept B route rail provider handoff reads as a row event', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    const railPacket = (activeId, claudeHeadroom) => ({
      schema_version: '0.4.0',
      generated_at: new Date().toISOString(),
      mood: 'idle_watchful',
      skin: 'retro-robot-core',
      state_preset: 'quiet_watch',
      caption: { text: 'Systems steady.', tone: 'calm', priority: 'ambient' },
      snippet: { id: 'test', text: 'display-safe route handoff test', kind: 'system', sensitivity: 'display_safe' },
      live: {
        gateway_ok: true,
        tasks: 0,
        freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
        system: { cpu: 0.12, memory: 0.30, temp_c: 52, cpu_temp_c: 52, uptime: '3h' },
        current_work: { active: false, summary: 'Systems steady.', age_seconds: 0, source: 'local' },
        route_rail: {
          as_of_ms: Date.now(),
          age_seconds: 0,
          active_provider_id: activeId,
          providers: [
            { id: 'openai-codex', label: 'CHATGPT', tier_label: 'PRO', state: 'confirmed', headroom: 0.40, reachable: true },
            { id: 'anthropic', label: 'CLAUDE', tier_label: 'MAX', state: 'confirmed', headroom: claudeHeadroom, reachable: true },
            { id: 'google-gemini-cli', label: 'GEMINI', tier_label: 'CLI', state: 'inferred', headroom: 0.55, reachable: true },
            { id: 'copilot', label: 'COPILOT', tier_label: '', state: 'unknown', headroom: null, reachable: true },
          ],
        },
      },
      safety: { boundary: 'local_trusted_display', contains_credentials: false },
    });
    let currentRailPacket = railPacket('anthropic', 0.62);
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentRailPacket),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    const rows = page.locator('.cb-route-row');
    const hairlineY = () => page.locator('.cb-route-active-hairline').evaluate((node) => {
      const transform = window.getComputedStyle(node).transform;
      return transform.startsWith('matrix(') ? Number.parseFloat(transform.slice(7, -1).split(',')[5]) : NaN;
    });
    const hairlineTarget = () => page.locator('.cb-route-active-hairline').evaluate((node) => (
      Number.parseFloat(node.style.getPropertyValue('--route-active-y'))
    ));
    const settleHairline = () => page.locator('.cb-route-active-hairline').evaluate((node) => {
      for (const animation of node.getAnimations()) animation.finish();
    });

    await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(rows.nth(1)).toHaveAttribute('data-headroom-tier', 'ok');
    await expect.poll(hairlineTarget).toBe(233);
    await settleHairline();
    await expect.poll(hairlineY).toBeCloseTo(278, 0);
    const ticksBeforeHandoff = await page.evaluate(() => window.__HERMES_STATUS_TICKS);

    currentRailPacket = railPacket('openai-codex', 0.08);
    await expect(rows.nth(0)).toHaveAttribute('data-active', 'true', { timeout: 15000 });
    await expect(rows.nth(1)).toHaveAttribute('data-active', 'false');
    await expect(rows.nth(1)).toHaveAttribute('data-headroom-tier', 'low');
    await expect(rows.nth(1).locator('[data-route-value]')).toHaveText('8%');
    await expect.poll(hairlineTarget).toBe(97);
    await settleHairline();
    await expect.poll(hairlineY).toBeCloseTo(142, 0);
    expect(await page.evaluate(() => window.__HERMES_STATUS_TICKS)).toBeGreaterThan(ticksBeforeHandoff);

    const lanes = await rows.evaluateAll((nodes) => nodes.map((node) => {
      const track = node.querySelector('.cb-route-track').getBoundingClientRect();
      const whisker = node.querySelector('.cb-route-whisker').getBoundingClientRect();
      return { trackWidth: track.width, trackRight: track.right, whiskerRight: whisker.right, tier: node.dataset.headroomTier };
    }));
    for (const lane of lanes.slice(0, 3)) {
      expect(lane.trackWidth).toBeGreaterThan(38);
      expect(Math.abs(lane.trackRight - lane.whiskerRight)).toBeLessThanOrEqual(1);
    }
    expect(lanes.map((lane) => lane.tier)).toEqual(['ok', 'low', 'ok', 'none', 'none']);
  });

  test('Concept B remote memory cell defaults to honest Honcho unknown state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await expect(page.locator('[data-cb-memory]')).toBeVisible();
    await expect(page.locator('[data-cb-memory]')).toHaveText(/HONCHO (UNKNOWN|UP|DOWN|STALE)/);
    const memoryText = await page.locator('.cb-bottom-rail').textContent();
    expect(memoryText).toContain('REMOTE MEMORY');
    expect(memoryText).not.toMatch(/apiKey|authorization|bearer|sk-|gh[pousr]_|@/i);
  });

  test('Concept B keeps local-watch tasks visually distinct from an active turn', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'healthy_smug',
          skin: 'retro-robot-core',
          state_preset: 'quiet_watch',
          state_label: 'QUIET WATCH',
          caption: { text: 'Systems steady. Watching the lab.', tone: 'calm', priority: 'ambient' },
          snippet: { id: 'test', text: 'gateway ok', kind: 'system', sensitivity: 'display_safe' },
          live: {
            gateway_ok: true,
            tasks: 2,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.18, memory: 0.40, temp_c: 66, cpu_temp_c: 66, uptime: '1d' },
            current_work: { active: false, state: 'quiet_watch', summary: 'Quiet watch. No active turn is running.', detail: 'Local display is monitoring without an active turn.', age_seconds: null, source: 'cli' },
            kanban: { active: 2, summary: '2 active task(s)', tasks: [{ title: 'one', status: 'pending' }, { title: 'two', status: 'pending' }] },
            resolver: { display_state: 'quiet_watch', priority: 70, reason_codes: ['quiet_watch'], secondary_badges: [] },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          optic_state_packet: { mode: 'idle_watch', special: 'none', halo: { color: 'amber', opacity: 0.34 }, ring: { period_s: 80, opacity: 0.34 }, breath: { period_s: 5.2, scale: 1.018 }, blink: { interval_ms: 5200 }, eyes: { lid_open: 1, pupil_scale: 1, iris_scale: 1 }, gaze: { offset_x: 0, offset_y: 0 } },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect(page.locator('[data-cb-state]')).toHaveText('LOCAL WATCH');
    await expect(page.locator('[data-cb-activity]')).toHaveText('2 tasks queued. Quiet watch.');
    await expect(page.locator('[data-cb-source]')).toHaveText('LOCAL · WATCH');
    await expect(page.locator('[data-cb-tasks]')).toHaveText('2 QUEUED');
    await expect(page.locator('[data-cb-task-hint]')).toHaveText('queued calmly');
    await expect(page.locator('[data-cb-task-dot]')).toHaveClass(/ok/);
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'idle_watch');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'none');
  });

  test('Concept B blocked task uses attention copy instead of quiet-watch queue copy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'blocked_annoyed',
          skin: 'retro-amber-watch',
          state_preset: 'blocked',
          state_label: 'BLOCKED',
          caption: { text: 'Quiet watch. Nothing needs attention.', tone: 'calm', priority: 'ambient' },
          live: {
            gateway_ok: true,
            freshness: { tier: 'fresh', valid_measurements: 3, stale_measurements: [] },
            system: { cpu: 0.20, memory: 0.40, temp_c: 54, cpu_temp_c: 54, uptime: '1d' },
            current_work: { active: false, state: 'blocked', summary: '1 task queued. Quiet watch.', age_seconds: 30, source: 'kanban' },
            kanban: { active: 1, queued: 1, blocked: 1 },
            resolver: { display_state: 'blocked_user_task', priority: 100, reason_codes: ['blocked_user_task'] },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          optic_state_packet: { mode: 'blocked' },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('blocked', testInfo)}&live=1`);
    await expect(page.locator('[data-cb-state]')).toHaveText('BLOCKED');
    await expect(page.locator('[data-cb-activity]')).toHaveText('Blocked user task needs Brian.');
    await expect(page.locator('[data-cb-activity]')).not.toContainText('Quiet watch');
    await expect(page.locator('[data-cb-source]')).toHaveText('KANBAN');
    await expect(page.locator('[data-cb-top-alert]')).toHaveText('WAITING FOR BRIAN');
    await expect(page.locator('[data-cb-top-alert-detail]')).toHaveText(/^BLOCKED USER TASK NEEDS BRI/);
    await expect(page.locator('[data-cb-tasks]')).toHaveText('1 QUEUED');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'blocked');
  });

  test('Concept B live packet with only optic_state_packet.mode synchronizes XState behavior', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'healthy_smug',
          skin: 'retro-robot-core',
          state_preset: 'quiet_watch',
          state_label: 'QUIET WATCH',
          caption: { text: 'Optic mode should drive behavior.', tone: 'focused', priority: 'ambient' },
          snippet: { id: 'test', text: 'display safe', kind: 'system', sensitivity: 'display_safe' },
          live: {
            gateway_ok: true,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.18, memory: 0.40, temp_c: 66, cpu_temp_c: 66, uptime: '1d' },
            current_work: { active: true, state: 'current_work', kind: 'shell', visual_kind: 'shell', summary: 'Working in the shell.', age_seconds: 10, source: 'cli' },
            kanban: { active: 0, tasks: [] },
            resolver: { display_state: 'planning_reasoning', priority: 80, reason_codes: ['current_work'], secondary_badges: [] },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          optic_state_packet: { mode: 'tool_shell', special: 'none' },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'grid_8x8');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-health', 'nominal');
  });

  test('Concept B live packet with only state_preset derives behavior and overlay regions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'thinking_focused',
          skin: 'retro-robot-core',
          state_preset: 'working',
          state_label: 'WORKING',
          severity: 'critical',
          motion: { severity: 'critical' },
          caption: { text: 'Preset-only packet should still drive behavior.', tone: 'focused', priority: 'ambient' },
          snippet: { id: 'test', text: 'operator only', kind: 'system', sensitivity: 'operator_only' },
          live: {
            gateway_ok: true,
            freshness: { tier: 'lost', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.18, memory: 0.40, temp_c: 66, cpu_temp_c: 66, uptime: '1d' },
            current_work: { active: true, state: 'current_work', kind: 'shell', visual_kind: 'shell', summary: 'Working in the shell.', age_seconds: 10, source: 'cli' },
            kanban: { active: 0, tasks: [] },
            resolver: { display_state: 'planning_reasoning', priority: 80, reason_codes: ['current_work'], secondary_badges: [] },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'grid_8x8');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-health', 'critical');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-privacy', 'sensitive');
  });

  test('Concept B live thinking-focused searching packet is not collapsed to tool_shell by lifecycle effects', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'thinking_focused',
          skin: 'retro-robot-core',
          state_preset: 'working',
          state_label: 'SEARCHING',
          caption: { text: 'Searching should remain searching.', tone: 'focused', priority: 'ambient' },
          snippet: { id: 'test', text: 'searching', kind: 'system', sensitivity: 'display_safe' },
          live: {
            gateway_ok: true,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.18, memory: 0.40, temp_c: 66, cpu_temp_c: 66, uptime: '1d' },
            current_work: { active: true, state: 'current_work', kind: 'search', visual_kind: 'search', summary: 'Searching docs.', age_seconds: 10, source: 'cli' },
            kanban: { active: 0, tasks: [] },
            resolver: { display_state: 'planning_reasoning', priority: 80, reason_codes: ['current_work'], secondary_badges: [] },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          optic_state_packet: { mode: 'searching', special: 'scan_sweep', halo: { color: 'amber', opacity: 0.48 }, ring: { period_s: 8, opacity: 0.58 }, breath: { period_s: 3.4, scale: 1.018 }, blink: { interval_ms: 2200 }, eyes: { lid_open: 1, pupil_scale: 1.05, iris_scale: 1.08 }, gaze: { offset_x: 0, offset_y: 0 } },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1`);
    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('searching');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'searching');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'scan_sweep');
  });

  test('Concept B avatar lifecycle event updates rendered mode from XState snapshot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_DISPLAY_BEHAVIOR && window.HermesDisplayRuntime?.publishAvatarEvent), null, { timeout: 8000 });

    await page.evaluate(() => window.HermesDisplayRuntime.publishAvatarEvent({
      schema_version: '0.1.0',
      id: 'test-tool-started',
      event: 'assistant.tool_started',
      occurred_at: new Date().toISOString(),
      source: 'playwright',
      boundary: 'localhost_only',
      privacy: 'display_safe_intent',
      ttl_ms: 12000,
      priority: 'normal',
      display: { intent: 'tool_active', label: 'tool active', visual_kind: 'shell', side: 'center', intensity: 0.6 },
      meta: {},
    }));

    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'tool_shell');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'grid_8x8');
    await expect(page.locator('[data-cb-state]')).not.toHaveText(/QUIET WATCH/i);
  });

  test('Concept B feed avatar events update behavior and health overlays together', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_DISPLAY_BEHAVIOR && window.HermesDisplayRuntime?.publishAvatarEvent), null, { timeout: 8000 });

    await page.evaluate(() => window.HermesDisplayRuntime.publishAvatarEvent({
      schema_version: '0.1.0',
      id: 'test-feed-lost',
      event: 'feed.lost',
      occurred_at: new Date().toISOString(),
      source: 'playwright',
      boundary: 'localhost_only',
      privacy: 'display_safe_intent',
      ttl_ms: 60000,
      priority: 'attention',
      display: { intent: 'feed_lost', label: 'feed lost', visual_kind: 'feed', side: 'center', intensity: 0.8 },
      meta: {},
    }));

    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('degraded_offline');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'degraded_offline');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'offline_horizon');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-health', 'critical');

    await page.evaluate(() => window.HermesDisplayRuntime.publishAvatarEvent({
      schema_version: '0.1.0',
      id: 'test-feed-recovered',
      event: 'feed.recovered',
      occurred_at: new Date().toISOString(),
      source: 'playwright',
      boundary: 'localhost_only',
      privacy: 'display_safe_intent',
      ttl_ms: 60000,
      priority: 'normal',
      display: { intent: 'feed_recovered', label: 'feed recovered', visual_kind: 'recovery', side: 'center', intensity: 0.5 },
      meta: {},
    }));

    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode)).toBe('idle_watch');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-mode', 'idle_watch');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-optic-special', 'none');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-health', 'nominal');
  });

  for (const [mode, expected] of [
    ['idle_watch', 'focus'],
    ['reasoning', 'subdued'],
    ['tool_shell', 'subdued'],
    ['waiting_user', 'subdued'],
    ['blocked', 'subdued'],
    ['degraded_offline', 'subdued'],
  ]) {
    test(`Augury presence uses accepted vocabulary for ${mode}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
      await page.goto(`${runtimeUrl(mode, testInfo)}&augury=1`);
      await expect(page.locator('body')).toHaveAttribute('data-augury-presence', expected);
    });
  }

  test('runtime exposes the synchronized display build id', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BUILD_ID)).toBe(EXPECTED_BUILD_ID);
    await expect(page.locator('html')).toHaveAttribute('data-hermes-display-build-id', EXPECTED_BUILD_ID);
  });

  test('living field has ambient mote motion', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    const moteBefore = await page.locator('.cb-field-mote').first().evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy'), window.getComputedStyle(node).opacity].join(','));
    await expect.poll(
      () => page.locator('.cb-field-mote').first().evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy'), window.getComputedStyle(node).opacity].join(',')),
      { timeout: 3000 },
    ).not.toBe(moteBefore);
    const moteAfter = await page.locator('.cb-field-mote').first().evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy'), window.getComputedStyle(node).opacity].join(','));
    expect(moteAfter).not.toBe(moteBefore);
  });

  test('reasoning mode exposes focused field instrumentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('reasoning', testInfo));
    const reasoning = await page.locator('.cb-radial-stage').evaluate((node) => ({
      mode: node.dataset.fieldMode,
      focus: Number(node.style.getPropertyValue('--cb-field-focus')),
      ringOpacity: window.getComputedStyle(document.querySelector('.cb-field-ring-c')).opacity,
    }));
    expect(reasoning.mode).toBe('reasoning');
    expect(reasoning.focus).toBeGreaterThan(0.7);
  });

  test('tool mode exposes precision field instrumentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('tool_shell', testInfo));
    await expect(page.locator('.cb-field-tool-precision')).toBeVisible();
    expect(Number(await page.locator('.cb-field-tool-precision').evaluate((node) => window.getComputedStyle(node).opacity))).toBeGreaterThan(0.3);
  });

  test('blocked mode exposes bracket field instrumentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('blocked', testInfo));
    expect(Number(await page.locator('.cb-field-blocked-brackets').evaluate((node) => window.getComputedStyle(node).opacity))).toBeGreaterThan(0.3);
  });

  test('material deforms around a stable optic without a spinning status ring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('reasoning', testInfo));
    const folds = page.locator('.cb-presence-fold');
    await expect(folds).toHaveCount(6);
    const sample = () => page.evaluate(() => {
      const core = document.querySelector('.cb-eye-core');
      const center = new DOMPoint(550, 550).matrixTransform(core.getScreenCTM());
      return { x: center.x, y: center.y, d: document.querySelector('.cb-presence-fold').getAttribute('d') };
    });
    const first = await sample();
    await page.waitForTimeout(700);
    const second = await sample();
    expect(second.d).not.toBe(first.d);
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeLessThan(1);
    await expect(page.locator('.cb-status-rings')).toBeHidden();
  });

  test('iris lattice is procedural, clipped to the lens, and anchored to the optic center', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    const geometry = await page.evaluate(() => {
      const filaments = Array.from(document.querySelectorAll('.cb-iris-lattice .cb-iris-filament'));
      const radii = filaments.flatMap(path => {
        const length = path.getTotalLength();
        return Array.from({ length: 20 }, (_, i) => {
          const p = path.getPointAtLength(length * i / 19);
          return Math.hypot(p.x - 550, p.y - 550);
        });
      });
      return {
        count: filaments.length,
        brightCount: document.querySelectorAll('.cb-iris-lattice .cb-iris-filament-bright').length,
        maxR: Math.max(...radii),
        minR: Math.min(...radii),
        hasCollar: Boolean(document.querySelector('.cb-iris-lattice .cb-iris-collar')),
        hasLimbal: Boolean(document.querySelector('.cb-iris-lattice .cb-iris-limbal')),
      };
    });
    expect(geometry.count).toBe(180);
    expect(geometry.brightCount).toBe(20);
    expect(geometry.maxR).toBeLessThanOrEqual(172); // inside the r=176 lens clip
    expect(geometry.minR).toBeGreaterThanOrEqual(48); // inner fibers can pass beneath the foreground pupil
    expect(geometry.hasCollar).toBe(true);
    expect(geometry.hasLimbal).toBe(true);
    // The single RAF writer must keep rotation pinned to the lens center.
    await expect.poll(() => page.evaluate(() => document.querySelector('.cb-iris-lattice').getAttribute('transform') || '')).toContain('550 550');
    // Gentle torsion stays centered; the material never makes a full revolution.
    await expect.poll(
      () => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().irisAngle),
      { timeout: 6000 },
    ).toBeGreaterThan(0.0005);
  });

  test('iris lattice cadence is state-aware and parks under reduced motion', async ({ browser }, testInfo) => {
    const sampleMode = async (mode, reducedMotion = 'no-preference') => {
      const {
        viewport, deviceScaleFactor, hasTouch, isMobile, userAgent,
      } = testInfo.project.use;
      const modePage = await browser.newPage({
        viewport,
        deviceScaleFactor,
        hasTouch,
        isMobile,
        userAgent,
        reducedMotion,
      });
      try {
        await modePage.goto(`${runtimeUrl(mode, testInfo)}${reducedMotion === 'reduce' ? '&case=reduced' : ''}`);
        await modePage.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
        if (reducedMotion === 'reduce') await modePage.waitForTimeout(600);
        return await modePage.evaluate(() => {
          const d = window.__HERMES_CONCEPT_B_EYE_MOTION.debug();
          return { irisMs: d.irisMs, irisAngle: d.irisAngle };
        });
      } finally {
        await modePage.close();
      }
    };

    expect((await sampleMode('reasoning')).irisMs).toBeLessThan(0); // inward focus begins with a counterclockwise lean
    const searching = await sampleMode('searching');
    expect(searching.irisMs).toBeGreaterThan(0);
    expect(Math.abs(searching.irisMs)).toBeLessThan(150000); // faster than reasoning
    expect((await sampleMode('blocked')).irisMs).toBe(0); // halted work parks the lattice
    expect((await sampleMode('idle_watch', 'reduce')).irisAngle).toBe(0);
  });

  test('semantic gaze targets drive Augury, route, bottom, and touch fixations', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    const targets = await page.evaluate(() => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      const sample = (name) => {
        rig.forceGaze(name, 900);
        const d = rig.debug();
        return { name: d.targetName, x: d.targetX, y: d.targetY };
      };
      return {
        augury: sample('augury_left'),
        route: sample('route_right'),
        bottom: sample('bottom_status'),
        touch: sample('user_touch'),
      };
    });
    expect(targets.augury).toMatchObject({ name: 'augury_left' });
    expect(targets.augury.x).toBeLessThan(-20);
    expect(targets.route).toMatchObject({ name: 'route_right' });
    expect(targets.route.x).toBeGreaterThan(20);
    expect(targets.bottom).toMatchObject({ name: 'bottom_status' });
    expect(targets.bottom.y).toBeGreaterThan(16);
    expect(targets.touch).toMatchObject({ name: 'user_touch' });
  });

  test('contextual large gaze shifts trigger a blink while preserving pupil scale', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    const observed = await page.evaluate(async () => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      const scaleOf = () => {
        const t = document.querySelector('.cb-eye-pupil-group')?.getAttribute('transform') || '';
        const m = t.match(/scale\(([\d.]+)\)/);
        return m ? Number(m[1]) : null;
      };
      rig.forceGaze('augury_left', 900);
      await new Promise((r) => setTimeout(r, 980));
      const beforeScale = scaleOf();
      rig.forceGaze('route_right', 900);
      const samples = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        const loop = () => {
          samples.push({ blink: rig.debug().blink, scale: scaleOf() });
          if (performance.now() - t0 < 320) requestAnimationFrame(loop); else resolve();
        };
        requestAnimationFrame(loop);
      });
      return { beforeScale, peakBlink: Math.max(...samples.map((s) => s.blink || 0)), scaleSpread: Math.max(...samples.map((s) => s.scale || 0)) - Math.min(...samples.map((s) => s.scale || 0)) };
    });
    expect(observed.peakBlink).toBeGreaterThan(0.35);
    expect(observed.scaleSpread).toBeLessThan(0.02);
  });

  test('optic gaze moves the inner iris while the socket and lids stay anchored', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const snapshot = () => page.evaluate(() => {
      const socket = document.querySelector('.cb-eye-socket');
      const gaze = document.querySelector('.cb-eye-gaze');
      const hud = document.querySelector('.cb-radial-stage');
      const eyeRing = document.querySelector('.cb-eye-ring');
      const ringStyle = eyeRing ? getComputedStyle(eyeRing) : null;
      return {
        socketTransform: socket?.getAttribute('transform') || '',
        gazeTransform: gaze?.getAttribute('transform') || '',
        hudEdgeOpacity: hud?.style.getPropertyValue('--cb-edge-rim-opacity') || '',
        hudEdgeBlur: hud?.style.getPropertyValue('--cb-edge-rim-blur') || '',
        ringEdgeOpacity: eyeRing?.style.getPropertyValue('--cb-edge-rim-opacity') || '',
        ringEdgeBlur: eyeRing?.style.getPropertyValue('--cb-edge-rim-blur') || '',
        computedRingOpacity: ringStyle?.opacity || '',
        computedRingFilter: ringStyle?.filter || '',
      };
    });

    await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.forceGaze('augury_left', 1200));
    await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().x), { timeout: 5000 }).toBeLessThan(-20);
    const left = await snapshot();
    await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.forceGaze('route_right', 1200));
    await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().x), { timeout: 5000 }).toBeGreaterThan(20);
    const right = await snapshot();

    const structure = await page.evaluate(() => {
      const socket = document.querySelector('.cb-eye-socket');
      const gaze = document.querySelector('.cb-eye-gaze');
      const fixedSelectors = [
        '.cb-aperture-shell',
        '.cb-helmet-brow',
        '.cb-eye-lens',
        '.cb-eye-ring',
        '.cb-eye-glass-sheen',
        '.cb-eye-lid-group',
      ];
      const movingSelectors = ['.cb-iris-lattice', '.cb-eye-pupil-group'];
      return {
        socketExists: Boolean(socket),
        socketContainsGaze: Boolean(socket?.contains(gaze)),
        fixedOutsideGaze: fixedSelectors.every((selector) => {
          const node = document.querySelector(selector);
          return Boolean(node && socket?.contains(node) && !gaze?.contains(node));
        }),
        movingInsideGaze: movingSelectors.every((selector) => {
          const node = document.querySelector(selector);
          return Boolean(node && gaze?.contains(node));
        }),
      };
    });

    expect(structure.socketExists).toBe(true);
    expect(structure.socketContainsGaze).toBe(true);
    expect(structure.fixedOutsideGaze).toBe(true);
    expect(structure.movingInsideGaze).toBe(true);
    expect(left.socketTransform).toBe(right.socketTransform);
    expect(left.gazeTransform).not.toBe(right.gazeTransform);
    for (const gaze of [left, right]) {
      expect(gaze.hudEdgeOpacity).toBe('');
      expect(gaze.hudEdgeBlur).toBe('');
      expect(Number(gaze.ringEdgeOpacity)).toBeGreaterThanOrEqual(0.12);
      expect(gaze.ringEdgeBlur).toMatch(/^\d+(?:\.\d+)?px$/);
      expect(Number(gaze.computedRingOpacity)).toBeGreaterThan(0.4);
      expect(Number(gaze.computedRingOpacity)).toBeLessThan(0.75);
      expect(gaze.computedRingFilter).toBe('none'); // leaf opacity responds without rerasterizing a glow
    }
  });

  test('optic blink is upper-lid dominant while iris and pupil stay anchored', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('searching', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    // Isolate blink anatomy from the separate 500ms mode-entry posture tween.
    // Sampling immediately after rig creation measures both effects at once.
    await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.setTarget({ irisScale: 1, pupilScale: 1 }));
    await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().iris)).toBeCloseTo(1, 3);
    await expect.poll(() => page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().pupil)).toBeCloseTo(1, 3);
    // Trigger the blink and sample entirely in-browser at RAF cadence. A living optic closes
    // mostly with the upper lid; the iris/pupil must not collapse like a camera aperture.
    const result = await page.evaluate(async () => {
      const scaleOf = (selector) => {
        const t = document.querySelector(selector)?.getAttribute('transform') || '';
        const m = t.match(/scale\(([\d.]+)\)/);
        return m ? Number(m[1]) : null;
      };
      const lidD = (selector) => document.querySelector(selector)?.getAttribute('d') || '';
      const before = {
        iris: scaleOf('.cb-eye-iris'),
        pupil: scaleOf('.cb-eye-pupil-group'),
      };
      window.__HERMES_CONCEPT_B_EYE_MOTION.blinkNow();
      const samples = [];
      const t0 = performance.now();
      await new Promise((resolve) => {
        const loop = () => {
          samples.push({
            t: performance.now() - t0,
            iris: scaleOf('.cb-eye-iris'),
            pupil: scaleOf('.cb-eye-pupil-group'),
            top: lidD('.cb-eye-lid-top'),
            bottom: lidD('.cb-eye-lid-bottom'),
          });
          if (performance.now() - t0 < 360) requestAnimationFrame(loop); else resolve();
        };
        requestAnimationFrame(loop);
      });
      const active = samples.filter((s) => s.top && s.bottom);
      const parseCloseY = (d) => {
        // The curved lids share side edges even while open. Measure the cubic's
        // midpoint, where the lids actually meet, rather than the old shutter edge.
        const m = d.match(/V ([\d.]+) C [-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+) [-\d.]+ ([-\d.]+)/);
        return m ? .125 * Number(m[1]) + .375 * Number(m[2]) + .375 * Number(m[3]) + .125 * Number(m[4]) : null;
      };
      const peak = active
        .map((s) => ({ ...s, topY: parseCloseY(s.top), bottomY: parseCloseY(s.bottom) }))
        .filter((s) => Number.isFinite(s.topY) && Number.isFinite(s.bottomY))
        .sort((a, b) => Math.abs(a.topY - a.bottomY) - Math.abs(b.topY - b.bottomY))[0];
      return { before, samples, activeCount: active.length, peak };
    });
    const irisScales = result.samples.map((s) => s.iris).filter((v) => v != null);
    const pupilScales = result.samples.map((s) => s.pupil).filter((v) => v != null);
    expect(Math.max(...irisScales) - Math.min(...irisScales)).toBeLessThan(0.01);
    expect(Math.max(...pupilScales) - Math.min(...pupilScales)).toBeLessThan(0.01);
    expect(result.activeCount).toBeGreaterThan(0);
    const upperTravel = result.peak.topY - 374;
    const lowerTravel = 726 - result.peak.bottomY;
    expect(Math.abs(result.peak.topY - result.peak.bottomY)).toBeLessThan(3);
    expect(upperTravel).toBeGreaterThan(lowerTravel * 3.5);
    expect(result.peak.topY).toBeGreaterThan(640);
    expect(result.peak.topY).toBeLessThan(680);
  });

  test('optic uses two stable catchlights with deterministic gaze counter-parallax', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const snapshot = () => page.evaluate(() => ({
        gaze: window.__HERMES_CONCEPT_B_EYE_MOTION.debug(),
        dots: [...document.querySelectorAll('.cb-eye-dot')].map((node) => {
          const matrix = node.transform.baseVal.consolidate()?.matrix;
          const baseX = Number(node.getAttribute('cx'));
          const baseY = Number(node.getAttribute('cy'));
          return {
            baseX,
            baseY,
            transform: node.getAttribute('transform') || '',
            x: baseX + (matrix?.e || 0),
            y: baseY + (matrix?.f || 0),
          };
        }),
      }));
    const settleGaze = async (name) => {
      await page.evaluate((target) => window.__HERMES_CONCEPT_B_EYE_MOTION.forceGaze(target, 15000), name);
      await page.waitForFunction((target) => {
        const gaze = window.__HERMES_CONCEPT_B_EYE_MOTION.debug();
        return gaze.targetName === target && !gaze.saccadeActive;
      }, name, { polling: 'raf', timeout: 10000 });
      return snapshot();
    };
    const left = await settleGaze('augury_left');
    const right = await settleGaze('route_right');
    await page.waitForTimeout(450);
    const rightSettled = await snapshot();
    const result = { count: right.dots.length, left, right, rightSettled };

    expect(result.count).toBe(2);
    expect(result.left.dots[0].x).toBeGreaterThan(result.right.dots[0].x);
    for (const sample of [result.left, result.right, result.rightSettled]) {
      expect(sample.dots.map(({ baseX, baseY }) => [baseX, baseY])).toEqual([[540, 536], [566, 562]]);
      expect(sample.dots.every(({ transform }) => transform.startsWith('translate('))).toBe(true);
      expect(Math.abs(sample.dots[0].x - (540 - sample.gaze.x * 0.18))).toBeLessThan(0.02);
      expect(Math.abs(sample.dots[0].y - (536 - sample.gaze.y * 0.14))).toBeLessThan(0.02);
      expect(Math.abs(sample.dots[1].x - (566 - sample.gaze.x * 0.11))).toBeLessThan(0.02);
      expect(Math.abs(sample.dots[1].y - (562 - sample.gaze.y * 0.10))).toBeLessThan(0.02);
    }
  });

  test('avatar lifecycle acknowledges the viewer, looks away to work, and returns', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.HermesDisplayRuntime?.publishAvatarEvent && window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const observed = await page.evaluate(async () => {
      const publish = async (event, intent) => {
        window.HermesDisplayRuntime.publishAvatarEvent({
          schema_version: '0.1.0',
          id: `living-eye-${event}`,
          event,
          occurred_at: new Date().toISOString(),
          source: 'test',
          boundary: 'localhost_only',
          privacy: 'display_safe_intent',
          ttl_ms: 12000,
          priority: 'normal',
          display: { intent, label: intent, visual_kind: 'unknown', side: 'center', intensity: 0.6 },
          meta: {},
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const rig = window.__HERMES_CONCEPT_B_EYE_MOTION.debug();
        const stage = document.querySelector('.cb-radial-stage');
        return { targetName: rig.targetName, socialPresence: rig.socialPresence, regard: rig.regard, stagePresence: stage?.dataset.socialPresence };
      };
      return {
        started: await publish('assistant.started', 'assistant_active'),
        working: await publish('assistant.tool_started', 'tool_active'),
        waiting: await publish('assistant.waiting_on_user', 'waiting_on_user'),
        complete: await publish('assistant.final_complete', 'final_complete'),
      };
    });

    expect(observed.started).toMatchObject({ targetName: 'viewer', socialPresence: 'acknowledge', stagePresence: 'acknowledge' });
    expect(observed.started.regard).toBeGreaterThan(0);
    expect(observed.working.socialPresence).toBe('working');
    expect(observed.working.targetName).not.toBe('viewer');
    expect(observed.waiting).toMatchObject({ targetName: 'viewer', socialPresence: 'waiting', stagePresence: 'waiting' });
    expect(observed.complete).toMatchObject({ targetName: 'viewer', socialPresence: 'complete', stagePresence: 'complete' });
  });

  test('primary gaze changes use a fast bounded ocular saccade and settle', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const result = await page.evaluate(async () => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      rig.forceGaze('route_right', 120000);
      const samples = [];
      for (let frame = 0; frame < 18; frame += 1) {
        await new Promise(requestAnimationFrame);
        const debug = rig.debug();
        samples.push({ frame: frame + 1, x: debug.x, targetX: debug.targetX, active: debug.saccadeActive });
      }
      const target = samples.at(-1).targetX;
      const reached = samples.find((sample) => sample.x >= target * 0.9);
      return {
        reachedFrame: reached?.frame ?? null,
        target,
        maxX: Math.max(...samples.map((sample) => sample.x)),
        finalX: samples.at(-1).x,
        activeAtStart: samples.slice(0, 4).some((sample) => sample.active),
        activeAtEnd: samples.at(-1).active,
      };
    });

    expect(result.activeAtStart).toBe(true);
    expect(result.reachedFrame).not.toBeNull();
    expect(result.reachedFrame).toBeLessThanOrEqual(8);
    expect(result.maxX).toBeGreaterThan(result.target);
    expect(result.maxX).toBeLessThan(result.target + 3);
    expect(Math.abs(result.finalX - result.target)).toBeLessThan(1.2);
    expect(result.activeAtEnd).toBe(false);
  });

  test('touch, room entry, and normalized local presence acknowledge without camera access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(`${funRuntimeUrl('idle_watch', testInfo)}&touchtest=1`);
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION && window.HermesEntertainment), null, { timeout: 8000 });

    const result = await page.evaluate(async () => {
      const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
      let cameraCalls = 0;
      if (navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia = async () => { cameraCalls += 1; throw new Error('camera disabled in test'); };
      }

      rig.touchPulse({ dx: 0, dy: 0, intensity: 0.8, pointerCount: 1 });
      const touch = rig.debug();

      window.dispatchEvent(new CustomEvent('sensor:motion:entry'));
      const motionEntry = rig.debug();

      window.dispatchEvent(new CustomEvent('hermes-viewer-presence', { detail: { x: 0.5, y: -0.25, confidence: 0.9 } }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      const tracked = rig.debug();

      window.dispatchEvent(new CustomEvent('hermes-viewer-presence', { detail: { x: '0.1', y: 2 } }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const afterMalformed = rig.debug();

      return {
        touch: { targetName: touch.targetName, socialPresence: touch.socialPresence },
        motionEntry: { targetName: motionEntry.targetName, socialPresence: motionEntry.socialPresence },
        tracked: { targetName: tracked.targetName, targetX: tracked.targetX, targetY: tracked.targetY, socialPresence: tracked.socialPresence },
        afterMalformed: { targetName: afterMalformed.targetName, targetX: afterMalformed.targetX, targetY: afterMalformed.targetY, socialPresence: afterMalformed.socialPresence },
        cameraCalls,
      };
    });

    expect(result.touch).toMatchObject({ targetName: 'user_touch', socialPresence: 'touch' });
    expect(result.motionEntry).toMatchObject({ targetName: 'viewer', socialPresence: 'presence' });
    expect(result.tracked).toMatchObject({ targetName: 'viewer_presence', socialPresence: 'presence' });
    expect(result.tracked.targetX).toBeCloseTo(12, 2);
    expect(result.tracked.targetY).toBeCloseTo(-10.5, 2);
    expect(result.afterMalformed).toEqual(result.tracked);
    expect(result.cameraCalls).toBe(0);
  });

  test('direct social presence recedes peripheral UI but critical state stays prominent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const result = await page.evaluate(async () => {
      const read = () => {
        const opacity = (selector) => Number(getComputedStyle(document.querySelector(selector)).opacity);
        return {
          route: opacity('.cb-route-rail'),
          activity: opacity('.cb-activity'),
          bottom: opacity('.cb-bottom-rail'),
          field: opacity('.cb-field-instrumentation'),
        };
      };
      const ambient = read();
      for (const selector of ['.cb-route-rail', '.cb-activity', '.cb-bottom-rail', '.cb-field-instrumentation']) {
        document.querySelector(selector).style.transition = 'none';
      }
      window.__HERMES_CONCEPT_B_EYE_MOTION.acknowledgeViewer('waiting', 0);
      await new Promise(requestAnimationFrame);
      const direct = read();
      document.body.dataset.health = 'critical';
      await new Promise(requestAnimationFrame);
      const critical = read();
      return { ambient, direct, critical, bodyPresence: document.body.dataset.socialPresence };
    });

    expect(result.bodyPresence).toBe('waiting');
    expect(result.direct.route).toBeLessThan(result.ambient.route - 0.2);
    expect(result.direct.activity).toBeLessThan(result.ambient.activity - 0.15);
    expect(result.direct.bottom).toBeLessThan(result.ambient.bottom - 0.2);
    expect(result.direct.field).toBeLessThan(result.ambient.field - 0.2);
    expect(result.critical.route).toBeGreaterThanOrEqual(0.95);
    expect(result.critical.activity).toBeGreaterThanOrEqual(0.95);
    expect(result.critical.bottom).toBeGreaterThanOrEqual(0.95);
    expect(result.critical.field).toBeGreaterThanOrEqual(0.95);
  });

  test('conservative profile bounds ambient field rendering below the ocular RAF cadence', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&performance=conservative`);
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });

    const before = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
    expect(typeof before.eyeRenderCount).toBe('number');
    expect(typeof before.fieldRenderCount).toBe('number');
    await page.waitForFunction(
      (start) => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().eyeRenderCount - start >= 8,
      before.eyeRenderCount,
      { timeout: 8000 },
    );
    const after = await page.evaluate(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug());
    const eyeFrames = after.eyeRenderCount - before.eyeRenderCount;
    const fieldFrames = after.fieldRenderCount - before.fieldRenderCount;

    expect(eyeFrames).toBeGreaterThanOrEqual(8);
    expect(fieldFrames).toBeGreaterThanOrEqual(Math.floor(eyeFrames * 0.35));
    expect(fieldFrames).toBeLessThanOrEqual(Math.ceil(eyeFrames * 0.60));
  });

  test('stopped modes keep a catchlight visible instead of becoming a blank aperture', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    const cases = [
      { mode: 'blocked', fixation: 'route_right', maxLid: 0.26, minVisibleDots: 2, catchlightOpacity: 0.82 },
      { mode: 'degraded_offline', fixation: 'front', maxLid: 0.30, minVisibleDots: 1, catchlightOpacity: 0.48 },
    ];

    for (const entry of cases) {
      await page.goto(runtimeUrl(entry.mode, testInfo));
      await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
      await page.evaluate(({ fixation }) => {
        window.__HERMES_CONCEPT_B_EYE_MOTION.forceGaze(fixation, 120000);
      }, entry);
      await page.waitForTimeout(1800);
      await page.waitForFunction(() => window.__HERMES_CONCEPT_B_EYE_MOTION.debug().blink < 0.05);

      const view = await page.evaluate(() => {
        const top = document.querySelector('.cb-eye-lid-top');
        const bottom = document.querySelector('.cb-eye-lid-bottom');
        const visibleDots = [...document.querySelectorAll('.cb-eye-dot')].filter((node) => {
          const center = new DOMPoint(Number(node.getAttribute('cx')), Number(node.getAttribute('cy')))
            .matrixTransform(node.getScreenCTM());
          const topPoint = center.matrixTransform(top.getScreenCTM().inverse());
          const bottomPoint = center.matrixTransform(bottom.getScreenCTM().inverse());
          return !top.isPointInFill(topPoint) && !bottom.isPointInFill(bottomPoint);
        }).length;
        const irisCenter = new DOMPoint(550, 550).matrixTransform(document.querySelector('.cb-eye-iris').getScreenCTM());
        const pupilCenter = new DOMPoint(550, 550).matrixTransform(document.querySelector('.cb-eye-pupil-group').getScreenCTM());
        return {
          debug: window.__HERMES_CONCEPT_B_EYE_MOTION.debug(),
          visibleDots,
          irisPupilCenterSeparation: Math.hypot(irisCenter.x - pupilCenter.x, irisCenter.y - pupilCenter.y),
          catchlightOpacity: Number(getComputedStyle(document.querySelector('.cb-eye-dot')).opacity),
        };
      });

      expect(view.debug.mode).toBe(entry.mode);
      expect(view.debug.targetName).toBe(entry.fixation);
      expect(view.debug.lid).toBeLessThanOrEqual(entry.maxLid);
      expect(view.visibleDots).toBeGreaterThanOrEqual(entry.minVisibleDots);
      expect(view.irisPupilCenterSeparation).toBeLessThan(1.5);
      expect(view.catchlightOpacity).toBeCloseTo(entry.catchlightOpacity, 2);
    }
  });

  test('modes carry distinct posture (halo color, ring period) in preview', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    async function posture(mode) {
      await page.goto(runtimeUrl(mode, testInfo));
      await page.waitForTimeout(150);
      return page.locator('.cb-radial-stage').evaluate((node) => ({
        accent: getComputedStyle(document.documentElement).getPropertyValue('--cb-accent').trim(),
        ringPeriod: getComputedStyle(node).getPropertyValue('--cb-ring-period').trim(),
      }));
    }
    const idle = await posture('idle_watch');
    const blocked = await posture('blocked');
    const degraded = await posture('degraded_offline');
    // Halo color must change with mode (amber -> rust -> steel).
    expect(blocked.accent).not.toBe(idle.accent);
    expect(degraded.accent).not.toBe(idle.accent);
    expect(degraded.accent).not.toBe(blocked.accent);
    // Ring period must differ (idle 80s vs blocked 200s vs degraded 400s).
    expect(blocked.ringPeriod).not.toBe(idle.ringPeriod);
    expect(degraded.ringPeriod).not.toBe(blocked.ringPeriod);
  });

  test('adopted stack is active in the browser runtime (anime + Zod + parallel XState)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('tool_shell', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    const runtime = await page.evaluate(() => {
      const validation = window.HermesDisplayState.validateOpticStatePacket({ mode: 'tool_shell', optic: { aperture_open: 2 } });
      const svc = window.HermesBehaviorMachine.createBehaviorService('idle_watch');
      svc.send({ type: 'TOOL_STARTED' }).send({ type: 'HEALTH_CRITICAL' }).send({ type: 'NIGHT_ON' }).send({ type: 'PRIVACY_SENSITIVE' });
      const overlays = svc.overlays;
      const mode = svc.mode;
      svc.stop?.();
      return {
        anime: window.__HERMES_CONCEPT_B_EYE_MOTION.debug().anime,
        zodPresent: typeof window.Zod?.object === 'function',
        validator: validation.validator,
        clampedAperture: validation.packet.optic.aperture_open,
        behaviorMode: mode,
        overlays,
      };
    });
    // Anime.js is genuinely driving optic motion (not just loaded).
    expect(runtime.anime).toBe(true);
    // Zod is loaded and is the active optic-packet validator (not the fallback).
    expect(runtime.zodPresent).toBe(true);
    expect(runtime.validator).toBe('zod');
    expect(runtime.clampedAperture).toBe(1);
    // XState models display state as parallel overlay regions that hold simultaneously.
    expect(runtime.behaviorMode).toBe('tool_shell');
    expect(runtime.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
  });

  test('Concept B forced overlay params override only their own region', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.route('**/api/hermes-state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: '0.4.0',
          generated_at: new Date().toISOString(),
          mood: 'idle_watchful',
          skin: 'retro-robot-core',
          state_preset: 'night_watch',
          caption: { text: 'Per-region overlay override.', tone: 'calm', priority: 'ambient' },
          snippet: { id: 'test', text: 'operator only', kind: 'system', sensitivity: 'operator_only' },
          live: {
            gateway_ok: true,
            freshness: { tier: 'fresh', valid_measurements: 5, stale_measurements: [] },
            system: { cpu: 0.18, memory: 0.40, temp_c: 66, cpu_temp_c: 66, uptime: '1d' },
            route_rail: { as_of_ms: null, age_seconds: null, active_provider_id: '', providers: [] },
          },
          safety: { boundary: 'local_trusted_display', contains_credentials: false },
        }),
      });
    });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&live=1&health=critical`);
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-health', 'critical');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-quiet', 'night');
    await expect(page.locator('.cb-radial-stage')).toHaveAttribute('data-privacy', 'sensitive');
  });

  test('XState overlay regions drive the rendered display (night/sensitive/critical)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    // The behavior machine's parallel overlays are consumed by the renderer as data-attributes +
    // CSS treatments. Force them via URL params and assert both the machine truth and the visuals.
    const params = new URLSearchParams({ kiosk: '1', mode: 'idle_watch', orientation: 'landscape', v: EXPECTED_BUILD_ID, health: 'critical', quiet: 'night', privacy: 'sensitive' });
    await page.goto(`/src/character-runtime.html?${params.toString()}`);
    await page.waitForFunction(() => Boolean(window.__HERMES_DISPLAY_BEHAVIOR), null, { timeout: 8000 });
    await expect.poll(() => page.locator('.cb-radial-stage').evaluate((n) => n.dataset.quiet)).toBe('night');
    const view = await page.evaluate(() => {
      const stage = document.querySelector('.cb-radial-stage');
      const activity = document.querySelector('[data-cb-activity]');
      const glow = document.querySelector('.cb-glow');
      return {
        overlays: window.__HERMES_DISPLAY_BEHAVIOR.overlays,
        ds: { health: stage.dataset.health, quiet: stage.dataset.quiet, privacy: stage.dataset.privacy },
        stageFilter: getComputedStyle(stage).filter,
        captionFilter: getComputedStyle(activity).filter,
        glowFilter: getComputedStyle(glow).filter,
      };
    });
    // Machine is the source of truth...
    expect(view.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
    expect(view.ds).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
    // ...and the renderer consumes it: night dims the stage, sensitive blurs the caption,
    // critical adds an alert glow. (Distinct elements, so the filters never collide.)
    expect(view.stageFilter).toContain('brightness');
    expect(view.captionFilter).toContain('blur');
    expect(view.glowFilter).toContain('drop-shadow');
  });

});

test.describe('MINIX SF10T 1920x1280 landscape optic gates', () => {
  for (const mode of landscapeModes) {
    test(`${mode} landscape runtime preserves Concept B optic DOM contract`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
      await expectNoPageErrors(page, async () => {
        await page.goto(runtimeUrl(mode, testInfo));
        await expect(page.locator('body.kiosk-mode.kiosk-landscape.claude-concept-b')).toBeVisible();
        await expect(page.locator('.cb-radial-stage')).toBeVisible();
        await expect(page.locator('.cb-eye-gaze')).toBeVisible();
        await expect.poll(() => page.locator('.cb-eye-gaze').evaluate((node) => node.getAttribute('transform'))).toMatch(/^translate\(/);
      });

      const contract = await page.evaluate(() => {
        const gaze = document.querySelector('.cb-eye-gaze');
        const socket = document.querySelector('.cb-eye-socket');
        const eyeWindow = document.querySelector('.cb-eye-window');
        const requiredInsideGaze = [
          'cb-eye-iris',
          'cb-eye-lens-contents',
          'cb-iris-lattice',
          'cb-eye-pupil-group',
        ];
        const requiredFixedInSocket = [
          'cb-aperture-shell',
          'cb-winglet-left',
          'cb-winglet-right',
          'cb-helmet-brow',
          'cb-eye-lens',
          'cb-eye-ring',
          'cb-eye-window',
          'cb-eye-glass-sheen',
          'cb-eye-glass-crescent',
          'cb-eye-lid-group',
        ];
        const requiredField = [
          'cb-field-instrumentation',
          'cb-field-focus-rings',
          'cb-field-compass',
          'cb-field-motes',
          'cb-field-trace',
          'cb-field-notice-pulse',
        ];
        const missingInsideGaze = requiredInsideGaze.filter((cls) => !gaze?.querySelector(`.${cls}`));
        const missingFixedInSocket = requiredFixedInSocket.filter((cls) => {
          const node = socket?.querySelector(`.${cls}`);
          return !node || gaze?.contains(node);
        });
        const missingField = requiredField.filter((cls) => !document.querySelector(`.${cls}`));
        const translatedCatchlightAnimations = [...document.styleSheets]
          .flatMap((sheet) => {
            try { return [...sheet.cssRules]; } catch { return []; }
          })
          .filter((rule) => /cb-eye-dot-[abc]|catchlight/i.test(rule.cssText || ''))
          .filter((rule) => /translate\(/.test(rule.cssText || ''))
          .map((rule) => rule.cssText);
        return {
          missingInsideGaze,
          missingFixedInSocket,
          translatedCatchlightAnimations,
          catchlightCount: document.querySelectorAll('.cb-eye-dot').length,
          lensClip: Boolean(document.querySelector('#cb-eye-lens-clip')),
          clippedEyeWindow: eyeWindow?.getAttribute('clip-path') || '',
          gazeInsideClippedEyeWindow: Boolean(eyeWindow?.contains(gaze)),
          gazeTransform: gaze?.getAttribute('transform') || '',
          fieldMode: document.querySelector('.cb-radial-stage')?.dataset.fieldMode || '',
          fieldVars: {
            intensity: document.querySelector('.cb-radial-stage')?.style.getPropertyValue('--cb-field-intensity') || '',
            focus: document.querySelector('.cb-radial-stage')?.style.getPropertyValue('--cb-field-focus') || '',
          },
          missingField,
          fieldChildren: {
            ticks: document.querySelectorAll('.cb-field-tick').length,
            motes: document.querySelectorAll('.cb-field-mote').length,
          },
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
      });

      expect(contract.viewport).toEqual({ width: 1920, height: 1280 });
      expect(contract.missingInsideGaze).toEqual([]);
      expect(contract.missingFixedInSocket).toEqual([]);
      expect(contract.missingField).toEqual([]);
      expect(contract.fieldChildren.ticks).toBeGreaterThanOrEqual(24);
      expect(contract.fieldChildren.motes).toBeGreaterThanOrEqual(3);
      expect(contract.fieldMode).toBe(mode);
      expect(Number(contract.fieldVars.intensity)).toBeGreaterThan(0);
      expect(Number(contract.fieldVars.focus)).toBeGreaterThan(0);
      expect(contract.translatedCatchlightAnimations).toEqual([]);
      expect(contract.catchlightCount).toBe(2);
      expect(contract.lensClip).toBe(true);
      expect(contract.clippedEyeWindow).toBe('url(#cb-eye-lens-clip)');
      expect(contract.gazeInsideClippedEyeWindow).toBe(true);
      expect(contract.gazeTransform).toMatch(/^translate\(/);
    });
  }

  test('searching mode uses a continuous centered radar sweep', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('searching', testInfo));
    await expect(page.locator('.cb-radial-stage[data-optic-mode="searching"]')).toBeVisible();
    await expect.poll(() => page.locator('.cb-eye-scan').evaluate((node) => node.getAttribute('transform'))).toMatch(/^rotate\([\d.]+ 550 550\)$/);
    const first = await page.locator('.cb-eye-scan').evaluate((node) => ({
      band: [
        node.querySelector('.cb-eye-scan-band')?.getAttribute('x'),
        node.querySelector('.cb-eye-scan-band')?.getAttribute('y'),
        node.querySelector('.cb-eye-scan-band')?.getAttribute('width'),
        node.querySelector('.cb-eye-scan-band')?.getAttribute('height'),
      ].join(','),
      line: [
        node.querySelector('.cb-eye-scan-line')?.getAttribute('x1'),
        node.querySelector('.cb-eye-scan-line')?.getAttribute('y1'),
        node.querySelector('.cb-eye-scan-line')?.getAttribute('x2'),
        node.querySelector('.cb-eye-scan-line')?.getAttribute('y2'),
      ].join(','),
      transform: node.getAttribute('transform'),
      opacity: window.getComputedStyle(node).opacity,
    }));
    await expect.poll(
      () => page.locator('.cb-eye-scan').evaluate((node) => node.getAttribute('transform')),
      { timeout: 3000 },
    ).not.toBe(first.transform);
    const second = await page.locator('.cb-eye-scan').evaluate((node) => ({
      transform: node.getAttribute('transform'),
      active: node.dataset.active,
      opacity: window.getComputedStyle(node).opacity,
    }));

    expect(first.band).toBe('546,376,8,174');
    expect(first.line).toBe('550,548,550,380');
    expect(first.transform).toMatch(/^rotate\([\d.]+ 550 550\)$/);
    expect(second.transform).toMatch(/^rotate\([\d.]+ 550 550\)$/);
    expect(second.transform).not.toBe(first.transform);
    expect(second.active).toBe('true');
    expect(Number(second.opacity)).toBeGreaterThan(0.5);
  });
});

test.describe('reduced motion', () => {
  test('continuous anime.js motion stops but posture/color still apply', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    // Emulate prefers-reduced-motion BEFORE load so the motion rig reads it at creation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // searching is the busiest mode (ring + scan + blink). Under prefers-reduced-motion the
    // anime.js cadence loops and gaze micro-wander must stop; only state-driven posture remains.
    await page.goto(runtimeUrl('searching', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    await page.waitForTimeout(800); // let the bounded gaze motion settle to its static target
    const sample = () => page.evaluate(() => ({
      orbit: document.querySelector('.cb-orbit-spin')?.getAttribute('transform'),
      scan: document.querySelector('.cb-eye-scan')?.getAttribute('transform'),
      core: document.querySelector('.cb-eye-core')?.getAttribute('transform'),
    }));
    const a = await sample();
    await page.waitForTimeout(600);
    const b = await sample();
    // Nothing should be animating frame-to-frame under reduced motion.
    expect(b.orbit).toBe(a.orbit);
    expect(b.scan).toBe(a.scan);
    expect(b.core).toBe(a.core);
    // But the optic is still present and the per-mode accent/posture still applied.
    await expect(page.locator('body.kiosk-mode.kiosk-landscape.claude-concept-b')).toBeVisible();
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--cb-accent').trim());
    expect(accent).toBeTruthy();
  });
});
