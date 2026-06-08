import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const modes = ['idle_watch', 'reasoning', 'tool_shell', 'searching', 'writing', 'waiting_user', 'blocked', 'complete', 'degraded_offline'];
const landscapeModes = ['idle_watch', 'reasoning', 'searching', 'tool_shell', 'waiting_user', 'blocked', 'complete', 'degraded_offline'];
const root = path.resolve(import.meta.dirname, '../..');
const EXPECTED_BUILD_ID = readDisplayBuildId();

function readDisplayBuildId() {
  const appSource = fs.readFileSync(path.join(root, 'src/mascot/app.js'), 'utf8');
  const match = appSource.match(/const DISPLAY_BUILD_ID = '([^']+)'/);
  if (!match) throw new Error('DISPLAY_BUILD_ID not found in src/mascot/app.js');
  return match[1];
}

function runtimeUrl(mode, testInfo) {
  const params = new URLSearchParams({ kiosk: '1', mode, v: EXPECTED_BUILD_ID });
  if (testInfo.project.name === 'minix-sf10t-landscape') params.set('orientation', 'landscape');
  return `/src/character-runtime.html?${params.toString()}`;
}

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

  test('caption sanitizer keeps unsafe html out of display text', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    const sanitized = await page.evaluate(() => window.HermesSanitize.captionText('<img src=x onerror=alert(1)>Visible<script>x</script>'));
    expect(sanitized).toBe('Visible');
  });

  test('kiosk touch uses entertainment FX instead of touch zones or detail overlays', async ({ page }, testInfo) => {
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
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

  test('Concept B developer touch grid requires explicit debug flag', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B touch grid');

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchzones=1`);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&debug=1&touchzones=1`);
    await expect(page.locator('.cb-touch-zones')).toHaveCount(0);
    await expect(page.locator('.cb-touch')).toHaveCount(0);
    await expect(page.locator('text=DIAGNOSTICS')).toHaveCount(0);
    await expect(page.locator('text=SAFE RESET')).toHaveCount(0);
    await expect(page.locator('text=GLANCE PREV')).toHaveCount(0);

    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touch=legacy&debug=1&touchzones=1`);
    await expect(page.locator('.cb-touch-zones')).toBeVisible();
    await expect(page.locator('.cb-touch')).toHaveCount(5);
    const devLabels = await page.locator('.cb-touch span').allTextContents();
    expect(devLabels.join(' ')).toContain('DEVELOPER');
    expect(devLabels.join(' ')).toContain('DIAGNOSTICS');
  });

  test('kiosk touch FX does not mutate behavior mode', async ({ page }, testInfo) => {
    await page.goto(`${runtimeUrl('tool_shell', testInfo)}&touchtest=1`);
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
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
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
    expect(text).not.toMatch(/ROUTE|HEADROOM|CPU|MEM|TEMP|CURRENT TURN|GATEWAY|REMOTE MEMORY|TOOLS?|PROMPT/i);
    expect(text).toMatch(/HERMES|SPARKLE|WATCHING|THINKING/i);
    await page.mouse.click(Math.round((page.viewportSize()?.width || 1920) / 2), Math.round((page.viewportSize()?.height || 1280) / 2));
    const after = await page.evaluate(() => window.__HERMES_DISPLAY_BEHAVIOR?.mode || null);
    expect(after).toBe(before);
  });

  test('touch FX creates optic resonance, constellation stars, motes, and Concept B touch pulse', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only Concept B touch integration');
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
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
      window.HermesTouchFxController.testLongPressStar(w * 0.52, h * 0.52);
      const afterDebug = motion?.debug?.();
      const afterMode = window.__HERMES_DISPLAY_BEHAVIOR?.mode || null;
      return {
        motes: document.querySelectorAll('.touch-fx-mote').length,
        resonance: document.querySelectorAll('.touch-fx-resonance').length,
        stars: document.querySelectorAll('.touch-fx-constellation-star').length,
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
        playMemory: window.HermesTouchFxController.playMemory(),
      };
    });
    expect(result.motes).toBeGreaterThan(0);
    expect(result.resonance).toBeGreaterThan(0);
    expect(result.stars).toBeGreaterThan(0);
    const boopPulse = result.pulseCalls.find((call) => call.zone === 'boop');
    expect(boopPulse).toBeTruthy();
    expect(boopPulse.applied.x).toBeGreaterThan(0);
    expect(boopPulse.targetX).toBeGreaterThan(result.beforeDebug.targetX);
    expect(boopPulse.targetName).toBe('user_touch');
    expect(boopPulse.forcedUntil).toBeGreaterThan(result.beforeDebug.forcedUntil || 0);
    expect(result.afterDebug.touchTarget.pointerCount).toBeGreaterThanOrEqual(1);
    expect(result.afterMode).toBe(result.beforeMode);
    await expect.poll(
      () => page.evaluate(() => Math.abs(window.__HERMES_CONCEPT_B_EYE_MOTION?.debug?.().x || 0)),
      { timeout: 1500 }
    ).toBeGreaterThan(0.005);
    expect(Number.isFinite(result.vectorDistance)).toBe(true);
    expect(result.playMemory.taps).toBeGreaterThan(0);
  });

  test('touch FX keeps side comets and bottom fireflies despite thermal reduced display state', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only touch FX integration');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
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
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&touchtest=1`);
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
    await expect(rows).toHaveCount(4);
    const snapshot = await rows.evaluateAll((nodes) => nodes.map((node) => {
      const whisker = node.querySelector('.cb-route-whisker');
      const style = getComputedStyle(whisker);
      return {
        label: node.querySelector('[data-route-label]')?.textContent,
        value: node.querySelector('[data-route-value]')?.textContent,
        glyph: node.querySelector('[data-route-glyph]')?.textContent,
        state: node.dataset.state,
        active: node.dataset.active,
        whiskerWidth: Number.parseFloat(style.width),
        whiskerTransform: style.transform,
        whiskerOpacity: Number.parseFloat(style.opacity),
      };
    }));
    expect(snapshot.map((row) => row.label)).toEqual(['CHATGPT', 'CLAUDE', 'GEMINI', 'COPILOT']);
    for (const row of snapshot) {
      expect(row).toMatchObject({ value: 'UNK', glyph: '○', state: 'unknown', active: 'false' });
      expect(row.whiskerWidth).toBeGreaterThan(38);
      expect(row.whiskerTransform).toBe('matrix(0, 0, 0, 1, 0, 0)');
      expect(row.whiskerOpacity).toBe(0);
    }
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
                { id: 'anthropic', label: 'CLAUDE', tier_label: 'MAX', state: 'confirmed', headroom: 0.95, reachable: true },
                { id: 'google-gemini-cli', label: 'GEMINI', tier_label: 'CLI', state: 'confirmed', headroom: 1.0, reachable: true },
                { id: 'copilot', label: 'COPILOT', tier_label: '', state: 'unknown', headroom: null, reachable: true },
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
    await expect.poll(() => page.locator('.cb-route-row').evaluateAll((rows) => rows.slice(0, 3).every((row) => {
      const whiskerEl = row.querySelector('.cb-route-whisker');
      return Number.parseFloat(getComputedStyle(whiskerEl).width) > 30;
    }))).toBe(true);
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

  test('Augury presence uses accepted mode-aware vocabulary', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(`${runtimeUrl('idle_watch', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'ambient');
    await page.goto(`${runtimeUrl('reasoning', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'focus');
    await page.goto(`${runtimeUrl('tool_shell', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'focus');
    await page.goto(`${runtimeUrl('waiting_user', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'subdued');
    await page.goto(`${runtimeUrl('blocked', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'subdued');
    await page.goto(`${runtimeUrl('degraded_offline', testInfo)}&augury=1`);
    await expect(page.locator('body')).toHaveAttribute('data-augury-presence', 'subdued');
  });

  test('runtime exposes the synchronized display build id', async ({ page }, testInfo) => {
    await page.goto(runtimeUrl('idle_watch', testInfo));
    await expect.poll(() => page.evaluate(() => window.__HERMES_DISPLAY_BUILD_ID)).toBe(EXPECTED_BUILD_ID);
    await expect(page.locator('html')).toHaveAttribute('data-hermes-display-build-id', EXPECTED_BUILD_ID);
  });

  test('living field has ambient mote motion and mode-specific instrumentation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('idle_watch', testInfo));
    const moteBefore = await page.locator('.cb-field-mote').first().evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy'), window.getComputedStyle(node).opacity].join(','));
    await page.waitForTimeout(260);
    const moteAfter = await page.locator('.cb-field-mote').first().evaluate((node) => [node.getAttribute('cx'), node.getAttribute('cy'), window.getComputedStyle(node).opacity].join(','));
    expect(moteAfter).not.toBe(moteBefore);

    await page.goto(runtimeUrl('reasoning', testInfo));
    const reasoning = await page.locator('.cb-radial-stage').evaluate((node) => ({
      mode: node.dataset.fieldMode,
      focus: Number(node.style.getPropertyValue('--cb-field-focus')),
      ringOpacity: window.getComputedStyle(document.querySelector('.cb-field-ring-c')).opacity,
    }));
    expect(reasoning.mode).toBe('reasoning');
    expect(reasoning.focus).toBeGreaterThan(0.7);

    await page.goto(runtimeUrl('tool_shell', testInfo));
    await expect(page.locator('.cb-field-tool-precision')).toBeVisible();
    expect(Number(await page.locator('.cb-field-tool-precision').evaluate((node) => window.getComputedStyle(node).opacity))).toBeGreaterThan(0.3);

    await page.goto(runtimeUrl('blocked', testInfo));
    expect(Number(await page.locator('.cb-field-blocked-brackets').evaluate((node) => window.getComputedStyle(node).opacity))).toBeGreaterThan(0.3);
  });

  test('field rings spin in place and do not drift off (anchored to optic center)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('searching', testInfo)); // fastest ring drift, worst case
    const sample = () => page.evaluate(() => {
      const out = {};
      for (const s of ['.cb-field-ring-a', '.cb-field-ring-b', '.cb-field-ring-c', '.cb-field-instrumentation']) {
        const el = document.querySelector(s);
        const r = el.getBoundingClientRect();
        out[s] = [r.x + r.width / 2, r.y + r.height / 2];
      }
      return out;
    });
    const tracks = {};
    for (let i = 0; i < 24; i += 1) {
      const snap = await sample();
      for (const k of Object.keys(snap)) (tracks[k] = tracks[k] || []).push(snap[k]);
      await page.waitForTimeout(80);
    }
    for (const k of Object.keys(tracks)) {
      const xs = tracks[k].map((v) => v[0]);
      const ys = tracks[k].map((v) => v[1]);
      const drift = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      expect(drift, `${k} center should stay anchored, not float`).toBeLessThan(4);
    }
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

  test('optic blink uses symmetric lids while iris and pupil stay anchored', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minix-sf10t-landscape', 'MINIX-only landscape project');
    await page.goto(runtimeUrl('searching', testInfo));
    await page.waitForFunction(() => Boolean(window.__HERMES_CONCEPT_B_EYE_MOTION), null, { timeout: 8000 });
    // Trigger the blink and sample entirely in-browser at RAF cadence. The blink must be
    // carried by symmetric lid paths, not by iris/pupil scale changes that drag catchlights.
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
        const m = d.match(/V ([\d.]+)/);
        return m ? Number(m[1]) : null;
      };
      const peak = active
        .map((s) => ({ ...s, topY: parseCloseY(s.top), bottomY: parseCloseY(s.bottom) }))
        .filter((s) => Number.isFinite(s.topY) && Number.isFinite(s.bottomY))
        .sort((a, b) => Math.abs(a.topY - 550) + Math.abs(a.bottomY - 550) - (Math.abs(b.topY - 550) + Math.abs(b.bottomY - 550)))[0];
      return { before, samples, activeCount: active.length, peak };
    });
    const irisScales = result.samples.map((s) => s.iris).filter((v) => v != null);
    const pupilScales = result.samples.map((s) => s.pupil).filter((v) => v != null);
    expect(Math.max(...irisScales) - Math.min(...irisScales)).toBeLessThan(0.01);
    expect(Math.max(...pupilScales) - Math.min(...pupilScales)).toBeLessThan(0.01);
    expect(result.activeCount).toBeGreaterThan(0);
    expect(result.peak.topY).toBeGreaterThan(535);
    expect(result.peak.topY).toBeLessThan(565);
    expect(result.peak.bottomY).toBeGreaterThan(535);
    expect(result.peak.bottomY).toBeLessThan(565);
    expect(Math.abs(result.peak.topY + result.peak.bottomY - 1100)).toBeLessThan(3);
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
        const requiredInsideGaze = [
          'cb-aperture-shell',
          'cb-winglet-left',
          'cb-winglet-right',
          'cb-helmet-brow',
          'cb-eye-lens',
          'cb-eye-ring',
          'cb-eye-lens-contents',
          'cb-eye-glass-sheen',
          'cb-eye-glass-crescent',
          'cb-eye-pupil-group',
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
          translatedCatchlightAnimations,
          lensClip: Boolean(document.querySelector('#cb-eye-lens-clip')),
          clippedLensContents: document.querySelector('.cb-eye-lens-contents')?.getAttribute('clip-path') || '',
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
      expect(contract.missingField).toEqual([]);
      expect(contract.fieldChildren.ticks).toBeGreaterThanOrEqual(24);
      expect(contract.fieldChildren.motes).toBeGreaterThanOrEqual(3);
      expect(contract.fieldMode).toBe(mode);
      expect(Number(contract.fieldVars.intensity)).toBeGreaterThan(0);
      expect(Number(contract.fieldVars.focus)).toBeGreaterThan(0);
      expect(contract.translatedCatchlightAnimations).toEqual([]);
      expect(contract.lensClip).toBe(true);
      expect(contract.clippedLensContents).toBe('url(#cb-eye-lens-clip)');
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
    await page.waitForTimeout(240);
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
    await page.waitForTimeout(800); // let the gaze spring settle to its static target
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
