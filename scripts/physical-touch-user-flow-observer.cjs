#!/usr/bin/env node
/*
 * Observe the live physical kiosk through local Chrome DevTools while a kernel/uinput
 * user-flow script drives real XInput touch events. This is intentionally not a
 * Playwright-only synthetic test: CDP is used only for observation.
 */
const fs = require('fs');
const { chromium } = require('@playwright/test');

const outPath = process.argv[2] || '/tmp/hermes-touch-user-flow-observer.json';
const readyPath = process.argv[3] || '/tmp/hermes-touch-user-flow-ready';
const waitMs = Number(process.argv[4] || 45000);

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages().find((p) => p.url().includes('character-runtime-v2')) || context.pages()[0];
  await page.evaluate(() => {
    window.__hermesUserFlowLog = [];
    const push = (entry) => window.__hermesUserFlowLog.push({ t: Math.round(performance.now()), ...entry });
    const badge = document.createElement('div');
    badge.id = 'hermes-capture-audio-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = `AUDIO CAPTURE: ON · BUILD: ${window.__HERMES_DISPLAY_BUILD_ID || 'unknown'} · TTS: server/cache/browser · SFX: on`;
    Object.assign(badge.style, {
      position: 'fixed', left: '18px', bottom: '18px', zIndex: 2147483647,
      padding: '7px 10px', border: '1px solid rgba(247,211,107,.60)', borderRadius: '10px',
      background: 'rgba(5,9,16,.78)', color: '#ffe8a3', font: '700 15px/1.2 ui-monospace,Menlo,Consolas,monospace',
      letterSpacing: '.02em', pointerEvents: 'none', boxShadow: '0 0 18px rgba(247,211,107,.18)'
    });
    document.body.appendChild(badge);
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      document.body.addEventListener(type, (e) => {
        push({
          kind: 'pointer', type,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
          x: Math.round(e.clientX), y: Math.round(e.clientY),
          pressure: e.pressure,
          width: e.width, height: e.height,
          buttons: e.buttons,
        });
      }, { capture: true, passive: true });
    }
    window.addEventListener('hermes-touch-gesture', (e) => push({ kind: 'gesture', detail: e.detail }));
    window.addEventListener('hermes-watch-sequence-start', (e) => push({ kind: 'sequence_start', detail: e.detail }));
    window.addEventListener('hermes-watch-sequence-abort', (e) => push({ kind: 'sequence_abort', detail: e.detail }));
    window.addEventListener('hermes-watch-speak-start', (e) => push({ kind: 'speak_start', detail: e.detail }));
    window.addEventListener('hermes-watch-speak-stop', (e) => push({ kind: 'speak_stop', detail: e.detail }));
    window.addEventListener('hermes-audio-rms', (e) => push({ kind: 'audio_rms', detail: { rms: Number(e.detail?.rms || 0), source: e.detail?.source || '' } }));
    window.addEventListener('hermes-audio-pan', (e) => push({ kind: 'audio_pan', detail: { pan: Number(e.detail?.pan || 0), source: e.detail?.source || '', freq: e.detail?.freq || null } }));
    window.__hermesFrameSamples = [];
    let lastRaf = performance.now();
    const sampleFrame = (now) => {
      window.__hermesFrameSamples.push(Math.max(0, now - lastRaf));
      if (window.__hermesFrameSamples.length > 3600) window.__hermesFrameSamples.shift();
      lastRaf = now;
      window.__hermesFrameSampler = requestAnimationFrame(sampleFrame);
    };
    window.__hermesFrameSampler = requestAnimationFrame(sampleFrame);
  });
  fs.writeFileSync(readyPath, String(Date.now()));
  if (process.env.HERMES_REVIEW_AUDIO_PROOF === '1') {
    await page.evaluate(() => {
      const proofDelay = Number(window.__HERMES_AUDIO_PROOF_DELAY_MS || 2500);
      const later = (ms, fn) => window.setTimeout(fn, proofDelay + ms);
      later(0, () => window.HermesAudio?.playReviewProof?.('left'));
      later(3000, () => window.HermesAudio?.playReviewProof?.('right'));
      later(6000, () => window.HermesAudio?.playReviewProof?.('center'));
      later(9000, () => window.HermesAudio?.playReviewVoiceProof?.({ durationSec: 5.2, pan: 0 }));
      later(9200, () => {
        const lineId = `review.audio.server.${Date.now()}`;
        window.HermesEntertainment?.speakLine?.(lineId, { text: 'Hermes audio proof. Left, right, center, and voice are awake.', force: true, sequenceId: 'review_audio_proof', lineId, gesture: { zone: 'center', x: window.innerWidth / 2, y: window.innerHeight / 2, intensity: 0.7 } });
      });
      if (new URLSearchParams(location.search).get('browserttsproof') === '1') {
        later(14000, () => window.HermesEntertainment?.speakLine?.('review.audio.browser', { text: 'Browser voice fallback proof.', force: true, sequenceId: 'review_audio_proof', lineId: 'review.audio.browser' }));
      }
    });
  }
  await page.waitForTimeout(waitMs);
  const result = await page.evaluate(() => {
    const frames = (window.__hermesFrameSamples || []).slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
    const avg = frames.length ? frames.reduce((sum, value) => sum + value, 0) / frames.length : null;
    return {
    url: location.href,
    build: window.__HERMES_CONCEPT_B_EYE_MOTION?.debug?.().build,
    frameCadence: {
      samples: frames.length,
      avgMs: avg == null ? null : Number(avg.toFixed(2)),
      p50Ms: percentile(0.50) == null ? null : Number(percentile(0.50).toFixed(2)),
      p95Ms: percentile(0.95) == null ? null : Number(percentile(0.95).toFixed(2)),
      p99Ms: percentile(0.99) == null ? null : Number(percentile(0.99).toFixed(2)),
      longFramesOver34ms: frames.filter((value) => value > 34).length,
      longFramesOver50ms: frames.filter((value) => value > 50).length,
    },
    log: window.__hermesUserFlowLog || [],
    touchFx: window.hermesMascotV2TouchFx ? {
      mode: window.hermesMascotV2TouchFx.mode?.(),
      activeCount: window.hermesMascotV2TouchFx.activeCount?.(),
      fxCount: window.hermesMascotV2TouchFx.fxCount?.(),
      state: window.hermesMascotV2TouchFx.touchFxState?.(),
      playMemory: window.hermesMascotV2TouchFx.playMemory?.(),
      debugEnabled: window.hermesMascotV2TouchFx.debugEnabled?.(),
    } : null,
    entertainment: window.HermesEntertainment?.getDebugState?.(),
    audio: {
      voiceRms: Number(window.__HERMES_VOICE_RMS || 0),
      hermesAudioRms: Number(window.HermesAudio?.rms || 0),
      panLeft: Number(window.HermesAudio?.panForTouch?.('left', Math.round(window.innerWidth * 0.15)) ?? 0),
      panRight: Number(window.HermesAudio?.panForTouch?.('right', Math.round(window.innerWidth * 0.85)) ?? 0),
      lastPan: window.__HERMES_LAST_AUDIO_PAN || null,
    },
    eye: window.__HERMES_CONCEPT_B_EYE_MOTION?.debug?.(),
    domCounts: {
      touchZones: document.querySelectorAll('.touch-zones,.cb-touch-zones,.cb-touch').length,
      detailOverlay: document.querySelectorAll('.detail-overlay').length,
      touchFxNodes: document.querySelectorAll('.touch-fx-layer > *').length,
      watchFxNodes: document.querySelectorAll('.hermes-watch-fx > *').length,
    },
    bodyDataset: { ...document.body.dataset },
    visibleText: document.body.innerText.slice(0, 2500),
    };
  });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  const kinds = result.log.reduce((acc, entry) => {
    const key = `${entry.kind}:${entry.type || entry.detail?.type || entry.detail?.sequence_id || ''}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({ ok: true, outPath, events: result.log.length, kinds, frameCadence: result.frameCadence, touchFx: result.touchFx, audio: result.audio, domCounts: result.domCounts, eye: result.eye }, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
