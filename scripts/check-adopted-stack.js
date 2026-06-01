#!/usr/bin/env node
/*
 * Executable gate for the Hermes personal-display adopted frontend posture:
 * Vite + Anime.js + XState + Zod + DOMPurify + Vitest + Playwright.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as XState from 'xstate';
import * as Zod from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const RUNTIME_HTML = path.join(ROOT, 'src', 'character-runtime-v2.html');
const STATE_JS = path.join(ROOT, 'src', 'state.js');
const BEHAVIOR_JS = path.join(ROOT, 'src', 'mascot-v2', 'behavior-machine.js');
const MOTION_JS = path.join(ROOT, 'src', 'mascot-v2', 'motion-adapter.js');
const SANITIZER_JS = path.join(ROOT, 'src', 'mascot-v2', 'sanitize.js');
const APP_JS = path.join(ROOT, 'src', 'mascot-v2', 'app.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadScripts(files, contextExtras = {}) {
  const context = vm.createContext({
    console,
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Set,
    Map,
    RegExp,
    Error,
    window: {},
    ...contextExtras,
  });
  context.window = context.window || {};
  for (const file of files) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return context;
}

function checkPackagePosture() {
  assert(fs.existsSync(PACKAGE_JSON), 'package.json is missing; Vite project posture is not adopted');
  const pkg = JSON.parse(read(PACKAGE_JSON));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const dep of ['@vitejs/plugin-legacy', 'vite', 'vitest', '@playwright/test', 'animejs', 'xstate', 'zod', 'dompurify']) {
    assert(allDeps[dep], `required adopted-stack dependency is missing: ${dep}`);
    // Kiosk durability: pin exact versions, never floating "latest"/ranges.
    assert(/^\d+\.\d+\.\d+$/.test(allDeps[dep]), `dependency ${dep} must be pinned to an exact version, got "${allDeps[dep]}"`);
  }
  for (const script of ['dev', 'build', 'test', 'test:unit', 'test:e2e', 'check:stack']) {
    assert(pkg.scripts?.[script], `required package script is missing: ${script}`);
  }
}

function checkRuntimeLoadsAdapters() {
  const html = read(RUNTIME_HTML);
  for (const script of ['vendor/anime.iife.min.js', 'vendor/xstate.iife.min.js', 'vendor/purify.min.js', 'vendor/zod.global.js', 'mascot-v2/sanitize.js', 'mascot-v2/behavior-machine.js', 'mascot-v2/motion-adapter.js']) {
    assert(html.includes(script), `character runtime does not load ${script}`);
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function checkVendorIntegrity() {
  const vendorPath = path.join(ROOT, 'src', 'vendor', 'xstate.iife.min.js');
  const packagedPath = path.join(ROOT, 'node_modules', 'xstate', 'dist', 'xstate.umd.min.js');
  assert(fs.existsSync(vendorPath), 'vendored XState file is missing');
  assert(fs.existsSync(packagedPath), 'installed XState UMD artifact is missing; run npm install before stack check');
  const vendored = read(vendorPath);
  const packaged = read(packagedPath);
  const vendorHash = sha256(vendored);
  const packageHash = sha256(packaged);
  assert(vendorHash === packageHash, `vendored XState drifted from node_modules/xstate/dist/xstate.umd.min.js (${vendorHash} != ${packageHash})`);

  const context = vm.createContext({ console });
  context.window = context;
  context.globalThis = context;
  context.self = context;
  vm.runInContext(vendored, context, { filename: vendorPath });
  const xstate = context.XState || context.window.XState;
  assert(xstate?.createMachine && xstate?.createActor, 'vendored XState does not expose createMachine/createActor on the browser global');
}

function checkBehaviorMachine() {
  const context = loadScripts([BEHAVIOR_JS], { window: { XState: null } });
  const behavior = context.window.HermesBehaviorMachine;
  assert(behavior, 'HermesBehaviorMachine was not exported');
  assert(behavior.MODES.includes('tool_shell'), 'tool_shell mode missing from behavior machine');
  let service = behavior.createBehaviorService('idle_watch');
  assert(service.mode === 'idle_watch', `expected idle_watch initial mode, got ${service.mode}`);
  service = service.send({ type: 'ASSISTANT_NOTICE', source: 'user' });
  assert(service.mode === 'notice', `ASSISTANT_NOTICE should transition to notice, got ${service.mode}`);
  service = service.send({ type: 'TOOL_STARTED' });
  assert(service.mode === 'tool_shell', `TOOL_STARTED should transition to tool_shell, got ${service.mode}`);
  service = service.send({ type: 'WAITING_USER' });
  assert(service.mode === 'waiting_user', `WAITING_USER should transition to waiting_user, got ${service.mode}`);
  service = service.send({ type: 'RESOLVE' });
  assert(service.mode === 'complete', `RESOLVE should transition to complete, got ${service.mode}`);
  service = service.send({ type: 'RESET' });
  assert(service.mode === 'idle_watch', `RESET should transition to idle_watch, got ${service.mode}`);

  const actorContext = loadScripts([BEHAVIOR_JS], { window: { XState } });
  const actorService = actorContext.window.HermesBehaviorMachine.createBehaviorService('idle_watch');
  assert(actorService.actor, 'createBehaviorService should expose an XState actor when window.XState.createActor is available');
  actorService.send({ type: 'ASSISTANT_NOTICE' }).send({ type: 'TOOL_STARTED' }).send({ type: 'DEGRADED' });
  assert(actorService.mode === 'degraded_offline', `XState actor service DEGRADED transition failed, got ${actorService.mode}`);
  const actorRef = actorService.actor;
  actorService.setMode('blocked');
  assert(actorService.actor === actorRef, 'setMode must transition the running XState actor, not rebuild it');
  assert(actorService.mode === 'blocked', `XState setMode failed, got ${actorService.mode}`);
  actorService.stop();

  // Parallel display-state architecture: behavior + health + quiet + privacy_display regions
  // hold simultaneously; overlay regions are derived from the live packet.
  const parallel = actorContext.window.HermesBehaviorMachine.createXStateMachine('idle_watch');
  assert(parallel?.config?.type === 'parallel', 'behavior machine must be a parallel state machine');
  assert(['behavior', 'health', 'quiet', 'privacy_display'].every((r) => parallel.config.states[r]), 'behavior machine missing a parallel region (behavior/health/quiet/privacy_display)');
  const overlayService = actorContext.window.HermesBehaviorMachine.createBehaviorService('idle_watch');
  overlayService.send({ type: 'TOOL_STARTED' }).send({ type: 'HEALTH_CRITICAL' }).send({ type: 'NIGHT_ON' }).send({ type: 'PRIVACY_SENSITIVE' });
  assert(overlayService.mode === 'tool_shell', `behavior region failed under parallel overlays, got ${overlayService.mode}`);
  assert(JSON.stringify(overlayService.overlays) === JSON.stringify({ health: 'critical', quiet: 'night', privacy: 'sensitive' }), `parallel overlays not tracked, got ${JSON.stringify(overlayService.overlays)}`);
  overlayService.stop();
  const events = context.window.HermesBehaviorMachine.regionEventsForPacket({ motion: { severity: 'critical' }, state_preset: 'night_watch', snippet: { sensitivity: 'operator_only' } });
  assert(events.includes('HEALTH_CRITICAL') && events.includes('NIGHT_ON') && events.includes('PRIVACY_SENSITIVE'), `regionEventsForPacket did not derive overlay events: ${JSON.stringify(events)}`);
}

function checkSchemaValidation() {
  const context = loadScripts([STATE_JS], { window: { Zod } });
  const state = context.window.HermesDisplayState;
  assert(state?.validateOpticStatePacket, 'validateOpticStatePacket was not exported');
  const result = state.validateOpticStatePacket({
    mode: 'tool_shell',
    attention: { target: 'tool' },
    optic: { aperture_open: 3, pupil_x: -9, pupil_y: 2.5, ring_motion_budget: 99 },
    caption: { text: '<b>hello</b>', visibility: 'visible' },
  });
  assert(result.ok, `valid-ish optic packet was rejected: ${JSON.stringify(result)}`);
  assert(result.validator === 'zod', `optic packet validation should use Zod when a Zod global is present, got "${result.validator}"`);
  assert(result.packet.optic.aperture_open === 1, 'aperture_open was not clamped to 1');
  assert(result.packet.optic.pupil_x === -1, 'pupil_x was not clamped to -1');
  assert(result.packet.optic.pupil_y === 1, 'pupil_y was not clamped to 1');
  assert(result.packet.optic.ring_motion_budget === 1, 'ring_motion_budget was not clamped to 1');
  const rejected = state.validateOpticStatePacket({ mode: 'invalid_mode' });
  assert(!rejected.ok, 'invalid optic packet mode should be rejected');

  const fallbackContext = loadScripts([STATE_JS], { window: { Zod: null } });
  const fallbackState = fallbackContext.window.HermesDisplayState;
  const fallback = fallbackState.validateOpticStatePacket({ mode: 'tool_shell', optic: { pupil_x: -9 } });
  assert(fallback.ok && fallback.packet.optic.pupil_x === -1, 'custom optic validation fallback should remain available without Zod');
}

function checkSanitizer() {
  const context = loadScripts([SANITIZER_JS], {
    window: {
      DOMPurify: {
        sanitize: (value) => String(value).replace(/<script[\s\S]*?<\/script>/gi, ''),
      },
    },
  });
  const sanitizer = context.window.HermesSanitize;
  assert(sanitizer?.captionText, 'HermesSanitize.captionText was not exported');
  assert(sanitizer.captionText('<img src=x onerror=alert(1)>hello<script>x</script>') === 'hello', 'captionText did not strip HTML/script content to safe text');
  assert(sanitizer.captionHtml('<b>ok</b><script>x</script>').includes('<b>ok</b>'), 'captionHtml should retain safe rich text through DOMPurify');
  assert(!sanitizer.captionHtml('<b>ok</b><script>x</script>').includes('script'), 'captionHtml should remove script markup');
}

function checkMotionAdapter() {
  let animeCalls = 0;
  const context = loadScripts([MOTION_JS], {
    window: {
      anime: (opts) => {
        animeCalls += 1;
        if (opts?.complete) opts.complete();
        return { pause() {}, restart() {} };
      },
    },
  });
  const motion = context.window.HermesMotionAdapter;
  assert(motion?.createMotionAdapter, 'HermesMotionAdapter.createMotionAdapter was not exported');
  const adapter = motion.createMotionAdapter({ prefersReducedMotion: false });
  adapter.animateValue({ targets: { x: 0 }, x: 1, duration: 10 });
  assert(animeCalls === 1, 'motion adapter did not route animation through Anime.js when available');
  let v4Call = null;
  const v4Context = loadScripts([MOTION_JS], {
    window: {
      anime: {
        animate: (targets, params) => {
          v4Call = { targets, params };
          params?.onComplete?.();
          return { pause() {}, restart() {} };
        },
      },
    },
  });
  const v4Target = { opacity: 0 };
  let completed = false;
  v4Context.window.HermesMotionAdapter.createMotionAdapter().animateValue({
    targets: v4Target,
    opacity: 1,
    easing: 'easeOutQuad',
    complete: () => { completed = true; },
  });
  assert(v4Call?.targets === v4Target, 'Anime.js v4 adapter did not call animate(targets, params)');
  assert(v4Call?.params?.ease === 'outQuad', 'Anime.js v4 adapter did not normalize easing to v4 ease names');
  assert(completed, 'Anime.js v4 adapter did not map complete to onComplete');
  const reduced = motion.createMotionAdapter({ prefersReducedMotion: true });
  const target = { opacity: 0 };
  reduced.animateValue({ targets: target, opacity: 0.5, duration: 1000 });
  assert(target.opacity === 0.5, 'reduced-motion fallback did not synchronously apply final value');
}

function checkQuietCopyIsNotMisleading() {
  const app = read(APP_JS);
  assert(!app.includes('Quiet watch. Last activity'), 'quiet copy should not imply the live feed is stale when telemetry is fresh');
  assert(app.includes('Feed fresh; no active turn'), 'quiet copy should explicitly distinguish fresh telemetry from no active turn');
}

function main() {
  checkPackagePosture();
  checkRuntimeLoadsAdapters();
  checkVendorIntegrity();
  checkBehaviorMachine();
  checkSchemaValidation();
  checkSanitizer();
  checkMotionAdapter();
  checkQuietCopyIsNotMisleading();
  console.log('OK adopted stack posture verified: Vite/Anime/XState/Zod/DOMPurify/Vitest/Playwright');
}

main();
