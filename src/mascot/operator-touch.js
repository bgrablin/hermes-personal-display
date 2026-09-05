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
    // Inspect only the safe text already on the display. No raw packet, hidden
    // prompt, tool output, or additional network request enters this surface.
    const read = node => (node?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    function bind(node, label, detail, readValue) {
      if (!node) return;
      node.dataset.inspect = label;
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', `Inspect ${label}`);
      targets.push({ node, label, detail, readValue });
    }
    const metrics = { cpu: ['CPU', 'Recent processor utilization reported by this host.'],
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
      title.textContent = selected.label;
      value.textContent = selected.readValue() || 'Unknown';
      context.textContent = selected.detail;
      const feed = read(document.querySelector('[data-cb-feed]'));
      const age = read(document.querySelector('[data-cb-feed-age]'));
      freshness.textContent = `${feed || 'AWAITING TELEMETRY'}${age ? ` · ${age}` : ''}`;
    }
    function close({ restoreFocus = true } = {}) {
      panel.hidden = true;
      selected = null;
      window.clearTimeout(dismissTimer);
      window.clearInterval(refreshTimer);
      document.body.removeAttribute('data-inspecting');
      if (restoreFocus && opener?.isConnected && panel.contains(document.activeElement)) opener.focus();
      opener = null;
    }
    function open(target) {
      close({ restoreFocus: false });
      selected = target;
      opener = target.node;
      refresh();
      panel.hidden = false;
      document.body.dataset.inspecting = 'true';
      eye()?.forceGaze?.('bottom_status', 1200);
      closeButton.focus({ preventScroll: true });
      dismissTimer = window.setTimeout(close, 15000);
      refreshTimer = window.setInterval(refresh, 1000);
    }
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
