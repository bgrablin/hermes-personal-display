(() => {
  const { PRESETS, normalizePersonaPacket } = window.HermesDisplayState;
  const SETTLE_MS = 700;
  const statusEl = document.querySelector('#debug-status');
  const sheet = document.querySelector('#contact-sheet');

  const STILLS = [
    {
      id: 'neutral',
      title: 'quiet watch',
      tag: 'quiet_watch',
      packet: { ...PRESETS.idle_watchful, state_preset: 'quiet_watch', state_label: 'QUIET WATCH', live: { system: { cpu: 0.18, cpu_temp_c: 58 } } },
      override: { gaze: 'center' },
      desc: 'Centered gaze with normal cyan/mint severity. Calm CSS-driven hover, slow blink, and deterministic idle routine.'
    },
    {
      id: 'look_left',
      title: 'look left',
      tag: 'idle_watchful',
      packet: PRESETS.idle_watchful,
      override: {
        gaze: 'left',
        mouth: 'neutral',
        browLeft: 'neutral_left',
        browRight: 'neutral_right',
        lid: 0.04,
        squint: 0.00
      },
      desc: 'Plain look-left card. Eyes slide left but the face stays open and neutral, distinct from the tighter side-eye.'
    },
    {
      id: 'look_right',
      title: 'look right',
      tag: 'idle_watchful',
      packet: PRESETS.idle_watchful,
      override: {
        gaze: 'right',
        mouth: 'neutral',
        browLeft: 'neutral_left',
        browRight: 'neutral_right',
        lid: 0.04,
        squint: 0.00
      },
      desc: 'Plain look-right card. Deliberate rightward glance without the smirk or lowered lids used for side-eye.'
    },
    {
      id: 'side_eye_left',
      title: 'side-eye left',
      tag: 'idle + side-eye',
      packet: PRESETS.idle_watchful,
      override: {
        gaze: 'side_eye_left',
        browLeft: 'side_eye_squint_left',
        browRight: 'side_eye_squint_right',
        mouth: 'side_smirk',
        lid: 0.30,
        squint: 0.14,
        pupilScale: 0.92
      },
      desc: 'Eyes pin hard left with lowered lids and a tighter mouth. Reads as skeptical side-eye, not a plain glance.'
    },
    {
      id: 'side_eye_right',
      title: 'side-eye right',
      tag: 'idle + side-eye',
      packet: PRESETS.idle_watchful,
      override: {
        gaze: 'side_eye_right',
        browLeft: 'side_eye_squint_left',
        browRight: 'side_eye_squint_right',
        mouth: 'smirk_right',
        lid: 0.28,
        squint: 0.12,
        pupilScale: 0.92
      },
      desc: 'Mirror skeptical side-eye with harder pupil push and lowered lids, clearly separate from the open look-right card.'
    },
    {
      id: 'thinking',
      title: 'reasoning',
      tag: 'reasoning',
      packet: { ...PRESETS.thinking_focused, state_preset: 'reasoning', state_label: 'REASONING' },
      override: { gaze: 'up_left' },
      desc: 'Focused calm reasoning: flat focused mouth, non-worried brows, scan beam visible, gold active accent without distress.'
    },
    {
      id: 'planning',
      title: 'planning',
      tag: 'planning',
      packet: { ...PRESETS.thinking_focused, skin: 'retro-robot-core', state_preset: 'planning', state_label: 'PLANNING', live: { current_work: { visual_kind: 'planning' } } },
      override: { gaze: 'up_left', mouth: 'smile_small', browLeft: 'raised_left', browRight: 'neutral_right', lid: 0.10, squint: 0.10 },
      desc: 'Attentive planning preset with a calmer mouth and restrained wing/float budget.'
    },
    {
      id: 'working',
      title: 'working',
      tag: 'working',
      packet: { ...PRESETS.thinking_focused, state_preset: 'working', state_label: 'WORKING', live: { current_work: { active: true, visual_kind: 'shell' }, system: { cpu: 0.42, cpu_temp_c: 63 } } },
      override: { gaze: 'forward_focus' },
      desc: 'Active work preset: intentful forward focus, brighter eyes, no continuous bounce.'
    },
    {
      id: 'healthy',
      title: 'completed',
      tag: 'completed',
      packet: { ...PRESETS.healthy_smug, state_preset: 'completed', state_label: 'COMPLETED' },
      override: { gaze: 'smug', mouth: 'smile_smug' },
      desc: 'Smug arch brow, asymmetric smirk, gaze off-right.'
    },
    {
      id: 'blocked',
      title: 'blocked',
      tag: 'blocked',
      packet: { ...PRESETS.blocked_annoyed, state_preset: 'blocked', state_label: 'BLOCKED' },
      override: { gaze: 'side_eye_left' },
      desc: 'Annoyed brows dropped, mouth flat-wave, side-eye left held.'
    },
    {
      id: 'feed_stale',
      title: 'feed stale',
      tag: 'feed_stale',
      packet: { ...PRESETS.idle_watchful, state_preset: 'feed_stale', state_label: 'FEED STALE', live: { freshness: { tier: 'stale', stale_measurements: ['cpu', 'temp_c'] }, system: { cpu: 0.34, cpu_temp_c: 64 } } },
      override: { gaze: 'left', mouth: 'neutral', browLeft: 'neutral_left', browRight: 'raised_right', lid: 0.12, squint: 0.04 },
      desc: 'Calm diagnostic feed-stale preset: amber/quiet attention without looking like a real incident.'
    },
    {
      id: 'warm_load',
      title: 'warm load',
      tag: 'adaptive',
      packet: { ...PRESETS.thinking_focused, state_preset: 'working', state_label: 'WARM LOAD', live: { current_work: { active: true, visual_kind: 'python' }, system: { cpu: 0.86, cpu_temp_c: 82 } } },
      override: { gaze: 'forward_focus', mouth: 'flat_focus', browLeft: 'squint_focused_left', browRight: 'squint_focused_right', lid: 0.18, squint: 0.20 },
      desc: 'Adaptive warm CPU/load card: active but throttled motion, slower blink, reduced wing/body budgets.'
    },
    {
      id: 'critical',
      title: 'critical',
      tag: 'critical',
      packet: { ...PRESETS.blocked_annoyed, state_preset: 'critical', state_label: 'CRITICAL' },
      override: { gaze: 'forward_focus', mouth: 'flat_tight', browLeft: 'angry_left', browRight: 'angry_right', lid: 0.22, squint: 0.24 },
      desc: 'Critical preset: serious and restrained, red reserved for real local issues.'
    },
    {
      id: 'night',
      title: 'night watch',
      tag: 'night_watch',
      packet: { ...PRESETS.night_sleepy, state_preset: 'night_watch', state_label: 'NIGHT WATCH' },
      override: { gaze: 'sleepy' },
      desc: 'Heavy lids, sleepy line mouth, dim aura, gaze down. Sleepy, not dead.'
    }
  ];

  const cards = [];

  STILLS.forEach((still) => {
    cards.push(buildCard(still));
  });

  document.querySelector('#sample-all').addEventListener('click', () => {
    cards.forEach((card) => card.sampleIntent());
    setStatus('Sampling a named intent on every card.');
  });
  document.querySelector('#refreeze-all').addEventListener('click', () => {
    cards.forEach((card) => card.refreeze());
    setStatus('All cards reset to baseline still.');
  });
  document.querySelector('#play-all').addEventListener('click', () => {
    cards.forEach((card) => card.play());
    setStatus('All cards playing (unfrozen).');
  });
  document.querySelector('#freeze-all').addEventListener('click', () => {
    cards.forEach((card) => card.freeze());
    setStatus('All cards frozen at current frame.');
  });
  document.querySelector('#budget-check')?.addEventListener('click', () => {
    const budgets = window.HermesDisplayDebug.sampleStateBudgets();
    console.table(Object.entries(budgets).map(([state, data]) => ({
      state,
      rootY: data.rootYEstimatedPeak,
      rootYMax: data.rootYMax,
      rootYBudgetOk: data.rootYBudgetOk,
      meanGazeX: data.gazePool.meanX,
      leftShare: data.gazePool.leftShare,
      rightShare: data.gazePool.rightShare,
      autoBodyMovingIntents: data.autoBodyMovingIntents.join(',') || 'none'
    })));
    setStatus('Motion/gaze budget summary logged to console. Calm states should show rootYBudgetOk=true and no auto body-moving intents.');
  });

  document.querySelector('#resolver-check')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/hermes-state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`state ${response.status}`);
      const packet = await response.json();
      const live = packet.live || {};
      console.table([{
        display_state: live.resolver?.display_state || null,
        priority: live.resolver?.priority ?? null,
        freshness: live.freshness?.tier || null,
        secondary_badges: (live.resolver?.secondary_badges || []).join(', '),
        reason_codes: (live.resolver?.reason_codes || []).join(', '),
        gateway_ok: live.gateway_ok,
        current_work: live.current_work?.kind || live.current_work?.visual_kind || live.current_work?.state || null,
      }]);
      setStatus('Resolver diagnostics logged to console (display-safe only).');
    } catch (error) {
      setStatus(`Resolver diagnostics failed: ${String(error.message || error).slice(0, 80)}`);
    }
  });

  setStatus(`Loading ${STILLS.length} stills…`);
  Promise.all(cards.map((card) => card.ready)).then(() => {
    setStatus(`${STILLS.length} stills frozen at baseline. Use per-card or toolbar controls.`);
  }).catch((err) => {
    setStatus(`Card load failed: ${String(err.message || err).slice(0, 80)}`);
  });

  function setStatus(text) {
    if (statusEl) statusEl.value = text;
  }

  function buildCard(still) {
    const article = document.createElement('article');
    article.className = 'contact-card';
    article.dataset.stillId = still.id;

    const labelRow = document.createElement('div');
    labelRow.className = 'label';
    const labelMain = document.createElement('span');
    labelMain.textContent = still.title;
    const labelTag = document.createElement('span');
    labelTag.className = 'tag';
    labelTag.textContent = still.tag;
    labelRow.append(labelMain, labelTag);
    article.appendChild(labelRow);

    const frame = document.createElement('div');
    frame.className = 'stage-frame';
    const stageMount = document.createElement('div');
    const mountId = `still-${still.id}`;
    stageMount.id = mountId;
    frame.appendChild(stageMount);
    article.appendChild(frame);

    const intentTile = document.createElement('div');
    intentTile.className = 'intent-tile';
    intentTile.hidden = true;
    const intentName = document.createElement('span');
    intentName.className = 'intent-name';
    intentTile.append(intentName, document.createTextNode(' · captured at peak'));
    article.appendChild(intentTile);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const sampleBtn = document.createElement('button');
    sampleBtn.type = 'button';
    sampleBtn.textContent = 'sample intent';
    sampleBtn.dataset.action = 'sample';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 're-freeze';
    resetBtn.dataset.action = 'reset';
    actions.append(sampleBtn, resetBtn);
    article.appendChild(actions);

    const desc = document.createElement('p');
    desc.className = 'desc';
    desc.textContent = still.desc;
    article.appendChild(desc);

    const debugLine = document.createElement('output');
    debugLine.className = 'motion-debug card-debug';
    debugLine.value = 'debug pending…';
    article.appendChild(debugLine);

    sheet.appendChild(article);

    const renderer = new window.HermesDisplayRenderer(mountId, normalizePersonaPacket(still.packet));
    renderer.on('debug', (event) => {
      const debug = event.detail;
      if (!debug) return;
      const rootY = Number(debug.poseChannel.rootY || 0).toFixed(2);
      const motion = renderer.target?.motion || {};
      debugLine.value = `severity=${motion.severity || 'normal'} thermal=${motion.thermal || 'cool'} reduced=${motion.reduced_motion ? 'yes' : 'no'} gaze=${debug.gazeChannel.targetName}/${debug.gazeChannel.mode} rootY=${rootY}/${debug.motionBudget?.rootYMax ?? 'n/a'} intent=${debug.intent?.name || 'none'}`;
    });

    const ready = renderer.whenReady().then(() => {
      renderer.setPacket(still.packet, true);
      renderer.setStillOverride(still.override);
      return waitMs(SETTLE_MS).then(() => {
        renderer.freeze();
        article.classList.add('frozen');
      });
    });

    sampleBtn.addEventListener('click', () => {
      sampleIntent();
    });
    resetBtn.addEventListener('click', () => {
      refreeze();
    });

    function sampleIntent() {
      const state = window.HermesDisplayStates.STATES[still.packet.mood]
        || window.HermesDisplayStates.STATES.idle_watchful;
      const pool = state.intentPool;
      const weights = state.intentWeights;
      const name = window.HermesDisplayStates.pickWeighted(pool, weights, Math.random);
      const def = window.HermesDisplayStates.NUDGES[name];
      if (!def) return;
      article.classList.remove('frozen');
      renderer.clearStillOverride();
      renderer.play();
      renderer.triggerIntent(name);
      intentName.textContent = def.label;
      intentTile.hidden = false;
      waitMs(Math.min(def.duration * 0.55, 900)).then(() => {
        renderer.freeze();
        article.classList.add('frozen');
      });
    }

    function refreeze() {
      article.classList.remove('frozen');
      intentTile.hidden = true;
      renderer.setPacket(still.packet, true);
      renderer.setStillOverride(still.override);
      renderer.play();
      waitMs(SETTLE_MS).then(() => {
        renderer.freeze();
        article.classList.add('frozen');
      });
    }

    function play() {
      article.classList.remove('frozen');
      renderer.clearStillOverride();
      renderer.play();
    }

    function freeze() {
      renderer.freeze();
      article.classList.add('frozen');
    }

    return { renderer, ready, sampleIntent, refreeze, play, freeze };
  }

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
