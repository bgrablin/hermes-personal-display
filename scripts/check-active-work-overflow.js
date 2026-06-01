#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'hermes_display_server.py'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'app.js'), 'utf8');

const copyMatch = serverSource.match(/if display_state == "active_work":[\s\S]*?return "thinking_focused", "retro-terminal-focus", "([^"]+)", ([^\n]+)/);
if (!copyMatch) {
  throw new Error('Could not locate active-work state_copy assignment.');
}

const activeCaption = copyMatch[1];
if (activeCaption.length > 16) {
  throw new Error(`Active-work caption too long for physical display: ${activeCaption.length} chars (${activeCaption})`);
}
if (activeCaption !== 'Work active.') {
  throw new Error(`Expected display-safe active-work caption "Work active.", got "${activeCaption}".`);
}
if (!appSource.includes("label: 'CURRENT TASK'")) {
  throw new Error('Active-work assistant card label is missing.');
}
if (!appSource.includes('function activitySummary(') || !appSource.includes('generic.test(text)')) {
  throw new Error('Active-work activity card must avoid generic Work active copy when better display-safe detail exists.');
}
if (!appSource.includes("Checking constraints before action.") || !appSource.includes("Replying on ${sourceName}.")) {
  throw new Error('Active-work activity card is missing the expected concise display-safe fallback summaries.');
}

const cssSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
for (const selector of ['body.kiosk-mode.kiosk-landscape .caption-card', 'body.kiosk-mode.kiosk-landscape .panel-live']) {
  const selectorIndex = cssSource.lastIndexOf(selector);
  if (selectorIndex === -1) {
    throw new Error(`Missing CSS selector ${selector}.`);
  }
  const nextBlock = cssSource.slice(selectorIndex, selectorIndex + 500);
  if (!nextBlock.includes('display: -webkit-box') || !nextBlock.includes('-webkit-line-clamp')) {
    throw new Error(`${selector} lacks display-safe line clamping.`);
  }
}

console.log('OK active-work caption and activity text are display-safe.');
