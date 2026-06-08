(() => {
  const WIDTH = 320;
  const HEIGHT = 480;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PUPPET_URL = './mascot/hermes-puppet.svg';
  let puppetTemplatePromise = null;

  const PUPPET_X = 50;
  const PUPPET_Y = 73;
  const PUPPET_W = 220;
  const PUPPET_H = 260;

  const PUPPET_BASE_X = 110;
  const PUPPET_BASE_Y = 127;

  const HOST_CENTER_X = PUPPET_X + PUPPET_BASE_X;
  const HOST_CENTER_Y = PUPPET_Y + PUPPET_BASE_Y;

  const TAIL_PIVOT = { x: 0, y: 63 };
  const HELMET_PIVOT = { x: 0, y: -22 };
  const WING_LEFT_PIVOT = { x: -51, y: -67 };
  const WING_RIGHT_PIVOT = { x: 51, y: -67 };

  const { STATES, NUDGES, BROWS, MOUTH_PATHS, GAZE, BEHAVIOR_GAZE_GRAMMAR, BEHAVIOR_MOUTH_GRAMMAR, CONTEXTUAL_BLINK_GRAMMAR, pickWeighted } = window.HermesDisplayStates;
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const KIOSK_MODE = ['1', 'true', 'yes'].includes((URL_PARAMS.get('kiosk') || '').toLowerCase());
  const PERF_MODE = (URL_PARAMS.get('perf') || 'full').toLowerCase();

  function el(name, attrs, children) {
    const node = document.createElementNS(SVG_NS, name);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value === null || value === undefined) continue;
        node.setAttribute(key, String(value));
      }
    }
    if (children) {
      for (const child of children) {
        if (child) node.appendChild(child);
      }
    }
    return node;
  }

  function txt(name, attrs, text) {
    const node = el(name, attrs);
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  async function loadPuppetTemplate() {
    if (!puppetTemplatePromise) {
      puppetTemplatePromise = fetch(PUPPET_URL, { cache: 'no-cache' }).then(async (res) => {
        if (!res.ok) throw new Error(`puppet fetch failed: ${res.status}`);
        const text = await res.text();
        const trimmed = text.trim();
        if (!trimmed) throw new Error('puppet fetch returned empty SVG');
        const doc = new DOMParser().parseFromString(trimmed, 'image/svg+xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) throw new Error(`puppet parse error: ${parserError.textContent}`);
        return doc.documentElement;
      }).catch((err) => {
        puppetTemplatePromise = null;
        throw err;
      });
    }
    return puppetTemplatePromise;
  }

  class HermesDisplayRenderer {
    constructor(rootId, initialPacket) {
      this.root = document.getElementById(rootId);
      this.packet = window.HermesDisplayState.normalizePersonaPacket(initialPacket);
      this.target = this.packet;
      this.previous = this.packet;
      this.transitionStart = performance.now();
      this.transitionMs = 700;
      this.transition = 1;
      this.seed = 91327;
      this.motes = makeMotes(KIOSK_MODE ? 0 : 16);
      this.nextBlinkAt = 0;
      this.blinkStart = -10000;
      this.blinkDuration = 145;
      this.pendingDoubleBlink = 0;
      this.intent = null;
      this.attentionStack = [];
      this.transitionPhase = { name: 'sustain', startedAt: performance.now(), source: 'initial', current: false };
      this.recentAvatarEvents = [];
      this.avatarEventStats = { accepted: 0, dropped: 0, lastDropReason: '' };
      this.nextIntentAt = 0;
      this.poseChannel = { name: 'pose', rootX: 0, rootY: 0, tilt: 0, scale: 1, budgetOk: true };
      this.gazeChannel = {
        name: 'gaze', mode: 'hold', targetName: 'center', intentLocked: false,
        from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, holdBase: { x: 0, y: 0 },
        moveStart: 0, moveDuration: 120, holdUntil: 0, holdStartedAt: 0,
        jitterPx: 0.08, nextMicroAt: 0, micro: { x: 0, y: 0 }
      };
      this.blinkFaceChannel = { name: 'blinkFace', blink: 0, lid: 0, squint: 0, browLeft: '', browRight: '', mouth: '' };
      this.fxChannel = { name: 'fx', intensity: 1 };
      this.gazeTargetName = 'center';
      this.gazeTarget = { x: 0, y: 0 };
      this.gazeCurrent = { x: 0, y: 0 };
      this.nextGazeAt = 0;
      this.nextIdleRoutineAt = 0;
      this.idleRoutineStep = 0;
      this.freezeRequested = false;
      this.lastIntentLabel = '';
      this.lastIntentAt = -10000;
      this.frameHandle = null;
      this.lastFrameAt = 0;
      this.frameIntervalMs = 0;
      this.perfTier = 'full';
      this.lastDecorFrameAt = -10000;
      this.lastPanelFrameAt = -10000;
      this.lastDebugEmitAt = -10000;
      this.highlightSweepUntil = 0;
      this.puppetReady = false;
      this.framePaused = false;
      this.prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
      this.motionAdapter = window.HermesMotionAdapter?.createMotionAdapter?.({ prefersReducedMotion: this.prefersReducedMotion }) || null;
      this.behaviorService = window.HermesBehaviorMachine?.createBehaviorService?.(URL_PARAMS.get('mode') || initialPacket?.behavior_mode || 'idle_watch') || null;
      if (URL_PARAMS.get('mode') && window.HermesBehaviorMachine?.packetForMode) {
        const mapped = window.HermesBehaviorMachine.packetForMode(URL_PARAMS.get('mode'), this.target);
        this.packet = window.HermesDisplayState.normalizePersonaPacket(mapped);
        this.target = this.packet;
        this.previous = this.packet;
      }
      this.eventTarget = new EventTarget();
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', (event) => {
        this.prefersReducedMotion = Boolean(event.matches);
        this.motionAdapter = window.HermesMotionAdapter?.createMotionAdapter?.({ prefersReducedMotion: this.prefersReducedMotion }) || this.motionAdapter;
        this.scheduleBlink(performance.now(), true);
      });
      this.mount();
      this.loadPuppet().then(() => {
        this.collectPuppetRefs();
        this.puppetReady = true;
        this.applyState(this.target, true);
        const now = performance.now();
        this.scheduleBlink(now, true);
        this.scheduleGaze(now, true);
        this.scheduleIntent(now, true);
        this.frame = this.frame.bind(this);
        this.scheduleFrame();
      }).catch((err) => {
        this.showLoadError(err);
      });
    }

    on(eventName, handler) { this.eventTarget.addEventListener(eventName, handler); }

    whenReady() {
      if (this.puppetReady) return Promise.resolve();
      return new Promise((resolve) => {
        const check = () => {
          if (this.puppetReady) resolve();
          else setTimeout(check, 30);
        };
        check();
      });
    }

    freeze() {
      this.freezeRequested = true;
      if (this.frameHandle) {
        cancelAnimationFrame(this.frameHandle);
        clearTimeout(this.frameHandle);
        this.frameHandle = null;
      }
      this.framePaused = true;
      this.emitDebug();
    }

    play() {
      this.freezeRequested = false;
      this.framePaused = false;
      if (this.frameHandle || !this.puppetReady) return;
      this.scheduleFrame();
      this.emitDebug();
    }

    scheduleFrame(delayMs = null) {
      if (delayMs === null || delayMs <= 0) {
        this.frameHandle = requestAnimationFrame(this.frame);
        return;
      }
      this.frameHandle = setTimeout(() => {
        this.frameHandle = requestAnimationFrame(this.frame);
      }, delayMs);
    }

    setFrozen(frozen) {
      if (frozen) this.freeze();
      else this.play();
    }

    isFrozen() {
      return this.puppetReady && this.framePaused;
    }

    setStaticGaze(name) {
      const target = GAZE[name] || GAZE.center;
      this.gazeTargetName = name;
      this.gazeTarget = { ...target };
      this.gazeCurrent = { ...target };
      Object.assign(this.gazeChannel, {
        mode: 'hold', targetName: name, from: { ...target }, to: { ...target },
        holdBase: { ...target }, holdUntil: Infinity, intentLocked: false, micro: { x: 0, y: 0 }
      });
      this.emitDebug();
    }

    pulseGaze(name, holdMs = 900) {
      if (!this.puppetReady) return false;
      const now = performance.now();
      const state = this.stateFor(this.target);
      this.startGazeSaccade(name, now, state, false, true);
      this.gazeChannel.holdUntil = now + Math.max(300, holdMs);
      this.nextGazeAt = this.gazeChannel.holdUntil;
      window.setTimeout(() => {
        if (!this.puppetReady || this.gazeChannel.targetName !== name) return;
        this.gazeChannel.intentLocked = false;
        this.scheduleGaze(performance.now(), true);
      }, Math.max(300, holdMs));
      return true;
    }

    notice(source = 'center', opts = {}) {
      if (!this.puppetReady) return null;
      const previous = {
        targetName: this.gazeChannel.targetName || this.gazeTargetName || 'center',
        target: { ...(this.gazeChannel.holdBase || this.gazeCurrent || GAZE.center) },
        at: performance.now(),
        source
      };
      this.attentionStack.push(previous);
      if (this.attentionStack.length > 5) this.attentionStack.shift();

      const sourceMap = {
        user: 'forward_focus',
        center: 'forward_focus',
        front: 'forward_focus',
        left: 'left',
        right: 'right',
        rail_left: 'left',
        rail_right: 'right',
        prompt: 'down',
        tool: 'down_right',
        terminal: 'down_right',
        alert: 'side_eye_left',
        feed: 'left',
        background: 'up_right'
      };
      const gaze = opts.gaze || sourceMap[source] || 'forward_focus';
      const holdMs = opts.holdMs || 850;
      const intentName = opts.intent || 'tiny_perk';
      this.beginTransitionPhase('notice', source);
      this.scheduleContextualBlink('notice', performance.now());
      this.triggerIntent(intentName, false);
      window.setTimeout(() => {
        this.beginTransitionPhase('orient', source);
        this.pulseGaze(gaze, holdMs);
      }, 80);
      window.setTimeout(() => this.beginTransitionPhase('commit', source), Math.min(360, Math.max(160, holdMs * 0.35)));
      window.setTimeout(() => this.beginTransitionPhase('sustain', source), Math.min(700, Math.max(320, holdMs * 0.72)));
      window.setTimeout(() => {
        this.beginTransitionPhase('resolve', source);
        this.restoreAttention();
      }, holdMs + 120);
      return { source, gaze, holdMs, phase: 'notice' };
    }

    beginTransitionPhase(name, source = 'runtime') {
      // Transition grammar: notice -> orient -> commit -> sustain -> resolve.
      const allowed = ['notice', 'orient', 'commit', 'sustain', 'resolve'];
      const phase = allowed.includes(name) ? name : 'sustain';
      this.transitionPhase = { name: phase, source, startedAt: performance.now(), current: phase === 'sustain' };
      this.emitDebug();
      return this.transitionPhase;
    }

    scheduleContextualBlink(phaseName, now = performance.now()) {
      const profile = CONTEXTUAL_BLINK_GRAMMAR?.[phaseName] || CONTEXTUAL_BLINK_GRAMMAR?.sustain;
      if (!profile) return;
      if (profile.double) this.queueDoubleBlink(now);
      else this.startBlink(now, profile.durationMs || 150);
    }

    ingestAvatarEvent(rawEvent) {
      const event = validateAvatarEvent(rawEvent);
      if (!event.ok) {
        this.avatarEventStats.dropped += 1;
        this.avatarEventStats.lastDropReason = event.reason;
        this.emitDebug();
        return { ok: false, reason: event.reason };
      }
      const accepted = event.value;
      this.avatarEventStats.accepted += 1;
      this.recentAvatarEvents.push({
        id: accepted.id,
        event: accepted.event,
        intent: accepted.display.intent,
        visualKind: accepted.display.visual_kind || 'unknown',
        at: Date.now()
      });
      while (this.recentAvatarEvents.length > 8) this.recentAvatarEvents.shift();
      const behaviorEvents = window.HermesBehaviorMachine?.behaviorEventsForAvatarEvent?.(accepted) || [];
      if (behaviorEvents.length && this.behaviorService?.sendAll) {
        this.behaviorService.sendAll(behaviorEvents);
        const mode = this.behaviorService.mode;
        const richBase = window.HermesBehaviorMachine?.renderPacketForBehaviorMode?.(mode, this.target)
          || window.HermesBehaviorMachine?.packetForMode?.(mode, this.target);
        const packet = window.HermesBehaviorMachine?.packetForAvatarEvent?.(accepted, mode, richBase)
          || richBase;
        if (packet) this.setPacket(packet, true);
      }
      this.reduceAvatarEventToPuppetIntent(accepted);
      this.emitDebug();
      return { ok: true, event: accepted.event };
    }

    reduceAvatarEventToPuppetIntent(event) {
      const display = event.display || {};
      const intentMap = {
        assistant_active: ['user', 'forward_focus', 'tiny_perk'],
        tool_active: ['tool', 'down_right', display.visual_kind === 'searching' ? 'scan_sweep' : 'tiny_perk'],
        tool_settled: ['tool', 'center', 'slow_blink'],
        waiting_on_user: ['user', 'forward_focus', 'slow_blink'],
        finalizing: ['user', 'forward_focus', 'tiny_perk'],
        final_complete: ['user', 'smug', 'smug_nod'],
        display_recovered: ['feed', 'center', 'settle'],
        touch_tap: [`rail_${display.side || 'center'}`, display.side === 'left' ? 'left' : display.side === 'right' ? 'right' : 'forward_focus', 'tiny_perk'],
        touch_long_press: ['user', 'forward_focus', 'slow_double_blink'],
        feed_stale: ['feed', 'down_left', 'slow_blink'],
        feed_lost: ['feed', 'down_left', 'slow_blink'],
        feed_recovered: ['feed', 'center', 'settle']
      };
      const [source, gaze, intent] = intentMap[display.intent] || ['background', 'center', 'slow_blink'];
      this.notice(source, { gaze, intent, holdMs: display.intent === 'feed_lost' ? 1500 : 900 });
      if (display.intent === 'feed_lost') this.scheduleContextualBlink('degraded_offline');
    }

    restoreAttention() {
      if (!this.puppetReady || !this.attentionStack.length) return false;
      const previous = this.attentionStack.pop();
      if (!previous?.targetName) return false;
      this.pulseGaze(previous.targetName, 650);
      return true;
    }

    reactToTouch(zone = 'center', opts = {}) {
      if (!this.puppetReady) return null;
      const side = zone === 'left' ? 'left' : zone === 'right' ? 'right' : 'center';
      const gaze = side === 'left' ? 'left' : side === 'right' ? 'right' : 'forward_focus';
      const intentName = opts.intent || (side === 'left' ? 'glance_left' : side === 'right' ? 'glance_right' : 'tiny_perk');
      const holdMs = opts.holdMs || (side === 'center' ? 920 : 1050);
      this.pulseGaze(gaze, holdMs);
      const intent = this.triggerIntent(intentName) || (side === 'center' ? this.triggerIntent('slow_double_blink') : null);
      this.highlightSweepUntil = performance.now() + Math.min(900, Math.max(360, holdMs));
      return intent || { name: intentName, label: NUDGES[intentName]?.label || intentName, duration: holdMs };
    }

    setStillOverride(opts) {
      this.stillOverride = opts ? { ...opts } : null;
      if (opts?.gaze) this.setStaticGaze(opts.gaze);
    }

    clearStillOverride() {
      this.stillOverride = null;
    }

    mount() {
      this.root.innerHTML = '';
      const svg = el('svg', {
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
        width: WIDTH,
        height: HEIGHT,
        role: 'img',
        'aria-label': 'Hermes mascot SVG puppet runtime preview',
        class: 'mascot-stage'
      });
      const defs = el('defs');
      const bgGradient = el('radialGradient', { id: 'v2BgGlow', cx: '50%', cy: '36%', r: '78%' });
      bgGradient.appendChild(el('stop', { class: 'bg-stop-1', offset: '0%', 'stop-color': '#14314a', 'stop-opacity': '0.82' }));
      bgGradient.appendChild(el('stop', { offset: '58%', 'stop-color': '#07101b', 'stop-opacity': '0.88' }));
      bgGradient.appendChild(el('stop', { offset: '100%', 'stop-color': '#03060b', 'stop-opacity': '1' }));
      defs.appendChild(bgGradient);
      const spotGradient = el('radialGradient', { id: 'v2Spot', cx: '50%', cy: '58%', r: '48%' });
      spotGradient.appendChild(el('stop', { offset: '0%', 'stop-color': '#65f3ff', 'stop-opacity': '0.12' }));
      spotGradient.appendChild(el('stop', { offset: '100%', 'stop-color': '#65f3ff', 'stop-opacity': '0' }));
      defs.appendChild(spotGradient);
      const scanPattern = el('pattern', { id: 'v2ScanPattern', width: 8, height: 8, patternUnits: 'userSpaceOnUse' });
      scanPattern.appendChild(el('path', { d: 'M0 7.5 H8', stroke: '#ffffff', 'stroke-opacity': '0.05', 'stroke-width': '1' }));
      defs.appendChild(scanPattern);
      const runtimeGlow = el('filter', { id: 'v2RuntimeGlow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
      runtimeGlow.appendChild(el('feGaussianBlur', { stdDeviation: '4', result: 'b' }));
      const merge = el('feMerge');
      merge.appendChild(el('feMergeNode', { in: 'b' }));
      merge.appendChild(el('feMergeNode', { in: 'SourceGraphic' }));
      runtimeGlow.appendChild(merge);
      defs.appendChild(runtimeGlow);
      svg.appendChild(defs);

      svg.appendChild(el('rect', { class: 'bg', width: 320, height: 480, fill: 'url(#v2BgGlow)' }));
      svg.appendChild(el('rect', { class: 'scanlines', width: 320, height: 480, fill: 'url(#v2ScanPattern)', opacity: '0.62' }));
      svg.appendChild(el('rect', { class: 'spot', width: 320, height: 480, fill: 'url(#v2Spot)' }));
      svg.appendChild(el('g', { class: 'ambient-lines' }));
      svg.appendChild(el('g', { class: 'top-ticks' }));

      const topbar = el('g', { class: 'topbar' });
      topbar.appendChild(el('rect', { x: 14, y: 16, width: 292, height: 36, rx: 14, fill: '#ffffff', opacity: '0.055' }));
      topbar.appendChild(el('circle', { class: 'state-dot', cx: 31, cy: 34, r: 4.5, fill: '#65f3ff' }));
      topbar.appendChild(txt('text', {
        class: 'state-label', x: 43, y: 38, fill: '#d8f7ff',
        'font-family': 'ui-monospace, Menlo, Consolas, monospace',
        'font-size': 10, 'font-weight': 700
      }));
      topbar.appendChild(txt('text', {
        class: 'intent-label', x: 160, y: 38, 'text-anchor': 'middle', fill: '#65f3ff',
        'font-family': 'ui-monospace, Menlo, Consolas, monospace',
        'font-size': 9, opacity: '0'
      }));
      topbar.appendChild(txt('text', {
        class: 'skin-label', x: 291, y: 38, 'text-anchor': 'end', fill: '#8aa2b2',
        'font-family': 'ui-monospace, Menlo, Consolas, monospace',
        'font-size': 9
      }));
      svg.appendChild(topbar);

      svg.appendChild(el('ellipse', {
        class: 'floor-shadow', cx: 160, cy: 338, rx: 62, ry: 9,
        fill: '#000000', opacity: '0.30'
      }));
      svg.appendChild(el('g', { class: 'orbit-back' }));
      svg.appendChild(el('g', { class: 'puppet-host' }));
      svg.appendChild(el('g', { class: 'orbit-front' }));

      const sigh = el('g', { class: 'sigh-layer', opacity: '0' });
      sigh.appendChild(el('circle', {
        class: 'sigh-circle', cx: 160, cy: 200, r: 40,
        fill: 'none', stroke: '#ff4d7a', 'stroke-width': '2'
      }));
      svg.appendChild(sigh);

      const status = el('g', { class: 'status-band' });
      status.appendChild(el('rect', { x: 16, y: 354, width: 288, height: 106, rx: 18, fill: '#02050a', opacity: '0.64' }));
      status.appendChild(el('rect', { class: 'status-inner', x: 18, y: 356, width: 284, height: 102, rx: 16, fill: '#65f3ff', opacity: '0.055' }));
      status.appendChild(txt('text', {
        class: 'caption', x: 160, y: 386, 'text-anchor': 'middle', fill: '#e8f7ff',
        'font-family': 'Inter, system-ui, sans-serif', 'font-size': 14, 'font-weight': 800
      }));
      status.appendChild(txt('text', {
        class: 'snippet', x: 160, y: 416, 'text-anchor': 'middle', fill: '#8aa2b2',
        'font-family': 'ui-monospace, Menlo, Consolas, monospace', 'font-size': 10
      }));
      status.appendChild(el('g', { class: 'meters' }));
      svg.appendChild(status);

      svg.appendChild(el('g', { class: 'footer-ticks' }));
      svg.appendChild(txt('text', {
        class: 'load-error', x: 160, y: 240, 'text-anchor': 'middle', fill: '#ff4d7a',
        'font-family': 'ui-monospace, Menlo, Consolas, monospace', 'font-size': 10,
        opacity: '0'
      }));

      this.root.appendChild(svg);
      this.svg = svg;
      this.refs = collectChromeRefs(svg);
      this.buildAmbientLines();
      this.buildOrbits();
      this.buildMeters();
      this.buildTopTicks();
      this.buildFooterTicks();
    }

    async loadPuppet() {
      const template = await loadPuppetTemplate();
      const imported = document.importNode(template, true);
      imported.setAttribute('x', String(PUPPET_X));
      imported.setAttribute('y', String(PUPPET_Y));
      imported.setAttribute('width', String(PUPPET_W));
      imported.setAttribute('height', String(PUPPET_H));
      imported.classList.add('mascot-puppet');
      this.refs.puppetHost.appendChild(imported);
      this.puppetSvg = imported;
      if (KIOSK_MODE && PERF_MODE !== 'full') this.simplifyExpensiveSvgEffects();
    }

    simplifyExpensiveSvgEffects() {
      if (!this.puppetSvg) return;
      this.puppetSvg.querySelectorAll('[filter]').forEach((node) => node.removeAttribute('filter'));
      this.puppetSvg.querySelectorAll('filter').forEach((node) => node.remove());
      this.puppetSvg.classList.add('perf-lite-puppet');
    }

    collectPuppetRefs() {
      const find = (sel) => this.puppetSvg.querySelector(sel);
      const findAll = (sel) => Array.from(this.puppetSvg.querySelectorAll(sel));
      this.puppet = {
        root: find('#puppet'),
        aura: find('#aura'),
        tail: find('#tail'),
        tailMain: find('#tail-main'),
        tailHighlight: find('#tail-highlight'),
        body: find('#body'),
        bodyMain: find('#body-main'),
        bodyShadow: find('#body-shadow'),
        helmet: find('#helmet'),
        helmetDome: find('#helmet-dome'),
        helmetBand: find('#helmet-band'),
        helmetBandShine: find('#helmet-band-shine'),
        helmetRidge: find('#helmet-ridge'),
        helmetRidgeShine: find('#helmet-ridge-shine'),
        wingLeft: find('#wing-left'),
        wingRight: find('#wing-right'),
        wingLeftLine: find('#wing-left-line'),
        wingRightLine: find('#wing-right-line'),
        face: find('#face'),
        eyeLeft: find('#eye-left'),
        eyeRight: find('#eye-right'),
        irisLeft: find('#eye-left .iris'),
        irisRight: find('#eye-right .iris'),
        pupilLeft: find('#eye-left .pupil'),
        pupilRight: find('#eye-right .pupil'),
        catchlightLeft: find('#eye-left .catchlight'),
        catchlightRight: find('#eye-right .catchlight'),
        upperLidLeft: find('#eye-left .upper-lid'),
        upperLidRight: find('#eye-right .upper-lid'),
        lowerLidLeft: find('#eye-left .lower-lid'),
        lowerLidRight: find('#eye-right .lower-lid'),
        browLeft: find('#eye-left .brow'),
        browRight: find('#eye-right .brow'),
        eyeGlows: findAll('.eye-glow'),
        mouthFill: find('#mouth-fill'),
        mouth: find('#mouth'),
        mouthGlow: find('#mouth-glow'),
        runes: find('#runes'),
        runeA: find('#rune-a'),
        runeB: find('#rune-b'),
        scanBeam: find('#scan-beam')
      };
    }

    setPacket(nextPacket, immediate = false) {
      const sourcePacket = nextPacket?.mode && window.HermesDisplayState.opticPacketToPersonaPacket
        ? window.HermesDisplayState.opticPacketToPersonaPacket(nextPacket, this.target)
        : nextPacket;
      const normalized = window.HermesDisplayState.normalizePersonaPacket(sourcePacket);
      if (this.behaviorService) {
        const nextMode = window.HermesBehaviorMachine?.modeFromPacket?.(normalized, this.behaviorService.mode);
        if (nextMode && this.behaviorService.setMode) this.behaviorService.setMode(nextMode);
        // Keep the parallel overlay regions (health/quiet/privacy_display) in sync with the live
        // packet regardless of whether it carried an explicit behavior_mode.
        const regionEvents = window.HermesBehaviorMachine?.regionEventsForPacket?.(normalized) || [];
        if (this.behaviorService.sendAll) this.behaviorService.sendAll(regionEvents);
      }
      this.previous = this.packet;
      this.target = normalized;
      this.transitionMs = normalized.duration?.transition_ms || 650;
      this.transitionStart = performance.now();
      this.transition = immediate ? 1 : 0;
      if (immediate) this.packet = normalized;
      const now = performance.now();
      this.beginTransitionPhase('notice', 'packet');
      this.scheduleContextualBlink('notice', now);
      this.scheduleBlink(now, true);
      this.scheduleGaze(now, true);
      this.scheduleIntent(now, true);
      this.applyState(normalized, immediate);
      this.updateText();
      if (!immediate && this.motionAdapter && this.refs?.caption) {
        this.motionAdapter.transitionCss(this.refs.caption, { opacity: [0.82, 1] }, { duration: Math.min(260, this.transitionMs) });
      }
    }

    applyState(packet, _immediate) {
      if (!this.puppetReady) return;
      const state = this.stateFor(packet);
      const firstTarget = state.gazeTargets[0] || 'center';
      this.startGazeSaccade(firstTarget, performance.now(), state, true);
    }

    showLoadError(err) {
      if (this.refs?.loadError) {
        this.refs.loadError.setAttribute('opacity', '1');
        this.refs.loadError.textContent = `puppet load failed: ${String(err.message || err).slice(0, 64)}`;
      }
      console.error('[mascot] puppet load failed:', err);
    }

    triggerIntent(requestedName, automatic = false) {
      if (!this.puppetReady) return null;
      const now = performance.now();
      const state = this.stateFor(this.target);
      let name = requestedName;
      if (!name || !NUDGES[name]) {
        name = pickWeighted(state.intentPool, state.intentWeights, this.random.bind(this));
      }
      let def = NUDGES[name];
      if (automatic && state.autoIntentMode === 'face_only' && def && isBodyMovingIntent(def)) {
        const safePool = state.intentPool.filter((candidate) => !isBodyMovingIntent(NUDGES[candidate]));
        if (!safePool.length) {
          this.scheduleIntent(now);
          return null;
        }
        const safeWeights = safePool.map((candidate) => state.intentWeights[state.intentPool.indexOf(candidate)] || 1);
        name = pickWeighted(safePool, safeWeights, this.random.bind(this));
        def = NUDGES[name];
      }
      if (!def) return null;
      this.intent = { name, def, start: now, duration: def.duration, automatic };
      this.lastIntentLabel = automatic ? `${def.label} auto` : def.label;
      this.lastIntentAt = now;
      this.scheduleIntent(now);
      if (def.blink === 'double') this.queueDoubleBlink(now);
      if (def.blink === 'long') this.startBlink(now, 360);
      this.eventTarget.dispatchEvent(new CustomEvent('intent', {
        detail: { name, label: def.label, duration: def.duration, automatic }
      }));
      this.emitDebug();
      return { name, label: def.label, duration: def.duration, automatic };
    }

    scheduleIntent(now, first = false) {
      const state = this.stateFor(this.target);
      const [min, max] = state.intentEveryMs;
      const jitter = this.random() * (max - min);
      this.nextIntentAt = now + (first ? min + jitter * 0.4 : min + jitter);
    }

    scheduleGaze(now, first = false) {
      const state = this.stateFor(this.target);
      const profile = state.gazeProfile || {};
      const range = profile.dwellMs || state.gazeDwellMs;
      const [min, max] = range;
      const dwell = min + this.random() * (max - min);
      this.nextGazeAt = now + (first ? dwell * 0.4 : dwell);
      this.gazeChannel.holdUntil = this.nextGazeAt;
      if (first && state.name === 'idle_watchful') this.nextIdleRoutineAt = now + 9000;
    }

    scheduleBlink(now, first = false) {
      const state = this.stateFor(this.target);
      const [min, max] = state.blinkMs;
      const jitter = this.random() * (max - min);
      this.nextBlinkAt = now + (first ? 500 + jitter * 0.35 : min + jitter);
    }

    startBlink(now, duration) {
      this.blinkStart = now;
      this.blinkDuration = duration;
    }

    queueDoubleBlink(now) {
      this.startBlink(now, 140);
      this.pendingDoubleBlink = now + 240;
    }

    updateBlink(now, state) {
      if (this.pendingDoubleBlink && now >= this.pendingDoubleBlink) {
        this.startBlink(now, 130);
        this.pendingDoubleBlink = 0;
        return;
      }
      if (now > this.nextBlinkAt) {
        const dur = state === STATES.blocked_annoyed ? 95
          : state === STATES.night_sleepy ? 260 : 150;
        this.startBlink(now, dur);
        if (this.random() < state.doubleBlinkChance) {
          this.pendingDoubleBlink = now + 240 + this.random() * 80;
        }
        this.scheduleBlink(now);
      }
    }

    updateGaze(now, state, _packet) {
      const intent = this.activeIntent(now);
      const intentGaze = intent?.def.gaze;
      if (intentGaze) {
        if (this.gazeChannel.targetName !== intentGaze || !this.gazeChannel.intentLocked) {
          this.startGazeSaccade(intentGaze, now, state, false, true);
        }
      } else {
        this.gazeChannel.intentLocked = false;
        if (now >= this.nextIdleRoutineAt && state.name === 'idle_watchful' && this.gazeChannel.mode === 'hold') {
          this.runIdleMicroRoutine(now, state);
        } else if (now >= this.nextGazeAt && this.gazeChannel.mode === 'hold') {
          const name = pickWeighted(state.gazeTargets, state.gazeWeights, this.random.bind(this));
          this.startGazeSaccade(name, now, state);
        }
      }

      if (this.gazeChannel.mode === 'saccade') {
        const p = clamp((now - this.gazeChannel.moveStart) / this.gazeChannel.moveDuration, 0, 1);
        const eased = easeOutCubic(p);
        this.gazeCurrent.x = this.gazeChannel.from.x + (this.gazeChannel.to.x - this.gazeChannel.from.x) * eased;
        this.gazeCurrent.y = this.gazeChannel.from.y + (this.gazeChannel.to.y - this.gazeChannel.from.y) * eased;
        if (p >= 1) {
          this.gazeChannel.mode = 'hold';
          this.gazeChannel.holdBase = { ...this.gazeChannel.to };
          this.gazeChannel.holdStartedAt = now;
          this.gazeCurrent = { ...this.gazeChannel.holdBase };
          if (!this.gazeChannel.intentLocked) this.scheduleGaze(now);
        }
      } else {
        if (now >= this.gazeChannel.nextMicroAt) {
          const jitter = this.gazeChannel.jitterPx;
          this.gazeChannel.micro = {
            x: (this.random() - 0.5) * jitter,
            y: (this.random() - 0.5) * jitter
          };
          this.gazeChannel.nextMicroAt = now + 900 + this.random() * 1300;
        }
        this.gazeCurrent.x = this.gazeChannel.holdBase.x + this.gazeChannel.micro.x;
        this.gazeCurrent.y = this.gazeChannel.holdBase.y + this.gazeChannel.micro.y;
      }
      this.gazeTargetName = this.gazeChannel.targetName;
      this.gazeTarget = { ...this.gazeChannel.to };
    }

    startGazeSaccade(name, now, state, immediate = false, intentLocked = false) {
      const target = GAZE[name] || GAZE.center;
      const profile = state.gazeProfile || {};
      const [minMs, maxMs] = profile.saccadeMs || [100, 150];
      const duration = minMs + this.random() * (maxMs - minMs);
      this.gazeChannel.mode = immediate ? 'hold' : 'saccade';
      this.gazeChannel.targetName = name;
      this.gazeChannel.intentLocked = intentLocked;
      this.gazeChannel.from = { ...this.gazeCurrent };
      this.gazeChannel.to = { ...target };
      this.gazeChannel.moveStart = now;
      this.gazeChannel.moveDuration = duration;
      this.gazeChannel.jitterPx = profile.holdJitterPx ?? 0.08;
      this.gazeChannel.micro = { x: 0, y: 0 };
      if (immediate) {
        this.gazeChannel.holdBase = { ...target };
        this.gazeCurrent = { ...target };
        this.scheduleGaze(now, true);
      }
      this.emitDebug();
    }

    updateIntent(now) {
      if (this.intent && now - this.intent.start >= this.intent.duration) {
        this.intent = null;
      }
      if (!this.intent && now >= this.nextIntentAt) {
        this.triggerIntent(null, true);
      }
    }

    runIdleMicroRoutine(now, state) {
      const sequence = ['down_left', 'down_right', 'center'];
      const target = sequence[this.idleRoutineStep % sequence.length];
      this.idleRoutineStep += 1;
      this.startGazeSaccade(target, now, state);
      this.gazeChannel.holdUntil = now + (target === 'center' ? 2800 : 1250);
      this.nextGazeAt = this.gazeChannel.holdUntil;
      this.nextIdleRoutineAt = now + (target === 'center' ? 14000 : 1650);
      if (target !== 'center') this.queueDoubleBlink(now + 80);
    }

    random() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }

    activeIntent(now) {
      if (!this.intent) return null;
      if (now - this.intent.start >= this.intent.duration) return null;
      return this.intent;
    }

    frame(now) {
      this.frameHandle = null;
      this.lastFrameAt = now;
      this.updateTransition(now);
      const packet = this.packet;
      const state = this.stateFor(packet);
      const t = now / 1000;
      this.updateIntent(now);
      this.updateGaze(now, state, packet);
      this.updateBlink(now, state);
      this.draw(t, now, state, packet);
      if (!this.freezeRequested) this.scheduleFrame(this.frameIntervalMs);
    }

    updateTransition(now) {
      if (this.transition >= 1) {
        this.packet = this.target;
        return;
      }
      this.transition = Math.min(1, (now - this.transitionStart) / this.transitionMs);
      this.packet = mixPackets(this.previous, this.target, easeInOutCubic(this.transition));
    }

    stateFor(packet) {
      const base = STATES[packet.mood] || STATES.idle_watchful;
      const workVariant = packet.mood === 'thinking_focused'
        ? applyWorkVisualVariant(base, workVisualKind(packet))
        : base;
      const presetVariant = applyDisplayPresetVariant(workVariant, packet);
      const puppetVariant = applyPuppetStatePacket(presetVariant, packet);
      return applyBoundedMotion(puppetVariant, packet);
    }

    draw(t, now, state, packet) {
      this.perfTier = this.resolvePerfTier(packet);
      const colors = resolveColors(this.svg, packet.palette || {}, packet);
      const intent = this.activeIntent(now);
      const intentAmount = this.intentAmount(now);
      const intentDef = intent ? intent.def : null;
      const blink = blinkAmount(now, this.blinkStart, this.blinkDuration);

      const perf = perfProfile(this.perfTier, packet.motion?.reduced_motion || this.prefersReducedMotion);
      this.frameIntervalMs = perf.frameIntervalMs;
      this.applyMotionCssVars(state, packet, perf, now);
      const breath = Math.sin(t * state.breathHz * 2 * Math.PI) * state.breath * perf.motionScale;
      const calm = Boolean(state.motionBudget?.calm);
      const budget = state.motionBudget || {};
      const driftX = Math.sin(t * state.driftHz * 2 * Math.PI) * state.bodyDriftX * perf.motionScale;
      const driftY = calm ? 0 : Math.cos(t * state.driftHz * 1.7 * Math.PI) * state.bodyDriftY * 0.6 * perf.motionScale;
      const intentBodyX = (intentDef?.body?.x || 0) * intentAmount;
      const intentBodyY = (intentDef?.body?.y || 0) * intentAmount;
      const intentBodyTilt = (intentDef?.body?.tilt || 0) * intentAmount;
      const intentBob = (intentDef?.bodyBob || 0) * intentAmount;

      const breathY = breath * (calm ? 0.55 : 0.6);
      const rawBodyDx = driftX + intentBodyX;
      const rawBodyDy = driftY + breathY + intentBodyY + intentBob;
      const rawTilt = state.helmetTiltDeg * 0.25 + (calm ? 0 : Math.sin(t * 0.18) * 0.4) + intentBodyTilt;
      const bodyDx = clamp(rawBodyDx, -(budget.rootXMax ?? 2), budget.rootXMax ?? 2);
      const bodyDy = calm && !intentDef ? clamp(rawBodyDy, -1, 1) : clamp(rawBodyDy, -(budget.rootYMax ?? 3), budget.rootYMax ?? 3);
      const bodyTilt = clamp(rawTilt, -(budget.tiltMax ?? 3), budget.tiltMax ?? 3);
      const bodyScale = 1 + breath * 0.0014 + (intentDef ? intentAmount * 0.005 : 0);
      this.poseChannel = {
        name: 'pose', rootX: bodyDx, rootY: bodyDy, tilt: bodyTilt, scale: bodyScale,
        budgetOk: Math.abs(bodyDy) <= (budget.rootYMax ?? 3), calm
      };
      this.fxChannel = { name: 'fx', intensity: state.fxIntensity ?? 1 };

      if (this.puppet?.root) {
        this.puppet.root.setAttribute(
          'transform',
          `translate(${(PUPPET_BASE_X + bodyDx).toFixed(2)} ${(PUPPET_BASE_Y + bodyDy).toFixed(2)}) rotate(${bodyTilt.toFixed(2)}) scale(${bodyScale.toFixed(4)})`
        );
      }

      this.updateTail(t, state, intentAmount, perf);
      this.updateHelmet(t, state, intentDef, intentAmount, perf);
      this.updateWings(t, state, intentAmount, perf);
      this.updateEyes(state, packet, colors, blink, intentDef, intentAmount, t);
      this.updateMouth(state, colors, intentDef);
      this.updateAccessories(t, state, packet, intentAmount, perf);
      this.updateRunesAndScan(state, colors, intentDef, intentAmount, now, t, perf);
      this.updateAura(state, packet, intentAmount, perf);
      if (now - this.lastDecorFrameAt >= perf.decorIntervalMs) {
        this.updateAmbient(state, packet, colors, t, perf);
        this.updateOrbits(state, packet, colors, t, now, perf);
        this.lastDecorFrameAt = now;
      }
      if (now - this.lastPanelFrameAt >= perf.panelIntervalMs) {
        this.updateMeters(packet, colors);
        this.updateStatus(state, packet, colors, t, now);
        this.lastPanelFrameAt = now;
      }
      this.updateSigh(colors, intentDef, intentAmount, now);
      this.updateFloorShadow(bodyDy);
      if (now - this.lastDebugEmitAt >= 750) {
        this.emitDebug();
        this.lastDebugEmitAt = now;
      }
    }

    resolvePerfTier(packet) {
      if (PERF_MODE === 'full') return 'full';
      if (PERF_MODE === 'lite') return 'warm';
      if (PERF_MODE === 'quiet') return 'hot';
      return 'full';
    }

    intentAmount(now) {
      if (!this.intent) return 0;
      const raw = clamp((now - this.intent.start) / this.intent.duration, 0, 1);
      if (raw >= 1) return 0;
      return Math.sin(raw * Math.PI);
    }

    updateTail(t, state, intentAmount, perf = perfProfile('full')) {
      if (!this.puppet?.tail) return;
      const sway = Math.sin(t * state.tailHz * 2 * Math.PI) * 4 * state.tailSway * perf.motionScale;
      const counter = Math.sin(t * state.tailHz * 4 * Math.PI + 1.4) * 1.4 * state.tailSway * perf.motionScale;
      const angle = sway + counter + intentAmount * 1.5;
      this.puppet.tail.setAttribute(
        'transform',
        `translate(${TAIL_PIVOT.x} ${TAIL_PIVOT.y}) rotate(${angle.toFixed(2)}) translate(${-TAIL_PIVOT.x} ${-TAIL_PIVOT.y})`
      );
    }

    updateHelmet(t, state, intentDef, intentAmount, perf = perfProfile('full')) {
      if (!this.puppet?.helmet) return;
      const calm = Boolean(state.motionBudget?.calm);
      const baseTilt = state.helmetTiltDeg;
      const drift = calm ? 0 : Math.sin(t * 0.45) * 1.2 * perf.motionScale;
      const intentTilt = (intentDef?.helmetTiltDelta || 0) * intentAmount;
      const angle = baseTilt + drift + intentTilt;
      this.puppet.helmet.setAttribute(
        'transform',
        `translate(${HELMET_PIVOT.x} ${HELMET_PIVOT.y}) rotate(${angle.toFixed(2)}) translate(${-HELMET_PIVOT.x} ${-HELMET_PIVOT.y})`
      );
    }

    updateWings(t, state, intentAmount, perf = perfProfile('full')) {
      if (!this.puppet?.wingLeft || !this.puppet?.wingRight) return;
      const calm = Boolean(state.motionBudget?.calm);
      const flapScale = (calm ? 0.35 + intentAmount * 0.65 : 1) * perf.motionScale;
      const flap = Math.sin(t * state.wingHz * 2 * Math.PI) * 8 * state.wingFlap * flapScale;
      const rest = (state.wingRestDeg || 0) * perf.motionScale;
      const asym = (state.wingAsymmetryDeg || 0) * (0.45 + intentAmount * 0.55) * perf.motionScale;
      const twitch = Math.sin(t * (state.wingHz || 0.4) * 8.5 + 0.8) * (state.wingTwitch || 0) * intentAmount * perf.motionScale;
      const leftAngle = -flap - rest - asym + twitch;
      const rightAngle = flap + rest - asym - twitch;
      this.puppet.wingLeft.setAttribute('transform', `rotate(${leftAngle.toFixed(2)} ${WING_LEFT_PIVOT.x} ${WING_LEFT_PIVOT.y})`);
      this.puppet.wingRight.setAttribute('transform', `rotate(${rightAngle.toFixed(2)} ${WING_RIGHT_PIVOT.x} ${WING_RIGHT_PIVOT.y})`);
      if (this.puppet.wingLeftLine) {
        this.puppet.wingLeftLine.setAttribute('transform', `rotate(${leftAngle.toFixed(2)} ${WING_LEFT_PIVOT.x} ${WING_LEFT_PIVOT.y})`);
      }
      if (this.puppet.wingRightLine) {
        this.puppet.wingRightLine.setAttribute('transform', `rotate(${rightAngle.toFixed(2)} ${WING_RIGHT_PIVOT.x} ${WING_RIGHT_PIVOT.y})`);
      }
      const wingOpacity = clamp(0.40 + Math.abs(flap) * 0.035 + intentAmount * 0.18 + (state.fxIntensity || 0) * 0.14 + (state.wingLineBoost || 0), 0.34, 0.86);
      [this.puppet.wingLeftLine, this.puppet.wingRightLine].forEach((line) => {
        if (line) line.setAttribute('opacity', wingOpacity.toFixed(3));
      });
    }

    updateEyes(state, packet, colors, blink, intentDef, intentAmount, t) {
      if (!this.puppet?.eyeLeft) return;
      const override = this.stillOverride || {};
      const lidBase = override.lid ?? (state.lid + (intentDef?.lidDelta || 0) * intentAmount);
      const squintBase = override.squint ?? state.squint;
      const lid = clamp(lidBase + blink * 0.94, 0, 0.96);
      const squint = clamp(squintBase, 0, 0.9);
      const pupilScale = override.pupilScale ?? (state.pupilScale + (intentDef?.pupilDelta || 0) * intentAmount);
      const irisFill = override.irisFill
        || (packet.mood === 'blocked_annoyed' ? colors.danger
          : packet.mood === 'night_sleepy' ? '#4cbed4'
          : colors.primary);
      const pupilFill = '#fbffff';
      const browStrokeColor = packet.mood === 'blocked_annoyed' ? colors.danger : colors.primary;
      const browOpacity = clamp(
        state.browOpacity ?? (packet.mood === 'thinking_focused' ? 0.34
          : packet.mood === 'blocked_annoyed' ? 0.42
          : packet.mood === 'healthy_smug' ? 0.32
          : packet.mood === 'night_sleepy' ? 0.16 : 0.24),
        0.10,
        0.56
      );
      const browLeftName = override.browLeft || intentDef?.browLeft || state.browLeft;
      const browRightName = override.browRight || intentDef?.browRight || state.browRight;
      const browLeftPath = BROWS[browLeftName] || BROWS.neutral_left;
      const browRightPath = BROWS[browRightName] || BROWS.neutral_right;

      const eyes = [
        { side: -1, iris: this.puppet.irisLeft, pupil: this.puppet.pupilLeft,
          catchlight: this.puppet.catchlightLeft,
          upper: this.puppet.upperLidLeft, lower: this.puppet.lowerLidLeft,
          brow: this.puppet.browLeft, browPath: browLeftPath },
        { side: 1, iris: this.puppet.irisRight, pupil: this.puppet.pupilRight,
          catchlight: this.puppet.catchlightRight,
          upper: this.puppet.upperLidRight, lower: this.puppet.lowerLidRight,
          brow: this.puppet.browRight, browPath: browRightPath }
      ];
      eyes.forEach(({ side, iris, pupil, catchlight, upper, lower, brow, browPath }) => {
        if (!iris || !pupil) return;
        const gazeX = this.gazeCurrent.x;
        const gazeY = this.gazeCurrent.y;
        iris.setAttribute('cx', gazeX.toFixed(2));
        iris.setAttribute('cy', gazeY.toFixed(2));
        iris.setAttribute('fill', irisFill);
        iris.setAttribute('r', (8 * state.irisScale).toFixed(2));
        pupil.setAttribute('cx', gazeX.toFixed(2));
        pupil.setAttribute('cy', gazeY.toFixed(2));
        pupil.setAttribute('r', (4.5 * pupilScale).toFixed(2));
        pupil.setAttribute('fill', pupilFill);
        if (catchlight) {
          catchlight.setAttribute('cx', (gazeX - 3.0 + side * 0.28).toFixed(2));
          catchlight.setAttribute('cy', (gazeY - 3.1).toFixed(2));
          catchlight.setAttribute('opacity', (packet.mood === 'night_sleepy' ? 0.42 : 0.78).toFixed(2));
        }
        if (upper) {
          upper.setAttribute(
            'transform',
            `translate(0 ${(lid * 18 + squint * 4).toFixed(2)})`
          );
        }
        if (lower) {
          lower.setAttribute('transform', `translate(0 ${(-lid * 9 - squint * 3).toFixed(2)})`);
        }
        if (brow) {
          brow.setAttribute('d', browPath);
          brow.setAttribute('stroke', browStrokeColor);
          brow.setAttribute('opacity', (browOpacity + intentAmount * 0.10).toFixed(3));
        }
      });

      const glowOpacity = state.eyeGlow !== undefined
        ? clamp(state.eyeGlow, 0.16, 0.90) * (packet.mood === 'night_sleepy' ? 0.42 : 0.62)
        : packet.mood === 'night_sleepy' ? 0.12 : 0.22;
      this.puppet.eyeGlows?.forEach((glow) => {
        glow.setAttribute('fill', irisFill);
        glow.setAttribute('opacity', glowOpacity.toFixed(3));
      });
      if (this.puppet.helmetBand) {
        this.puppet.helmetBand.setAttribute('opacity', String(clamp(0.78 + (state.fxIntensity || 0) * 0.16 + intentAmount * 0.06, 0.70, 0.98)));
      }
      if (this.puppet.helmetRidge) {
        this.puppet.helmetRidge.setAttribute('opacity', String(clamp(0.74 + (state.fxIntensity || 0) * 0.18, 0.62, 0.96)));
      }
      const shineOpacity = clamp(0.16 + (state.fxIntensity || 0) * 0.11 + intentAmount * 0.10, 0.12, 0.38);
      if (this.puppet.helmetBandShine) this.puppet.helmetBandShine.setAttribute('opacity', shineOpacity.toFixed(3));
      if (this.puppet.helmetRidgeShine) this.puppet.helmetRidgeShine.setAttribute('opacity', (shineOpacity * 0.85).toFixed(3));
      this.blinkFaceChannel = {
        name: 'blinkFace', blink, lid, squint,
        browLeft: browLeftName, browRight: browRightName,
        mouth: override.mouth || intentDef?.mouth || state.mouth
      };
    }

    updateMouth(state, colors, intentDef) {
      if (!this.puppet?.mouth) return;
      const override = this.stillOverride || {};
      const mouthName = override.mouth || intentDef?.mouth || state.mouth;
      const path = MOUTH_PATHS[mouthName] || MOUTH_PATHS.neutral;
      const openMouth = ['ohh_small', 'yawn_oval', 'open_surprise'].includes(mouthName);
      if (this.puppet.mouthFill) {
        this.puppet.mouthFill.setAttribute('d', path);
        this.puppet.mouthFill.setAttribute('fill', state === STATES.blocked_annoyed ? colors.danger : colors.primary);
        this.puppet.mouthFill.setAttribute('opacity', openMouth ? (state === STATES.night_sleepy ? '0.12' : '0.20') : '0');
      }
      this.puppet.mouth.setAttribute('d', path);
      if (this.puppet.mouthGlow) {
        this.puppet.mouthGlow.setAttribute('d', path);
        this.puppet.mouthGlow.setAttribute('stroke',
          state === STATES.blocked_annoyed ? colors.danger : colors.primary);
        this.puppet.mouthGlow.setAttribute('opacity',
          state === STATES.night_sleepy ? '0.20' : '0.38');
      }
    }

    updateAccessories(_t, _state, _packet, _intentAmount, _perf = perfProfile('full')) {
      // Intentionally empty: current visual direction excludes decorative body accessories.
    }

    updateRunesAndScan(state, colors, intentDef, intentAmount, _now, t, perf = perfProfile('full')) {
      const runeIntensity = state.runeIntensity * perf.fxScale;
      if (this.puppet?.runeA) {
        this.puppet.runeA.setAttribute('opacity', String(runeIntensity * (0.6 + Math.sin(t * 0.7) * 0.3)));
      }
      if (this.puppet?.runeB) {
        this.puppet.runeB.setAttribute('opacity', String(runeIntensity * (0.6 + Math.cos(t * 0.5) * 0.3)));
        this.puppet.runeB.setAttribute('stroke', colors.accent);
      }
      const scan = this.puppet?.scanBeam;
      if (!scan) return;
      const scanActive = state.scanBeam || intentDef?.scan;
      if (!scanActive) {
        scan.setAttribute('opacity', '0');
        return;
      }
      const y = -35 + ((t * (state.scanSpeed ?? (state === STATES.thinking_focused ? 58 : 28))) % 70);
      scan.setAttribute('transform', `translate(0 ${y.toFixed(2)})`);
      scan.setAttribute('stroke', colors.primary);
      const intensity = intentDef?.scan
        ? 0.75 * intentAmount + 0.20
        : 0.20 + Math.max(0, Math.sin(t * 10)) * 0.30;
      scan.setAttribute('opacity', intensity.toFixed(3));
    }

    updateAura(state, packet, intentAmount, perf = perfProfile('full')) {
      if (!this.puppet?.aura) return;
      const base = state.auraOpacity;
      const focus = packet.focus || 0;
      this.puppet.aura.setAttribute('opacity', String((base + focus * 0.06 + intentAmount * 0.06) * perf.fxScale));
    }

    applyMotionCssVars(state, packet, perf, now) {
      if (!this.svg) return;
      const motion = packet.motion || {};
      const floatMs = Number(state.floatDurationMs || motion.float_duration_ms || 8200);
      const blinkMid = Array.isArray(state.blinkMs) ? (state.blinkMs[0] + state.blinkMs[1]) / 2 : Number(motion.blink_interval_ms || 4200);
      const fx = clamp((state.fxIntensity ?? 1) * perf.fxScale, 0.06, 1.0);
      const eyeGlow = state.eyeGlow !== undefined ? state.eyeGlow : Number(motion.eye_glow || 0.32);
      const alertPulse = clamp(state.alertPulse || motion.alert_pulse || 0, 0, 0.85);
      this.svg.style.setProperty('--hermes-float-duration', `${Math.round(clamp(floatMs, 4800, 12000))}ms`);
      this.svg.style.setProperty('--hermes-blink-interval', `${Math.round(clamp(blinkMid, 1200, 9800))}ms`);
      this.svg.style.setProperty('--hermes-eye-glow', clamp(eyeGlow, 0.10, 0.90).toFixed(3));
      this.svg.style.setProperty('--hermes-accent-intensity', fx.toFixed(3));
      this.svg.style.setProperty('--hermes-alert-pulse', alertPulse.toFixed(3));
      this.svg.style.setProperty('--hermes-motion-scale', perf.motionScale.toFixed(3));
      this.svg.style.setProperty('--hermes-highlight-opacity', now < this.highlightSweepUntil ? '1' : '0');
    }

    updateAmbient(state, packet, colors, t, perf = perfProfile('full')) {
      this.refs.ambientLines.forEach((path, index) => {
        const y = 77 + index * 26;
        const fx = (state.fxIntensity ?? 1) * perf.fxScale;
        const amp = (((state.name || '') === 'thinking_focused' ? 10 : 5) + (packet.focus || 0) * 9) * fx;
        let d = `M22 ${y}`;
        for (let x = 22; x <= 298; x += 23) {
          const yy = y
            + Math.sin(t * (0.4 + (packet.energy || 0)) + x * 0.045 + index) * amp * 0.20
            + Math.sin(t * 0.22 + index * 1.7 + x * 0.01) * amp * 0.22;
          d += ` L${x} ${yy.toFixed(1)}`;
        }
        path.setAttribute('d', d);
        path.setAttribute('stroke', index % 2 ? colors.secondary : colors.primary);
        path.setAttribute('opacity',
          state === STATES.night_sleepy ? 0.08 : 0.12 + (packet.focus || 0) * 0.08);
      });
    }

    updateOrbits(state, packet, colors, t, now, perf = perfProfile('full')) {
      const cross = state === STATES.blocked_annoyed;
      const sleepy = state === STATES.night_sleepy;
      const focused = (state.name || '') === 'thinking_focused';
      const reorderAmount = this.intent && this.intent.def.scan ? this.intentAmount(now) : 0;
      const fx = (state.fxIntensity ?? 1) * perf.fxScale;
      this.refs.orbitEllipses.forEach((ell, index) => {
        ell.setAttribute('stroke', index ? colors.secondary : colors.primary);
        ell.setAttribute('opacity', (sleepy ? 0.12 : cross ? 0.30 : 0.20 + (packet.focus || 0) * 0.09) * fx);
        ell.setAttribute('stroke-width', cross ? 1.55 : 1.0);
        ell.setAttribute(
          'transform',
          `translate(${HOST_CENTER_X} ${HOST_CENTER_Y}) rotate(${((index ? -1 : 1) * t * 8 * state.orbit).toFixed(2)})`
        );
      });
      this.refs.motes.forEach((moteEl, index) => {
        const mote = this.motes[index];
        const dir = cross && index % 2 ? -1 : 1;
        const speed = state.orbit * (focused ? 1.72 : 1.0) * dir * perf.orbitScale;
        const angle = mote.phase + t * speed + reorderAmount * Math.sin(index) * 1.5;
        let rx = cross ? 92 : 100 + Math.sin(index) * 7;
        let ry = cross ? 40 + (index % 2) * 7 : sleepy ? 70 : 86;
        if (focused) { rx += 12 * Math.sin(t * 1.7 + index); ry -= 8; }
        const bunch = cross ? Math.pow(Math.max(0, Math.sin(t * 0.55 + index * 0.2)), 8) * 0.45 : 0;
        const x = HOST_CENTER_X + Math.cos(angle + bunch) * rx;
        const y = HOST_CENTER_Y + Math.sin(angle * (cross ? 1.32 : 1)) * ry
          + (sleepy ? Math.sin(t * 0.22 + index) * 5 : 0);
        const frontSide = Math.sin(angle) > -0.05;
        const parent = frontSide ? this.refs.orbitFront : this.refs.orbitBack;
        if (moteEl.parentNode !== parent) parent.appendChild(moteEl);
        const pulse = 0.65 + 0.35 * Math.sin(t * (0.45 + mote.wobble * fx) + index);
        const active = focused || index % 4 === 0 || (cross && index % 3 === 0);
        moteEl.setAttribute(
          'transform',
          `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(0.85 + pulse * 0.18 * fx + (packet.energy || 0) * 0.16).toFixed(3)})`
        );
        const circle = moteEl.querySelector('circle');
        circle.setAttribute('fill', cross ? colors.danger : active ? colors.accent : colors.primary);
        circle.setAttribute('opacity', sleepy ? 0.28 : active ? 0.86 : 0.54);
        const text = moteEl.querySelector('text');
        text.setAttribute('fill', active ? colors.text : colors.secondary);
        text.setAttribute('opacity', sleepy ? 0.24 : active ? 0.84 : 0.38);
      });
    }

    updateMeters(packet, colors) {
      if (!this.refs.meterArcs?.length) return;
      [packet.energy, packet.focus, packet.impatience].forEach((value, index) => {
        const arc = this.refs.meterArcs[index];
        if (!arc) return;
        arc.setAttribute('stroke', index === 2 ? colors.danger : index === 1 ? colors.primary : colors.secondary);
        arc.setAttribute('stroke-dasharray', `${Math.max(1, (value || 0) * 56)} 56`);
      });
    }

    updateStatus(state, packet, colors, t, now) {
      this.refs.stateDot.setAttribute(
        'fill',
        packet.mood === 'blocked_annoyed' ? colors.danger
          : packet.mood === 'healthy_smug' ? colors.secondary : colors.primary
      );
      const alertPulse = clamp(state.alertPulse || 0, 0, 0.85);
      const alertWave = alertPulse * (0.5 + Math.max(0, Math.sin(t * 3.2)) * 0.5);
      this.refs.stateDot.setAttribute(
        'r',
        String((4.2 + Math.sin(t * ((state.name || '') === 'thinking_focused' ? 7 : 2)) * 0.45
          + (packet.energy || 0) * 0.75 + alertWave * 2.0).toFixed(2))
      );
      this.refs.statusInner.setAttribute(
        'fill',
        packet.mood === 'blocked_annoyed' ? colors.danger : colors.primary
      );
      this.refs.statusInner.setAttribute(
        'opacity',
        packet.mood === 'night_sleepy' ? 0.035
          : packet.mood === 'blocked_annoyed' ? (0.060 + alertWave * 0.040).toFixed(3) : (0.050 + alertWave * 0.028).toFixed(3)
      );
      this.refs.caption.setAttribute(
        'fill', packet.mood === 'blocked_annoyed' ? '#fff1f5' : colors.text
      );
      this.refs.snippet.setAttribute(
        'fill', packet.mood === 'blocked_annoyed' ? colors.accent : colors.muted
      );
      [...this.refs.topTicks, ...this.refs.footerTicks].forEach((tick, index) => {
        tick.setAttribute('fill', index % 3 === 0 ? colors.accent : colors.primary);
        tick.setAttribute(
          'opacity',
          packet.mood === 'night_sleepy'
            ? 0.13
            : 0.20 + Math.max(0, Math.sin(t * 2 + index)) * 0.28 * (0.3 + (packet.energy || 0))
        );
      });

      const sinceIntent = now - this.lastIntentAt;
      const intentVisible = sinceIntent < 1300;
      this.refs.intentLabel.setAttribute(
        'opacity',
        intentVisible ? String((1 - sinceIntent / 1300).toFixed(2)) : '0'
      );
      if (intentVisible) {
        this.refs.intentLabel.textContent = `· ${this.lastIntentLabel} ·`;
      }
    }

    updateSigh(colors, intentDef, intentAmount, now) {
      const layer = this.refs.sighLayer;
      if (!intentDef?.sigh || !this.intent) {
        layer.setAttribute('opacity', '0');
        return;
      }
      const raw = clamp((now - this.intent.start) / this.intent.duration, 0, 1);
      this.refs.sighCircle.setAttribute('r', String((40 + raw * 160).toFixed(1)));
      this.refs.sighCircle.setAttribute('cx', String(HOST_CENTER_X));
      this.refs.sighCircle.setAttribute('cy', String(HOST_CENTER_Y));
      this.refs.sighCircle.setAttribute('stroke', colors.danger);
      layer.setAttribute('opacity', String((Math.sin(raw * Math.PI) * 0.75 * intentAmount).toFixed(3)));
    }

    updateFloorShadow(bodyDy) {
      const shadow = this.refs.floorShadow;
      if (!shadow) return;
      const lift = clamp(bodyDy / 18, -0.4, 0.4);
      const scale = 1 - lift * 0.6;
      shadow.setAttribute('rx', (62 * scale).toFixed(1));
      shadow.setAttribute('ry', (9 * scale).toFixed(1));
      shadow.setAttribute('opacity', (0.30 - lift * 0.18).toFixed(3));
      shadow.setAttribute('cx', String(HOST_CENTER_X));
    }

    updateText() {
      if (!this.refs) return;
      const packet = this.target;
      this.refs.stateLabel.textContent = displayMoodLabel(packet.mood);
      this.refs.skinLabel.textContent = packet.skin;
      this.refs.caption.textContent = clampText(window.HermesSanitize?.captionText(packet.caption?.text, 'Quiet watch with opinions.', 72) || 'Quiet watch with opinions.', 38);
      this.refs.snippet.textContent = clampText(window.HermesSanitize?.captionText(packet.snippet?.text, 'local state graph · display safe', 64) || 'local state graph · display safe', 46);
    }

    getDebugState() {
      const state = this.stateFor(this.packet || this.target);
      return {
        state: state.name,
        frozen: this.isFrozen(),
        intent: this.intent ? { name: this.intent.name, automatic: Boolean(this.intent.automatic) } : null,
        poseChannel: { ...this.poseChannel },
        gazeChannel: {
          mode: this.gazeChannel.mode,
          targetName: this.gazeChannel.targetName,
          x: Number(this.gazeCurrent.x.toFixed(2)),
          y: Number(this.gazeCurrent.y.toFixed(2)),
          holdUntilMs: Number(Math.max(0, this.gazeChannel.holdUntil - performance.now()).toFixed(0)),
          jitterPx: this.gazeChannel.jitterPx
        },
        blinkFaceChannel: { ...this.blinkFaceChannel },
        fxChannel: { ...this.fxChannel },
        motionBudget: state.motionBudget || null,
        gazePool: summarizeGazePool(state),
        transitionPhase: { ...this.transitionPhase },
        attentionDepth: this.attentionStack.length,
        avatarEvents: { stats: { ...this.avatarEventStats }, recent: this.recentAvatarEvents.slice() }
      };
    }

    emitDebug() {
      if (!this.puppetReady) return;
      this.eventTarget.dispatchEvent(new CustomEvent('debug', { detail: this.getDebugState() }));
    }

    sampleMotionAndGaze(stateName, samples = 240) {
      const state = STATES[stateName] || this.stateFor(this.target);
      const gazePool = summarizeGazePool(state);
      const rootYMax = state.motionBudget?.rootYMax ?? null;
      const calm = Boolean(state.motionBudget?.calm);
      const breathPeak = Math.abs(state.breath * (calm ? 0.55 : 0.6));
      const driftPeak = calm ? 0 : Math.abs(state.bodyDriftY * 0.6);
      return {
        state: state.name,
        samples,
        rootYEstimatedPeak: Number((breathPeak + driftPeak).toFixed(3)),
        rootYMax,
        rootYBudgetOk: rootYMax === null ? true : breathPeak + driftPeak <= rootYMax + 0.001,
        autoIntentMode: state.autoIntentMode || 'mixed',
        autoBodyMovingIntents: state.intentPool.filter((name) => isBodyMovingIntent(NUDGES[name])),
        gazePool
      };
    }

    buildAmbientLines() {
      const count = KIOSK_MODE && PERF_MODE !== 'full' ? 3 : 8;
      for (let i = 0; i < count; i++) {
        const path = el('path', {
          fill: 'none',
          'stroke-width': i % 3 === 0 ? '1.2' : '0.55',
          'stroke-linecap': 'round'
        });
        this.refs.ambientGroup.appendChild(path);
      }
      this.refs.ambientLines = Array.from(this.refs.ambientGroup.querySelectorAll('path'));
    }

    buildOrbits() {
      this.refs.orbitEllipses = [];
      const orbitDefs = KIOSK_MODE && PERF_MODE !== 'full'
        ? [['96', '78', '0']]
        : [['100', '86', '0'], ['74', '110', '68']];
      orbitDefs.forEach(([rx, ry, rot]) => {
        const ell = el('ellipse', {
          cx: 0, cy: 0, rx, ry, fill: 'none', 'stroke-width': '1',
          transform: `translate(${HOST_CENTER_X} ${HOST_CENTER_Y}) rotate(${rot})`
        });
        this.refs.orbitBack.appendChild(ell);
        this.refs.orbitEllipses.push(ell);
      });
      const glyphs = this.target.skinMeta?.glyphs || ['◇', '⌁', '◌', '✦'];
      this.refs.motes = this.motes.map((_mote, index) => {
        const group = el('g', { class: 'mote' });
        group.appendChild(el('circle', { r: '3.4' }));
        group.appendChild(txt('text', {
          y: -8, 'text-anchor': 'middle',
          'font-family': 'ui-monospace, Menlo, Consolas, monospace',
          'font-size': 10, 'font-weight': 800
        }, glyphs[index % glyphs.length]));
        this.refs.orbitFront.appendChild(group);
        return group;
      });
    }

    buildMeters() {
      if (KIOSK_MODE && PERF_MODE !== 'full') {
        this.refs.meterArcs = [];
        if (this.refs.meters) this.refs.meters.setAttribute('opacity', '0');
        return;
      }
      const labels = ['ENG', 'FOC', 'IMP'];
      this.refs.meterArcs = [];
      labels.forEach((label, index) => {
        const x = 54 + index * 42;
        const group = el('g', { transform: `translate(${x} 436)` });
        group.appendChild(el('circle', {
          r: '10', fill: 'none', stroke: '#ffffff',
          'stroke-opacity': '0.10', 'stroke-width': '3'
        }));
        const arc = el('circle', {
          class: 'meter-arc', r: '10', fill: 'none', stroke: '#65f3ff',
          'stroke-width': '3', 'stroke-linecap': 'round',
          pathLength: '56', 'stroke-dasharray': '1 56', transform: 'rotate(-90)'
        });
        group.appendChild(arc);
        group.appendChild(txt('text', {
          y: 22, 'text-anchor': 'middle', fill: '#8aa2b2',
          'font-family': 'ui-monospace, Menlo, Consolas, monospace', 'font-size': 7
        }, label));
        this.refs.meters.appendChild(group);
        this.refs.meterArcs.push(arc);
      });
    }

    buildTopTicks() {
      this.refs.topTicks = [];
      for (let i = 0; i < 30; i++) {
        const rect = el('rect', {
          x: 17 + i * 9.8, y: 10 + (i % 2) * 2,
          width: '4.4', height: 3 + ((i + 2) % 4), rx: '2'
        });
        this.refs.topGroup.appendChild(rect);
        this.refs.topTicks.push(rect);
      }
    }

    buildFooterTicks() {
      this.refs.footerTicks = [];
      for (let i = 0; i < 30; i++) {
        const rect = el('rect', {
          x: 17 + i * 9.8, y: 468 + (i % 2) * 2,
          width: '4.4', height: 3 + (i % 4), rx: '2'
        });
        this.refs.footerGroup.appendChild(rect);
        this.refs.footerTicks.push(rect);
      }
    }
  }

  function collectChromeRefs(svg) {
    return {
      puppetHost: svg.querySelector('.puppet-host'),
      orbitBack: svg.querySelector('.orbit-back'),
      orbitFront: svg.querySelector('.orbit-front'),
      ambientGroup: svg.querySelector('.ambient-lines'),
      ambientLines: [],
      sighLayer: svg.querySelector('.sigh-layer'),
      sighCircle: svg.querySelector('.sigh-circle'),
      meters: svg.querySelector('.meters'),
      meterArcs: [],
      topGroup: svg.querySelector('.top-ticks'),
      topTicks: [],
      footerGroup: svg.querySelector('.footer-ticks'),
      footerTicks: [],
      orbitEllipses: [],
      motes: [],
      stateDot: svg.querySelector('.state-dot'),
      stateLabel: svg.querySelector('.state-label'),
      skinLabel: svg.querySelector('.skin-label'),
      intentLabel: svg.querySelector('.intent-label'),
      statusInner: svg.querySelector('.status-inner'),
      caption: svg.querySelector('.caption'),
      snippet: svg.querySelector('.snippet'),
      floorShadow: svg.querySelector('.floor-shadow'),
      loadError: svg.querySelector('.load-error')
    };
  }

  function makeMotes(count) {
    return Array.from({ length: count }, (_, index) => ({
      phase: (Math.PI * 2 * index) / count,
      wobble: 0.6 + seededNoise(index * 337) * 1.4
    }));
  }

  const WORK_VISUAL_VARIANTS = {
    shell: {
      blinkMs: [1200, 2600], lid: 0.18, squint: 0.30, pupilScale: 0.72,
      browLeft: 'flat_left', browRight: 'flat_right', mouth: 'flat_focus',
      gazeTargets: ['down_right','right','down_right','forward_focus','right','down'],
      gazeWeights: [4, 3, 3, 2, 2, 1], gazeProfile: { saccadeMs: [70, 110], dwellMs: [430, 950], holdJitterPx: 0.13 },
      tailSway: 0.55, tailHz: 1.25, wingFlap: 0.28, wingHz: 1.65, helmetTiltDeg: -5,
      breath: 0.42, breathHz: 1.05, bodyDriftX: 0.65, bodyDriftY: 0.18,
      scanBeam: true, scanSpeed: 78, fxIntensity: 0.92, runeIntensity: 0.62,
      intentPool: ['scan_sweep','glance_right','skeptical_squint','brow_pop'], intentWeights: [4, 2, 1, 1], intentEveryMs: [2500, 5200]
    },
    python: {
      blinkMs: [1500, 3300], lid: 0.10, squint: 0.26, pupilScale: 0.82,
      browLeft: 'squint_focused_left', browRight: 'squint_focused_right', mouth: 'flat_focus',
      gazeTargets: ['up_left','down_right','forward_focus','up_right','center','forward_focus'],
      gazeWeights: [3, 3, 2, 2, 1, 1], gazeProfile: { saccadeMs: [85, 130], dwellMs: [650, 1300], holdJitterPx: 0.11 },
      tailSway: 0.75, tailHz: 0.82, wingFlap: 0.36, wingHz: 1.15, helmetTiltDeg: -2,
      scanBeam: true, scanSpeed: 52, fxIntensity: 0.98, runeIntensity: 0.72,
      intentPool: ['glance_up_left','scan_sweep','tiny_perk','brow_pop'], intentWeights: [2, 3, 1, 1], intentEveryMs: [3200, 6800]
    },
    reading: {
      blinkMs: [2400, 5200], lid: 0.20, squint: 0.10, pupilScale: 0.92,
      browLeft: 'neutral_left', browRight: 'neutral_right', mouth: 'neutral',
      gazeTargets: ['down','down_left','down_right','down','center','down_right'],
      gazeWeights: [5, 2, 3, 4, 1, 2], gazeProfile: { saccadeMs: [95, 150], dwellMs: [1100, 2300], holdJitterPx: 0.06 },
      breath: 0.34, breathHz: 0.52, tailSway: 0.36, tailHz: 0.44, wingFlap: 0.14, wingHz: 0.45, helmetTiltDeg: 4,
      scanBeam: false, fxIntensity: 0.55, runeIntensity: 0.28,
      intentPool: ['slow_blink','glance_left','glance_right','tiny_perk'], intentWeights: [3, 1, 1, 1], intentEveryMs: [8500, 15000]
    },
    searching: {
      blinkMs: [1300, 2900], lid: 0.10, squint: 0.18, pupilScale: 0.86,
      browLeft: 'raised_left', browRight: 'squint_focused_right', mouth: 'ohh_small',
      gazeTargets: ['left','right','up_left','up_right','forward_focus','down_right','left','right'],
      gazeWeights: [3, 3, 2, 2, 2, 1, 2, 2], gazeProfile: { saccadeMs: [60, 105], dwellMs: [420, 900], holdJitterPx: 0.12 },
      breath: 0.48, breathHz: 0.8, tailSway: 0.92, tailHz: 1.25, wingFlap: 0.48, wingHz: 1.55, helmetTiltDeg: -1,
      scanBeam: true, scanSpeed: 88, fxIntensity: 1.08, runeIntensity: 0.58,
      intentPool: ['glance_left','glance_right','scan_sweep','brow_pop'], intentWeights: [3, 3, 3, 1], intentEveryMs: [2300, 4800]
    },
    patching: {
      blinkMs: [1000, 2400], lid: 0.16, squint: 0.34, pupilScale: 0.76,
      browLeft: 'angry_left', browRight: 'squint_focused_right', mouth: 'flat_tight',
      gazeTargets: ['forward_focus','down_right','forward_focus','right','down'],
      gazeWeights: [5, 3, 4, 1, 1], gazeProfile: { saccadeMs: [80, 120], dwellMs: [650, 1350], holdJitterPx: 0.08 },
      breath: 0.50, breathHz: 0.95, tailSway: 0.42, tailHz: 0.62, wingFlap: 0.38, wingHz: 1.3, helmetTiltDeg: -6,
      scanBeam: true, scanSpeed: 38, fxIntensity: 0.90, runeIntensity: 0.46,
      intentPool: ['skeptical_squint','scan_sweep','side_eye_hold','tiny_perk'], intentWeights: [2, 3, 1, 1], intentEveryMs: [3300, 7200]
    },
    writing: {
      blinkMs: [1500, 3100], lid: 0.13, squint: 0.22, pupilScale: 0.82,
      browLeft: 'squint_focused_left', browRight: 'squint_focused_right', mouth: 'smirk_right',
      gazeTargets: ['down_right','forward_focus','down_right','right','center'],
      gazeWeights: [4, 3, 3, 2, 1], gazeProfile: { saccadeMs: [75, 115], dwellMs: [520, 1150], holdJitterPx: 0.10 },
      breath: 0.46, breathHz: 0.92, tailSway: 0.66, tailHz: 1.05, wingFlap: 0.24, wingHz: 0.95, helmetTiltDeg: -4,
      scanBeam: true, scanSpeed: 62, fxIntensity: 0.86, runeIntensity: 0.50,
      intentPool: ['scan_sweep','glance_right','tiny_perk'], intentWeights: [3, 2, 1], intentEveryMs: [3200, 6200]
    },
    planning: {
      blinkMs: [2200, 4600], lid: 0.08, squint: 0.10, pupilScale: 1.02,
      browLeft: 'raised_left', browRight: 'neutral_right', mouth: 'neutral',
      gazeTargets: ['up_left','up_right','center','up_left','forward_focus'],
      gazeWeights: [4, 3, 2, 3, 2], gazeProfile: { saccadeMs: [115, 165], dwellMs: [1500, 3000], holdJitterPx: 0.07 },
      breath: 0.38, breathHz: 0.42, tailSway: 0.48, tailHz: 0.38, wingFlap: 0.18, wingHz: 0.38, helmetTiltDeg: 2,
      scanBeam: false, fxIntensity: 0.68, runeIntensity: 0.40,
      intentPool: ['glance_up_left','brow_pop','slow_blink','tiny_perk'], intentWeights: [3, 1, 2, 1], intentEveryMs: [7000, 13000]
    },
    reasoning: {
      blinkMs: [2600, 5600], lid: 0.16, squint: 0.24, pupilScale: 0.86,
      browLeft: 'squint_focused_left', browRight: 'squint_focused_right', mouth: 'flat_focus',
      gazeTargets: ['up_left','forward_focus','up_right','center','up_left'],
      gazeWeights: [4, 3, 3, 1, 2], gazeProfile: { saccadeMs: [120, 175], dwellMs: [2000, 4200], holdJitterPx: 0.055 },
      breath: 0.30, breathHz: 0.34, tailSway: 0.22, tailHz: 0.32, wingFlap: 0.12, wingHz: 0.34, helmetTiltDeg: -2,
      scanBeam: false, scanSpeed: 28, fxIntensity: 0.54, runeIntensity: 0.34,
      intentPool: ['glance_up_left','slow_blink','settle'], intentWeights: [2, 4, 2], intentEveryMs: [9000, 16000]
    },
    recalling: {
      blinkMs: [2100, 4700], lid: 0.15, squint: 0.12, pupilScale: 0.94,
      browLeft: 'neutral_left', browRight: 'raised_right', mouth: 'smirk_left',
      gazeTargets: ['up_left','left','up_left','center','down_left'],
      gazeWeights: [5, 2, 4, 1, 1], gazeProfile: { saccadeMs: [105, 160], dwellMs: [1300, 2600], holdJitterPx: 0.07 },
      breath: 0.36, breathHz: 0.48, tailSway: 0.40, tailHz: 0.50, wingFlap: 0.18, wingHz: 0.52, helmetTiltDeg: 5,
      scanBeam: false, fxIntensity: 0.64, runeIntensity: 0.60,
      intentPool: ['glance_up_left','slow_blink','brow_pop'], intentWeights: [3, 2, 1], intentEveryMs: [7200, 14000]
    },
    compressing: {
      blinkMs: [2600, 5600], lid: 0.20, squint: 0.16, pupilScale: 0.82,
      browLeft: 'flat_left', browRight: 'flat_right', mouth: 'flat_focus',
      gazeTargets: ['down','forward_focus','down','center'], gazeWeights: [4, 3, 3, 1],
      gazeProfile: { saccadeMs: [120, 170], dwellMs: [1500, 2800], holdJitterPx: 0.05 },
      breath: 0.30, breathHz: 0.36, tailSway: 0.22, tailHz: 0.32, wingFlap: 0.10, wingHz: 0.30, helmetTiltDeg: -1,
      scanBeam: true, scanSpeed: 22, fxIntensity: 0.50, runeIntensity: 0.34,
      intentPool: ['slow_blink','settle','glance_left'], intentWeights: [3, 2, 1], intentEveryMs: [9000, 16000]
    }
  };

  const WORK_KIND_ALIASES = {
    reading_web: 'reading', researching: 'searching', inspecting: 'searching', looking: 'searching', working: 'reasoning'
  };

  const DISPLAY_PRESET_VARIANTS = {
    quiet_watch: {
      lid: 0.18, squint: 0.02, mouth: 'neutral', gazeTargets: ['center','forward_focus','center','sleepy','left','right'],
      gazeWeights: [7, 4, 5, 1, 1, 1], gazeProfile: { dwellMs: [3000, 6200], holdJitterPx: 0.045 },
      breath: 0.30, breathHz: 0.32, tailSway: 0.26, wingFlap: 0.08, fxIntensity: 0.36, eyeGlow: 0.28
    },
    planning: {
      lid: 0.06, squint: 0.08, pupilScale: 1.02, browLeft: 'raised_left', browRight: 'neutral_right', mouth: 'smile_small',
      gazeTargets: ['up_left','up_right','center','forward_focus','up_left'], gazeWeights: [4, 3, 2, 2, 3],
      gazeProfile: { saccadeMs: [105, 155], dwellMs: [1200, 2600], holdJitterPx: 0.065 },
      helmetTiltDeg: 2, breath: 0.36, breathHz: 0.42, tailSway: 0.44, wingFlap: 0.20, fxIntensity: 0.70,
      intentPool: ['glance_up_left','brow_pop','tiny_perk','slow_blink'], intentWeights: [3, 2, 2, 1], intentEveryMs: [5200, 9800]
    },
    reasoning: {
      lid: 0.16, squint: 0.22, pupilScale: 0.88, browLeft: 'squint_focused_left', browRight: 'squint_focused_right', mouth: 'flat_focus',
      gazeTargets: ['up_left','forward_focus','up_right','center','up_left'], gazeWeights: [4, 3, 3, 1, 2],
      gazeProfile: { saccadeMs: [120, 175], dwellMs: [2000, 4200], holdJitterPx: 0.055 }, helmetTiltDeg: -2,
      breath: 0.30, breathHz: 0.34, tailSway: 0.22, wingFlap: 0.12, fxIntensity: 0.54, scanBeam: false,
      intentPool: ['glance_up_left','slow_blink','settle'], intentWeights: [2, 4, 2], intentEveryMs: [9000, 16000]
    },
    working: {
      lid: 0.14, squint: 0.24, pupilScale: 0.84, mouth: 'flat_focus', breath: 0.42, breathHz: 0.66,
      bodyDriftX: 0.42, bodyDriftY: 0.10, tailSway: 0.42, wingFlap: 0.22, helmetTiltDeg: -3,
      motionBudget: { calm: true, rootXMax: 0.85, rootYMax: 1.10, tiltMax: 1.10 },
      intentPool: ['scan_sweep','glance_right','skeptical_squint','slow_blink'], intentWeights: [3, 2, 1, 1], intentEveryMs: [4200, 8600]
    },
    waiting_input: {
      blinkMs: [3600, 7200], lid: 0.20, squint: 0.04, pupilScale: 0.98,
      browLeft: 'neutral_left', browRight: 'neutral_right', mouth: 'neutral',
      gazeTargets: ['center','forward_focus','center','down','center'], gazeWeights: [6, 5, 4, 1, 3],
      gazeProfile: { saccadeMs: [115, 165], dwellMs: [3200, 6800], holdJitterPx: 0.04 },
      helmetTiltDeg: 1, breath: 0.28, breathHz: 0.30, tailSway: 0.18, tailHz: 0.28, wingFlap: 0.08, wingHz: 0.26,
      fxIntensity: 0.42, eyeGlow: 0.36, scanBeam: false, runeIntensity: 0.18,
      motionBudget: { calm: true, rootXMax: 0.35, rootYMax: 0.80, tiltMax: 0.40 },
      intentPool: ['slow_blink','glance_left','glance_right'], intentWeights: [4, 1, 1], intentEveryMs: [12000, 22000]
    },
    feed_stale: {
      blinkMs: [4600, 8600], lid: 0.28, squint: 0.08, pupilScale: 0.82, browLeft: 'worried_left', browRight: 'neutral_right', mouth: 'flat_tight',
      gazeTargets: ['down_left','center','down','center','left'], gazeWeights: [2, 4, 2, 3, 1],
      gazeProfile: { saccadeMs: [130, 190], dwellMs: [2600, 5200], holdJitterPx: 0.035 }, scanBeam: false,
      breath: 0.20, breathHz: 0.22, tailSway: 0.12, wingFlap: 0.06, wingHz: 0.20, helmetTiltDeg: -1,
      fxIntensity: 0.34, alertPulse: 0.18, eyeGlow: 0.24, runeIntensity: 0.14,
      motionBudget: { calm: true, rootXMax: 0.25, rootYMax: 0.65, tiltMax: 0.35 },
      intentPool: ['slow_blink','glance_left'], intentWeights: [4, 1], intentEveryMs: [14000, 24000]
    },
    night_watch: {
      lid: 0.62, squint: 0.06, pupilScale: 0.90, eyeGlow: 0.20, fxIntensity: 0.24, breath: 0.14, wingFlap: 0.05, tailSway: 0.16
    }
  };

  function workVisualKind(packet) {
    const raw = String(packet?.live?.current_work?.visual_kind || packet?.live?.current_work?.kind || packet?.live?.last_tool || '').toLowerCase();
    return WORK_KIND_ALIASES[raw] || raw || 'reasoning';
  }

  function applyWorkVisualVariant(base, kind) {
    const variant = WORK_VISUAL_VARIANTS[kind] || WORK_VISUAL_VARIANTS.reasoning;
    return mergeStateVariant(base, variant, base.name);
  }

  function applyDisplayPresetVariant(base, packet) {
    const preset = packet?.state_preset;
    const variant = DISPLAY_PRESET_VARIANTS[preset];
    if (!variant) return base;
    return mergeStateVariant(base, variant, base.name);
  }

  function applyPuppetStatePacket(base, packet) {
    const puppet = packet?.optic_state_packet || packet?.puppet_state_packet;
    if (!puppet || typeof puppet !== 'object') return base;
    const gazeTarget = normalizePuppetGazeTarget(puppet.gaze?.target);
    const lidOpen = Number(puppet.eyes?.lid_open);
    const pupilScale = Number(puppet.eyes?.pupil_scale);
    const faceGlow = Number(puppet.glow?.face);
    const wingTension = Number(puppet.helmet?.wing_tension);
    const rimTilt = Number(puppet.helmet?.rim_tilt_deg);
    const headTilt = Number(puppet.head?.tilt_deg);
    const headY = Number(puppet.head?.y_px);
    const pace = Number(puppet.gaze?.pace);
    const jitter = Number(puppet.gaze?.jitter);
    const mouthShape = MOUTH_PATHS[puppet.mouth?.shape] ? puppet.mouth.shape : base.mouth;
    const focusGazeTargets = gazeTarget ? [gazeTarget, ...(base.gazeTargets || []).filter((name) => name !== gazeTarget)] : base.gazeTargets;
    const focusWeights = gazeTarget ? [6, ...((base.gazeTargets || []).filter((name) => name !== gazeTarget).map(() => 1))] : base.gazeWeights;
    const variant = {
      behaviorMode: String(puppet.mode || base.behaviorMode || packet?.state_preset || 'idle_watch'),
      gazeTargets: focusGazeTargets,
      gazeWeights: focusWeights,
      mouth: mouthShape,
      lid: Number.isFinite(lidOpen) ? clamp(1 - lidOpen, 0.04, 0.62) : base.lid,
      pupilScale: Number.isFinite(pupilScale) ? clamp(pupilScale, 0.72, 1.10) : base.pupilScale,
      helmetTiltDeg: Number.isFinite(rimTilt) ? clamp(rimTilt, -4, 4) : Number.isFinite(headTilt) ? clamp(headTilt, -4, 4) : base.helmetTiltDeg,
      wingFlap: Number.isFinite(wingTension) ? clamp(wingTension * 0.42, 0.02, 0.32) : base.wingFlap,
      wingRestDeg: Number.isFinite(wingTension) ? clamp((wingTension - 0.30) * 3.2, -1.1, 1.4) : base.wingRestDeg,
      eyeGlow: Number.isFinite(faceGlow) ? clamp(faceGlow, 0.14, 0.90) : base.eyeGlow,
      fxIntensity: Number.isFinite(faceGlow) ? clamp(faceGlow * 0.82, 0.12, 0.88) : base.fxIntensity,
      motionBudget: { ...(base.motionBudget || {}) },
      gazeProfile: { ...(base.gazeProfile || {}) }
    };
    if (Number.isFinite(headY)) variant.motionBudget.rootYMax = clamp(Math.abs(headY) * 0.45 + 0.45, 0.45, 1.35);
    if (Number.isFinite(pace)) variant.gazeProfile.dwellMs = [clamp(900 / Math.max(pace, 0.08), 900, 6200), clamp(1700 / Math.max(pace, 0.08), 1600, 8200)];
    if (Number.isFinite(jitter)) variant.gazeProfile.holdJitterPx = clamp(jitter * 1.4, 0.01, 0.12);
    return mergeStateVariant(base, variant, base.name);
  }

  function normalizePuppetGazeTarget(target) {
    const key = String(target || '').toLowerCase();
    const aliases = {
      center: 'center',
      forward: 'forward_focus',
      forward_focus: 'forward_focus',
      internal_down: 'down_left',
      down_scan: 'down',
      down: 'down',
      down_left: 'down_left',
      down_right: 'down_right',
      right_output: 'down_right',
      side_eye_left: 'side_eye_left',
      side_eye_right: 'side_eye_right',
      left: 'left',
      right: 'right',
      sleepy: 'sleepy'
    };
    const name = aliases[key] || key;
    return GAZE[name] ? name : 'center';
  }

  function mergeStateVariant(base, variant, name = base.name) {
    return {
      ...base,
      ...variant,
      name,
      motionBudget: { ...(base.motionBudget || {}), ...(variant.motionBudget || {}) },
      gazeProfile: { ...(base.gazeProfile || {}), ...(variant.gazeProfile || {}) }
    };
  }

  function applyBoundedMotion(base, packet) {
    const motion = packet?.motion || {};
    const blinkMid = Number(motion.blink_interval_ms);
    const floatMs = Number(motion.float_duration_ms);
    const breath = Number(motion.breath);
    const breathHz = Number(motion.breath_hz);
    const wingFlap = Number(motion.wing_flap);
    const wingHz = Number(motion.wing_hz);
    const rootYMax = Number(motion.root_y_max);
    const gazeJitter = Number(motion.gaze_jitter_px);
    const tuned = {
      ...base,
      blinkMs: Number.isFinite(blinkMid)
        ? [clamp(blinkMid * 0.72, 1200, 8200), clamp(blinkMid * 1.28, 2200, 9800)]
        : base.blinkMs,
      breath: Number.isFinite(breath) ? clamp(breath, 0.08, 0.55) : base.breath,
      breathHz: Number.isFinite(breathHz) ? clamp(breathHz, 0.14, 0.70) : base.breathHz,
      wingFlap: Number.isFinite(wingFlap) ? clamp(wingFlap, 0.02, 0.32) : Math.min(base.wingFlap, 0.32),
      wingHz: Number.isFinite(wingHz) ? clamp(wingHz, 0.12, 0.90) : Math.min(base.wingHz, 0.90),
      fxIntensity: Number.isFinite(Number(motion.accent_intensity)) ? clamp(motion.accent_intensity, 0.12, 0.92) : base.fxIntensity,
      eyeGlow: Number.isFinite(Number(motion.eye_glow)) ? clamp(motion.eye_glow, 0.16, 0.90) : undefined,
      alertPulse: Number.isFinite(Number(motion.alert_pulse)) ? clamp(motion.alert_pulse, 0, 0.85) : 0,
      floatDurationMs: Number.isFinite(floatMs) ? clamp(floatMs, 4800, 12000) : undefined,
      motionBudget: { ...(base.motionBudget || {}) },
      gazeProfile: { ...(base.gazeProfile || {}) }
    };
    if (Number.isFinite(rootYMax)) tuned.motionBudget.rootYMax = clamp(rootYMax, 0.50, 1.30);
    tuned.motionBudget.rootXMax = Math.min(tuned.motionBudget.rootXMax ?? 1.2, 1.2);
    tuned.motionBudget.tiltMax = Math.min(tuned.motionBudget.tiltMax ?? 1.4, 1.4);
    if (Number.isFinite(gazeJitter)) tuned.gazeProfile.holdJitterPx = clamp(gazeJitter, 0.02, 0.12);
    if ((packet?.state_preset === 'critical' || packet?.state_preset === 'blocked') && tuned.autoIntentMode !== 'face_only') {
      tuned.autoIntentMode = 'face_only';
    }
    return tuned;
  }

  function perfProfile(tier, reducedMotion = false) {
    if (reducedMotion) {
      return { motionScale: 0.18, fxScale: 0.12, orbitScale: 0.12, decorIntervalMs: 2600, panelIntervalMs: 2200, frameIntervalMs: 0 };
    }
    if (tier === 'critical') {
      return { motionScale: 0.24, fxScale: 0.10, orbitScale: 0.16, decorIntervalMs: 2400, panelIntervalMs: 2200, frameIntervalMs: 0 };
    }
    if (tier === 'hot') {
      return { motionScale: 0.34, fxScale: 0.18, orbitScale: 0.24, decorIntervalMs: 1800, panelIntervalMs: 1800, frameIntervalMs: 0 };
    }
    if (tier === 'warm') {
      return { motionScale: 0.56, fxScale: 0.34, orbitScale: 0.42, decorIntervalMs: 1000, panelIntervalMs: 1200, frameIntervalMs: 0 };
    }
    return { motionScale: 1, fxScale: 1, orbitScale: 1, decorIntervalMs: 0, panelIntervalMs: 0, frameIntervalMs: 0 };
  }

  function resolveColors(svg, pal, packet) {
    const colors = {
      primary: pal.primary || '#65f3ff',
      secondary: pal.secondary || '#2ad6a3',
      accent: packet.state_preset === 'critical'
        ? (pal.danger || '#ff4d7a')
        : ['blocked', 'waiting_input', 'feed_stale'].includes(packet.state_preset)
          ? '#f7d36b'
          : ['planning', 'working', 'reasoning'].includes(packet.state_preset)
            ? '#e5c76b' : (pal.accent || '#b899ff'),
      danger: packet.state_preset === 'critical' ? (pal.danger || '#ff4d7a') : '#f7d36b',
      text: '#e8f7ff',
      muted: '#8aa2b2'
    };
    svg.querySelector('.bg-stop-1').setAttribute('stop-color', blendHex(colors.primary, '#07101b', 0.32));
    return colors;
  }

  function mixPackets(a, b, t) {
    const mixed = window.HermesDisplayState.clone(b);
    for (const key of ['playfulness', 'energy', 'focus', 'curiosity', 'impatience']) {
      mixed[key] = Number(a[key] || 0) + (Number(b[key] || 0) - Number(a[key] || 0)) * t;
    }
    mixed.palette = { ...b.palette };
    mixed.palette.brightness = Number(a.palette?.brightness || b.palette.brightness)
      + (Number(b.palette?.brightness || 0.7) - Number(a.palette?.brightness || 0.7)) * t;
    return mixed;
  }

  function blinkAmount(now, start, duration) {
    const x = (now - start) / duration;
    if (x < 0 || x > 1) return 0;
    return Math.sin(x * Math.PI);
  }

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  }

  function isBodyMovingIntent(def) {
    return Boolean(def?.bodyBob || def?.body?.x || def?.body?.y || def?.body?.tilt || def?.helmetTiltDelta);
  }

  function summarizeGazePool(state) {
    const total = state.gazeWeights.reduce((sum, weight) => sum + weight, 0) || 1;
    const counts = { left: 0, right: 0, center: 0, down: 0, up: 0 };
    let meanX = 0;
    state.gazeTargets.forEach((name, index) => {
      const weight = state.gazeWeights[index] || 1;
      const gaze = GAZE[name] || GAZE.center;
      meanX += gaze.x * weight;
      if (gaze.x < -0.5) counts.left += weight;
      else if (gaze.x > 0.5) counts.right += weight;
      else counts.center += weight;
      if (gaze.y > 0.5) counts.down += weight;
      if (gaze.y < -0.5) counts.up += weight;
    });
    return {
      meanX: Number((meanX / total).toFixed(2)),
      leftShare: Number((counts.left / total).toFixed(2)),
      rightShare: Number((counts.right / total).toFixed(2)),
      centerShare: Number((counts.center / total).toFixed(2)),
      downShare: Number((counts.down / total).toFixed(2)),
      upShare: Number((counts.up / total).toFixed(2))
    };
  }

  function seededNoise(value) {
    return fract(Math.sin(Number(value) * 12.9898 + 78.233) * 43758.5453);
  }

  function fract(value) { return value - Math.floor(value); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

  function validateAvatarEvent(rawEvent) {
    const value = rawEvent && typeof rawEvent === 'object' ? rawEvent : null;
    if (!value) return { ok: false, reason: 'not_object' };
    const display = value.display && typeof value.display === 'object' ? value.display : null;
    const allowedEvents = new Set(['assistant.started','assistant.tool_started','assistant.tool_finished','assistant.waiting_on_user','assistant.final_started','assistant.final_complete','system.display_recovered','touch.tap','touch.long_press','feed.stale','feed.lost','feed.recovered']);
    const allowedIntents = new Set(['assistant_active','tool_active','tool_settled','waiting_on_user','finalizing','final_complete','display_recovered','touch_tap','touch_long_press','feed_stale','feed_lost','feed_recovered']);
    if (value.boundary !== 'localhost_only') return { ok: false, reason: 'boundary' };
    if (value.privacy !== 'display_safe_intent') return { ok: false, reason: 'privacy' };
    if (!allowedEvents.has(value.event)) return { ok: false, reason: 'event' };
    if (!display || !allowedIntents.has(display.intent)) return { ok: false, reason: 'display_intent' };
    const ttl = Number(value.ttl_ms || 0);
    if (!Number.isFinite(ttl) || ttl < 250) return { ok: false, reason: 'ttl' };
    const occurred = Date.parse(value.occurred_at || '');
    if (Number.isFinite(occurred) && occurred + ttl < Date.now()) return { ok: false, reason: 'expired' };
    const text = JSON.stringify(value);
    if (/(api[_-]?key|token|password|passwd|secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|ghp_[a-z0-9_]+|\/[\w.-]+(?:\/[\w.-]+)+)/i.test(text)) return { ok: false, reason: 'unsafe_string' };
    return { ok: true, value };
  }

  function displayMoodLabel(mood) {
    const labels = {
      thinking_focused: 'WORKING',
      healthy_smug: 'SYSTEMS STEADY',
      blocked_annoyed: 'NEEDS ATTENTION',
      night_sleepy: 'NIGHT WATCH',
      idle_watchful: 'QUIET WATCH'
    };
    return labels[mood] || 'ONLINE';
  }

  function clampText(text, maxLength) {
    const clean = String(text || '').replace(/[\r\n\t]+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function blendHex(a, b, amount) {
    const ca = parseHex(a);
    const cb = parseHex(b);
    const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * amount));
    return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function parseHex(hex) {
    const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '65f3ff';
    return [parseInt(safe.slice(0, 2), 16), parseInt(safe.slice(2, 4), 16), parseInt(safe.slice(4, 6), 16)];
  }

  window.HermesDisplayRenderer = HermesDisplayRenderer;
  window.HermesDisplayDebug = {
    summarizeGazePool,
    isBodyMovingIntent,
    behaviorGrammar: () => ({
      gaze: window.HermesDisplayState.clone(BEHAVIOR_GAZE_GRAMMAR),
      mouth: window.HermesDisplayState.clone(BEHAVIOR_MOUTH_GRAMMAR),
      blink: window.HermesDisplayState.clone(CONTEXTUAL_BLINK_GRAMMAR)
    }),
    sampleStateBudgets() {
      return Object.fromEntries(Object.keys(STATES).map((name) => {
        const state = STATES[name];
        const calm = Boolean(state.motionBudget?.calm);
        const rootYEstimatedPeak = Math.abs(state.breath * (calm ? 0.55 : 0.6)) + (calm ? 0 : Math.abs(state.bodyDriftY * 0.6));
        return [name, {
          rootYEstimatedPeak: Number(rootYEstimatedPeak.toFixed(3)),
          rootYMax: state.motionBudget?.rootYMax ?? null,
          rootYBudgetOk: !state.motionBudget || rootYEstimatedPeak <= state.motionBudget.rootYMax + 0.001,
          autoIntentMode: state.autoIntentMode || 'mixed',
          autoBodyMovingIntents: state.intentPool.filter((intentName) => isBodyMovingIntent(NUDGES[intentName])),
          gazePool: summarizeGazePool(state)
        }];
      }));
    }
  };
})();
