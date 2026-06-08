#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const MODES = [
  'idle_watch',
  'reasoning',
  'tool_shell',
  'searching',
  'writing',
  'waiting_user',
  'blocked',
  'complete',
  'degraded_offline',
];

const URL_BASE = process.env.PERSONAL_DISPLAY_URL_BASE || 'http://127.0.0.1:8770';
function readDisplayBuildId() {
  const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'mascot', 'app.js'), 'utf8');
  const match = appSource.match(/const DISPLAY_BUILD_ID = '([^']+)'/);
  if (!match) throw new Error('DISPLAY_BUILD_ID not found in src/mascot/app.js');
  return match[1];
}

const BUILD = process.env.PERSONAL_DISPLAY_BUILD || readDisplayBuildId();

const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'review-artifacts', 'modes');

function modeUrl(mode) {
  const params = new URLSearchParams({
    kiosk: '1',
    orientation: 'landscape',
    mode,
    v: BUILD,
  });
  return `${URL_BASE}/src/character-runtime.html?${params.toString()}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const browser = await chromium.launch({
      executablePath: '/usr/bin/chromium-browser',
      args: ['--no-sandbox'],
    });

    const summary = [];
    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1280 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      for (const mode of MODES) {
        const url = modeUrl(mode);
        await page.goto(url, { waitUntil: 'networkidle' });

        try {
          await page.waitForSelector('.cb-eye-iris', { timeout: 8000 });
        } catch (e) {
          // selector may not appear for every mode; continue anyway
        }

        await sleep(900);
        const fileA = path.join(OUT_DIR, `${mode}-a.png`);
        await page.screenshot({ path: fileA, fullPage: true });

        await sleep(700);
        const fileB = path.join(OUT_DIR, `${mode}-b.png`);
        await page.screenshot({ path: fileB, fullPage: true });

        summary.push({ mode, files: [fileA, fileB] });
      }
    } finally {
      await browser.close();
    }

    console.log('Captured mode artifacts:');
    for (const entry of summary) {
      console.log(`  ${entry.mode}:`);
      for (const f of entry.files) {
        console.log(`    -> ${f}`);
      }
    }
    console.log(`Done. ${summary.length} modes, ${summary.length * 2} files in ${OUT_DIR}`);
    process.exit(0);
  } catch (err) {
    console.error('capture-mode-artifacts failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
