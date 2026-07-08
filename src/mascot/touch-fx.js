(() => {
  'use strict';

  const truthy = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
  const MAX_FX_NODES = 96;
  const MAX_CONSTELLATION_STARS = 12;
  const MOTE_COUNT = 18;
  const PARTY_COOLDOWN_MS = 4000;
  const TOUCH_ACTIVE_MS = 1800;
  const FX_THEMES = {
    idle_watch: 'calm',
    reasoning: 'thinking',
    planning: 'thinking',
    searching: 'scan',
    tool_shell: 'grid',
    writing: 'grid',
    waiting_user: 'warm',
    complete: 'celebrate',
    blocked: 'shield',
    critical: 'shield',
    degraded_offline: 'dim',
  };

  function readMode(getPacket) {
    const packet = getPacket?.() || {};
    return window.HermesBehaviorMachine?.modeFromPacket?.(packet, 'idle_watch')
      || packet.optic_state_packet?.mode
      || packet.puppet_state_packet?.mode
      || 'idle_watch';
  }

  function install(options = {}) {
    const params = new URLSearchParams(window.location.search);
    const kiosk = truthy(params.get('kiosk'));
    if (!kiosk) return null;
    const touchMode = (params.get('touch') || 'fun').toLowerCase();
    const allowMouseTouchTest = truthy(params.get('touchtest'));
    const debugFlag = truthy(params.get('debug'));
    const debugTouch = debugFlag && allowMouseTouchTest;
    if (touchMode === 'off') return null;
    if (touchMode === 'legacy' && debugFlag && !allowMouseTouchTest) return null;
    if (touchMode === 'legacy' && debugTouch) {
      const legacy = { mode: () => 'legacy-debug-placeholder', debugEnabled: () => true };
      window.HermesTouchFxController = legacy;
      return legacy;
    }

    const renderer = options.renderer || {};
    const getPacket = typeof options.getPacket === 'function' ? options.getPacket : () => ({});
    const getLiveStatus = typeof options.getLiveStatus === 'function' ? options.getLiveStatus : () => ({});
    const formatAge = typeof options.formatAge === 'function' ? options.formatAge : (ms) => `${Math.max(0, Math.round(ms / 1000))}s`;

    const fxLayer = document.createElement('div');
    fxLayer.className = 'touch-fx-layer';
    fxLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fxLayer);

    const feedBadge = document.createElement('div');
    feedBadge.className = 'feed-badge quiet';
    feedBadge.setAttribute('aria-live', 'polite');
    document.body.appendChild(feedBadge);

    document.body.style.touchAction = 'none';
    document.body.addEventListener('contextmenu', (event) => event.preventDefault());

    const activeTouches = new Map();
    const activeCharges = new Map();
    const constellation = [];
    const playMemory = { taps: 0, lastZones: [], stars: [], lastPartyAt: 0 };
    let lastPartyBurstAt = 0;
    let lastPinchAt = 0;
    let fxCount = 0;
    let disposed = false;
    let touchIdleTimer = 0;
    let statusInterval = 0;
    let cachedOpticRect = null;
    let cachedOpticRectAt = 0;
    let lastMoteAnchorKey = '';
    const moteNodes = [];

    function setClassName(el, value) {
      if (!el || el.className === value) return;
      el.className = value;
    }

    function setText(el, value) {
      if (!el) return;
      const next = String(value ?? '');
      if (el.textContent === next) return;
      el.textContent = next;
    }

    function setDataset(el, key, value) {
      if (!el?.dataset) return;
      const next = String(value);
      if (el.dataset[key] === next) return;
      el.dataset[key] = next;
    }

    function setStyleProperty(el, name, value) {
      if (!el) return;
      const next = String(value);
      const cache = el.__hermesTouchFxStyle || (el.__hermesTouchFxStyle = Object.create(null));
      if (cache[name] === next) return;
      cache[name] = next;
      el.style.setProperty(name, next);
    }

    function invalidateOpticRect() {
      cachedOpticRect = null;
      cachedOpticRectAt = 0;
      lastMoteAnchorKey = '';
    }

    function opticRect() {
      const now = performance.now();
      if (cachedOpticRect && now - cachedOpticRectAt < 120) return cachedOpticRect;
      cachedOpticRect = document.querySelector('.cb-radial-stage')?.getBoundingClientRect() || null;
      cachedOpticRectAt = now;
      return cachedOpticRect;
    }

    function opticCenter() {
      const optic = opticRect();
      return {
        cx: optic ? optic.left + optic.width / 2 : window.innerWidth / 2,
        cy: optic ? optic.top + optic.height / 2 : window.innerHeight / 2,
        radius: optic ? Math.min(optic.width, optic.height) / 2 : Math.min(window.innerWidth, window.innerHeight) / 2,
      };
    }

    function syncMoteAnchors(force = false) {
      const { cx, cy, radius } = opticCenter();
      const x = `${cx.toFixed(1)}px`;
      const y = `${cy.toFixed(1)}px`;
      const maxOrbit = Math.max(96, Math.min(340, radius * 0.64));
      const maxOrbitPx = `${maxOrbit.toFixed(1)}px`;
      const key = `${x}|${y}|${maxOrbitPx}|${moteNodes.length}`;
      if (!force && key === lastMoteAnchorKey) return;
      lastMoteAnchorKey = key;
      moteNodes.forEach((mote) => {
        setStyleProperty(mote, '--x', x);
        setStyleProperty(mote, '--y', y);
        const current = Number(mote.__hermesTouchFxOrbitRadius);
        if (!Number.isFinite(current) || current > maxOrbit) {
          mote.__hermesTouchFxOrbitRadius = maxOrbit;
          setStyleProperty(mote, '--orbit-radius', maxOrbitPx);
        }
      });
    }

    const acceptsPointer = (event) => event.pointerType !== 'mouse' || allowMouseTouchTest;
    const isReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    function entertainmentBudget(frameCadence = window.__hermesFrameCadence || {}) {
      const packet = getPacket?.() || {};
      const sys = packet.live?.system || {};
      const cpu = Number(sys.cpu ?? sys.cpu_load ?? 0);
      const normalizedCpu = Number.isFinite(cpu) ? (cpu > 1 ? cpu / 100 : cpu) : 0;
      const temp = Number(sys.cpu_temp_c ?? sys.temp_c ?? sys.package_temp_c ?? 0);
      const p95 = Number(frameCadence.p95Ms || 0);
      if (normalizedCpu > 0.90 || temp > 78 || p95 > 34) return 'low';
      if (normalizedCpu > 0.70 || temp > 72 || p95 > 25) return 'medium';
      return 'high';
    }
    const profile = () => {
      if (isReducedMotion()) return { budget: 'low', sparks: 4, trails: false, comets: false, fireflies: false, vortex: false, impact: 0.55, scale: 1.4, ttl: 700, motes: 0, stars: 4 };
      const budget = entertainmentBudget();
      if (budget === 'low') return { budget, sparks: 5, trails: true, comets: false, fireflies: false, vortex: false, impact: 0.46, scale: 2.1, ttl: 1100, motes: 4, stars: 6 };
      if (budget === 'medium') return { budget, sparks: 10, trails: true, comets: true, fireflies: false, vortex: false, impact: 0.62, scale: 4.0, ttl: 1700, motes: 10, stars: 14 };
      return { budget, sparks: 16, trails: true, comets: true, fireflies: true, vortex: true, impact: 0.75, scale: 6.8, ttl: 2400, motes: MOTE_COUNT, stars: 28 };
    };

    function updateTheme() {
      const mode = readMode(getPacket);
      setDataset(fxLayer, 'fxTheme', FX_THEMES[mode] || 'calm');
      setDataset(fxLayer, 'behaviorMode', mode);
      return mode;
    }

    function setTouchFxIdle() {
      if (disposed) return;
      window.clearTimeout(touchIdleTimer);
      touchIdleTimer = 0;
      setDataset(fxLayer, 'touchFxState', 'idle');
      setDataset(document.body, 'touchFxState', 'idle');
      moteNodes.forEach((mote) => mote.classList.remove('attracted'));
    }

    function setTouchFxActive(duration = TOUCH_ACTIVE_MS) {
      if (disposed) return;
      setDataset(fxLayer, 'touchFxState', 'active');
      setDataset(document.body, 'touchFxState', 'active');
      window.clearTimeout(touchIdleTimer);
      touchIdleTimer = window.setTimeout(setTouchFxIdle, duration);
    }

    function updateFeedBadge() {
      const currentPacket = getPacket() || {};
      const liveStatus = getLiveStatus() || {};
      const freshness = currentPacket.live?.freshness || {};
      const tier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : freshness.tier;
      if (!tier || tier === 'fresh') {
        setClassName(feedBadge, 'feed-badge quiet');
        setText(feedBadge, '');
        return;
      }
      const label = tier === 'aging' ? 'FEED AGING' : tier === 'lost' ? 'FEED LOST' : 'FEED STALE';
      const age = liveStatus.failures
        ? liveStatus.staleSince ? formatAge(Date.now() - liveStatus.staleSince) : 'now'
        : currentPacket.live?.freshness?.stale_measurements?.length ? `${currentPacket.live.freshness.stale_measurements.length} sensors` : 'telemetry';
      setText(feedBadge, `${label} · ${age}`);
      setClassName(feedBadge, `feed-badge ${tier === 'lost' ? 'critical' : 'watch'}`);
    }

    function addFxNode(node, ttlMs = 900) {
      fxLayer.appendChild(node);
      fxCount += 1;
      trimFxLayer();
      if (ttlMs > 0) {
        window.setTimeout(() => {
          if (node.parentNode) {
            node.remove();
            fxCount = Math.max(0, fxCount - 1);
          }
        }, isReducedMotion() ? Math.min(ttlMs, profile().ttl) : ttlMs);
      }
      return node;
    }

    function trimFxLayer() {
      while (fxLayer.childElementCount > MAX_FX_NODES) {
        fxLayer.firstElementChild?.remove();
        fxCount = Math.max(0, fxCount - 1);
      }
    }

    function classifyTouchFx(event) {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const x = event.clientX / w;
      const y = event.clientY / h;
      if (y < 0.18) return 'sky';
      if (y > 0.82) return 'floor';
      if (x < 0.22) return 'left';
      if (x > 0.78) return 'right';
      const dx = x - 0.5;
      const dy = y - 0.5;
      if ((dx * dx + dy * dy) < 0.11) return 'boop';
      return 'field';
    }

    function intensityFromPointer(event, moved = false) {
      const pressure = Number.isFinite(event.pressure) ? Number(event.pressure) : 0;
      const contactArea = Math.max(0, Number(event.width || 0) * Number(event.height || 0));
      const areaIntensity = Math.min(1, contactArea / 900);
      const base = Math.max(pressure, areaIntensity, moved ? 0.28 : 0.55);
      return Math.max(0.15, Math.min(1, base));
    }

    function touchVectorFromOptic(x, y) {
      const optic = opticRect();
      const cx = optic ? optic.left + optic.width / 2 : window.innerWidth / 2;
      const cy = optic ? optic.top + optic.height / 2 : window.innerHeight / 2;
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      document.documentElement.style.setProperty('--touch-angle', `${angle}rad`);
      document.documentElement.style.setProperty('--touch-distance', `${Math.min(distance, 700)}px`);
      document.documentElement.style.setProperty('--touch-x', `${x}px`);
      document.documentElement.style.setProperty('--touch-y', `${y}px`);
      return { dx, dy, distance, angle, cx, cy };
    }

    function positionedFx(className, x, y, size = null) {
      const node = document.createElement('span');
      node.className = className;
      setStyleProperty(node, '--x', `${x}px`);
      setStyleProperty(node, '--y', `${y}px`);
      if (size != null) {
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
      }
      return node;
    }

    function spawnRipple(x, y, kind = 'normal') {
      const reduced = isReducedMotion();
      const size = kind === 'twin' ? 86 : kind === 'boop' ? 120 : 74;
      const ripple = positionedFx(`touch-fx-ripple ${kind}`, x, y, reduced ? Math.min(size, 76) : size);
      addFxNode(ripple, reduced ? 700 : 2600);
    }

    function spawnResonanceWave(x, y, vector = touchVectorFromOptic(x, y)) {
      const wave = positionedFx('touch-fx-resonance', x, y, Math.max(70, Math.min(320, vector.distance || 120)));
      wave.style.setProperty('--angle', `${vector.angle || 0}rad`);
      wave.style.setProperty('--travel', `${Math.min(vector.distance || 160, 700)}px`);
      addFxNode(wave, isReducedMotion() ? 700 : 1800);
    }

    function spawnImpactFlash(x, y, zone = 'field', intensity = 0.7) {
      const vector = touchVectorFromOptic(x, y);
      const p = profile();
      const flash = positionedFx(`touch-fx-impact ${zone}`, x, y, Math.max(150, Math.min(p.budget === 'low' ? 360 : 560, (vector.distance || 180) * 0.48 + 190)));
      flash.style.setProperty('--impact-angle', `${vector.angle || 0}rad`);
      flash.style.setProperty('--impact-gain', String(Math.max(0.40, Math.min(p.impact, intensity || 0.62))));
      addFxNode(flash, isReducedMotion() ? 520 : 900);
    }

    function spawnHaloPop(x, y) {
      const halo = positionedFx('touch-fx-orbit halo-pop', x, y, isReducedMotion() ? 96 : 142);
      addFxNode(halo, isReducedMotion() ? 700 : 3200);
    }

    function spawnSparkBurst(x, y, options = {}) {
      const p = profile();
      const count = Math.min(options.count || p.sparks, p.sparks);
      const spread = isReducedMotion() ? Math.min(options.spread || 82, 28) : (options.spread || 82);
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i / count) + Math.random() * 0.42;
        const distance = spread * (0.45 + Math.random() * 0.75);
        const spark = positionedFx('touch-fx-spark', x, y, options.size || 7);
        spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        spark.style.setProperty('--hue', `${170 + Math.round(Math.random() * 80)}deg`);
        addFxNode(spark, isReducedMotion() ? 650 : 2400);
      }
    }

    function spawnComet(fromSide, y) {
      if (!profile().comets) {
        spawnRipple(fromSide === 'left' ? 96 : window.innerWidth - 96, y, 'normal');
        return;
      }
      const comet = positionedFx(`touch-fx-comet ${fromSide === 'left' ? 'from-left' : 'from-right'}`, fromSide === 'left' ? -28 : window.innerWidth + 28, y, null);
      comet.style.setProperty('--arc', `${Math.round((Math.random() - 0.5) * 90)}px`);
      addFxNode(comet, 2600);
      spawnSparkBurst(fromSide === 'left' ? 96 : window.innerWidth - 96, y, { count: 7, spread: 46, size: 5 });
    }

    function spawnStarShower(x, y) {
      const p = profile();
      for (let i = 0; i < p.stars; i += 1) {
        const star = positionedFx('touch-fx-spark star', x + ((Math.random() - 0.5) * (isReducedMotion() ? 120 : 360)), Math.min(y, 120) - Math.random() * 90, 6 + Math.random() * 5);
        star.style.setProperty('--dx', `${(Math.random() - 0.5) * (isReducedMotion() ? 30 : 110)}px`);
        star.style.setProperty('--dy', `${isReducedMotion() ? 22 : 160 + Math.random() * 270}px`);
        addFxNode(star, isReducedMotion() ? 700 : 3600);
      }
    }

    function spawnGroundWave(x, y) {
      const wave = positionedFx('touch-fx-orbit ground-wave', x, Math.min(window.innerHeight - 28, y), 92);
      addFxNode(wave, isReducedMotion() ? 700 : 3200);
      if (!profile().fireflies) return;
      for (let i = 0; i < 16; i += 1) {
        const firefly = positionedFx('touch-fx-firefly', x + ((Math.random() - 0.5) * 260), window.innerHeight - 36, 6);
        firefly.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
        firefly.style.setProperty('--dy', `${-(50 + Math.random() * 130)}px`);
        addFxNode(firefly, 4200);
      }
    }

    function spawnTrailPoint(x, y, pointerId) {
      if (!profile().trails) return;
      const trail = positionedFx('touch-fx-trail', x, y, 18);
      trail.dataset.pointerId = String(pointerId);
      addFxNode(trail, 1400);
      stirMotes(x, y, 0.6);
    }

    function spawnChargeOrb(x, y, pointerId) {
      const state = activeTouches.get(pointerId);
      if (!state || state.moved || state.longPressEmitted || activeCharges.has(pointerId)) return;
      state.longPressEmitted = true;
      const charge = positionedFx('touch-fx-charge', x, y, 66);
      activeCharges.set(pointerId, charge);
      addFxNode(charge, isReducedMotion() ? 900 : 8000);
      renderer.pulseGaze?.('forward_focus', 900);
      renderer.triggerIntent?.('brow_pop');
      emitGesture('long_press', { zone: state.zone, x, y, pointerCount: activeTouches.size || 1, durationMs: performance.now() - state.startedAt });
    }

    function releaseChargeOrb(pointerId, fallbackX, fallbackY) {
      const charge = activeCharges.get(pointerId);
      activeCharges.delete(pointerId);
      if (!charge) return false;
      const state = activeTouches.get(pointerId);
      const x = state?.x || fallbackX;
      const y = state?.y || fallbackY;
      charge.classList.add('release');
      window.setTimeout(() => charge.remove(), 160);
      spawnRipple(x, y, 'charged');
      spawnSparkBurst(x, y, { count: 22, spread: 132, size: 8 });
      spawnConstellationStar(x, y);
      return true;
    }

    function spawnConstellationStar(x, y) {
      const vector = touchVectorFromOptic(x, y);
      const slot = constellation.length % MAX_CONSTELLATION_STARS;
      const radius = Math.min(340, Math.max(150, vector.distance * 0.55 + 130));
      const angle = vector.angle + (Math.random() - 0.5) * 0.35;
      const starX = vector.cx + Math.cos(angle) * radius;
      const starY = vector.cy + Math.sin(angle) * radius;
      const star = positionedFx('touch-fx-constellation-star', x, y, 10);
      star.style.setProperty('--tx', `${starX - x}px`);
      star.style.setProperty('--ty', `${starY - y}px`);
      star.dataset.slot = String(slot);
      addFxNode(star, isReducedMotion() ? 1200 : 24000 + Math.random() * 16000);
      constellation.push({ x: starX, y: starY, node: star, bornAt: performance.now() });
      playMemory.stars = constellation.slice(-MAX_CONSTELLATION_STARS);
      while (constellation.length > MAX_CONSTELLATION_STARS) constellation.shift()?.node?.remove();
      linkConstellation();
    }

    function linkConstellation() {
      if (isReducedMotion() || constellation.length < 2) return;
      const a = constellation[constellation.length - 2];
      const b = constellation[constellation.length - 1];
      const line = positionedFx('touch-fx-constellation-line', a.x, a.y, null);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      line.style.width = `${Math.hypot(dx, dy)}px`;
      line.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
      addFxNode(line, 9000);
    }

    function spawnTwinRipples(points) {
      points.slice(0, 2).forEach((point) => spawnRipple(point.x, point.y, 'twin'));
      if (points.length >= 2) {
        const cx = (points[0].x + points[1].x) / 2;
        const cy = (points[0].y + points[1].y) / 2;
        const orbit = positionedFx('touch-fx-orbit twin-orbit', cx, cy, Math.max(110, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) + 62));
        addFxNode(orbit, isReducedMotion() ? 700 : 3600);
        if (profile().vortex) spawnVortex(cx, cy, Math.max(120, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)));
        splitMotes(points[0], points[1]);
      }
    }

    function spawnVortex(x, y, size = 180) {
      const vortex = positionedFx('touch-fx-vortex', x, y, size);
      addFxNode(vortex, 4200);
    }

    function spawnPartyBurst(x, y) {
      const now = performance.now();
      if (now - lastPartyBurstAt < PARTY_COOLDOWN_MS) return;
      lastPartyBurstAt = now;
      playMemory.lastPartyAt = now;
      spawnRipple(x, y, 'party');
      spawnHaloPop(x, y);
      spawnSparkBurst(x, y, { count: isReducedMotion() ? 8 : 42, spread: 230, size: 10 });
      stirMotes(x, y, 1);
      renderer.pulseGaze?.('forward_focus', 1150);
      renderer.triggerIntent?.('smug_nod') || renderer.triggerIntent?.('tiny_perk');
    }

    function createMotes() {
      const optic = opticCenter();
      const count = profile().motes;
      for (let i = 0; i < count; i += 1) {
        const mote = positionedFx('touch-fx-mote', optic.cx, optic.cy, 5 + Math.random() * 4);
        const orbitRadius = 130 + Math.random() * Math.min(210, optic.radius * 0.38);
        mote.__hermesTouchFxOrbitRadius = orbitRadius;
        setStyleProperty(mote, '--orbit-angle', `${(Math.PI * 2 * i) / count}rad`);
        setStyleProperty(mote, '--orbit-radius', `${orbitRadius}px`);
        setStyleProperty(mote, '--orbit-duration', `${18 + Math.random() * 16}s`);
        moteNodes.push(mote);
        addFxNode(mote, 0);
      }
      syncMoteAnchors(true);
      window.requestAnimationFrame(() => syncMoteAnchors(true));
      window.setTimeout(() => syncMoteAnchors(true), 160);
    }

    function stirMotes(x, y, intensity = 0.6) {
      const motes = Array.from(fxLayer.querySelectorAll('.touch-fx-mote'));
      motes.forEach((mote, idx) => {
        mote.style.setProperty('--attract-x', `${x}px`);
        mote.style.setProperty('--attract-y', `${y}px`);
        mote.style.setProperty('--mote-pull', String(Math.min(1, intensity + (idx % 3) * 0.08)));
        mote.classList.add('attracted');
        window.setTimeout(() => mote.classList.remove('attracted'), 900 + idx * 22);
      });
    }

    function splitMotes(a, b) {
      const motes = Array.from(fxLayer.querySelectorAll('.touch-fx-mote'));
      motes.forEach((mote, idx) => {
        const target = idx % 2 ? a : b;
        mote.style.setProperty('--attract-x', `${target.x}px`);
        mote.style.setProperty('--attract-y', `${target.y}px`);
        mote.style.setProperty('--mote-pull', '1');
        mote.classList.add('attracted');
        window.setTimeout(() => mote.classList.remove('attracted'), 1300 + idx * 18);
      });
    }

    function maybeHandleMultitouch() {
      const touches = Array.from(activeTouches.values());
      if (touches.length === 2) {
        spawnTwinRipples(touches);
        const distance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
        touches.forEach((touch) => { touch.lastMultiDistance = distance; touch.hadMultitouch = true; });
        if (!touches.some((touch) => touch.emittedMultiTouch)) {
          touches.forEach((touch) => { touch.emittedMultiTouch = true; });
          const x = (touches[0].x + touches[1].x) / 2;
          const y = (touches[0].y + touches[1].y) / 2;
          emitGesture('multi_touch', { zone: 'field', x, y, pointerCount: touches.length });
        }
        renderer.triggerIntent?.('tiny_perk');
      } else if (touches.length >= 3) {
        const x = touches.reduce((sum, touch) => sum + touch.x, 0) / touches.length;
        const y = touches.reduce((sum, touch) => sum + touch.y, 0) / touches.length;
        spawnPartyBurst(x, y);
        if (!touches.some((touch) => touch.emittedThreeFinger)) {
          touches.forEach((touch) => { touch.emittedThreeFinger = true; touch.hadMultitouch = true; });
          emitGesture('three_finger_tap', { zone: 'field', x, y, pointerCount: touches.length });
        }
      }
    }

    function maybeHandlePinchSpread() {
      const touches = Array.from(activeTouches.values());
      if (touches.length !== 2) return;
      const distance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
      const previous = touches[0].lastMultiDistance || distance;
      if (Math.abs(distance - previous) < 26) return;
      const spreading = distance > previous;
      touches.forEach((touch) => { touch.lastMultiDistance = distance; });
      const cx = (touches[0].x + touches[1].x) / 2;
      const cy = (touches[0].y + touches[1].y) / 2;
      const ring = positionedFx(`touch-fx-orbit ${spreading ? 'spread' : 'pinch'}`, cx, cy, Math.max(96, distance + 36));
      ring.dataset.gesture = spreading ? 'spread' : 'pinch';
      addFxNode(ring, isReducedMotion() ? 700 : 2800);
      const now = performance.now();
      if (now - lastPinchAt > 240) {
        lastPinchAt = now;
        emitGesture(spreading ? 'spread' : 'pinch', { zone: 'field', x: cx, y: cy, pointerCount: 2, distance });
      }
    }

    const FX_BY_ZONE = {
      boop: { gaze: 'forward_focus', intent: 'brow_pop', fx: ['ripple', 'halo-pop', 'spark-burst'] },
      left: { gaze: 'glance_left', intent: 'glance_left', fx: ['comet-left', 'side-sparks'] },
      right: { gaze: 'glance_right', intent: 'glance_right', fx: ['comet-right', 'side-sparks'] },
      sky: { gaze: 'internal_focus', intent: 'tiny_perk', fx: ['star-shower'] },
      floor: { gaze: 'bottom_status', intent: 'settle', fx: ['ground-wave', 'fireflies'] },
      field: { gaze: 'center', intent: 'tiny_perk', fx: ['ripple', 'particles'] },
    };

    function emitGesture(type, detail = {}) {
      if (disposed) return;
      window.dispatchEvent(new CustomEvent('hermes-touch-gesture', {
        detail: {
          type,
          zone: detail.zone,
          x: detail.x,
          y: detail.y,
          pointerCount: detail.pointerCount || activeTouches.size || 1,
          durationMs: Math.max(0, Math.round(detail.durationMs || 0)),
          moved: Boolean(detail.moved),
          intensity: detail.intensity,
          angle: detail.angle,
          distance: detail.distance,
          pattern: detail.pattern,
        }
      }));
    }

    function sendTouchPulse(zone, x, y, pointerCount = activeTouches.size || 1, intensity = 1) {
      const vector = touchVectorFromOptic(x, y);
      window.__HERMES_CONCEPT_B_EYE_MOTION?.touchPulse?.({ zone, x, y, ...vector, intensity, pointerCount, mode: readMode(getPacket) });
      window.__HERMES_CONCEPT_B_EYE_MOTION?.touchResonance?.({ zone, x, y, ...vector, intensity, pointerCount, mode: readMode(getPacket) });
      return vector;
    }

    function spawnEffect(effect = {}) {
      if (!effect || typeof effect !== 'object') return false;
      const zone = effect.zone || 'boop';
      const x = Number.isFinite(effect.x) ? effect.x : window.innerWidth / 2;
      const y = Number.isFinite(effect.y) ? effect.y : window.innerHeight / 2;
      setTouchFxActive();
      updateTheme();
      if (effect.type === 'ripple') { spawnRipple(x, y, zone === 'boop' ? 'boop' : 'normal'); return true; }
      if (effect.type === 'orbit') { spawnHaloPop(x, y); return true; }
      if (effect.type === 'comet') { spawnComet(effect.side === 'right' ? 'right' : 'left', Number.isFinite(effect.y) ? effect.y : window.innerHeight * 0.5); return true; }
      if (effect.type === 'stars') { spawnStarShower(x, y); return true; }
      if (effect.type === 'party') { spawnPartyBurst(x, y); return true; }
      if (effect.type === 'spark-burst') { spawnSparkBurst(x, y, effect); return true; }
      return false;
    }

    function reactForZone(zone, x, y, intensity = 0.6) {
      setTouchFxActive();
      updateTheme();
      const mapping = FX_BY_ZONE[zone] || FX_BY_ZONE.field;
      const vector = sendTouchPulse(zone, x, y, activeTouches.size || 1, intensity);
      spawnImpactFlash(x, y, zone, intensity);
      renderer.reactToTouch?.(zone, { intent: mapping.intent, holdMs: 760 }) ||
        (renderer.pulseGaze?.(mapping.gaze, 760), renderer.triggerIntent?.(mapping.intent));
      spawnResonanceWave(x, y, vector);
      stirMotes(x, y, zone === 'boop' ? 0.9 : 0.55);
      for (const fx of mapping.fx) {
        if (fx === 'ripple') spawnRipple(x, y, zone === 'boop' ? 'boop' : 'normal');
        else if (fx === 'halo-pop') spawnHaloPop(x, y);
        else if (fx === 'spark-burst') spawnSparkBurst(x, y, { count: 18, spread: 105 });
        else if (fx === 'particles') spawnSparkBurst(x, y, { count: 10, spread: 72, size: 6 });
        else if (fx === 'comet-left') spawnComet('left', y);
        else if (fx === 'comet-right') spawnComet('right', y);
        else if (fx === 'side-sparks') spawnSparkBurst(x, y, { count: 8, spread: 54, size: 5 });
        else if (fx === 'star-shower') spawnStarShower(x, y);
        else if (fx === 'ground-wave' || fx === 'fireflies') spawnGroundWave(x, y);
      }
      rememberZone(zone);
    }

    function rememberZone(zone) {
      playMemory.taps += 1;
      playMemory.lastZones.push(zone);
      playMemory.lastZones = playMemory.lastZones.slice(-8);
      if (playMemory.lastZones.slice(-3).join('-') === 'left-right-left') {
        emitGesture('tap_pattern', { zone: 'field', x: window.innerWidth / 2, y: window.innerHeight / 2, pointerCount: 1, pattern: 'left-right-left' });
        spawnComet('left', window.innerHeight * 0.5);
        window.setTimeout(() => spawnComet('right', window.innerHeight * 0.5), 260);
      }
      if (playMemory.lastZones.slice(-5).every((item) => item === 'boop')) {
        emitGesture('rhythm', { zone: 'boop', x: window.innerWidth / 2, y: window.innerHeight / 2, pointerCount: 1, pattern: 'five-boops' });
        renderer.triggerIntent?.('smug_nod') || renderer.triggerIntent?.('brow_pop');
        window.__HERMES_CONCEPT_B_EYE_MOTION?.blinkNow?.();
      }
    }

    function onFxPointerDown(event) {
      if (!acceptsPointer(event)) return;
      event.preventDefault();
      invalidateOpticRect();
      const zone = classifyTouchFx(event);
      const state = {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        zone,
        startedAt: performance.now(),
        lastTrailAt: 0,
        moved: false,
        hadMultitouch: false,
        longPressEmitted: false,
        chargeTimer: window.setTimeout(() => spawnChargeOrb(event.clientX, event.clientY, event.pointerId), 650),
      };
      activeTouches.set(event.pointerId, state);
      const intensity = intensityFromPointer(event, false);
      reactForZone(zone, event.clientX, event.clientY, intensity);
      maybeHandleMultitouch();
    }

    function onFxPointerMove(event) {
      if (!acceptsPointer(event)) return;
      const state = activeTouches.get(event.pointerId);
      if (!state) return;
      event.preventDefault();
      state.x = event.clientX;
      state.y = event.clientY;
      const now = performance.now();
      if (Math.hypot(state.x - state.startX, state.y - state.startY) > 10 && !state.moved) {
        state.moved = true;
        window.clearTimeout(state.chargeTimer);
      }
      if (state.moved && now - state.lastTrailAt > (isReducedMotion() ? 140 : 32)) {
        setTouchFxActive();
        state.lastTrailAt = now;
        spawnTrailPoint(state.x, state.y, event.pointerId);
        if (state.zone === 'floor') spawnGroundWave(state.x, state.y);
      }
      const charge = activeCharges.get(event.pointerId);
      if (charge) {
        charge.style.setProperty('--x', `${state.x}px`);
        charge.style.setProperty('--y', `${state.y}px`);
      }
      const moveIntensity = intensityFromPointer(event, state.moved);
      sendTouchPulse(state.zone, state.x, state.y, activeTouches.size, moveIntensity);
      maybeHandlePinchSpread();
    }

    function onFxPointerUp(event) {
      if (!acceptsPointer(event)) return;
      const state = activeTouches.get(event.pointerId);
      if (!state) return;
      event.preventDefault();
      window.clearTimeout(state.chargeTimer);
      const releasedCharge = releaseChargeOrb(event.pointerId, event.clientX, event.clientY);
      const duration = performance.now() - state.startedAt;
      activeTouches.delete(event.pointerId);
      invalidateOpticRect();
      if (!releasedCharge && duration < 360 && !state.moved && !state.hadMultitouch && !state.emittedMultiTouch && !state.emittedThreeFinger) {
        const remaining = Array.from(activeTouches.values());
        if (remaining.length >= 2) spawnPartyBurst(event.clientX, event.clientY);
        else emitGesture('tap', { zone: state.zone, x: event.clientX, y: event.clientY, pointerCount: 1, durationMs: duration, moved: false, intensity: intensityFromPointer(event, false), ...touchVectorFromOptic(event.clientX, event.clientY) });
      }
    }

    function onFxPointerCancel(event) {
      const state = activeTouches.get(event.pointerId);
      if (state) window.clearTimeout(state.chargeTimer);
      activeTouches.delete(event.pointerId);
      invalidateOpticRect();
      activeCharges.get(event.pointerId)?.remove();
      activeCharges.delete(event.pointerId);
    }

    function dispose() {
      disposed = true;
      document.body.removeEventListener('pointerdown', onFxPointerDown);
      document.body.removeEventListener('pointermove', onFxPointerMove);
      document.body.removeEventListener('pointerup', onFxPointerUp);
      document.body.removeEventListener('pointercancel', onFxPointerCancel);
      document.body.removeEventListener('pointerleave', onFxPointerCancel);
      window.removeEventListener('resize', invalidateOpticRect);
      fxLayer.remove();
      feedBadge.remove();
      window.clearTimeout(touchIdleTimer);
      window.clearInterval(statusInterval);
      statusInterval = 0;
    }

    document.body.addEventListener('pointerdown', onFxPointerDown, { passive: false });
    document.body.addEventListener('pointermove', onFxPointerMove, { passive: false });
    document.body.addEventListener('pointerup', onFxPointerUp, { passive: false });
    document.body.addEventListener('pointercancel', onFxPointerCancel, { passive: false });
    document.body.addEventListener('pointerleave', onFxPointerCancel, { passive: false });
    window.addEventListener('resize', () => { invalidateOpticRect(); syncMoteAnchors(true); }, { passive: true });

    window.addEventListener('hermes-live-packet', () => { updateTheme(); updateFeedBadge(); });
    if (typeof options.updateAudioBadge === 'function') {
      window.addEventListener('hermes-audio-muted', options.updateAudioBadge);
    }

    createMotes();
    updateTheme();
    updateFeedBadge();
    setTouchFxIdle();

    const api = {
      mode: () => 'fun',
      classifyTouchFx: (x, y) => classifyTouchFx({ clientX: x, clientY: y }),
      activeCount: () => activeTouches.size,
      fxCount: () => fxLayer.childElementCount,
      touchFxState: () => fxLayer.dataset.touchFxState || 'idle',
      playMemory: () => ({ taps: playMemory.taps, lastZones: [...playMemory.lastZones], stars: playMemory.stars.length, lastPartyAt: playMemory.lastPartyAt }),
      entertainmentBudget,
      touchVectorFromOptic,
      spawnEffect: spawnEffect,
      testSpawnMultiTouch: (points = []) => {
        const normalized = points.slice(0, 3).map((point, idx) => ({ x: Number(point.x), y: Number(point.y), pointerId: idx + 1000 }));
        if (normalized.length >= 2) spawnTwinRipples(normalized);
        if (normalized.length >= 3) {
          const x = normalized.reduce((sum, point) => sum + point.x, 0) / normalized.length;
          const y = normalized.reduce((sum, point) => sum + point.y, 0) / normalized.length;
          spawnPartyBurst(x, y);
        }
      },
      spawnForZone: (zone, x = window.innerWidth / 2, y = window.innerHeight / 2) => reactForZone(zone, x, y),
      testForceIdle: setTouchFxIdle,
      testLongPressStar: (x = window.innerWidth / 2, y = window.innerHeight / 2) => spawnConstellationStar(x, y),
      debugEnabled: () => debugTouch,
      dispose,
      isDisposed: () => disposed,
    };

    window.HermesTouchFxController = api;
    statusInterval = window.setInterval(() => { updateTheme(); updateFeedBadge(); }, 1000);
    return api;
  }

  window.HermesTouchFx = { install };
})();
