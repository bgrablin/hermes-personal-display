#!/usr/bin/env node
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBuildId, currentGeneratedBuildId } from './generate-build-id.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const presenceSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'presence.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const stateSource = fs.readFileSync(path.join(projectRoot, 'src', 'state.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'hermes_display_server.py'), 'utf8');
const privacySource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display_state', 'privacy.py'), 'utf8');
const logSnapshotSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display_state', 'log_snapshot.py'), 'utf8');
const collectorSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display_state', 'collector.py'), 'utf8');
const resolverSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display_state', 'resolver.py'), 'utf8');
const runtimeHtml = fs.readFileSync(path.join(projectRoot, 'src', 'character-runtime.html'), 'utf8');
const buildIdSource = fs.readFileSync(path.join(projectRoot, 'src', 'generated', 'build-id.js'), 'utf8');
const xsessionSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'xsession-minix-kiosk.sh'), 'utf8');
const displayCliSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'hermes-display'), 'utf8');
const telemetryWatchdogSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display-telemetry-watchdog.sh'), 'utf8');
const runtimeChecksSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'display_runtime_checks.py'), 'utf8');
const captureModesSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'capture-mode-artifacts.cjs'), 'utf8');
const captureDashboardSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'capture-current-dashboard.sh'), 'utf8');
const capturePublicSource = fs.readFileSync(path.join(projectRoot, 'scripts', 'capture-public-dashboard.cjs'), 'utf8');
const audioSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'audio.js'), 'utf8');
const touchFxSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'touch-fx.js'), 'utf8');
const entertainmentSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'entertainment.js'), 'utf8');
const envExampleSource = fs.readFileSync(path.join(projectRoot, 'deploy', 'systemd-user', 'hermes-personal-display.env.example'), 'utf8');
const watchSequencesSource = fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'watch-sequences.js'), 'utf8');
const sequencesJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src', 'mascot', 'sequences.json'), 'utf8'));

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
  'applyConceptBOptic',
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
  './mascot/touch-fx.js?v=',
  './mascot/entertainment.js?v=',
  './mascot/watch-sequences.js?v=',
  './mascot/app.js?v=',
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
  "fetch('./mascot/sequences.json'",
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
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-line', 34],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-source', 17],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-cell strong', 24],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-cell em', 16],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-arc-value', 28],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-attention', 18],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-top-alert', 24],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-route-label strong', 24],
  ['body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-route-label span', 24],
];
for (const [selector, minPx] of readableSelectors) {
  const px = fontPx(blockFor(selector), selector);
  if (px < minPx) fail(`${selector} regressed to ${px}px; expected >= ${minPx}px for MINIX desk-distance readability.`);
}

if (appSource.includes('♆')) {
  fail('Top-left identity mark must be Hermes caduceus-aligned, not the old trident/Neptune glyph.');
}
requireAll(xsessionSource, [
  'URL="${PERSONAL_DISPLAY_URL:-$($SCRIPT_DIR/hermes-display url)}"',
], 'Physical X session must derive its default launch URL from hermes-display url.');
requireAll(xsessionSource, [
  'PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"',
  'case ":$PATH:" in',
  '*":$HOME/.local/bin:"*)',
  'export PATH',
], 'Physical X session must expose user-installed Herdr tools to the monitor source.');
requireAll(xsessionSource, [
  'for _ in $(seq 1 40); do',
  "grep -Ei 'touch|SiS HID'",
  'touch input not detected after 10 seconds',
  'xinput --map-to-output "$device_name" "$DISPLAY_OUTPUT"',
  'Coordinate Transformation Matrix',
  'done <<<"$touch_inputs"',
], 'Physical X session must wait for the USB touch controller and persist the inverted DP-2 coordinate mapping.');
requireAll(displayCliSource, [
  'canonical_url_status()',
  'orientation=landscape',
  'augury=1',
  'OK live Chromium URL canonical',
  'URL match:',
], 'hermes-display must assert and report the canonical operator URL shape.');
requireAll(displayCliSource, [
  'verify_render_path()',
  'DISPLAY_RENDERER=',
  'chromium_kiosk_instance_count()',
  'OK Chromium kiosk browser instance count: 1',
  'managed-herdr-monitor',
  'MONITOR_COMPOSITOR=',
  'OK lightweight Herdr Monitor renderer:',
  'OK Herdr Monitor source: isolated tmux source;',
  'OK visible render:',
  'scrot --overwrite "$shot"',
  'managed-chromium --profile "$CHROME_PROFILE"',
  'framebuffer',
  'EXPECTED_SYSTEM_SERVICE="hermes-personal-display-minix.service"',
  'verify-render) verify_render_path',
], 'hermes-display must verify the selected managed renderer and non-blank live framebuffer pixels.');
requireAll(telemetryWatchdogSource, [
  'SCRIPT_DIR="$(cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"',
  'HERMES_DISPLAY="${PERSONAL_DISPLAY_COMMAND:-$SCRIPT_DIR/hermes-display}"',
  '"$HERMES_DISPLAY" verify-render',
  'RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"',
  'write_state_file()',
  'python3 "$RUNTIME_CHECKS" layout',
  'render_status=$?',
  'non-restartable fault',
  'if sudo -n systemctl restart -- "$SYSTEM_SERVICE"; then',
], 'Display watchdog recovery must be working-directory independent and scoped to the managed render path.');
requireAll(runtimeChecksSource, [
  'def output_layout_matches(',
  'active_segment = line.split(" (", 1)[0]',
  'def inspect_framebuffer(',
  'def managed_chromium_processes(',
  'def managed_herdr_monitor_display(',
  'def _is_monitor_compositor(',
  'if "--kiosk" not in args',
], 'Display runtime checks must parse active rotation, framebuffer geometry, and managed renderer roots.');
if (telemetryWatchdogSource.includes('${XDG_RUNTIME_DIR:-/tmp}')) {
  fail('Display watchdog state must never fall back to predictable files directly under /tmp.');
}
if (displayCliSource.includes("pgrep -af '[c]hrom")) {
  fail('Display verification must inspect managed Chromium browser roots, not URL-matching command lines.');
}
requireAll(appSource, [
  'conceptBTopAlert',
  'conceptBAuguryPresence',
  "params.get('auguryText')",
  "enabled: false, reason: 'family-audience'",
  'PRIVATE AUGURY',
], 'Canonical runtime must include top alert and private Augury safeguards.');
// Audience/family parsing is unified: parseFamilyAudience is the single parser for every
// accepted family route (audience=family|theater, family=1|true|yes, view=theater), and
// every consumer — top-level familyAudience, applyPageMode, and the mode-toggle URL
// rewrite — must go through it. Divergent re-parsing in applyPageMode once dropped
// family=1 and let ?kiosk=1&family=1 boot with a transient operator audience.
const audienceParserMatch = appSource.match(/function parseFamilyAudience\(params\) \{([\s\S]*?)\n  \}/);
if (!audienceParserMatch) fail('Runtime must define the shared parseFamilyAudience(params) audience parser.');
requireAll(audienceParserMatch[1], [
  "['family', 'theater'].includes((params.get('audience') || '').toLowerCase())",
  "['1', 'true', 'yes'].includes((params.get('family') || '').toLowerCase())",
  "(params.get('view') || '').toLowerCase() === 'theater'",
], 'parseFamilyAudience must accept all family routes: audience=family|theater, family=1|true|yes, view=theater');
if (!appSource.includes('const familyAudience = parseFamilyAudience(urlParams);')) {
  fail('Top-level familyAudience must come from the shared parseFamilyAudience parser.');
}
const applyPageModeMatch = appSource.match(/function applyPageMode\(\) \{([\s\S]*?)\n  \}/);
if (!applyPageModeMatch) fail('Runtime must define applyPageMode.');
if (!applyPageModeMatch[1].includes('parseFamilyAudience(params)')) {
  fail('applyPageMode must derive family audience from the shared parser so kiosk=1&family=1 boots family-first.');
}
if (/\.get\(['"](?:audience|view|family)['"]\)/.test(applyPageModeMatch[1])) {
  fail('applyPageMode must not re-parse audience/family/view params; divergent parsing caused the family=1 boot flash.');
}
const audienceParseSites = (appSource.match(/\['family', 'theater'\]\.includes/g) || []).length;
if (audienceParseSites !== 1) {
  fail(`Audience param parsing must exist exactly once (inside parseFamilyAudience); found ${audienceParseSites} sites.`);
}
if (!appSource.includes("const FAMILY_AUDIENCE_PARAMS = Object.freeze(['audience', 'family', 'view'])")) {
  fail('FAMILY_AUDIENCE_PARAMS must list every accepted audience param so mode-toggle URL rewrites clear them all.');
}
const familyUrlBuilderMatch = appSource.match(/function familyModeTargetUrl\(toFamily\) \{([\s\S]*?)\n  \}/);
if (!familyUrlBuilderMatch) fail('Runtime must define the shared familyModeTargetUrl(toFamily) URL rewriter.');
requireAll(familyUrlBuilderMatch[1], [
  'FAMILY_AUDIENCE_PARAMS.forEach((key) => url.searchParams.delete(key))',
  "url.searchParams.set('audience', 'family')",
], 'familyModeTargetUrl must clear every audience param via FAMILY_AUDIENCE_PARAMS and re-enter family mode via audience=family');
if (!cssSource.includes('.cb-top-alert') || !cssSource.includes('body.family-theater.augury-preview .augury-ambient')) {
  fail('Canonical CSS must include top alert ribbon and hard-hide Augury in family theater mode.');
}
if (!appSource.includes("(params.get('touch') || 'fun').toLowerCase()")) {
  fail('Default touch effects must stay at touch=fun; do not reduce default touch behavior.');
}
if (!appSource.includes('conceptBAuguryPresence(live, mode, freshnessTier, gatewayText)')) {
  fail('Augury presence must be recomputed from live operational state so alerts can hide it.');
}
if (!cssSource.includes('[data-cb-arc][data-severity="hot"] .cb-arc-value')) {
  fail('Hot metric arc values must get high-contrast canonical treatment, not only taste=1 treatment.');
}
if (!cssSource.includes('[data-cb-arc][data-inspect]:focus { outline: none; }')) {
  fail('Interactive SVG metrics must use an in-theme focus marker, not a rectangular browser outline.');
}
if (!cssSource.includes('font: 640 46px/1.18') || !cssSource.includes('font: 560 38px/1.18')) {
  fail('Activity headlines must reserve cap and descender space inside the two-line clamp.');
}
if (appSource.includes('LOAD WATCH') || appSource.includes('LOAD HIGH') || appSource.includes('CPU HEADROOM')) {
  fail('CPU usage must not drive ugly top-alert text or CPU-headroom warning copy.');
}
if (!appSource.includes('FEED LOST') || !appSource.includes('GATEWAY WATCH')) {
  fail('Top alert labels must still cover feed lost and gateway watch states.');
}
if (!appSource.includes("includeBodyText\n              ? auguryClean(raw?.text") && appSource.includes("text: auguryClean(raw?.text || '', MAX_TEXT_CHARS)")) {
  fail('Augury must not show raw body text by default; require auguryText=1 for raw excerpts.');
}
if (!appSource.includes("const includeBodyText = ['1', 'true', 'yes'].includes((params.get('auguryText') || '').toLowerCase());")) {
  fail('Augury body text must require the explicit auguryText=1 private-diagnostic opt-in.');
}
if (!appSource.includes("if (familyAudience) return 'hidden';")) {
  fail('Family/theater mode must force Augury presence hidden.');
}
if (!appSource.includes("['blocked_user_task', 'critical_local_issue'].includes(state)) return 'subdued'")) {
  fail('Blocked and critical states must keep Augury readable but subordinate to the alert.');
}
if (!appSource.includes("['active-turn', 'active_turn', 'reasoning', 'planning', 'tool_shell', 'writing', 'searching']")) {
  fail('Active work/search/reasoning states must subdue Augury rather than leaving it dominant.');
}
requireAll(cssSource, [
  '.augury-head',
  '.augury-meta',
  '.augury-heading',
  '.augury-feed-status',
], 'Augury activity rail must keep readable headings, observation metadata, and feed freshness.');
if (!appSource.includes('raw?.safeText === true')) {
  fail('Augury safe-text rows must be explicitly client-flagged; raw feed text stays gated behind auguryText=1.');
}
if (!appSource.includes('safeText: false')) {
  fail('Feed log items must have safeText stripped so a malformed payload cannot bypass the auguryText gate.');
}
if (!appSource.includes('!prefersReducedMotion && !document.hidden') || cssSource.includes('animation: augury-vertical-flow')) {
  fail('Augury must animate only new observations, respect reduced motion, and never continuously fade readable text.');
}
if (!appSource.includes("state === 'blocked_user_task') return { label: 'WAITING FOR BRIAN'")) {
  fail('Blocked current work must elevate a WAITING FOR BRIAN top alert.');
}
if (!cssSource.includes('white-space: normal') || !cssSource.includes('-webkit-line-clamp: 2')) {
  fail('Current-work panel must support controlled two-line wrapping instead of nowrap clipping.');
}
requireAll(touchFxSource, ["family ? 'fun' : 'inspect'", 'HermesOperatorTouch.install'], 'Operator touch must default to inspection while family play stays available.');
if (!appSource.includes('ensureConceptBEyeMotion') || !appSource.includes('renderConceptBEyeMotion') || !appSource.includes('conceptBEyeMicroMotion')) {
  fail('Concept B eye gaze must use the RAF motion rig for fluid saccades, not one-second snapped updates.');
}
if (appSource.includes('pupilGroup.removeAttribute(\'transform\')')) {
  fail('Concept B pupil highlights must not be left fixed while only the pupil radius changes; scale the pupil group instead.');
}
if (!appSource.includes("setConceptBTransform(parts.pupilGroup, `translate(550 550) scale(${effPupil.toFixed(3)}) translate(-550 -550)`)") || !appSource.includes("setConceptBAttribute(parts.pupil, 'r', '44')")) {
  fail('Concept B pupil dilation/blink must scale the full pupil group so catchlights/specular dots remain attached to the pupil.');
}
// Blink is the optic's signature motion. It must read as an upper-lid-dominant ocular closure
// over a stable iris/pupil, not as a symmetric shutter, iris zoom, or lower-right dart.
// It is still driven by an anime.js cadence loop (state.blink), while the RAF flush keeps
// gaze/iris/pupil transforms posture-only and lets the asymmetrical lids occlude the eye.
if (!appSource.includes('function armBlink()') || !appSource.includes('blink: 1, duration:') || appSource.includes('blinkHoldX') || appSource.includes('blinkZoom') || !appSource.includes('const lidFrac = Math.max(Math.max(0, state.lid - lidWiden - socialLift), blink);') || !appSource.includes('const effPupil = Math.max(0.60, Math.min(1.35, state.pupil + (Number(state.pupilFlash) || 0) + (Number(state.hippus) || 0) + (Number(state.regard) || 0)))') || !appSource.includes('const topCurve = 314 + 346 * topAmount;') || !appSource.includes('const bottomCurve = 792 - 132 * bottomAmount;') || !appSource.includes('renderConceptBLids(parts.lidTop, parts.lidBottom, lidFrac, Math.max(0, state.upperBias + lidFollow - socialLift), state.lowerBias + lidFollow * 0.45, x)')) {
  fail('Concept B must blink via an anime.js cadence loop: upper-lid-dominant closure over stable iris/pupil on blink.interval_ms.');
}
// anime.js must actually drive the optic cadence + expressive transients, not just be loaded.
requireAll(appSource, [
  'createMotionAdapter',
  'function armBlink()', 'function armBreath()', 'function armRing()', 'function armScan()',
  'motion.animateValue(',
  'setConceptBTransform(parts.orbitSpin', 'state.ringAngle', 'state.scanAngle', 'setConceptBTransform(parts.core', 'state.breath',
  'ripple(pulseCircle', 'fireModeTransition',
], 'anime.js must drive optic cadence (blink/breath/ring/scan) and one-shot transients (notice/complete/blocked/touch).');
requireAll(appSource, [
  'const CONCEPT_B_CATCHLIGHTS = Object.freeze([',
  'Object.freeze({ x: 540, y: 536, px: 0.18, py: 0.14 })',
  'Object.freeze({ x: 566, y: 562, px: 0.11, py: 0.10 })',
  'parts.catchlights?.forEach((dot, index) => {',
  'const profile = CONCEPT_B_CATCHLIGHTS[index] || CONCEPT_B_CATCHLIGHTS[1]',
  'setConceptBTransform(dot, `translate(${(-x * profile.px).toFixed(2)} ${(-y * profile.py).toFixed(2)})`)',
], 'Catchlights must remain attached to deterministic room-light profiles with bounded gaze counter-parallax, not free-running drift.');
// Involuntary vitals layer: hippus/sigh/regard/spark plus lid-gaze coupling are what make
// the optic read as alive rather than instrumented. Each has a parking/eligibility rule
// that must not silently regress.
requireAll(appSource, [
  'const CONCEPT_B_VITALS = Object.freeze({',
  'hippusAmp:', 'doubleBlinkChance:', 'sighScale:', 'regardPupil:', 'lidGazeFollow:',
  "VITALS_PARKED_MODES = ['blocked', 'critical', 'degraded_offline']",
  'function updateVitals(now, seconds)',
  'updateVitals(now, seconds);',
  'if (prefersReducedMotion || VITALS_PARKED_MODES.includes(state.mode)) { state.hippus = 0; return; }',
  '(Number(state.hippus) || 0) + (Number(state.regard) || 0)',
  'state.upperBias + lidFollow',
  'viewer: [0, -6]',
], 'Optic vitals (hippus/sigh/regard/spark + lid-gaze follow) must stay wired: parked in stopped modes, zero under reduced motion, composed into the pupil/lids by the single RAF writer.');
const vitalNumber = (name) => {
  const m = appSource.match(new RegExp(`${name}:\\s*(-?[0-9.]+)`));
  return m ? Number(m[1]) : NaN;
};
const hippusAmp = vitalNumber('hippusAmp');
const regardPupil = vitalNumber('regardPupil');
const doubleBlinkChance = vitalNumber('doubleBlinkChance');
if (!(hippusAmp > 0 && hippusAmp <= 0.04)) {
  fail(`hippusAmp must stay subtle (0 < amp <= 0.04); got ${hippusAmp}. Visible pupil throbbing reads as malfunction, not life.`);
}
if (!(regardPupil > 0 && regardPupil <= 0.12)) {
  fail(`regardPupil must stay a subtle interest swell (0 < swell <= 0.12); got ${regardPupil}.`);
}
if (!(doubleBlinkChance > 0 && doubleBlinkChance <= 0.3)) {
  fail(`doubleBlinkChance must stay occasional (0 < chance <= 0.3); got ${doubleBlinkChance}. Frequent double blinks read as a tic.`);
}
// Per-mode posture must reach the eye on the deterministic ?mode= preview path, not just live.
if (!stateSource.includes('MODE_OPTIC_POSTURE') || !stateSource.includes('...(MODE_OPTIC_POSTURE[packet.mode]')) {
  fail('opticPacketToPersonaPacket must re-attach per-mode posture so previewed modes are not all flat idle.');
}
if (!appSource.includes('<g class="cb-eye-socket">') || !appSource.includes('<g class="cb-eye-window" clip-path="url(#cb-eye-lens-clip)">') || !appSource.includes('<g class="cb-eye-gaze">')) {
  fail('Concept B must keep a fixed eye socket/window around the independently moving cb-eye-gaze iris/pupil assembly.');
}
if (!appSource.includes('<g class="cb-orbit-spin"><circle class="cb-orbit cb-orbit-main"')) {
  fail('The outer animated ring must have a dedicated rotating wrapper so it remains animated independently of the inner-eye gaze assembly.');
}
if (!appSource.includes("setConceptBTransform(parts.gazeGroup, `translate(${x.toFixed(2)} ${y.toFixed(2)})`)")) {
  fail('Optic gaze must translate the clipped cb-eye-gaze iris/pupil assembly through the RAF eye-motion rig.');
}
if (!appSource.includes("setConceptBTransform(parts.iris, `translate(550 550) scale(${state.iris.toFixed(3)}) translate(-550 -550)`)") || !appSource.includes('eyeMotion.setTarget')) {
  fail('Iris transform should be smooth dilation only; gaze translation belongs to the nested cb-eye-gaze assembly.');
}
if (!appSource.includes('<circle class="cb-eye-lens"')) {
  fail('The dark lens circle must remain anchored in the fixed eye socket markup.');
}
requireAll(appSource, ['cb-bg-parallax-a', 'cb-bg-parallax-b', 'cb-core-glow', '.cb-axis, .cb-cardinal'], 'Eye motion must carry the center glow, background parallax layers, and nearby highlight/axis cues with gaze.');
requireAll(cssSource, ['.cb-bg-parallax-a', '.cb-bg-parallax-b', 'radial-gradient(circle at 50% 44.85%', 'radial-gradient(circle at 50% 58.09%', 'transition: none;'], 'Concept B background gradient must parallax with gaze via transform-only layers and preserve viewport-equivalent halo placement.');
if (cssSource.includes('radial-gradient(circle at 50% 43%') || cssSource.includes('radial-gradient(circle at 50% 61%')) {
  fail('Concept B parallax overlay gradients must compensate for the bleed inset; 43%/61% are viewport positions, not overlay-element positions.');
}
requireAll(cssSource, ['.cb-presence-surface', '.cb-iris-crypt', '.cb-preview-proof'], 'Presence must render its material surface and label simulations.');
if (cssSource.includes('cb-orbit-drift 22s linear infinite')) fail('Retired constant-speed orbit drift must not return.');
if (appSource.includes('cb-activity-trace')) fail('Presence must not imply an ordered pipeline.');
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
requireAll(presenceSource, ['themeForObservation', "thinking: 'rgb(160, 176, 255)'", "working: 'rgb(92, 216, 192)'"], 'Activity tint must remain distinct from waiting and error colors.');
requireAll(appSource, ["if (temp >= 90) return 'metric-hot temp-hot';", "if (temp >= 82) return 'metric-warn temp-warn';", "if (mode === 'cpu') return number >= 95 ? 'metric-hot' : number >= 85 ? 'metric-warn' : 'metric-ok';"], 'Normal NUC kiosk operating temperatures/CPU should not look like caution; reserve warn/hot classes for real thermal/load thresholds.');

requireAll(cssSource, ['.augury-ambient', '.augury-strand', '.augury-list', 'left: 64px', 'top: 162px', 'width: 430px'], 'Augury must occupy a readable left rail aligned with the provider rail, clear of the optic.');
if (/\.augury-ambient[\s\S]{0,700}mix-blend-mode:\s*screen/.test(cssSource)) {
  fail('Augury must not use mix-blend-mode: screen against the bright optic glow.');
}
if (serverSource.includes('override ignored:')) {
  fail('Manual override exception class names must not reach the display caption.');
}
requireAll(serverSource, ['def gateway_ok_recently', 'line_is_recent(line, minutes)', 'gateway_ok_recently(recent_gateway)'], 'Gateway status must be recency-bounded, not raw token presence over a stale log tail.');
requireAll(serverSource + logSnapshotSource, ['def augury_log_tail', 'text = augury_log_tail(line)', 'safe_text = augury_clean(text, AUGURY_MAX_ITEM_CHARS)'], 'Augury items must clean timestamp/session/module prefixes before display.');
requireAll(appSource, ["current ? 'NOW'", "title: 'DETAIL'", "title: 'OBSERVED STATE'", "title: 'AWAITING ACTIVITY'"], 'Augury packet fallback labels must be operator-facing, not internal work/detail/caption/snippet keys.');
if (/title:\s*'(?:work|detail|caption|snippet)'/.test(appSource)) {
  fail('Augury fallback must not surface raw internal packet labels.');
}
requireAll(appSource, ['const MAX_STRANDS = 5', 'const visible = safe;', 'const unique = new Map();', "setConceptBDataset(row.strand, 'echo', 'false')"], 'Augury must bound and deduplicate real observations; never duplicate echoes to fake density.');
if (/safe\[idx\s*%\s*safe\.length\]/.test(appSource)) {
  fail('Augury must not duplicate real rows with modulo indexing to fill empty strands.');
}
requireAll(cssSource, ['.cb-arc-label', 'font: 600 16px/1', 'fill: var(--cb-fg-1)'], 'Concept B telemetry arc labels must stay desk-readable and metric-identifying.');
requireAll(appSource, [
  'ROUTE · HEADROOM',
  "const unknownRouteCopy = state === 'disabled' ? 'OFF' : state === 'error' ? 'ERR' : 'UNK'",
  "{ id: 'xai-oauth', label: 'XAI'",
  'for (let i = 0; i < 5; i += 1)',
  "state === 'inferred' && provider.reachable !== false ? 'READY'",
  "setConceptBDataset(row, 'hasHeadroom', knownHeadroom ? 'true' : 'false')",
  'formatRouteCredits(creditsUsed)',
  "const creditsUsedSummary = knownCreditsUsed ? `${formatRouteCredits(creditsUsed)}` : ''",
  "p.credits_used ?? ''",
], 'Route rail must render five honest provider rows, including XAI, distinguish unmetered READY routes from measured percentages, and show confirmed Copilot credits when no limit exists.');
requireAll(cssSource, ['right: 64px', 'width: 430px', 'width: 104px', 'transform: scaleX(var(--route-headroom))', 'transition: transform 600ms ease, opacity 450ms ease', 'grid-template-columns: minmax(118px, auto) 80px', 'min-width: 76px', 'body.kiosk-mode.kiosk-landscape.claude-concept-b[data-cb-mode="active-turn"] .cb-activity', '[data-cb-mode="active-turn"] .cb-activity', 'background: transparent', 'box-shadow: none', 'font: 640 46px/1.18'], 'Route values must use a fixed aligned column clear of the route whisker, animate the whisker via transform instead of width, and active turns must promote body-scoped activity text without a box that blocks the optic.');
if (!cssSource.includes('body.kiosk-mode.kiosk-landscape.claude-concept-b[data-cb-mode="active-turn"] .cb-activity')) {
  fail('Active-turn activity panel CSS must target body[data-cb-mode] so the promoted activity card actually applies.');
}
if (/right:\s*calc\(72px \+ 118px \* var\(--route-headroom\)\)/.test(cssSource)) {
  fail('Route percentage text must not shift horizontally by headroom; keep values fixed and move only the whisker/bar.');
}
requireAll(appSource, [
  "setConceptBDataset(row, 'headroomTier', headroomTier)",
  "setConceptBDataset(row, 'collapsed', collapsed ? 'true' : 'false')",
  "setConceptBDataset(root, 'railQuiet', collapsedCount >= 3 ? 'true' : 'false')",
  'const ROUTE_HEADROOM_LOW_THRESHOLD',
  'playConceptBStatusTick(entry.labelWrap',
  'playConceptBStatusTick(entry.glyph',
  'cb-route-track',
], 'Route rail provider state/active/low-headroom changes must read as throttled event ticks over a fixed headroom reference track, and unknown/idle rows must collapse.');
requireAll(cssSource, [
  '.cb-route-track',
  '.cb-route-row[data-state="unknown"] .cb-route-track',
  '.cb-route-row[data-state="confirmed"]',
  '.cb-route-row[data-collapsed="true"]',
  '.cb-route-rail[data-rail-quiet="true"]',
  '.cb-route-glyph',
  'color: currentColor',
  '[data-headroom-tier="low"] .cb-route-label span',
  'transform: translateY(calc(var(--route-active-y, -100px) + 45px))',
  'transition: transform 650ms ease, opacity 450ms ease',
], 'Route headroom must render fill-vs-track with honest hiding for unknown routes, amber confirmed rows/dots, collapsed idle rows, low-band ochre values, and a transform-driven active hairline.');
if (!resolverSource.includes('actionable_warn_lines')) {
  fail('Routine provider/tool warnings must be filtered before driving the physical attention state.');
}
requireAll(resolverSource, ["MCP server 'context7'", 'Honcho dialectic query failed', 'Error in post_writer', 'httpx\\.ConnectTimeout'], 'Transient Context7/Honcho/MCP reconnects must not drive CRITICAL LOCAL ISSUE on the physical display.');
requireAll(resolverSource, ['Only show BLOCKED when the current', 'if blocked and work_blocked:', 'blocked card queued'], 'Queued blocked Kanban cards must stay secondary context and must not make the idle display red/yellow BLOCKED.');
if (/standing by/i.test([appSource, stateSource].join('\n'))) {
  fail('Idle copy must avoid STANDING BY; use QUIET WATCH / SYSTEMS STEADY style wording.');
}
requireAll(appSource, ['safeDisplayText(value, maxLength = 64)', 'base64', 'display-safe detail hidden'], 'Frontend display-safe text scrubber must cover long encoded blobs');
requireAll(privacySource, ['base64', 'display-safe detail hidden'], 'Backend scrubber must cover long encoded blobs');

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
requireAll(cssSource, [
  '[data-cb-arc][data-severity="warn"] .cb-arc-fill',
  '[data-cb-arc][data-severity="warn"] .cb-arc-dot',
  '[data-cb-arc][data-severity="hot"] .cb-arc-fill',
  '[data-cb-arc][data-severity="hot"] .cb-arc-dot',
], 'Thermal arc severity states must style the SVG line and endpoint dot separately.');
if (/\[data-cb-arc\]\[data-severity="(?:warn|hot)"\]\s+\.cb-arc-fill,\s*\n\s*body\.kiosk-mode\.kiosk-landscape\.claude-concept-b\s+\[data-cb-arc\]\[data-severity="(?:warn|hot)"\]\s+\.cb-arc-dot[\s\S]{0,180}fill:\s*var\(--cb-(?:ochre|rust)\)/.test(cssSource)) {
  fail('Thermal arc fill paths must not inherit yellow/red SVG fill; filled paths create large closed-shape artifacts. Keep .cb-arc-fill fill:none and color only its stroke.');
}
requireAll(collectorSource, ['with closing(sqlite3.connect', 'kanban_snapshot'], 'Kanban reads must close SQLite connections so the display server does not exhaust file descriptors and trip FEED LOST.');
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
requireAll(cssSource, ['body.kiosk-mode[data-touch-posture="listening"]', 'body.kiosk-mode[data-touch-posture="quiet"]', '.cb-touch-top', '.cb-touch-bottom', 'top: 48.2vh', 'left: 84.6vw', 'top: 92.2vh'], 'Touch posture CSS states or screenshot-aligned developer rail flashes missing');
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
requireAll(appSource, [
  'currentPacket.optic_state_packet || currentPacket.puppet_state_packet',
  'function applyConceptBOptic',
  "setConceptBDataset(hud, 'opticMode'",
  "setConceptBDataset(hud, 'opticSpecial'",
], 'Concept B renderer must consume optic_state_packet while preserving the puppet_state_packet alias during migration');


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
if (/fps[=')\"]|FPS_LIMIT|applyExplicitFrameCap/.test(runtimeHtml + '\n' + xsessionSource)) {
  fail('Production dashboard must not contain fps= URL caps, FPS_LIMIT parsing, or applyExplicitFrameCap.');
}

// Cache bust coupling is mandatory for physical DP-2 refresh. A generated content
// hash owns the concrete build id; the runtime, xsession launcher, and
// hermes-display CLI must derive from that source instead of copying stale tokens.
const buildIdMatch = buildIdSource.match(/window\.__HERMES_DISPLAY_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
if (!buildIdMatch) fail('Generated build id source must publish window.__HERMES_DISPLAY_BUILD_ID. Run `npm run generate:build-id`.');
const expectedAssetVersion = buildIdMatch[1];
const recomputedBuildId = computeBuildId();
if (currentGeneratedBuildId() !== recomputedBuildId) {
  fail(`Generated build id is stale: expected ${recomputedBuildId}, found ${currentGeneratedBuildId() || 'missing'}. Run npm run generate:build-id.`);
}
if (!appSource.includes("const DISPLAY_BUILD_ID = String(window.__HERMES_DISPLAY_BUILD_ID || 'dev-unversioned')") || !appSource.includes('__HERMES_DISPLAY_BUILD_ID = DISPLAY_BUILD_ID')) {
  fail('Runtime app must read DISPLAY_BUILD_ID from generated window.__HERMES_DISPLAY_BUILD_ID with a dev-unversioned fallback.');
}
// Every first-party static asset in the runtime HTML must carry ?v=<generated build id>
// so one generator run force-refreshes every first-party module on the physical
// kiosk. Vendor bundles may keep their own pinned ?v= (they change on re-vendoring,
// not on app builds), but must never ship unversioned.
const runtimeAssetRefs = [...runtimeHtml.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((ref) => ref.startsWith('./'));
const firstPartyRefs = runtimeAssetRefs.filter((ref) => !ref.startsWith('./vendor/'));
const vendorRefs = runtimeAssetRefs.filter((ref) => ref.startsWith('./vendor/'));
if (firstPartyRefs.length < 13 || vendorRefs.length < 4) {
  fail(`Runtime asset extraction regressed: found ${firstPartyRefs.length} first-party / ${vendorRefs.length} vendor refs; expected >= 13 / >= 4. Update the guard if the asset list intentionally changed.`);
}
for (const required of ['./styles.css', './mascot/app.js', './generated/build-id.js', './generated/display-contract.js']) {
  if (!firstPartyRefs.some((ref) => ref.split('?')[0] === required)) {
    fail(`Runtime HTML must still reference ${required} as a first-party static asset.`);
  }
}
const wrongFirstParty = firstPartyRefs.filter((ref) => ref.split('?')[1] !== `v=${expectedAssetVersion}`);
if (wrongFirstParty.length) {
  fail(`First-party assets must use ?v=${expectedAssetVersion} (generated build id) so one generator run invalidates kiosk caches; offenders: ${wrongFirstParty.join(', ')}`);
}
const unversionedVendor = vendorRefs.filter((ref) => !/^v=[\w.-]+$/.test(ref.split('?')[1] || ''));
if (unversionedVendor.length) {
  fail(`Vendor assets must keep an explicit ?v= cache pin; offenders: ${unversionedVendor.join(', ')}`);
}
requireAll(xsessionSource, ['BUILD_ID="${PERSONAL_DISPLAY_BUILD_ID:-$($SCRIPT_DIR/hermes-display build-id)}"', 'query.append((\'v\', build))'], 'Physical xsession launcher must derive the kiosk URL build id from the runtime');
requireAll(displayCliSource, ['verify)', 'fix)', 'systemctl is-active --quiet -- "$SYSTEM_SERVICE"', 'sudo -n systemctl restart -- "$SYSTEM_SERVICE"', 'DISPLAY_BUILD_ID'], 'hermes-display CLI must verify/fix the real service-owned physical kiosk');
requireAll(captureModesSource, [
  "src', 'generated', 'build-id.js'",
  'window\\.__HERMES_DISPLAY_BUILD_ID',
  'PERSONAL_DISPLAY_BUILD_ID',
  '--print-build-id',
], 'Mode artifact capture must derive its cache-bust build id from the generated build-id.js source and support a lightweight print smoke path.');
requireAll(captureDashboardSource, [
  'capture_public()',
  'node "$PUBLIC_CAPTURE" "$REPO_OUT"',
  '`--repo-only` never captures or publishes live operator state.',
], 'Repository screenshot capture must route through the synthetic public generator.');
requireAll(capturePublicSource, [
  "caption: { text: 'Synthetic dashboard preview.' }",
  "source: 'demo data'",
  'assertPublicText(visibleText)',
  "await page.route('**/api/hermes-state**'",
  "await page.route('**/api/augury-feed**'",
], 'Public screenshot generation must use bounded synthetic state and reject private text shapes.');
if (/const DISPLAY_BUILD_ID = ['"][^'"]+['"]/.test(captureModesSource) || captureModesSource.includes("src', 'mascot', 'app.js'")) {
  fail('Mode artifact capture must not scrape the removed literal DISPLAY_BUILD_ID from src/mascot/app.js.');
}
if (!appSource.includes('createConceptBVisibleRendererAdapter') || !appSource.includes('hiddenRendererSkipped: true') || !appSource.includes("document.querySelector('.shell')?.remove()")) {
  fail('Concept B kiosk must skip the retired SVG renderer and remove the fallback shell DOM.');
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
  fail('Concept B catchlights must not shimmer through independent CSS opacity keyframes.');
}
requireAll(appSource, [
  'const CONCEPT_B_CATCHLIGHTS = Object.freeze([',
  'parts.catchlights?.forEach((dot, index) => {',
  "setConceptBStyleProperty(hud, '--cb-catchlight-opacity'",
], 'Concept B catchlights must use stable room-light profiles with schema-driven opacity.');
if (!cssSource.includes('opacity: var(--cb-catchlight-opacity, 0.72)')) {
  fail('Concept B catchlight CSS must consume the schema-driven --cb-catchlight-opacity value.');
}
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
const socketIdx = appSource.indexOf('class="cb-eye-socket"');
const windowIdx = appSource.indexOf('class="cb-eye-window"', socketIdx);
const gazeIdx = appSource.indexOf('class="cb-eye-gaze"', windowIdx);
const gazeEndIdx = appSource.indexOf('<!-- cb-eye-gaze:end -->', gazeIdx);
const windowEndIdx = appSource.indexOf('<!-- cb-eye-window:end -->', gazeEndIdx);
const socketEndIdx = appSource.indexOf('<!-- cb-eye-socket:end -->', windowEndIdx);
if (![socketIdx, windowIdx, gazeIdx, gazeEndIdx, windowEndIdx, socketEndIdx].every((index) => index !== -1) ||
    !(socketIdx < windowIdx && windowIdx < gazeIdx && gazeIdx < gazeEndIdx && gazeEndIdx < windowEndIdx && windowEndIdx < socketEndIdx)) {
  fail('Concept B source must nest the moving gaze group inside the clipped eye window and fixed socket boundaries.');
}
const socketTagIdx = appSource.lastIndexOf('<g ', socketIdx);
const socketBoundary = '<!-- cb-eye-socket:end -->';
const socketMarkup = appSource.slice(socketTagIdx, socketEndIdx + socketBoundary.length);
const groupStack = [];
let windowAncestors = null;
let gazeAncestors = null;
for (const match of socketMarkup.matchAll(/<g\b[^>]*>|<\/g>/g)) {
  const tag = match[0];
  if (tag === '</g>') {
    if (!groupStack.length) fail('Concept B eye socket SVG group nesting closes outside its source boundary.');
    groupStack.pop();
    continue;
  }
  const classes = (tag.match(/\bclass="([^"]*)"/)?.[1] || '').split(/\s+/).filter(Boolean);
  const ancestors = groupStack.flatMap((group) => group.classes);
  if (classes.includes('cb-eye-window')) windowAncestors = ancestors;
  if (classes.includes('cb-eye-gaze')) gazeAncestors = ancestors;
  groupStack.push({ classes });
}
if (socketTagIdx === -1 || groupStack.length || !windowAncestors?.includes('cb-eye-socket') || !gazeAncestors?.includes('cb-eye-window')) {
  fail('Concept B source must structurally contain the clipped eye window in the socket and the moving gaze group in that window.');
}
for (const cls of ['cb-eye-iris', 'cb-eye-lens-contents', 'cb-iris-lattice', 'cb-eye-grid', 'cb-eye-scan', 'cb-eye-pupil-group']) {
  const clsIdx = appSource.indexOf(cls, gazeIdx);
  if (gazeIdx === -1 || gazeEndIdx === -1 || clsIdx === -1 || clsIdx >= gazeEndIdx) fail(`${cls} must remain inside the moving Concept B iris/pupil gaze group.`);
}
for (const cls of ['cb-aperture-shell', 'cb-winglet-left', 'cb-winglet-right', 'cb-helmet-brow', 'cb-eye-lens', 'cb-eye-ring', 'cb-eye-glass-sheen', 'cb-eye-glass-crescent', 'cb-eye-lid-top', 'cb-eye-lid-bottom', 'cb-eye-lid-group']) {
  const clsIdx = appSource.indexOf(cls, socketIdx);
  const insideGaze = clsIdx > gazeIdx && clsIdx < gazeEndIdx;
  if (socketIdx === -1 || socketEndIdx === -1 || clsIdx === -1 || clsIdx >= socketEndIdx || insideGaze) fail(`${cls} must remain anchored in the fixed Concept B eye socket outside the moving gaze group.`);
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
if (!appSource.includes('field.__lastTickBucket') || !appSource.includes('field.cadence.moteMs')) {
  fail('Concept B field must retain change-aware tick updates and respect the selected orbital render budget.');
}
requireAll(cssSource, ['.cb-eye-gaze,', '.cb-eye-pupil-group {', 'will-change: transform;'], 'Hot Concept B gaze and pupil transform targets must retain compositor promotion hints.');
requireAll(xsessionSource, ['--disable-backgrounding-occluded-windows', 'configure_audio', 'PERSONAL_DISPLAY_AUDIO_VOLUME', 'PERSONAL_DISPLAY_AUDIO_SINK'], 'Physical kiosk launcher must prevent Chromium from treating the kiosk as occluded/backgrounded and must use env-configured SF10T/HDMI audio.');
requireAll(envExampleSource, ['PERSONAL_DISPLAY_AUDIO_SINK=alsa_output.pci-0000_00_1f.3.hdmi-stereo', 'PERSONAL_DISPLAY_OUTPUT=DP-2', 'HERMES_DISPLAY_COPILOT_ACCOUNT=github-login', 'HERMES_DISPLAY_COPILOT_PLAN=pro'], 'Display/audio hardware defaults and optional Copilot billing scope must live in the env template, not be hard-coded into runtime logic.');
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
const lensDepth = appSource.match(/<radialGradient id="cb-lens-depth"[^>]*>([\s\S]*?)<\/radialGradient>/)?.[1] || '';
const opaqueLensStops = [...lensDepth.matchAll(/<stop offset="[\d.]+%" stop-color="#[\da-f]{6}"\s*\/>/gi)];
if (!cssSource.includes('body.kiosk-mode.kiosk-landscape.claude-concept-b .cb-eye-lens') ||
    !cssSource.includes('fill: url(#cb-lens-depth);') || opaqueLensStops.length !== 3 ||
    lensDepth.replace(/<stop offset="[\d.]+%" stop-color="#[\da-f]{6}"\s*\/>/gi, '').trim()) {
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

requireAll(presenceSource, ['cb-iris-filament', 'cb-iris-crypt', 'surfacePaths', 'installSurface'], 'Presence material geometry must be installed.');

// Iris lattice: procedural state-aware material inside the lens. The anime.js irisAngle
// scalar is the only rotation source and the RAF flush is its only transform writer; CSS
// must not animate or re-origin the lattice (the orbit-ring drift lesson). Blocked,
// critical, and degraded_offline park the lattice (period 0) so a halted optic reads as
// actually stopped machinery.
requireAll(appSource, [
  'cb-iris-lattice',
  'installConceptBIrisLattice',
  'IRIS_LATTICE_PERIOD_MS',
  'irisLatticePeriodMs',
  'setConceptBTransform(parts.irisLattice',
  'window.HermesPresence.buildIris',
  'flareLattice',
], 'Concept B lens must render the procedural iris lattice driven by the single-writer motion rig.');
if (!/blocked:\s*0,\s*\n\s*critical:\s*0,\s*\n\s*degraded_offline:\s*0/.test(appSource)) {
  fail('Iris lattice must park (period 0) for blocked, critical, and degraded_offline modes.');
}
requireAll(cssSource, [
  '.cb-iris-lattice',
  '.cb-iris-filament',
  '.cb-iris-collar',
  '.cb-iris-limbal',
  '--cb-lattice-flare',
], 'Iris lattice must be styled with accent-tinted filaments and flare-aware group opacity.');
if (/\.cb-iris[^{]*\{[^}]*(animation:|transform-box)/.test(cssSource)) {
  fail('Iris lattice rotation/light must stay with the anime.js scalars and the RAF writer; CSS animation or transform-box on .cb-iris-* re-introduces drift.');
}

// Family mode hold toggle: the on-screen mode switch must stay a deliberate
// hold-gated gesture that rewrites only the URL audience params. Entering family
// mode layers audience=family over the live operator query (so the return hold
// restores the exact operator setup), and no interaction state is ever persisted.
// The hold is directional: returning to operator mode is the privacy boundary
// (it restores operator chrome and Augury), so the exit hold must be materially
// longer than the harmless entry hold.
requireAll(appSource, [
  'function installFamilyModeToggle()',
  'FAMILY_ENTER_HOLD_MS = ',
  'FAMILY_EXIT_HOLD_MS = ',
  'const activeHoldMs = familyAudience ? FAMILY_EXIT_HOLD_MS : FAMILY_ENTER_HOLD_MS;',
  'enterHoldMs: FAMILY_ENTER_HOLD_MS',
  'exitHoldMs: FAMILY_EXIT_HOLD_MS',
  'activeHoldMs / REDUCED_HOLD_STEPS',
  'HOLD_CANCEL_DISTANCE_PX',
  'FAMILY_AUDIENCE_PARAMS.forEach((key) => url.searchParams.delete(key))',
  "url.searchParams.set('audience', 'family')",
  'window.location.replace(familyModeTargetUrl(!familyAudience))',
  'cb-mode-hold',
  "familyAudience ? 'OPERATOR HOLD' : 'FAMILY HOLD'",
  "familyAudience ? 'OPERATOR MODE' : 'FAMILY MODE'",
  'chip.setPointerCapture?.(event.pointerId)',
  'window.__HERMES_FAMILY_TOGGLE',
], 'Family mode toggle must be a hold-gated URL rewrite control with both directions labeled.');
const familyEnterHoldMatch = appSource.match(/const\s+FAMILY_ENTER_HOLD_MS\s*=\s*(\d+);/);
const familyExitHoldMatch = appSource.match(/const\s+FAMILY_EXIT_HOLD_MS\s*=\s*(\d+);/);
if (!familyEnterHoldMatch || !familyExitHoldMatch) {
  fail('Family mode toggle must declare numeric FAMILY_ENTER_HOLD_MS and FAMILY_EXIT_HOLD_MS constants.');
} else {
  const enterHoldMs = Number(familyEnterHoldMatch[1]);
  const exitHoldMs = Number(familyExitHoldMatch[1]);
  if (enterHoldMs < 800) {
    fail(`FAMILY_ENTER_HOLD_MS (${enterHoldMs}) must stay a deliberate hold of at least 800ms.`);
  }
  if (exitHoldMs < enterHoldMs * 2) {
    fail(`FAMILY_EXIT_HOLD_MS (${exitHoldMs}) must be at least 2x FAMILY_ENTER_HOLD_MS (${enterHoldMs}); the operator return is the privacy boundary and needs the materially longer hold.`);
  }
}
const familyToggleStart = appSource.indexOf('function installFamilyModeToggle()');
const familyToggleEnd = appSource.indexOf('window.__HERMES_FAMILY_TOGGLE');
const familyToggleBlock = appSource.slice(familyToggleStart, familyToggleEnd);
if (/localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.sendBeacon|fetch\(/.test(familyToggleBlock)) {
  fail('Family mode toggle must not persist or transmit interaction state; mode lives in the URL only.');
}
if (!familyToggleBlock.includes('event.stopPropagation();')) {
  fail('Family mode toggle must stop pointer propagation so touch FX and legacy zone handlers never see mode presses.');
}
if (!familyToggleBlock.includes('if (prefersReducedMotion) reducedStep(1);')) {
  fail('Family mode toggle must use discrete reduced-motion progress steps instead of the continuous RAF ring sweep.');
}
requireAll(cssSource, [
  '.cb-mode-hold',
  '.cb-mode-hold-ring',
  '--cb-hold-progress',
  'conic-gradient(var(--cb-accent) calc(var(--cb-hold-progress, 0) * 360deg)',
  '[data-hold-state="holding"]',
  '[data-hold-state="engaged"]',
  'family-theater .cb-mode-hold',
  'opacity: 0.52',
  'family-theater .cb-activity',
], 'Family hold chip must render the progress ring, stay modestly discoverable in family mode, and keep a friendly non-operator activity card.');
if (!appSource.includes("familyAudience ? 'SPARKLE MODE · HOLD CORNER TO LEAVE'")) {
  fail('Family mode must expose a gentle hold-corner tip without operator chrome labels.');
}
if (/\.cb-mode-hold[^{]*\{[^}]*animation:/.test(cssSource)) {
  fail('Family hold chip must have no idle keyframe animation; the only motion is the press-driven ring fill.');
}

console.log('OK kiosk recommendation regression checks.');
