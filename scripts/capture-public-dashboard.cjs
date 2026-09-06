#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'current-dashboard.png'));
const BASE_URL = (process.env.PERSONAL_DISPLAY_URL_BASE || 'http://127.0.0.1:8770').replace(/\/$/, '');

function buildId() {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'generated', 'build-id.js'), 'utf8');
  const match = source.match(/window\.__HERMES_DISPLAY_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('generated display build id is missing');
  return match[1];
}

function browserExecutable() {
  const configured = process.env.HERMES_TEST_CHROMIUM;
  const candidates = [
    configured,
    '/snap/chromium/current/usr/lib/chromium-browser/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function publicState() {
  return {
    schema_version: '0.1.0',
    behavior_mode: 'reasoning',
    optic_state_packet: { mode: 'reasoning' },
    caption: { text: 'Synthetic dashboard preview.' },
    safety: { contains_credentials: false },
    live: {
      gateway_ok: true,
      freshness: { tier: 'fresh', stale_measurements: [] },
      resolver: { display_state: 'active_work', reason_codes: ['public_preview'], secondary_badges: [] },
      current_work: {
        active: true,
        state: 'active_work',
        summary: 'Synthetic dashboard preview.',
        detail: 'Demo state for the public README.',
        age_seconds: 4,
        visual_kind: 'reasoning',
        source: 'demo data',
      },
      system: { cpu: 0.18, memory: 0.31, temp_c: 58, load_average_1m: 0.72 },
      remote_memory: { status: 'up', label: 'MEMORY', age_seconds: 12 },
      route_rail: {
        as_of_ms: Date.now(),
        age_seconds: 2,
        active_provider_id: 'openai-codex',
        providers: [
          { id: 'openai-codex', label: 'CHATGPT', tier_label: 'DEMO', rank: 1, state: 'confirmed', headroom: 0.72, reachable: true },
          { id: 'anthropic', label: 'CLAUDE', tier_label: 'DEMO', rank: 2, state: 'confirmed', headroom: 0.84, reachable: true },
          { id: 'google', label: 'GEMINI', tier_label: 'DEMO', rank: 3, state: 'confirmed', headroom: 0.63, reachable: true },
          { id: 'copilot', label: 'COPILOT', tier_label: 'DEMO', rank: 4, state: 'inferred', reachable: true },
          { id: 'xai-oauth', label: 'XAI', tier_label: '', rank: 5, state: 'unknown', headroom: null, reachable: false },
        ],
      },
    },
  };
}

function publicAugury() {
  return {
    schema_version: '0.1.0',
    generated_at: new Date().toISOString(),
    valid_for_seconds: 60,
    current_work: { active: true, summary: 'Synthetic dashboard preview.', age_seconds: 4 },
    items: [
      { kind: 'thinking', title: 'DEMO LAYOUT', text: 'Synthetic public preview.', age_seconds: 8 },
      { kind: 'status', title: 'DEMO STATUS', text: 'No private operator content.', age_seconds: 18 },
    ],
  };
}

function assertPublicText(text) {
  const forbidden = [
    /\/home\//i,
    /[A-Z]:\\Users\\/i,
    /\b(?:bearer|password|api[_ -]?key|private key)\b/i,
    /\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+/i,
    /\b(?:traceback|raw prompt|raw answer|tool output)\b/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`public screenshot text failed privacy check: ${pattern}`);
  }
}

async function freezeOpenEye(page, { timeoutMs = 5000, maxBlink = 0.02 } = {}) {
  return page.evaluate(({ timeoutMs: pageTimeoutMs, maxBlink: pageMaxBlink }) => new Promise((resolve, reject) => {
    let consecutiveOpenFrames = 0;
    let frameId = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      handler(value);
    };
    const timeoutId = setTimeout(() => {
      settle(reject, new Error('eye did not reach a stable open frame before capture'));
    }, pageTimeoutMs);
    const inspect = () => {
      frameId = 0;
      try {
        const rig = window.__HERMES_CONCEPT_B_EYE_MOTION;
        const blink = Number(rig?.debug?.().blink);
        consecutiveOpenFrames = Number.isFinite(blink) && blink <= pageMaxBlink
          ? consecutiveOpenFrames + 1
          : 0;
        if (rig && consecutiveOpenFrames >= 2) {
          rig.teardown();
          settle(resolve, blink);
          return;
        }
        frameId = requestAnimationFrame(inspect);
      } catch (error) {
        settle(reject, error);
      }
    };
    frameId = requestAnimationFrame(inspect);
  }), { timeoutMs, maxBlink });
}

async function main() {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const executablePath = browserExecutable();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1280 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.route('**/api/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.route('**/avatar-events/stream**', (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
    await page.route('**/api/hermes-state**', (route) => route.fulfill({ json: publicState() }));
    await page.route('**/api/augury-feed**', (route) => route.fulfill({ json: publicAugury() }));

    const params = new URLSearchParams({
      kiosk: '1',
      orientation: 'landscape',
      augury: '1',
      mode: 'reasoning',
      live: '1',
      preview: '1',
      v: buildId(),
    });
    await page.goto(`${BASE_URL}/src/character-runtime.html?${params}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector('.claude-concept-b .cb-radial-stage', { state: 'visible' });
    await page.waitForTimeout(900);
    await freezeOpenEye(page);

    const visibleText = await page.locator('body').innerText();
    assertPublicText(visibleText);
    await page.screenshot({ path: OUTPUT, fullPage: false });
  } finally {
    await browser.close();
  }
  console.log(`Updated public dashboard screenshot: ${OUTPUT}`);
}

module.exports = { freezeOpenEye };

if (require.main === module) {
  main().catch((error) => {
    console.error(`capture-public-dashboard failed: ${error.stack || error}`);
    process.exit(1);
  });
}
