#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const stateSource = fs.readFileSync(path.join(projectRoot, 'src', 'state.js'), 'utf8');
const mascotStatesSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'states.js'), 'utf8');
const runtimeSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'runtime.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'app.js'), 'utf8');

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function loadBrowserExports() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(stateSource, sandbox, { filename: 'src/state.js' });
  vm.runInContext(mascotStatesSource, sandbox, { filename: 'src/mascot-v2/states.js' });
  return sandbox.window;
}

function objectBlock(source, name) {
  const marker = `${name}: {`;
  const start = source.indexOf(marker);
  if (start === -1) fail(`Missing object block ${name}`);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  fail(`Unclosed object block ${name}`);
}

const win = loadBrowserExports();
const display = win.HermesDisplayState;
const mascot = win.HermesMascotV2States;
assert(display, 'Missing window.HermesDisplayState export.');
assert(mascot, 'Missing window.HermesMascotV2States export.');

const displayPresets = display.DISPLAY_PRESETS;
const states = mascot.STATES;
const gaze = mascot.GAZE;
const mouths = mascot.MOUTH_PATHS;
const behaviorGaze = mascot.BEHAVIOR_GAZE_GRAMMAR;
const behaviorMouth = mascot.BEHAVIOR_MOUTH_GRAMMAR;
const contextualBlink = mascot.CONTEXTUAL_BLINK_GRAMMAR;
assert(displayPresets && states && gaze && mouths && behaviorGaze && behaviorMouth && contextualBlink, 'Missing display/mascot state contracts.');

const behaviorMap = {
  idle_watch: { preset: 'quiet_watch', state: 'idle_watchful' },
  listening: { preset: 'waiting_input', state: 'idle_watchful' },
  reading: { preset: 'working', visualKind: 'reading', state: 'thinking_focused' },
  reasoning: { preset: 'reasoning', visualKind: 'reasoning', state: 'thinking_focused' },
  searching: { preset: 'working', visualKind: 'searching', state: 'thinking_focused' },
  tool_shell: { preset: 'working', visualKind: 'shell', state: 'thinking_focused' },
  writing: { preset: 'working', visualKind: 'writing', state: 'thinking_focused' },
  waiting_user: { preset: 'waiting_input', state: 'idle_watchful' },
  blocked: { preset: 'blocked', state: 'blocked_annoyed' },
  complete: { preset: 'completed', state: 'healthy_smug' },
  degraded_offline: { preset: 'degraded_offline', state: 'degraded_offline' },
  notice: { transient: 'notice', state: 'idle_watchful' }
};

for (const [behavior, mapping] of Object.entries(behaviorMap)) {
  if (mapping.preset) assert(displayPresets[mapping.preset], `Behavior ${behavior} maps to missing display preset ${mapping.preset}.`);
  if (mapping.state) assert(states[mapping.state], `Behavior ${behavior} maps to missing mascot state ${mapping.state}.`);
}

for (const [name, state] of Object.entries(states)) {
  assert(Array.isArray(state.blinkMs) && state.blinkMs.length === 2, `${name} must define blinkMs range.`);
  assert(typeof state.lid === 'number', `${name} must define lid openness.`);
  assert(typeof state.squint === 'number', `${name} must define squint.`);
  assert(Array.isArray(state.gazeTargets) && state.gazeTargets.length > 0, `${name} must define gazeTargets.`);
  assert(Array.isArray(state.gazeWeights) && state.gazeWeights.length === state.gazeTargets.length, `${name} gazeWeights must match gazeTargets.`);
  assert(state.gazeProfile && typeof state.gazeProfile === 'object', `${name} must define gazeProfile.`);
  assert(typeof state.mouth === 'string' && mouths[state.mouth], `${name} must map to a known mouth path.`);
  assert(typeof state.helmetTiltDeg === 'number', `${name} must define helmetTiltDeg.`);
  assert(typeof state.wingFlap === 'number' && state.wingFlap <= 0.5, `${name} wingFlap must stay restrained; got ${state.wingFlap}.`);
  assert(state.motionBudget && typeof state.motionBudget === 'object', `${name} must define motionBudget.`);
}

const requiredGazes = ['center', 'left', 'right', 'up', 'down', 'up_left', 'up_right', 'down_left', 'down_right', 'side_eye_left', 'side_eye_right', 'forward_focus', 'sleepy'];
for (const name of requiredGazes) assert(gaze[name], `Missing gaze target ${name}.`);

const requiredBehaviorGazes = ['reading','searching','tool_shell','writing','waiting','blocked','complete','degraded_offline'];
for (const behavior of requiredBehaviorGazes) {
  assert(Array.isArray(behaviorGaze[behavior]) && behaviorGaze[behavior].length >= 3, `Missing first-class gaze grammar for ${behavior}.`);
  for (const target of behaviorGaze[behavior]) assert(gaze[target], `${behavior} gaze grammar references unknown gaze ${target}.`);
  assert(typeof behaviorMouth[behavior] === 'string' && mouths[behaviorMouth[behavior]], `Missing restrained mouth grammar for ${behavior}.`);
}
for (const phase of ['notice','orient','commit','sustain','resolve','degraded_offline']) {
  assert(contextualBlink[phase] && Number.isFinite(contextualBlink[phase].durationMs), `Missing contextual blink profile ${phase}.`);
}

const workKinds = ['shell', 'reading', 'searching', 'writing', 'planning', 'reasoning'];
for (const kind of workKinds) {
  assert(runtimeSource.includes(`${kind}: {`), `Missing work visual variant ${kind}.`);
}

const reasoningBlock = objectBlock(runtimeSource, 'reasoning');
assert(reasoningBlock.includes('scanBeam: false'), 'Reasoning must look internal and calm: scanBeam must be false.');
assert(/dwellMs:\s*\[1[8-9]00|dwellMs:\s*\[2\d{3}/.test(reasoningBlock), 'Reasoning must use longer dwell timing than search/tool work.');
assert(/wingFlap:\s*0\.1[0-9]/.test(reasoningBlock), 'Reasoning wing motion must be restrained under 0.20.');

const waitingBlock = objectBlock(runtimeSource, 'waiting_input');
assert(waitingBlock.includes("gazeTargets: ['center','forward_focus'"), 'waiting_input must keep patient forward/user attention.');
assert(waitingBlock.includes("mouth: 'neutral'") || waitingBlock.includes("mouth: 'smile_small'"), 'waiting_input must use a restrained social mouth.');
assert(/wingFlap:\s*0\.0[0-9]|wingFlap:\s*0\.1[0-2]/.test(waitingBlock), 'waiting_input wing motion must be calm, not needy.');

const feedStaleBlock = objectBlock(runtimeSource, 'feed_stale');
assert(feedStaleBlock.includes('scanBeam: false'), 'feed_stale/degraded_offline must not use a busy scan beam.');
assert(/blinkMs:\s*\[[4-9]\d{3},\s*[7-9]\d{3}/.test(feedStaleBlock), 'feed_stale/degraded_offline must use slower blink timing.');
assert(/fxIntensity:\s*0\.[1-4]/.test(feedStaleBlock), 'feed_stale/degraded_offline must be dimmer/calm.');

assert(runtimeSource.includes('attentionStack'), 'Runtime must expose an attentionStack for interrupt/return continuity.');
assert(runtimeSource.includes('recentAvatarEvents'), 'Runtime must retain event attention memory without raw content.');
assert(runtimeSource.includes('notice(') || runtimeSource.includes('noticeTransient'), 'Runtime must expose an explicit notice transient path.');
assert(runtimeSource.includes('beginTransitionPhase'), 'Runtime must expose named transition phases.');
assert(runtimeSource.includes('notice -> orient -> commit -> sustain -> resolve'), 'Runtime must document the explicit transition sequence.');
assert(runtimeSource.includes('ingestAvatarEvent'), 'Runtime must integrate validated local/avatar events into puppet intents.');
assert(appSource.includes('displayUnsafe'), 'Client avatar event gate must reject display-unsafe strings before retaining/displaying labels.');
assert(appSource.includes('display-unsafe string'), 'Client avatar event gate must report display-unsafe string rejections.');
assert(appSource.includes('/home') || appSource.includes('A-Za-z]:'), 'Client avatar event gate must include raw path-like label detection.');
assert(appSource.includes('prompt\\s*[:=]'), 'Client avatar event gate must include raw prompt-like label detection.');

console.log('OK puppet behavior mapping checks.');
