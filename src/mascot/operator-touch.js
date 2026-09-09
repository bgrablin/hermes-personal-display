(() => {
  'use strict';

  function install(options = {}) {
    const surface = document.querySelector('.cb-radial-stage');
    if (!surface) return null;
    surface.querySelector('.cb-radial-svg').removeAttribute('aria-hidden');
    surface.querySelector('.cb-outer-field').setAttribute('aria-hidden', 'true');
    const eye = () => window.__HERMES_CONCEPT_B_EYE_MOTION;
    let contact = null;
    let returnTimer = 0;
    let dismissTimer = 0;
    let refreshTimer = 0;
    let selected = null;
    let opener = null;
    const targets = [];
    const ring = document.createElement('div');
    ring.className = 'cb-contact';
    ring.hidden = true;
    ring.setAttribute('aria-hidden', 'true');
    const panel = document.createElement('section');
    panel.className = 'cb-inspector';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'cb-inspector-title');
    panel.innerHTML = '<div><span id="cb-inspector-title"></span><button type="button" aria-label="Close detail">×</button></div><strong data-inspector-value></strong><p data-inspector-context></p><small data-inspector-freshness></small>';
    const hint = document.createElement('span');
    hint.className = 'cb-touch-hint';
    hint.textContent = 'Drag to guide attention · Tap readings for details';
    document.body.append(ring, panel, hint);
    const title = panel.querySelector('#cb-inspector-title');
    const value = panel.querySelector('[data-inspector-value]');
    const context = panel.querySelector('[data-inspector-context]');
    const freshness = panel.querySelector('[data-inspector-freshness]');
    const closeButton = panel.querySelector('button');
    const integration = document.createElement('div');
    integration.className = 'cb-integration';
    integration.hidden = true;
    panel.append(integration);
    let detailRequest = 0;
    let sessionSelection = null;
    const sessionKey = row => JSON.stringify(row.source
      ? ['observer', row.source.owner, row.profile, row.session_id]
      : ['rpc', row.connection, row.profile, row.session_id, row.stored_session_id]);
    function textNode(tag, text) {
      const node = document.createElement(tag);
      node.textContent = String(text ?? 'Unknown');
      return node;
    }
    function renderIntegration(data) {
      integration.replaceChildren();
      const status = textNode('small', 'LOCAL OPERATOR · OBSERVED SOURCES');
      integration.append(status);
      const refreshButton = textNode('button', 'Refresh details');
      refreshButton.type = 'button';
      refreshButton.addEventListener('click', loadIntegration);
      integration.append(refreshButton);
      const rows = [];
      for (const source of data.sources || []) {
        for (const session of source.sessions || []) rows.push({ ...session, source,
          label: `${session.session_id} · ${source.fresh ? 'observed' : 'stale'} · ${source.owner.slice(0, 8)}` });
      }
      for (const row of data.rpc?.sessions || []) rows.push({ ...row,
        label: `${row.connection} / ${row.profile} / ${row.session_id}` });
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Observed Hermes session');
      rows.forEach((row, i) => { const option = textNode('option', row.label); option.value = String(i); select.append(option); });
      if (sessionSelection !== null) {
        const index = rows.findIndex(row => sessionKey(row) === sessionSelection);
        if (index >= 0) select.value = String(index);
        else {
          const missing = textNode('option', 'Selected session unavailable');
          missing.value = ''; missing.selected = true;
          select.prepend(missing);
        }
      }
      const detail = document.createElement('div');
      integration.append(select, detail);
      function show() {
        detail.replaceChildren();
        const row = select.value === '' ? null : rows[Number(select.value)];
        if (!row) {
          detail.append(textNode('p', sessionSelection === null
            ? `Session coverage unavailable. RPC: ${data.rpc?.status || 'not configured'}.`
            : 'Selected session is no longer observed. Refresh or explicitly select another session.'));
          return;
        }
        sessionSelection = sessionKey(row);
        if (!row.source) detail.append(textNode('strong', row.status || (row.available ? 'Automation observed' : 'Control unavailable')));
        if (row.source) {
          const terminal = new Set(['completed', 'failed', 'interrupted', 'error', 'exited', 'stalled', 'cancelled']);
          const processes = row.processes || [];
          const pending = processes.filter(p => !terminal.has(p.status));
          const units = (row.delegations || []).flatMap(batch => batch.units || []);
          const subagents = row.subagents || [];
          const pendingSubagents = subagents.filter(subagent => !terminal.has(subagent.status));
          const unknown = !row.status || row.status === 'unknown' || !row.source.fresh || row.source.dropped_events || pending.some(p => p.status === 'unknown') || units.some(u => u.status === 'unknown') || pendingSubagents.some(subagent => subagent.status === 'unknown');
          const summary = textNode('div', unknown ? 'Work outcome unknown'
            : pending.length ? `${pending.length} background command${pending.length === 1 ? '' : 's'} continuing`
              : units.some(u => !terminal.has(u.status)) ? 'Delegated work continuing'
                : pendingSubagents.length ? `${pendingSubagents.length} subagent${pendingSubagents.length === 1 ? '' : 's'} working`
                : `Turn ${row.status || 'unknown'}`);
          summary.className = 'cb-work-summary';
          summary.dataset.state = unknown ? 'unknown' : pending.length || units.some(u => !terminal.has(u.status)) || pendingSubagents.length ? 'active' : 'settled';
          summary.append(textNode('small', `Turn: ${row.status || 'unknown'} · Processes: ${processes.length} · Delegation units: ${units.length} · Subagents: ${subagents.length}`));
          detail.prepend(summary);
          detail.append(textNode('p', `Observation age: ${row.source.age_seconds}s. Turn outcome and background work are separate.`));
          if (row.source.dropped_events) detail.append(textNode('p', 'Observation gap: some events were dropped. Outcomes may be unknown.'));
          for (const process of processes) {
            const card = textNode('p', `Process ${process.session_id}: ${process.status}${process.exit_code == null ? '' : ` · exit ${process.exit_code}`}`);
            card.className = 'cb-process-detail';
            if (process.reason === 'handed_off') card.append(textNode('small', `Handed to parent${process.session_key ? ` · ${process.session_key}` : ''}`));
            if (process.evidence) card.append(textNode('small', `Evidence: ${process.evidence}`));
            detail.append(card);
          }
          for (const batch of row.delegations || []) {
            detail.append(textNode('strong', `Delegation ${batch.delegation_id}: ${batch.settled ? 'all units settled' : 'unsettled'}`));
            for (const unit of batch.units) detail.append(textNode('p', `${unit.delegation_id} · group ${unit.group ?? 'ungrouped'} · tasks ${unit.task_indexes?.join(', ')} · ${unit.status}`));
          }
          if (subagents.length) detail.append(textNode('strong', 'OBSERVED SUBAGENTS'));
          for (const subagent of subagents) {
            const card = document.createElement('article');
            card.className = 'cb-subagent-detail';
            card.dataset.status = String(subagent.status || 'unknown');
            card.append(textNode('strong', subagent.goal || `Subagent ${subagent.subagent_id}`));
            card.append(textNode('p', `${subagent.status || 'unknown'} · ${subagent.role || 'role unknown'}${subagent.duration_ms == null ? '' : ` · ${Math.round(subagent.duration_ms / 1000)}s`}`));
            card.append(textNode('small', `ID ${subagent.subagent_id}${subagent.child_session_id ? ` · session ${subagent.child_session_id}` : ''}${subagent.evidence ? ` · ${subagent.evidence}` : ''}`));
            detail.append(card);
          }
        }
        if (row.control) {
          if (!row.available) detail.append(textNode('p', row.error || 'Last observation retained; control unavailable.'));
          for (const kind of ['goal', 'loop', 'heartbeat']) {
            detail.append(textNode('strong', kind.toUpperCase()));
            detail.append(textNode('pre', row.control[kind] == null ? 'Not configured' : JSON.stringify(row.control[kind], null, 2)));
            for (const action of ['pause', 'resume']) {
              const name = `${kind}.${action}`;
              if (!row.control[kind] || !row.actions?.includes(name)) continue;
              const button = textNode('button', `${action} ${kind}`);
              button.type = 'button';
              button.addEventListener('click', async () => {
                detail.querySelectorAll('button').forEach(b => { b.disabled = true; });
                const feedback = textNode('p', `Sending ${name} to ${row.label}…`);
                detail.append(feedback);
                try {
                  const response = await fetch('/api/hermes-integration/control', { method: 'POST',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                      connection: row.connection, profile: row.profile, session_id: row.session_id,
                      stored_session_id: row.stored_session_id, revision: row.control.revision, action: name }) });
                  const result = await response.json();
                  feedback.textContent = result.status || 'Outcome unknown; refresh before retrying.';
                } catch { feedback.textContent = 'Outcome unknown; refresh before retrying.'; }
              });
              detail.append(button);
            }
          }
        }
        if (row.mcp) {
          detail.append(textNode('strong', `MCP · cached observation${row.mcp_unavailable ? ' · refresh unavailable' : ''}`));
          detail.append(textNode('p', `Checked at: ${row.mcp.checked_at ?? 'unknown'}. This does not probe connectivity.`));
          for (const server of row.mcp.servers || []) detail.append(textNode('p', `${server.name}: ${server.status} · ${server.transport} · ${server.tools} tools`));
        }
      }
      select.addEventListener('change', show);
      show();
      integration.append(textNode('strong', 'RECENT PROVIDER CALLS · LOG OBSERVATIONS'));
      for (const call of data.provider_calls || []) integration.append(textNode('p',
        `${call.model} · ${call.upstream || call.provider} · ${call.latency_seconds}s · input ${call.input ?? '?'} / output ${call.output ?? '?'} · cache read ${call.cache_read ?? '?'} / write ${call.cache_write ?? '?'} · response ${call.response_id ?? '?'} · ${call.observation || 'timestamp unavailable'}`));
    }
    async function loadIntegration() {
      const request = ++detailRequest;
      integration.hidden = false;
      integration.replaceChildren(textNode('p', 'Reading Hermes observations…'));
      try {
        const response = await fetch('/api/hermes-integration', { cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (request === detailRequest && selected) renderIntegration(data);
      } catch {
        if (request === detailRequest) integration.replaceChildren(textNode('p', 'Hermes integration unavailable. Existing display readings remain visible.'));
      }
    }
    // Metric inspection reads displayed values; Augury supplies a bounded,
    // credential-redacted observation snapshot. Neither path executes commands.
    const read = node => (node?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    function bind(node, label, detail, readValue) {
      if (!node) return;
      node.dataset.inspect = label;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Inspect ${label}`);
      targets.push({ node, label, detail, readValue, integration: node.matches('.cb-route-row, .cb-bottom-rail .cb-cell:last-child') });
    }
    const metrics = { cpu: ['CPU', 'Host load reading. The built-in collector reports one-minute load divided by CPU count, not sampled CPU utilization.'],
      mem: ['Memory', 'RAM utilization reported by this host.'],
      temp: ['Temperature', 'Reported CPU temperature. The displayed warning level follows the host thresholds.'] };
    for (const [key, [label, detail]] of Object.entries(metrics)) {
      const node = surface.querySelector(`[data-cb-arc="${key}"]`);
      bind(node, label, detail, () => read(node.querySelector('.cb-arc-value')));
      // A generous target around the metric text, independent of the thin arc.
      if (node) {
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.classList.add('cb-metric-hit');
        const labels = ['cpu', 'mem', 'temp'];
        const positions = [[495, 38], [974, 514], [16, 514]];
        const [x, y] = positions[labels.indexOf(key)];
        for (const [attr, v] of Object.entries({ x, y, width: 110, height: 90, rx: 12 })) hit.setAttribute(attr, String(v));
        node.prepend(hit);
      }
    }
    const descriptions = [
      'Connection status reported for the Hermes gateway.',
      'Freshness of observed updates. A quiet feed does not mean work has finished.',
      'Remote memory availability reported by Hermes.',
      'Observed active work and queued tasks. This is not a completion estimate.',
    ];
    document.querySelectorAll('.cb-bottom-rail .cb-cell').forEach((node, i) => {
      bind(node, read(node.querySelector('span')), descriptions[i], () => read(node.querySelector('div')));
    });
    document.querySelectorAll('.cb-route-row').forEach(node => {
      const label = read(node.querySelector('.cb-route-label strong')) || 'Provider';
      bind(node, label, 'Available headroom from local provider monitors. Unknown means no verified measurement.', () => read(node));
    });

    function refresh() {
      if (!selected) return;
      title.textContent = selected.integration ? 'HERMES CONNECTION' : selected.label;
      value.textContent = selected.integration ? 'Sessions & automation' : selected.readValue() || 'Unknown';
      context.textContent = selected.integration ? 'Select an observed session for background work, automation, and connection details.' : selected.detail;
      const feed = read(document.querySelector('[data-cb-feed]'));
      const age = read(document.querySelector('[data-cb-feed-age]'));
      freshness.textContent = selected.integration ? 'PRIVATE OBSERVATIONS · REFRESH TO UPDATE' : selected.observation
        ? `PINNED OBSERVATION · ${selected.meta || 'Time unavailable'}`
        : `${feed || 'AWAITING TELEMETRY'}${age ? ` · ${age}` : ''}`;
    }
    function close({ restoreFocus = true } = {}) {
      const wasObservation = selected?.observation;
      panel.hidden = true;
      integration.hidden = true;
      ++detailRequest;
      selected = null;
      window.clearTimeout(dismissTimer);
      window.clearInterval(refreshTimer);
      document.body.removeAttribute('data-inspecting');
      if (restoreFocus && opener?.isConnected && panel.contains(document.activeElement)) opener.focus();
      opener = null;
      if (wasObservation) window.dispatchEvent(new CustomEvent('hermes-observation-pin', { detail: false }));
    }
    function open(target) {
      close({ restoreFocus: false });
      selected = target;
      panel.dataset.observation = String(!!target.observation);
      panel.dataset.integration = String(!!target.integration);
      opener = target.node;
      refresh();
      panel.hidden = false;
      document.body.dataset.inspecting = 'true';
      eye()?.forceGaze?.('bottom_status', 1200);
      closeButton.focus({ preventScroll: true });
      if (target.observation) window.dispatchEvent(new CustomEvent('hermes-observation-pin', { detail: true }));
      else if (!target.integration) dismissTimer = window.setTimeout(close, 15000);
      if (target.integration) loadIntegration();
      refreshTimer = window.setInterval(refresh, 1000);
    }
    function inspectObservation(event) {
      const item = event.detail;
      if (!item?.node?.isConnected) return;
      const clean = window.HermesSanitize.operatorText;
      const snapshot = clean(item.text, 320);
      open({ node: item.node, label: clean(item.label, 48), readValue: () => snapshot,
        detail: 'Selected activity excerpt. Held here until you close it; live observations continue in the background.',
        meta: clean(item.meta, 96), observation: true });
    }
    window.addEventListener('hermes-inspect-observation', inspectObservation);
    function position(x, y) {
      ring.style.transform = `translate(${x}px, ${y}px)`;
    }
    function follow(x, y) {
      const rect = surface.getBoundingClientRect();
      eye()?.touchPulse?.({ dx: x - rect.left - rect.width / 2,
        dy: y - rect.top - rect.height / 2, gazeRadius: rect.width * .3, x, y, intensity: .2, pointerCount: 1 });
    }
    function finish(event, cancelled = false) {
      if (!contact || event.pointerId !== contact.id) return;
      const previous = contact;
      contact = null;
      ring.hidden = true;
      if (document.body.hasPointerCapture?.(event.pointerId)) document.body.releasePointerCapture(event.pointerId);
      if (!cancelled && previous.target && !previous.moved) open(previous.target);
      window.clearTimeout(returnTimer);
      returnTimer = window.setTimeout(() => eye()?.resumeObservation?.(), 650);
    }
    function down(event) {
      if (event.button > 0 || contact || panel.contains(event.target)) return;
      const target = targets.find(entry => entry.node.contains(event.target));
      // Keep family-mode holds and other actual controls under their own owner.
      const control = event.target.closest?.('button, a, input, select, [role="button"]');
      if (control && !control.hasAttribute('data-inspect')) return;
      close({ restoreFocus: false });
      event.preventDefault();
      window.clearTimeout(returnTimer);
      contact = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target, lastAt: 0 };
      try { document.body.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
      if (!target) {
        // Attention first, then direct manipulation. Never dispatch a work-state
        // event, start a show, generate speech, or leave a trail behind the finger.
        eye()?.acknowledgeViewer?.('touch', 1100);
        follow(event.clientX, event.clientY);
        position(event.clientX, event.clientY);
        ring.hidden = false;
      }
    }
    function move(event) {
      if (!contact || event.pointerId !== contact.id) return;
      contact.moved ||= Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > 10;
      if (contact.target || performance.now() - contact.lastAt < 32) return;
      contact.lastAt = performance.now();
      follow(event.clientX, event.clientY);
      position(event.clientX, event.clientY);
    }
    const up = event => finish(event);
    const cancel = event => finish(event, true);
    function key(event) {
      if (event.key === 'Escape') { close(); return; }
      if (!['Enter', ' '].includes(event.key)) return;
      const target = targets.find(entry => entry.node === event.target);
      if (target) { event.preventDefault(); open(target); }
    }
    document.body.addEventListener('pointerdown', down);
    document.body.addEventListener('pointermove', move);
    document.body.addEventListener('pointerup', up);
    document.body.addEventListener('pointercancel', cancel);
    document.body.addEventListener('lostpointercapture', cancel);
    document.body.addEventListener('keydown', key);
    closeButton.addEventListener('click', close);
    const api = {
      mode: () => 'inspect', activeCount: () => contact ? 1 : 0,
      fxCount: () => 0,
      entertainmentBudget() {
        return window.HermesPresence.motionBudget(options.getPacket?.()?.live?.system, window.__hermesFrameCadence);
      },
      dispose() {
        close();
        window.removeEventListener('hermes-inspect-observation', inspectObservation);
        window.clearTimeout(returnTimer);
        for (const [type, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up],
          ['pointercancel', cancel], ['lostpointercapture', cancel], ['keydown', key]]) document.body.removeEventListener(type, handler);
        targets.forEach(({ node }) => { delete node.dataset.inspect; node.removeAttribute('role'); node.removeAttribute('tabindex'); node.removeAttribute('aria-label'); });
        document.querySelectorAll('.cb-metric-hit').forEach(node => node.remove());
        surface.querySelector('.cb-radial-svg').setAttribute('aria-hidden', 'true');
        ring.remove(); panel.remove(); hint.remove();
      },
    };
    window.HermesTouchFxController = api;
    return api;
  }
  window.HermesOperatorTouch = Object.freeze({ install });
})();
