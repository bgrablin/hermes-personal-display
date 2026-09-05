import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as XState from 'xstate';
import * as Zod from 'zod';

const root = path.resolve(import.meta.dirname, '..');

function runScripts(files, windowExtras = {}) {
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
    window: windowExtras,
  });
  let expandedFiles = files.includes('src/state.js') && !files.includes('src/generated/display-contract.js')
    ? ['src/generated/display-contract.js', ...files]
    : [...files];
  const needsModePresets = (expandedFiles.includes('src/mascot/behavior-machine.js') || expandedFiles.includes('src/state.js'))
    && !expandedFiles.includes('src/mascot/mode-presets.js');
  if (needsModePresets) expandedFiles = ['src/mascot/mode-presets.js', ...expandedFiles];
  for (const file of expandedFiles) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context.window;
}

describe('adopted stack contracts', () => {
  for (const runtime of ['xstate', 'fallback']) {
    it(`applies lifecycle snapshots from every prior mode (${runtime})`, () => {
      const window = runScripts(['src/mascot/behavior-machine.js'], runtime === 'xstate' ? { XState } : {});
      const behavior = window.HermesBehaviorMachine;
      const cases = [
        ['assistant.started', undefined, 'notice'],
        ['assistant.tool_started', 'shell', 'tool_shell'],
        ['assistant.tool_started', 'searching', 'searching'],
        ['assistant.tool_started', 'reading', 'reading'],
        ['assistant.tool_started', 'patching', 'writing'],
        ['assistant.tool_started', 'planning', 'reasoning'],
        ['assistant.tool_started', 'unknown', 'tool_shell'],
        ['assistant.tool_finished', undefined, 'reasoning'],
        ['assistant.waiting_on_user', undefined, 'waiting_user'],
        ['assistant.final_started', undefined, 'writing'],
        ['assistant.final_complete', undefined, 'complete'],
      ];
      for (const initial of behavior.MODES) {
        for (const [event, visual_kind, expected] of cases) {
          const service = behavior.createBehaviorService({ behavior: initial, health: 'degraded', quiet: 'night', privacy_display: 'sensitive' });
          service.sendAll(behavior.behaviorEventsForAvatarEvent({ event, display: { visual_kind } }));
          expect(service.mode, `${initial} + ${event}/${visual_kind}`).toBe(expected);
          expect(service.overlays).toEqual({ health: 'degraded', quiet: 'night', privacy: 'sensitive' });
          service.stop?.();
        }
      }
    });
  }

  function assertAdaptiveMotionBoundaries(samples, systemForValue) {
    const window = runScripts(['src/state.js']);
    const base = { breath: 0.4, wing_flap: 0.2 };
    const scaleByTier = { cool: 1, warm: 0.7, hot: 0.42, critical: 0.36 };
    const results = samples.map(({ value, thermal, reducedMotion }) => {
      const motion = window.HermesDisplayState.deriveAdaptiveMotion({
        state_preset: 'quiet_watch',
        motion: base,
        live: {
          freshness: { tier: 'fresh' },
          resolver: { display_state: 'quiet_watch' },
          system: systemForValue(value),
        },
      });

      expect(motion.thermal, `${value} thermal tier`).toBe(thermal);
      expect(motion.reduced_motion, `${value} reduced-motion policy`).toBe(reducedMotion);
      expect(motion.breath, `${value} breath scale`).toBeCloseTo(base.breath * scaleByTier[thermal], 8);
      expect(motion.wing_flap, `${value} wing scale`).toBeCloseTo(base.wing_flap * scaleByTier[thermal], 8);
      expect(motion.breath).toBeGreaterThanOrEqual(0.06);
      expect(motion.breath).toBeLessThanOrEqual(base.breath);
      expect(motion.wing_flap).toBeGreaterThanOrEqual(0.01);
      expect(motion.wing_flap).toBeLessThanOrEqual(base.wing_flap);
      return motion;
    });

    for (let index = 1; index < results.length; index += 1) {
      expect(results[index].breath, `breath sample ${index} must not increase`).toBeLessThanOrEqual(results[index - 1].breath);
      expect(results[index].wing_flap, `wing sample ${index} must not increase`).toBeLessThanOrEqual(results[index - 1].wing_flap);
    }
  }

  it('holds adaptive motion policy just below and at temperature boundaries', () => {
    assertAdaptiveMotionBoundaries([
      { value: 85.99, thermal: 'cool', reducedMotion: false },
      { value: 86, thermal: 'warm', reducedMotion: false },
      { value: 91.99, thermal: 'warm', reducedMotion: false },
      { value: 92, thermal: 'hot', reducedMotion: true },
      { value: 95.99, thermal: 'hot', reducedMotion: true },
      { value: 96, thermal: 'critical', reducedMotion: true },
    ], (value) => ({ cpu_temp_c: value }));
  });

  it('does not mistake a busy multicore host for a thermal emergency', () => {
    assertAdaptiveMotionBoundaries([
      { value: .949, thermal: 'cool', reducedMotion: false },
      { value: .95, thermal: 'warm', reducedMotion: false },
      { value: 1, thermal: 'warm', reducedMotion: false },
    ], (value) => ({ cpu: value, load_average_1m: 12, temp_c: 65 }));
  });

  it('retains the old thermal policy only in the conservative profile', () => {
    const window = runScripts(['src/state.js'], { location: { search: '?performance=conservative' } });
    const motion = window.HermesDisplayState.deriveAdaptiveMotion({ live: { system: { temp_c: 80 } } });
    expect(motion.thermal).toBe('hot');
    expect(motion.reduced_motion).toBe(true);
  });

  it('exposes HermesModePresets with consistent mode-to-preset and preset-to-mode mappings', () => {
    const window = runScripts(['src/mascot/mode-presets.js']);
    const mp = window.HermesModePresets;

    expect(mp.MODES).toContain('idle_watch');
    expect(mp.MODES).toContain('degraded_offline');
    expect(mp.MODES).toHaveLength(Object.keys(mp.MODE_TO_PRESET).length);

    expect(mp.modeToPreset('idle_watch')).toBe('quiet_watch');
    expect(mp.modeToPreset('reasoning')).toBe('reasoning');
    expect(mp.modeToPreset('tool_shell')).toBe('working');
    expect(mp.modeToPreset('searching')).toBe('working');
    expect(mp.modeToPreset('writing')).toBe('working');
    expect(mp.modeToPreset('waiting_user')).toBe('waiting_input');
    expect(mp.modeToPreset('blocked')).toBe('blocked');
    expect(mp.modeToPreset('complete')).toBe('completed');
    expect(mp.modeToPreset('degraded_offline')).toBe('degraded_offline');
    expect(mp.modeToPreset('unknown_mode')).toBe('quiet_watch');
    expect(mp.modeToPreset('unknown_mode', 'blocked')).toBe('blocked');

    expect(mp.presetToMode('quiet_watch')).toBe('idle_watch');
    expect(mp.presetToMode('working')).toBe('tool_shell');
    expect(mp.presetToMode('feed_stale')).toBe('degraded_offline');
    expect(mp.presetToMode('night_watch')).toBe('idle_watch');
    expect(mp.presetToMode('critical')).toBe('blocked');
    expect(mp.presetToMode('unknown_preset')).toBe('idle_watch');
    expect(mp.presetToMode('unknown_preset', 'reasoning')).toBe('reasoning');

    expect(mp.modeFromPacket({ behavior_mode: 'blocked' })).toBe('blocked');
    expect(mp.modeFromPacket({ state_preset: 'working' })).toBe('tool_shell');
    expect(mp.modeFromPacket({ state_preset: 'feed_stale' })).toBe('degraded_offline');
    expect(mp.modeFromPacket({ state_preset: 'night_watch' })).toBe('idle_watch');
    expect(mp.modeFromPacket({})).toBe('idle_watch');

    expect(mp.packetForMode('tool_shell', {})).toMatchObject({
      behavior_mode: 'tool_shell',
      state_preset: 'working',
    });
    expect(mp.packetForMode('idle_watch', {})).toMatchObject({
      behavior_mode: 'idle_watch',
      state_preset: 'quiet_watch',
    });

    for (const mode of mp.MODES) {
      const preset = mp.modeToPreset(mode);
      expect(preset).toBeTruthy();
      const roundTrip = mp.presetToMode(preset);
      expect(mp.MODES).toContain(roundTrip);
    }
  });

  it('validates and clamps optic state packets', () => {
    const window = runScripts(['src/state.js']);
    const result = window.HermesDisplayState.validateOpticStatePacket({
      mode: 'tool_shell',
      attention: { target: 'tool' },
      optic: { aperture_open: 2, pupil_x: -3, pupil_y: 3, ring_motion_budget: 4 },
      caption: { text: 'safe', visibility: 'visible' },
    });

    expect(result.ok).toBe(true);
    expect(result.validator).toBe('fallback');
    expect(result.packet.optic).toMatchObject({
      aperture_open: 1,
      pupil_x: -1,
      pupil_y: 1,
      ring_motion_budget: 1,
    });
  });

  it('uses Zod-backed optic packet validation when available', () => {
    const window = runScripts(['src/mascot/sanitize.js', 'src/state.js'], { Zod });
    const result = window.HermesDisplayState.validateOpticStatePacket({
      mode: 'searching',
      attention: { target: 'activity' },
      optic: { aperture_open: '0.4', pupil_x: '-2', pupil_y: '0.25', ring_motion_budget: '0.7' },
      caption: { text: '<b>Search</b>', visibility: 'hidden' },
    });

    expect(result.ok).toBe(true);
    expect(result.validator).toBe('zod');
    expect(result.packet).toMatchObject({
      mode: 'searching',
      optic: { aperture_open: 0.4, pupil_x: -1, pupil_y: 0.25, ring_motion_budget: 0.7 },
      caption: { text: 'Search', visibility: 'hidden' },
    });

    const rejected = window.HermesDisplayState.validateOpticStatePacket({ mode: 'not_real' });
    expect(rejected.ok).toBe(false);
    expect(rejected.packet.mode).toBe('idle_watch');
  });

  it('redacts credential-like browser captions and suppresses snippets', () => {
    const window = runScripts(['src/state.js']);
    const packet = window.HermesDisplayState.normalizePersonaPacket({
      mood: 'idle',
      skin: 'retro-robot-core',
      caption: { text: 'token=ghp_1234567890abcdef1234567890abcdef123456' },
      display: { text: 'api_key=sk-test-1234567890abcdef' },
      snippet: 'password=hunter2',
    });
    expect(packet.caption.text).toBe('[redacted credential-like text]');
    expect(packet.display.text).toBe('[redacted credential-like text]');
    expect(packet.snippet).toBeNull();
    expect(JSON.stringify(packet)).not.toContain('ghp_');
    expect(JSON.stringify(packet)).not.toContain('hunter2');
  });

  it('maps optic behavior modes to display presets before rendering', () => {
    const window = runScripts(['src/mascot/behavior-machine.js', 'src/state.js']);

    expect(window.HermesDisplayState.opticPacketToPersonaPacket({ mode: 'tool_shell' })).toMatchObject({
      behavior_mode: 'tool_shell',
      state_preset: 'working',
      mood: 'thinking_focused',
    });
    expect(window.HermesDisplayState.opticPacketToPersonaPacket({ mode: 'blocked' })).toMatchObject({
      behavior_mode: 'blocked',
      state_preset: 'blocked',
      mood: 'blocked_annoyed',
    });
    expect(window.HermesDisplayState.opticPacketToPersonaPacket({ mode: 'degraded_offline' })).toMatchObject({
      behavior_mode: 'degraded_offline',
      state_preset: 'degraded_offline',
      mood: 'degraded_offline',
    });
  });

  it('maps optic behavior modes through the shared preset helper when behavior machine is unavailable', () => {
    const window = runScripts(['src/state.js']);
    delete window.HermesBehaviorMachine;

    expect(window.HermesDisplayState.opticPacketToPersonaPacket({ mode: 'tool_shell' })).toMatchObject({
      behavior_mode: 'tool_shell',
      state_preset: 'working',
      mood: 'thinking_focused',
    });
  });

  it('runs deterministic behavior transitions', () => {
    const window = runScripts(['src/mascot/behavior-machine.js']);
    let service = window.HermesBehaviorMachine.createBehaviorService('idle_watch');
    service = service.send({ type: 'ASSISTANT_NOTICE' });
    service = service.send({ type: 'TOOL_STARTED' });
    service = service.send({ type: 'WAITING_USER' });

    expect(service.mode).toBe('waiting_user');
  });

  it('backs behavior service with an XState actor when available', () => {
    const window = runScripts(['src/mascot/behavior-machine.js'], { XState });
    const service = window.HermesBehaviorMachine.createBehaviorService('idle_watch');

    expect(service.actor).toBeTruthy();
    service.send({ type: 'ASSISTANT_NOTICE' }).send({ type: 'TOOL_STARTED' }).send({ type: 'DEGRADED' });

    expect(service.mode).toBe('degraded_offline');
    expect(service.snapshot()).toMatchObject({ mode: 'degraded_offline', preset: 'degraded_offline' });
    service.stop();
  });

  it('models display state as parallel regions (behavior + health + quiet + privacy) via XState', () => {
    const window = runScripts(['src/mascot/behavior-machine.js'], { XState });
    const machine = window.HermesBehaviorMachine.createXStateMachine('idle_watch');
    expect(machine.config.type).toBe('parallel');
    expect(Object.keys(machine.config.states).sort()).toEqual(['behavior', 'health', 'privacy_display', 'quiet']);

    const service = window.HermesBehaviorMachine.createBehaviorService('idle_watch');
    // Overlay regions are orthogonal to the behavior mode and hold simultaneously.
    service.send({ type: 'TOOL_STARTED' }).send({ type: 'HEALTH_CRITICAL' }).send({ type: 'NIGHT_ON' }).send({ type: 'PRIVACY_SENSITIVE' });
    expect(service.mode).toBe('tool_shell');
    expect(service.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
    // Changing the behavior mode preserves the overlay regions and the actor identity.
    const originalActor = service.actor;
    service.setMode('blocked');
    expect(service.actor).toBe(originalActor);
    expect(service.mode).toBe('blocked');
    expect(service.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
    service.stop();
  });

  it('keeps XState and fallback behavior services in parity across behavior and overlay events', () => {
    const window = runScripts(['src/mascot/behavior-machine.js'], { XState });
    const fallback = window.HermesBehaviorMachine.createFallbackBehaviorService('idle_watch');
    const actor = window.HermesBehaviorMachine.createBehaviorService('idle_watch');
    const sequence = [
      'ASSISTANT_NOTICE',
      'TOOL_STARTED',
      'HEALTH_DEGRADED',
      'NIGHT_ON',
      'PRIVACY_SENSITIVE',
      'WAITING_USER',
      'HEALTH_RECOVERED',
      'ACTIVE',
      'PRIVACY_CLEAR',
      'SET_BLOCKED',
      'RESET',
    ];

    for (const event of sequence) {
      fallback.send(event);
      actor.send(event);
      expect(actor.regions, event).toEqual(fallback.regions);
      expect(actor.overlays, event).toEqual(fallback.overlays);
      expect(actor.mode, event).toBe(fallback.mode);
    }
    actor.stop();
  });

  it('resolves behavior modes from explicit packet modes and display presets', () => {
    const window = runScripts(['src/mascot/behavior-machine.js']);
    const behavior = window.HermesBehaviorMachine;

    expect(behavior.modeFromPacket({ behavior_mode: 'blocked', optic_state_packet: { mode: 'tool_shell' } })).toBe('blocked');
    expect(behavior.modeFromPacket({ optic_state_packet: { mode: 'tool_shell' } })).toBe('tool_shell');
    expect(behavior.modeFromPacket({ puppet_state_packet: { mode: 'waiting_user' } })).toBe('waiting_user');
    expect(behavior.modeFromPacket({ state_preset: 'working' })).toBe('tool_shell');
    expect(behavior.modeFromPacket({ state_preset: 'night_watch' })).toBe('idle_watch');
    expect(behavior.modeFromPacket({ state_preset: 'unknown' }, 'reasoning')).toBe('reasoning');
  });

  it('routes high-level avatar events through behavior-machine events', () => {
    const window = runScripts(['src/mascot/behavior-machine.js']);
    const behavior = window.HermesBehaviorMachine;

    expect(behavior.behaviorEventsForAvatarEvent({ event: 'assistant.started' })).toEqual(['SET_NOTICE']);
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'assistant.tool_started' })).toEqual(['SET_TOOL_SHELL']);
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'assistant.waiting_on_user' })).toEqual(['SET_WAITING_USER']);
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'feed.lost' })).toEqual(['DEGRADED', 'HEALTH_CRITICAL']);
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'feed.recovered' })).toEqual(['RECOVERED', 'HEALTH_RECOVERED']);
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'system.display_recovered' })).toEqual(['RECOVERED', 'HEALTH_RECOVERED']);
    expect(behavior.behaviorEventForAvatarEvent({ event: 'feed.lost' })).toBe('DEGRADED');
    expect(behavior.behaviorEventsForAvatarEvent({ event: 'unknown.event' })).toEqual([]);
    expect(behavior.behaviorEventForAvatarEvent({ event: 'unknown.event' })).toBe(null);
  });

  it('applies feed avatar events to behavior and overlay regions together', () => {
    const window = runScripts(['src/mascot/behavior-machine.js'], { XState });
    const service = window.HermesBehaviorMachine.createBehaviorService('idle_watch');

    service.sendAll(window.HermesBehaviorMachine.behaviorEventsForAvatarEvent({ event: 'feed.lost' }));
    expect(service.mode).toBe('degraded_offline');
    expect(service.overlays.health).toBe('critical');

    service.sendAll(window.HermesBehaviorMachine.behaviorEventsForAvatarEvent({ event: 'feed.recovered' }));
    expect(service.mode).toBe('idle_watch');
    expect(service.overlays.health).toBe('nominal');
    service.stop();
  });

  it('derives rich render packets from behavior state without stale mood or optic posture', () => {
    const window = runScripts(['src/mascot/behavior-machine.js', 'src/state.js']);
    const packet = window.HermesBehaviorMachine.renderPacketForBehaviorMode('tool_shell', {
      mood: 'idle_watchful',
      state_preset: 'quiet_watch',
      optic_state_packet: { mode: 'idle_watch', special: 'none' },
      puppet_state_packet: { mode: 'idle_watch', special: 'none' },
    });

    expect(packet.mood).toBe('thinking_focused');
    expect(packet.state_preset).toBe('working');
    expect(packet.optic_state_packet.mode).toBe('tool_shell');
    expect(packet.optic_state_packet.special).toBe('grid_8x8');
    expect(packet.puppet_state_packet?.mode).toBe('tool_shell');
    expect(packet.puppet_state_packet?.special).toBe('grid_8x8');
  });

  it('derives render packets from avatar-event machine state without losing overlay truth', () => {
    const window = runScripts(['src/mascot/behavior-machine.js', 'src/state.js']);
    const behavior = window.HermesBehaviorMachine;
    const service = behavior.createFallbackBehaviorService('idle_watch');
    const event = { event: 'feed.lost' };

    service.sendAll(behavior.behaviorEventsForAvatarEvent(event));
    const packet = behavior.packetForAvatarEvent(event, service.mode, { live: { freshness: { tier: 'fresh' } }, optic_state_packet: { mode: 'idle_watch', special: 'none' } });

    expect(packet.behavior_mode).toBe('degraded_offline');
    expect(packet.state_preset).toBe('degraded_offline');
    expect(packet.mood).toBe('degraded_offline');
    expect(packet.optic_state_packet.mode).toBe('degraded_offline');
    expect(packet.optic_state_packet.special).toBe('offline_horizon');
    expect(packet.live.freshness.tier).toBe('lost');
    expect(behavior.regionEventsForPacket(packet)).toContain('HEALTH_CRITICAL');
  });

  it('applies packet-derived overlays independently from behavior-mode resolution', () => {
    const window = runScripts(['src/mascot/behavior-machine.js'], { XState });
    const service = window.HermesBehaviorMachine.createBehaviorService('tool_shell');
    const events = window.HermesBehaviorMachine.regionEventsForPacket({
      motion: { severity: 'critical' },
      state_preset: 'night_watch',
      snippet: { sensitivity: 'operator_only' },
    });
    service.sendAll(events);

    expect(events).toEqual(expect.arrayContaining(['HEALTH_CRITICAL', 'NIGHT_ON', 'PRIVACY_SENSITIVE']));
    expect(service.mode).toBe('tool_shell');
    expect(service.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
    service.stop();
  });

  it('derives overlay-region events from a packet (health/quiet/privacy)', () => {
    const window = runScripts(['src/mascot/behavior-machine.js']);
    const events = window.HermesBehaviorMachine.regionEventsForPacket({
      motion: { severity: 'critical' },
      state_preset: 'night_watch',
      snippet: { sensitivity: 'operator_only' },
    });
    expect(events).toContain('HEALTH_CRITICAL');
    expect(events).toContain('NIGHT_ON');
    expect(events).toContain('PRIVACY_SENSITIVE');

    // Fallback service (no XState) applies the same parallel transitions deterministically.
    const service = window.HermesBehaviorMachine.createFallbackBehaviorService('idle_watch').sendAll(events);
    expect(service.overlays).toEqual({ health: 'critical', quiet: 'night', privacy: 'sensitive' });
  });

  it('supports Anime.js v4 animate(targets, params) and older function-style anime', () => {
    const v4Calls = [];
    let window = runScripts(['src/mascot/motion-adapter.js'], {
      anime: {
        animate: (targets, params) => {
          v4Calls.push({ targets, params });
          params.onComplete?.();
          return { pause() {}, restart() {} };
        },
      },
    });
    const target = { opacity: 0 };
    let completed = false;
    window.HermesMotionAdapter.createMotionAdapter().animateValue({
      targets: target,
      opacity: 1,
      easing: 'easeOutQuad',
      complete: () => { completed = true; },
    });

    expect(v4Calls).toHaveLength(1);
    expect(v4Calls[0].targets).toBe(target);
    expect(v4Calls[0].params).toMatchObject({ opacity: 1, ease: 'outQuad' });
    expect(completed).toBe(true);

    window.HermesMotionAdapter.createMotionAdapter().pulse(target, { opacity: [0.5, 1] });
    expect(v4Calls[1].params).toMatchObject({ opacity: [0.5, 1], ease: 'inOutSine', alternate: true });

    const legacyCalls = [];
    window = runScripts(['src/mascot/motion-adapter.js'], {
      anime: (options) => {
        legacyCalls.push(options);
        return { pause() {}, restart() {} };
      },
    });
    window.HermesMotionAdapter.createMotionAdapter().animateValue({ targets: target, opacity: 0.5, easing: 'outQuad' });
    window.HermesMotionAdapter.createMotionAdapter().pulse(target, { opacity: [0.5, 1] });
    expect(legacyCalls[0]).toMatchObject({ targets: target, opacity: 0.5, easing: 'easeOutQuad' });
    expect(legacyCalls[1]).toMatchObject({ targets: target, opacity: [0.5, 1], easing: 'easeInOutSine', direction: 'alternate' });
  });

  it('strips unsafe caption text', () => {
    const window = runScripts(['src/mascot/sanitize.js'], {
      DOMPurify: { sanitize: (value) => String(value).replace(/<script[\s\S]*?<\/script>/gi, '') },
    });
    expect(window.HermesSanitize.captionText('<b>Hello</b><script>x</script>')).toBe('Hello');
  });
});
