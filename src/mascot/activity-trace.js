(() => {
  'use strict';

  // Only coarse, allowlisted phases enter the trace. Never retain packets,
  // captions, event labels, prompts, tool arguments, or session identifiers.
  const PHASES = Object.freeze({
    idle_watch: { label: 'On watch', glyph: '◉' },
    notice: { label: 'Noticing', glyph: '✦' },
    listening: { label: 'Listening', glyph: '◎' },
    reading: { label: 'Reading', glyph: '≡' },
    reasoning: { label: 'Thinking', glyph: '◇' },
    tool_shell: { label: 'Using tools', glyph: '⌘' },
    searching: { label: 'Searching', glyph: '⌕' },
    writing: { label: 'Writing', glyph: '✎' },
    waiting_user: { label: 'Your input', glyph: '○' },
    blocked: { label: 'Blocked', glyph: '!' },
    complete: { label: 'Finished', glyph: '✓' },
    degraded_offline: { label: 'Feed unavailable', glyph: '·' },
  });
  const hasPhase = (mode) => Object.hasOwn(PHASES, mode);

  function elapsedLabel(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
  }

  function createTrace({ clock = () => performance.now() } = {}) {
    let entries = [];
    let status = 'connecting';
    let observedAt = null;
    let lastNow = 0;
    let lastMode = null;
    let serial = 0;
    const now = () => {
      const value = clock();
      lastNow = Math.max(lastNow, Number.isFinite(value) ? value : lastNow);
      return lastNow;
    };
    return {
      observe(mode, { freshness = 'fresh', connected = true, preview = false, privateMode = false } = {}) {
        const at = now();
        if (privateMode) {
          entries = [];
          observedAt = null;
          lastMode = null;
          status = 'private';
          return;
        }
        status = !hasPhase(mode) ? 'connecting' : preview ? 'preview' : !connected ? 'connecting' : freshness !== 'fresh' ? 'stale' : 'live';
        if (status === 'connecting' || status === 'stale' || !hasPhase(mode)) {
          // Stop counting observed duration across a telemetry gap. Never infer
          // completion, continued work, or idle from silence.
          observedAt = null;
          lastMode = null;
          return;
        }
        if (mode !== lastMode) {
          observedAt = at;
          entries = [...entries, { mode, at, key: ++serial }].slice(-5);
          lastMode = mode;
        }
      },
      snapshot() {
        return {
          status,
          elapsed: observedAt === null ? null : elapsedLabel(now() - observedAt),
          entries: entries.map((entry) => ({ ...entry, ...PHASES[entry.mode] })),
        };
      },
    };
  }

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

  function mount(container) {
    const root = document.createElement('section');
    root.className = 'cb-activity-trace';
    root.setAttribute('aria-label', 'Observed activity since opening this display');
    root.innerHTML = '<div class="cb-trace-heading"><span data-trace-status>CONNECTING</span><span data-trace-age></span></div><ol aria-label="Recent observed phases"></ol>';
    container.appendChild(root);
    const status = root.querySelector('[data-trace-status]');
    const age = root.querySelector('[data-trace-age]');
    const list = root.querySelector('ol');
    let signature = '';
    const labels = { live: 'LIVE ACTIVITY', preview: 'PREVIEW', connecting: 'AWAITING TELEMETRY', stale: 'LAST OBSERVED · FEED STALE', private: 'PRIVATE' };
    return (snapshot) => {
      root.hidden = snapshot.status === 'private';
      root.dataset.status = snapshot.status;
      status.textContent = labels[snapshot.status];
      age.textContent = snapshot.elapsed === null ? '' : `OBSERVED ${snapshot.elapsed}`;
      const next = `${snapshot.status}:${snapshot.entries.map((entry) => entry.key).join(',')}`;
      if (signature === next) return;
      signature = next;
      list.replaceChildren(...snapshot.entries.map((entry, index) => {
        const item = document.createElement('li');
        item.dataset.phase = entry.mode;
        if (index === snapshot.entries.length - 1 && snapshot.elapsed !== null) item.setAttribute('aria-current', 'step');
        const glyph = document.createElement('span');
        glyph.className = 'cb-trace-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = entry.glyph;
        const label = document.createElement('span');
        label.textContent = entry.label;
        item.append(glyph, label);
        return item;
      }));
    };
  }

  window.HermesActivityTrace = Object.freeze({ createTrace, mount, presenceForMode, allowsIdlePerformance, chooseIdleSequence });
})();
