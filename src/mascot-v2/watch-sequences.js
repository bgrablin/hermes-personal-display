(() => {
  'use strict';

  // Compatibility shim. The source of truth and executor now live in entertainment.js.
  // Keep this file so older script order/build tooling and tests that reference
  // HermesWatchSequences continue to work without reintroducing hardcoded quips.
  const pending = [];
  const call = (method, args, fallback) => {
    const entertainment = window.HermesEntertainment;
    if (entertainment && typeof entertainment[method] === 'function') {
      return entertainment[method](...args);
    }
    pending.push({ method, args });
    return fallback;
  };

  if (!window.HermesWatchSequences) {
    window.HermesWatchSequences = Object.freeze({
      play: (...args) => call('playSequence', args, false),
      abort: () => call('abort', [], false),
      isPlaying: () => Boolean(window.HermesEntertainment?.getDebugState?.().current),
      isSpeaking: () => Boolean(window.HermesEntertainment?.getDebugState?.().speaking),
      ids: () => window.HermesEntertainment?.ids?.() || [],
      sequences: () => window.HermesEntertainment?.sequences?.() || {},
    });
  }

  window.addEventListener('hermes-entertainment-catalog-ready', () => {
    const queued = pending.splice(0);
    for (const item of queued) {
      try { window.HermesEntertainment?.[item.method]?.(...item.args); } catch (_) {}
    }
  }, { once: true });
})();
