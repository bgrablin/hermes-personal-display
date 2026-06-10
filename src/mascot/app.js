(() => {
  const { PRESETS, clone, normalizePersonaPacket, deriveAdaptiveMotion } = window.HermesDisplayState;
  const { NUDGES } = window.HermesDisplayStates;
  const textarea = document.querySelector('#state-json');
  const output = document.querySelector('#status-output');
  const motionDebug = document.querySelector('#motion-debug');
  const freezeToggle = document.querySelector('#freeze-toggle');
  const skinSelect = document.querySelector('#skin-select');
  applyPageMode();
  const urlParams = new URLSearchParams(window.location.search);
  const requestedMode = urlParams.get('mode');
  const kioskMode = ['1', 'true', 'yes'].includes((urlParams.get('kiosk') || '').toLowerCase());
  const orientation = (urlParams.get('orientation') || '').toLowerCase();
  const familyAudience = ['family', 'theater'].includes((urlParams.get('audience') || '').toLowerCase()) || ['1', 'true', 'yes'].includes((urlParams.get('family') || '').toLowerCase()) || (urlParams.get('view') || '').toLowerCase() === 'theater';
  const reducedMotionMedia = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  let prefersReducedMotion = reducedMotionMedia?.matches || false;
  const initialPacket = requestedMode && window.HermesDisplayState.opticPacketToPersonaPacket
    ? window.HermesDisplayState.opticPacketToPersonaPacket({ mode: requestedMode }, PRESETS.idle_watchful)
    : PRESETS.idle_watchful;
  const renderer = createConceptBVisibleRendererAdapter(initialPacket);
  let currentPacket = clone(initialPacket);
  const presetOrder = ['idle_watchful', 'thinking_focused', 'healthy_smug', 'blocked_annoyed', 'night_sleepy'];
  const skinOrder = ['retro-robot-core', 'retro-terminal-focus', 'retro-night-watch', 'retro-amber-watch', 'retro-hermes-accent'];
  const liveStatus = { lastGoodAt: null, failures: 0, lastError: '', staleSince: null };
  const avatarEventStatus = { connected: false, accepted: 0, dropped: 0, lastError: '', lastEventAt: null, recent: [] };
  const DISPLAY_BUILD_ID = 'family-hold-toggle1';
  const STATUS_TICK_MIN_GAP_MS = 4000;
  const ROUTE_HEADROOM_LOW_THRESHOLD = 0.15;
  let statusTicksArmed = false;
  window.__HERMES_STATUS_TICKS = 0;
  const CONCEPT_B_BIO_MOTION = Object.freeze({
    // Quiet watch should not read as a metronomic eye twitch. Keep micro-saccades rare
    // and tiny in standby, while preserving more visible eye life for active/search modes.
    microMinMs: 1100,
    microMaxMs: 2600,
    microEaseMs: 42,
    microReturnMs: 120,
    microQuietIntervalScale: 2.6,
    microQuietAmpScale: 0.28,
    microActiveAmpScale: 0.62,
    microVoiceScale: 1.35,
    microMaxX: 2.4,
    microMaxY: 1.45,
    halfBlinkBurstWindowMs: 1600,
    halfBlinkBurstCount: 3,
    edgeRimBase: 0.12,
    edgeRimGain: 0.24,
    gazeMaxHypot: 34,
  });
  const CONCEPT_B_FEEL = Object.freeze({
    loadPulseMinSeconds: 1.2,
    loadPulseMaxSeconds: 2.2,
    tokenBurstThreshold: 16,
    tokenCaretSlowSeconds: 1.15,
    tokenCaretFastSeconds: 0.42,
    offlineBackoffLabel: 'RETRYING WITH BACKOFF',
  });
  window.__HERMES_DISPLAY_BUILD_ID = DISPLAY_BUILD_ID;
  document.documentElement.dataset.hermesDisplayBuildId = DISPLAY_BUILD_ID;
  const CURRENT_WORK_MAX_AGE_SECONDS = 4 * 60;
  const QUIET_WATCH_LINES = [
    'Systems steady. Watching the lab.',
    'Quiet watch. Nothing needs attention.',
    'Local systems calm. Hermes is present.',
    'All monitored signals are calm.'
  ];
  applyMotionVars(currentPacket);
  const modeProof = installModeProofStrip();
  updateModeProof(modeProof, currentPacket);

  function createConceptBVisibleRendererAdapter(initial) {
    const events = new EventTarget();
    let packet = normalizePersonaPacket(initial);
    let frozen = false;
    const nudge = (name) => (name && NUDGES[name]) || NUDGES.tiny_perk || { label: name || 'visible optic', duration: 600 };
    const intentName = (name) => name || packet.optic_state_packet?.special || packet.puppet_state_packet?.special || 'tiny_perk';
    const emit = (type, detail) => events.dispatchEvent(new CustomEvent(type, { detail }));
    const motion = () => window.__HERMES_CONCEPT_B_EYE_MOTION || null;
    const mapGaze = (name) => ({
      forward_focus: 'front',
      center: 'front',
      front: 'front',
      left: 'augury_left',
      right: 'route_right',
      glance_left: 'augury_left',
      glance_right: 'route_right',
      augury_left: 'augury_left',
      route_right: 'route_right',
      bottom: 'bottom_status',
      bottom_status: 'bottom_status',
      internal_focus: 'internal_focus',
      up_left: 'internal_focus',
      glance_up_left: 'internal_focus',
      down_right: 'down_work_right',
      down_left: 'down_work_left',
      tool_shell: 'down_work_right',
      user_touch: 'user_touch'
    })[name] || name || 'front';
    const pulseKind = (name) => {
      if (['blocked', 'critical', 'skeptical_squint'].includes(name)) return 'blocked';
      if (['complete', 'smug_nod', 'resolved'].includes(name)) return 'complete';
      if (['touch', 'tiny_perk', 'brow_pop'].includes(name)) return 'touch';
      return 'notice';
    };
    const adapter = {
      visibleOnly: true,
      on: (eventName, handler) => events.addEventListener(eventName, handler),
      whenReady: () => Promise.resolve(),
      setPacket(next) {
        packet = normalizePersonaPacket(next);
        emit('debug', adapter.getDebugState());
      },
      setFrozen(value) {
        frozen = Boolean(value);
        emit('debug', adapter.getDebugState());
      },
      isFrozen: () => frozen,
      freeze() { adapter.setFrozen(true); },
      play() { adapter.setFrozen(false); },
      pulseGaze(name, holdMs = 900) {
        if (frozen) return false;
        motion()?.forceGaze?.(mapGaze(name), holdMs);
        window.setTimeout(() => motion()?.setTarget?.({ mode: packet.optic_state_packet?.mode || packet.puppet_state_packet?.mode || 'idle_watch' }), Math.max(220, holdMs));
        emit('debug', adapter.getDebugState());
        return true;
      },
      reactToTouch(zone, opts = {}) {
        adapter.pulseGaze(opts.side || zone || 'center', opts.holdMs || 700);
        return adapter.triggerIntent(opts.intent || 'touch');
      },
      triggerIntent(name) {
        if (frozen) return null;
        const resolved = intentName(name);
        const detail = { name: resolved, label: nudge(resolved).label || resolved, duration: nudge(resolved).duration || 600, automatic: !name, visibleOnly: true };
        if (resolved === 'slow_double_blink') motion()?.blinkNow?.();
        else if (resolved === 'scan_sweep') motion()?.setTarget?.({ special: 'scan_sweep', mode: 'searching' });
        else if (resolved.includes('left') || resolved.includes('right') || resolved.includes('center') || resolved.includes('focus')) adapter.pulseGaze(resolved, detail.duration);
        motion()?.pulse?.(pulseKind(resolved));
        emit('intent', detail);
        emit('debug', adapter.getDebugState());
        return detail;
      },
      ingestAvatarEvent(event) {
        const display = event?.display || {};
        adapter.reactToTouch(display.side || 'center', { intent: display.intent || 'notice', holdMs: Math.max(400, Math.min(1200, Number(event?.ttl_ms) || 700)) });
      },
      getDebugState() {
        const optic = motion()?.debug?.() || {};
        return {
          state: packet.state_preset || packet.optic_state_packet?.mode || packet.puppet_state_packet?.mode || 'quiet_watch',
          mode: 'concept-b-visible-only',
          visibleOnly: true,
          hiddenRendererSkipped: true,
          frozen,
          gazeChannel: { targetName: optic.mode || 'concept-b', mode: optic.special || 'visible', holdUntilMs: 0 },
          poseChannel: { rootY: 0 },
          fxChannel: { intensity: 1 },
          motionBudget: { rootYMax: 0 },
          optic
        };
      }
    };
    return adapter;
  }

  function hasRichOpticPosture(optic) {
    if (!optic?.mode) return false;
    const meaningfulSpecial = optic.special && optic.special !== 'none';
    return Boolean(
      meaningfulSpecial ||
      optic.halo ||
      optic.ring ||
      optic.breath ||
      optic.blink ||
      optic.eyes ||
      optic.gaze ||
      optic.glow != null
    );
  }

  function ensureRichBehaviorPacket(packet) {
    const base = window.HermesDisplayState?.normalizePersonaPacket
      ? window.HermesDisplayState.normalizePersonaPacket(packet)
      : normalizePersonaPacket(packet);
    const mode = window.HermesBehaviorMachine?.modeFromPacket?.(base, 'idle_watch');
    const optic = base?.optic_state_packet || base?.puppet_state_packet;
    if (!mode || hasRichOpticPosture(optic)) return base;
    const enriched = window.HermesBehaviorMachine?.renderPacketForBehaviorMode?.(mode, base) || base;
    // `night_watch` is an overlay/preset variant of idle_watch. Rich optic enrichment should not
    // collapse it back to quiet_watch, or packet-derived quiet overlays will be lost.
    if (base?.state_preset === 'night_watch') {
      return { ...enriched, state_preset: 'night_watch', mood: base.mood, skin: base.skin, state_label: base.state_label };
    }
    return enriched;
  }

  function writePacket(packet, message) {
    const enriched = ensureRichBehaviorPacket(packet);
    currentPacket = normalizePersonaPacket(enriched);
    applyMotionVars(currentPacket);
    textarea.value = JSON.stringify(currentPacket, null, 2);
    skinSelect.value = currentPacket.skin;
    renderer.setPacket(currentPacket);
    output.value = message || `Applied ${currentPacket.mood} / ${currentPacket.skin}.`;
    updateModeProof(modeProof, currentPacket);
    window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
  }

  function selectedSkinPacket(packet) {
    return normalizePersonaPacket({ ...packet, skin: skinSelect.value });
  }


  function installModeProofStrip() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    const qaProof = ['1', 'true', 'yes'].includes((params.get('qa') || params.get('debug') || '').toLowerCase());
    if (!kiosk || !qaProof) return null;
    const strip = document.createElement('div');
    strip.className = 'mode-proof qa-visible';
    strip.setAttribute('aria-label', 'Hermes optic mode proof');
    strip.innerHTML = '<span class="mode-proof-label">OPTIC</span><strong>IDLE WATCH</strong><em>presence first</em>';
    document.body.appendChild(strip);
    return strip;
  }

  function updateModeProof(strip, packet) {
    if (!strip || !packet) return;
    const preset = packet.state_preset || 'quiet_watch';
    const mode = ({
      quiet_watch: 'IDLE WATCH',
      planning: 'PLANNING',
      reasoning: 'REASONING',
      working: 'TOOL/SHELL',
      completed: 'COMPLETE',
      waiting_input: 'WAITING',
      blocked: 'BLOCKED',
      feed_stale: 'FEED STALE',
      degraded_offline: 'OFFLINE',
      night_watch: 'NIGHT WATCH',
      critical: 'LOCAL ISSUE'
    })[preset] || String(preset).replace(/_/g, ' ').toUpperCase();
    const support = ({
      working: 'down-right gaze · wing tension',
      reasoning: 'still focus · slow glow',
      waiting_input: 'direct gaze · patient',
      blocked: 'side-eye · contained',
      completed: 'settled smile',
      feed_stale: 'dimmed telemetry',
      degraded_offline: 'slow blink · dim core',
      night_watch: 'low glow · quiet',
      quiet_watch: 'awake but still'
    })[preset] || 'visible behavior mode';
    strip.dataset.mode = preset;
    strip.querySelector('strong').textContent = mode;
    strip.querySelector('em').textContent = support;
  }

  function applyMotionVars(packet) {
    const motion = deriveMotionVars(packet, liveStatus);
    const root = document.documentElement;
    setConceptBStyleProperty(root, '--hermes-float-duration', `${motion.float_duration_ms}ms`);
    setConceptBStyleProperty(root, '--hermes-eye-glow', motion.eye_glow.toFixed(3));
    setConceptBStyleProperty(root, '--hermes-accent-intensity', motion.accent_intensity.toFixed(3));
    setConceptBStyleProperty(root, '--hermes-alert-pulse', motion.alert_pulse.toFixed(3));
    setConceptBStyleProperty(root, '--hermes-motion-scale', motion.reduced_motion ? '0.35' : motion.thermal === 'warm' ? '0.70' : '1');
    setConceptBStyleProperty(root, '--hermes-attention-color', attentionColor(motion.severity));
    setConceptBStyleProperty(root, '--hermes-attention-rgb', attentionRgb(motion.severity));
    setConceptBDataset(root, 'hermesReducedMotion', motion.reduced_motion ? 'true' : 'false');
    setConceptBDataset(root, 'hermesUserReducedMotion', prefersReducedMotion ? 'true' : 'false');
    setConceptBDataset(root, 'hermesSeverity', motion.severity);
    setConceptBDataset(root, 'hermesThermal', motion.thermal);
    setConceptBDataset(document.body, 'reducedMotion', motion.reduced_motion ? 'true' : 'false');
    if (packet.motion) Object.assign(packet.motion, motion);
    else packet.motion = motion;
    setConceptBDataset(document.body, 'displayPreset', packet.state_preset || 'quiet_watch');
    setConceptBDataset(document.body, 'displaySeverity', motion.severity);
    setConceptBDataset(document.body, 'displayThermal', motion.thermal);
  }

  function deriveMotionVars(packet, status = liveStatus) {
    return deriveAdaptiveMotion(packet, status, { reducedMotion: prefersReducedMotion });
  }

  reducedMotionMedia?.addEventListener?.('change', (event) => {
    prefersReducedMotion = !!event.matches;
    applyMotionVars(currentPacket);
    renderer.setPacket(currentPacket);
  });

  function attentionColor(severity) {
    if (severity === 'critical') return '#ff4d7a';
    if (severity === 'attention' || severity === 'stale') return '#f7d36b';
    if (severity === 'active') return '#65f3ff';
    return '#65f3ff';
  }

  function attentionRgb(severity) {
    if (severity === 'critical') return '255, 77, 122';
    if (severity === 'attention' || severity === 'stale') return '247, 211, 107';
    if (severity === 'active') return '101, 243, 255';
    return '101, 243, 255';
  }

  function presetForResolverState(state, work = {}) {
    if (state === 'critical_local_issue') return 'critical';
    if (state === 'blocked_user_task') return 'blocked';
    if (state === 'needs_attention') return 'waiting_input';
    if (state === 'planning_reasoning') return work?.visual_kind === 'planning' ? 'planning' : 'reasoning';
    if (state === 'active_work') return work?.visual_kind === 'planning' ? 'planning' : 'working';
    if (state === 'recently_completed') return 'completed';
    if (state === 'night_mode') return 'night_watch';
    if (state === 'feed_stale_degraded') return 'feed_stale';
    return 'quiet_watch';
  }

  function previewPacketForDisplayPreset(name, displayPreset) {
    const preset = PRESETS[displayPreset.mood] || PRESETS.idle_watchful;
    const workKindByPreset = {
      reasoning: 'reasoning',
      planning: 'planning',
      working: 'shell',
      waiting_input: 'waiting',
      feed_stale: 'diagnostic'
    };
    const resolverByPreset = {
      quiet_watch: 'quiet_watch',
      reasoning: 'planning_reasoning',
      planning: 'planning_reasoning',
      working: 'active_work',
      completed: 'recently_completed',
      waiting_input: 'needs_attention',
      blocked: 'blocked_user_task',
      feed_stale: 'feed_stale_degraded',
      night_watch: 'night_mode',
      critical: 'critical_local_issue'
    };
    return {
      ...preset,
      skin: displayPreset.skin || preset.skin,
      state_preset: name,
      state_label: displayPreset.label,
      motion: { ...displayPreset.motion },
      live: {
        resolver: { display_state: resolverByPreset[name] || 'quiet_watch', reason_codes: [`preview_${name}`], secondary_badges: [] },
        freshness: { tier: name === 'feed_stale' ? 'stale' : 'fresh', stale_measurements: name === 'feed_stale' ? ['cpu', 'temp_c'] : [] },
        current_work: { visual_kind: workKindByPreset[name], state: name === 'completed' ? 'recent_activity' : 'preview' },
        gateway_ok: true
      }
    };
  }

  function intentForDisplayPreset(name) {
    const intents = {
      quiet_watch: 'settle',
      reasoning: 'scan_sweep',
      planning: 'tiny_perk',
      working: 'scan_sweep',
      completed: 'smug_nod',
      waiting_input: 'brow_pop',
      blocked: 'skeptical_squint',
      feed_stale: 'glance_left',
      night_watch: 'slow_double_blink',
      critical: 'skeptical_squint'
    };
    return intents[name] || 'tiny_perk';
  }

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS[button.dataset.preset];
      writePacket(preset, `Previewing Hermes mascot state: ${button.dataset.preset}.`);
    });
  });

  document.querySelectorAll('[data-state-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const displayPreset = window.HermesDisplayState.DISPLAY_PRESETS[button.dataset.statePreset];
      if (!displayPreset) return;
      const packet = previewPacketForDisplayPreset(button.dataset.statePreset, displayPreset);
      writePacket(packet, `Previewing display preset: ${button.dataset.statePreset}.`);
      renderer.triggerIntent(intentForDisplayPreset(button.dataset.statePreset));
    });
  });

  document.querySelectorAll('[data-nudge]').forEach((button) => {
    button.addEventListener('click', () => {
      const intent = renderer.triggerIntent(button.dataset.nudge);
      if (intent) {
        output.value = `Intent: ${intent.label} (${Math.round(intent.duration)}ms).`;
      } else {
        output.value = 'Intent unavailable (puppet not yet loaded).';
      }
    });
  });

  skinSelect.addEventListener('change', () => {
    writePacket(selectedSkinPacket(currentPacket), `Skin switched to ${skinSelect.value}.`);
  });

  document.querySelector('#apply-json').addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      const packet = normalizePersonaPacket(parsed);
      writePacket(packet, `Applied JSON: ${packet.mood} / ${packet.skin}.`);
      if (packet.safety?.contains_credentials) {
        output.value = 'Applied with redaction: credential-like text was detected and suppressed.';
      }
    } catch (error) {
      output.value = `JSON parse failed: ${error.message}`;
    }
  });

  document.querySelector('#randomize').addEventListener('click', () => {
    const nudged = clone(currentPacket);
    nudged.energy = clamp01(nudged.energy + (Math.random() - 0.5) * 0.22);
    nudged.focus = clamp01(nudged.focus + (Math.random() - 0.5) * 0.24);
    nudged.curiosity = clamp01(nudged.curiosity + (Math.random() - 0.5) * 0.20);
    nudged.impatience = clamp01(nudged.impatience + (Math.random() - 0.5) * 0.26);
    nudged.caption = { ...(nudged.caption || {}), text: chooseQuip(nudged) };
    currentPacket = normalizePersonaPacket(nudged);
    textarea.value = JSON.stringify(currentPacket, null, 2);
    skinSelect.value = currentPacket.skin;
    renderer.setPacket(currentPacket);
    const intent = renderer.triggerIntent();
    if (intent) {
      output.value = `Random nudge → intent: ${intent.label} (${Math.round(intent.duration)}ms). Drives + quip refreshed.`;
    } else {
      output.value = 'Drives + quip refreshed (puppet not yet loaded — intent will queue).';
    }
  });

  freezeToggle?.addEventListener('click', () => {
    const shouldFreeze = !renderer.isFrozen();
    renderer.setFrozen(shouldFreeze);
    freezeToggle.textContent = shouldFreeze ? 'Resume motion' : 'Freeze motion';
    output.value = shouldFreeze ? 'Motion frozen for inspection.' : 'Motion resumed.';
    updateMotionDebug(renderer.getDebugState());
  });

  document.querySelector('#reset').addEventListener('click', () => {
    writePacket(PRESETS.idle_watchful, 'Reset to idle_watchful.');
  });

  window.addEventListener('keydown', (event) => {
    if (event.target === textarea) return;
    const keyMap = {
      '1': 'idle_watchful',
      '2': 'thinking_focused',
      '3': 'healthy_smug',
      '4': 'blocked_annoyed',
      '5': 'night_sleepy'
    };
    if (keyMap[event.key]) writePacket(PRESETS[keyMap[event.key]], `Keyboard preset ${event.key}: ${keyMap[event.key]}.`);
    if (event.key === ' ' || event.key === 'n') {
      const intent = renderer.triggerIntent();
      if (intent) output.value = `Intent: ${intent.label}.`;
    }
  });

  installTouchControls();
  installLandscapePanels();
  installFamilyModeToggle();
  installLiveHermesState();
  installAvatarEventBus();
  installAuguryOverlay();

  renderer.on('intent', (event) => {
    const detail = event.detail;
    if (!detail) return;
    const labelTag = NUDGES[detail.name]?.label || detail.label;
    output.value = `Intent fired: ${labelTag}${detail.automatic ? ' (auto)' : ''}.`;
  });

  renderer.on('debug', (event) => {
    updateMotionDebug(event.detail);
  });

  window.HermesDisplayRuntime = {
    renderer,
    debug: () => ({ ...renderer.getDebugState(), liveStatus: { ...liveStatus }, avatarEvents: avatarEventDebug() }),
    liveStatus: () => ({ ...liveStatus }),
    avatarEvents: () => avatarEventDebug(),
    publishAvatarEvent: (event) => applyAvatarEvent(event),
    resolverDebug: () => displaySafeResolverDebug(currentPacket, liveStatus),
  };

  function updateMotionDebug(debug) {
    if (!motionDebug || !debug) return;
    const intent = debug.intent ? `${debug.intent.name}${debug.intent.automatic ? '/auto' : ''}` : 'none';
    const rootY = Number(debug.poseChannel.rootY || 0).toFixed(2);
    const budget = debug.motionBudget ? `rootY ${rootY}/${debug.motionBudget.rootYMax}px` : `rootY ${rootY}px`;
    const motion = currentPacket.motion || {};
    motionDebug.value = `state=${debug.state} preset=${currentPacket.state_preset || 'quiet_watch'} severity=${motion.severity || 'normal'} thermal=${motion.thermal || 'cool'} reduced=${motion.reduced_motion ? 'yes' : 'no'} gaze=${debug.gazeChannel.targetName}/${debug.gazeChannel.mode} hold=${debug.gazeChannel.holdUntilMs}ms intent=${intent} ${budget} fx=${debug.fxChannel.intensity}`;
  }

  function installTouchControls() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    if (!kiosk) return;
    const debugTouch = ['1', 'true', 'yes'].includes((params.get('debug') || '').toLowerCase());
    const allowMouseTouchTest = ['1', 'true', 'yes'].includes((params.get('touchtest') || '').toLowerCase());
    const touchMode = (params.get('touch') || 'fun').toLowerCase();
    if (touchMode === 'off') return;

    const touchFxController = window.HermesTouchFx?.install?.({
      renderer,
      getPacket: () => currentPacket,
      getLiveStatus: () => liveStatus,
      formatAge,
      updateAudioBadge: typeof updateAudioBadge === 'function' ? updateAudioBadge : null,
    });
    if (touchFxController) window.HermesTouchFxController = touchFxController;

    if (!(touchMode === 'legacy' && debugTouch)) {
      window.HermesEntertainment?.installTouchControls?.({
        renderer,
        getPacket: () => currentPacket,
        getLiveStatus: () => liveStatus,
        formatAge,
        updateAudioBadge: typeof updateAudioBadge === 'function' ? updateAudioBadge : null,
      });
      return;
    }

    const touchHint = document.createElement('div');
    touchHint.className = 'touch-toast';
    touchHint.textContent = 'Touch map: top diagnostics · left flyby · right showtime · center hello/double showtime · center hold peek · bottom reset';
    document.body.appendChild(touchHint);

    const touchZones = document.createElement('div');
    touchZones.className = 'touch-zones quiet';
    touchZones.setAttribute('aria-hidden', 'true');
    touchZones.innerHTML = '<span data-zone="top"></span><span data-zone="left"></span><span data-zone="center"></span><span data-zone="right"></span><span data-zone="bottom"></span>';
    document.body.appendChild(touchZones);

    const feedBadge = document.createElement('div');
    feedBadge.className = 'feed-badge quiet';
    feedBadge.setAttribute('aria-live', 'polite');
    document.body.appendChild(feedBadge);

    const detailOverlay = document.createElement('section');
    detailOverlay.className = 'detail-overlay quiet';
    detailOverlay.setAttribute('aria-live', 'polite');
    detailOverlay.setAttribute('aria-label', 'Hermes display detail overlay');
    document.body.appendChild(detailOverlay);

    detailOverlay.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      resetScreen();
    });

    document.body.style.touchAction = 'none';
    document.body.addEventListener('contextmenu', (event) => event.preventDefault());
    let toastTimer = window.setTimeout(() => touchHint.classList.add('quiet'), 5200);
    let longPressTimer = null;
    let longPressArmed = false;
    let longPressPointerCount = 0;
    let overlayMode = 'work';
    let overlayTimer = null;
    let overlayDismissTimer = null;
    let tapTimer = null;
    let settleTouchTimer = null;
    let lastCenterTapAt = 0;
    const activePointerIds = new Set();
    let glanceIndex = 0;
    const glanceModes = ['status', 'activity', 'sensors'];

    const showToast = (message) => {
      touchHint.textContent = safeDisplayText(message, 86);
      touchHint.classList.remove('quiet');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => touchHint.classList.add('quiet'), 2600);
    };

    const showRipple = (x, y) => {
      const ripple = document.createElement('span');
      ripple.className = 'touch-ripple';
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      document.body.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 620);
    };

    const pulseZone = (zone) => {
      touchZones.classList.remove('quiet');
      touchZones.querySelectorAll('span').forEach((el) => el.classList.toggle('active', el.dataset.zone === zone));
      window.setTimeout(() => {
        touchZones.classList.add('quiet');
        touchZones.querySelectorAll('span').forEach((el) => el.classList.remove('active'));
      }, 520);
    };

    const updateFeedBadge = () => {
      const freshness = currentPacket.live?.freshness || {};
      const tier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : freshness.tier;
      if (!tier || tier === 'fresh') {
        feedBadge.className = 'feed-badge quiet';
        feedBadge.textContent = '';
        return;
      }
      const label = tier === 'aging' ? 'FEED AGING' : tier === 'lost' ? 'FEED LOST' : 'FEED STALE';
      const age = liveStatus.failures
        ? liveStatus.staleSince ? formatAge(Date.now() - liveStatus.staleSince) : 'now'
        : currentPacket.live?.freshness?.stale_measurements?.length ? `${currentPacket.live.freshness.stale_measurements.length} sensors` : 'telemetry';
      feedBadge.textContent = `${label} · ${age}`;
      feedBadge.className = `feed-badge ${tier === 'lost' ? 'critical' : 'watch'}`;
    };

    const tempText = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°C` : 'n/a';
    const pctText = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : 'n/a';
    const feedAgeText = () => liveStatus.lastGoodAt ? `${formatAge(Date.now() - liveStatus.lastGoodAt)} old` : 'not connected';

    const overlayTitle = (mode) => ({
      sensors: 'LOCAL SENSORS',
      activity: 'CURRENT ACTIVITY',
      status: 'STATUS SUMMARY',
      debug: 'DEBUG SNAPSHOT',
      work: 'WHAT I AM DOING'
    }[mode] || 'WHAT I AM DOING');

    const overlayLines = (mode) => {
      const live = currentPacket.live || {};
      const sys = live.system || {};
      const task = live.kanban?.tasks?.[0];
      const work = live.current_work || {};
      const activity = buildActivityCard(live, currentPacket, liveStatus);
      const freshnessTier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : live.freshness?.tier || 'fresh';
      if (mode === 'sensors') {
        const measurements = sys.measurements || {};
        const sensorLine = (label, key, type, fallbackKey = null) => {
          const measurement = measurements[key] || (fallbackKey ? measurements[fallbackKey] : null) || {};
          const value = measurementValue(sys, key, fallbackKey);
          const status = measurement.status && measurement.status !== 'fresh' ? ` · ${measurement.status}` : '';
          const rendered = metricAvailable(value, measurement)
            ? type === 'temp' ? tempText(value) : pctText(value)
            : 'Unavailable';
          return [label, `${rendered}${status}`];
        };
        return [
          sensorLine('CPU package', 'cpu_temp_c', 'temp', 'temp_c'),
          sensorLine('PCH', 'pch_temp_c', 'temp'),
          sensorLine('CPU load', 'cpu', 'pct'),
          sensorLine('Memory', 'memory', 'pct'),
          ['Sensors', sensorCountLabel(sys, freshnessTier)],
          ['Feed', freshnessTier]
        ];
      }
      if (mode === 'activity') {
        return [
          ['State', activityLabel(live, currentPacket.mood)],
          ['Activity', activity.label],
          ['Summary', activity.summary],
          ['Kind', work.visual_kind || work.kind || 'quiet'],
          ['Tool', work.tool || live.last_tool || 'none recent'],
          ['Age', Number.isFinite(Number(work.age_seconds)) ? `${Math.round(Number(work.age_seconds))}s ago` : 'quiet']
        ];
      }
      if (mode === 'status') {
        return [
          ['Hermes', activityLabel(live, currentPacket.mood)],
          ['Work', activity.summary],
          ['Gateway', live.gateway_ok ? 'ok' : 'watch'],
          ['Feed', freshnessTier === 'fresh' ? feedAgeText() : freshnessTier],
          ['CPU', `${pctText(sys.cpu)} · ${tempText(sys.cpu_temp_c ?? sys.temp_c)}`],
          ['Sound', window.HermesAudio?.isMuted?.() ? 'muted' : 'on']
        ];
      }
      if (mode === 'debug') {
        const debug = displaySafeResolverDebug(currentPacket, liveStatus);
        return [
          ['Display state', debug.display_state || 'quiet_watch'],
          ['Freshness', debug.freshness_tier || 'fresh'],
          ['Gateway', debug.gateway_ok ? 'ok' : 'watch'],
          ['Failures', String(debug.feed_failures)],
          ['Work kind', debug.current_work_kind || 'none'],
          ['Reasons', debug.reason_codes.slice(0, 3).join(', ') || 'none']
        ];
      }
      return [
        ['State', activityLabel(live, currentPacket.mood)],
        ['Doing', task?.title || work.summary || activity.summary || currentPacket.caption?.text || 'Quiet watch'],
        ['Detail', work.detail || currentPacket.snippet?.text || 'No active turn'],
        ['Kind', work.visual_kind || work.kind || 'quiet'],
        ['Session', work.session_label || work.source || 'local display'],
        ['Feed age', feedAgeText()]
      ];
    };

    const renderOverlay = (mode = overlayMode) => {
      overlayMode = mode;
      detailOverlay.dataset.mode = mode;
      const rows = overlayLines(mode);
      detailOverlay.innerHTML = `
        <div class="detail-title">${escapeHtml(overlayTitle(mode))}</div>
        ${rows.map(([k, v]) => `<div class="detail-row"><span>${escapeHtml(safeDisplayText(k, 24))}</span><strong>${escapeHtml(safeDisplayText(v, 64))}</strong></div>`).join('')}
        <div class="detail-foot">tap anywhere to close · safe local summary</div>
      `;
    };

    const showOverlayAfterReaction = (mode, message, delayMs = 420, dismissMs = 7600) => {
      window.clearTimeout(overlayTimer);
      window.clearTimeout(overlayDismissTimer);
      showToast(message || 'One moment');
      overlayTimer = window.setTimeout(() => {
        renderOverlay(mode);
        detailOverlay.classList.remove('quiet');
        showToast(mode === 'sensors' ? 'Sensor detail' : mode === 'activity' ? 'Activity detail' : mode === 'status' ? 'Status summary' : mode === 'debug' ? 'Debug snapshot' : 'Current work');
        overlayDismissTimer = window.setTimeout(() => hideOverlay('Details auto-hidden'), Math.max(3200, dismissMs));
      }, delayMs);
    };

    const hideOverlay = (message = 'Details hidden') => {
      window.clearTimeout(overlayTimer);
      window.clearTimeout(overlayDismissTimer);
      detailOverlay.classList.add('quiet');
      showToast(message);
    };

    const clearTouchPosture = () => {
      window.clearTimeout(settleTouchTimer);
      document.body.removeAttribute('data-touch-posture');
    };

    const setTouchPosture = (posture, durationMs = 1800) => {
      window.clearTimeout(settleTouchTimer);
      document.body.dataset.touchPosture = posture;
      settleTouchTimer = window.setTimeout(() => {
        document.body.removeAttribute('data-touch-posture');
        if (posture !== 'quiet') renderer.triggerIntent('settle');
      }, Math.max(700, durationMs));
    };

    const playWatchSequence = (sequenceId, trigger) => {
      clearTouchPosture();
      window.clearTimeout(overlayTimer);
      window.clearTimeout(overlayDismissTimer);
      if (!detailOverlay.classList.contains('quiet')) detailOverlay.classList.add('quiet');
      const played = window.HermesWatchSequences?.play?.(sequenceId, { trigger });
      if (!played) return false;
      showToast(({ curious_orb: 'Curious orb', feathered_flyby: 'Feathered flyby', mini_showtime: 'Mini-showtime', peek_a_blink: 'Peek-a-blink' })[sequenceId] || 'Playful reaction');
      return true;
    };

    const resetScreen = () => {
      window.clearTimeout(overlayTimer);
      window.clearTimeout(overlayDismissTimer);
      window.clearTimeout(tapTimer);
      clearTouchPosture();
      cancelLongPress();
      detailOverlay.classList.add('quiet');
      touchZones.classList.add('quiet');
      touchZones.querySelectorAll('span').forEach((el) => el.classList.remove('active'));
      renderer.setFrozen(false);
      if (freezeToggle) freezeToggle.textContent = 'Freeze motion';
      renderer.pulseGaze?.('forward_focus', 700);
      renderer.triggerIntent('settle') || renderer.triggerIntent('slow_double_blink');
      showToast('Screen reset');
    };

    const stageRelativePoint = (event) => {
      const root = document.querySelector('#display-root');
      const rect = root?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      return {
        inside: event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom,
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
    };

    const classifyTouchTarget = (event) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const x = event.clientX / w;
      const y = event.clientY / h;

      // Physical 1920x1280 Concept B touch map from Brian's screenshot:
      // top [65,12,1835,126], left [12,158,260,1146], right [1624,158,1912,1146],
      // center circle cx/cy/r ≈ [946,617,370], bottom [66,1180,1835,1279].
      // Keep values normalized so DP-2, browser previews, and future landscape sizes
      // retain the same human-scale hit zones.
      if (y <= 0.098 && x >= 0.034 && x <= 0.956) return { touch_target: 'diagnostics', zone: 'top' };
      if (y >= 0.922 && x >= 0.034 && x <= 0.956) return { touch_target: 'bottom_control', zone: 'bottom' };
      if (y >= 0.123 && y <= 0.895 && x >= 0.006 && x <= 0.135) return { touch_target: 'glance', zone: 'left' };
      if (y >= 0.123 && y <= 0.895 && x >= 0.846 && x <= 0.996) return { touch_target: 'glance', zone: 'right' };

      const dx = event.clientX - (w * 0.493);
      const dy = event.clientY - (h * 0.482);
      const radius = Math.min(w, h) * 0.289;
      if ((dx * dx) + (dy * dy) <= radius * radius) return { touch_target: 'avatar', zone: 'center' };

      // Backward-compatible names retained for the regression gate vocabulary.
      // touch_target: 'rail' / acknowledgeBackgroundTouch now mean edge glances.
      return { touch_target: 'background', zone: x < 0.5 ? 'left' : 'right' };
    };

    const queuedGlanceContext = () => {
      const live = currentPacket.live || {};
      const activity = buildActivityCard(live, currentPacket, liveStatus);
      const hasWork = Boolean(live.current_work?.active || live.kanban?.active || live.kanban?.queued || activity.summary);
      const hasSensors = Boolean(live.system?.measurements || Number.isFinite(Number(live.system?.cpu)) || Number.isFinite(Number(live.system?.memory)) || Number.isFinite(Number(live.system?.temp_c)));
      return glanceModes.filter((mode) => mode === 'sensors' ? hasSensors : hasWork);
    };

    const acknowledgeBackgroundTouch = (zone) => {
      renderer.reactToTouch?.(zone, { intent: zone === 'left' ? 'glance_left' : 'glance_right', holdMs: 620 }) ||
        (renderer.pulseGaze?.(zone, 620), renderer.triggerIntent(zone === 'left' ? 'glance_left' : 'glance_right'));
      showToast('No glance context');
    };

    const handleGlance = (zone) => {
      const available = queuedGlanceContext();
      renderer.reactToTouch?.(zone, { intent: zone === 'left' ? 'glance_left' : 'glance_right', holdMs: 1050 }) ||
        (renderer.pulseGaze?.(zone, 1000), renderer.triggerIntent(zone === 'left' ? 'glance_left' : 'glance_right'));
      if (!available.length) {
        showToast('No queued glance');
        return;
      }
      glanceIndex = (glanceIndex + (zone === 'left' ? -1 : 1) + available.length) % available.length;
      const mode = available[glanceIndex];
      const label = zone === 'left' ? 'Previous glance' : 'Next glance';
      showOverlayAfterReaction(mode, label, 420, 6200);
    };

    const acknowledgeCenter = () => {
      const live = currentPacket.live || {};
      const state = live.resolver?.display_state || '';
      const freshnessTier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : live.freshness?.tier || 'fresh';
      const attentionActive = ['blocked_user_task', 'needs_attention', 'critical_local_issue'].includes(state) || freshnessTier === 'lost' || live.gateway_ok === false;

      setTouchPosture('listening', 1400);
      renderer.reactToTouch?.('center', { intent: attentionActive ? 'slow_double_blink' : 'tiny_perk', holdMs: 950 }) ||
        (renderer.pulseGaze?.('forward_focus', 900), renderer.triggerIntent(attentionActive ? 'slow_double_blink' : 'tiny_perk'));

      if (!detailOverlay.classList.contains('quiet')) {
        hideOverlay('Details hidden');
        return;
      }
      if (attentionActive) {
        showOverlayAfterReaction('status', 'Condition still active', 280, 5200);
        return;
      }
      showToast('Acknowledged');
    };

    const handleTap = (target, event) => {
      const { touch_target, zone } = target;
      showRipple(event.clientX, event.clientY);
      pulseZone(zone);
      if (touch_target === 'bottom_control') {
        if (!detailOverlay.classList.contains('quiet')) hideOverlay('Details hidden');
        else showToast('Details already hidden');
        return;
      }
      if (touch_target === 'diagnostics') {
        showToast('Hold top for diagnostics');
        return;
      }
      if (touch_target === 'glance') {
        playWatchSequence(zone === 'left' ? 'feathered_flyby' : 'mini_showtime', zone === 'left' ? 'tap:left:single' : 'tap:right:single');
        return;
      }
      if (touch_target !== 'avatar') {
        if (!playWatchSequence(zone === 'left' ? 'feathered_flyby' : 'mini_showtime', zone === 'left' ? 'tap:left:single' : 'tap:right:single')) acknowledgeBackgroundTouch(zone);
        return;
      }
      const now = Date.now();
      window.clearTimeout(tapTimer);
      if (lastCenterTapAt && now - lastCenterTapAt < 320) {
        lastCenterTapAt = 0;
        playWatchSequence('mini_showtime', 'tap:center:double');
        return;
      }
      lastCenterTapAt = now;
      tapTimer = window.setTimeout(() => {
        lastCenterTapAt = 0;
        playWatchSequence('curious_orb', 'tap:center:single') || acknowledgeCenter();
      }, 180);
    };

    const toggleMute = () => {
      const muted = window.HermesAudio?.toggleMuted?.() ?? true;
      updateAudioBadge();
      setTouchPosture(muted ? 'quiet' : 'listening', muted ? 6200 : 1600);
      renderer.pulseGaze?.('forward_focus', 900);
      if (muted) renderer.triggerIntent('slow_double_blink') || renderer.triggerIntent('settle');
      else renderer.triggerIntent('tiny_perk');
      showToast(muted ? 'Quiet mode on' : 'Sound back on');
    };

    const showDebugOverlay = () => {
      renderer.triggerIntent('skeptical_squint');
      showOverlayAfterReaction('debug', 'Diagnostics', 320, 7600);
    };

    const acceptsPointer = (event) => event.pointerType !== 'mouse' || allowMouseTouchTest;

    document.body.addEventListener('pointerdown', (event) => {
      if (!acceptsPointer(event)) return;
      activePointerIds.add(event.pointerId);
      if (activePointerIds.size >= 2 || event.isPrimary === false) {
        activePointerIds.clear();
        window.clearTimeout(tapTimer);
        cancelLongPress();
        window.HermesWatchSequences?.abort?.();
        showToast('Stopped');
        return;
      }
      const target = classifyTouchTarget(event);
      longPressArmed = true;
      longPressPointerCount = Math.max(longPressPointerCount || 0, event.isPrimary === false ? 2 : 1);
      window.clearTimeout(longPressTimer);
      longPressTimer = window.setTimeout(() => {
        if (!longPressArmed) return;
        showRipple(event.clientX, event.clientY);
        pulseZone(target.zone);
        publishLocalAvatarEvent('touch.long_press', 'touch_long_press', { side: target.zone, visual_kind: 'touch', label: `${target.zone} hold` });
        if (target.touch_target === 'diagnostics' || (debugTouch && longPressPointerCount >= 2)) showDebugOverlay();
        else if (target.touch_target === 'bottom_control') resetScreen();
        else if (target.touch_target === 'avatar') playWatchSequence('peek_a_blink', 'longpress:center:>500ms') || acknowledgeCenter();
        else if (target.touch_target === 'glance') playWatchSequence(target.zone === 'left' ? 'feathered_flyby' : 'mini_showtime', target.zone === 'left' ? 'swipe:left' : 'tap:right:single') || handleGlance(target.zone);
        else toggleMute();
        longPressArmed = false;
      }, target.touch_target === 'diagnostics' || target.touch_target === 'bottom_control' ? 600 : 750);
    }, { passive: true });

    const cancelLongPress = (event) => {
      if (event?.pointerId !== undefined) activePointerIds.delete(event.pointerId);
      longPressArmed = false;
      longPressPointerCount = 0;
      window.clearTimeout(longPressTimer);
    };
    document.body.addEventListener('pointercancel', cancelLongPress, { passive: true });
    document.body.addEventListener('pointerleave', cancelLongPress, { passive: true });

    document.body.addEventListener('pointerup', (event) => {
      if (!acceptsPointer(event)) return;
      const wasTap = longPressArmed;
      cancelLongPress();
      if (!wasTap) return;
      const target = classifyTouchTarget(event);
      handleTap(target, event);
    }, { passive: true });

    window.addEventListener('hermes-live-packet', () => {
      if (!detailOverlay.classList.contains('quiet')) renderOverlay(overlayMode);
      updateFeedBadge();
    });
    window.addEventListener('hermes-audio-muted', () => updateAudioBadge());

    window.HermesTouch = {
      show: (mode = 'work') => showOverlayAfterReaction(['work', 'sensors', 'activity', 'status', 'debug'].includes(mode) ? mode : 'work', 'Touch preview', 0),
      hide: hideOverlay,
      reset: resetScreen,
      currentMode: () => overlayMode,
      debugEnabled: () => debugTouch
    };

    window.setInterval(updateFeedBadge, 1000);
  }

  function installFamilyModeToggle() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    if (!kiosk) return;

    const FAMILY_HOLD_MS = 1200;
    const HOLD_CANCEL_DISTANCE_PX = 14;
    const REDUCED_HOLD_STEPS = 4;

    // Mode switching is a pure URL rewrite. Entering family mode adds audience=family on
    // top of the live operator query, so the operator setup (augury flags included)
    // round-trips through the URL itself and the return hold restores it exactly.
    // No browser storage of any kind: the only "state" is the display mode in the URL.
    // Privacy holds because every family gate (Augury install, overlay chrome, text
    // swaps) keys off the audience param before any private feature reads its own flag.
    const modeTargetUrl = (toFamily) => {
      const url = new URL(window.location.href);
      ['audience', 'family', 'view'].forEach((key) => url.searchParams.delete(key));
      if (toFamily) url.searchParams.set('audience', 'family');
      return url.toString();
    };

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cb-mode-hold';
    chip.dataset.holdState = 'idle';
    chip.dataset.modeTarget = familyAudience ? 'operator' : 'family';
    chip.setAttribute('aria-label', familyAudience ? 'Hold to return to operator mode' : 'Hold to switch to family mode');
    chip.innerHTML = '<span class="cb-mode-hold-ring" aria-hidden="true"></span><span class="cb-mode-hold-label"></span>';
    const label = chip.querySelector('.cb-mode-hold-label');
    const idleLabel = familyAudience ? 'OPERATOR HOLD' : 'FAMILY HOLD';
    const engagedLabel = familyAudience ? 'OPERATOR MODE' : 'FAMILY MODE';
    label.textContent = idleLabel;
    document.body.appendChild(chip);

    let holdPointerId = null;
    let holdRaf = 0;
    let holdStepTimer = 0;
    let holdStartAt = 0;
    let holdStartX = 0;
    let holdStartY = 0;
    let navigated = false;

    const setProgress = (value) => chip.style.setProperty('--cb-hold-progress', String(clamp01(value)));
    setProgress(0);

    const resetHold = () => {
      if (navigated) return;
      holdPointerId = null;
      window.cancelAnimationFrame(holdRaf);
      window.clearTimeout(holdStepTimer);
      chip.dataset.holdState = 'idle';
      label.textContent = idleLabel;
      setProgress(0);
    };

    const engage = () => {
      if (navigated) return;
      navigated = true;
      window.cancelAnimationFrame(holdRaf);
      window.clearTimeout(holdStepTimer);
      setProgress(1);
      chip.dataset.holdState = 'engaged';
      label.textContent = engagedLabel;
      renderer.triggerIntent?.('tiny_perk');
      window.setTimeout(() => window.location.replace(modeTargetUrl(!familyAudience)), prefersReducedMotion ? 80 : 420);
    };

    const smoothTick = (now) => {
      if (holdPointerId === null || navigated) return;
      const t = (now - holdStartAt) / FAMILY_HOLD_MS;
      if (t >= 1) {
        engage();
        return;
      }
      setProgress(t);
      holdRaf = window.requestAnimationFrame(smoothTick);
    };

    // Reduced motion: no continuous ring sweep. Progress lands in four discrete
    // quarter steps and stops the moment the hold ends, so nothing keeps animating.
    const reducedStep = (step) => {
      holdStepTimer = window.setTimeout(() => {
        if (holdPointerId === null || navigated) return;
        setProgress(step / REDUCED_HOLD_STEPS);
        if (step >= REDUCED_HOLD_STEPS) engage();
        else reducedStep(step + 1);
      }, FAMILY_HOLD_MS / REDUCED_HOLD_STEPS);
    };

    chip.addEventListener('pointerdown', (event) => {
      // Own the gesture completely so touch FX, entertainment gestures, and legacy
      // zone handlers on document.body never see presses on the mode control.
      event.preventDefault();
      event.stopPropagation();
      if (holdPointerId !== null || navigated) return;
      holdPointerId = event.pointerId;
      holdStartX = event.clientX;
      holdStartY = event.clientY;
      holdStartAt = performance.now();
      chip.setPointerCapture?.(event.pointerId);
      chip.dataset.holdState = 'holding';
      setProgress(0);
      if (prefersReducedMotion) reducedStep(1);
      else holdRaf = window.requestAnimationFrame(smoothTick);
    });

    chip.addEventListener('pointermove', (event) => {
      if (event.pointerId !== holdPointerId) return;
      event.stopPropagation();
      if (Math.hypot(event.clientX - holdStartX, event.clientY - holdStartY) > HOLD_CANCEL_DISTANCE_PX) resetHold();
    });

    chip.addEventListener('pointerup', (event) => {
      if (event.pointerId !== holdPointerId) return;
      event.preventDefault();
      event.stopPropagation();
      resetHold();
    });

    chip.addEventListener('pointercancel', (event) => {
      if (event.pointerId === holdPointerId) resetHold();
    });

    window.__HERMES_FAMILY_TOGGLE = {
      holdMs: FAMILY_HOLD_MS,
      mode: () => (familyAudience ? 'family' : 'operator'),
      state: () => chip.dataset.holdState,
      progress: () => Number(chip.style.getPropertyValue('--cb-hold-progress') || 0),
      targetUrl: () => modeTargetUrl(!familyAudience),
    };
  }

  function publishLifecycleEffectForPacket(packet, previousMood) {
    const mode = window.HermesBehaviorMachine?.modeFromPacket?.(packet, 'idle_watch') || 'idle_watch';
    const resolverState = packet?.live?.resolver?.display_state;
    const intentByMode = {
      idle_watch: 'settle',
      notice: 'tiny_perk',
      listening: 'brow_pop',
      reading: 'tiny_perk',
      reasoning: 'tiny_perk',
      tool_shell: 'scan_sweep',
      searching: 'scan_sweep',
      writing: 'tiny_perk',
      waiting_user: 'brow_pop',
      blocked: 'skeptical_squint',
      complete: 'smug_nod',
      degraded_offline: 'slow_double_blink',
    };
    if (resolverState === 'blocked_user_task') renderer.triggerIntent('brow_pop');
    else renderer.triggerIntent(intentByMode[mode] || 'tiny_perk');
    if (mode === 'blocked') window.HermesAudio?.playAttention?.();
    if (previousMood === 'thinking_focused' && packet.mood === 'healthy_smug') window.HermesAudio?.playResolved?.();
  }

  function publishLocalAvatarEvent(eventName, displayIntent, display = {}) {
    const event = {
      schema_version: '0.1.0',
      id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      event: eventName,
      occurred_at: new Date().toISOString(),
      source: 'personal-display.renderer',
      boundary: 'localhost_only',
      privacy: 'display_safe_intent',
      ttl_ms: eventName.startsWith('feed.lost') ? 300000 : eventName.startsWith('feed.') ? 60000 : 12000,
      priority: eventName.startsWith('feed.') ? 'attention' : 'normal',
      display: { intent: displayIntent, label: safeDisplayText(display.label || displayIntent, 48), visual_kind: display.visual_kind || 'unknown', side: display.side || 'center', intensity: clamp(display.intensity ?? 0.55, 0, 1) },
      meta: {}
    };
    applyAvatarEvent(event);
    return event;
  }

  function installLiveHermesState() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    if (!kiosk) return;
    const deterministicPreview = params.get('mode') && !['1', 'true', 'yes'].includes((params.get('live') || '').toLowerCase());
    if (deterministicPreview) return;

    const fixture = params.get('fixture');
    const stateUrl = fixture ? `/api/hermes-state?fixture=${encodeURIComponent(fixture)}` : '/api/hermes-state';

    let lastMood = currentPacket.mood;
    const poll = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(stateUrl, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`state ${response.status}`);
        const packet = await response.json();
        const hadFeedFailures = liveStatus.failures > 0;
        liveStatus.failures = 0;
        liveStatus.lastError = '';
        liveStatus.staleSince = null;
        if (hadFeedFailures) publishLocalAvatarEvent('feed.recovered', 'feed_recovered', { visual_kind: 'recovery', label: 'feed recovered' });
        liveStatus.lastGoodAt = Date.now();
        const normalized = normalizePersonaPacket(packet);
        const candidate = normalizePersonaPacket(ensureRichBehaviorPacket(normalized));
        const behaviorSignature = (value) => JSON.stringify({
          behavior_mode: value.behavior_mode || null,
          state_preset: value.state_preset || null,
          optic_mode: value.optic_state_packet?.mode || null,
          puppet_mode: value.puppet_state_packet?.mode || null,
          optic_posture: value.optic_state_packet ? {
            special: value.optic_state_packet.special || null,
            halo: value.optic_state_packet.halo || null,
            ring: value.optic_state_packet.ring || null,
            breath: value.optic_state_packet.breath || null,
            blink: value.optic_state_packet.blink || null,
            eyes: value.optic_state_packet.eyes || null,
            gaze: value.optic_state_packet.gaze || null,
            glow: value.optic_state_packet.glow ?? null,
          } : null,
          puppet_posture: value.puppet_state_packet ? {
            special: value.puppet_state_packet.special || null,
            halo: value.puppet_state_packet.halo || null,
            ring: value.puppet_state_packet.ring || null,
            breath: value.puppet_state_packet.breath || null,
            blink: value.puppet_state_packet.blink || null,
            eyes: value.puppet_state_packet.eyes || null,
            gaze: value.puppet_state_packet.gaze || null,
            glow: value.puppet_state_packet.glow ?? null,
          } : null,
          severity: value.motion?.severity || value.severity || null,
          freshness: value.live?.freshness?.tier || null,
          snippet_sensitivity: value.snippet?.sensitivity || null,
          contains_credentials: Boolean(value.safety?.contains_credentials),
        });
        const changed = behaviorSignature(candidate) !== behaviorSignature(currentPacket) ||
          candidate.mood !== currentPacket.mood ||
          candidate.skin !== currentPacket.skin ||
          candidate.caption?.text !== currentPacket.caption?.text ||
          candidate.snippet?.text !== currentPacket.snippet?.text ||
          candidate.live?.system?.cpu !== currentPacket.live?.system?.cpu ||
          candidate.live?.system?.memory !== currentPacket.live?.system?.memory ||
          candidate.live?.system?.temp_c !== currentPacket.live?.system?.temp_c ||
          candidate.live?.system?.cpu_temp_c !== currentPacket.live?.system?.cpu_temp_c ||
          candidate.live?.system?.pch_temp_c !== currentPacket.live?.system?.pch_temp_c ||
          candidate.live?.system?.sensor_error !== currentPacket.live?.system?.sensor_error ||
          candidate.live?.system?.thermal_readings !== currentPacket.live?.system?.thermal_readings ||
          candidate.live?.gateway_ok !== currentPacket.live?.gateway_ok ||
          candidate.live?.agents !== currentPacket.live?.agents ||
          candidate.live?.tasks !== currentPacket.live?.tasks ||
          candidate.live?.current_work?.summary !== currentPacket.live?.current_work?.summary ||
          candidate.live?.current_work?.detail !== currentPacket.live?.current_work?.detail ||
          candidate.live?.current_work?.visual_kind !== currentPacket.live?.current_work?.visual_kind;
        if (changed) {
          writePacket(candidate, `Live Hermes state: ${candidate.mood}.`);
          if (candidate.mood !== lastMood) {
            publishLifecycleEffectForPacket(candidate, lastMood);
            lastMood = candidate.mood;
          }
        } else {
          // Keep live resource panels fresh even when the visible mascot mood/text
          // stays stable. Without this, CPU/temp/agent counts can look stale.
          currentPacket = candidate;
          applyMotionVars(currentPacket);
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        }
        const tempC = Number(candidate.live?.system?.temp_c);
        if (Number.isFinite(tempC) && tempC >= 90) window.HermesAudio?.playTempAlert?.();
      } catch (error) {
        liveStatus.failures += 1;
        if (!liveStatus.staleSince) liveStatus.staleSince = Date.now();
        liveStatus.lastError = error?.name === 'AbortError' ? 'state feed timeout' : String(error.message || error);
        if (liveStatus.failures === 2) publishLocalAvatarEvent('feed.stale', 'feed_stale', { visual_kind: 'feed', label: 'feed stale' });
        if (liveStatus.failures === 8) publishLocalAvatarEvent('feed.lost', 'feed_lost', { visual_kind: 'feed', label: 'feed lost' });
        if (liveStatus.failures >= 2) {
          const degraded = clone(currentPacket);
          const quietFor = liveStatus.lastGoodAt ? `quiet ${formatAge(Date.now() - liveStatus.lastGoodAt)}` : 'not connected yet';
          degraded.caption = { ...(degraded.caption || {}), text: workSummaryForDegraded(degraded, quietFor) };
          degraded.snippet = { id: 'state-feed', text: liveStatus.lastError.slice(0, 64), kind: 'system', sensitivity: 'display_safe' };
          degraded.live = degraded.live || {};
          degraded.live.freshness = {
            ...(degraded.live.freshness || {}),
            tier: liveStatus.failures >= 8 ? 'lost' : 'stale',
            stale_measurements: degraded.live.freshness?.stale_measurements || []
          };
          writePacket(degraded, 'Live Hermes state feed unavailable.');
        }
      } finally {
        window.clearTimeout(timeout);
        window.setTimeout(poll, liveStatus.failures ? 6000 : 2500);
      }
    };
    poll();
  }

  function installAvatarEventBus() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    const deterministicPreview = params.get('mode') && !['1', 'true', 'yes'].includes((params.get('live') || '').toLowerCase());
    if (!kiosk || deterministicPreview || !window.EventSource) return;

    const allowedEvents = new Set([
      'assistant.started', 'assistant.tool_started', 'assistant.tool_finished', 'assistant.waiting_on_user',
      'assistant.final_started', 'assistant.final_complete', 'system.display_recovered', 'touch.tap',
      'touch.long_press', 'feed.stale', 'feed.lost', 'feed.recovered'
    ]);
    const allowedIntents = new Set([
      'assistant_active', 'tool_active', 'tool_settled', 'waiting_on_user', 'finalizing', 'final_complete',
      'display_recovered', 'touch_tap', 'touch_long_press', 'feed_stale', 'feed_lost', 'feed_recovered'
    ]);
    const allowedPriorities = new Set(['ambient', 'normal', 'attention', 'recovery']);
    const allowedVisualKinds = new Set(['shell', 'python', 'reading', 'searching', 'patching', 'writing', 'planning', 'reasoning', 'recalling', 'compressing', 'touch', 'feed', 'recovery', 'unknown']);
    const allowedGlyphs = new Set(['terminal', 'python', 'book', 'search', 'patch', 'pen', 'plan', 'brain', 'memory', 'zip', 'tap', 'warning', 'check', 'none']);
    const allowedSides = new Set(['left', 'center', 'right', 'top', 'bottom']);
    const allowedTopLevel = new Set(['schema_version', 'id', 'event', 'occurred_at', 'source', 'boundary', 'privacy', 'ttl_ms', 'priority', 'display', 'sequence', 'correlation_id', 'meta']);
    const allowedDisplayFields = new Set(['intent', 'label', 'visual_kind', 'glyph', 'intensity', 'side']);
    const allowedMetaFields = new Set(['tool_kind', 'duration_ms', 'result', 'failure_kind', 'feed_age_ms', 'tap_count']);
    const credentialLike = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(bearer|token|api[_-]?key|password|passwd|secret|cookie)\b\s*[:=]\s*['\"]?[^\s'\"]{8,}|\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b)/i;
    const displayUnsafe = [
      /(^|\s)(?:\/[A-Za-z0-9._~@+-][^\s]{1,}|~(?:\/|\\)[^\s]+|[A-Za-z]:\\[^\s]+)/,
      /\b[A-Za-z0-9._-]+(?:\/|\\)[A-Za-z0-9._/\\-]+\b/i,
      /\b(system|developer|user|assistant)\s+prompt\b|\bprompt\s*[:=]|\bchain[-_ ]?of[-_ ]?thought\b|\bcot\s*[:=]/i,
      /\b(traceback \(most recent call last\)|uncaught (?:type|reference|syntax)?error|exception\s*[:=]|(?:error|warn|info|debug)\s*[:=])/i
    ];
    const forbiddenKeys = new Set(['prompt', 'chain_of_thought', 'cot', 'final_answer', 'answer', 'log', 'logs', 'traceback', 'exception', 'raw', 'body', 'message_body', 'tool_output', 'tool_input', 'file_path', 'env']);

    const reject = (reason) => {
      avatarEventStatus.dropped += 1;
      avatarEventStatus.lastError = safeDisplayText(reason || 'invalid avatar event', 80);
      window.dispatchEvent(new CustomEvent('hermes-avatar-event', { detail: avatarEventDebug() }));
      return null;
    };

    const stringsAndKeys = (value) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(stringsAndKeys);
      if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, val]) => [String(key), ...stringsAndKeys(val)]);
      }
      return [];
    };

    const validateClientEvent = (event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) return reject('event root must be object');
      if (JSON.stringify(event).length > 2048) return reject('event too large');
      const required = ['schema_version', 'id', 'event', 'occurred_at', 'source', 'boundary', 'privacy', 'ttl_ms', 'priority', 'display'];
      const missing = required.filter((key) => !(key in event));
      if (missing.length) return reject(`missing ${missing[0]}`);
      if (Object.keys(event).some((key) => !allowedTopLevel.has(key))) return reject('unknown top-level field');
      if (Object.keys(event).some((key) => forbiddenKeys.has(String(key).toLowerCase()))) return reject('forbidden field');
      if ('sequence' in event && !Number.isInteger(event.sequence)) return reject('bad sequence');
      if ('correlation_id' in event && (typeof event.correlation_id !== 'string' || event.correlation_id.length < 1 || event.correlation_id.length > 80)) return reject('bad correlation id');
      if (event.schema_version !== '0.1.0') return reject('bad schema');
      if (typeof event.id !== 'string' || event.id.length < 1 || event.id.length > 96) return reject('bad id');
      if (typeof event.source !== 'string' || event.source.length < 1 || event.source.length > 80) return reject('bad source');
      if (!allowedEvents.has(event.event)) return reject('event not allowed');
      if (event.boundary !== 'localhost_only' || event.privacy !== 'display_safe_intent') return reject('bad boundary/privacy');
      if (!allowedPriorities.has(event.priority)) return reject('priority not allowed');
      if (!Number.isInteger(event.ttl_ms) || event.ttl_ms < 250 || event.ttl_ms > 300000) return reject('bad ttl');
      if (Number.isNaN(Date.parse(event.occurred_at))) return reject('bad timestamp');
      const display = event.display || {};
      if (!display || typeof display !== 'object' || Array.isArray(display)) return reject('bad display');
      if (Object.keys(display).some((key) => !allowedDisplayFields.has(key))) return reject('unknown display field');
      if (!allowedIntents.has(display.intent)) return reject('intent not allowed');
      if (typeof display.label !== 'string' || display.label.length < 1 || display.label.length > 48) return reject('bad label');
      if (display.visual_kind && !allowedVisualKinds.has(display.visual_kind)) return reject('visual kind not allowed');
      if (display.glyph && !allowedGlyphs.has(display.glyph)) return reject('glyph not allowed');
      if (display.side && !allowedSides.has(display.side)) return reject('side not allowed');
      if ('intensity' in display && (!Number.isFinite(Number(display.intensity)) || Number(display.intensity) < 0 || Number(display.intensity) > 1)) return reject('bad intensity');
      const meta = event.meta || {};
      if (event.meta !== undefined && (!event.meta || typeof event.meta !== 'object' || Array.isArray(event.meta))) return reject('bad meta');
      if (Object.keys(meta).some((key) => !allowedMetaFields.has(key))) return reject('unknown meta field');
      if (Object.keys(meta).some((key) => forbiddenKeys.has(String(key).toLowerCase()))) return reject('forbidden meta field');
      if (stringsAndKeys(event).some((text) => credentialLike.test(text))) return reject('credential-like string');
      if (stringsAndKeys(event).some((text) => displayUnsafe.some((pattern) => pattern.test(text)))) return reject('display-unsafe string');
      const expiresAt = Date.parse(event.occurred_at) + event.ttl_ms;
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return reject('expired event');
      return event;
    };

    const source = new EventSource('/avatar-events/stream');
    source.onopen = () => {
      avatarEventStatus.connected = true;
      avatarEventStatus.lastError = '';
      window.dispatchEvent(new CustomEvent('hermes-avatar-event', { detail: avatarEventDebug() }));
    };
    source.onerror = () => {
      avatarEventStatus.connected = false;
      avatarEventStatus.lastError = 'event bus unavailable';
      window.dispatchEvent(new CustomEvent('hermes-avatar-event', { detail: avatarEventDebug() }));
    };
    allowedEvents.forEach((eventName) => {
      source.addEventListener(eventName, (message) => {
        try {
          const event = validateClientEvent(JSON.parse(message.data));
          if (!event) return;
          applyAvatarEvent(event);
        } catch (error) {
          reject(error?.message || 'invalid event payload');
        }
      });
    });
  }

  function applyAvatarEvent(event) {
    const display = event.display || {};
    avatarEventStatus.accepted += 1;
    avatarEventStatus.lastEventAt = Date.now();
    avatarEventStatus.lastError = '';
    avatarEventStatus.recent = [{
      id: safeDisplayText(event.id, 96),
      event: safeDisplayText(event.event, 40),
      intent: safeDisplayText(display.intent, 32),
      label: safeDisplayText(display.label, 48),
      visual_kind: safeDisplayText(display.visual_kind || 'unknown', 24),
      occurred_at: safeDisplayText(event.occurred_at, 40)
    }, ...avatarEventStatus.recent].slice(0, 8);

    const behaviorEvents = window.HermesBehaviorMachine?.behaviorEventsForAvatarEvent?.(event) || [];
    if (behaviorEvents.length && window.__HERMES_DISPLAY_BEHAVIOR?.sendAll) {
      window.__HERMES_DISPLAY_BEHAVIOR.sendAll(behaviorEvents);
      const mode = window.__HERMES_DISPLAY_BEHAVIOR.mode;
      const richBase = window.HermesBehaviorMachine?.renderPacketForBehaviorMode?.(mode, currentPacket)
        || window.HermesBehaviorMachine?.packetForMode?.(mode, currentPacket);
      const packet = window.HermesBehaviorMachine?.packetForAvatarEvent?.(event, mode, richBase)
        || richBase;
      if (packet) writePacket(packet, `Avatar event: ${safeDisplayText(display.label || display.intent, 48)}.`);
      window.__HERMES_SYNC_OVERLAYS?.();
    }
    renderer.ingestAvatarEvent?.(event);
    output.value = `Avatar event: ${safeDisplayText(display.label || display.intent, 48)}.`;
    window.dispatchEvent(new CustomEvent('hermes-avatar-event', { detail: avatarEventDebug() }));
  }

  function avatarEventDebug() {
    return {
      connected: avatarEventStatus.connected,
      accepted: avatarEventStatus.accepted,
      dropped: avatarEventStatus.dropped,
      lastError: avatarEventStatus.lastError,
      lastEventAgeMs: avatarEventStatus.lastEventAt ? Date.now() - avatarEventStatus.lastEventAt : null,
      recent: avatarEventStatus.recent.map((event) => ({ ...event }))
    };
  }

  function installAuguryOverlay() {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get('augury') || '').toLowerCase();
    if (familyAudience) {
      document.body.dataset.auguryPresence = 'hidden';
      window.__hermesAuguryDebug = () => ({ enabled: false, reason: 'family-audience' });
      return;
    }
    if (!['1', 'true', 'yes', 'preview'].includes(raw)) return;
    const includeBodyText = ['1', 'true', 'yes'].includes((params.get('auguryText') || '').toLowerCase());
    const proofEnabled = ['1', 'true', 'yes', 'preview'].includes(raw) && ['1', 'true', 'yes'].includes((params.get('debug') || params.get('qa') || '').toLowerCase());

    const MAX_STRANDS = 11;
    const POLL_MS = 5200;
    const POLL_BACKOFF_MS = 22000;
    const MAX_TEXT_CHARS = 220;
    // Display-safe rows (current_work card, captions, snippets) already pass the
    // server's display-safety pipeline and are shown center-screen elsewhere, so
    // they may render their text without auguryText=1. Raw agent.log excerpts
    // never get this flag.
    const SAFE_TEXT_CHARS = 150;
    // Augury runs on a private home-LAN appliance, so this client-side filter
    // only enforces the *hard* credential redaction (API keys, bearer tokens,
    // private keys, JWTs). Display safety for paths/prompts is already enforced
    // server-side in build_augury_feed; we don't want to double-redact normal
    // text or we lose the visual richness the overlay is for.
    const credentialLike = new RegExp(
      '(-----BEGIN [A-Z ]*PRIVATE KEY-----|' +
      '\\b(?:bearer|token|api[_-]?key|password|passwd|secret|cookie)\\b\\s*[:=]\\s*[\'"]?[^\\s\'"]{8,}|' +
      '\\bbearer\\s+[A-Za-z0-9._~+/=\\-]{16,}\\b|' +
      '\\bauthorization\\s*[:=]\\s*[^\\s\'"]{12,}|' +
      '\\b[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\b|' +
      '\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b|' +
      '\\bsk-[A-Za-z0-9_-]{20,}\\b|' +
      '\\b[A-Za-z0-9+/]{60,}={0,2}\\b)',
      'gi'
    );

    const auguryClean = (value, max = MAX_TEXT_CHARS) => {
      let s = String(value ?? '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      s = s.replace(credentialLike, '[redacted]');
      const limit = Math.max(16, Number(max) || MAX_TEXT_CHARS);
      return s.length > limit ? `${s.slice(0, limit - 1).trimEnd()}…` : s;
    };

    // Structural trace metadata (age, session tail) is not raw log text; it keeps
    // the stream legible as a living agent trace even when body text is gated.
    const auguryMeta = (raw) => {
      const age = Number(raw?.age_seconds);
      const ageLabel = Number.isFinite(age) && age >= 0
        ? (age < 90 ? `T-${Math.round(age)}S` : age < 5400 ? `T-${Math.round(age / 60)}M` : `T-${Math.round(age / 3600)}H`)
        : '';
      const sessionRaw = auguryClean(raw?.session_id || raw?.session_label || '', 24);
      const sessionTail = sessionRaw ? `S/${sessionRaw.slice(-6).toUpperCase()}` : '';
      return [ageLabel, sessionTail].filter(Boolean).join(' · ');
    };

    document.body.classList.add('augury-preview');
    document.body.dataset.auguryPresence = document.body.dataset.auguryPresence || 'ambient';

    const root = document.createElement('div');
    root.className = 'augury-ambient';
    root.setAttribute('aria-hidden', 'true');
    root.dataset.source = 'idle';
    document.body.appendChild(root);
    if (proofEnabled) {
      const proof = document.createElement('div');
      proof.className = 'augury-proof qa-visible';
      proof.textContent = 'PRIVATE AUGURY';
      document.body.appendChild(proof);
    }

    const strands = [];
    for (let i = 0; i < MAX_STRANDS; i += 1) {
      const strand = document.createElement('div');
      strand.className = 'augury-strand';
      strand.dataset.lane = String(i);
      strand.style.setProperty('--augury-lane', String(i));
      const headEl = document.createElement('span');
      headEl.className = 'augury-head';
      const kindEl = document.createElement('span');
      kindEl.className = 'augury-kind';
      const titleEl = document.createElement('span');
      titleEl.className = 'augury-title';
      const metaEl = document.createElement('span');
      metaEl.className = 'augury-meta';
      headEl.append(kindEl, titleEl, metaEl);
      const textEl = document.createElement('span');
      textEl.className = 'augury-text';
      strand.append(headEl, textEl);
      strand.dataset.populated = 'false';
      root.appendChild(strand);
      strands.push({ strand, kindEl, titleEl, metaEl, textEl });
    }

    const allowedKinds = new Set(['prompt', 'tool', 'thinking', 'log']);

    // trustSafe only applies to rows this client constructed (packet fallback,
    // feed current_work card); feed log items have safeText stripped before they
    // reach here so a malformed payload cannot self-elevate past the text gate.
    const sanitizeItems = (items, trustSafe = false) => {
      if (!Array.isArray(items)) return [];
      return items
        .map((raw) => {
          const kind = String(raw?.kind || 'log').toLowerCase();
          const safeRow = trustSafe && raw?.safeText === true;
          const rawTitle = auguryClean(raw?.title || raw?.activity || raw?.summary || kind, 48);
          // Server titles like "tool Bash" repeat the kind chip; trim the echo,
          // and blank titles that only restate the kind (the chip already shows it).
          let title = rawTitle.toLowerCase().startsWith(`${kind} `)
            ? (rawTitle.slice(kind.length + 1) || kind)
            : rawTitle;
          if (title.toLowerCase() === kind) title = '';
          return {
            kind: allowedKinds.has(kind) ? kind : 'log',
            title,
            rawTitle,
            meta: auguryMeta(raw),
            text: includeBodyText
              ? auguryClean(raw?.text || raw?.activity || raw?.summary || '', MAX_TEXT_CHARS)
              : safeRow
                ? auguryClean(raw?.text || raw?.activity || raw?.summary || '', SAFE_TEXT_CHARS)
                : auguryClean(raw?.activity || raw?.summary || raw?.title || kind, 72),
          };
        })
        // A text row that merely repeats the title reads as filler; drop it and
        // let the head row (kind, title, meta) carry the strand.
        .map((item) => (item.text && (item.text === item.title || item.text === item.rawTitle) ? { ...item, text: '' } : item))
        .filter((item) => item.text || item.title || item.meta);
    };

    let lastAugurySignature = '';
    const renderRows = (items, source, trustSafe = false) => {
      const safe = sanitizeItems(items, trustSafe).slice(0, MAX_STRANDS);
      const signature = safe.slice(0, 3).map((item) => `${item.kind}:${item.title}:${item.text}`).join('|');
      if (signature && lastAugurySignature && signature !== lastAugurySignature) {
        const now = Date.now();
        if (now - (window.__HERMES_LAST_AUGURY_GLANCE_AT || 0) > 6500) {
          window.__HERMES_LAST_AUGURY_GLANCE_AT = now;
          window.__HERMES_CONCEPT_B_EYE_MOTION?.forceGaze?.('augury_left', 850);
          window.__HERMES_CONCEPT_B_EYE_MOTION?.pulse?.('notice');
        }
      }
      if (signature) lastAugurySignature = signature;
      // Only populate strands with real items; never echo/duplicate rows to fill the field.
      // Empty strands stay unpopulated so on-glass density matches actual log volume.
      const visible = Array.from({ length: MAX_STRANDS }, (_, idx) => safe[idx] || null);
      const renderSignature = `${source || 'idle'}|${safe.length}|${visible.map((item) => item ? `${item.kind}:${item.title}:${item.meta}:${item.text}` : '').join('|')}`;
      if (renderRows.lastRenderSignature === renderSignature) return;
      renderRows.lastRenderSignature = renderSignature;
      setConceptBDataset(root, 'source', source || 'idle');
      setConceptBDataset(root, 'count', String(safe.length));
      strands.forEach((row, idx) => {
        const item = visible[idx];
        if (!item) {
          setConceptBDataset(row.strand, 'populated', 'false');
          setConceptBDataset(row.strand, 'kind', '');
          setConceptBDataset(row.strand, 'echo', 'false');
          setConceptBText(row.kindEl, '');
          setConceptBText(row.titleEl, '');
          setConceptBText(row.metaEl, '');
          setConceptBText(row.textEl, '');
          return;
        }
        setConceptBDataset(row.strand, 'populated', 'true');
        setConceptBDataset(row.strand, 'kind', item.kind);
        setConceptBDataset(row.strand, 'echo', 'false');
        setConceptBText(row.kindEl, item.kind.toUpperCase());
        setConceptBText(row.titleEl, item.title);
        setConceptBText(row.metaEl, item.meta || '');
        setConceptBText(row.textEl, item.text);
      });
    };

    let feedItems = [];
    let feedWork = null;
    let lastFeedAt = 0;

    // The feed's current_work card is built server-side from display-safe fields
    // (the same summary/detail already shown center-screen), so its text may
    // render without auguryText=1.
    const currentWorkRows = (card) => {
      if (!card || typeof card !== 'object') return [];
      const rows = [];
      const session = card.session_id || card.session_label || '';
      if (card.summary) rows.push({ kind: card.kind || 'log', title: 'NOW', text: card.summary, safeText: true, age_seconds: card.age_seconds, session_id: session });
      if (card.detail && card.detail !== card.summary) rows.push({ kind: 'log', title: 'STATUS', text: card.detail, safeText: true, session_id: session });
      return rows;
    };

    const renderFromPacket = (packet) => {
      // Only fall back to packet-derived rows if the feed is missing or stale.
      if (feedItems.length && Date.now() - lastFeedAt < POLL_BACKOFF_MS) return;
      const live = packet?.live || {};
      const work = live.current_work || {};
      const fallback = [];
      if (work.summary) fallback.push({ kind: work.visual_kind || 'log', title: 'CURRENT', text: work.summary, safeText: true, age_seconds: work.age_seconds, session_id: work.session_id || work.session_label });
      if (work.detail && work.detail !== work.summary) fallback.push({ kind: 'log', title: 'STATUS', text: work.detail, safeText: true });
      if (packet?.caption?.text) fallback.push({ kind: 'log', title: 'STATE', text: packet.caption.text, safeText: true });
      if (packet?.snippet?.text && packet.snippet.sensitivity === 'display_safe') fallback.push({ kind: 'thinking', title: 'SIGNAL', text: packet.snippet.text, safeText: true });
      const session = live.active_sessions?.[0];
      if (session?.session_label) fallback.push({ kind: 'prompt', title: 'SESSION', text: session.session_label, safeText: true });
      if (!fallback.length) return;
      renderRows(fallback, 'packet', true);
    };

    let fetchPending = false;
    const pollFeed = async () => {
      if (fetchPending) return;
      fetchPending = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch('/api/augury-feed?limit=12&minutes=30', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`augury ${response.status}`);
        const payload = await response.json();
        if (payload?.schema_version !== '0.1.0') throw new Error('unexpected schema');
        feedItems = Array.isArray(payload.items) ? payload.items : [];
        feedWork = payload.current_work && typeof payload.current_work === 'object' ? payload.current_work : null;
        lastFeedAt = Date.now();
        // Strip safeText from raw log items so only client-built rows can use it.
        const rows = [...currentWorkRows(feedWork), ...feedItems.map((item) => ({ ...item, safeText: false }))];
        if (rows.length) renderRows(rows, 'feed', true);
        else renderFromPacket(currentPacket);
      } catch {
        // Feed unavailable; fall back to the live packet on the next event.
        renderFromPacket(currentPacket);
      } finally {
        window.clearTimeout(timeout);
        fetchPending = false;
      }
    };

    pollFeed();
    const pollTimer = window.setInterval(pollFeed, POLL_MS);

    window.addEventListener('hermes-live-packet', (event) => {
      renderFromPacket(event?.detail || currentPacket);
    });

    window.__hermesAuguryDebug = () => ({
      enabled: true,
      sourceMode: raw,
      bodyTextEnabled: includeBodyText,
      strandCount: strands.length,
      lastFeedAgeMs: lastFeedAt ? Date.now() - lastFeedAt : null,
      feedItems: feedItems.length,
      feedWorkActive: Boolean(feedWork?.summary),
      pollIntervalMs: POLL_MS,
      pollTimerId: pollTimer,
    });
  }

  function installLandscapePanels() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    if (!kiosk) return;

    document.body.dataset.dashboard = 'claude-concept-b';
    document.body.dataset.audience = familyAudience ? 'family' : 'operator';
    document.body.classList.add('claude-concept-b');
    document.body.classList.toggle('family-theater', familyAudience);
    document.querySelector('.shell')?.remove();

    const top = document.createElement('header');
    top.className = 'cb-topbar';
    top.innerHTML = `
      <div class="cb-id"><span class="cb-mark" aria-hidden="true">☤</span><strong>HERMES</strong><span>NUC · LOCAL OPERATOR</span></div>
      <div class="cb-time"><strong data-cb-time>--:--</strong><span data-cb-uptime>LOCAL TIME</span></div>
    `;

    const hud = document.createElement('section');
    hud.className = 'cb-radial-stage';
    hud.setAttribute('aria-label', 'Hermes optic core dashboard');
    hud.dataset.buildId = DISPLAY_BUILD_ID;
    hud.innerHTML = `
      <svg class="cb-radial-svg" viewBox="0 0 1100 1100" aria-hidden="true">
        <defs>
          <radialGradient id="cb-core-glow" cx="50%" cy="50%" r="50%" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="var(--cb-accent)" stop-opacity="0.26" />
            <stop offset="48%" stop-color="var(--cb-accent)" stop-opacity="0.09" />
            <stop offset="100%" stop-color="var(--cb-accent)" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="cb-eye-scan-gradient" x1="550" y1="376" x2="550" y2="550" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="var(--cb-accent)" stop-opacity="0" />
            <stop offset="52%" stop-color="var(--cb-accent)" stop-opacity="0.7" />
            <stop offset="100%" stop-color="var(--cb-accent)" stop-opacity="0" />
          </linearGradient>
          <clipPath id="cb-eye-lens-clip">
            <circle cx="550" cy="550" r="176" />
          </clipPath>
        </defs>
        <g class="cb-outer-field">
          <circle class="cb-listening-ripple" cx="550" cy="550" r="302" />
          <circle class="cb-glow" cx="550" cy="550" r="370" />
          <g class="cb-status-rings">
            <g class="cb-orbit-spin"><circle class="cb-orbit cb-orbit-main" cx="550" cy="550" r="410" /></g>
            <circle class="cb-orbit cb-orbit-soft" cx="550" cy="550" r="326" />
            <circle class="cb-orbit cb-orbit-faint" cx="550" cy="550" r="226" />
          </g>
          <line class="cb-axis" x1="146" y1="550" x2="954" y2="550" />
          <line class="cb-axis cb-axis-vertical" x1="550" y1="146" x2="550" y2="954" />
          <line class="cb-cardinal cb-cardinal-left" x1="364" y1="550" x2="402" y2="550" />
          <line class="cb-cardinal cb-cardinal-right" x1="698" y1="550" x2="736" y2="550" />
          <line class="cb-cardinal cb-cardinal-top" x1="550" y1="364" x2="550" y2="402" />
          <line class="cb-cardinal cb-cardinal-bottom" x1="550" y1="698" x2="550" y2="736" />
          <g class="cb-field-instrumentation" aria-hidden="true">
            <g class="cb-field-focus-rings">
              <circle class="cb-field-ring cb-field-ring-a" cx="550" cy="550" r="315" />
              <circle class="cb-field-ring cb-field-ring-b" cx="550" cy="550" r="274" />
              <circle class="cb-field-ring cb-field-ring-c" cx="550" cy="550" r="216" />
            </g>
            <g class="cb-field-compass"></g>
            <g class="cb-field-motes"></g>
            <g class="cb-field-trace"></g>
            <g class="cb-field-tool-precision" aria-hidden="true">
              <path class="cb-field-tool-arc" d="M 410 742 A 236 236 0 0 0 690 742" />
              <path class="cb-field-tool-arc cb-field-tool-arc-inner" d="M 454 708 A 178 178 0 0 0 646 708" />
            </g>
            <g class="cb-field-blocked-brackets" aria-hidden="true">
              <path class="cb-field-bracket cb-field-bracket-left" d="M 348 430 L 316 430 L 316 670 L 348 670" />
              <path class="cb-field-bracket cb-field-bracket-right" d="M 752 430 L 784 430 L 784 670 L 752 670" />
            </g>
            <g class="cb-field-notice-pulse"><circle class="cb-field-pulse" cx="550" cy="550" r="244" /></g>
          </g>
          <g class="cb-eye-gaze">
            <g class="cb-eye-core" aria-hidden="true">
              <circle class="cb-eye-aura" cx="550" cy="550" r="230" />
              <circle class="cb-eye-calibration" cx="550" cy="550" r="226" />
              <g class="cb-aperture-shell">
                <path class="cb-winglet cb-winglet-left" d="M 350 550 C 386 530 410 518 438 514" />
                <path class="cb-winglet cb-winglet-right" d="M 750 550 C 714 530 690 518 662 514" />
                <path class="cb-helmet-brow" d="M 424 482 C 474 428 626 428 676 482" />
              </g>
              <g class="cb-eye-iris">
                <circle class="cb-eye-lens" cx="550" cy="550" r="178" />
                <circle class="cb-eye-ring" cx="550" cy="550" r="179" />
                <g class="cb-eye-lens-contents" clip-path="url(#cb-eye-lens-clip)">
                  <g class="cb-iris-lattice" aria-hidden="true"></g>
                  <g class="cb-eye-special cb-eye-grid" aria-hidden="true"></g>
                  <g class="cb-eye-special cb-eye-scan" aria-hidden="true">
                    <rect class="cb-eye-scan-band" x="546" y="376" width="8" height="174" rx="4" />
                    <line class="cb-eye-scan-line" x1="550" y1="548" x2="550" y2="380" />
                  </g>
                  <path class="cb-eye-glass-sheen" d="M 446 496 C 496 430 614 420 670 486 C 615 462 516 468 462 528" />
                  <path class="cb-eye-glass-crescent" d="M 454 618 C 516 674 620 660 676 596" />
                  <g class="cb-eye-pupil-group">
                    <circle class="cb-eye-pupil" cx="550" cy="550" r="44" />
                    <circle class="cb-eye-dot cb-eye-dot-a" cx="532" cy="526" r="9" />
                    <circle class="cb-eye-dot cb-eye-dot-b" cx="576" cy="572" r="4.5" />
                    <circle class="cb-eye-dot cb-eye-dot-c" cx="560" cy="512" r="3.2" />
                  </g>
                </g>
                <g class="cb-eye-lid-group" clip-path="url(#cb-eye-lens-clip)">
                  <path class="cb-eye-lid cb-eye-lid-top" />
                  <path class="cb-eye-lid cb-eye-lid-bottom" />
                </g>
              </g>
            </g>
          </g>
        </g>
        <g data-cb-arc="cpu"><path class="cb-arc-track"/><path class="cb-arc-fill"/><circle class="cb-arc-dot" r="4"/><text class="cb-arc-label"></text><text class="cb-arc-value"></text></g>
        <g data-cb-arc="mem"><path class="cb-arc-track"/><path class="cb-arc-fill"/><circle class="cb-arc-dot" r="4"/><text class="cb-arc-label"></text><text class="cb-arc-value"></text></g>
        <g data-cb-arc="temp"><path class="cb-arc-track"/><path class="cb-arc-fill"/><circle class="cb-arc-dot" r="4"/><text class="cb-arc-label"></text><text class="cb-arc-value"></text></g>
      </svg>
      <div class="cb-activity">
        <div class="cb-state"><span data-cb-state-dot></span><strong data-cb-state>QUIET WATCH</strong></div>
        <div class="cb-line"><span data-cb-activity>Watching local systems quietly.</span><span class="cb-cadence-caret" data-cb-caret aria-hidden="true">▍</span></div>
        <div class="cb-source" data-cb-source>LOCAL · READY</div>
      </div>
      <div class="cb-offline-bubble quiet" data-cb-offline-bubble aria-live="polite">
        <span class="cb-offline-runner" aria-hidden="true"></span>
        <strong>I’m offline — trying again</strong>
        <em>${CONCEPT_B_FEEL.offlineBackoffLabel}</em>
      </div>
    `;

    const rail = document.createElement('footer');
    rail.className = 'cb-bottom-rail';
    rail.innerHTML = `
      <div class="cb-cell"><span>GATEWAY</span><div><i data-cb-gateway-dot></i><strong data-cb-gateway>GATEWAY WATCH</strong></div></div>
      <div class="cb-cell"><span>FEED</span><div><i data-cb-feed-dot></i><strong data-cb-feed>FEED FRESH</strong><em data-cb-feed-age>--</em></div></div>
      <div class="cb-cell"><span>REMOTE MEMORY</span><div><i data-cb-memory-dot></i><strong data-cb-memory>HONCHO --</strong><em data-cb-memory-age>--</em></div></div>
      <div class="cb-cell"><span>TASKS</span><div><i data-cb-task-dot></i><strong data-cb-tasks>--</strong><em data-cb-task-hint>local work</em></div></div>
    `;

    const attention = document.createElement('div');
    attention.className = 'cb-attention quiet';
    attention.innerHTML = '<i></i><strong data-cb-attention></strong><em data-cb-attention-age></em>';

    const topAlert = document.createElement('div');
    topAlert.className = 'cb-top-alert quiet';
    topAlert.setAttribute('aria-live', 'polite');
    topAlert.innerHTML = '<strong data-cb-top-alert></strong><em data-cb-top-alert-detail></em>';

    const routeRail = createConceptBRouteRail();

    const conceptBTouchMode = (params.get('touch') || 'fun').toLowerCase();
    const showDeveloperTouchGrid = conceptBTouchMode === 'legacy' &&
      ['1','true','yes'].includes((params.get('debug') || '').toLowerCase()) &&
      ['1','true','yes'].includes((params.get('touchzones') || '').toLowerCase());
    let touchOverlay = null;
    if (showDeveloperTouchGrid) {
      touchOverlay = document.createElement('div');
      touchOverlay.className = 'cb-touch-zones visible';
      touchOverlay.innerHTML = `
        <div class="cb-touch cb-touch-top"><span>TOP — DEVELOPER DIAGNOSTICS · LONG PRESS</span></div>
        <div class="cb-touch cb-touch-left"><span>LEFT — DEVELOPER GRID</span></div>
        <div class="cb-touch cb-touch-right"><span>RIGHT — DEVELOPER GRID</span></div>
        <div class="cb-touch cb-touch-bottom"><span>BOTTOM — DEVELOPER RESET GRID</span></div>
        <div class="cb-touch cb-touch-center"><span>CENTER — DEVELOPER GRID</span></div>
      `;
    }

    const opticDebug = installConceptBOpticDebug(params, hud);
    const bgParallax = installConceptBBackgroundParallax();

    document.body.append(bgParallax.a, bgParallax.b, top, topAlert, hud, routeRail, rail, attention);
    if (touchOverlay) document.body.appendChild(touchOverlay);
    if (opticDebug) document.body.appendChild(opticDebug);
    installConceptBGrid(hud);
    installConceptBIrisLattice(hud);
    installConceptBFieldInstrumentation(hud);
    ensureConceptBEyeMotion(hud);
    const trends = { cpu: [], temp: [] };
    const feelState = { tokenBuffer: 0, rms: 0, forcedLoad: null, network: 'online', lastEventAt: 0 };

    // XState is the source of truth for high-level display state. The behavior region mirrors the
    // optic mode; the parallel health/quiet/privacy_display regions are orthogonal overlays the
    // renderer consumes below (data-attributes + CSS treatments). The optic's gaze/blink/transform
    // composition stays in the RAF rig — XState owns truth, not low-level animation.
    const behaviorService = window.HermesBehaviorMachine?.createBehaviorService?.(requestedMode || 'idle_watch') || null;
    window.__HERMES_DISPLAY_BEHAVIOR = behaviorService;
    const overlayUrl = { health: urlParams.get('health'), quiet: urlParams.get('quiet'), privacy: urlParams.get('privacy') };
    const OVERLAY_EVENT_MAP = {
      health: { nominal: 'HEALTH_RECOVERED', degraded: 'HEALTH_DEGRADED', critical: 'HEALTH_CRITICAL' },
      quiet: { active: 'ACTIVE', quiet: 'QUIET_ON', night: 'NIGHT_ON' },
      privacy: { normal: 'PRIVACY_CLEAR', sensitive: 'PRIVACY_SENSITIVE' },
    };
    function overlayEventsForRender() {
      // URL overlay params override per region; non-forced regions still derive from the live packet.
      const derived = window.HermesBehaviorMachine?.regionEventsForPacket?.(currentPacket) || [];
      const derivedByRegion = { health: derived[0], quiet: derived[1], privacy: derived[2] };
      return ['health', 'quiet', 'privacy']
        .map((region) => OVERLAY_EVENT_MAP[region][overlayUrl[region]] || derivedByRegion[region])
        .filter(Boolean);
    }
    function applyBehaviorOverlays() {
      if (!behaviorService) return;
      const o = behaviorService.overlays;
      hud.dataset.health = o.health;
      hud.dataset.quiet = o.quiet;
      hud.dataset.privacy = o.privacy;
    }
    window.__HERMES_SYNC_OVERLAYS = applyBehaviorOverlays;

    const refs = {
      root: document.documentElement,
      body: document.body,
      time: top.querySelector('[data-cb-time]'),
      uptime: top.querySelector('[data-cb-uptime]'),
      cpuArc: hud.querySelector('[data-cb-arc="cpu"]'),
      memArc: hud.querySelector('[data-cb-arc="mem"]'),
      tempArc: hud.querySelector('[data-cb-arc="temp"]'),
      state: hud.querySelector('[data-cb-state]'),
      stateDot: hud.querySelector('[data-cb-state-dot]'),
      activity: hud.querySelector('[data-cb-activity]'),
      caret: hud.querySelector('[data-cb-caret]'),
      offlineBubble: hud.querySelector('[data-cb-offline-bubble]'),
      source: hud.querySelector('[data-cb-source]'),
      gateway: rail.querySelector('[data-cb-gateway]'),
      gatewayDot: rail.querySelector('[data-cb-gateway-dot]'),
      feed: rail.querySelector('[data-cb-feed]'),
      feedAge: rail.querySelector('[data-cb-feed-age]'),
      feedDot: rail.querySelector('[data-cb-feed-dot]'),
      memory: rail.querySelector('[data-cb-memory]'),
      memoryAge: rail.querySelector('[data-cb-memory-age]'),
      memoryDot: rail.querySelector('[data-cb-memory-dot]'),
      tasks: rail.querySelector('[data-cb-tasks]'),
      taskHint: rail.querySelector('[data-cb-task-hint]'),
      taskDot: rail.querySelector('[data-cb-task-dot]'),
      attention: attention.querySelector('[data-cb-attention]'),
      attentionAge: attention.querySelector('[data-cb-attention-age]'),
      topAlert,
      topAlertLabel: topAlert.querySelector('[data-cb-top-alert]'),
      topAlertDetail: topAlert.querySelector('[data-cb-top-alert-detail]'),
    };

    const updateClockMinuteBoundary = () => {
      setConceptBText(refs.time, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const scheduleClockMinuteBoundary = () => {
      updateClockMinuteBoundary();
      const now = new Date();
      const nextDelay = Math.max(1000, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 25);
      window.setTimeout(scheduleClockMinuteBoundary, nextDelay);
    };

    const updateStatusAges = () => {
      const live = currentPacket.live || {};
      const freshnessTier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : live.freshness?.tier || 'fresh';
      const feedAge = liveStatus.lastGoodAt ? formatAge(Date.now() - liveStatus.lastGoodAt) : '--';
      const sys = live.system || {};
      const cpuPct = measurementValue(sys, 'cpu');
      const cpuTemp = measurementValue(sys, 'cpu_temp_c', 'temp_c');
      setConceptBText(refs.feedAge, freshnessTier === 'fresh' ? feedAge : telemetryTrend(cpuPct, cpuTemp, trends));
      const activity = buildActivityCard(live, currentPacket, liveStatus);
      const gatewayText = live.gateway_ok === false ? 'GATEWAY WATCH' : 'GATEWAY OK';
      const reason = conceptBAttentionReason(live, currentPacket, activity, freshnessTier, gatewayText);
      if (reason) {
        attention.classList.remove('quiet');
        setConceptBText(refs.attention, reason);
        setConceptBText(refs.attentionAge, freshnessTier !== 'fresh' && feedAge && !/^\d+s$/i.test(feedAge) ? feedAge : '');
      } else {
        attention.classList.add('quiet');
        setConceptBText(refs.attention, '');
        setConceptBText(refs.attentionAge, '');
      }
    };

    const applyConceptBFeel = (live, activity, freshnessTier) => {
      const sys = live.system || {};
      const cpu = clamp01(Number(feelState.forcedLoad ?? measurementValue(sys, 'cpu') ?? 0));
      const activeWork = Boolean(live.current_work?.active) || ['reasoning', 'planning', 'shell', 'writing', 'searching'].includes(String(activity.kind || activity.visual_kind || live.current_work?.visual_kind || '').toLowerCase());
      const displayLoad = Math.max(cpu, activeWork ? 0.36 : 0.10, freshnessTier === 'lost' ? 0.04 : 0);
      const pulseDuration = CONCEPT_B_FEEL.loadPulseMaxSeconds - (CONCEPT_B_FEEL.loadPulseMaxSeconds - CONCEPT_B_FEEL.loadPulseMinSeconds) * displayLoad;
      setConceptBStyleProperty(refs.root, '--cb-load-pulse-duration', `${pulseDuration.toFixed(2)}s`);
      setConceptBStyleProperty(refs.root, '--cb-listen-rms', clamp01(feelState.rms).toFixed(3));
      setConceptBStyleProperty(refs.root, '--cb-caret-duration', `${(feelState.tokenBuffer >= CONCEPT_B_FEEL.tokenBurstThreshold ? CONCEPT_B_FEEL.tokenCaretFastSeconds : CONCEPT_B_FEEL.tokenCaretSlowSeconds).toFixed(2)}s`);
      setConceptBDataset(refs.body, 'cbListening', feelState.rms > 0.02 || activity.kind === 'listening' ? 'true' : 'false');
      setConceptBDataset(refs.body, 'cbGenerating', activeWork || feelState.tokenBuffer > 0 ? 'true' : 'false');
      setConceptBDataset(refs.body, 'cbOffline', freshnessTier === 'lost' || live.gateway_ok === false || feelState.network !== 'online' ? 'true' : 'false');
      refs.offlineBubble?.classList.toggle('quiet', refs.body.dataset.cbOffline !== 'true');
      refs.caret?.classList.toggle('active', refs.body.dataset.cbGenerating === 'true');
    };

    const installConceptBFeelApi = () => {
      window.HermesDisplayEvents = {
        onThinking(active = true, meta = {}) {
          feelState.forcedLoad = active ? clamp01(Number(meta.load ?? 0.68)) : null;
          feelState.tokenBuffer = active ? Number(meta.tokenBuffer || feelState.tokenBuffer || 0) : 0;
          feelState.lastEventAt = Date.now();
          if (active) renderer.triggerIntent?.('tiny_perk');
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        onIncomingMessage(meta = {}) {
          const text = `${meta.text || ''} ${meta.kind || ''}`.toLowerCase();
          const urgent = /\b(error|failed|urgent|down|blocked)\b/.test(text);
          feelState.forcedLoad = urgent ? 0.24 : 0.18;
          feelState.lastEventAt = Date.now();
          renderer.triggerIntent?.(urgent ? 'skeptical_squint' : 'brow_pop');
          window.__HERMES_CONCEPT_B_EYE_MOTION?.pulse?.(urgent ? 'blocked' : 'notice');
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        onTokenBuffer(size = 0) {
          feelState.tokenBuffer = Math.max(0, Number(size) || 0);
          feelState.forcedLoad = Math.min(0.75, 0.28 + feelState.tokenBuffer / 80);
          feelState.lastEventAt = Date.now();
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        onAudioRms(rms = 0) {
          feelState.rms = clamp01(Number(rms) || 0);
          feelState.lastEventAt = Date.now();
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        onError(code = 'error') {
          feelState.network = code === 'offline' ? 'retrying' : feelState.network;
          feelState.forcedLoad = 0.08;
          feelState.lastEventAt = Date.now();
          renderer.triggerIntent?.('skeptical_squint');
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        onNetwork(state = 'online') {
          feelState.network = state;
          feelState.forcedLoad = state === 'online' ? null : 0.04;
          feelState.lastEventAt = Date.now();
          if (state === 'online') renderer.triggerIntent?.('smug_nod');
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
        reset() {
          feelState.tokenBuffer = 0;
          feelState.rms = 0;
          feelState.forcedLoad = null;
          feelState.network = 'online';
          window.dispatchEvent(new CustomEvent('hermes-live-packet', { detail: currentPacket }));
        },
      };
    };

    const updatePanelFromPacket = () => {
      const live = currentPacket.live || {};
      const sys = live.system || {};
      const measurements = sys.measurements || {};
      const cpuPct = measurementValue(sys, 'cpu');
      const memPct = measurementValue(sys, 'memory');
      const cpuTemp = measurementValue(sys, 'cpu_temp_c', 'temp_c');
      const cpuLoadPercent = metricAvailable(cpuPct, measurements.cpu) ? cpuPct * 100 : NaN;
      const tempSeverity = Number.isFinite(cpuTemp) ? cpuTemp >= 90 ? 'hot' : cpuTemp >= 82 ? 'warn' : 'ok' : 'unknown';
      const systemSeverity = tempSeverity === 'hot' ? 'hot' : tempSeverity === 'warn' ? 'warn' : tempSeverity === 'unknown' ? 'unknown' : 'ok';
      const freshnessTier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : live.freshness?.tier || 'fresh';
      const activity = buildActivityCard(live, currentPacket, liveStatus);
      const label = activityLabel(live, currentPacket.mood);
      const accent = conceptBAccent(label, freshnessTier, live.gateway_ok);
      const puppet = currentPacket.optic_state_packet || currentPacket.puppet_state_packet || {};
      const mode = window.HermesBehaviorMachine?.modeFromPacket?.(currentPacket, 'idle_watch')
        || safeDisplayText(puppet?.mode || 'idle_watch', 32);
      const puppetForRender = puppet?.mode ? puppet : { ...puppet, mode };
      const instrumentAccent = applyConceptBOptic(hud, puppetForRender, accent);
      // Drive the XState machine and consume its parallel overlay regions.
      if (behaviorService) {
        if (window.HermesBehaviorMachine?.MODES?.includes?.(mode)) behaviorService.setMode(mode);
        const events = overlayEventsForRender();
        behaviorService.sendAll(events);
        applyBehaviorOverlays();
      }
      const work = live.current_work || {};
      const queuedTaskCount = conceptBQueuedTaskCount(live);
      const isCurrentWork = Boolean(work.active) && Number.isFinite(Number(work.age_seconds)) && Number(work.age_seconds) <= CURRENT_WORK_MAX_AGE_SECONDS;
      const source = label === 'LOCAL WATCH'
        ? 'LOCAL · WATCH'
        : activitySourceChip(work.source || work.session_label) || activity.chips[0] || (work.active ? 'LOCAL · ACTIVE' : 'LOCAL · READY');

      setConceptBStyleProperty(refs.root, '--cb-accent', instrumentAccent);
      setConceptBDataset(refs.body, 'cbMode', label.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      setConceptBDataset(refs.body, 'systemLoad', systemSeverity);
      updateClockMinuteBoundary();
      setConceptBText(refs.uptime, familyAudience ? 'FAMILY THEATER' : (sys.uptime ? `${safeDisplayText(sys.uptime, 18).toUpperCase()} UPTIME` : 'LOCAL TIME'));

      updateConceptBArc(refs.cpuArc, 'CPU', cpuLoadPercent, '%', 'top', null, 'cpu');
      updateConceptBArc(refs.memArc, 'MEM', metricAvailable(memPct, measurements.memory) ? memPct * 100 : NaN, '%', 'right', null, 'mem');
      updateConceptBArc(refs.tempArc, 'TEMP', metricAvailable(cpuTemp, measurements.cpu_temp_c || measurements.temp_c) ? ((cpuTemp - 30) / 65) * 100 : NaN, '°C', 'left', cpuTemp, 'temp');
      rememberTrend(trends.cpu, cpuPct);
      rememberTrend(trends.temp, cpuTemp);

      const familyState = label === 'ACTIVE TURN' ? 'HERMES IS THINKING' : label === 'LOCAL WATCH' ? 'HERMES IS WATCHING' : label === 'BLOCKED' ? 'HERMES IS PAUSED' : 'HERMES IS HERE';
      setConceptBStatusText(refs.state, familyAudience ? familyState : label);
      if (refs.stateDot && refs.stateDot.style.background !== instrumentAccent) refs.stateDot.style.background = instrumentAccent;
      setConceptBStatusText(refs.activity, familyAudience ? familySafeStatusPhrase(label, freshnessTier, live.gateway_ok) : displaySentence(activity.summary));
      setConceptBText(refs.source, familyAudience ? 'SPARKLE MODE' : safeDisplayText(source, 32).toUpperCase());
      applyConceptBFeel(live, activity, freshnessTier);

      const gatewayText = live.gateway_ok === false ? 'GATEWAY WATCH' : 'GATEWAY OK';
      const alert = familyAudience ? null : conceptBTopAlert(live, activity, freshnessTier, gatewayText, tempSeverity);
      if (alert) {
        refs.topAlert.classList.remove('quiet');
        refs.topAlert.dataset.severity = alert.severity;
        setConceptBText(refs.topAlertLabel, alert.label);
        setConceptBText(refs.topAlertDetail, alert.detail || '');
      } else {
        refs.topAlert.classList.add('quiet');
        refs.topAlert.dataset.severity = 'normal';
        setConceptBText(refs.topAlertLabel, '');
        setConceptBText(refs.topAlertDetail, '');
      }
      setConceptBDataset(refs.body, 'auguryPresence', conceptBAuguryPresence(live, mode, freshnessTier, gatewayText));

      setConceptBStatusText(refs.gateway, gatewayText);
      setConceptBStatusDotClass(refs.gatewayDot, live.gateway_ok !== false && freshnessTier !== 'lost' ? 'ok' : 'watch');
      setConceptBStatusText(refs.feed, `FEED ${freshnessTier.toUpperCase()}`);
      setConceptBStatusDotClass(refs.feedDot, freshnessTier);
      updateRemoteMemoryCell(refs, live.remote_memory);
      const taskText = isCurrentWork
        ? 'CURRENT TURN'
        : Number.isFinite(queuedTaskCount) && queuedTaskCount > 0
          ? `${queuedTaskCount} QUEUED`
          : 'READY';
      const taskHint = isCurrentWork
        ? safeDisplayText(work.visual_kind || work.kind || source, 18)
        : Number.isFinite(queuedTaskCount) && queuedTaskCount > 0
          ? 'queued calmly'
          : 'no queued work';
      setConceptBStatusText(refs.tasks, taskText);
      setConceptBText(refs.taskHint, taskHint);
      setConceptBStatusDotClass(refs.taskDot, isCurrentWork || (Number.isFinite(queuedTaskCount) && queuedTaskCount > 0) ? 'ok' : 'fresh');

      updateConceptBRouteRail(routeRail, live.route_rail);
      updateStatusAges();
    };
    updatePanelFromPacket();
    statusTicksArmed = true;
    installConceptBFeelApi();
    scheduleClockMinuteBoundary();
    window.setInterval(updateStatusAges, 5000);
    window.addEventListener('hermes-live-packet', updatePanelFromPacket);
    renderer.on('intent', updatePanelFromPacket);
  }


  function familySafeStatusPhrase(label, freshnessTier, gatewayOk) {
    if (freshnessTier === 'lost' || gatewayOk === false) return 'Hermes is keeping watch quietly.';
    if (label === 'ACTIVE TURN') return 'Hermes is thinking with the little light.';
    if (label === 'LOCAL WATCH') return 'Hermes is watching and making sparkles.';
    if (/COMPLETE|READY/.test(label)) return 'Systems steady. Sparkles ready.';
    return 'Hermes is here with the glowing eye.';
  }

  function updateRemoteMemoryCell(refs, remoteMemory) {
    const state = String(remoteMemory?.state || 'unknown').toLowerCase();
    const status = safeDisplayText(remoteMemory?.status || 'UNKNOWN', 10).toUpperCase();
    const label = safeDisplayText(remoteMemory?.label || 'HONCHO', 10).toUpperCase();
    const dotClass = ({ ok: 'ok', down: 'lost', stale: 'stale', unknown: 'watch' })[state] || 'watch';
    const age = Number(remoteMemory?.age_seconds);
    const ageText = Number.isFinite(age) ? formatRouteAge(age) : '--';
    const statusText = status === 'UP' ? `${label} UP` : status === 'DOWN' ? `${label} DOWN` : `${label} ${status}`;
    setConceptBStatusText(refs.memory, statusText);
    setConceptBText(refs.memoryAge, ageText);
    setConceptBStatusDotClass(refs.memoryDot, dotClass);
  }


  function createConceptBRouteRail() {
    const root = document.createElement('aside');
    root.className = 'cb-route-rail';
    root.setAttribute('aria-label', 'Subscription model route status');
    root.innerHTML = `
      <div class="cb-route-title">ROUTE · HEADROOM</div>
      <div class="cb-route-spine" aria-hidden="true"></div>
      <div class="cb-route-active-hairline" aria-hidden="true"><span></span></div>
      <div class="cb-route-rows"></div>
      <div class="cb-route-anchor" aria-hidden="true"></div>
      <div class="cb-route-standby quiet">STANDBY</div>
    `;
    const rows = root.querySelector('.cb-route-rows');
    for (let i = 0; i < 4; i += 1) {
      const row = document.createElement('div');
      row.className = 'cb-route-row';
      row.dataset.index = String(i);
      row.innerHTML = `
        <div class="cb-route-label"><strong data-route-label>—</strong><span data-route-value>—</span><em data-route-tier></em></div>
        <div class="cb-route-track" aria-hidden="true"></div>
        <div class="cb-route-whisker"></div>
        <i class="cb-route-node" aria-hidden="true"></i>
        <b class="cb-route-glyph" data-route-glyph>○</b>
      `;
      rows.appendChild(row);
    }
    return root;
  }


  function defaultConceptBRouteRail() {
    return {
      as_of_ms: null,
      age_seconds: null,
      active_provider_id: '',
      providers: [
        { id: 'openai-codex', label: 'CHATGPT', tier_label: null, rank: 1, state: 'unknown', headroom: null, reachable: true },
        { id: 'anthropic', label: 'CLAUDE', tier_label: null, rank: 2, state: 'unknown', headroom: null, reachable: true },
        { id: 'google-gemini-cli', label: 'GEMINI', tier_label: null, rank: 3, state: 'unknown', headroom: null, reachable: true },
        { id: 'copilot', label: 'COPILOT', tier_label: null, rank: 4, state: 'unknown', headroom: null, reachable: true },
      ],
    };
  }

  function updateConceptBRouteRail(root, rail) {
    if (!root) return;
    const allowedStates = new Set(['confirmed', 'inferred', 'stale', 'unknown', 'error', 'disabled']);
    const glyphs = { confirmed: '●', inferred: '◉', stale: '◐', unknown: '○', error: '!', disabled: '×' };
    const rows = root.__cbRouteRows ||= Array.from(root.querySelectorAll('.cb-route-row')).map((row) => ({
      row,
      labelWrap: row.querySelector('.cb-route-label'),
      label: row.querySelector('[data-route-label]'),
      value: row.querySelector('[data-route-value]'),
      tier: row.querySelector('[data-route-tier]'),
      glyph: row.querySelector('[data-route-glyph]'),
    }));
    const source = Array.isArray(rail?.providers) ? rail : defaultConceptBRouteRail();
    const providers = source.providers.slice(0, 4);
    const activeId = safeDisplayText(source.active_provider_id || '', 36);
    const routeSignature = `${activeId}|${providers.map((p) => `${p.id}:${p.state}:${p.headroom ?? ''}:${p.stale_age_s ?? ''}`).join('|')}`;
    if (root.dataset.routeSignature && root.dataset.routeSignature !== routeSignature) {
      const changed = providers.some((p) => ['stale', 'unknown', 'error'].includes(String(p.state))) || activeId !== (root.dataset.activeProviderId || '');
      if (changed) {
        const now = Date.now();
        if (now - (window.__HERMES_LAST_ROUTE_GLANCE_AT || 0) > 6500) {
          window.__HERMES_LAST_ROUTE_GLANCE_AT = now;
          window.__HERMES_CONCEPT_B_EYE_MOTION?.forceGaze?.('route_right', 900);
          window.__HERMES_CONCEPT_B_EYE_MOTION?.pulse?.('notice');
        }
      }
    }
    setConceptBDataset(root, 'routeSignature', routeSignature);
    setConceptBDataset(root, 'activeProviderId', activeId);
    let activeIndex = -1;
    rows.forEach((entry, idx) => {
      const { row } = entry;
      const provider = providers[idx] || { id: `unknown-${idx}`, label: ['CHATGPT', 'CLAUDE', 'GEMINI', 'COPILOT'][idx] || 'ROUTE', state: 'unknown', headroom: null };
      const state = allowedStates.has(String(provider.state)) ? String(provider.state) : 'unknown';
      const isActive = provider.id === activeId && ['confirmed', 'inferred'].includes(state) && provider.reachable !== false;
      if (isActive) activeIndex = idx;
      const prevState = row.dataset.state || '';
      const prevActive = row.dataset.active || '';
      const prevHeadroomTier = row.dataset.headroomTier || '';
      setConceptBDataset(row, 'state', state);
      setConceptBDataset(row, 'active', isActive ? 'true' : 'false');
      const headroom = Number(provider.headroom);
      const knownHeadroom = Number.isFinite(headroom) && !['unknown', 'error', 'disabled'].includes(state);
      const clamped = knownHeadroom ? Math.max(0, Math.min(1, headroom)) : null;
      const headroomTier = knownHeadroom ? (clamped <= ROUTE_HEADROOM_LOW_THRESHOLD ? 'low' : 'ok') : 'none';
      setConceptBDataset(row, 'headroomTier', headroomTier);
      setConceptBStyleProperty(row, '--route-headroom', knownHeadroom ? clamped.toFixed(3) : '0');
      // Provider flips read as events at the row itself: label settle on a state change,
      // glyph pulse when a provider takes the route, value nudge when known headroom first
      // enters the low band. Plain headroom drift stays silent so polling cannot strobe rows.
      if (prevState && prevState !== state) {
        playConceptBStatusTick(entry.labelWrap, [
          { opacity: 0.25, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], 360);
      }
      if (prevActive === 'false' && isActive) {
        playConceptBStatusTick(entry.glyph, [
          { transform: 'scale(1)' },
          { transform: 'scale(1.55)', offset: 0.4 },
          { transform: 'scale(1)' },
        ], 540);
      }
      if (prevHeadroomTier && prevHeadroomTier !== headroomTier && headroomTier === 'low') {
        playConceptBStatusTick(entry.value, [
          { opacity: 0.25, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], 360);
      }
      setConceptBText(entry.label, safeDisplayText(provider.label || 'ROUTE', 8).toUpperCase());
      const unknownRouteCopy = state === 'disabled' ? 'OFF' : state === 'error' ? 'ERR' : 'UNK';
      setConceptBText(entry.value, knownHeadroom ? `${state === 'inferred' ? '~' : ''}${Math.round(clamped * 100)}%` : unknownRouteCopy);
      const tier = safeDisplayText(provider.tier_label || '', 14).toUpperCase();
      const age = provider.stale_age_s != null ? formatRouteAge(provider.stale_age_s) : provider.last_used_age_s != null && idx === activeIndex ? `· ${formatRouteAge(provider.last_used_age_s)}` : '';
      setConceptBText(entry.tier, [tier, age].filter(Boolean).join(' '));
      setConceptBText(entry.glyph, glyphs[state] || '○');
    });
    setConceptBDataset(root, 'activeIndex', activeIndex >= 0 ? String(activeIndex) : 'none');
    const standby = root.querySelector('.cb-route-standby');
    if (standby) {
      const hasAsOf = source.as_of_ms !== null && source.as_of_ms !== undefined && source.as_of_ms !== '';
      const sourceAge = source.age_seconds ?? (hasAsOf && Number.isFinite(Number(source.as_of_ms)) ? Math.max(0, Math.round((Date.now() - Number(source.as_of_ms)) / 1000)) : null);
      const allUnknown = providers.every((provider) => ['unknown', 'error', 'disabled'].includes(String(provider?.state || 'unknown')));
      const staleRoute = Number.isFinite(Number(sourceAge)) && Number(sourceAge) > 600;
      setConceptBText(standby, allUnknown ? 'ROUTE UNKNOWN' : staleRoute ? `ROUTE STALE · ${formatRouteAge(sourceAge)}` : sourceAge != null ? `AS OF ${formatRouteAge(sourceAge)}` : 'ROUTE UNKNOWN');
    }
    const hairline = root.querySelector('.cb-route-active-hairline');
    setConceptBStyleProperty(hairline, '--route-active-y', activeIndex >= 0 ? `${97 + activeIndex * 152}px` : '-100px');
    standby?.classList.toggle('quiet', false);
  }

  function formatRouteAge(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    if (value < 90) return `${Math.round(value)}s`;
    const minutes = Math.round(value / 60);
    if (minutes < 90) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }


  function installConceptBOpticDebug(params, hud) {
    const enabled = ['1', 'true', 'yes'].includes((params.get('opticDebug') || '').toLowerCase());
    if (!enabled) return null;
    hud.classList.add('optic-debug-enabled');
    const overlay = document.createElement('div');
    overlay.className = 'cb-optic-debug qa-visible';
    overlay.innerHTML = `
      <strong>OPTIC ${DISPLAY_BUILD_ID}</strong>
      <span data-optic-debug-mode>mode=--</span>
      <span data-optic-debug-gaze>gaze=0,0</span>
      <span>optic center=550,550</span>
      <span>field center=550,550</span>
    `;
    return overlay;
  }

  function installConceptBBackgroundParallax() {
    const existingA = document.querySelector('.cb-bg-parallax-a');
    const existingB = document.querySelector('.cb-bg-parallax-b');
    if (existingA && existingB) return { a: existingA, b: existingB };
    const a = document.createElement('div');
    a.className = 'cb-bg-parallax cb-bg-parallax-a';
    a.setAttribute('aria-hidden', 'true');
    const b = document.createElement('div');
    b.className = 'cb-bg-parallax cb-bg-parallax-b';
    b.setAttribute('aria-hidden', 'true');
    return { a, b };
  }

  function setConceptBAttribute(el, name, value) {
    if (!el) return;
    const next = String(value);
    const cache = el.__cbAttrCache || (el.__cbAttrCache = Object.create(null));
    if (cache[name] === next) return;
    cache[name] = next;
    el.setAttribute(name, next);
  }

  function setConceptBStyleProperty(el, name, value) {
    if (!el) return;
    const next = String(value);
    const cache = el.__cbStyleCache || (el.__cbStyleCache = Object.create(null));
    if (cache[name] === next) return;
    cache[name] = next;
    el.style.setProperty(name, next);
  }

  function setConceptBTransform(el, value) {
    if (!el) return;
    if (el instanceof HTMLElement) {
      if (el.__cbTransform === value) return;
      el.__cbTransform = value;
      el.style.transform = value;
      return;
    }
    setConceptBAttribute(el, 'transform', value);
  }

  function setConceptBText(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.textContent === next) return;
    el.textContent = next;
  }

  function setConceptBClassName(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.className === next) return;
    el.className = next;
  }

  function setConceptBDataset(el, key, value) {
    if (!el?.dataset) return;
    const next = String(value);
    if (el.dataset[key] === next) return;
    el.dataset[key] = next;
  }

  // Status-change ticks: a short transform/opacity nudge when a status label or severity dot
  // actually changes value, so state flips read as events instead of silent text swaps.
  // Armed only after the first panel render (boot must not flutter) and throttled per element
  // so churny fields cannot strobe the rail. Reduced motion keeps the instant swap.
  function playConceptBStatusTick(el, keyframes, duration) {
    if (!el || !statusTicksArmed || prefersReducedMotion || typeof el.animate !== 'function') return;
    const now = Date.now();
    if (el.__cbTickAt && now - el.__cbTickAt < STATUS_TICK_MIN_GAP_MS) return;
    el.__cbTickAt = now;
    el.__cbTickAnim?.cancel?.();
    el.__cbTickAnim = el.animate(keyframes, { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    window.__HERMES_STATUS_TICKS += 1;
  }

  function setConceptBStatusText(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.textContent === next) return;
    el.textContent = next;
    playConceptBStatusTick(el, [
      { opacity: 0.25, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], 360);
  }

  function setConceptBStatusDotClass(el, value) {
    if (!el) return;
    const next = String(value);
    if (el.className === next) return;
    el.className = next;
    playConceptBStatusTick(el, [
      { transform: 'scale(1)' },
      { transform: 'scale(1.75)', offset: 0.4 },
      { transform: 'scale(1)' },
    ], 540);
  }

  function installConceptBGrid(hud) {
    const grid = hud.querySelector('.cb-eye-grid');
    if (!grid || grid.childNodes.length) return;
    // 8x8 plate spanning the full iris (374..726), clipped to the lens circle, matching the
    // reference tool_shell grid. Lines run edge-to-edge; the clip masks them to the circle.
    const ns = 'http://www.w3.org/2000/svg';
    const min = 374;
    const max = 726;
    const step = (max - min) / 8;
    for (let i = 0; i <= 8; i += 1) {
      const at = min + i * step;
      const v = document.createElementNS(ns, 'line');
      v.setAttribute('x1', String(at));
      v.setAttribute('y1', String(min));
      v.setAttribute('x2', String(at));
      v.setAttribute('y2', String(max));
      grid.appendChild(v);
      const h = document.createElementNS(ns, 'line');
      h.setAttribute('x1', String(min));
      h.setAttribute('y1', String(at));
      h.setAttribute('x2', String(max));
      h.setAttribute('y2', String(at));
      grid.appendChild(h);
    }
  }

  function installConceptBIrisLattice(hud) {
    const lattice = hud.querySelector('.cb-iris-lattice');
    if (!lattice || lattice.childNodes.length) return;
    // Procedural machined-iris texture between the pupil (max scaled r is ~60) and the
    // lens clip (r=176). Geometry comes from a seeded LCG so every boot renders the
    // identical lattice and screenshot review artifacts stay diffable.
    const ns = 'http://www.w3.org/2000/svg';
    let seed = 28411;
    const rand = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
    const ringAt = (className, r) => {
      const ring = document.createElementNS(ns, 'circle');
      ring.classList.add(className);
      ring.setAttribute('cx', '550');
      ring.setAttribute('cy', '550');
      ring.setAttribute('r', String(r));
      lattice.appendChild(ring);
    };
    ringAt('cb-iris-collar', 64);
    ringAt('cb-iris-limbal', 168);
    const FILAMENTS = 56;
    for (let i = 0; i < FILAMENTS; i += 1) {
      const spoke = i % 7 === 0;
      const angle = (Math.PI * 2 * i) / FILAMENTS + (rand() - 0.5) * 0.05;
      const r0 = 67 + rand() * 9;
      const r1 = spoke ? 154 + rand() * 12 : 122 + rand() * 30;
      const line = document.createElementNS(ns, 'line');
      line.classList.add('cb-iris-filament');
      if (spoke) line.classList.add('cb-iris-filament-bright');
      line.setAttribute('x1', (550 + Math.cos(angle) * r0).toFixed(2));
      line.setAttribute('y1', (550 + Math.sin(angle) * r0).toFixed(2));
      line.setAttribute('x2', (550 + Math.cos(angle) * r1).toFixed(2));
      line.setAttribute('y2', (550 + Math.sin(angle) * r1).toFixed(2));
      line.style.opacity = (spoke ? 0.52 + rand() * 0.18 : 0.16 + rand() * 0.22).toFixed(3);
      lattice.appendChild(line);
    }
  }

  function installConceptBFieldInstrumentation(hud) {
    const ns = 'http://www.w3.org/2000/svg';
    const compass = hud.querySelector('.cb-field-compass');
    if (compass && !compass.childNodes.length) {
      for (let i = 0; i < 32; i += 1) {
        const angle = (Math.PI * 2 * i) / 32;
        const major = i % 4 === 0;
        const r1 = major ? 292 : 302;
        const r2 = major ? 320 : 314;
        const tick = document.createElementNS(ns, 'line');
        tick.classList.add('cb-field-tick');
        if (major) tick.classList.add('major');
        tick.setAttribute('x1', String((550 + Math.cos(angle) * r1).toFixed(2)));
        tick.setAttribute('y1', String((550 + Math.sin(angle) * r1).toFixed(2)));
        tick.setAttribute('x2', String((550 + Math.cos(angle) * r2).toFixed(2)));
        tick.setAttribute('y2', String((550 + Math.sin(angle) * r2).toFixed(2)));
        tick.dataset.angle = String(angle);
        tick.dataset.boostBucket = '';
        compass.appendChild(tick);
      }
    }
    const motes = hud.querySelector('.cb-field-motes');
    if (motes && !motes.childNodes.length) {
      [0.07, 0.26, 0.43, 0.61, 0.82].forEach((phase, idx) => {
        const mote = document.createElementNS(ns, 'circle');
        mote.classList.add('cb-field-mote');
        mote.setAttribute('r', String(idx === 1 ? 3.2 : 2.4));
        mote.dataset.phase = String(phase);
        mote.dataset.radius = String(248 + (idx % 3) * 34);
        motes.appendChild(mote);
      });
    }
  }


  function ensureConceptBEyeMotion(hud) {
    if (hud.__cbEyeMotion) return hud.__cbEyeMotion;
    const root = document.documentElement;
    const gazeGroup = hud.querySelector('.cb-eye-gaze');
    const iris = hud.querySelector('.cb-eye-iris');
    const pupil = hud.querySelector('.cb-eye-pupil');
    const pupilGroup = hud.querySelector('.cb-eye-pupil-group');
    const lidTop = hud.querySelector('.cb-eye-lid-top');
    const lidBottom = hud.querySelector('.cb-eye-lid-bottom');
    const glow = hud.querySelector('.cb-glow');
    const glowGradient = hud.querySelector('#cb-core-glow');
    const scanSweep = hud.querySelector('.cb-eye-scan');
    const core = hud.querySelector('.cb-eye-core');
    const orbitSpin = hud.querySelector('.cb-orbit-spin');
    const eyeRing = hud.querySelector('.cb-eye-ring');
    const pulseCircle = hud.querySelector('.cb-field-pulse');
    const glassSheen = hud.querySelector('.cb-eye-glass-sheen');
    const glassCrescent = hud.querySelector('.cb-eye-glass-crescent');
    const irisLattice = hud.querySelector('.cb-iris-lattice');
    const activityPanel = document.querySelector('.cb-activity');
    // anime.js drives every optic cadence/transition/transient; the RAF flush below stays the
    // single writer of composed transforms so the two engines never fight over an attribute.
    const motion = window.HermesMotionAdapter?.createMotionAdapter?.({ prefersReducedMotion }) || null;
    const field = {
      root: hud.querySelector('.cb-field-instrumentation'),
      rings: Array.from(hud.querySelectorAll('.cb-field-ring')),
      compass: hud.querySelector('.cb-field-compass'),
      ticks: Array.from(hud.querySelectorAll('.cb-field-tick')),
      motes: Array.from(hud.querySelectorAll('.cb-field-mote')),
      trace: hud.querySelector('.cb-field-trace'),
      pulse: hud.querySelector('.cb-field-notice-pulse'),
    };
    const axisNodes = Array.from(hud.querySelectorAll('.cb-axis, .cb-cardinal'));
    const bgParallax = { a: document.querySelector('.cb-bg-parallax-a'), b: document.querySelector('.cb-bg-parallax-b') };
    const debugOverlay = document.querySelector('.cb-optic-debug');
    const state = {
      // Gaze stays a per-frame spring (RAF) — it continuously chases a live target, which is
      // the one thing anime.js tweens are not suited for. Everything else is anime.js-driven.
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      targetX: 0,
      targetY: 0,
      // anime.js-tweened scalars (the RAF flush only reads + applies these):
      iris: 1,
      pupil: 1,
      lid: 0,
      upperBias: 0,
      lowerBias: 0,
      blink: 0,
      pupilFlash: 0,
      breath: 1,
      ringAngle: 0,
      scanAngle: 0,
      irisAngle: 0,
      irisMs: 0,
      fieldRingAngles: { a: 0, b: 0, c: 0 },
      blinkMs: 5200,
      ringMs: 34000,
      breathMs: 5200,
      scanning: false,
      mode: 'idle_watch',
      special: 'none',
      frame: 0,
      last: performance.now(),
      raf: 0,
      lastTraceX: 0,
      lastTraceY: 0,
      lastTraceAt: 0,
      traces: [],
      anims: {},
      blinkTimer: 0,
      micro: { x: 0, y: 0, fromX: 0, fromY: 0, targetX: 0, targetY: 0, returnX: 0, returnY: 0, startAt: 0, returnAt: 0, endAt: 0, nextAt: 0, lastAt: 0, burst: 0, lastHalfBlinkAt: 0 },
      fixation: { kind: 'front', nextAt: 0, x: 0, y: 0 },
      forcedUntil: 0,
      lastContextBlinkAt: 0,
      lastGazeKind: 'front',
      lastTouchPulseAt: 0,
      lastResonanceAt: 0,
      resonance: { angle: 0, distance: 0, intensity: 0, startedAt: 0, ttlMs: 900 },
      lastTouchTarget: { x: 0, y: 0, intensity: 0, pointerCount: 0 }
    };

    // ── anime.js cadence loops ───────────────────────────────────────────────
    // Each owns one scalar on `state`; the RAF flush composes them into transforms.
    function runBlinkOnce(onComplete) {
      if (!motion?.hasAnime) { onComplete?.(); return; }
      // Two chained single-value tweens (close, then open). The RAF flush renders this
      // scalar as a symmetric lid pinch over the lens; iris/pupil/gaze transforms remain
      // posture-only so catchlights do not slide toward center during a blink.
      state.anims.blink = motion.animateValue({
        targets: state, blink: 1, duration: 70, easing: 'inQuad',
        complete: () => {
          window.setTimeout(() => {
            state.anims.blink = motion.animateValue({
              targets: state, blink: 0, duration: 115, easing: 'outSine', complete: onComplete
            });
          }, 35);
        }
      });
    }
    function runHalfBlinkOnce() {
      if (!motion?.hasAnime || prefersReducedMotion || state.blink > 0.18) return;
      const now = performance.now();
      if (now - (state.micro?.lastHalfBlinkAt || 0) < 2200) return;
      state.micro.lastHalfBlinkAt = now;
      state.anims.halfBlink?.pause?.();
      state.anims.halfBlink = motion.animateValue({
        targets: state,
        blink: [Math.max(state.blink, 0.02), 0.48, 0],
        duration: 128,
        easing: 'outQuad'
      });
    }
    function pulsePupilFlash(delta = 0, duration = 260) {
      if (!motion?.hasAnime || prefersReducedMotion) return;
      state.anims.pupilFlash?.pause?.();
      state.anims.pupilFlash = motion.animateValue({
        targets: state,
        pupilFlash: [delta, 0],
        duration,
        easing: 'outSine'
      });
    }
    function voiceMicroScale() {
      const raw = window.__HERMES_VOICE_RMS ?? window.HermesAudio?.voiceRms ?? window.HermesAudio?.rms ?? 0;
      const rms = Math.max(0, Math.min(1, Number(raw) || 0));
      return 1 + rms * (CONCEPT_B_BIO_MOTION.microVoiceScale - 1);
    }
    function isQuietMicroMode(mode = state.mode) {
      return ['idle_watch', 'reasoning', 'planning', 'waiting_user', 'blocked', 'critical', 'complete', 'degraded_offline'].includes(mode);
    }
    function scheduleNextMicro(now) {
      const span = CONCEPT_B_BIO_MOTION.microMaxMs - CONCEPT_B_BIO_MOTION.microMinMs;
      const quietScale = isQuietMicroMode() ? CONCEPT_B_BIO_MOTION.microQuietIntervalScale : 1;
      const voiceScale = voiceMicroScale();
      const interval = CONCEPT_B_BIO_MOTION.microMinMs + Math.random() * Math.max(1, span);
      // Higher RMS slightly increases liveliness by shortening the interval; quiet/standby modes lengthen it.
      state.micro.nextAt = now + (interval * quietScale) / Math.max(0.35, voiceScale);
    }
    function maybeStartMicroSaccade(now) {
      const micro = state.micro;
      if (prefersReducedMotion || state.blink > 0.16 || now < (micro.nextAt || 0) || now < (state.forcedUntil || 0)) return;
      const edge = Math.min(1, Math.hypot(state.targetX, state.targetY) / CONCEPT_B_BIO_MOTION.gazeMaxHypot);
      const quiet = isQuietMicroMode();
      const ampBase = quiet ? CONCEPT_B_BIO_MOTION.microQuietAmpScale : CONCEPT_B_BIO_MOTION.microActiveAmpScale;
      const ampScale = ampBase + edge * (quiet ? 0.10 : 0.25);
      const sx = Math.random() < 0.5 ? -1 : 1;
      const sy = Math.random() < 0.5 ? -1 : 1;
      const minX = quiet ? 0.35 : 0.9;
      const minY = quiet ? 0.25 : 0.55;
      micro.fromX = micro.x || 0;
      micro.fromY = micro.y || 0;
      micro.targetX = sx * (minX + Math.random() * (CONCEPT_B_BIO_MOTION.microMaxX - minX)) * ampScale;
      micro.targetY = sy * (minY + Math.random() * (CONCEPT_B_BIO_MOTION.microMaxY - minY)) * ampScale;
      micro.returnX = 0;
      micro.returnY = 0;
      micro.startAt = now;
      micro.returnAt = now + CONCEPT_B_BIO_MOTION.microEaseMs;
      micro.endAt = micro.returnAt + CONCEPT_B_BIO_MOTION.microReturnMs;
      micro.burst = now - (micro.lastAt || 0) < CONCEPT_B_BIO_MOTION.halfBlinkBurstWindowMs ? micro.burst + 1 : 1;
      micro.lastAt = now;
      if (micro.burst >= CONCEPT_B_BIO_MOTION.halfBlinkBurstCount) {
        micro.burst = 0;
        runHalfBlinkOnce();
      }
      scheduleNextMicro(now);
    }
    function updateMicroSaccade(now) {
      const micro = state.micro;
      if (prefersReducedMotion || state.blink > 0.22) {
        micro.x = 0; micro.y = 0;
        return { x: 0, y: 0 };
      }
      maybeStartMicroSaccade(now);
      if (!micro.endAt || now >= micro.endAt) {
        micro.x = 0; micro.y = 0;
        return { x: 0, y: 0 };
      }
      if (now < micro.returnAt) {
        const p = Math.max(0, Math.min(1, (now - micro.startAt) / Math.max(1, CONCEPT_B_BIO_MOTION.microEaseMs)));
        const e = 1 - Math.pow(1 - p, 3);
        micro.x = micro.fromX + (micro.targetX - micro.fromX) * e;
        micro.y = micro.fromY + (micro.targetY - micro.fromY) * e;
      } else {
        const p = Math.max(0, Math.min(1, (now - micro.returnAt) / Math.max(1, CONCEPT_B_BIO_MOTION.microReturnMs)));
        const e = 1 - Math.pow(1 - p, 3);
        micro.x = micro.targetX * (1 - e);
        micro.y = micro.targetY * (1 - e);
      }
      return { x: micro.x || 0, y: micro.y || 0 };
    }
    function armBlink() {
      state.anims.blink?.pause?.();
      window.clearTimeout(state.blinkTimer);
      state.blink = 0;
      if (prefersReducedMotion || !motion?.hasAnime) return;
      const loop = () => runBlinkOnce(() => {
        // Blink interval is calm and irregular: ~1.6–2.8x the per-mode base, floored at 3.4s,
        // so the optic never looks like it has something in its eye. Wide jitter avoids a metronome.
        const gap = Math.max(3400, state.blinkMs * (1.6 + Math.random() * 1.2));
        state.blinkTimer = window.setTimeout(loop, gap);
      });
      // Stagger the first blink so a fresh load / mode change doesn't blink immediately.
      state.blinkTimer = window.setTimeout(loop, 1800 + Math.random() * 2600);
    }
    function armBreath() {
      state.anims.breath?.pause?.();
      state.breath = 1;
      if (prefersReducedMotion || !motion?.hasAnime) return;
      state.anims.breath = motion.animateValue({
        targets: state, breath: [1.0, 1.006],
        duration: Math.max(1800, state.breathMs / 2), easing: 'inOutSine', loop: true, alternate: true
      });
    }
    function armRing() {
      state.anims.ring?.pause?.();
      if (prefersReducedMotion || !motion?.hasAnime) return;
      const from = state.ringAngle % 360;
      state.anims.ring = motion.animateValue({
        targets: state, ringAngle: [from, from + 360],
        duration: state.ringMs, easing: 'linear', loop: true
      });
    }
    function armScan() {
      state.anims.scan?.pause?.();
      if (!state.scanning) { state.scanAngle = 0; return; }
      if (prefersReducedMotion || !motion?.hasAnime) return;
      state.anims.scan = motion.animateValue({
        targets: state, scanAngle: [0, 360], duration: 2600, easing: 'linear', loop: true
      });
    }
    // Iris lattice cadence: signed period per mode (ms per revolution). Negative runs the
    // lattice counter-clockwise for inward-focused thinking modes; 0 parks it so blocked,
    // critical, and offline read as machinery actually stopped, distinct from idle creep.
    const IRIS_LATTICE_PERIOD_MS = {
      idle_watch: 210000,
      listening: 150000,
      waiting_user: 180000,
      notice: 130000,
      reading: 110000,
      writing: 104000,
      tool_shell: 88000,
      searching: 46000,
      reasoning: -150000,
      planning: -128000,
      complete: 170000,
      blocked: 0,
      critical: 0,
      degraded_offline: 0
    };
    function irisLatticePeriodMs(mode) {
      const period = IRIS_LATTICE_PERIOD_MS[mode];
      return Number.isFinite(period) ? period : IRIS_LATTICE_PERIOD_MS.idle_watch;
    }
    function armIrisLattice() {
      state.anims.irisLattice?.pause?.();
      state.irisMs = irisLatticePeriodMs(state.mode);
      if (prefersReducedMotion || !motion?.hasAnime || !state.irisMs) return;
      const from = state.irisAngle % 360;
      state.anims.irisLattice = motion.animateValue({
        targets: state, irisAngle: [from, from + (state.irisMs < 0 ? -360 : 360)],
        duration: Math.abs(state.irisMs), easing: 'linear', loop: true
      });
    }
    function fieldRingRate(mode, idx) {
      const base = mode === 'searching' ? 6 : mode === 'reasoning' ? -1.8 : 0.9;
      return base * (idx + 1);
    }
    function armFieldRings() {
      for (const a of state.anims.fieldRings || []) a?.pause?.();
      state.anims.fieldRings = [];
      const keys = ['a', 'b', 'c'];
      if (prefersReducedMotion || !motion?.hasAnime) {
        state.fieldRingAngles = { a: 0, b: 0, c: 0 };
        return;
      }
      for (const [idx, key] of keys.entries()) {
        const angle = Number.isFinite(state.fieldRingAngles[key]) ? state.fieldRingAngles[key] % 360 : 0;
        state.fieldRingAngles[key] = angle;
        const rate = fieldRingRate(state.mode, idx);
        const duration = Math.max(1000, (360 / Math.max(0.1, Math.abs(rate))) * 1000);
        state.anims.fieldRings.push(motion.animateValue({
          targets: state.fieldRingAngles,
          [key]: [angle, angle + (rate < 0 ? -360 : 360)],
          duration,
          easing: 'linear',
          loop: true
        }));
      }
    }
    // The pupil catchlights drift on slow independent orbits so the optic shimmers with life,
    // not just dilation. They live inside .cb-eye-pupil-group, so they ride blink/dilation too.
    function driftDots() {
      if (prefersReducedMotion || !motion?.hasAnime) return;
      // The pupil is r=44 around (550,550). Each catchlight must stay inside it, so its base
      // distance from center + drift amplitude + its own radius is kept well under 44. Bases are
      // pulled in toward center (vs. the static markup) to leave room for visible drift.
      const PUPIL_R = 44;
      const dots = [
        { el: pupilGroup?.querySelector('.cb-eye-dot-a'), bx: 540, by: 536, r: 9.0, ax: 3.5, ay: 3.0, dur: 14200, ph: 0.0, sy: 1.2, omin: 0.56, omax: 0.74 },
        { el: pupilGroup?.querySelector('.cb-eye-dot-b'), bx: 566, by: 562, r: 4.5, ax: 3.2, ay: 3.2, dur: 16800, ph: 1.7, sy: 0.8, omin: 0.38, omax: 0.56 },
        { el: pupilGroup?.querySelector('.cb-eye-dot-c'), bx: 556, by: 530, r: 3.2, ax: 2.8, ay: 2.8, dur: 19600, ph: 3.1, sy: 1.5, omin: 0.30, omax: 0.46 }
      ];
      for (const a of state.anims.dots || []) a?.pause?.();
      state.anims.dots = [];
      for (const d of dots) {
        if (!d.el) continue;
        const o = { t: 0 };
        state.anims.dots.push(motion.animateValue({
          targets: o, t: [0, Math.PI * 2], duration: d.dur, easing: 'linear', loop: true,
          update: () => {
            // Catchlights lag the pupil (the parent group is translated by gaze), so they slide
            // across the eye as it looks around — specular highlights of a fixed light source.
            let cx = d.bx + Math.cos(o.t) * d.ax - (state.x || 0) * 0.5;
            let cy = d.by + Math.sin(o.t * d.sy + d.ph) * d.ay - (state.y || 0) * 0.5;
            // Hard clamp to keep the whole dot within the pupil rim, regardless of phase/gaze.
            const dx = cx - 550;
            const dy = cy - 550;
            const max = PUPIL_R - d.r - 2;
            const dist = Math.hypot(dx, dy);
            if (dist > max) { const k = max / dist; cx = 550 + dx * k; cy = 550 + dy * k; }
            setConceptBAttribute(d.el, 'cx', cx.toFixed(1));
            setConceptBAttribute(d.el, 'cy', cy.toFixed(1));
            const shimmer = (1 + Math.sin(o.t + d.ph)) / 2;
            setConceptBStyleProperty(d.el, 'opacity', (d.omin + (d.omax - d.omin) * shimmer).toFixed(3));
          }
        }));
      }
    }

    // ── anime.js one-shot expressive transients (own dedicated elements) ──────
    function ripple(circle, { fromR, toR, peakO, dur, loop }) {
      if (!circle) return;
      // Restore inline overrides on finish so the element's CSS (alert-driven opacity, base r)
      // resumes ownership — anime.js and CSS never end up fighting over the same property.
      const restore = () => { circle.style.opacity = ''; circle.setAttribute('r', '244'); };
      if (!motion?.hasAnime) { restore(); return; }
      const o = { p: 0 };
      state.anims.pulse?.pause?.();
      state.anims.pulse = motion.animateValue({
        targets: o, p: [0, 1], duration: dur, easing: 'outQuad', loop: loop || undefined,
        update: () => {
          circle.setAttribute('r', (fromR + (toR - fromR) * o.p).toFixed(1));
          circle.style.opacity = Math.max(0, peakO * (1 - o.p)).toFixed(3);
        },
        complete: restore
      });
    }
    function flashRing() {
      if (!eyeRing || !motion?.hasAnime) return;
      const o = { p: 0 };
      motion.animateValue({
        targets: o, p: [0, 1], duration: 540, easing: 'outQuad',
        update: () => { eyeRing.style.opacity = (0.74 + 0.26 * Math.sin(o.p * Math.PI)).toFixed(3); },
        complete: () => { eyeRing.style.opacity = ''; }
      });
    }
    function flareLattice() {
      // Short light pulse across the iris lattice on state changes: the lens material
      // acknowledges the transition without adding any new chrome. CSS folds the var
      // into the lattice group opacity; removing it returns ownership to the stylesheet.
      if (!irisLattice || !motion?.hasAnime || prefersReducedMotion) return;
      const o = { p: 0 };
      state.anims.latticeFlare?.pause?.();
      state.anims.latticeFlare = motion.animateValue({
        targets: o, p: [0, 1], duration: 560, easing: 'outQuad',
        update: () => { irisLattice.style.setProperty('--cb-lattice-flare', Math.sin(o.p * Math.PI).toFixed(3)); },
        complete: () => { irisLattice.style.removeProperty('--cb-lattice-flare'); }
      });
    }
    const transients = {
      notice() { ripple(pulseCircle, { fromR: 208, toR: 328, peakO: 0.30, dur: 640 }); flashRing(); pulsePupilFlash(-0.045, 300); },
      complete() { ripple(pulseCircle, { fromR: 212, toR: 360, peakO: 0.46, dur: 820 }); flashRing(); pulsePupilFlash(0.035, 420); },
      blocked() { ripple(pulseCircle, { fromR: 232, toR: 292, peakO: 0.36, dur: 520, loop: 2 }); pulsePupilFlash(-0.055, 360); },
      touch() { ripple(pulseCircle, { fromR: 202, toR: 302, peakO: 0.34, dur: 560 }); flashRing(); pulsePupilFlash(0.04, 360); }
    };
    function fireModeTransition(prev, mode) {
      flareLattice();
      if (mode === 'complete') transients.complete();
      else if (mode === 'blocked' || mode === 'critical') transients.blocked();
      else if (mode === 'notice') transients.notice();
      else flashRing();
    }

    const GAZE_TARGETS = {
      front: [0, 0],
      augury_left: [-28, -4],
      route_right: [28, -2],
      bottom_status: [0, 22],
      internal_focus: [4, -8],
      down_work_left: [-14, 18],
      down_work_right: [14, 18],
      user_touch: [0, -1]
    };
    const FIXATION_POOLS = {
      idle_watch: [
        ['front', 4200, 8200], ['augury_left', 900, 1500], ['route_right', 900, 1400]
      ],
      reasoning: [['internal_focus', 3600, 7600], ['front', 2200, 4200]],
      planning: [['internal_focus', 2800, 5600], ['down_work_left', 1300, 2400]],
      tool_shell: [['down_work_left', 1400, 2600], ['down_work_right', 1400, 2600], ['bottom_status', 900, 1500]],
      writing: [['down_work_left', 1600, 3000], ['down_work_right', 1600, 3000]],
      reading: [['down_work_left', 1200, 2100], ['down_work_right', 1200, 2100], ['bottom_status', 900, 1500]],
      searching: [['augury_left', 650, 1100], ['route_right', 650, 1100], ['front', 700, 1300]],
      listening: [['front', 3600, 7200], ['user_touch', 1200, 2200]],
      waiting_user: [['front', 4200, 8200], ['user_touch', 1800, 3400]],
      blocked: [['bottom_status', 2400, 4800], ['route_right', 1200, 2200]],
      critical: [['bottom_status', 2200, 4400], ['front', 1200, 2200]],
      complete: [['front', 3200, 6800]],
      degraded_offline: [['bottom_status', 3800, 8200], ['front', 2600, 4600]]
    };
    const FOCUS_PROFILES = {
      idle_watch: { pupil: 1.00, iris: 1.00, lid: 0.06, upperBias: 0.03, lowerBias: 0.00, blinkMs: 7400, ringMs: 150000, breathMs: 7600 },
      reasoning: { pupil: 0.90, iris: 0.98, lid: 0.13, upperBias: 0.10, lowerBias: 0.02, blinkMs: 8600, ringMs: 190000, breathMs: 7800 },
      planning: { pupil: 0.94, iris: 0.99, lid: 0.10, upperBias: 0.08, lowerBias: 0.01, blinkMs: 8000, ringMs: 160000, breathMs: 7600 },
      tool_shell: { pupil: 0.96, iris: 1.01, lid: 0.09, upperBias: 0.06, lowerBias: 0.02, blinkMs: 6500, ringMs: 100000, breathMs: 6800 },
      writing: { pupil: 0.98, iris: 1.00, lid: 0.08, upperBias: 0.05, lowerBias: 0.01, blinkMs: 6800, ringMs: 120000, breathMs: 7000 },
      reading: { pupil: 0.98, iris: 1.00, lid: 0.08, upperBias: 0.05, lowerBias: 0.01, blinkMs: 6400, ringMs: 120000, breathMs: 7000 },
      searching: { pupil: 1.08, iris: 1.03, lid: 0.03, upperBias: 0.00, lowerBias: 0.00, blinkMs: 4800, ringMs: 42000, breathMs: 5600 },
      listening: { pupil: 1.14, iris: 1.04, lid: 0.02, upperBias: 0.00, lowerBias: 0.00, blinkMs: 5200, ringMs: 90000, breathMs: 5200 },
      waiting_user: { pupil: 1.10, iris: 1.01, lid: 0.03, upperBias: 0.00, lowerBias: 0.00, blinkMs: 7200, ringMs: 170000, breathMs: 7800 },
      blocked: { pupil: 0.84, iris: 0.96, lid: 0.22, upperBias: 0.16, lowerBias: 0.03, blinkMs: 9000, ringMs: 240000, breathMs: 8000 },
      critical: { pupil: 0.82, iris: 0.95, lid: 0.24, upperBias: 0.18, lowerBias: 0.04, blinkMs: 9400, ringMs: 260000, breathMs: 8000 },
      complete: { pupil: 1.02, iris: 1.01, lid: 0.04, upperBias: 0.01, lowerBias: 0.00, blinkMs: 7200, ringMs: 160000, breathMs: 7400 },
      degraded_offline: { pupil: 0.88, iris: 0.96, lid: 0.28, upperBias: 0.20, lowerBias: 0.05, blinkMs: 9800, ringMs: 280000, breathMs: 8000 }
    };
    function focusProfile(mode) { return FOCUS_PROFILES[mode] || FOCUS_PROFILES.idle_watch; }
    function chooseFixation(mode) {
      const pool = FIXATION_POOLS[mode] || FIXATION_POOLS.idle_watch;
      const row = pool[Math.floor(Math.random() * pool.length)] || pool[0];
      const jitter = (Math.random() - 0.5) * 0.75;
      const [x, y] = GAZE_TARGETS[row[0]] || GAZE_TARGETS.front;
      return { kind: row[0], x: x + jitter, y: y + jitter * 0.45, dwellMs: row[1] + Math.random() * (row[2] - row[1]) };
    }
    function contextualBlink(reason = 'attention', minGapMs = 900) {
      const now = performance.now();
      if (prefersReducedMotion || now - state.lastContextBlinkAt < minGapMs) return;
      state.lastContextBlinkAt = now;
      runBlinkOnce();
    }
    function setFixation(kind, holdMs = 1200, { blink = false, minBlinkGapMs = 900 } = {}) {
      const [x, y] = GAZE_TARGETS[kind] || GAZE_TARGETS.front;
      if (blink || Math.hypot((x || 0) - state.targetX, (y || 0) - state.targetY) > 22) contextualBlink(kind, minBlinkGapMs);
      state.fixation = { kind, x, y, nextAt: performance.now() + Math.max(300, holdMs) };
      state.targetX = x;
      state.targetY = y;
      state.lastGazeKind = kind;
      return state.fixation;
    }

    const rig = {
      setTarget(next = {}) {
        const prevMode = state.mode;
        const explicitX = Number.isFinite(Number(next.x));
        const explicitY = Number.isFinite(Number(next.y));
        state.mode = safeDisplayText(next.mode || state.mode, 32).replace(/[^a-z0-9_-]+/gi, '_') || 'idle_watch';
        state.special = safeDisplayText(next.special || state.special, 32).replace(/[^a-z0-9_-]+/gi, '_') || 'none';
        const profile = focusProfile(state.mode);
        if (explicitX || explicitY) {
          const x = finiteClamp(next.x, -34, 34, state.targetX);
          const y = finiteClamp(next.y, -30, 30, state.targetY);
          const moved = Math.hypot(x - state.targetX, y - state.targetY);
          if (moved > 22) contextualBlink('large-target-change');
          state.targetX = x;
          state.targetY = y;
          state.fixation = { kind: 'packet', x, y, nextAt: performance.now() + 900 };
        } else if (!state.fixation?.nextAt || performance.now() > state.fixation.nextAt) {
          const f = chooseFixation(state.mode);
          setFixation(f.kind, f.dwellMs, { blink: state.mode !== prevMode });
        }
        // Eased posture changes — anime.js tweens (reference: ~500ms scale, ~400ms lid).
        const iris = finiteClamp(next.irisScale ?? profile.iris, 0.72, 1.28, state.iris);
        const pupil = finiteClamp(next.pupilScale ?? profile.pupil, 0.60, 1.35, state.pupil);
        const lid = finiteClamp(next.lid ?? profile.lid, 0, 0.95, state.lid);
        const upperBias = finiteClamp(next.upperBias ?? profile.upperBias, 0, 0.45, state.upperBias);
        const lowerBias = finiteClamp(next.lowerBias ?? profile.lowerBias, 0, 0.30, state.lowerBias);
        if (motion?.hasAnime && !prefersReducedMotion) {
          motion.animateValue({ targets: state, iris, duration: 500, easing: 'outQuad' });
          motion.animateValue({ targets: state, pupil, duration: 500, easing: 'outQuad' });
          motion.animateValue({ targets: state, lid, duration: 400, easing: 'outQuad' });
          motion.animateValue({ targets: state, upperBias, duration: 420, easing: 'outQuad' });
          motion.animateValue({ targets: state, lowerBias, duration: 420, easing: 'outQuad' });
        } else {
          state.iris = iris; state.pupil = pupil; state.lid = lid; state.upperBias = upperBias; state.lowerBias = lowerBias;
        }
        // Re-arm cadence loops when their period changes.
        const blinkMs = finiteClamp(next.blinkMs ?? profile.blinkMs, 800, 12000, state.blinkMs);
        const ringMs = finiteClamp(next.ringMs ?? profile.ringMs, 6000, 420000, state.ringMs);
        const breathMs = finiteClamp(next.breathMs ?? profile.breathMs, 2400, 8000, state.breathMs);
        if (blinkMs !== state.blinkMs) { state.blinkMs = blinkMs; armBlink(); }
        if (ringMs !== state.ringMs) { state.ringMs = ringMs; armRing(); }
        if (breathMs !== state.breathMs) { state.breathMs = breathMs; armBreath(); }
        const scanning = state.mode === 'searching' || state.special === 'scan_sweep';
        if (scanning !== state.scanning) { state.scanning = scanning; armScan(); }
        if (state.mode !== prevMode) { contextualBlink(`mode-${state.mode}`); armFieldRings(); armIrisLattice(); fireModeTransition(prevMode, state.mode); }
      },
      touchPulse(detail = {}) {
        const now = performance.now();
        const pointerCount = Math.max(1, Math.min(5, Number(detail.pointerCount) || 1));
        const intensity = finiteClamp(detail.intensity, 0, 1, 0.55);
        const hasVector = Number.isFinite(Number(detail.dx)) || Number.isFinite(Number(detail.dy));
        const fallbackCx = window.innerWidth / 2;
        const fallbackCy = window.innerHeight / 2;
        const dx = hasVector
          ? Number(detail.dx) || 0
          : (Number.isFinite(Number(detail.x)) ? Number(detail.x) - (Number(detail.cx) || fallbackCx) : 0);
        const dy = hasVector
          ? Number(detail.dy) || 0
          : (Number.isFinite(Number(detail.y)) ? Number(detail.y) - (Number(detail.cy) || fallbackCy) : 0);
        // Finger-follow belongs to the existing RAF gaze spring. Do not start anime.js
        // tweens on every pointer move; just move the live target and let the spring chase it.
        const halfW = Math.max(1, window.innerWidth / 2);
        const halfH = Math.max(1, window.innerHeight / 2);
        const x = finiteClamp((dx / halfW) * 34, -34, 34, state.targetX);
        const y = finiteClamp((dy / halfH) * 30, -30, 30, state.targetY);
        state.targetX = x;
        state.targetY = y;
        state.fixation = { kind: 'user_touch', x, y, nextAt: now + (pointerCount > 1 ? 700 : 1000) };
        state.forcedUntil = now + (pointerCount > 1 ? 500 : 800);
        state.lastGazeKind = 'user_touch';
        state.lastTouchTarget = { x, y, intensity, pointerCount };
        const shouldPulse = !prefersReducedMotion && intensity >= 0.75 && (now - (state.lastTouchPulseAt || 0) >= 250);
        if (shouldPulse) {
          state.lastTouchPulseAt = now;
          pulsePupilFlash(pointerCount > 1 ? 0.065 : 0.05, pointerCount > 1 ? 360 : 320);
          transients.touch();
        }
        return { x, y, intensity, pointerCount };
      },
      touchResonance(detail = {}) {
        const now = performance.now();
        const intensity = finiteClamp(detail.intensity, 0, 1, 0.5);
        const pointerCount = Math.max(1, Math.min(5, Number(detail.pointerCount) || 1));
        const angle = Number.isFinite(Number(detail.angle)) ? Number(detail.angle) : 0;
        const distance = finiteClamp(detail.distance, 0, 900, 0);
        state.lastResonanceAt = now;
        state.resonance = { angle, distance, intensity, startedAt: now, ttlMs: pointerCount > 1 ? 1250 : 900 };
        document.documentElement.style.setProperty('--cb-touch-resonance-angle', `${angle}rad`);
        document.documentElement.style.setProperty('--cb-touch-resonance-intensity', intensity.toFixed(3));
        document.documentElement.style.setProperty('--cb-touch-resonance-distance', `${Math.min(distance, 700).toFixed(1)}px`);
        const ringKick = prefersReducedMotion ? 0.18 : 0.46 * intensity;
        state.fieldRingAngles.a += Math.cos(angle) * ringKick;
        state.fieldRingAngles.b += Math.sin(angle) * ringKick * 0.8;
        state.fieldRingAngles.c -= ringKick * 0.5;
        if (!prefersReducedMotion && intensity > 0.45 && now - (state.lastTouchPulseAt || 0) > 180) transients.notice();
        return { angle, distance, intensity };
      },
      pulse(kind = 'notice') { (transients[kind] || transients.notice)(); },
      blinkNow() { runBlinkOnce(); },
      // Cancel every anime.js loop/transient and the RAF flush. All long-running animations are
      // tracked in state.anims so they can be re-armed or torn down cleanly (no orphan loops).
      teardown() {
        window.cancelAnimationFrame(state.raf);
        window.clearTimeout(state.blinkTimer);
        const all = [state.anims.blink, state.anims.halfBlink, state.anims.pupilFlash, state.anims.breath, state.anims.ring, state.anims.scan, state.anims.pulse, state.anims.irisLattice, state.anims.latticeFlare, ...(state.anims.dots || []), ...(state.anims.fieldRings || [])];
        for (const a of all) a?.pause?.();
      },
      forceGaze(name = 'front', holdMs = 1200) {
        const normalized = GAZE_TARGETS[name] ? name : ({ center: 'front', left: 'augury_left', right: 'route_right', 'down-right': 'down_work_right', 'up-left': 'internal_focus' }[name] || 'front');
        state.forcedUntil = performance.now() + Math.max(300, Number(holdMs) || 1200);
        setFixation(normalized, holdMs, { blink: true, minBlinkGapMs: 520 });
      },
      debug() {
        return { build: DISPLAY_BUILD_ID, irisAngle: state.irisAngle, irisMs: state.irisMs, x: state.x, y: state.y, targetX: state.targetX, targetY: state.targetY, microX: state.micro?.x || 0, microY: state.micro?.y || 0, nextMicroAt: state.micro?.nextAt || 0, targetName: state.fixation?.kind || 'front', forcedUntil: state.forcedUntil || 0, iris: state.iris, pupil: state.pupil, pupilFlash: state.pupilFlash || 0, lid: state.lid, upperBias: state.upperBias, lowerBias: state.lowerBias, blink: state.blink, breath: state.breath, touchTarget: state.lastTouchTarget, lastResonanceAt: state.lastResonanceAt || 0, mode: state.mode, special: state.special, anime: Boolean(motion?.hasAnime) };
      }
    };
    const step = (now) => {
      const dt = Math.max(0.001, Math.min(0.050, (now - state.last) / 1000));
      state.last = now;
      const seconds = now / 1000;
      // Reduced motion: hold the gaze still (no continuous micro-wander); only state-driven
      // posture/color changes remain. anime.js cadence loops are already disabled in that mode.
      if (!prefersReducedMotion && now >= (state.forcedUntil || 0) && now >= (state.fixation?.nextAt || 0)) {
        const nextFix = chooseFixation(state.mode);
        setFixation(nextFix.kind, nextFix.dwellMs, { blink: nextFix.kind !== state.lastGazeKind && Math.hypot(nextFix.x - state.targetX, nextFix.y - state.targetY) > 22 });
      }
      const micro = prefersReducedMotion ? { x: 0, y: 0 } : conceptBEyeMicroMotion(state.mode, state.special, seconds);
      const saccade = updateMicroSaccade(now);
      const tx = state.targetX + micro.x + saccade.x;
      const ty = state.targetY + micro.y + saccade.y;
      const stiffness = state.mode === 'searching' || state.special === 'scan_sweep' ? 86 : 54;
      const damping = state.mode === 'searching' || state.special === 'scan_sweep' ? 15 : 12;
      state.vx += (tx - state.x) * stiffness * dt;
      state.vy += (ty - state.y) * stiffness * dt;
      if (Math.hypot(tx - state.x, ty - state.y) > 38) {
        state.vx *= 0.35;
        state.vy *= 0.35;
      }
      state.vx *= Math.exp(-damping * dt);
      state.vy *= Math.exp(-damping * dt);
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      renderConceptBEyeMotion({ root, hud, gazeGroup, iris, pupil, pupilGroup, glow, glowGradient, scanSweep, core, orbitSpin, lidTop, lidBottom, field, axisNodes, debugOverlay, bgA: bgParallax.a, bgB: bgParallax.b, glassSheen, glassCrescent, irisLattice, activityPanel }, state);
      state.raf = window.requestAnimationFrame(step);
    };
    // Kick the anime.js cadence loops once; setTarget re-arms them when a packet changes period.
    armBlink();
    armBreath();
    armRing();
    armFieldRings();
    armIrisLattice();
    driftDots();
    scheduleNextMicro(performance.now());
    state.raf = window.requestAnimationFrame(step);
    hud.__cbEyeMotion = rig;
    return rig;
  }

  function conceptBEyeMicroMotion(mode, special, t) {
    // Intentional fixations now own the main gaze path. This function is only tiny ocular tremor
    // and mode-specific breathing around a held target, so Hermes looks like he notices things
    // instead of drifting on obvious sine rails.
    if (special === 'scan_sweep' || mode === 'searching') {
      return { x: Math.sin(t * 5.8) * 0.34 + Math.sin(t * 1.7) * 0.18, y: Math.cos(t * 4.4) * 0.24 };
    }
    if (mode === 'reading') return { x: Math.sin(t * 6.0) * 0.18, y: Math.cos(t * 3.2) * 0.14 };
    if (mode === 'reasoning' || mode === 'planning') return { x: Math.sin(t * 2.5) * 0.10, y: Math.cos(t * 2.2) * 0.08 };
    if (mode === 'blocked' || mode === 'critical') return { x: Math.sin(t * 2.0) * 0.08, y: Math.cos(t * 1.8) * 0.06 };
    if (mode === 'waiting_user') return { x: Math.sin(t * 2.0) * 0.08, y: Math.cos(t * 1.6) * 0.06 };
    return { x: Math.sin(t * 1.9) * 0.08 + Math.sin(t * 3.8) * 0.035, y: Math.cos(t * 1.7) * 0.07 };
  }

  function renderConceptBEyeMotion(parts, state) {
    const x = Number.isFinite(state.x) ? state.x : 0;
    const y = Number.isFinite(state.y) ? state.y : 0;
    const blink = Number.isFinite(state.blink) ? Math.max(0, Math.min(1, state.blink)) : 0;
    state.frame = (state.frame + 1) % 120;
    if (parts.hud) {
      const edge = Math.min(1, Math.hypot(x, y) / CONCEPT_B_BIO_MOTION.gazeMaxHypot);
      setConceptBStyleProperty(parts.hud, '--cb-edge-rim-opacity', (CONCEPT_B_BIO_MOTION.edgeRimBase + CONCEPT_B_BIO_MOTION.edgeRimGain * edge).toFixed(3));
      setConceptBStyleProperty(parts.hud, '--cb-edge-rim-blur', `${(8 + edge * 10).toFixed(1)}px`);
    }
    if (parts.gazeGroup) setConceptBTransform(parts.gazeGroup, `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    // Breath (anime.js loop) scales the whole eye core; iris dilation (anime.js tween) nests inside.
    if (parts.core) setConceptBTransform(parts.core, `translate(550 550) scale(${(state.breath || 1).toFixed(4)}) translate(-550 -550)`);
    if (parts.iris) setConceptBTransform(parts.iris, `translate(550 550) scale(${state.iris.toFixed(3)}) translate(-550 -550)`);
    // Outer orbital ring rotation is an anime.js loop; apply its angle here (single writer).
    // It also parallaxes gently with gaze (mid-depth layer behind the eye) so the instrument
    // housing reacts when the optic looks around, without swimming like the anchored telemetry arcs.
    if (parts.orbitSpin) setConceptBTransform(parts.orbitSpin, `translate(${(x * 0.14).toFixed(2)} ${(y * 0.14).toFixed(2)}) rotate(${(state.ringAngle % 360).toFixed(2)} 550 550)`);
    // Blink is an anime.js cadence loop writing state.blink (0..1). Render it as a
    // symmetric lid pinch over the lens, not by scaling the iris/pupil. Scaling the
    // asymmetric catchlights toward center reads as a down-right dart on the physical panel.
    const lidFrac = Math.max(state.lid, blink);
    const effPupil = Math.max(0.60, Math.min(1.35, state.pupil + (Number(state.pupilFlash) || 0)));
    // Scale the whole pupil assembly so the pupil, catchlights, and specular dots stay
    // locked together during dilation/blink. Scaling only the pupil circle leaves the dots
    // looking like fixed screen artifacts as the eye breathes or changes state.
    if (parts.pupilGroup) setConceptBTransform(parts.pupilGroup, `translate(550 550) scale(${effPupil.toFixed(3)}) translate(-550 -550)`);
    if (parts.pupil) setConceptBAttribute(parts.pupil, 'r', '44');
    if (parts.glassSheen) setConceptBTransform(parts.glassSheen, `translate(${(-x * 0.18).toFixed(2)} ${(-y * 0.14).toFixed(2)})`);
    if (parts.glassCrescent) setConceptBTransform(parts.glassCrescent, `translate(${(-x * 0.10).toFixed(2)} ${(-y * 0.08).toFixed(2)})`);
    // Lattice rotation is the anime.js irisAngle loop; the slight counter-gaze lag layers
    // it between the lens body and the glass sheen so the iris reads as depth, not a decal.
    if (parts.irisLattice) setConceptBTransform(parts.irisLattice, `translate(${(-x * 0.07).toFixed(2)} ${(-y * 0.05).toFixed(2)}) rotate(${(state.irisAngle % 360).toFixed(2)} 550 550)`);
    renderConceptBLids(parts.lidTop, parts.lidBottom, lidFrac, state.upperBias, state.lowerBias);
    if (parts.glow) {
      setConceptBAttribute(parts.glow, 'cx', (550 + x * 0.42).toFixed(2));
      setConceptBAttribute(parts.glow, 'cy', (550 + y * 0.42).toFixed(2));
    }
    if (parts.glowGradient) {
      setConceptBAttribute(parts.glowGradient, 'cx', (550 + x * 0.54).toFixed(2));
      setConceptBAttribute(parts.glowGradient, 'cy', (550 + y * 0.54).toFixed(2));
      setConceptBAttribute(parts.glowGradient, 'r', (370 + Math.hypot(x, y) * 0.22).toFixed(2));
    }
    if (parts.scanSweep) {
      const scanning = state.mode === 'searching' || state.special === 'scan_sweep';
      // Reference radar sweep: one full revolution every 2.6s, driven by the anime.js scan loop.
      const sweepAngle = scanning ? (state.scanAngle % 360) : 0;
      setConceptBTransform(parts.scanSweep, `rotate(${sweepAngle.toFixed(2)} 550 550)`);
      setConceptBDataset(parts.scanSweep, 'active', scanning ? 'true' : 'false');
    }
    renderConceptBFieldMotion(parts.field, state, x, y);
    if (parts.axisNodes?.length) {
      const parallax = `translate(${(x * 0.12).toFixed(2)} ${(y * 0.12).toFixed(2)})`;
      for (const node of parts.axisNodes) setConceptBTransform(node, parallax);
    }
    setConceptBTransform(parts.bgA, `translate3d(${(x * 0.85).toFixed(2)}px, ${(y * 0.85).toFixed(2)}px, 0)`);
    setConceptBTransform(parts.bgB, `translate3d(${(x * -0.30).toFixed(2)}px, ${(y * -0.22).toFixed(2)}px, 0)`);
    setConceptBTransform(parts.activityPanel, `translateX(-50%) translate3d(${(-x * 0.10).toFixed(2)}px, ${(-y * 0.08).toFixed(2)}px, 0)`);
    if (parts.debugOverlay) {
      const modeEl = parts.debugOverlay.querySelector('[data-optic-debug-mode]');
      const gazeEl = parts.debugOverlay.querySelector('[data-optic-debug-gaze]');
      if (modeEl) modeEl.textContent = `mode=${state.mode}/${state.special}`;
      if (gazeEl) gazeEl.textContent = `gaze=${x.toFixed(1)},${y.toFixed(1)} target=${state.targetX.toFixed(1)},${state.targetY.toFixed(1)}`;
    }
  }


  function renderConceptBFieldMotion(field, state, x, y) {
    if (!field?.root) return;
    const now = performance.now();
    const reducedMotion = prefersReducedMotion;
    const mode = state.mode || 'idle_watch';
    const active = ['reasoning', 'planning', 'tool_shell', 'writing', 'searching'].includes(mode) || state.special === 'scan_sweep';
    const blocked = ['blocked', 'critical', 'degraded_offline'].includes(mode);
    setConceptBDataset(field.root, 'active', active ? 'true' : 'false');
    setConceptBDataset(field.root, 'mode', mode);
    const focus = mode === 'reasoning' || mode === 'planning' ? 0.82 : mode === 'tool_shell' ? 0.72 : mode === 'searching' ? 0.88 : blocked ? 0.42 : 0.34;
    const resonance = state.resonance || {};
    const resonanceAge = Math.max(0, now - (Number(resonance.startedAt) || 0));
    const resonanceTtl = Math.max(1, Number(resonance.ttlMs) || 900);
    const resonanceGain = reducedMotion ? 0 : Math.max(0, 1 - resonanceAge / resonanceTtl) * Math.max(0, Math.min(1, Number(resonance.intensity) || 0));
    const resonanceAngle = Number.isFinite(Number(resonance.angle)) ? Number(resonance.angle) : Math.atan2(y || 0.01, x || 0.01);
    setConceptBStyleProperty(field.root, '--cb-field-touch-boost', resonanceGain.toFixed(3));
    setConceptBTransform(field.root, 'translate(0 0)');

    const seconds = reducedMotion ? 0 : now / 1000;
    field.rings?.forEach((ring, idx) => {
      const key = ['a', 'b', 'c'][idx];
      const drift = reducedMotion ? 0 : (state.fieldRingAngles?.[key] || 0) % 360;
      setConceptBTransform(ring, `rotate(${drift.toFixed(2)} 550 550)`);
    });

    const gazeAngle = Math.atan2(y || 0.01, x || 0.01);
    const tickBucket = `${Math.round(gazeAngle * 24)}:${Math.round(Math.min(1, Math.hypot(x, y) / 28) * 20)}:${Math.round(resonanceAngle * 24)}:${Math.round(resonanceGain * 20)}`;
    if (field.__lastTickBucket !== tickBucket) {
      field.__lastTickBucket = tickBucket;
      field.ticks?.forEach((tick) => {
        const a = Number(tick.dataset.angle) || 0;
        const toward = Math.max(0, Math.cos(a - gazeAngle));
        const touchToward = Math.max(0, Math.cos(a - resonanceAngle));
        const boost = Math.max(toward * Math.min(1, Math.hypot(x, y) / 28), touchToward * resonanceGain * 1.18).toFixed(2);
        if (tick.dataset.boostBucket !== boost) {
          tick.dataset.boostBucket = boost;
          setConceptBStyleProperty(tick, '--cb-field-tick-boost', boost);
        }
      });
    }

    const radiusBias = mode === 'reasoning' || mode === 'planning' ? -24 : mode === 'searching' ? 0 : blocked ? -36 : 0;
    const moteBucket = `${mode}:${Math.round(seconds * 8)}:${Math.round(x)}:${Math.round(y)}:${radiusBias}:${Math.round(resonanceAngle * 16)}:${Math.round(resonanceGain * 16)}`;
    if (field.__lastMoteBucket !== moteBucket) {
      field.__lastMoteBucket = moteBucket;
      field.motes?.forEach((mote, idx) => {
        const phase = Number(mote.dataset.phase) || 0;
        const baseRadius = Number(mote.dataset.radius) || 270;
        const orbit = (phase + seconds / (mode === 'searching' ? 9 + idx : blocked ? 42 : 26 + idx * 3)) * Math.PI * 2;
        const r = baseRadius + radiusBias + (reducedMotion ? 0 : Math.sin(seconds * 0.45 + idx) * 2);
        const touchPull = resonanceGain * Math.max(0, Math.cos(orbit - resonanceAngle)) * 18;
        const moteX = 550 + Math.cos(orbit) * r + x * 0.18 + Math.cos(resonanceAngle) * touchPull;
        const moteY = 550 + Math.sin(orbit) * r + y * 0.18 + Math.sin(resonanceAngle) * touchPull;
        setConceptBAttribute(mote, 'cx', moteX.toFixed(2));
        setConceptBAttribute(mote, 'cy', moteY.toFixed(2));
        setConceptBStyleProperty(mote, '--cb-field-mote-opacity', String(blocked && idx > 2 ? 0 : 0.18 + focus * 0.20 + resonanceGain * 0.22));
      });
    }

    const moved = Math.hypot(x - state.lastTraceX, y - state.lastTraceY);
    if (!reducedMotion && moved > 9 && now - state.lastTraceAt > 200) {
      state.traces.push({ fromX: state.lastTraceX, fromY: state.lastTraceY, toX: x, toY: y, startedAt: now, ttlMs: 520 });
      state.traces = state.traces.slice(-2);
      state.lastTraceX = x;
      state.lastTraceY = y;
      state.lastTraceAt = now;
    }
    if (field.trace) {
      if (!field.__tracePool) {
        field.__tracePool = [0, 1].map(() => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.classList.add('cb-field-trace-path');
          field.trace.appendChild(path);
          return path;
        });
      }
      state.traces = state.traces.filter((trace) => now - trace.startedAt < trace.ttlMs);
      field.__tracePool.forEach((path, idx) => {
        const trace = state.traces[idx];
        if (!trace) {
          setConceptBAttribute(path, 'opacity', '0');
          setConceptBAttribute(path, 'd', '');
          return;
        }
        const age = (now - trace.startedAt) / trace.ttlMs;
        const sx = 550 + trace.fromX;
        const sy = 550 + trace.fromY;
        const ex = 550 + trace.toX;
        const ey = 550 + trace.toY;
        setConceptBAttribute(path, 'd', `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q 550 550 ${ex.toFixed(1)} ${ey.toFixed(1)}`);
        setConceptBAttribute(path, 'opacity', Math.max(0, 0.26 * (1 - age)).toFixed(2));
      });
    }
  }

  function finiteClamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function applyConceptBOptic(hud, puppet, fallbackAccent) {
    // Per-mode halo color is a primary state indicator. Normal active work must not
    // read as warning/caution on the physical display, so amber active modes are
    // rendered as calm cyan/blue. Reserve ochre/rust for actual waiting/blocked states.
    const palette = {
      amber: 'rgb(101, 243, 255)',
      hot_amber: 'rgb(137, 213, 230)',
      ochre: 'rgb(214, 126, 46)',
      rust: 'rgb(201, 84, 50)',
      moss: 'rgb(108, 182, 116)',
      steel: 'rgb(139, 156, 178)'
    };
    const colorKey = String(puppet?.halo?.color || '').trim();
    const accent = palette[colorKey] || fallbackAccent;
    const root = document.documentElement;
    setConceptBStyleProperty(root, '--cb-halo-opacity', String(clamp01(puppet?.halo?.opacity ?? puppet?.glow?.halo ?? 0.38)));
    setConceptBStyleProperty(root, '--cb-ring-opacity', String(clamp01(puppet?.ring?.opacity ?? 0.42)));
    setConceptBStyleProperty(root, '--cb-ring-period', `${Math.max(6, Number(puppet?.ring?.period_s) || 34)}s`);
    setConceptBStyleProperty(root, '--cb-breath-period', `${Math.max(2.4, Number(puppet?.breath?.period_s) || 5.2)}s`);
    setConceptBStyleProperty(root, '--cb-breath-scale', String(Number(puppet?.breath?.scale) || 1.018));
    const opticMode = safeDisplayText(puppet?.mode || 'idle_watch', 32).replace(/[^a-z0-9_-]+/gi, '_');
    const opticSpecial = safeDisplayText(puppet?.special || 'none', 32).replace(/[^a-z0-9_-]+/gi, '_');
    setConceptBDataset(hud, 'puppetMode', opticMode);
    setConceptBDataset(hud, 'opticMode', opticMode);
    setConceptBDataset(hud, 'puppetSpecial', opticSpecial);
    setConceptBDataset(hud, 'opticSpecial', opticSpecial);
    applyConceptBFieldVars(hud, opticMode, opticSpecial);

    const eyeMotion = ensureConceptBEyeMotion(hud);
    const calibration = eyeMotion?.calibration || (eyeMotion ? null : hud.querySelector('.cb-eye-calibration'));
    const aura = eyeMotion?.aura || (eyeMotion ? null : hud.querySelector('.cb-eye-aura'));
    window.__HERMES_CONCEPT_B_EYE_MOTION = eyeMotion;
    const hasGazeX = Number.isFinite(Number(puppet?.gaze?.offset_x));
    const hasGazeY = Number.isFinite(Number(puppet?.gaze?.offset_y));
    const gx = Math.max(-0.5, Math.min(0.5, Number(puppet?.gaze?.offset_x) || 0));
    const gy = Math.max(-0.5, Math.min(0.5, Number(puppet?.gaze?.offset_y) || 0));
    const hasIris = Number.isFinite(Number(puppet?.optic?.aperture_scale ?? puppet?.eyes?.iris_scale));
    const hasPupil = Number.isFinite(Number(puppet?.optic?.pupil_scale ?? puppet?.eyes?.pupil_scale));
    const hasLid = Number.isFinite(Number(puppet?.eyes?.lid)) || Number.isFinite(Number(puppet?.eyes?.lid_open));
    const irisScale = hasIris ? Math.max(0.72, Math.min(1.28, Number(puppet?.optic?.aperture_scale ?? puppet?.eyes?.iris_scale))) : undefined;
    const pupilScale = hasPupil ? Math.max(0.60, Math.min(1.35, Number(puppet?.optic?.pupil_scale ?? puppet?.eyes?.pupil_scale))) : undefined;
    const lid = hasLid ? Math.max(0, Math.min(0.95, Number.isFinite(Number(puppet?.eyes?.lid)) ? Number(puppet?.eyes?.lid) : (1 - Number(puppet?.eyes?.lid_open || 1)))) : undefined;
    const blinkMs = Math.max(800, Math.min(12000, Number(puppet?.blink?.interval_ms) || 5200));
    const ringMs = Math.max(6000, Math.min(420000, (Number(puppet?.ring?.period_s) || 34) * 1000));
    const breathMs = Math.max(2400, Math.min(8000, (Number(puppet?.breath?.period_s) || 5.2) * 1000));
    // Reference captures move the whole optic as one eyeball-like assembly.
    // Drive it through the Concept B motion rig so gaze changes become smooth saccades,
    // and the glow/background parallax follows the eye instead of sitting behind it.
    // lid/blinkMs/ringMs/breathMs re-arm the anime.js cadence loops + eased posture tweens.
    eyeMotion.setTarget({
      ...(hasGazeX ? { x: gx * 34 } : {}),
      ...(hasGazeY ? { y: gy * 30 } : {}),
      irisScale,
      pupilScale,
      lid,
      blinkMs,
      ringMs,
      breathMs,
      mode: safeDisplayText(puppet?.mode || 'idle_watch', 32),
      special: safeDisplayText(puppet?.special || 'none', 32)
    });
    setConceptBStyleProperty(hud, '--cb-winglet-tension', String(Math.max(0, Math.min(1, Number(puppet?.identity?.winglet_tension ?? puppet?.helmet?.wing_tension) || 0))));
    setConceptBAttribute(aura, 'opacity', String(clamp01(puppet?.halo?.opacity ?? puppet?.glow?.halo ?? 0.38)));
    setConceptBStyleProperty(calibration, 'animation-duration', `${Math.max(8, Number(puppet?.ring?.period_s) || 34)}s`);
    return accent;
  }


  function applyConceptBFieldVars(hud, mode, special) {
    const profiles = {
      idle_watch: { intensity: 0.22, motion: 0.10, focus: 0.24, alert: 0.00, radius: 274 },
      notice: { intensity: 0.46, motion: 0.30, focus: 0.44, alert: 0.48, radius: 284 },
      listening: { intensity: 0.36, motion: 0.16, focus: 0.34, alert: 0.12, radius: 280 },
      reading: { intensity: 0.34, motion: 0.14, focus: 0.56, alert: 0.03, radius: 262 },
      reasoning: { intensity: 0.42, motion: 0.08, focus: 0.86, alert: 0.03, radius: 248 },
      planning: { intensity: 0.42, motion: 0.12, focus: 0.78, alert: 0.04, radius: 252 },
      tool_shell: { intensity: 0.52, motion: 0.24, focus: 0.70, alert: 0.08, radius: 258 },
      writing: { intensity: 0.40, motion: 0.16, focus: 0.48, alert: 0.06, radius: 276 },
      searching: { intensity: 0.62, motion: 0.50, focus: 0.72, alert: 0.12, radius: 304 },
      waiting_user: { intensity: 0.34, motion: 0.06, focus: 0.34, alert: 0.10, radius: 286 },
      blocked: { intensity: 0.38, motion: 0.05, focus: 0.62, alert: 0.42, radius: 238 },
      complete: { intensity: 0.42, motion: 0.06, focus: 0.36, alert: 0.18, radius: 282 },
      degraded_offline: { intensity: 0.18, motion: 0.03, focus: 0.46, alert: 0.12, radius: 232 },
      critical: { intensity: 0.34, motion: 0.04, focus: 0.62, alert: 0.36, radius: 236 },
    };
    const profile = profiles[mode] || profiles.idle_watch;
    setConceptBStyleProperty(hud, '--cb-field-intensity', String(profile.intensity));
    setConceptBStyleProperty(hud, '--cb-field-focus', String(profile.focus));
    setConceptBStyleProperty(hud, '--cb-field-alert', String(profile.alert));
    setConceptBDataset(hud, 'fieldMode', special === 'scan_sweep' ? 'searching' : mode);
    setConceptBDataset(document.body, 'cbOpticMode', special === 'scan_sweep' ? 'searching' : mode);
    if (!document.body.dataset.auguryPresence) {
      setConceptBDataset(document.body, 'auguryPresence', conceptBAuguryPresence(currentPacket?.live || {}, special === 'scan_sweep' ? 'searching' : mode, currentPacket?.live?.freshness?.tier || 'fresh', currentPacket?.live?.gateway_ok === false ? 'GATEWAY WATCH' : 'GATEWAY OK'));
    }
  }

  function renderConceptBLids(top, bottom, lid, upperBias = 0, lowerBias = 0) {
    const amount = Math.max(0, Math.min(1, lid));
    const topY = 374;
    const bottomY = 726;
    const topH = Math.max(0, 176 * Math.max(0, Math.min(1, amount + (Number(upperBias) || 0))));
    const bottomH = Math.max(0, 176 * Math.max(0, Math.min(1, amount + (Number(lowerBias) || 0))));
    if (top) top.setAttribute('d', topH < 1 ? '' : `M 374 ${topY} H 726 V ${(topY + topH).toFixed(1)} C 650 ${(topY + topH + 18).toFixed(1)} 450 ${(topY + topH + 18).toFixed(1)} 374 ${(topY + topH).toFixed(1)} Z`);
    if (bottom) bottom.setAttribute('d', bottomH < 1 ? '' : `M 374 ${bottomY} H 726 V ${(bottomY - bottomH).toFixed(1)} C 650 ${(bottomY - bottomH - 14).toFixed(1)} 450 ${(bottomY - bottomH - 14).toFixed(1)} 374 ${(bottomY - bottomH).toFixed(1)} Z`);
  }

  function clamp01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  function conceptBAccent(label, freshnessTier, gatewayOk) {
    if (freshnessTier === 'lost' || gatewayOk === false) return 'rgb(200, 119, 90)';
    if (/BLOCKED|CRITICAL/.test(label)) return 'rgb(201, 151, 74)';
    if (/WAITING|ATTENTION|FEED STALE/.test(label) || freshnessTier === 'stale') return 'rgb(205, 171, 91)';
    if (/COMPLETE|SYSTEMS STEADY|QUIET WATCH|LOCAL WATCH/.test(label)) return 'rgb(115, 205, 159)';
    return 'rgb(137, 213, 230)';
  }



  function conceptBTopAlert(live, activity, freshnessTier, gatewayText, tempSeverity) {
    const state = live?.resolver?.display_state || '';
    const workKind = String(live?.current_work?.visual_kind || live?.current_work?.kind || activity?.kind || '').toLowerCase();
    const tempLabel = tempSeverity === 'hot' ? 'TEMP HIGH' : tempSeverity === 'warn' ? 'TEMP WATCH' : '';
    if (state === 'critical_local_issue') return { label: 'LOCAL ISSUE', detail: safeDisplayText(activity?.summary || 'attention required', 28).toUpperCase(), severity: 'critical' };
    if (freshnessTier === 'lost') return { label: 'FEED LOST', detail: gatewayText === 'GATEWAY WATCH' ? 'GATEWAY WATCH' : 'HOLDING LAST VIEW', severity: 'critical' };
    if (gatewayText === 'GATEWAY WATCH') return { label: 'GATEWAY WATCH', detail: 'LOCAL DISPLAY ACTIVE', severity: 'offline' };
    if (state === 'blocked_user_task') return { label: 'WAITING FOR BRIAN', detail: safeDisplayText(activity?.summary || 'blocked', 28).toUpperCase(), severity: 'watch' };
    if (state === 'needs_attention' || workKind === 'waiting') return { label: 'WAITING FOR BRIAN', detail: safeDisplayText(activity?.summary || 'needs input', 28).toUpperCase(), severity: 'watch' };
    if (tempLabel) return { label: tempLabel, detail: 'THERMAL WATCH', severity: tempSeverity === 'hot' ? 'critical' : 'watch' };
    if (freshnessTier === 'stale') return { label: 'FEED STALE', detail: 'WAITING FOR TELEMETRY', severity: 'offline' };
    return null;
  }

  function conceptBAuguryPresence(live, mode, freshnessTier, gatewayText) {
    if (familyAudience) return 'hidden';
    const state = live?.resolver?.display_state || '';
    const preset = currentPacket?.state_preset || '';
    const effectiveMode = String(mode || '').toLowerCase();
    if (['blocked', 'critical', 'degraded_offline'].includes(preset)) return 'hidden';
    if (['blocked_user_task', 'critical_local_issue'].includes(state)) return 'hidden';
    if (freshnessTier === 'lost' || gatewayText === 'GATEWAY WATCH') return 'hidden';
    if (['blocked', 'critical', 'degraded_offline', 'waiting_user'].includes(effectiveMode)) return 'hidden';
    if (['active-turn', 'active_turn', 'reasoning', 'planning', 'tool_shell', 'writing', 'searching'].includes(effectiveMode)) return 'subdued';
    return 'focus';
  }

  function conceptBAttentionReason(live, packet, activity, freshnessTier, gatewayText) {
    const state = live?.resolver?.display_state || '';
    if (gatewayText === 'GATEWAY WATCH' && freshnessTier === 'lost') return 'Feed lost — gateway watch. Local display holds last good view.';
    if (gatewayText === 'GATEWAY WATCH') return 'Gateway watch — local display remains active.';
    if (freshnessTier === 'lost') return 'Feed lost — holding last known local state.';
    if (freshnessTier === 'stale') return 'Feed stale — waiting for fresh telemetry.';
    if (state === 'blocked_user_task') return displaySentence(activity.summary || 'Waiting on Brian.');
    if (state === 'needs_attention') return displaySentence(activity.summary || 'Waiting for confirmation.');
    if (state === 'critical_local_issue') return displaySentence(activity.summary || 'Local issue needs attention.');
    return '';
  }

  function updateConceptBArc(group, label, value, unit, side, displayValue = null, metricMode = '') {
    if (!group) return;
    const safe = Number.isFinite(Number(value));
    const pct = Math.max(0, Math.min(100, safe ? Number(value) : 0));
    const cx = 550, cy = 550, r = 410;
    const centerDeg = { top: -90, right: 0, bottom: 90, left: 180 }[side] ?? -90;
    const span = 78;
    const start = centerDeg - span / 2;
    const end = centerDeg + span / 2;
    const track = group.querySelector('.cb-arc-track');
    const fill = group.querySelector('.cb-arc-fill');
    const dot = group.querySelector('.cb-arc-dot');
    const labelEl = group.querySelector('.cb-arc-label');
    const valueEl = group.querySelector('.cb-arc-value');
    setConceptBAttribute(track, 'd', conceptBArcPath(cx, cy, r, start, end));
    animateConceptBArc(group, { cx, cy, r, start, span, pct, fill, dot });
    const labelRad = centerDeg * Math.PI / 180;
    const nx = cx + Math.cos(labelRad) * (r + 46);
    const ny = cy + Math.sin(labelRad) * (r + 46);
    const anchor = side === 'right' ? 'start' : side === 'left' ? 'end' : 'middle';
    const explicitDisplay = displayValue !== null && displayValue !== undefined && displayValue !== '';
    const renderedValue = safe ? Math.round(explicitDisplay && Number.isFinite(Number(displayValue)) ? Number(displayValue) : pct) : '--';
    if (labelEl) {
      setConceptBText(labelEl, label);
      setConceptBAttribute(labelEl, 'x', String(nx));
      setConceptBAttribute(labelEl, 'y', String(ny + (side === 'bottom' ? 34 : -34)));
      setConceptBAttribute(labelEl, 'text-anchor', anchor);
    }
    if (valueEl) {
      setConceptBText(valueEl, `${renderedValue}${unit}`);
      setConceptBAttribute(valueEl, 'x', String(nx));
      setConceptBAttribute(valueEl, 'y', String(ny));
      setConceptBAttribute(valueEl, 'text-anchor', anchor);
    }
    const severityClass = safe && metricMode === 'temp' ? metricClassFor(displayValue, metricMode) : safe ? 'metric-ok' : 'metric-unknown';
    const severity = /hot/.test(severityClass) ? 'hot' : /warn/.test(severityClass) ? 'warn' : /unknown/.test(severityClass) ? 'unknown' : 'ok';
    setConceptBDataset(group, 'metric', metricMode || 'generic');
    setConceptBDataset(group, 'severity', severity);
    if (group.classList.contains('unknown') === safe) group.classList.toggle('unknown', !safe);
  }

  let conceptBArcMotionAdapter = null;
  let conceptBArcMotionReduced = null;
  function getConceptBArcMotionAdapter() {
    if (conceptBArcMotionAdapter && conceptBArcMotionReduced === prefersReducedMotion) return conceptBArcMotionAdapter;
    conceptBArcMotionReduced = prefersReducedMotion;
    conceptBArcMotionAdapter = window.HermesMotionAdapter?.createMotionAdapter?.({ prefersReducedMotion }) || null;
    return conceptBArcMotionAdapter;
  }

  function animateConceptBArc(group, geometry) {
    const { cx, cy, r, start, span, pct, fill, dot } = geometry;
    const previous = group.__cbArcPct;
    const active = group.__cbArcAnim;
    const from = Number.isFinite(active?.current) ? active.current : (Number.isFinite(previous) ? previous : pct);
    const to = Math.max(0, Math.min(100, Number(pct)));
    const durationMs = Number.isFinite(previous) ? 620 : 0;
    active?.anim?.pause?.();
    if (active?.raf) window.cancelAnimationFrame(active.raf);
    if (Math.abs(from - to) < 0.5 || durationMs <= 0) {
      group.__cbArcPct = to;
      group.__cbArcAnim = { current: to, anim: null, raf: 0 };
      renderConceptBArcProgress({ cx, cy, r, start, span, pct: to, fill, dot });
      return;
    }
    const reducedMotion = prefersReducedMotion;
    const motion = getConceptBArcMotionAdapter();
    if (!motion?.hasAnime || reducedMotion) {
      group.__cbArcPct = to;
      group.__cbArcAnim = { current: to, anim: null, raf: 0 };
      renderConceptBArcProgress({ cx, cy, r, start, span, pct: to, fill, dot });
      return;
    }
    const anim = { current: from, anim: null, raf: 0 };
    group.__cbArcAnim = anim;
    anim.anim = motion.animateValue({
      targets: anim,
      current: [from, to],
      duration: durationMs,
      easing: 'outQuad',
      update: () => {
        renderConceptBArcProgress({ cx, cy, r, start, span, pct: anim.current, fill, dot });
      },
      complete: () => {
        group.__cbArcPct = to;
        anim.current = to;
        renderConceptBArcProgress({ cx, cy, r, start, span, pct: to, fill, dot });
      }
    });
  }

  function renderConceptBArcProgress({ cx, cy, r, start, span, pct, fill, dot }) {
    const fillEnd = start + (Math.max(0, Math.min(100, pct)) / 100) * span;
    if (fill) fill.setAttribute('d', conceptBArcPath(cx, cy, r, start, fillEnd));
    const rad = fillEnd * Math.PI / 180;
    if (dot) {
      dot.setAttribute('cx', String(cx + Math.cos(rad) * r));
      dot.setAttribute('cy', String(cy + Math.sin(rad) * r));
    }
  }

  function conceptBArcPath(cx, cy, r, startDeg, endDeg) {
    const s = startDeg * Math.PI / 180;
    const e = endDeg * Math.PI / 180;
    const x1 = cx + Math.cos(s) * r;
    const y1 = cy + Math.sin(s) * r;
    const x2 = cx + Math.cos(e) * r;
    const y2 = cy + Math.sin(e) * r;
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  function workSummaryForDegraded(packet, quietFor) {
    const work = packet?.live?.current_work || {};
    const resolverState = packet?.live?.resolver?.display_state;
    if (work.active || resolverState === 'active_work' || resolverState === 'planning_reasoning') {
      return displaySentence(work.summary || work.detail || 'Working on the current request.') + ` · feed ${quietFor}`;
    }
    return `Display feed ${quietFor}.`;
  }

  function buildActivityCard(live, packet, status) {
    const work = live?.current_work || {};
    const age = Number(work.age_seconds);
    const ageKnown = Number.isFinite(age);
    const kanbanActive = Boolean(live?.kanban?.active);
    const taskCount = conceptBQueuedTaskCount(live);
    // Current-work styling must be bounded by the current_work age itself.
    // Queued/blocked Kanban cards are useful context, but they must not keep an
    // expired shell/tool state visually alive as ACTIVE TURN.
    const isCurrent = Boolean(work.active) && ageKnown && age <= CURRENT_WORK_MAX_AGE_SECONDS;
    const chips = buildActivityChips(work, ageKnown ? age : null, packet);

    if (status.failures) {
      if (isCurrent) {
        return {
          label: 'CURRENT TASK',
          summary: activitySummary(work, packet, kanbanActive),
          chips
        };
      }
      return {
        label: 'I’M WATCHING',
        summary: 'State feed is quiet. Keeping the last local view on screen.',
        chips
      };
    }

    const resolver = live?.resolver || {};
    if (isCurrent) {
      return {
        label: 'CURRENT TASK',
        summary: activitySummary(work, packet, kanbanActive),
        chips
      };
    }

    if (resolver.display_state === 'feed_stale_degraded') {
      return {
        label: 'FEED WATCH',
        summary: displaySentence(packet.caption?.text || 'Telemetry feed stale. Keeping last good view.'),
        chips
      };
    }

    if (resolver.display_state === 'recently_completed') {
      return {
        label: 'JUST FINISHED',
        summary: displaySentence(work.summary || packet.caption?.text || 'Recent work completed.'),
        chips
      };
    }

    if (Number.isFinite(taskCount) && taskCount > 0) {
      return {
        label: 'LOCAL WATCH',
        summary: `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} queued. Quiet watch.`,
        chips: ['LOCAL WATCH']
      };
    }

    if (ageKnown && age <= 30 * 60) chips.push(`${formatAge(age * 1000)} AGO`);
    return {
      label: 'I’M WATCHING',
      summary: displaySentence(ambientQuietLine(live, packet, status)),
      chips
    };
  }

  function buildActivityChips(work, ageSeconds, packet) {
    const chips = [];
    const kind = String(work?.visual_kind || work?.kind || '').replace(/[_-]+/g, ' ').trim();
    const source = activitySourceChip(work?.source || work?.session_label);
    const freshness = String(packet?.live?.freshness?.tier || '').trim().toUpperCase();
    const kindKey = kind.toLowerCase();
    if (kind && !/^(quiet|none|preview|reasoning|planning|diagnostic|waiting|working)$/i.test(kindKey)) {
      chips.push(kind.toUpperCase());
    }
    if (freshness && /^(FRESH|STALE|LOST)$/.test(freshness)) {
      chips.push(`FEED ${freshness}`);
    } else if (!source && Number.isFinite(ageSeconds) && ageSeconds > 90) {
      chips.push(`${formatAge(ageSeconds * 1000)} AGO`);
    }
    if (!chips.length && source) chips.push(source);
    if (!chips.length && packet?.live?.kanban?.active) chips.push('QUEUE LIVE');
    return chips.slice(0, 2);
  }

  function conceptBQueuedTaskCount(live) {
    const candidates = [live?.kanban?.active, live?.kanban?.queued];
    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value)) return value;
    }
    return NaN;
  }

  function activitySourceChip(value) {
    const text = safeDisplayText(value, 32).toLowerCase();
    if (!text) return '';
    if (text.includes('telegram')) return 'TELEGRAM';
    if (text.includes('signal')) return 'SIGNAL';
    if (text.includes('kanban')) return 'KANBAN';
    if (text.includes('cron')) return 'CRON';
    if (text.includes('browser')) return 'BROWSER';
    if (text.includes('terminal') || text.includes('shell')) return 'SHELL';
    return text.replace(/\b(session|current|active|source)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 12).toUpperCase();
  }

  function activitySummary(work, packet, kanbanActive = false) {
    const candidates = [work?.summary, work?.detail, packet?.caption?.text];
    const generic = /^(work active\.?|working\.?|current work\.?|busy\.?|using process\.?|thinking through the current request\.?|working through the display queue\.?|working on the current request\.?|reasoning before taking the next action\.?|reasoning before acting\.?|tracing the next decision\.?)$/i;
    for (const candidate of candidates) {
      const text = safeDisplayText(candidate, 58);
      if (text && !generic.test(text)) return text;
    }
    const kind = String(work?.visual_kind || work?.kind || '').replace(/_/g, ' ').trim();
    const source = activitySourceChip(work?.source || work?.session_label);
    const sourceName = source ? `${source.charAt(0)}${source.slice(1).toLowerCase()}` : '';
    const fallbackByKind = {
      writing: 'Writing a local file.',
      planning: sourceName ? `Planning the ${sourceName} turn.` : 'Planning the next safe step.',
      reasoning: sourceName ? `Thinking through the ${sourceName} turn.` : 'Checking constraints before action.',
      shell: 'Running the local task.',
      working: sourceName ? `Handling the ${sourceName} turn.` : 'Checking the active turn.',
      python: 'Running the local task.',
      diagnostic: 'Checking local telemetry.',
      waiting: 'Waiting on Brian.'
    };
    if (kind) {
      const key = kind.toLowerCase();
      return displaySentence(fallbackByKind[key] || `${kind.charAt(0).toUpperCase()}${kind.slice(1)} in progress.`);
    }
    if (kanbanActive) return 'Working the active queue.';
    return sourceName ? `Working this ${sourceName} turn.` : 'Checking constraints before action.';
  }

  function displaySentence(value) {
    const text = safeDisplayText(value, 58);
    if (!text) return 'Watching local systems quietly.';
    return text;
  }

  function safeDisplayText(value, maxLength = 64) {
    let text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const riskyPatterns = [
      /(?:^|\s)(?:\.{0,2}\/[\w.-]+|~\/|\/[\w.-]+(?:\/[\w.-]+)+)/,
      /(?:token|secret|api[_-]?key|authorization|bearer|password)\s*[:=]/i,
      /\bCUI\b|controlled unclassified information/i,
      /(?:BEGIN|END) [A-Z ]*(?:PRIVATE KEY|TOKEN|CERTIFICATE)/i,
      /\b[A-Za-z0-9+/]{48,}={0,2}\b/, // likely base64 or opaque credential-like blob
      /(?:sudo|curl|ssh|scp|rsync|docker|kubectl|python3?|node|npm|git)\s+[^.]{12,}/i
    ];
    if (riskyPatterns.some((pattern) => pattern.test(text))) text = '[display-safe detail hidden]';
    const limit = Math.max(12, Number(maxLength) || 64);
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1)).trim()}…` : text;
  }

  function activityLabel(live, mood) {
    const work = live?.current_work || {};
    const state = live?.resolver?.display_state;
    const taskCount = conceptBQueuedTaskCount(live);
    if (state === 'critical_local_issue') return 'CRITICAL';
    if (state === 'blocked_user_task') return 'BLOCKED';
    if (state === 'needs_attention') return mood === 'blocked_annoyed' ? 'WAITING INPUT' : 'ATTENTION';
    if (state === 'planning_reasoning' && work.active) return work.visual_kind === 'planning' ? 'PLANNING' : 'ACTIVE TURN';
    if (state === 'active_work' && work.active) return work.visual_kind === 'planning' ? 'PLANNING' : 'ACTIVE TURN';
    if (state === 'recently_completed') return 'COMPLETE';
    if (state === 'night_mode') return 'NIGHT WATCH';
    if (state === 'feed_stale_degraded') return 'FEED STALE';
    if (work.active) return 'WORKING';
    if (Number.isFinite(taskCount) && taskCount > 0) return 'LOCAL WATCH';
    return moodLabel(mood).toUpperCase();
  }

  function moodLabel(mood) {
    const moodLabels = {
      thinking_focused: 'working',
      healthy_smug: 'systems steady',
      blocked_annoyed: 'needs attention',
      night_sleepy: 'night watch',
      idle_watchful: 'quiet watch'
    };
    return moodLabels[mood] || 'online';
  }

  function displaySafeResolverDebug(packet, status) {
    const live = packet?.live || {};
    const resolver = live.resolver || {};
    const freshness = live.freshness || {};
    return {
      display_state: resolver.display_state || null,
      priority: resolver.priority ?? null,
      reason_codes: Array.isArray(resolver.reason_codes) ? resolver.reason_codes : [],
      secondary_badges: Array.isArray(resolver.secondary_badges) ? resolver.secondary_badges : [],
      freshness_tier: freshness.tier || null,
      stale_measurements: Array.isArray(freshness.stale_measurements) ? freshness.stale_measurements : [],
      gateway_ok: Boolean(live.gateway_ok),
      feed_failures: Number(status?.failures || 0),
      current_work_state: live.current_work?.state || null,
      current_work_kind: live.current_work?.kind || live.current_work?.visual_kind || null,
    };
  }


  function metricClassFor(value, mode) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'metric-unknown';
    if (mode === 'temp') return tempClassFor(number);
    if (mode === 'cpu') return number >= 95 ? 'metric-hot' : number >= 85 ? 'metric-warn' : 'metric-ok';
    if (mode === 'mem') return number >= 92 ? 'metric-hot' : number >= 80 ? 'metric-warn' : 'metric-ok';
    return 'metric-ok';
  }

  function measurementValue(sys, key, fallbackKey = null) {
    const measurement = sys?.measurements?.[key] || (fallbackKey ? sys?.measurements?.[fallbackKey] : null);
    const raw = measurement && Object.prototype.hasOwnProperty.call(measurement, 'value') ? measurement.value : sys?.[key] ?? (fallbackKey ? sys?.[fallbackKey] : undefined);
    return safeFinite(raw);
  }

  function setMetricText(el, value, mode, measurement) {
    if (!el) return;
    const valid = metricAvailable(value, measurement);
    el.textContent = valid ? (mode === 'temp' ? `${Math.round(value)}°C` : `${Math.round(value * 100)}%`) : 'Unavailable';
    el.className = valid ? metricClassFor(mode === 'temp' ? value : value * 100, mode) : 'metric-unknown';
    if (measurement?.status && measurement.status !== 'fresh') el.dataset.freshness = measurement.status;
    else delete el.dataset.freshness;
  }

  function metricAvailable(value, measurement) {
    const status = String(measurement?.status || '').toLowerCase();
    return Number.isFinite(value) && !['lost', 'missing', 'unavailable', 'error'].includes(status);
  }

  function sensorCountLabel(sys, freshnessTier) {
    const freshness = currentPacket.live?.freshness || {};
    const valid = Number(freshness.valid_measurements);
    const total = sys?.measurements ? Object.keys(sys.measurements).length : Number(sys.thermal_readings);
    if (Number.isFinite(valid) && Number.isFinite(total) && total > 0) return `${valid}/${total} sensors`;
    if (Number.isFinite(Number(sys.thermal_readings))) return `${sys.thermal_readings} sensors`;
    return freshnessTier === 'lost' ? 'unavailable' : '-- sensors';
  }

  function ambientQuietLine(live, packet, status) {
    const freshness = live?.freshness?.tier || (status.failures ? 'stale' : 'fresh');
    const gateway = live?.gateway_ok ? 'Gateway OK' : 'Gateway watch';
    if (freshness !== 'fresh') return `${gateway}. Telemetry ${freshness}.`;
    const work = live?.current_work || {};
    const age = Number(work.age_seconds);
    if (Number.isFinite(age) && age <= 30 * 60) return `${gateway}. Feed fresh; no active turn. Last turn ${formatAge(age * 1000)} ago.`;
    const idx = Math.floor(Date.now() / 30000) % QUIET_WATCH_LINES.length;
    return QUIET_WATCH_LINES[idx];
  }

  function tempClassFor(value) {
    const temp = Number(value);
    if (!Number.isFinite(temp)) return 'temp-unknown';
    if (temp >= 90) return 'metric-hot temp-hot';
    if (temp >= 82) return 'metric-warn temp-warn';
    return 'metric-ok temp-ok';
  }

  function telemetryTrend(cpuValue, tempValue, trends) {
    rememberTrend(trends.cpu, cpuValue);
    rememberTrend(trends.temp, tempValue);
    const tempTrend = trendFor(trends.temp, 1.5);
    if (tempTrend === 'up') return 'warming';
    if (tempTrend === 'down') return 'cooling';
    if (Number.isFinite(Number(cpuValue)) && Number(cpuValue) >= 0.62) return 'busy';
    return 'steady';
  }

  function rememberTrend(series, value, max = 10) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    series.push(number);
    while (series.length > max) series.shift();
  }

  function trendFor(series, threshold) {
    if (!Array.isArray(series) || series.length < 4) return 'steady';
    const delta = series[series.length - 1] - series[0];
    if (delta >= threshold) return 'up';
    if (delta <= -threshold) return 'down';
    return 'steady';
  }

  function sparkPath(series, min, max) {
    if (!Array.isArray(series) || series.length < 2) return '';
    const span = Math.max(1, max - min);
    return series.map((value, index) => {
      const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 120;
      const y = 22 - Math.max(0, Math.min(1, (Number(value) - min) / span)) * 20;
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function updateSparkline(pathEl, series, min, max) {
    if (!pathEl) return;
    pathEl.setAttribute('d', sparkPath(series, min, max));
  }

  function setBar(el, value, mode) {
    if (!el) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      el.style.setProperty('--fill', '0%');
      el.className = 'temp-unknown';
      return;
    }
    const scaled = mode === 'temp' ? ((numeric - 30) / 65) * 100 : numeric;
    const clamped = Math.max(0, Math.min(100, scaled));
    el.style.setProperty('--fill', `${Math.round(clamped)}%`);
    el.className = metricClassFor(numeric, mode);
  }

  function safeFinite(value) {
    if (value === null || value === undefined || value === '') return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function updateAudioBadge() {
    document.querySelectorAll('[data-audio-badge]').forEach((badge) => {
      const muted = window.HermesAudio?.isMuted?.() ?? false;
      badge.textContent = muted ? 'muted' : 'sound on';
      badge.classList.toggle('muted', muted);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatClock(timestampMs) {
    if (!timestampMs) return 'never';
    return new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatAge(ageMs) {
    const seconds = Math.max(0, Math.round(ageMs / 1000));
    if (seconds < 90) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }

  function chooseQuip(packet) {
    const quips = {
      idle_watchful: ['Quiet systems. Suspicious.', 'Quiet watch with opinions.', 'Watching the home base.'],
      thinking_focused: ['Logs are judging us.', 'Chasing a thread.', 'Tooling up.'],
      healthy_smug: ['All green. Oddly polite.', 'No fires. Tiny miracle.', 'Uptime tastes like victory.'],
      blocked_annoyed: ['Blocked. Stare deployed.', 'Waiting on a human API.', 'Paused at permission wall.'],
      night_sleepy: ['Dim, not gone.', 'Guard mode: sleepy edition.', 'Keeping one eye on things.']
    };
    const list = quips[packet.mood] || quips.idle_watchful;
    return list[Math.floor(Math.random() * list.length)];
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function applyPageMode() {
    const params = new URLSearchParams(window.location.search);
    const kiosk = ['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase());
    const landscape = ['landscape', 'right', 'cw'].includes((params.get('orientation') || '').toLowerCase());
    const family = ['family', 'theater'].includes((params.get('audience') || '').toLowerCase()) || (params.get('view') || '').toLowerCase() === 'theater';
    const tastePrototype = ['1', 'true', 'yes'].includes((params.get('taste') || '').toLowerCase());
    document.body.classList.toggle('kiosk-mode', kiosk);
    document.body.classList.toggle('kiosk-landscape', kiosk && (landscape || !(params.get('orientation') || '').trim()));
    document.body.classList.toggle('family-theater', kiosk && family);
    document.body.classList.toggle('taste-prototype', kiosk && (landscape || !(params.get('orientation') || '').trim()) && tastePrototype);
    document.body.dataset.audience = family ? 'family' : 'operator';
    if (kiosk) {
      document.body.setAttribute('data-display-mode', 'kiosk');
      document.title = 'Hermes Personal Display';
    }
  }

  writePacket(currentPacket, 'Ready. Hermes optic runtime loaded.');
})();
