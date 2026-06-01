(() => {
  const WIDTH = 320;
  const HEIGHT = 480;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const STATE_GRAPH = {
    idle_watchful: {
      name: 'idle_watchful',
      blinkMs: [3200, 7600],
      gaze: 'wander',
      breath: 0.55,
      orbit: 0.42,
      posture: 'float',
      lid: 0.12,
      squint: 0,
      spark: 0.22,
      captionY: 0
    },
    thinking_focused: {
      name: 'thinking_focused',
      blinkMs: [1400, 3300],
      gaze: 'scan',
      breath: 0.82,
      orbit: 1.12,
      posture: 'forward',
      lid: 0.20,
      squint: 0.28,
      spark: 0.86,
      captionY: -2
    },
    healthy_smug: {
      name: 'healthy_smug',
      blinkMs: [3600, 8200],
      gaze: 'smug',
      breath: 0.45,
      orbit: 0.36,
      posture: 'proud',
      lid: 0.18,
      squint: 0.18,
      spark: 0.28,
      captionY: 0
    },
    blocked_annoyed: {
      name: 'blocked_annoyed',
      blinkMs: [900, 2400],
      gaze: 'side_eye',
      breath: 0.36,
      orbit: 0.22,
      posture: 'slump',
      lid: 0.34,
      squint: 0.52,
      spark: 0.72,
      captionY: -4
    },
    night_sleepy: {
      name: 'night_sleepy',
      blinkMs: [4200, 10500],
      gaze: 'sleepy',
      breath: 0.18,
      orbit: 0.16,
      posture: 'sleepy',
      lid: 0.55,
      squint: 0.08,
      spark: 0.08,
      captionY: 4
    }
  };

  class HermesCharacterSvgRenderer {
    constructor(rootId, initialPacket) {
      this.root = document.getElementById(rootId);
      this.packet = window.HermesDisplayState.normalizePersonaPacket(initialPacket);
      this.target = this.packet;
      this.previous = this.packet;
      this.transitionStart = performance.now();
      this.transitionMs = 700;
      this.transition = 1;
      this.seed = 91297;
      this.motes = makeMotes(16);
      this.nextBlinkAt = 0;
      this.blinkStart = -10000;
      this.blinkDuration = 145;
      this.nextGestureAt = 0;
      this.gesture = { name: 'none', start: 0, duration: 0 };
      this.gazeTarget = { x: 0, y: 0 };
      this.gazeCurrent = { x: 0, y: 0 };
      this.lastGazeShift = 0;
      this.frameHandle = null;
      this.mount();
      this.setPacket(this.packet, true);
      this.frame = this.frame.bind(this);
      this.frameHandle = requestAnimationFrame(this.frame);
    }

    setPacket(nextPacket, immediate = false) {
      this.previous = this.packet;
      this.target = window.HermesDisplayState.normalizePersonaPacket(nextPacket);
      this.transitionMs = this.target.duration?.transition_ms || 650;
      this.transitionStart = performance.now();
      this.transition = immediate ? 1 : 0;
      if (immediate) this.packet = this.target;
      this.scheduleBlink(0, true);
      this.updateMoteGlyphs(this.target);
      this.gesture = { name: 'state_flash', start: performance.now(), duration: 850 };
      this.updateText();
    }

    mount() {
      this.root.innerHTML = '';
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
      svg.setAttribute('width', WIDTH);
      svg.setAttribute('height', HEIGHT);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Expressive Hermes character runtime prototype');
      svg.classList.add('character-runtime-svg');
      svg.innerHTML = `
        <defs>
          <radialGradient id="bgGlow" cx="50%" cy="38%" r="72%">
            <stop offset="0%" stop-color="#14314a" stop-opacity="0.82" />
            <stop offset="55%" stop-color="#07101b" stop-opacity="0.84" />
            <stop offset="100%" stop-color="#03060b" stop-opacity="1" />
          </radialGradient>
          <radialGradient id="coreFill" cx="38%" cy="24%" r="78%">
            <stop class="core-stop-1" offset="0%" stop-color="#102536" />
            <stop class="core-stop-2" offset="58%" stop-color="#08101b" />
            <stop class="core-stop-3" offset="100%" stop-color="#05070d" />
          </radialGradient>
          <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="tightGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <pattern id="scanPattern" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 7.5 H8" stroke="#ffffff" stroke-opacity="0.05" stroke-width="1" />
          </pattern>
        </defs>
        <rect class="bg" x="0" y="0" width="320" height="480" fill="url(#bgGlow)" />
        <rect class="scanlines" x="0" y="0" width="320" height="480" fill="url(#scanPattern)" opacity="0.62" />
        <g class="auras"></g>
        <g class="topbar">
          <rect x="14" y="16" width="292" height="36" rx="14" fill="#ffffff" opacity="0.055" />
          <circle class="state-dot" cx="31" cy="34" r="4.5" fill="#65f3ff" />
          <text class="state-label" x="43" y="38" fill="#d8f7ff" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="10" font-weight="700"></text>
          <text class="skin-label" x="291" y="38" text-anchor="end" fill="#8aa2b2" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="9"></text>
        </g>
        <g class="ambient-lines"></g>
        <g class="orbit-back"></g>
        <g class="character" transform="translate(160 205)">
          <g class="wings" fill="none" stroke-linecap="round">
            <path class="wing wing-left-a" d="M-61,-28 C-100,-56 -112,-5 -78,8" />
            <path class="wing wing-left-b" d="M-68,-10 C-105,-24 -106,25 -78,32" />
            <path class="wing wing-right-a" d="M61,-28 C100,-56 112,-5 78,8" />
            <path class="wing wing-right-b" d="M68,-10 C105,-24 106,25 78,32" />
          </g>
          <ellipse class="body-glow" cx="0" cy="2" rx="78" ry="90" fill="#65f3ff" opacity="0.18" filter="url(#softGlow)" />
          <ellipse class="body" cx="0" cy="0" rx="58" ry="70" fill="url(#coreFill)" stroke="#65f3ff" stroke-width="1.8" />
          <path class="body-facet-a" d="M-38,-42 C-20,-60 21,-56 40,-33 C18,-42 -18,-43 -38,-42Z" fill="#65f3ff" opacity="0.12" />
          <path class="body-facet-b" d="M-36,30 C-8,51 29,46 43,19 C19,27 -9,29 -36,30Z" fill="#b899ff" opacity="0.10" />
          <g class="face" transform="translate(0 -15)">
            <g class="eye eye-left" transform="translate(-27 0)">
              <ellipse class="eye-glow" cx="0" cy="0" rx="25" ry="15" fill="#65f3ff" opacity="0.20" filter="url(#tightGlow)" />
              <ellipse class="eye-white" cx="0" cy="0" rx="18" ry="9" fill="#65f3ff" />
              <circle class="pupil" cx="0" cy="0" r="4.8" fill="#ffffff" />
              <path class="upper-lid" d="M-24,-15 Q0,-6 24,-15 L24,-26 L-24,-26Z" fill="#05070d" opacity="0.94" />
              <path class="lower-lid" d="M-24,15 Q0,6 24,15 L24,26 L-24,26Z" fill="#05070d" opacity="0.86" />
              <path class="brow" d="M-21,-15 L20,-17" stroke="#05070d" stroke-width="3" stroke-linecap="round" opacity="0.78" />
            </g>
            <g class="eye eye-right" transform="translate(27 0)">
              <ellipse class="eye-glow" cx="0" cy="0" rx="25" ry="15" fill="#65f3ff" opacity="0.20" filter="url(#tightGlow)" />
              <ellipse class="eye-white" cx="0" cy="0" rx="18" ry="9" fill="#65f3ff" />
              <circle class="pupil" cx="0" cy="0" r="4.8" fill="#ffffff" />
              <path class="upper-lid" d="M-24,-15 Q0,-6 24,-15 L24,-26 L-24,-26Z" fill="#05070d" opacity="0.94" />
              <path class="lower-lid" d="M-24,15 Q0,6 24,15 L24,26 L-24,26Z" fill="#05070d" opacity="0.86" />
              <path class="brow" d="M-20,-17 L21,-15" stroke="#05070d" stroke-width="3" stroke-linecap="round" opacity="0.78" />
            </g>
            <path class="wave-mouth" d="M-26,31 C-13,27 -8,35 0,31 C8,27 13,35 26,31" fill="none" stroke="#65f3ff" stroke-width="1.5" opacity="0.34" />
          </g>
          <g class="inner-runes" fill="none" stroke-linecap="round">
            <path class="rune-a" d="M0,-54 V54" />
            <path class="rune-b" d="M-22,-22 C-3,-38 13,-18 -3,-3 C-16,9 0,26 22,10" />
            <path class="scan-beam" d="M-47,-27 H47" />
          </g>
        </g>
        <g class="orbit-front"></g>
        <g class="sigh-layer"></g>
        <g class="status-band">
          <rect x="16" y="354" width="288" height="106" rx="18" fill="#02050a" opacity="0.64" />
          <rect class="status-inner" x="18" y="356" width="284" height="102" rx="16" fill="#65f3ff" opacity="0.055" />
          <text class="caption" x="160" y="386" text-anchor="middle" fill="#e8f7ff" font-family="Inter, system-ui, sans-serif" font-size="14" font-weight="800"></text>
          <text class="snippet" x="160" y="416" text-anchor="middle" fill="#8aa2b2" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="10"></text>
          <g class="meters"></g>
        </g>
        <g class="footer-ticks"></g>
      `;
      this.root.appendChild(svg);
      this.svg = svg;
      this.refs = collectRefs(svg);
      this.buildAmbientLines();
      this.buildMotes();
      this.buildMeters();
      this.buildFooterTicks();
    }

    frame(now) {
      this.updateTransition(now);
      const t = now / 1000;
      const packet = this.packet;
      const pal = packet.palette;
      const state = STATE_GRAPH[packet.mood] || STATE_GRAPH.idle_watchful;
      if (packet.skin !== this.lastGlyphSkin) {
        this.updateMoteGlyphs(packet);
        this.lastGlyphSkin = packet.skin;
      }
      this.updateBlink(now, state);
      this.updateGesture(now, state);
      this.updateGaze(now, t, state, packet);
      this.draw(t, now, state, packet, pal);
      this.frameHandle = requestAnimationFrame(this.frame);
    }

    updateTransition(now) {
      if (this.transition >= 1) {
        this.packet = this.target;
        return;
      }
      this.transition = Math.min(1, (now - this.transitionStart) / this.transitionMs);
      this.packet = mixPackets(this.previous, this.target, easeInOutCubic(this.transition));
    }

    scheduleBlink(now, first = false) {
      const state = STATE_GRAPH[this.target.mood] || STATE_GRAPH.idle_watchful;
      const [min, max] = state.blinkMs;
      const jitter = seededNoise(this.seed + Math.floor(now / 11)) * (max - min);
      this.nextBlinkAt = now + (first ? 550 + jitter * 0.35 : min + jitter);
    }

    updateBlink(now, state) {
      if (now > this.nextBlinkAt) {
        this.blinkStart = now;
        this.blinkDuration = state.name === 'blocked_annoyed' ? 92 : state.name === 'night_sleepy' ? 230 : 145;
        this.scheduleBlink(now);
      }
    }

    updateGesture(now, state) {
      if (this.gesture.name !== 'none' && now - this.gesture.start < this.gesture.duration) return;
      if (!this.nextGestureAt) this.nextGestureAt = now + 4000;
      if (now < this.nextGestureAt) return;
      if (state.name === 'blocked_annoyed') {
        this.gesture = { name: 'dramatic_sigh', start: now, duration: 1700 };
        this.nextGestureAt = now + 8500 + seededNoise(now) * 9000;
      } else if (state.name === 'thinking_focused') {
        this.gesture = { name: 'scan_sweep', start: now, duration: 1100 };
        this.nextGestureAt = now + 3500 + seededNoise(now) * 3500;
      } else if (state.name === 'healthy_smug') {
        this.gesture = { name: 'smug_nod', start: now, duration: 1200 };
        this.nextGestureAt = now + 9000 + seededNoise(now) * 10000;
      } else if (state.name === 'night_sleepy') {
        this.gesture = { name: 'sleepy_yawn', start: now, duration: 2300 };
        this.nextGestureAt = now + 15000 + seededNoise(now) * 16000;
      } else {
        this.gesture = { name: 'orbit_reorder', start: now, duration: 1400 };
        this.nextGestureAt = now + 9000 + seededNoise(now) * 18000;
      }
    }

    updateGaze(now, t, state, packet) {
      if (now - this.lastGazeShift > gazeCadence(state)) {
        this.lastGazeShift = now;
        this.gazeTarget = chooseGaze(state, t, packet);
      }
      this.gazeCurrent.x += (this.gazeTarget.x - this.gazeCurrent.x) * 0.085;
      this.gazeCurrent.y += (this.gazeTarget.y - this.gazeCurrent.y) * 0.085;
    }

    draw(t, now, state, packet, pal) {
      const colors = resolveColors(this.svg, pal, packet);
      const blink = blinkAmount(now, this.blinkStart, this.blinkDuration);
      const gestureAmount = this.gestureAmount(now);
      const transitionFlash = this.gesture.name === 'state_flash' ? gestureAmount : 0;
      const breath = Math.sin(t * (1.1 + state.breath * 0.8)) * (4 + packet.energy * 6) * state.breath;
      const impatientTap = packet.mood === 'blocked_annoyed' ? Math.pow(Math.max(0, Math.sin(t * 2.85)), 18) * 11 : 0;
      const sleepyDrift = packet.mood === 'night_sleepy' ? Math.sin(t * 0.21) * 4 : 0;
      const smugNod = this.gesture.name === 'smug_nod' ? Math.sin(gestureAmount * Math.PI) * 5 : 0;
      const bodyX = Math.sin(t * 0.37) * (packet.mood === 'night_sleepy' ? 2.4 : 4.2);
      const bodyY = breath * 0.45 + impatientTap + sleepyDrift + smugNod;
      const tilt = postureTilt(state, packet, t) + (packet.mood === 'blocked_annoyed' ? impatientTap * 0.004 : 0);
      const scale = (packet.posture?.scale || 1) * (1 + breath * 0.0025);
      const character = this.refs.character;
      character.setAttribute('transform', `translate(${160 + bodyX} ${205 + bodyY}) rotate(${tilt}) scale(${scale})`);

      this.refs.bodyGlow.setAttribute('rx', 78 + breath * 1.8 + transitionFlash * 18);
      this.refs.bodyGlow.setAttribute('ry', 90 + breath * 1.9 + transitionFlash * 18);
      this.refs.bodyGlow.setAttribute('opacity', clamp(0.08 + pal.brightness * 0.16 + packet.energy * 0.09 + transitionFlash * 0.15, 0.05, 0.38));
      this.refs.body.setAttribute('stroke', colors.primary);
      this.refs.body.setAttribute('rx', 58 + breath * 0.45);
      this.refs.body.setAttribute('ry', 70 + breath * 0.55);
      this.refs.bodyFacetA.setAttribute('fill', colors.primary);
      this.refs.bodyFacetB.setAttribute('fill', colors.accent);
      this.updateEyes(state, packet, colors, blink, t);
      this.updateWings(state, packet, colors, t);
      this.updateRunes(state, packet, colors, t, now);
      this.updateOrbits(state, packet, colors, t, now);
      this.updateMeters(packet, colors);
      this.updateAmbient(state, packet, colors, t);
      this.updateSigh(colors, now);
      this.updateStatusVisuals(state, packet, colors, t);
    }

    gestureAmount(now) {
      if (this.gesture.name === 'none') return 0;
      const raw = clamp((now - this.gesture.start) / this.gesture.duration, 0, 1);
      if (raw >= 1) return 0;
      return Math.sin(raw * Math.PI);
    }

    updateEyes(state, packet, colors, blink, t) {
      const baseEye = state.name === 'night_sleepy' ? { rx: 17, ry: 6.5 } : state.name === 'blocked_annoyed' ? { rx: 18, ry: 7.5 } : state.name === 'thinking_focused' ? { rx: 19, ry: 8 } : { rx: 18.5, ry: 9.5 };
      const lid = clamp(state.lid + blink * 0.92, 0, 0.95);
      const squint = state.squint;
      const sideBias = state.name === 'blocked_annoyed' ? -3.5 : 0;
      const pupilR = packet.eyes?.pupil === 'pinpoint' || state.name === 'thinking_focused' ? 3.1 : state.name === 'night_sleepy' ? 3.6 : 4.9;
      this.refs.eyes.forEach((eye, index) => {
        const side = index === 0 ? -1 : 1;
        const eyeWhite = eye.querySelector('.eye-white');
        const eyeGlow = eye.querySelector('.eye-glow');
        const pupil = eye.querySelector('.pupil');
        const upper = eye.querySelector('.upper-lid');
        const lower = eye.querySelector('.lower-lid');
        const brow = eye.querySelector('.brow');
        const skew = state.name === 'blocked_annoyed' ? side * -2.4 : state.name === 'healthy_smug' ? side * 1.4 : 0;
        eyeWhite.setAttribute('rx', baseEye.rx + packet.playfulness * 2);
        eyeWhite.setAttribute('ry', Math.max(1.4, baseEye.ry * (1 - blink * 0.86)));
        eyeWhite.setAttribute('fill', colors.eye);
        eyeWhite.setAttribute('transform', `translate(${skew} 0) rotate(${state.name === 'blocked_annoyed' ? side * -4 : state.name === 'healthy_smug' ? side * 3 : 0})`);
        eyeGlow.setAttribute('fill', colors.eye);
        eyeGlow.setAttribute('opacity', state.name === 'night_sleepy' ? 0.10 : 0.18 + packet.focus * 0.08);
        pupil.setAttribute('r', pupilR);
        pupil.setAttribute('cx', this.gazeCurrent.x + sideBias + skew);
        pupil.setAttribute('cy', this.gazeCurrent.y + Math.sin(t * 1.7 + side) * 0.7);
        upper.setAttribute('transform', `translate(0 ${lid * 15 + squint * 4 + (state.name === 'blocked_annoyed' ? side * -1.4 : 0)}) rotate(${state.name === 'blocked_annoyed' ? side * -5 : state.name === 'healthy_smug' ? side * 2 : 0})`);
        lower.setAttribute('transform', `translate(0 ${-lid * 10})`);
        brow.setAttribute('opacity', state.name === 'night_sleepy' ? 0.30 : 0.74 + squint * 0.22);
        brow.setAttribute('transform', `rotate(${state.name === 'blocked_annoyed' ? side * -8 : state.name === 'thinking_focused' ? side * 3 : state.name === 'healthy_smug' ? side * 5 : 0}) translate(0 ${squint * 2})`);
      });
      const wave = this.refs.waveMouth;
      const waveAmp = state.name === 'thinking_focused' ? 7 : state.name === 'blocked_annoyed' ? -2 : state.name === 'night_sleepy' ? 3 : 4;
      const open = this.gesture.name === 'sleepy_yawn' ? this.gestureAmount(performance.now()) * 10 : packet.focus * 2;
      wave.setAttribute('stroke', colors.secondary);
      wave.setAttribute('opacity', state.name === 'night_sleepy' ? 0.20 : 0.30 + packet.energy * 0.22);
      wave.setAttribute('d', `M-27,31 C-18,${31 - waveAmp} -9,${31 + waveAmp + open} 0,31 C9,${31 - waveAmp - open} 18,${31 + waveAmp} 27,31`);
    }

    updateWings(state, packet, colors, t) {
      const flap = Math.sin(t * (1.1 + packet.energy * 2.4)) * (3 + packet.energy * 5) + (state.name === 'thinking_focused' ? Math.sin(t * 8) * 1.4 : 0);
      this.refs.wings.forEach((wing, index) => {
        wing.setAttribute('stroke', index < 2 ? colors.secondary : colors.primary);
        wing.setAttribute('stroke-width', state.name === 'blocked_annoyed' ? 2.1 : 1.35);
        wing.setAttribute('opacity', state.name === 'night_sleepy' ? 0.28 : 0.52 + packet.energy * 0.22);
        wing.setAttribute('transform', `translate(0 ${index % 2 ? flap * 0.45 : -flap * 0.35})`);
      });
    }

    updateRunes(state, packet, colors, t, now) {
      this.refs.runes.forEach((rune, index) => {
        rune.setAttribute('stroke', index === 1 ? colors.accent : colors.secondary);
        rune.setAttribute('stroke-width', index === 2 ? 2.2 : 1.1);
        rune.setAttribute('opacity', index === 2 ? scanOpacity(this.gesture, now, t, state) : (state.name === 'night_sleepy' ? 0.16 : 0.28 + packet.focus * 0.22));
      });
      const y = -39 + ((t * (state.name === 'thinking_focused' ? 58 : 20)) % 78);
      this.refs.scanBeam.setAttribute('transform', `translate(0 ${y})`);
      this.refs.scanBeam.setAttribute('stroke', colors.primary);
    }

    updateOrbits(state, packet, colors, t, now) {
      const front = this.refs.orbitFront;
      const back = this.refs.orbitBack;
      const cross = state.name === 'blocked_annoyed';
      const sleepy = state.name === 'night_sleepy';
      const focused = state.name === 'thinking_focused';
      const reorder = this.gesture.name === 'orbit_reorder' ? this.gestureAmount(now) : 0;
      this.refs.orbitEllipses.forEach((el, index) => {
        el.setAttribute('stroke', index ? colors.secondary : colors.primary);
        el.setAttribute('opacity', sleepy ? 0.12 : cross ? 0.30 : 0.22 + packet.focus * 0.09);
        el.setAttribute('stroke-width', cross ? 1.55 : 1.0);
        el.setAttribute('transform', `translate(160 205) rotate(${(index ? -1 : 1) * t * 8 * state.orbit})`);
      });
      this.refs.motes.forEach((moteEl, index) => {
        const mote = this.motes[index];
        const dir = cross && index % 2 ? -1 : 1;
        const speed = state.orbit * (focused ? 1.72 : 1.0) * dir;
        const angle = mote.phase + t * speed + reorder * Math.sin(index) * 1.5;
        let rx = cross ? 88 : 94 + Math.sin(index) * 7;
        let ry = cross ? 38 + (index % 2) * 7 : sleepy ? 66 : 82;
        if (focused) { rx += 12 * Math.sin(t * 1.7 + index); ry -= 8; }
        const bunch = cross ? Math.pow(Math.max(0, Math.sin(t * 0.55 + index * 0.2)), 8) * 0.45 : 0;
        const x = 160 + Math.cos(angle + bunch) * rx;
        const y = 205 + Math.sin(angle * (cross ? 1.32 : 1)) * ry + (sleepy ? Math.sin(t * 0.22 + index) * 5 : 0);
        const pulse = 0.65 + 0.35 * Math.sin(t * (1.1 + mote.wobble) + index);
        const frontSide = Math.sin(angle) > -0.05;
        const parent = frontSide ? front : back;
        if (moteEl.parentNode !== parent) parent.appendChild(moteEl);
        const active = focused || index % 4 === 0 || (cross && index % 3 === 0);
        moteEl.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(0.85 + pulse * 0.25 + packet.energy * 0.16).toFixed(3)})`);
        moteEl.querySelector('circle').setAttribute('fill', cross ? colors.danger : active ? colors.accent : colors.primary);
        moteEl.querySelector('circle').setAttribute('opacity', sleepy ? 0.28 : active ? 0.86 : 0.54);
        const text = moteEl.querySelector('text');
        text.setAttribute('fill', active ? colors.text : colors.secondary);
        text.setAttribute('opacity', sleepy ? 0.24 : active ? 0.84 : 0.38);
      });
    }

    updateMeters(packet, colors) {
      const values = [packet.energy, packet.focus, packet.impatience];
      this.refs.meterArcs.forEach((arc, index) => {
        arc.setAttribute('stroke', index === 2 ? colors.danger : index === 1 ? colors.primary : colors.secondary);
        arc.setAttribute('stroke-dasharray', `${Math.max(1, values[index] * 56)} 56`);
      });
    }

    updateAmbient(state, packet, colors, t) {
      this.refs.ambientLines.forEach((path, index) => {
        const y = 77 + index * 26;
        const amp = (state.name === 'thinking_focused' ? 10 : 5) + packet.focus * 9;
        let d = `M22 ${y}`;
        for (let x = 22; x <= 298; x += 23) {
          const yy = y + Math.sin(t * (0.4 + packet.energy) + x * 0.045 + index) * amp * 0.22 + Math.sin(t * 0.22 + index * 1.7 + x * 0.01) * amp * 0.24;
          d += ` L${x} ${yy.toFixed(1)}`;
        }
        path.setAttribute('d', d);
        path.setAttribute('stroke', index % 2 ? colors.secondary : colors.primary);
        path.setAttribute('opacity', state.name === 'night_sleepy' ? 0.08 : 0.12 + packet.focus * 0.08);
      });
    }

    updateSigh(colors, now) {
      const layer = this.refs.sighLayer;
      if (this.gesture.name !== 'dramatic_sigh') {
        layer.setAttribute('opacity', '0');
        return;
      }
      const raw = clamp((now - this.gesture.start) / this.gesture.duration, 0, 1);
      const radius = 42 + raw * 178;
      layer.setAttribute('opacity', String(Math.sin(raw * Math.PI) * 0.8));
      this.refs.sighCircle.setAttribute('cx', '160');
      this.refs.sighCircle.setAttribute('cy', '205');
      this.refs.sighCircle.setAttribute('r', radius.toFixed(1));
      this.refs.sighCircle.setAttribute('stroke', colors.danger);
    }

    updateStatusVisuals(state, packet, colors, t) {
      this.refs.stateDot.setAttribute('fill', state.name === 'blocked_annoyed' ? colors.danger : state.name === 'healthy_smug' ? colors.secondary : colors.primary);
      this.refs.stateDot.setAttribute('r', String(4.2 + Math.sin(t * (state.name === 'thinking_focused' ? 7 : 2)) * 0.7 + packet.energy * 1.1));
      this.refs.statusInner.setAttribute('fill', state.name === 'blocked_annoyed' ? colors.danger : colors.primary);
      this.refs.statusInner.setAttribute('opacity', state.name === 'night_sleepy' ? 0.035 : state.name === 'blocked_annoyed' ? 0.075 : 0.052);
      this.refs.caption.setAttribute('fill', state.name === 'blocked_annoyed' ? '#fff1f5' : colors.text);
      this.refs.caption.setAttribute('transform', `translate(0 ${state.captionY})`);
      this.refs.snippet.setAttribute('fill', state.name === 'blocked_annoyed' ? colors.accent : colors.muted);
      this.refs.footerTicks.forEach((tick, index) => {
        tick.setAttribute('fill', index % 3 === 0 ? colors.accent : colors.primary);
        tick.setAttribute('opacity', state.name === 'night_sleepy' ? 0.13 : 0.20 + Math.max(0, Math.sin(t * 2 + index)) * 0.28 * (0.3 + packet.energy));
      });
    }

    updateText() {
      if (!this.refs) return;
      const packet = this.target;
      this.refs.stateLabel.textContent = packet.mood.replace(/_/g, ' ').toUpperCase();
      this.refs.skinLabel.textContent = packet.skin;
      this.refs.caption.textContent = clampText(packet.caption?.text || 'Standing by with opinions.', 38);
      this.refs.snippet.textContent = clampText(packet.snippet?.text || 'local state graph · display safe', 46);
    }

    updateMoteGlyphs(packet) {
      if (!this.refs?.motes) return;
      const glyphs = packet.skinMeta?.glyphs || ['◇', '⌁', '◌', '✦'];
      this.refs.motes.forEach((moteEl, index) => {
        const text = moteEl.querySelector('text');
        if (text) text.textContent = glyphs[index % glyphs.length];
      });
    }

    buildAmbientLines() {
      for (let i = 0; i < 8; i++) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', i % 3 === 0 ? '1.2' : '0.55');
        path.setAttribute('stroke-linecap', 'round');
        this.refs.ambientGroup.appendChild(path);
      }
      this.refs.ambientLines = Array.from(this.refs.ambientGroup.querySelectorAll('path'));
    }

    buildMotes() {
      const glyphs = this.packet.skinMeta?.glyphs || ['◇', '⌁', '◌', '✦'];
      this.refs.orbitEllipses = [];
      [['94', '82', '0'], ['70', '106', '68']].forEach(([rx, ry, rot]) => {
        const ell = document.createElementNS(SVG_NS, 'ellipse');
        ell.setAttribute('cx', '0');
        ell.setAttribute('cy', '0');
        ell.setAttribute('rx', rx);
        ell.setAttribute('ry', ry);
        ell.setAttribute('fill', 'none');
        ell.setAttribute('stroke-width', '1');
        ell.setAttribute('transform', `translate(160 205) rotate(${rot})`);
        this.refs.orbitBack.appendChild(ell);
        this.refs.orbitEllipses.push(ell);
      });
      this.refs.motes = this.motes.map((mote, index) => {
        const group = document.createElementNS(SVG_NS, 'g');
        group.classList.add('mote');
        group.innerHTML = `<circle r="3.4"/><text y="-8" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="10" font-weight="800">${glyphs[index % glyphs.length]}</text>`;
        this.refs.orbitFront.appendChild(group);
        return group;
      });
    }

    buildMeters() {
      const labels = ['ENG', 'FOC', 'IMP'];
      this.refs.meterArcs = [];
      labels.forEach((label, index) => {
        const x = 54 + index * 42;
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('transform', `translate(${x} 436)`);
        group.innerHTML = `
          <circle r="10" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="3" />
          <circle class="meter-arc" r="10" fill="none" stroke="#65f3ff" stroke-width="3" stroke-linecap="round" pathLength="56" stroke-dasharray="1 56" transform="rotate(-90)" />
          <text y="22" text-anchor="middle" fill="#8aa2b2" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="7">${label}</text>
        `;
        this.refs.meters.appendChild(group);
        this.refs.meterArcs.push(group.querySelector('.meter-arc'));
      });
    }

    buildFooterTicks() {
      this.refs.footerTicks = [];
      for (let i = 0; i < 30; i++) {
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(17 + i * 9.8));
        rect.setAttribute('y', String(468 + (i % 2) * 2));
        rect.setAttribute('width', '4.4');
        rect.setAttribute('height', String(3 + (i % 4)));
        rect.setAttribute('rx', '2');
        this.refs.footerGroup.appendChild(rect);
        this.refs.footerTicks.push(rect);
      }
    }
  }

  function collectRefs(svg) {
    const sighCircle = document.createElementNS(SVG_NS, 'circle');
    sighCircle.setAttribute('fill', 'none');
    sighCircle.setAttribute('stroke-width', '2');
    sighCircle.setAttribute('opacity', '0.8');
    svg.querySelector('.sigh-layer').appendChild(sighCircle);
    return {
      character: svg.querySelector('.character'),
      body: svg.querySelector('.body'),
      bodyGlow: svg.querySelector('.body-glow'),
      bodyFacetA: svg.querySelector('.body-facet-a'),
      bodyFacetB: svg.querySelector('.body-facet-b'),
      eyes: Array.from(svg.querySelectorAll('.eye')),
      wings: Array.from(svg.querySelectorAll('.wing')),
      waveMouth: svg.querySelector('.wave-mouth'),
      runes: Array.from(svg.querySelectorAll('.inner-runes path')),
      scanBeam: svg.querySelector('.scan-beam'),
      orbitBack: svg.querySelector('.orbit-back'),
      orbitFront: svg.querySelector('.orbit-front'),
      ambientGroup: svg.querySelector('.ambient-lines'),
      sighLayer: svg.querySelector('.sigh-layer'),
      sighCircle,
      meters: svg.querySelector('.meters'),
      footerGroup: svg.querySelector('.footer-ticks'),
      stateDot: svg.querySelector('.state-dot'),
      stateLabel: svg.querySelector('.state-label'),
      skinLabel: svg.querySelector('.skin-label'),
      statusInner: svg.querySelector('.status-inner'),
      caption: svg.querySelector('.caption'),
      snippet: svg.querySelector('.snippet')
    };
  }

  function makeMotes(count) {
    return Array.from({ length: count }, (_, index) => ({
      phase: (Math.PI * 2 * index) / count,
      wobble: 0.6 + seededNoise(index * 337) * 1.4
    }));
  }

  function resolveColors(svg, pal, packet) {
    const colors = {
      primary: pal.primary || '#65f3ff',
      secondary: pal.secondary || '#2ad6a3',
      accent: packet.mood === 'blocked_annoyed' ? (pal.danger || '#ff4d7a') : (pal.accent || '#b899ff'),
      danger: pal.danger || '#ff4d7a',
      eye: packet.mood === 'blocked_annoyed' ? (pal.danger || '#ff4d7a') : (pal.primary || '#65f3ff'),
      text: '#e8f7ff',
      muted: '#8aa2b2'
    };
    svg.querySelector('.bg').setAttribute('fill', pal.background || '#070a12');
    svg.querySelector('.core-stop-1').setAttribute('stop-color', blendHex(pal.primary || '#65f3ff', '#05070d', 0.78));
    svg.querySelector('.core-stop-2').setAttribute('stop-color', blendHex(pal.secondary || '#2ad6a3', '#05070d', 0.90));
    svg.querySelector('.core-stop-3').setAttribute('stop-color', '#05070d');
    return colors;
  }

  function chooseGaze(state, t, packet) {
    if (state.gaze === 'side_eye') return { x: -9 + Math.sin(t * 0.7) * 1.5, y: 1.8 };
    if (state.gaze === 'scan') return { x: Math.sin(t * 2.1) * 9, y: Math.cos(t * 1.4) * 2.5 };
    if (state.gaze === 'sleepy') return { x: Math.sin(t * 0.25) * 2, y: 2.4 };
    if (state.gaze === 'smug') return { x: 2.5 + Math.sin(t * 0.6) * 3, y: -1.2 };
    return { x: Math.sin(t * 0.8 + packet.curiosity) * 7, y: Math.cos(t * 0.47) * 2.6 };
  }

  function gazeCadence(state) {
    if (state.gaze === 'side_eye') return 1450;
    if (state.gaze === 'scan') return 520;
    if (state.gaze === 'sleepy') return 3600;
    return 1300;
  }

  function postureTilt(state, packet, t) {
    if (state.posture === 'slump') return 6 + Math.sin(t * 0.7) * 1.2;
    if (state.posture === 'forward') return -2 + Math.sin(t * 0.9) * 1.0;
    if (state.posture === 'proud') return -4 + Math.sin(t * 0.45) * 0.8;
    if (state.posture === 'sleepy') return Math.sin(t * 0.18) * 3;
    const base = packet.posture?.tilt === 'left_small' ? -3 : packet.posture?.tilt === 'right_small' ? 4 : 0;
    return base + Math.sin(t * 0.41) * 1.2;
  }

  function blinkAmount(now, start, duration) {
    const x = (now - start) / duration;
    if (x < 0 || x > 1) return 0;
    return Math.sin(x * Math.PI);
  }

  function scanOpacity(gesture, now, t, state) {
    const base = state.name === 'thinking_focused' ? 0.28 + Math.max(0, Math.sin(t * 10)) * 0.34 : 0.08;
    if (gesture.name === 'scan_sweep') return base + Math.sin(clamp((now - gesture.start) / gesture.duration, 0, 1) * Math.PI) * 0.52;
    return base;
  }

  function mixPackets(a, b, t) {
    const mixed = window.HermesDisplayState.clone(b);
    for (const key of ['playfulness', 'energy', 'focus', 'curiosity', 'impatience']) {
      mixed[key] = Number(a[key] || 0) + (Number(b[key] || 0) - Number(a[key] || 0)) * t;
    }
    mixed.palette = { ...b.palette };
    mixed.palette.brightness = Number(a.palette?.brightness || b.palette.brightness) + (Number(b.palette?.brightness || 0.7) - Number(a.palette?.brightness || 0.7)) * t;
    return mixed;
  }

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function seededNoise(value) {
    return fract(Math.sin(Number(value) * 12.9898 + 78.233) * 43758.5453);
  }

  function fract(value) {
    return value - Math.floor(value);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
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

  window.HermesCharacterSvgRenderer = HermesCharacterSvgRenderer;
})();
