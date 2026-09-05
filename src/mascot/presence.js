(() => {
  'use strict';

  // Presence is a visual response to the current observation, never a workflow.
  // No event history, ordered stages, inferred progress, or private packet text.
  const MODES = new Set(['idle_watch', 'notice', 'listening', 'reading', 'reasoning',
    'tool_shell', 'searching', 'writing', 'waiting_user', 'blocked', 'complete', 'degraded_offline']);
  const hasPhase = mode => MODES.has(mode);
  function presenceForMode(mode) {
    if (!hasPhase(mode)) return { kind: 'ambient', holdMs: 0 };
    if (mode === 'notice' || mode === 'listening') return { kind: 'acknowledge', holdMs: 1100 };
    if (mode === 'waiting_user') return { kind: 'waiting', holdMs: 0 };
    if (mode === 'complete') return { kind: 'complete', holdMs: 2200 };
    const target = ({
      reasoning: 'internal_focus', reading: 'down_work_left', writing: 'down_work_right',
      tool_shell: 'down_work_right', searching: 'augury_left',
    })[mode];
    return target ? { kind: 'working', target, holdMs: 1400 } : { kind: 'ambient', holdMs: 0 };
  }

  function allowsIdlePerformance({ mode, freshness = 'fresh', health = 'nominal', quiet = 'active', hidden = false }) {
    return mode === 'idle_watch' && freshness === 'fresh' && health === 'nominal' && quiet === 'active' && !hidden;
  }

  function chooseIdleSequence(previous, random = Math.random) {
    // Short, wordless catalog pieces; never speak an unsolicited idle line.
    const choices = ['aurora_breath', 'sleepy_lantern', 'magnet_motes'].filter((id) => id !== previous);
    const sample = random();
    const index = Number.isFinite(sample) ? Math.min(choices.length - 1, Math.max(0, Math.floor(sample * choices.length))) : 0;
    return choices[index];
  }

  const NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }
  const point = (angle, radius) => [550 + Math.cos(angle) * radius, 550 + Math.sin(angle) * radius];
  const xy = pair => pair.map(value => value.toFixed(2)).join(' ');

  function buildIris(lattice) {
    if (!lattice || lattice.childNodes.length) return;
    let seed = 28411;
    const random = () => ((seed = seed * 48271 % 2147483647) / 2147483647);
    lattice.appendChild(svg('circle', { cx: 550, cy: 550, r: 172, fill: 'url(#cb-iris-body)' }));
    // Interleaved curved fibers, branching crypts, and an irregular collarette.
    // Geometry is seeded once. Only the containing surface moves at runtime.
    for (let i = 0; i < 180; i++) {
      const angle = i * Math.PI * 2 / 180 + (random() - .5) * .018;
      const root = 49 + random() * 14;
      const tip = 146 + random() * 25;
      const bend = (random() - .5) * .14;
      const a = point(angle, root);
      const b = point(angle + bend, 85 + random() * 20);
      const c = point(angle - bend * .6, 126 + random() * 10);
      const d = point(angle + bend * .2, tip);
      const bright = i % 9 === 0;
      lattice.appendChild(svg('path', {
        class: `cb-iris-filament${bright ? ' cb-iris-filament-bright' : ''}`,
        d: `M ${xy(a)} C ${xy(b)} ${xy(c)} ${xy(d)}`,
        'stroke-width': bright ? 1.25 : .45 + random() * .9,
        opacity: .28 + random() * .65,
      }));
      if (i % 3 === 0) {
        lattice.appendChild(svg('path', {
          class: 'cb-iris-crypt',
          d: `M ${xy(point(angle, root + 5))} Q ${xy(point(angle + .026, 95))} ${xy(point(angle + .012, 122 + random() * 35))}`,
          'stroke-width': .5 + random() * 1.8,
        }));
      }
    }
    const collar = Array.from({ length: 144 }, (_, i) => {
      const a = i * Math.PI * 2 / 144;
      return xy(point(a, 58 + Math.sin(a * 17) * 2 + random() * 5));
    });
    lattice.appendChild(svg('path', { class: 'cb-iris-collar', d: `M ${collar.join(' L ')} Z` }));
    lattice.appendChild(svg('circle', { class: 'cb-iris-limbal', cx: 550, cy: 550, r: 169 }));
    // A shadowed outer edge makes the fibers recede beneath the cornea.
    lattice.appendChild(svg('circle', { cx: 550, cy: 550, r: 173, fill: 'url(#cb-iris-vignette)' }));
  }

  function materialForMode(mode) {
    const focus = ({ reasoning: .9, reading: .65, writing: .72, tool_shell: .8,
      searching: .55, listening: .35, notice: .4, waiting_user: .15, complete: .2 })[mode] ?? .12;
    const dim = ['blocked', 'critical', 'degraded_offline'].includes(mode);
    return { focus, energy: dim ? .12 : mode === 'searching' ? .85 : .45 };
  }

  function surfacePaths(time = 0, focus = .12, energy = .45, gazeX = 0, gazeY = 0) {
    // Unequal lobes, long settling waves, no constant-speed orbit or loading ring.
    // The material is expressive; its waves encode no task count or completion.
    time = Number.isFinite(time) ? time : 0;
    focus = Math.max(0, Math.min(1, Number(focus) || 0));
    energy = Math.max(0, Math.min(1, Number(energy) || 0));
    gazeX = Math.max(-34, Math.min(34, Number(gazeX) || 0));
    gazeY = Math.max(-30, Math.min(30, Number(gazeY) || 0));
    return Array.from({ length: 6 }, (_, layer) => {
      const points = Array.from({ length: 64 }, (_, i) => {
        const angle = i * Math.PI * 2 / 64;
        const fold = Math.sin(angle * 3 + time * .27 + layer * .26) * (3 + energy * 3)
          + Math.sin(angle * 5 - time * .19 + layer * .4) * 2.8
          + Math.cos(angle * 2 + time * .13) * 3;
        const radius = 187 + layer * 3.8 + fold - focus * 3;
        const [x, y] = point(angle, radius);
        return [x + gazeX * (.11 + layer * .012), y + gazeY * (.11 + layer * .012)];
      });
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let d = `M ${xy(mid(points[63], points[0]))}`;
      points.forEach((p, i) => { d += ` Q ${xy(p)} ${xy(mid(p, points[(i + 1) % 64]))}`; });
      return `${d} Z`;
    });
  }

  function installSurface(container) {
    const paths = Array.from({ length: 6 }, (_, layer) => {
      const path = svg('path', { class: 'cb-presence-fold', opacity: .52 - layer * .065 });
      container.appendChild(path);
      return path;
    });
    let lastAt = null;
    let phase = 0;
    let focus = .12;
    let energy = .45;
    let lastSignature = '';
    let wasStill = true;
    return {
      render({ now, mode, x = 0, y = 0, reduced = false, hidden = false, quiet = 'active' }) {
        const still = reduced || hidden || quiet === 'night';
        const signature = `${mode}:${still}`;
        const dt = lastAt === null ? 0 : Math.min(.1, Math.max(0, (now - lastAt) / 1000));
        if (lastAt !== null && signature === lastSignature && (still || now - lastAt < (quiet === 'quiet' ? 100 : 40))) return;
        lastAt = now;
        const target = materialForMode(mode);
        const ease = 1 - Math.exp(-dt * 2.5);
        focus = still ? target.focus : focus + (target.focus - focus) * ease;
        energy = still ? target.energy : energy + (target.energy - energy) * ease;
        if (!still && !wasStill) phase += dt;
        const geometry = surfacePaths(reduced ? 0 : phase, focus, energy, reduced ? 0 : x, reduced ? 0 : y);
        paths.forEach((path, i) => path.setAttribute('d', geometry[i]));
        lastSignature = signature;
        wasStill = still;
      },
    };
  }

  window.HermesPresence = Object.freeze({ presenceForMode, allowsIdlePerformance, chooseIdleSequence,
    buildIris, materialForMode, surfacePaths, installSurface });
})();
