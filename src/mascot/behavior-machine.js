(() => {
  const { MODES, MODE_TO_PRESET, PRESET_TO_MODE, modeFromPacket, packetForMode } = window.HermesModePresets;

  const SET_MODE_EVENT_PREFIX = 'SET_';
  const SET_MODE_TRANSITIONS = Object.fromEntries(
    MODES.map((mode) => [`${SET_MODE_EVENT_PREFIX}${mode.toUpperCase()}`, `.${mode}`])
  );

  function setModeEventForMode(mode) {
    return MODES.includes(mode) ? `${SET_MODE_EVENT_PREFIX}${mode.toUpperCase()}` : null;
  }

  const TRANSITIONS = {
    idle_watch: {
      ASSISTANT_NOTICE: 'notice',
      LISTENING: 'listening',
      REASONING: 'reasoning',
      TOOL_STARTED: 'tool_shell',
      SEARCH_STARTED: 'searching',
      WRITE_STARTED: 'writing',
      WAITING_USER: 'waiting_user',
      BLOCKED: 'blocked',
      DEGRADED: 'degraded_offline',
    },
    notice: {
      LISTENING: 'listening',
      READING: 'reading',
      REASONING: 'reasoning',
      TOOL_STARTED: 'tool_shell',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    listening: {
      REASONING: 'reasoning',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    reading: {
      REASONING: 'reasoning',
      TOOL_STARTED: 'tool_shell',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    reasoning: {
      TOOL_STARTED: 'tool_shell',
      SEARCH_STARTED: 'searching',
      WRITE_STARTED: 'writing',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    tool_shell: {
      TOOL_FINISHED: 'reasoning',
      SEARCH_STARTED: 'searching',
      WRITE_STARTED: 'writing',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    searching: {
      TOOL_STARTED: 'tool_shell',
      WRITE_STARTED: 'writing',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    writing: {
      TOOL_STARTED: 'tool_shell',
      WAITING_USER: 'waiting_user',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    waiting_user: {
      ASSISTANT_NOTICE: 'notice',
      USER_RESPONDED: 'reasoning',
      RESOLVE: 'complete',
      BLOCKED: 'blocked',
      RESET: 'idle_watch',
    },
    blocked: {
      USER_RESPONDED: 'reasoning',
      RESOLVE: 'complete',
      RESET: 'idle_watch',
    },
    complete: {
      ASSISTANT_NOTICE: 'notice',
      RESET: 'idle_watch',
    },
    degraded_offline: {
      RECOVERED: 'idle_watch',
      RESET: 'idle_watch',
    },
  };

  // ── Parallel overlay regions ────────────────────────────────────────────────
  // The display is more than a single mode: it has orthogonal concerns that can be
  // true at the same time as any behavior mode. Modelling them as parallel XState
  // regions makes the machine the source of truth for high-level display state,
  // while the renderer keeps owning gaze/blink/transform composition.
  const REGION_DEFAULTS = { behavior: 'idle_watch', health: 'nominal', quiet: 'active', privacy_display: 'normal' };

  const HEALTH_TRANSITIONS = {
    nominal: { HEALTH_DEGRADED: 'degraded', HEALTH_CRITICAL: 'critical' },
    degraded: { HEALTH_CRITICAL: 'critical', HEALTH_RECOVERED: 'nominal', HEALTH_NOMINAL: 'nominal' },
    critical: { HEALTH_DEGRADED: 'degraded', HEALTH_RECOVERED: 'nominal', HEALTH_NOMINAL: 'nominal' },
  };
  const QUIET_TRANSITIONS = {
    active: { QUIET_ON: 'quiet', NIGHT_ON: 'night' },
    quiet: { QUIET_OFF: 'active', NIGHT_ON: 'night', ACTIVE: 'active' },
    night: { NIGHT_OFF: 'active', QUIET_ON: 'quiet', ACTIVE: 'active' },
  };
  const PRIVACY_TRANSITIONS = {
    normal: { PRIVACY_SENSITIVE: 'sensitive' },
    sensitive: { PRIVACY_CLEAR: 'normal' },
  };
  const REGION_TRANSITIONS = { health: HEALTH_TRANSITIONS, quiet: QUIET_TRANSITIONS, privacy_display: PRIVACY_TRANSITIONS };
  const REGION_NAMES = ['behavior', 'health', 'quiet', 'privacy_display'];

  const AVATAR_EVENT_TO_MACHINE_EVENTS = {
    'assistant.started': ['ASSISTANT_NOTICE'],
    'assistant.tool_started': ['TOOL_STARTED'],
    'assistant.tool_finished': ['TOOL_FINISHED'],
    'assistant.waiting_on_user': ['WAITING_USER'],
    'assistant.final_started': ['WRITE_STARTED'],
    'assistant.final_complete': ['RESOLVE'],
    'feed.stale': ['HEALTH_DEGRADED'],
    'feed.lost': ['DEGRADED', 'HEALTH_CRITICAL'],
    'feed.recovered': ['RECOVERED', 'HEALTH_RECOVERED'],
    'system.display_recovered': ['RECOVERED', 'HEALTH_RECOVERED'],
  };

  function behaviorEventsForAvatarEvent(event) {
    const events = AVATAR_EVENT_TO_MACHINE_EVENTS[event?.event];
    return Array.isArray(events) ? events.slice() : [];
  }

  // Back-compat for older callers/tests that expect a single event. New code should use
  // behaviorEventsForAvatarEvent() so feed lifecycle events update behavior and overlays together.
  function behaviorEventForAvatarEvent(event) {
    return behaviorEventsForAvatarEvent(event)[0] || null;
  }

  function renderPacketForBehaviorMode(mode, basePacket = {}) {
    const safeMode = MODES.includes(mode) ? mode : 'idle_watch';
    if (window.HermesDisplayState?.opticPacketToPersonaPacket) {
      return window.HermesDisplayState.opticPacketToPersonaPacket({ mode: safeMode }, basePacket);
    }
    return packetForMode(safeMode, basePacket);
  }

  function packetForAvatarEvent(event, mode, basePacket = {}) {
    const packet = renderPacketForBehaviorMode(mode, basePacket);
    if (event?.event === 'feed.lost') {
      packet.live = { ...(packet.live || {}), freshness: { ...(packet.live?.freshness || {}), tier: 'lost' } };
      packet.motion = { ...(packet.motion || {}), severity: 'critical' };
    } else if (event?.event === 'feed.stale') {
      packet.live = { ...(packet.live || {}), freshness: { ...(packet.live?.freshness || {}), tier: 'stale' } };
      packet.motion = { ...(packet.motion || {}), severity: 'stale' };
    } else if (event?.event === 'feed.recovered' || event?.event === 'system.display_recovered') {
      packet.live = { ...(packet.live || {}), freshness: { ...(packet.live?.freshness || {}), tier: 'fresh' } };
      packet.motion = { ...(packet.motion || {}), severity: 'normal' };
    }
    return packet;
  }

  function regionStatesFromTable(table) {
    const states = {};
    for (const [name, on] of Object.entries(table)) states[name] = { on };
    return states;
  }

  function normalizeInitials(initial) {
    if (initial && typeof initial === 'object') {
      return {
        behavior: MODES.includes(initial.behavior) ? initial.behavior : 'idle_watch',
        health: HEALTH_TRANSITIONS[initial.health] ? initial.health : 'nominal',
        quiet: QUIET_TRANSITIONS[initial.quiet] ? initial.quiet : 'active',
        privacy_display: PRIVACY_TRANSITIONS[initial.privacy_display] ? initial.privacy_display : 'normal',
      };
    }
    const behavior = MODES.includes(initial) ? initial : 'idle_watch';
    return { ...REGION_DEFAULTS, behavior };
  }

  function createXStateMachine(initial = 'idle_watch') {
    const xstate = window.XState;
    if (!xstate?.createMachine) return null;
    const initials = normalizeInitials(initial);
    const behaviorStates = {};
    for (const mode of MODES) {
      behaviorStates[mode] = { on: { ...(TRANSITIONS[mode] || {}), DEGRADED: 'degraded_offline' } };
    }
    return xstate.createMachine({
      id: 'hermesDisplay',
      type: 'parallel',
      states: {
        behavior: { initial: initials.behavior, states: behaviorStates, on: SET_MODE_TRANSITIONS },
        health: { initial: initials.health, states: regionStatesFromTable(HEALTH_TRANSITIONS) },
        quiet: { initial: initials.quiet, states: regionStatesFromTable(QUIET_TRANSITIONS) },
        privacy_display: { initial: initials.privacy_display, states: regionStatesFromTable(PRIVACY_TRANSITIONS) },
      },
    });
  }

  // Pure transition over the full region map (mirrors the XState machine for the fallback path).
  function transitionRegions(regions, event) {
    const type = typeof event === 'string' ? event : event?.type;
    const current = { ...REGION_DEFAULTS, ...regions };
    if (!type) return current;
    const next = { ...current };
    // behavior: explicit table plus the global DEGRADED shortcut.
    const explicitMode = type.startsWith(SET_MODE_EVENT_PREFIX)
      ? type.slice(SET_MODE_EVENT_PREFIX.length).toLowerCase()
      : null;
    if (MODES.includes(explicitMode)) next.behavior = explicitMode;
    else if (type === 'DEGRADED') next.behavior = 'degraded_offline';
    else if (TRANSITIONS[current.behavior]?.[type]) next.behavior = TRANSITIONS[current.behavior][type];
    // overlay regions
    for (const region of ['health', 'quiet', 'privacy_display']) {
      const target = REGION_TRANSITIONS[region][current[region]]?.[type];
      if (target) next[region] = target;
    }
    return next;
  }

  // Back-compat: single-mode transition over the behavior region only.
  function transition(mode, event) {
    return transitionRegions({ behavior: MODES.includes(mode) ? mode : 'idle_watch' }, event).behavior;
  }

  function overlaysFromRegions(regions) {
    const r = { ...REGION_DEFAULTS, ...regions };
    return { health: r.health, quiet: r.quiet, privacy: r.privacy_display };
  }

  // Derive the overlay-region events implied by a (normalized) persona/optic packet, so a
  // consumer can keep the parallel machine in sync with real telemetry/freshness/privacy.
  function regionEventsForPacket(packet = {}) {
    const events = [];
    const live = packet.live || {};
    const sys = live.system || {};
    const tier = live.freshness?.tier;
    const severity = packet.motion?.severity || packet.severity;
    if (severity === 'critical' || tier === 'lost' || sys.sensor_error) events.push('HEALTH_CRITICAL');
    else if (severity === 'attention' || severity === 'stale' || tier === 'stale') events.push('HEALTH_DEGRADED');
    else events.push('HEALTH_RECOVERED');

    const preset = packet.state_preset;
    const quiet = packet.quiet || packet.display?.quiet;
    if (preset === 'night_watch' || quiet === 'night') events.push('NIGHT_ON');
    else if (quiet === 'quiet' || quiet === true) events.push('QUIET_ON');
    else events.push('ACTIVE');

    const sensitivity = packet.snippet?.sensitivity;
    const sensitive = Boolean(packet.safety?.contains_credentials) || (sensitivity && sensitivity !== 'display_safe');
    events.push(sensitive ? 'PRIVACY_SENSITIVE' : 'PRIVACY_CLEAR');
    return events;
  }

  function snapshotRegions(snapshot) {
    const value = snapshot?.value;
    if (value && typeof value === 'object') {
      return {
        behavior: MODES.includes(value.behavior) ? value.behavior : 'idle_watch',
        health: HEALTH_TRANSITIONS[value.health] ? value.health : 'nominal',
        quiet: QUIET_TRANSITIONS[value.quiet] ? value.quiet : 'active',
        privacy_display: PRIVACY_TRANSITIONS[value.privacy_display] ? value.privacy_display : 'normal',
      };
    }
    // Older flat machines reported the behavior mode as a bare string.
    return { ...REGION_DEFAULTS, behavior: MODES.includes(value) ? value : 'idle_watch' };
  }

  function buildSnapshot(regions, history) {
    const mode = regions.behavior;
    return {
      mode,
      preset: MODE_TO_PRESET[mode] || 'quiet_watch',
      regions: { ...regions },
      overlays: overlaysFromRegions(regions),
      history: history.slice(-8),
    };
  }

  function createFallbackBehaviorService(initial = 'idle_watch') {
    let regions = normalizeInitials(initial);
    const history = [{ mode: regions.behavior, event: 'init', at: Date.now() }];
    const api = {
      get mode() { return regions.behavior; },
      get preset() { return MODE_TO_PRESET[regions.behavior] || 'quiet_watch'; },
      get regions() { return { ...regions }; },
      get overlays() { return overlaysFromRegions(regions); },
      get history() { return history.slice(-8); },
      send(event) {
        regions = transitionRegions(regions, event);
        history.push({ mode: regions.behavior, event: typeof event === 'string' ? event : event?.type || 'UNKNOWN', at: Date.now() });
        if (history.length > 64) history.shift();
        return this;
      },
      sendAll(events = []) {
        for (const event of events) this.send(event);
        return this;
      },
      setMode(nextMode) {
        if (MODES.includes(nextMode)) {
          regions = { ...regions, behavior: nextMode };
          history.push({ mode: nextMode, event: setModeEventForMode(nextMode) || 'SET_MODE', at: Date.now() });
        }
        return this;
      },
      snapshot() { return buildSnapshot(regions, history); },
    };
    return api;
  }

  function createActorBehaviorService(initial = 'idle_watch') {
    const xstate = window.XState;
    const machine = createXStateMachine(initial);
    if (!machine || !xstate?.createActor) return null;
    let actor = xstate.createActor(machine);
    const history = [{ mode: normalizeInitials(initial).behavior, event: 'init', at: Date.now() }];
    actor.start();
    const regionsNow = () => snapshotRegions(actor.getSnapshot());
    return {
      get actor() { return actor; },
      get mode() { return regionsNow().behavior; },
      get preset() { return MODE_TO_PRESET[regionsNow().behavior] || 'quiet_watch'; },
      get regions() { return regionsNow(); },
      get overlays() { return overlaysFromRegions(regionsNow()); },
      get history() { return history.slice(-8); },
      send(event) {
        const normalizedEvent = typeof event === 'string' ? { type: event } : event;
        if (normalizedEvent?.type) actor.send(normalizedEvent);
        history.push({ mode: regionsNow().behavior, event: normalizedEvent?.type || 'UNKNOWN', at: Date.now() });
        if (history.length > 64) history.shift();
        return this;
      },
      sendAll(events = []) {
        for (const event of events) this.send(event);
        return this;
      },
      setMode(nextMode) {
        if (!MODES.includes(nextMode) || nextMode === regionsNow().behavior) return this;
        const eventType = setModeEventForMode(nextMode);
        actor.send({ type: eventType });
        history.push({ mode: regionsNow().behavior, event: eventType || 'SET_MODE', at: Date.now() });
        return this;
      },
      snapshot() { return buildSnapshot(regionsNow(), history); },
      stop() { actor.stop(); },
    };
  }

  function createBehaviorService(initial = 'idle_watch') {
    return createActorBehaviorService(initial) || createFallbackBehaviorService(initial);
  }

  window.HermesBehaviorMachine = {
    MODES,
    MODE_TO_PRESET,
    PRESET_TO_MODE,
    TRANSITIONS,
    REGION_NAMES,
    REGION_DEFAULTS,
    HEALTH_TRANSITIONS,
    QUIET_TRANSITIONS,
    PRIVACY_TRANSITIONS,
    createXStateMachine,
    createBehaviorService,
    createFallbackBehaviorService,
    transition,
    transitionRegions,
    overlaysFromRegions,
    regionEventsForPacket,
    modeFromPacket,
    setModeEventForMode,
    behaviorEventsForAvatarEvent,
    behaviorEventForAvatarEvent,
    snapshotRegions,
    packetForMode,
    renderPacketForBehaviorMode,
    packetForAvatarEvent,
  };
})();
