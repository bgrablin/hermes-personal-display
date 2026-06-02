#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const stateSource = fs.readFileSync(path.join(projectRoot, 'src', 'state.js'), 'utf8');
const mascotRuntimeSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'runtime.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'hermes_display_server.py'), 'utf8');
const runtimeHtml = fs.readFileSync(path.join(projectRoot, 'src', 'character-runtime-v2.html'), 'utf8');
const xsessionSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'xsession-minix-kiosk.sh'), 'utf8');
const displayCliSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'hermes-display'), 'utf8');
const audioSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'audio.js'), 'utf8');
const touchFxSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'touch-fx.js'), 'utf8');
const entertainmentSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'entertainment.js'), 'utf8');
const watchSequencesSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'watch-sequences.js'), 'utf8');
const sequencesJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'mascot-v2', 'sequences.json'), 'utf8'));

function fail(message) {
  throw new Error(message);
}

function requireAll(source, tokens, message) {
  const missing = tokens.filter((token) => !source.includes(token));
  if (missing.length) fail(`${message}: missing ${missing.join(', ')}`);
}

function blockFor(selector) {
  let idx = cssSource.indexOf(`${selector} {`);
  if (idx === -1) idx = cssSource.indexOf(selector);
  if (idx === -1) fail(`Missing selector ${selector}`);
  const open = cssSource.indexOf('{', idx);
  const close = cssSource.indexOf('}', open);
  if (open === -1 || close === -1) fail(`Malformed block for ${selector}`);
  return cssSource.slice(open + 1, close);
}

function fontPx(block, selector) {
  const match = block.match(/font:\s*[^;]*?\s(\d+)px\//);
  if (!match) fail(`No px font shorthand found for ${selector}`);
  return Number(match[1]);
}

// Claude Design Concept B contract: one living instrument, not the old side-card cockpit.
requireAll(appSource, [
  "dataset.dashboard = 'claude-concept-b'",
  'cb-topbar',
  'cb-radial-stage',
  'cb-eye-core',
  'cb-eye-iris',
  'cb-eye-lid-top',
  'cb-eye-grid',
  'cb-eye-scan',
  'applyConceptBPuppet',
  'installConceptBGrid',
  '☤',
  'cb-bottom-rail',
  'data-cb-arc="cpu"',
  'data-cb-arc="mem"',
  'data-cb-arc="temp"',
  'showDeveloperTouchGrid',
], 'Concept B radial dashboard DOM must be installed');
requireAll(cssSource, [
  'Claude Design Concept B living instrument implementation',
  '.cb-radial-stage',
  '.cb-eye-lens',
  '.cb-eye-lid',
  '.cb-eye-special',
  '.cb-eye-scan',
  'display: none !important;',
  '.cb-bottom-rail',
  '.touch-fx-layer',
  '.touch-fx-vortex',
  '.touch-fx-constellation-star',
  'data-touch-fx-state="idle"',
  'data-touch-fx-state="active"',
  '@keyframes hermes-comet-left',
  '@keyframes hermes-comet-right',
  '@keyframes hermes-firefly-rise',
  '@keyframes hermes-spark-fly',
  '@keyframes hermes-mote-orbit',
  'prefers-reduced-motion',
], 'Concept B CSS must be present');
requireAll(runtimeHtml, [
  './mascot-v2/touch-fx.js?v=',
  './mascot-v2/entertainment.js?v=',
  './mascot-v2/watch-sequences.js?v=',
  './mascot-v2/app.js?v=',
], 'Concept B runtime must load touch FX, entertainment, watch sequence shim, and app scripts together');
requireAll(touchFxSource, [
  'window.HermesTouchFx = { install }',
  'function maybeHandleMultitouch()',
  'function maybeHandlePinchSpread()',
  'function setTouchFxIdle()',
  'function setTouchFxActive(duration = TOUCH_ACTIVE_MS)',
  'touchFxState: () => fxLayer.dataset.touchFxState',
  'testForceIdle: setTouchFxIdle',
  'spawnComet(\'left\'',
  'spawnComet(\'right\'',
  'spawnGroundWave(x, y)',
  'const isReducedMotion = () => window.matchMedia?.(\'(prefers-reduced-motion: reduce)\')?.matches',
  'window.__HERMES_CONCEPT_B_EYE_MOTION?.touchPulse?.',
  'emitGesture(',
  'hermes-touch-gesture',
  'spawnEffect: spawnEffect',
  'testSpawnMultiTouch',
], 'Touch FX module must be the only normal pointer owner, preserve multitouch/side/bottom effects, and emit semantic entertainment gestures');
requireAll(appSource, [
  'touchPulse(detail = {})',
  'state.targetX = x;',
  'state.targetY = y;',
  'state.forcedUntil = now +',
  "kind: 'user_touch'",
], 'Concept B eye rig must implement the touchPulse hook that touch-fx calls so touches physically steer the optic.');
requireAll(appSource, [
  'CONCEPT_B_FEEL',
  'cb-listening-ripple',
  'cb-cadence-caret',
  'cb-offline-bubble',
  'window.HermesDisplayEvents',
  'onThinking(active = true',
  'onIncomingMessage(meta = {})',
  'onTokenBuffer(size = 0)',
  'onAudioRms(rms = 0)',
  "onError(code = 'error')",
  "onNetwork(state = 'online')",
  'reset() {',
  "setConceptBDataset(refs.body, 'cbListening'",
  "setConceptBDataset(refs.body, 'cbGenerating'",
  "setConceptBDataset(refs.body, 'cbOffline'",
], 'Concept B living UI feel functions must expose listening ripple, cadence caret, offline fallback, and public event hooks.');
requireAll(cssSource, [
  '--cb-load-pulse-duration',
  '--cb-listen-rms',
  '--cb-caret-duration',
  '@keyframes cb-listen-ripple',
  '@keyframes cb-caret-cadence',
  '@keyframes cb-offline-outline-dot',
  'prefers-reduced-motion',
], 'Concept B living UI feel CSS must keep tunable load/listening/caret/offline animations and reduced-motion gates.');
if (appSource.includes('cb-load-glow') || cssSource.includes('.cb-load-glow') || cssSource.includes('@keyframes cb-load-breath')) {
  fail('Large pulsing load-glow circle around the optic is banned; keep activity cues inside the existing optic/ring field.');
}
requireAll(entertainmentSource, [
  'window.HermesEntertainment = Object.freeze(api)',
  "fetch('./mascot-v2/sequences.json'",
  'ALLOWED_STEP_TYPES',
  'async function speakLine',
  "fetch('/api/hermes-entertainment/tts'",
  "fetch('/api/hermes-entertainment/line'",
  'speechSynthesis.speak(utterance)',
  'playSfx(step.asset, origin)',
  'hermes-watch-speak-start',
  'hermes-watch-sequence-start',
  'function installTouchControls(options = {})',
  "window.addEventListener('hermes-touch-gesture'",
  'routeEntertainmentGesture',
  "touchMode() !== 'off'",
], 'Entertainment module must subscribe to semantic touch gestures, own JSON-backed sequences, server-backed TTS/line calls, browser fallback speech, and SFX');
if (/addEventListener\(['"]pointer(?:down|move|up|cancel|leave)['"]/.test(entertainmentSource)) {
  fail('Entertainment module must not own pointer events in normal mode; touch-fx.js emits hermes-touch-gesture events.');
}
requireAll(watchSequencesSource, [
  'Compatibility shim',
  'window.HermesWatchSequences',
  "call('playSequence'",
  "call('abort'",
], 'HermesWatchSequences must remain a compatibility shim only');
if (watchSequencesSource.includes('const SEQUENCES =') || watchSequencesSource.includes('speechSynthesis.speak(utterance)')) {
  fail('watch-sequences.js must not reintroduce hardcoded sequence data or primary browser speech; entertainment.js owns both.');
}
const disallowedStepTypes = new Set(['PUPIL', 'SACC', 'BOUNCE', 'SPARKLE', 'SPRITE', 'ROTATE', 'VIGNETTE_SWEEP', 'OVERLAY_SVG', 'GESTURE', 'HOVER', 'SQUASH']);
for (const seq of sequencesJson.sequences || []) {
  for (const step of seq.steps || []) {
    if (disallowedStepTypes.has(step.event)) fail(`sequences.json step ${step.event} must be normalized to an allowlisted entertainment event.`);
  }
}
requireAll(appSource, [
  "const touchMode = (params.get('touch') || 'fun').toLowerCase()",
  "if (touchMode === 'off') return;",
  'window.HermesEntertainment?.installTouchControls?.({',
  "if (!(touchMode === 'legacy' && debugTouch))",
  'const conceptBTouchMode = (params.get(\'touch\') || \'fun\').toLowerCase()',
  "showDeveloperTouchGrid = conceptBTouchMode === 'legacy'",
  "params.get('touchzones')",
], 'Normal kiosk touch must route to entertainment-only module with developer tools explicitly legacy-gated');
if (appSource.includes("params.get('touchzones') || params.get('touchtest')")) {
  fail('touchtest=1 must not reveal the Concept B developer touch-zone overlay; require debug=1&touchzones=1 instead.');
}
if (!appSource.includes("touchMode === 'legacy' && debugTouch")) {
  fail('Legacy operational touch controls must be gated behind touch=legacy&debug=1.');
}

const readableSelectors = [
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-line', 28],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-cell strong', 24],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-arc-value', 28],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-attention', 18],
];
for (const [selector, minPx] of readableSelectors) {
  const px = fontPx(blockFor(selector), selector);
  if (px < minPx) fail(`${selector} regressed to ${px}px; expected >= ${minPx}px for MINIX desk-distance readability.`);
}

if (appSource.includes('♆')) {
  fail('Top-left identity mark must be Hermes caduceus-aligned, not the old trident/Neptune glyph.');
}
if (!appSource.includes('ensureConceptBEyeMotion') || !appSource.includes('renderConceptBEyeMotion') || !appSource.includes('conceptBEyeMicroMotion')) {
  fail('Concept B eye gaze must use the RAF motion rig for fluid saccades, not one-second snapped updates.');
}
if (appSource.includes('pupilGroup.removeAttribute(\'transform\')')) {
  fail('Concept B pupil highlights must not be left fixed while only the pupil radius changes; scale the pupil group instead.');
}
if (!appSource.includes("setConceptBTransform(parts.pupilGroup, `translate(550 550) scale(${effPupil.toFixed(3)}) translate(-550 -550)`)") || !appSource.includes("setConceptBAttribute(parts.pupil, 'r', '44')")) {
  fail('Concept B pupil dilation/blink must scale the full pupil group so catchlights/specular dots remain attached to the pupil.');
}
// Blink is the reference's signature motion. On the single-iris optic it must read as a
// symmetric lid pinch over a stable lens, not as iris/pupil zoom or lower-right dart.
// It is still driven by an anime.js cadence loop (state.blink), but the RAF flush keeps
// gaze/iris/pupil transforms posture-only while lids occlude the eye.
if (!appSource.includes('function armBlink()') || !appSource.includes('blink: 1, duration:') || appSource.includes('blinkHoldX') || appSource.includes('blinkZoom') || !appSource.includes('const lidFrac = Math.max(state.lid, blink);') || !appSource.includes('const effPupil = Math.max(0.60, Math.min(1.35, state.pupil + (Number(state.pupilFlash) || 0)))') || !appSource.includes('const topH = Math.max(0, 176 * Math.max(0, Math.min(1, amount + (Number(upperBias) || 0))))') || !appSource.includes('const bottomH = Math.max(0, 176 * Math.max(0, Math.min(1, amount + (Number(lowerBias) || 0))))') || !appSource.includes('renderConceptBLids(parts.lidTop, parts.lidBottom, lidFrac, state.upperBias, state.lowerBias)')) {
  fail('Concept B must blink via an anime.js cadence loop: symmetric lid pinch over stable iris/pupil on blink.interval_ms.');
}
// anime.js must actually drive the optic cadence + expressive transients, not just be loaded.
requireAll(appSource, [
  'createMotionAdapter',
  'function armBlink()', 'function armBreath()', 'function armRing()', 'function armScan()',
  'motion.animateValue(',
  'setConceptBTransform(parts.orbitSpin', 'state.ringAngle', 'state.scanAngle', 'setConceptBTransform(parts.core', 'state.breath',
  'ripple(pulseCircle', 'fireModeTransition', 'function driftDots()',
], 'anime.js must drive optic cadence (blink/breath/ring/scan), drifting catchlights, and one-shot transients (notice/complete/blocked/touch).');
// Per-mode posture must reach the eye on the deterministic ?mode= preview path, not just live.
if (!stateSource.includes('MODE_OPTIC_POSTURE') || !stateSource.includes('...(MODE_OPTIC_POSTURE[packet.mode]')) {
  fail('opticPacketToPersonaPacket must re-attach per-mode posture so previewed modes are not all flat idle.');
}
if (!appSource.includes('<g class="cb-eye-gaze">')) {
  fail('Concept B must wrap the optic core in cb-eye-gaze so the eyeball looks around together.');
}
if (!appSource.includes('<g class="cb-orbit-spin"><circle class="cb-orbit cb-orbit-main"')) {
  fail('The outer animated ring must have a dedicated rotating wrapper so the ring remains visibly animated while the eye assembly moves.');
}
if (!appSource.includes("setConceptBTransform(parts.gazeGroup, `translate(${x.toFixed(2)} ${y.toFixed(2)})`)")) {
  fail('Puppet gaze must translate cb-eye-gaze through the RAF eye-motion rig, not only the iris or pupil.');
}
if (!appSource.includes("setConceptBTransform(parts.iris, `translate(550 550) scale(${state.iris.toFixed(3)}) translate(-550 -550)`)") || !appSource.includes('eyeMotion.setTarget')) {
  fail('Iris transform should be smooth dilation only; gaze target belongs to cb-eye-gaze.');
}
if (!appSource.includes('<circle class="cb-eye-lens"')) {
  fail('The dark lens circle must remain in the transformed eye markup.');
}
requireAll(appSource, ['cb-bg-parallax-a', 'cb-bg-parallax-b', 'cb-core-glow', '.cb-axis, .cb-cardinal'], 'Eye motion must carry the center glow, background parallax layers, and nearby highlight/axis cues with gaze.');
requireAll(cssSource, ['.cb-bg-parallax-a', '.cb-bg-parallax-b', 'radial-gradient(circle at 50% 44.85%', 'radial-gradient(circle at 50% 58.09%', 'transition: none;'], 'Concept B background gradient must parallax with gaze via transform-only layers and preserve viewport-equivalent halo placement.');
if (cssSource.includes('radial-gradient(circle at 50% 43%') || cssSource.includes('radial-gradient(circle at 50% 61%')) {
  fail('Concept B parallax overlay gradients must compensate for the bleed inset; 43%/61% are viewport positions, not overlay-element positions.');
}
requireAll(cssSource, ['.cb-orbit-spin', 'cb-orbit-drift 22s linear infinite'], 'Outer orbit ring dash drift remains CSS; its rotation is now an anime.js loop applied via the SVG transform attribute.');
if (cssSource.includes('animation: cb-orbit-spin var(--cb-ring-period)') || cssSource.includes('.cb-eye-core {\n  transform-origin')) {
  fail('Orbit-spin rotation and eye-core breath are anime.js-driven; their CSS animation/transform-box must be removed so the JS writer does not fight (this caused ring drift before).');
}
const markBlock = blockFor('body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-mark');
const markFont = fontPx(markBlock, '.cb-mark');
if (markFont < 62 || !/width:\s*72px/.test(markBlock) || !/height:\s*72px/.test(markBlock)) {
  fail(`Caduceus mark too small: expected at least doubled 72px box / 62px font, got ${markFont}px font.`);
}

// Operational truth and display safety gates retained from prior physical acceptance.
requireAll(appSource, ["'GATEWAY OK'", "'GATEWAY WATCH'", 'FEED ${freshnessTier.toUpperCase()}', 'conceptBAttentionReason'], 'Gateway/feed/attention state must stay explicit without over-claiming soft watch states as hard down.');
if (/GATEWAY DOWN/.test(appSource)) {
  fail('Gateway DOWN must not be shown unless the backend exposes a hard-down signal; gateway_ok=false is currently only WATCH.');
}
if (serverSource.includes('Something wants attention')) {
  fail('Vague attention copy is banned. Say exactly what needs attention or keep quiet.');
}
if (appSource.includes('Replying on ${sourceName}') || appSource.includes('Planning ${sourceName} reply')) {
  fail('Reasoning/working fallback copy must not claim Hermes is replying; reserve reply language for an explicit send/final event.');
}
requireAll(appSource, ['CURRENT TURN', 'conceptBQueuedTaskCount', 'queued calmly', 'Quiet watch'], 'Bottom work cell must distinguish current turn from queued tasks with calm, non-warning copy.');
if (appSource.includes('Hermes is watching.') || appSource.includes('available tasks')) {
  fail('Local-watch copy must not read like a caution/warning banner; use calm queued/watch language.');
}
requireAll(appSource, ["amber: 'rgb(101, 243, 255)'", "hot_amber: 'rgb(137, 213, 230)'", "if (severity === 'active') return '#65f3ff'"], 'Normal active work must render with calm cyan/blue accents, not amber/red warning colors.');
requireAll(appSource, ["if (temp >= 90) return 'metric-hot temp-hot';", "if (temp >= 82) return 'metric-warn temp-warn';", "if (mode === 'cpu') return number >= 95 ? 'metric-hot' : number >= 85 ? 'metric-warn' : 'metric-ok';"], 'Normal NUC kiosk operating temperatures/CPU should not look like caution; reserve warn/hot classes for real thermal/load thresholds.');

requireAll(cssSource, ['.augury-ambient', '.augury-strand', 'width: min(50vw, 960px)', 'z-index: 1', 'clamp(13px, 0.98vw, 18px)', 'linear-gradient(to right, #000 0%, #000 62%, rgba(0, 0, 0, 0.62) 82%, transparent 100%)', '--augury-optic-protect-mask', 'ellipse 24vw 39vh at 50.5vw 49.2vh'], 'Augury overlay must span about half the display, stay behind the optic, remain desk-readable, fade toward center/right, and protect the central optic with a focused radial attenuation mask.');
if (/\.augury-ambient[\s\S]{0,700}mix-blend-mode:\s*screen/.test(cssSource)) {
  fail('Augury must not use mix-blend-mode: screen against the bright optic glow.');
}
if (serverSource.includes('override ignored:')) {
  fail('Manual override exception class names must not reach the display caption.');
}
requireAll(serverSource, ['def gateway_ok_recently', 'line_is_recent(line, minutes)', 'gateway_ok_recently(recent_gateway)'], 'Gateway status must be recency-bounded, not raw token presence over a stale log tail.');
requireAll(serverSource, ['def augury_log_tail', 'text = augury_log_tail(line)', 'safe_text = augury_clean(text, AUGURY_MAX_ITEM_CHARS)'], 'Augury items must clean timestamp/session/module prefixes before display.');
requireAll(appSource, ["title: 'CURRENT'", "title: 'STATUS'", "title: 'STATE'", "title: 'SIGNAL'"], 'Augury packet fallback labels must be operator-facing, not internal work/detail/caption/snippet keys.');
if (/title:\s*'(?:work|detail|caption|snippet)'/.test(appSource)) {
  fail('Augury fallback must not surface raw internal packet labels.');
}
requireAll(appSource, ['const MAX_STRANDS = 11', 'safe[idx] || null', "setConceptBDataset(row.strand, 'echo', 'false')"], 'Augury should keep enough strand slots but only populate real items; never duplicate echoes to fake density.');
if (/safe\[idx\s*%\s*safe\.length\]/.test(appSource)) {
  fail('Augury must not duplicate real rows with modulo indexing to fill empty strands.');
}
requireAll(cssSource, ['.cb-arc-label', 'font: 600 16px/1', 'fill: var(--cb-fg-1)'], 'Concept B telemetry arc labels must stay desk-readable and metric-identifying.');
requireAll(appSource, ['ROUTE · HEADROOM', "const unknownRouteCopy = state === 'disabled' ? 'OFF' : state === 'error' ? 'ERR' : 'UNK'"], 'Route rail must label headroom and render unknown/inactive routes explicitly instead of bare dashes.');
requireAll(cssSource, ['right: 96px', 'width: calc(48px * var(--route-headroom))', 'grid-template-columns: minmax(94px, auto) 64px', 'min-width: 64px', '[data-cb-mode="active-turn"] .cb-activity'], 'Route values must use a fixed aligned column clear of the route whisker and active turns may use only a subtle non-red body cue.');
if (/right:\s*calc\(72px \+ 118px \* var\(--route-headroom\)\)/.test(cssSource)) {
  fail('Route percentage text must not shift horizontally by headroom; keep values fixed and move only the whisker/bar.');
}
if (!serverSource.includes('actionable_warn_lines')) {
  fail('Routine provider/tool warnings must be filtered before driving the physical attention state.');
}
requireAll(serverSource, ["MCP server 'context7'", 'Honcho dialectic query failed', 'Error in post_writer', 'httpx\\.ConnectTimeout'], 'Transient Context7/Honcho/MCP reconnects must not drive CRITICAL LOCAL ISSUE on the physical display.');
requireAll(serverSource, ['Only show BLOCKED when the current', 'if blocked and work_blocked:', 'blocked card queued'], 'Queued blocked Kanban cards must stay secondary context and must not make the idle display red/yellow BLOCKED.');
if (/standing by/i.test([appSource, stateSource, mascotRuntimeSource].join('\n'))) {
  fail('Idle copy must avoid STANDING BY; use QUIET WATCH / SYSTEMS STEADY style wording.');
}
requireAll(appSource, ['safeDisplayText(value, maxLength = 64)', 'CUI', 'base64'], 'Frontend display-safe text scrubber must cover CUI and long encoded blobs');
requireAll(serverSource, ['CUI', 'base64', 'display-safe detail hidden'], 'Backend scrubber must cover CUI and long encoded blobs');

// Telemetry truthfulness and state freshness remain acceptance gates even in radial form.
requireAll(appSource, [
  'measurementValue(sys',
  'metricAvailable(cpuPct, measurements.cpu)',
  'metricAvailable(memPct, measurements.memory)',
  'metricAvailable(cpuTemp, measurements.cpu_temp_c || measurements.temp_c)',
  '((cpuTemp - 30) / 65) * 100',
  'telemetryTrend(cpuPct, cpuTemp, trends)',
  'CURRENT_WORK_MAX_AGE_SECONDS = 4 * 60',
  'displayValue !== null',
  'animateConceptBArc',
  'renderConceptBArcProgress',
  'active?.anim?.pause?.()',
  'motion.animateValue({',
], 'Radial telemetry must use truthful live measurements, fixed temp scaling, trend/freshness, 4-minute TTL, and avoid null rendering as 0');
requireAll(serverSource, ['with closing(sqlite3.connect', 'kanban_snapshot'], 'Kanban reads must close SQLite connections so the display server does not exhaust file descriptors and trip FEED LOST.');
requireAll(appSource, [
  'Queued/blocked Kanban cards are useful context',
  'const isCurrent = Boolean(work.active) && ageKnown && age <= CURRENT_WORK_MAX_AGE_SECONDS;',
], 'Queued Kanban cards must not keep expired current_work visually alive as ACTIVE TURN.');
if (appSource.includes('|| kanbanActive);')) {
  fail('Kanban activity must not override current_work TTL for ACTIVE TURN styling.');
}
if (appSource.includes("'0/0 sensors'")) {
  fail('Lost sensor feeds must not render fake 0/0 sensor values.');
}

// Touch should remain broad-zone and safe, with audio click preserved.
requireAll(appSource, [
  'classifyTouchTarget',
  'top [65,12,1835,126]',
  'center circle cx/cy/r ≈ [946,617,370]',
  'w * 0.493',
  'h * 0.482',
  'Math.min(w, h) * 0.289',
  "touch_target: 'diagnostics'",
  "touch_target: 'glance'",
  "touch_target: 'avatar'",
  "touch_target: 'bottom_control'",
  "target.touch_target === 'bottom_control'",
  'resetScreen',
  'acknowledgeCenter',
  'handleGlance',
], 'Touch handling must match the five-zone Concept B map: top diagnostics, left/right glance, center acknowledge, bottom safe reset');
requireAll(appSource, ["setTouchPosture('listening'", "setTouchPosture(muted ? 'quiet' : 'listening'"], 'Touch presence needs listening/quiet postures');
requireAll(cssSource, ['body.kiosk-mode[data-touch-posture="listening"]', 'body.kiosk-mode[data-touch-posture="quiet"]', '.cb-touch-top', '.cb-touch-bottom', 'top: 48.2vh', 'left: 84.6vw', 'top: 92.2vh'], 'Touch posture CSS states or screenshot-aligned legacy developer rail flashes missing');
requireAll(audioSource, ['installTapClick()', "document.addEventListener('pointerdown'", 'playClick()', 'lastClickAt < 60', "(params.get('touch') || '').toLowerCase() === 'off'"], 'Touch pointerdown must produce a short muted-aware audible click unless touch=off explicitly disables touch');
if (appSource.includes("showOverlayAfterReaction('work', 'Checking current work'")) {
  fail('Single avatar taps should enter listening/ready without immediately covering the character with a work overlay.');
}

// Obsidian MINIX plan functionality: file bus, manual override, and renderer-ready optic packet.
requireAll(serverSource, [
  'DISPLAY_STATE_PATH',
  'PERSONA_PACKET_PATH',
  'OPTIC_STATE_PATH',
  'PUPPET_STATE_PATH',
  'PERSONA_HISTORY_PATH',
  'MANUAL_OVERRIDE_PATH',
  'load_manual_override',
  'display_state_file_packet',
  'optic_state_packet_for',
  'persist_display_bus',
  'optic_state_packet',
  'puppet_state_packet',
  'tempfile.mkstemp',
], 'Server must implement the local display file bus, manual override, optic_state_packet contract, and backwards-compatible puppet_state_packet alias from the MINIX plan');
requireAll(mascotRuntimeSource, [
  'applyPuppetStatePacket',
  'normalizePuppetGazeTarget',
  'packet?.optic_state_packet || packet?.puppet_state_packet',
  'behaviorMode',
  'MOUTH_PATHS[puppet.mouth?.shape]',
], 'Renderer must consume the renderer-ready optic_state_packet while preserving the puppet_state_packet alias during migration');


// Single-eye optic-core contract from ChatGPT recommendation pass.
requireAll(appSource, [
  "document.body.dataset.dashboard = 'claude-concept-b'",
  'cb-outer-field',
  'cb-status-rings',
  'cb-aperture-shell',
  'cb-eye-iris',
  'cb-eye-pupil-group',
  'cb-eye-lens-contents',
  'cb-winglet',
  'cb-helmet-brow',
  'currentPacket.optic_state_packet || currentPacket.puppet_state_packet',
], 'Concept B must preserve the sparse layout while making the center a single expressive optic core.');
requireAll(cssSource, [
  '.cb-winglet',
  '.cb-helmet-brow',
  '--cb-winglet-tension',
], 'Optic core CSS must include aperture/winglet identity cues and clean clipped lens contents.');

// FPS/motion policy: production dashboard must not silently cap FPS from URL, kiosk default, or thermal telemetry.
if (/fps[=')\"]|FPS_LIMIT|applyExplicitFrameCap/.test(mascotRuntimeSource + '\n' + runtimeHtml + '\n' + xsessionSource)) {
  fail('Production dashboard must not contain fps= URL caps, FPS_LIMIT parsing, or applyExplicitFrameCap.');
}
if (!mascotRuntimeSource.includes("const PERF_MODE = (URL_PARAMS.get('perf') || 'full').toLowerCase()")) {
  fail('Kiosk runtime must default to full perf mode, not adaptive thermal throttling.');
}
if (mascotRuntimeSource.includes("return KIOSK_MODE ? 'warm' : 'full'") || mascotRuntimeSource.includes('temp >= 80') || mascotRuntimeSource.includes('temp >= 72')) {
  fail('Thermal telemetry must not silently downgrade the dashboard perf tier.');
}
if (!mascotRuntimeSource.includes('frameIntervalMs: 0')) {
  fail('Runtime perf profiles must render with uncapped requestAnimationFrame timing.');
}

// Cache bust coupling is mandatory for physical DP-2 refresh. The runtime owns the
// concrete build id; the xsession launcher and hermes-display CLI must derive from
// that source instead of copying a stale hardcoded URL token.
const buildIdMatch = appSource.match(/const\s+DISPLAY_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
if (!buildIdMatch) fail('Runtime app must declare DISPLAY_BUILD_ID.');
const expectedAssetVersion = buildIdMatch[1];
if (!runtimeHtml.includes(`?v=${expectedAssetVersion}`) || !appSource.includes(`__HERMES_DISPLAY_BUILD_ID = DISPLAY_BUILD_ID`)) {
  fail(`Runtime HTML and app build id must share ${expectedAssetVersion}.`);
}
requireAll(xsessionSource, ['BUILD_ID="${PERSONAL_DISPLAY_BUILD_ID:-$($SCRIPT_DIR/hermes-display build-id)}"', 'query.append((\'v\', build))'], 'Physical xsession launcher must derive the kiosk URL build id from the runtime');
requireAll(displayCliSource, ['verify)', 'fix)', 'systemctl is-active --quiet "$SYSTEM_SERVICE"', 'sudo -n systemctl restart "$SYSTEM_SERVICE"', 'DISPLAY_BUILD_ID'], 'hermes-display CLI must verify/fix the real service-owned physical kiosk');
if (!appSource.includes('createConceptBVisibleRendererAdapter') || !appSource.includes('hiddenRendererSkipped: true') || !appSource.includes("document.querySelector('.shell')?.remove()")) {
  fail('Landscape Concept B kiosk must skip the hidden legacy mascot renderer and remove the hidden shell DOM.');
}
// The vendored Zod global must load before state.js so optic-packet validation uses real Zod.
if (!runtimeHtml.includes('vendor/zod.global.js')) {
  fail('Runtime HTML must load vendor/zod.global.js so the browser runtime validates optic packets with Zod (not just the fallback).');
}
if (/state\.frame\s*%\s*3/.test(appSource)) {
  fail('Concept B gaze parallax must update every RAF frame while debugging optic coupling.');
}
if (/cb-eye-dot-[abc][\s\S]{0,220}translate\(/.test(cssSource)) {
  fail('Concept B catchlights must not use independent translate() animations.');
}
if (/cb-eye-dot-pulse-[abc]/.test(cssSource)) {
  fail('Concept B catchlight opacity shimmer must be owned by the anime.js driftDots loop, not independent CSS keyframes.');
}
requireAll(appSource, ['d.omin', 'd.omax', "setConceptBStyleProperty(d.el, 'opacity'", "setConceptBAttribute(d.el, 'cx'", "setConceptBAttribute(d.el, 'cy'"], 'Concept B catchlight drift must keep position and opacity shimmer in one anime.js loop with cached writers.');
requireAll(appSource, [
  'const scanSweep = hud.querySelector(\'.cb-eye-scan\')',
  "setConceptBTransform(parts.scanSweep, `rotate(${sweepAngle.toFixed(2)} 550 550)`)",
  'state.mode === \'searching\' || state.special === \'scan_sweep\'',
  "window.matchMedia?.('(prefers-reduced-motion: reduce)')",
  'cb-eye-scan-band',
  'x="546" y="376" width="8" height="174"',
  'cb-eye-scan-line',
], 'Searching mode must use a continuous centered radar sweep around the optic pupil, not a one-shot or off-center CSS half-sweep');
if (cssSource.includes('animation: cb-eye-scan-sweep') || cssSource.includes('@keyframes cb-eye-scan-sweep')) {
  fail('Concept B radar sweep must be driven by the RAF optic rig so it stays centered on the pupil; remove CSS transform animation.');
}
requireAll(cssSource, [
  'data-optic-mode="searching"] .cb-eye-scan',
  '.cb-eye-scan-line',
  'will-change: transform',
], 'Searching mode must keep the scan beam visible and transform-ready in the MINIX landscape runtime');
for (const cls of ['cb-aperture-shell', 'cb-winglet-left', 'cb-winglet-right', 'cb-helmet-brow', 'cb-eye-lens', 'cb-eye-ring', 'cb-eye-grid', 'cb-eye-scan', 'cb-eye-pupil-group', 'cb-eye-lid-top', 'cb-eye-lid-bottom', 'cb-eye-lens-contents', 'cb-eye-lid-group']) {
  const gazeIdx = appSource.indexOf('class="cb-eye-gaze"');
  const closeIdx = appSource.indexOf('</g>\n        </g>\n        <g data-cb-arc="cpu"', gazeIdx);
  const clsIdx = appSource.indexOf(cls, gazeIdx);
  if (gazeIdx === -1 || closeIdx === -1 || clsIdx === -1 || clsIdx > closeIdx) fail(`${cls} must remain inside the Concept B optic gaze group.`);
}
if (!appSource.includes('installConceptBOpticDebug') || !appSource.includes('__HERMES_CONCEPT_B_EYE_MOTION')) {
  fail('Concept B must expose opticDebug/build-id and forced gaze hooks for physical QA.');
}
requireAll(appSource, [
  'installConceptBBackgroundParallax',
  'cb-bg-parallax cb-bg-parallax-a',
  'cb-bg-parallax cb-bg-parallax-b',
  'parts.bgA',
  'parts.bgB',
  'translate3d(',
  'setConceptBTransform(',
], 'Concept B gaze background must use compositor transform-driven parallax blobs, not per-frame full-page radial-gradient repaint.');
if (/parts\.root\.style\.setProperty\('--cb-bg-gaze-[xy]/.test(appSource)) {
  fail('Concept B must not mutate root --cb-bg-gaze-* every RAF frame; that repaints full-page radial gradients on the MINIX.');
}
if (/body\.kiosk-mode\.kiosk-landscape\.claude-concept-b\s*\{[\s\S]*?var\(--cb-bg-gaze/.test(cssSource)) {
  fail('Concept B body background must not depend on per-frame --cb-bg-gaze vars; move gaze parallax to transform-only overlay layers.');
}
requireAll(cssSource, [
  '.cb-bg-parallax',
  '.cb-bg-parallax-a',
  '.cb-bg-parallax-b',
  'will-change: transform',
  'transform: translate3d(0, 0, 0)',
], 'Concept B background parallax layers must be compositor-friendly fixed overlays.');
if (!appSource.includes('setConceptBAttribute(') || !appSource.includes('setConceptBStyleProperty(')) {
  fail('Concept B RAF loop must use change-aware DOM writers to avoid redundant SVG/style invalidation.');
}
if (!appSource.includes('field.__lastTickBucket') || !appSource.includes('field.__lastMoteBucket')) {
  fail('Concept B field instrumentation must bucket tiny per-frame changes so it preserves motion without rewriting every SVG node every RAF.');
}
if (/__lastMoteBucket[\s\S]{0,400}Math\.round\(seconds\s*\*\s*60\)/.test(appSource)) {
  fail('Concept B mote bucket must throttle below per-frame; seconds * 60 changes every RAF and defeats the bucket.');
}
requireAll(cssSource, ['.cb-eye-gaze,', '.cb-eye-pupil-group {', 'will-change: transform;'], 'Hot Concept B gaze and pupil transform targets must retain compositor promotion hints.');
requireAll(xsessionSource, ['--disable-backgrounding-occluded-windows', 'configure_audio', 'PERSONAL_DISPLAY_AUDIO_VOLUME', 'alsa_output\\.pci-0000_00_1f\\.3\\.hdmi-stereo'], 'Physical kiosk launcher must prevent Chromium from treating the kiosk as occluded/backgrounded and must pin SF10T/HDMI audio.');
requireAll(displayCliSource, ['check_audio', 'configure_audio', 'HERMES_DISPLAY_AUDIO_VOLUME', 'setfacl -m', 'OK audio sink'], 'hermes-display CLI must verify and repair physical kiosk audio routing.');
if (!appSource.includes('field.__tracePool')) {
  fail('Concept B gaze traces must reuse SVG path nodes instead of create/remove DOM nodes during RAF.');
}
if (!appSource.includes('id="cb-eye-lens-clip"') || !appSource.includes('clip-path="url(#cb-eye-lens-clip)"')) {
  fail('Concept B inner optic contents and lids must be clipped to the lens boundary.');
}
if (!cssSource.includes('.cb-eye-calibration {\n  display: none;') || !cssSource.includes('.cb-orbit-faint {\n  display: none;')) {
  fail('Concept B faint inner calibration/faint orbit rings must stay hidden; Brian flagged them as graphic artifacts.');
}
if (!cssSource.includes('body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-eye-lens') || !cssSource.includes('fill: rgb(3, 7, 9);')) {
  fail('Concept B lens must be opaque so field axes/rings cannot bleed through as seams or faint arcs.');
}
if (!cssSource.includes('.cb-eye-lid {\n  display: block;') || !cssSource.includes('fill: rgba(3, 7, 10, 0.84);')) {
  fail('Concept B lids must be filled clipped aperture shutters, not hidden or loose stroked curves.');
}
requireAll(appSource, [
  'cb-field-instrumentation',
  'cb-field-focus-rings',
  'cb-field-compass',
  'cb-field-motes',
  'cb-field-trace',
  'cb-field-notice-pulse',
  'installConceptBFieldInstrumentation',
  'renderConceptBFieldMotion',
  '--cb-field-intensity',
  '--cb-field-focus',
  '--cb-field-alert',
], 'Concept B must render a living non-telemetry field around the optic.');
requireAll(cssSource, [
  '.cb-field-instrumentation',
  '.cb-field-ring',
  '.cb-field-tick',
  '.cb-field-mote',
  '.cb-field-trace-path',
  '.cb-field-tool-precision',
  '.cb-field-blocked-brackets',
], 'Concept B field instrumentation must have visible styling for rings, ticks, motes, gaze trace, tool precision, and blocked brackets.');
for (const removed of ['cb-eye-cornea', 'cb-eye-inner', 'cb-eye-horizon', 'cb-eye-terminal-reflection']) {
  if (appSource.includes(`class="${removed}`)) fail(`${removed} must not be rendered in the active Concept B lens; it reads as a stray artifact on DP-2.`);
}
if (!serverSource.includes('def __init__(self, *args, **kwargs):') || !serverSource.includes('directory=str(ROOT)')) {
  fail('Preview server must pass directory=str(ROOT); service cwd alone caused 404s for static src assets.');
}

console.log('OK kiosk recommendation regression checks.');
