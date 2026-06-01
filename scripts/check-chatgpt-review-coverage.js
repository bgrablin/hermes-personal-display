#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import cp from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const planPath = process.env.HERMES_DISPLAY_PLAN_PATH || path.join(root, 'docs/chatgpt-pro-review-execution-2026-05-21.md');
const plan = fs.readFileSync(planPath, 'utf8');
const state = read('src/state.js');
const app = read('src/mascot-v2/app.js');
const css = read('src/styles.css');
const verify = read('scripts/verify-project.sh');
assert(plan.includes('Presence first, trust second, entertainment third'), 'Plan must carry corrected personality thesis.');
assert(plan.includes('single Hermes optic core') || plan.includes('single-eye') || plan.includes('Concept B') || plan.includes('retro robot') || plan.includes('retro-robot'), 'Plan must contain active character/display constraint.');
assert(plan.includes('display_sensitivity') || plan.includes('Display Sensitivity Policy') || plan.includes('credential'), 'Plan must include display-sensitivity policy.');
assert((plan.includes('optic_state_packet') && plan.includes('puppet_state_packet')) || plan.includes('persona_packet'), 'Plan must cover persona/optic packet separation.');
assert(plan.includes('Visual Acceptance Gates') || plan.includes('physical display') || plan.includes('DP-2'), 'Plan must include visual acceptance gates.');
assert(state.includes('retro-robot-core') && state.includes('retro-terminal-focus'), 'Runtime should use active retro-robot skin names, not old mascot replacement names as primary presets.');
assert(app.includes('modeProof') && app.includes('qaProof') && css.includes('mode-proof'), 'Runtime must expose an opt-in QA mode-proof strip without making it permanent chrome.');
assert(app.includes('cb-eye-core') && css.includes('cb-eye-lens'), 'Concept B must include the Claude-style single-eye instrument direction.');
assert(fs.existsSync(path.join(root, 'scripts/personality_engine.py')), 'personality_engine.py missing.');
assert(verify.includes('check-chatgpt-review-coverage.js'), 'verify-project must run this coverage gate.');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-persona-'));
const sample = {
  schema_version: '0.1.0', generated_at: '2026-05-21T00:00:00Z', source: 'gate', boundary: 'local_trusted_display', mode: 'day', overall_status: 'busy', status_summary: 'working',
  services: { gateway: { state: 'ok', label: 'gateway', severity: 'success' } },
  activity: { active_sessions: 1, active_tools: 1, active_workers: 0, cron_running: 0, cron_failed_recent: 0, kanban_ready: 0, kanban_running: 0, kanban_blocked: 0, display_safe_title: 'Working in shell' },
  system: { host: 'display-host', cpu_band: 'moderate', memory_band: 'low', disk_band: 'low', network_band: 'normal', temperature_band: 'warm' },
  display_policy: { allow_local_snippets: true, allow_external_model_context: false, redaction_required: true, forbid_credentials: true },
  snippets: [{ id: 'bad', text: 'token sk-sho...nder', kind: 'system', display_sensitivity: 'credential_blocked' }],
  recent_persona: []
};
const statePath = path.join(tmp, 'display_state.json');
fs.writeFileSync(statePath, JSON.stringify(sample));
const out = cp.execFileSync('python3', [path.join(root, 'scripts/personality_engine.py'), '--state', statePath, '--out', path.join(tmp, 'persona.json'), '--puppet-out', path.join(tmp, 'puppet.json'), '--history', path.join(tmp, 'history.jsonl')], { encoding: 'utf8' });
const combined = JSON.parse(out);
assert(combined.persona_packet.skin === 'retro-terminal-focus', 'busy state should use active retro terminal skin.');
assert(combined.puppet_state_packet.mode === 'tool_shell', 'busy state should resolve to tool_shell puppet mode.');
assert(!JSON.stringify(combined).includes('sk-sho...nder'), 'credential-shaped snippet leaked into output.');
console.log('OK ChatGPT Pro review coverage and local personality-engine gate.');
