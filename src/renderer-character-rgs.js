(() => {
  const WIDTH = 320;
  const HEIGHT = 480;
  const TAU = Math.PI * 2;
  const ASSET_ROOT = './assets/rgs-hermes/';
  const MANIFEST_URL = `${ASSET_ROOT}manifest.json`;

  // Where the character sits inside the 320x480 panel. Center is raised and
  // draw box shrunk so the full face (including mouth) clears the status band
  // at y=354 while the head top stays below the top bar at y=52.
  const CHARACTER_CENTER_X = 160;
  const CHARACTER_CENTER_Y = 195;
  // Character draw box height target. PNGs are 341x400 native, scaled to fit.
  const CHARACTER_DRAW_HEIGHT = 282;

  // Per-mood frame loop + expression overlay choice. Eye/mouth picks follow
  // docs/rgs-expression-inventory-and-curation.md: safe = eyes1/eyes2 and
  // mouth1/mouth2/mouth4, with eyes5/eyes6/mouth3 reserved for sleepy or
  // thinking caution states. Toothy/zombie mouth variants and aggressive eye
  // variants from the source pack are not referenced anywhere.
  const STATE_GRAPH = {
    idle_watchful: {
      name: 'idle_watchful',
      baseState: 'idle',
      baseFps: 6,
      eyes: 'eyes1',
      mouth: 'mouth4',
      blinkMs: [3200, 7600],
      gaze: 'wander',
      breath: 0.55,
      orbit: 0.42,
      posture: 'float',
      gesture: 'orbit_reorder',
      gestureState: null,
      tint: 0.08,
      nudgePool: ['peek', 'perk', 'squint']
    },
    thinking_focused: {
      name: 'thinking_focused',
      baseState: 'idle',
      baseFps: 9,
      eyes: 'eyes6',
      mouth: 'mouth3',
      blinkMs: [1400, 3300],
      gaze: 'scan',
      breath: 0.82,
      orbit: 1.12,
      posture: 'forward',
      gesture: 'scan_sweep',
      gestureState: null,
      tint: 0.14,
      nudgePool: ['perk', 'peek', 'squint']
    },
    healthy_smug: {
      name: 'healthy_smug',
      baseState: 'idle',
      baseFps: 5,
      eyes: 'eyes1',
      mouth: 'mouth2',
      blinkMs: [3600, 8200],
      gaze: 'smug',
      breath: 0.45,
      orbit: 0.36,
      posture: 'proud',
      gesture: 'smug_nod',
      // Transform-only nod. No jumpEnd swap — that pose reads crushed at 320x480.
      gestureState: null,
      gestureFps: 6,
      tint: 0.05,
      nudgePool: ['peek', 'perk']
    },
    blocked_annoyed: {
      name: 'blocked_annoyed',
      baseState: 'idle',
      baseFps: 6,
      // Posture, side-eye offset, and orbit bunching carry the annoyance.
      // No aggressive eye assets per curation doc.
      eyes: 'eyes1',
      mouth: 'mouth1',
      blinkMs: [900, 2400],
      gaze: 'side_eye',
      breath: 0.36,
      orbit: 0.22,
      posture: 'slump',
      gesture: 'foot_tap',
      gestureState: 'walk',
      gestureFps: 12,
      tint: 0.18,
      nudgePool: ['shuffle', 'squint', 'peek']
    },
    night_sleepy: {
      name: 'night_sleepy',
      baseState: 'idle',
      baseFps: 3,
      eyes: 'eyes5',
      mouth: 'mouth1', // no teeth, no zombie mouth
      blinkMs: [4200, 10500],
      gaze: 'sleepy',
      breath: 0.18,
      orbit: 0.16,
      posture: 'sleepy',
      gesture: 'sleepy_droop',
      // Stay on the idle loop; the sleepy droop is carried by transform alone
      // because the `fall` action read as distressed when previewed at scale.
      gestureState: null,
      gestureFps: 4,
      tint: 0.02,
      nudgePool: ['sleep_drift', 'peek']
    }
  };

  // Random-nudge catalogue. Each nudge produces a whole-character transform
  // and optionally swaps to a different body action state for 1-2 seconds so
  // the silhouette visibly changes (see random-nudge acceptance criteria in
  // docs/rgs-expression-inventory-and-curation.md).
  const NUDGES = {
    peek: {
      label: 'peek sideways',
      duration: 900,
      bodyState: null,
      bodyFps: 6,
      transform: { x: 8, y: -2, tilt: -3, scale: 0.0, eyeShiftX: 4, eyeShiftY: 0 }
    },
    perk: {
      label: 'perk-up lift',
      duration: 1000,
      bodyState: 'jumpStart',
      bodyFps: 4,
      transform: { x: 0, y: -10, tilt: 0, scale: 0.05, eyeShiftX: 0, eyeShiftY: -1 }
    },
    shuffle: {
      label: 'frustrated shuffle',
      duration: 1300,
      bodyState: 'walk',
      bodyFps: 10,
      transform: { x: -7, y: 0, tilt: 5, scale: 0.0, eyeShiftX: -3, eyeShiftY: 0 }
    },
    squint: {
      label: 'squint + tilt',
      duration: 850,
      bodyState: null,
      bodyFps: 6,
      transform: { x: 0, y: 0, tilt: 6, scale: -0.03, eyeShiftX: 0, eyeShiftY: 0, squint: 0.85 }
    },
    sleep_drift: {
      label: 'sleepy drift',
      duration: 1800,
      bodyState: null,
      bodyFps: 4,
      transform: { x: 0, y: 9, tilt: -2, scale: -0.02, eyeShiftX: 0, eyeShiftY: 2, squint: 0.5 }
    }
  };

  class HermesCharacterRgsRenderer {
    constructor(rootId, initialPacket) {
      this.root = document.getElementById(rootId);
      this.packet = window.HermesDisplayState.normalizePersonaPacket(initialPacket);
      this.target = this.packet;
      this.previous = this.packet;
      this.transitionStart = performance.now();
      this.transitionMs = 700;
      this.transition = 1;
      this.seed = 41719;
      this.motes = makeMotes(16);
      this.nextBlinkAt = 0;
      this.blinkStart = -10000;
      this.blinkDuration = 145;
      this.nextGestureAt = 0;
      this.gesture = { name: 'none', start: 0, duration: 0 };
      this.gazeTarget = { x: 0, y: 0 };
      this.gazeCurrent = { x: 0, y: 0 };
      this.lastGazeShift = 0;

      this.manifest = null;
      this.frames = {};
      this.loadStats = { total: 0, done: 0, failed: [] };
      this.loaded = false;

      this.mount();
      this.loadAssets();
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
      this.gesture = { name: 'state_flash', start: performance.now(), duration: 850 };
    }

    triggerNudge(requestedType) {
      const state = STATE_GRAPH[this.target.mood] || STATE_GRAPH.idle_watchful;
      const pool = state.nudgePool || ['peek'];
      const name = requestedType && NUDGES[requestedType]
        ? requestedType
        : pool[Math.floor(Math.random() * pool.length)];
      const def = NUDGES[name];
      this.gesture = {
        name: `nudge_${name}`,
        nudgeKind: name,
        start: performance.now(),
        duration: def.duration,
        bodyState: def.bodyState,
        bodyFps: def.bodyFps,
        transform: def.transform
      };
      return { name, label: def.label, duration: def.duration };
    }

    mount() {
      while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'RGS animated modular Hermes familiar runtime preview');
      canvas.className = 'character-runtime-rgs';
      this.root.appendChild(canvas);
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }

    async loadAssets() {
      try {
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
        this.manifest = await response.json();
      } catch (error) {
        this.loadStats.failed.push(`manifest: ${error.message}`);
        this.loaded = true;
        return;
      }

      const partEntries = Object.entries(this.manifest.parts);
      const pending = [];
      partEntries.forEach(([partName, def]) => {
        const stateMap = def.frames || {};
        this.frames[partName] = {};
        Object.entries(stateMap).forEach(([state, files]) => {
          this.frames[partName][state] = files.map(() => null);
          files.forEach((file, index) => {
            this.loadStats.total += 1;
            pending.push(this.loadImage(file).then((img) => {
              this.frames[partName][state][index] = img;
              this.loadStats.done += 1;
            }).catch((err) => {
              this.loadStats.failed.push(`${file}: ${err.message}`);
              this.loadStats.done += 1;
            }));
          });
        });
      });

      await Promise.all(pending);
      this.loaded = true;
    }

    loadImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image load failed'));
        img.src = ASSET_ROOT + file;
      });
    }

    frame(now) {
      this.updateTransition(now);
      const t = now / 1000;
      const packet = this.packet;
      const state = STATE_GRAPH[packet.mood] || STATE_GRAPH.idle_watchful;
      this.updateBlink(now, state);
      this.updateGesture(now, state);
      this.updateGaze(now, t, state, packet);
      this.draw(t, now, state, packet, packet.palette || {});
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
        this.blinkDuration = state.name === 'blocked_annoyed' ? 92 : state.name === 'night_sleepy' ? 240 : 145;
        this.scheduleBlink(now);
      }
    }

    updateGesture(now, state) {
      if (this.gesture.name !== 'none' && now - this.gesture.start < this.gesture.duration) return;
      if (!this.nextGestureAt) this.nextGestureAt = now + 3200;
      if (now < this.nextGestureAt) return;
      const id = state.gesture;
      let duration = 1400;
      if (id === 'foot_tap') duration = 1600;
      else if (id === 'smug_nod') duration = 1100;
      else if (id === 'sleepy_droop') duration = 2200;
      else if (id === 'scan_sweep') duration = 1100;
      else if (id === 'orbit_reorder') duration = 1400;
      this.gesture = { name: id, start: now, duration };
      if (id === 'foot_tap') this.nextGestureAt = now + 5800 + seededNoise(now) * 4200;
      else if (id === 'smug_nod') this.nextGestureAt = now + 9000 + seededNoise(now) * 10000;
      else if (id === 'sleepy_droop') this.nextGestureAt = now + 15000 + seededNoise(now) * 14000;
      else if (id === 'scan_sweep') this.nextGestureAt = now + 3500 + seededNoise(now) * 3500;
      else this.nextGestureAt = now + 8000 + seededNoise(now) * 14000;
    }

    updateGaze(now, t, state, packet) {
      if (now - this.lastGazeShift > gazeCadence(state)) {
        this.lastGazeShift = now;
        this.gazeTarget = chooseGaze(state, t, packet);
      }
      this.gazeCurrent.x += (this.gazeTarget.x - this.gazeCurrent.x) * 0.085;
      this.gazeCurrent.y += (this.gazeTarget.y - this.gazeCurrent.y) * 0.085;
    }

    activeBodyState(state, now) {
      // Random nudges can override the body action for a visible silhouette change.
      if (this.gesture.nudgeKind && this.gesture.bodyState) {
        return { name: this.gesture.bodyState, fps: this.gesture.bodyFps || 6, expression: 'idle' };
      }
      if (this.gesture.name === 'foot_tap' && state.gestureState) {
        return { name: state.gestureState, fps: state.gestureFps || 8, expression: 'idle' };
      }
      // smug_nod and sleepy_droop are now transform-only — no jumpEnd/fall swap.
      return { name: state.baseState, fps: state.baseFps, expression: 'idle' };
    }

    frameAt(partName, stateName, now, fps) {
      const seq = this.frames[partName]?.[stateName];
      if (!seq || seq.length === 0) return null;
      const i = Math.floor(now / 1000 * fps) % seq.length;
      return seq[i];
    }

    draw(t, now, state, packet, pal) {
      const ctx = this.ctx;
      const colors = resolveColors(pal, packet);
      const blink = blinkAmount(now, this.blinkStart, this.blinkDuration);
      const gestureAmount = this.gestureAmount(now);
      const transitionFlash = this.gesture.name === 'state_flash' ? gestureAmount : 0;
      const active = this.activeBodyState(state, now);

      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      drawBackground(ctx, colors, pal, packet, t);
      drawTopBar(ctx, state, packet, colors, t);
      drawAmbientLines(ctx, state, packet, colors, t);
      this.drawOrbits(ctx, state, packet, colors, t, now, false);
      this.drawCharacter(ctx, state, packet, colors, t, now, blink, transitionFlash, gestureAmount, active);
      this.drawOrbits(ctx, state, packet, colors, t, now, true);
      this.drawSigh(ctx, colors, now);
      drawStatusBand(ctx, state, packet, colors, t);
      drawFooterTicks(ctx, state, packet, colors, t);

      if (!this.loaded) drawLoading(ctx, this.loadStats);
      if (this.loadStats.failed.length) drawMissing(ctx, this.loadStats.failed);
    }

    drawCharacter(ctx, state, packet, colors, t, now, blink, transitionFlash, gestureAmount, active) {
      const breath = Math.sin(t * (1.1 + state.breath * 0.8)) * (4 + packet.energy * 6) * state.breath;
      const impatientTap = packet.mood === 'blocked_annoyed' ? Math.pow(Math.max(0, Math.sin(t * 2.85)), 16) * 4 : 0;
      const sleepyDrift = packet.mood === 'night_sleepy' ? Math.sin(t * 0.21) * 4 : 0;
      const baseTilt = postureTilt(state, packet, t);
      const wobbleX = Math.sin(t * 0.37) * (packet.mood === 'night_sleepy' ? 2.2 : 3.8);
      const wobbleY = breath * 0.45 + impatientTap + sleepyDrift;

      // Resolve gesture-driven character motion. Transform-only smug_nod and
      // sleepy_droop replace the old jumpEnd/fall body-frame swaps.
      const extras = this.gestureTransform(gestureAmount);

      const cx = CHARACTER_CENTER_X + wobbleX + extras.x;
      const cy = CHARACTER_CENTER_Y + wobbleY + extras.y;
      const tilt = baseTilt + extras.tilt;

      const refImg = this.firstAvailableImage();
      if (!refImg) return;
      const refW = refImg.naturalWidth || refImg.width;
      const refH = refImg.naturalHeight || refImg.height;
      const baseScale = CHARACTER_DRAW_HEIGHT / refH;
      const scale = baseScale * (1 + breath * 0.0025 + extras.scale) * (packet.posture?.scale || 1);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((tilt * Math.PI) / 180);
      ctx.scale(scale, scale);
      const offX = -refW / 2;
      const offY = -refH / 2;

      const glow = ctx.createRadialGradient(0, 18, 24, 0, 18, 150 + transitionFlash * 20);
      glow.addColorStop(0, hexToRgba(state.name === 'blocked_annoyed' ? colors.danger : colors.primary, state.name === 'night_sleepy' ? 0.10 : 0.20 + transitionFlash * 0.12));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 24, refW * 0.46 + transitionFlash * 18, refH * 0.42 + transitionFlash * 18, 0, 0, TAU);
      ctx.fill();

      const sleepy = state.name === 'night_sleepy';
      const blocked = state.name === 'blocked_annoyed';

      // Back-to-front body stack (drawn at canvas origin since all PNGs share layout).
      // Hands get extra cyan tint and reduced alpha so the source's dark mitten silhouette
      // does not dominate the face. See the hand limitation note in
      // docs/rgs-runtime-prototype.md.
      const bodyParts = ['body1', 'footR1', 'footL1', 'head1', 'handR1', 'handL1'];
      bodyParts.forEach((part) => {
        const img = this.frameAt(part, active.name, now, active.fps);
        if (!img) return;
        const isHand = part === 'handL1' || part === 'handR1';
        const isFoot = part === 'footL1' || part === 'footR1';
        let partAlpha = sleepy ? 0.78 : 1;
        let partTintAmount = sleepy ? 0.02 : state.tint;
        let partTintColor = colors.primary;
        if (isHand) {
          partAlpha *= sleepy ? 0.72 : 0.66;
          partTintAmount = sleepy ? 0.28 : 0.34;
          partTintColor = blocked ? colors.danger : colors.primary;
        } else if (isFoot) {
          partAlpha *= sleepy ? 0.82 : 0.86;
          partTintAmount = sleepy ? 0.10 : 0.18;
        }
        this.drawPartImage(ctx, img, offX, offY, refW, refH, {
          alpha: partAlpha,
          tintColor: partTintColor,
          tintAmount: partTintAmount
        });
      });

      const expressionState = this.expressionStateFor(state, active);
      const squint = extras.squint || 0;

      const eyeImg = this.frameAt(state.eyes, expressionState, now, active.fps);
      const eyeShiftX = this.gazeCurrent.x * 0.6 + (blocked ? -3 : 0) + extras.eyeShiftX;
      const eyeShiftY = this.gazeCurrent.y * 0.36 + (sleepy ? 3 : 0) + extras.eyeShiftY;
      if (eyeImg) this.drawPartImage(ctx, eyeImg, offX + eyeShiftX, offY + eyeShiftY, refW, refH, {
        scaleY: Math.max(0.10, (1 - blink * 0.94) * (1 - squint * 0.7)),
        alpha: sleepy ? 0.78 : 1,
        tintColor: blocked ? colors.danger : colors.primary,
        tintAmount: blocked ? 0.16 : sleepy ? 0.04 : state.tint * 0.5,
        anchorY: -refH * 0.08
      });

      const mouthImg = this.frameAt(state.mouth, expressionState, now, active.fps);
      // No yawn scaling — the staged mouths are safe shapes only; stretching them
      // distorts the face and previously revealed the banned tooth interior.
      if (mouthImg) this.drawPartImage(ctx, mouthImg, offX, offY, refW, refH, {
        scaleY: 1,
        alpha: sleepy ? 0.84 : 1,
        tintColor: blocked ? colors.danger : colors.secondary,
        tintAmount: blocked ? 0.10 : sleepy ? 0.02 : 0.04,
        anchorY: refH * 0.06
      });

      if (state.name === 'thinking_focused' || this.gesture.name === 'scan_sweep') {
        drawHeadScan(ctx, colors, t, this.gesture, now, refW, refH);
      }

      ctx.restore();
    }

    gestureTransform(gestureAmount) {
      const zero = { x: 0, y: 0, tilt: 0, scale: 0, eyeShiftX: 0, eyeShiftY: 0, squint: 0 };
      if (!this.gesture || this.gesture.name === 'none') return zero;
      const amount = gestureAmount;
      if (this.gesture.nudgeKind && this.gesture.transform) {
        const tr = this.gesture.transform;
        return {
          x: (tr.x || 0) * amount,
          y: (tr.y || 0) * amount,
          tilt: (tr.tilt || 0) * amount,
          scale: (tr.scale || 0) * amount,
          eyeShiftX: (tr.eyeShiftX || 0) * amount,
          eyeShiftY: (tr.eyeShiftY || 0) * amount,
          squint: (tr.squint || 0) * amount
        };
      }
      if (this.gesture.name === 'smug_nod') {
        return { ...zero, y: -6 * amount, tilt: -2 * amount, scale: 0.04 * amount };
      }
      if (this.gesture.name === 'sleepy_droop') {
        return { ...zero, y: 5 * amount, tilt: 2 * amount, scale: -0.02 * amount, squint: 0.45 * amount };
      }
      return zero;
    }

    expressionStateFor(state, active) {
      const have = (part, st) => this.frames[part]?.[st]?.length > 0;
      const desired = active.expression || 'idle';
      if (have(state.eyes, desired) && have(state.mouth, desired)) return desired;
      return 'idle';
    }

    drawPartImage(ctx, img, dx, dy, dw, dh, opts = {}) {
      const scaleX = opts.scaleX == null ? 1 : opts.scaleX;
      const scaleY = opts.scaleY == null ? 1 : opts.scaleY;
      const alpha = opts.alpha == null ? 1 : opts.alpha;
      const anchorX = opts.anchorX == null ? 0 : opts.anchorX;
      const anchorY = opts.anchorY == null ? 0 : opts.anchorY;
      ctx.save();
      if (scaleX !== 1 || scaleY !== 1) {
        ctx.translate(anchorX, anchorY);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-anchorX, -anchorY);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      const tint = opts.tintAmount || 0;
      if (tint > 0 && opts.tintColor) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = hexToRgba(opts.tintColor, tint);
        ctx.fillRect(dx, dy, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    firstAvailableImage() {
      const seq = this.frames.body1?.idle;
      if (seq) {
        for (const img of seq) if (img) return img;
      }
      for (const part of Object.values(this.frames)) {
        for (const list of Object.values(part)) {
          for (const img of list) if (img) return img;
        }
      }
      return null;
    }

    drawOrbits(ctx, state, packet, colors, t, now, frontPass) {
      const cross = state.name === 'blocked_annoyed';
      const sleepy = state.name === 'night_sleepy';
      const focused = state.name === 'thinking_focused';
      const reorder = this.gesture.name === 'orbit_reorder' ? this.gestureAmount(now) : 0;
      if (!frontPass) {
        ctx.save();
        ctx.translate(CHARACTER_CENTER_X, CHARACTER_CENTER_Y);
        [[100, 92, 0], [76, 116, 68]].forEach(([rx, ry, rot], index) => {
          ctx.save();
          ctx.rotate((rot * Math.PI) / 180 + (index ? -1 : 1) * t * 0.14 * state.orbit);
          ctx.strokeStyle = hexToRgba(index ? colors.secondary : colors.primary, sleepy ? 0.12 : cross ? 0.30 : 0.22 + packet.focus * 0.09);
          ctx.lineWidth = cross ? 1.55 : 1.0;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        });
        ctx.restore();
      }
      const glyphs = packet.skinMeta?.glyphs || ['◇', '⌁', '◌', '✦'];
      this.motes.forEach((mote, index) => {
        const dir = cross && index % 2 ? -1 : 1;
        const speed = state.orbit * (focused ? 1.72 : 1.0) * dir;
        const angle = mote.phase + t * speed + reorder * Math.sin(index) * 1.5;
        let rx = cross ? 96 : 104 + Math.sin(index) * 7;
        let ry = cross ? 44 + (index % 2) * 7 : sleepy ? 78 : 96;
        if (focused) { rx += 14 * Math.sin(t * 1.7 + index); ry -= 8; }
        const bunch = cross ? Math.pow(Math.max(0, Math.sin(t * 0.55 + index * 0.2)), 8) * 0.45 : 0;
        const x = CHARACTER_CENTER_X + Math.cos(angle + bunch) * rx;
        const y = CHARACTER_CENTER_Y + Math.sin(angle * (cross ? 1.32 : 1)) * ry + (sleepy ? Math.sin(t * 0.22 + index) * 5 : 0);
        const frontSide = Math.sin(angle) > -0.05;
        if (frontSide !== frontPass) return;
        const pulse = 0.65 + 0.35 * Math.sin(t * (1.1 + mote.wobble) + index);
        const activeMote = focused || index % 4 === 0 || (cross && index % 3 === 0);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(0.85 + pulse * 0.25 + packet.energy * 0.16, 0.85 + pulse * 0.25 + packet.energy * 0.16);
        ctx.fillStyle = hexToRgba(cross ? colors.danger : activeMote ? colors.accent : colors.primary, sleepy ? 0.28 : activeMote ? 0.86 : 0.54);
        ctx.beginPath();
        ctx.arc(0, 0, 3.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = hexToRgba(activeMote ? colors.text : colors.secondary, sleepy ? 0.24 : activeMote ? 0.84 : 0.38);
        ctx.font = '800 10px ui-monospace, Menlo, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(glyphs[index % glyphs.length], 0, -8);
        ctx.restore();
      });
    }

    drawSigh(ctx, colors, now) {
      if (this.gesture.name !== 'foot_tap') return;
      const raw = clamp((now - this.gesture.start) / this.gesture.duration, 0, 1);
      const radius = 48 + raw * 188;
      ctx.save();
      ctx.globalAlpha = Math.sin(raw * Math.PI) * 0.7;
      ctx.strokeStyle = colors.danger;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CHARACTER_CENTER_X, CHARACTER_CENTER_Y, radius, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    gestureAmount(now) {
      if (this.gesture.name === 'none') return 0;
      const raw = clamp((now - this.gesture.start) / this.gesture.duration, 0, 1);
      if (raw >= 1) return 0;
      return Math.sin(raw * Math.PI);
    }
  }

  function drawBackground(ctx, colors, pal, packet, t) {
    const bg = pal.background || '#070A12';
    const grad = ctx.createRadialGradient(160, 170, 20, 160, 190, 360);
    grad.addColorStop(0, blendHex(colors.primary, bg, 0.82));
    grad.addColorStop(0.55, blendHex(bg, '#07101b', 0.35));
    grad.addColorStop(1, '#03060b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let y = 7.5; y < HEIGHT; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
    const flash = Math.max(0, Math.sin(t * 0.7)) * 0.02 * packet.energy;
    ctx.fillStyle = hexToRgba(colors.primary, flash);
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawTopBar(ctx, state, packet, colors, t) {
    roundRect(ctx, 14, 16, 292, 36, 14, 'rgba(255,255,255,0.055)');
    ctx.fillStyle = state.name === 'blocked_annoyed' ? colors.danger : state.name === 'healthy_smug' ? colors.secondary : colors.primary;
    ctx.beginPath();
    ctx.arc(31, 34, 4.2 + Math.sin(t * (state.name === 'thinking_focused' ? 7 : 2)) * 0.7 + packet.energy * 1.1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d8f7ff';
    ctx.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(packet.mood.replace(/_/g, ' ').toUpperCase(), 43, 38);
    ctx.fillStyle = '#8aa2b2';
    ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(packet.skin, 291, 38);
  }

  function drawAmbientLines(ctx, state, packet, colors, t) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const y = 77 + i * 26;
      const amp = (state.name === 'thinking_focused' ? 10 : 5) + packet.focus * 9;
      ctx.beginPath();
      for (let x = 22; x <= 298; x += 23) {
        const yy = y + Math.sin(t * (0.4 + packet.energy) + x * 0.045 + i) * amp * 0.22 + Math.sin(t * 0.22 + i * 1.7 + x * 0.01) * amp * 0.24;
        if (x === 22) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = hexToRgba(i % 2 ? colors.secondary : colors.primary, state.name === 'night_sleepy' ? 0.08 : 0.12 + packet.focus * 0.08);
      ctx.lineWidth = i % 3 === 0 ? 1.2 : 0.55;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHeadScan(ctx, colors, t, gesture, now, refW, refH) {
    const raw = gesture.name === 'scan_sweep' ? clamp((now - gesture.start) / gesture.duration, 0, 1) : ((t * 0.25) % 1);
    const y = -refH * 0.30 + raw * (refH * 0.36);
    ctx.save();
    ctx.globalAlpha = gesture.name === 'scan_sweep' ? 0.42 + Math.sin(raw * Math.PI) * 0.35 : 0.18 + Math.max(0, Math.sin(t * 10)) * 0.22;
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-refW * 0.18, y);
    ctx.lineTo(refW * 0.18, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawStatusBand(ctx, state, packet, colors, t) {
    roundRect(ctx, 16, 354, 288, 106, 18, 'rgba(2,5,10,0.64)');
    roundRect(ctx, 18, 356, 284, 102, 16, hexToRgba(state.name === 'blocked_annoyed' ? colors.danger : colors.primary, state.name === 'night_sleepy' ? 0.035 : state.name === 'blocked_annoyed' ? 0.075 : 0.052));
    ctx.textAlign = 'center';
    ctx.fillStyle = state.name === 'blocked_annoyed' ? '#fff1f5' : colors.text;
    ctx.font = '800 14px Inter, system-ui, sans-serif';
    ctx.fillText(clampText(packet.caption?.text || 'Standing by with opinions.', 38), 160, 386);
    ctx.fillStyle = state.name === 'blocked_annoyed' ? colors.accent : colors.muted;
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText(clampText(packet.snippet?.text || 'local state graph · display safe', 46), 160, 416);
    const values = [packet.energy, packet.focus, packet.impatience];
    const labels = ['ENG', 'FOC', 'IMP'];
    values.forEach((value, index) => {
      const x = 54 + index * 42;
      const y = 436;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = index === 2 ? colors.danger : index === 1 ? colors.primary : colors.secondary;
      ctx.beginPath();
      ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(value, 0, 1));
      ctx.stroke();
      ctx.fillStyle = '#8aa2b2';
      ctx.font = '7px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillText(labels[index], x, y + 22);
    });
  }

  function drawFooterTicks(ctx, state, packet, colors, t) {
    for (let i = 0; i < 30; i++) {
      const fill = hexToRgba(i % 3 === 0 ? colors.accent : colors.primary, state.name === 'night_sleepy' ? 0.13 : 0.20 + Math.max(0, Math.sin(t * 2 + i)) * 0.28 * (0.3 + packet.energy));
      roundRect(ctx, 17 + i * 9.8, 468 + (i % 2) * 2, 4.4, 3 + (i % 4), 2, fill);
    }
  }

  function drawLoading(ctx, stats) {
    ctx.fillStyle = 'rgba(5, 7, 13, 0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#65f3ff';
    ctx.font = '700 12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    const pct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
    ctx.fillText(`loading RGS animation frames… ${pct}%`, 160, 238);
    ctx.font = '9px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = '#8aa2b2';
    ctx.fillText(`${stats.done}/${stats.total} PNGs`, 160, 258);
  }

  function drawMissing(ctx, missing) {
    roundRect(ctx, 24, 62, 272, 38, 10, 'rgba(255,77,122,0.18)');
    ctx.fillStyle = '#fff1f5';
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`missing RGS assets: ${missing.length}`, 160, 85);
  }

  function resolveColors(pal, packet) {
    return {
      primary: pal.primary || '#65f3ff',
      secondary: pal.secondary || '#2ad6a3',
      accent: packet.mood === 'blocked_annoyed' ? (pal.danger || '#ff4d7a') : (pal.accent || '#b899ff'),
      danger: pal.danger || '#ff4d7a',
      text: '#e8f7ff',
      muted: '#8aa2b2'
    };
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

  function makeMotes(count) {
    return Array.from({ length: count }, (_, index) => ({
      phase: (Math.PI * 2 * index) / count,
      wobble: 0.6 + seededNoise(index * 337) * 1.4
    }));
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

  function blinkAmount(now, start, duration) {
    const x = (now - start) / duration;
    if (x < 0 || x > 1) return 0;
    return Math.sin(x * Math.PI);
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

  function roundRect(ctx, x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  function hexToRgba(hex, alpha) {
    const [r, g, b] = parseHex(hex);
    return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
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

  window.HermesCharacterRgsRenderer = HermesCharacterRgsRenderer;
})();
