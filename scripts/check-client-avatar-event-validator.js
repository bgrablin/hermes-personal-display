#!/usr/bin/env node
/*
 * Deterministic executable gate for the browser/client avatar-event validator in
 * src/mascot/app.js. This uses a tiny VM DOM/EventSource harness so the
 * client validation path runs without adding a browser/runtime dependency.
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_JS = path.join(ROOT, 'src', 'mascot', 'app.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor(selector = 'div') {
    this.selector = selector;
    this.children = [];
    this.childNodes = this.children;
    this.dataset = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.attributes = new Map();
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  replaceChildren(...children) { this.children = children; this.childNodes = this.children; }
  remove() { this.removed = true; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 320, bottom: 480, width: 320, height: 480 }; }
  querySelector() { return new FakeElement('nested'); }
  querySelectorAll(selector) {
    if (selector === 'span') {
      return ['left', 'center', 'right'].map((zone) => {
        const el = new FakeElement('span');
        el.dataset.zone = zone;
        return el;
      });
    }
    return [];
  }
}

function createDocument() {
  const cache = new Map();
  const body = new FakeElement('body');
  const documentElement = new FakeElement('html');
  const get = (selector) => {
    if (!cache.has(selector)) cache.set(selector, new FakeElement(selector));
    return cache.get(selector);
  };
  return {
    title: '',
    body,
    documentElement,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    querySelector: (selector) => get(selector),
    querySelectorAll: () => [],
  };
}

class FakeEventSource {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.listeners = new Map();
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  emit(type, payload) {
    const message = { data: JSON.stringify(payload) };
    for (const handler of this.listeners.get(type) || []) handler(message);
  }
}

class FakeRenderer {
  constructor() {
    this.ingested = [];
    this.handlers = new Map();
  }
  setPacket(packet) { this.packet = packet; }
  triggerIntent() { return { label: 'test intent', duration: 250 }; }
  isFrozen() { return false; }
  setFrozen(value) { this.frozen = value; }
  on(type, handler) { this.handlers.set(type, handler); }
  getDebugState() {
    return {
      state: 'idle_watchful',
      poseChannel: { rootY: 0 },
      gazeChannel: { targetName: 'center', mode: 'hold', holdUntilMs: 0 },
      fxChannel: { intensity: 0 },
      intent: null,
      motionBudget: null,
    };
  }
  ingestAvatarEvent(event) {
    this.ingested.push(event);
    return { ok: true, event: event.event };
  }
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((item) => item !== handler));
  }
  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }
}

function makeContext() {
  const document = createDocument();
  const performance = { now: () => Date.now() };
  const eventListeners = new Map();
  const window = {
    document,
    location: { search: '?kiosk=1' },
    innerWidth: 320,
    innerHeight: 480,
    EventSource: FakeEventSource,
    HermesDisplayStates: { NUDGES: {} },
    HermesAudio: { isMuted: () => false },
    HermesDisplayState: {
      PRESETS: {
        idle_watchful: { mood: 'idle_watchful', skin: 'retro-robot-core', caption: { text: 'quiet' }, live: { freshness: { tier: 'fresh' } } },
        thinking_focused: { mood: 'thinking_focused', skin: 'retro-robot-core' },
        healthy_smug: { mood: 'healthy_smug', skin: 'retro-robot-core' },
        blocked_annoyed: { mood: 'blocked_annoyed', skin: 'retro-robot-core' },
        night_sleepy: { mood: 'night_sleepy', skin: 'retro-robot-core' },
      },
      DISPLAY_PRESETS: {},
      clone,
      normalizePersonaPacket: (packet) => clone(packet),
      deriveAdaptiveMotion: () => ({
        float_duration_ms: 3000,
        blink_interval_ms: 4000,
        eye_glow: 0.5,
        accent_intensity: 0.5,
        alert_pulse: 0,
        wing_flap: 0,
        breath: 0.4,
        reduced_motion: false,
        thermal: 'cool',
        severity: 'normal',
      }),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: (type, handler) => {
      if (!eventListeners.has(type)) eventListeners.set(type, []);
      eventListeners.get(type).push(handler);
    },
    dispatchEvent: (event) => {
      for (const handler of eventListeners.get(event.type) || []) handler(event);
      return true;
    },
  };

  function CustomEvent(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }

  return vm.createContext({
    window,
    document,
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
    performance,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    Set,
    Map,
    RegExp,
    Error,
    CustomEvent,
    EventTarget: FakeEventTarget,
    EventSource: FakeEventSource,
    fetch: () => Promise.reject(new Error('fetch disabled in validator harness')),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
  });
}

function validAvatarEvent() {
  return {
    schema_version: '0.1.0',
    id: 'client-validator-valid-1',
    event: 'assistant.tool_started',
    occurred_at: new Date(Date.now() + 60_000).toISOString(),
    source: 'hermes-local',
    boundary: 'localhost_only',
    privacy: 'display_safe_intent',
    ttl_ms: 120000,
    priority: 'normal',
    display: {
      intent: 'tool_active',
      label: 'Checking display',
      visual_kind: 'shell',
      glyph: 'terminal',
      intensity: 0.5,
      side: 'center',
    },
    sequence: 1,
    correlation_id: 'client-validator-1',
    meta: { tool_kind: 'shell' },
  };
}

function invalidCases(base) {
  return [
    ['docs/private label', (event) => { event.display.label = 'docs/private'; }],
    ['src/private/config label', (event) => { event.display.label = 'src/private/config'; }],
    ['prompt-shaped label', (event) => { event.display.label = 'user prompt: private task'; }],
    ['log-shaped label', (event) => { event.display.label = 'ERROR: private failure'; }],
    ['secret-shaped label', (event) => { event.display.label = 'token=' + 'abcdefghijklm' + 'nopqrstuvwxyz123456'; }],
    ['unsafe source path', (event) => { event.source = 'src/private/config'; }],
    ['unsafe source log', (event) => { event.source = 'ERROR: private failure'; }],
    ['unknown top-level field', (event) => { event.private_doc = 'meeting notes'; }],
    ['bad sequence', (event) => { event.sequence = '1'; }],
    ['unsafe correlation_id', (event) => { event.correlation_id = 'src/private/config'; }],
    ['secret-shaped correlation_id', (event) => { event.correlation_id = 'token=' + 'abcdefghijklm' + 'nopqrstuvwxyz123456'; }],
  ].map(([label, mutate]) => {
    const event = clone(base);
    mutate(event);
    return [label, event];
  });
}

function loadApp() {
  FakeEventSource.instances = [];
  const context = makeContext();
  const tracePath = path.join(ROOT, 'src/mascot/presence.js');
  vm.runInContext(fs.readFileSync(tracePath, 'utf8'), context, { filename: tracePath });
  const source = fs.readFileSync(APP_JS, 'utf8');
  vm.runInContext(source, context, { filename: APP_JS });
  const eventSource = FakeEventSource.instances[0];
  assert(eventSource, 'app.js did not create the kiosk EventSource avatar-event bus');
  assert(context.window.HermesDisplayRuntime?.avatarEvents, 'app.js did not expose avatar event debug state');
  return { context, eventSource };
}

function main() {
  const { context, eventSource } = loadApp();
  const base = validAvatarEvent();

  eventSource.emit(base.event, base);
  let debug = context.window.HermesDisplayRuntime.avatarEvents();
  assert(debug.accepted === 1, `valid client avatar event was not accepted: ${JSON.stringify(debug)}`);
  assert(debug.dropped === 0, `valid client avatar event was dropped: ${JSON.stringify(debug)}`);
  assert(debug.recent[0]?.label === base.display.label, 'accepted event label was not retained as display-safe recent state');

  for (const [label, event] of invalidCases(base)) {
    const before = context.window.HermesDisplayRuntime.avatarEvents();
    eventSource.emit(event.event, event);
    debug = context.window.HermesDisplayRuntime.avatarEvents();
    assert(debug.accepted === before.accepted, `${label} was accepted by client validator`);
    assert(debug.dropped === before.dropped + 1, `${label} did not increment client drop counter: ${JSON.stringify(debug)}`);
    assert(debug.lastError && debug.lastError !== 'event bus unavailable', `${label} did not record a validator rejection reason`);
  }

  console.log(`OK client avatar event validator negative cases=${invalidCases(base).length}`);
}

main();
