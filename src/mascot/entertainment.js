(() => {
  'use strict';

  const ALLOWED_STEP_TYPES = new Set([
    'SFX', 'SFX_SEQ', 'SPEAK', 'CAPTION', 'PARTICLE', 'RIPPLE', 'TRAIL', 'COMET', 'ORBIT',
    'CONSTELLATION', 'BLINK', 'WINK', 'GAZE', 'PULSE', 'POSE', 'GLOW', 'SPOTLIGHT', 'ARMS', 'IDLE'
  ]);
  const SAFE_SEQUENCE_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const SAFE_LINE_ID = /^[A-Za-z0-9_.:-]{1,96}$/;
  const MAX_TTS_TEXT_CHARS = 96;
  const MIN_TTS_GAP_MS = 15000;
  const MIN_SAME_LINE_GAP_MS = 120000;
  const MAX_TTS_PER_HOUR = 30;
  const MAX_TTS_PER_DAY = 150;
  const GENERATED_CONTENT_GAP_MS = 120000;
  const PARTY_BURST_GAP_MS = 4000;
  const MULTI_PAYOFF_GAP_MS = 1200;
  const MAX_FX_NODES = 56;
  const TTS_VOLUME = 0.9;

  const SFX = {
    'sfx-chime-1': [[660, 0, 0.10, 0.018], [990, 0.10, 0.16, 0.016]],
    'sfx-chime-soft': [[523, 0, 0.12, 0.012], [784, 0.13, 0.16, 0.010]],
    'sfx-whoosh': [[180, 0, 0.18, 0.010], [260, 0.08, 0.18, 0.010]],
    'sfx-hop1': [[420, 0, 0.08, 0.012]],
    'sfx-hop2': [[520, 0, 0.08, 0.012]],
    'sfx-hop3': [[660, 0, 0.10, 0.014]],
    'sfx-inhale-soft': [[330, 0, 0.18, 0.010], [440, 0.06, 0.18, 0.008]],
    'sfx-step': [[260, 0, 0.055, 0.010]],
    'sfx-giggle-mini': [[780, 0, 0.055, 0.012], [900, 0.09, 0.065, 0.010]],
    'sfx-applause-short': [[310, 0, 0.05, 0.006], [420, 0.08, 0.05, 0.006], [360, 0.16, 0.05, 0.006], [480, 0.24, 0.05, 0.006]]
  };

  const fallbackPack = {
    tiny_orb: { voice: 'marin', instructions: 'small bright companion, clear audible kiosk voice, gentle, playful, not shouty' },
    sleepy_star: { voice: 'cedar', instructions: 'soft but clearly audible bedtime tone, gentle, slow, not shouty' },
    space_bug: { voice: 'marin', instructions: 'silly chirpy explorer, tiny friendly robot friend, clear audible kiosk voice, playful, not shouty' },
    mini_announcer: { voice: 'coral', instructions: 'tiny showtime host, cheerful, brief, warm, clear audible kiosk voice, not shouty' },
    gentle_helper: { voice: 'cedar', instructions: 'calm reassuring companion, clear audible kiosk voice, gentle, simple, never alarming' }
  };

  const state = {
    catalog: null,
    sequences: Object.create(null),
    voicePacks: fallbackPack,
    loading: null,
    current: null,
    timers: [],
    speaking: false,
    audio: null,
    reduced: false,
    enabled: true,
    installedTouch: false,
    renderer: null,
    getPacket: () => ({}),
    gesture: { centerTapTimer: null, lastCenterTapAt: 0, lastMultiPayoffAt: 0, lastPinchPayoffAt: 0, lastZones: [], constellationLongPresses: [] },
    tts: { lastAt: 0, byLine: Object.create(null), hour: [], day: [] },
    generatedLastAt: 0,
    partyLastAt: 0,
    constellation: [],
    rhythm: [],
    creatureDay: null,
    currentContext: null,
    lastTouchAt: Date.now(),
    lastIdleAttractAt: 0,
    idleAttractTimer: 0
  };

  const params = new URLSearchParams(window.location.search || '');
  const on = (value) => ['1', 'true', 'yes'].includes(String(value || '').toLowerCase());
  const touchMode = () => String(params.get('touch') || 'fun').toLowerCase();
  const debugEnabled = () => on(params.get('debug'));
  const kioskEnabled = () => on(params.get('kiosk'));
  const allowMouseTouchTest = () => on(params.get('touchtest'));
  const entertainmentEnabled = () => state.enabled && touchMode() !== 'off' && !(touchMode() === 'legacy' && debugEnabled());
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  function cleanText(text, max = MAX_TTS_TEXT_CHARS) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function ensureLayer() {
    let layer = document.querySelector('.hermes-watch-fx');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'hermes-watch-fx';
    layer.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('div');
    caption.className = 'watch-caption quiet';
    const arms = document.createElement('div');
    arms.className = 'watch-arms quiet';
    arms.textContent = '⌞  ⌝';
    layer.append(caption, arms);
    document.body.appendChild(layer);
    installStyles();
    return layer;
  }

  function installStyles() {
    if (document.querySelector('#hermes-entertainment-styles')) return;
    const style = document.createElement('style');
    style.id = 'hermes-entertainment-styles';
    style.textContent = `
      .hermes-watch-fx{position:fixed;inset:0;z-index:48;pointer-events:none;overflow:hidden;mix-blend-mode:screen;}
      .watch-caption{position:absolute;left:50%;bottom:9.6%;transform:translateX(-50%);padding:.42rem .68rem;border:1px solid rgba(137,213,230,.36);border-radius:999px;background:rgba(4,8,14,.68);color:#d8f7ff;font:700 18px/1.15 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em;text-shadow:0 0 16px rgba(101,243,255,.55);opacity:1;transition:opacity .28s ease,transform .28s ease,border-color .22s ease,box-shadow .22s ease;}
      .watch-caption.speaking{bottom:14.2%;font-size:clamp(22px,2.2vw,34px);padding:.55rem .9rem;border-color:rgba(247,211,107,calc(.42 + var(--hermes-voice-rms,0) * .40));background:rgba(5,9,16,.82);box-shadow:0 0 calc(22px + var(--hermes-voice-rms,0) * 28px) rgba(247,211,107,.22),0 0 42px rgba(101,243,255,.16);color:#fff5cb;text-shadow:0 0 calc(18px + var(--hermes-voice-rms,0) * 20px) rgba(247,211,107,.48);}
      .watch-caption.quiet{opacity:0;transform:translateX(-50%) translateY(10px);}
      .watch-particle{position:absolute;width:10px;height:10px;border-radius:999px;background:rgba(132,238,255,.9);box-shadow:0 0 18px rgba(132,238,255,.78);animation:watchParticle var(--dur,900ms) cubic-bezier(.16,1,.3,1) forwards;}
      .watch-particle.feather{width:18px;height:7px;border-radius:70% 10% 70% 10%;background:rgba(207,238,255,.78);}
      .watch-particle.confetti{width:9px;height:14px;border-radius:2px;background:hsl(var(--hue,190) 88% 64%);}
      .watch-particle.star{clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);}
      @keyframes watchParticle{from{opacity:0;transform:translate3d(0,0,0) scale(.45) rotate(0deg)}12%{opacity:1}to{opacity:0;transform:translate3d(var(--dx),var(--dy),0) scale(1.08) rotate(var(--rot,120deg))}}
      .watch-winglet{position:absolute;left:calc(50% - 260px);top:42%;width:160px;height:32px;border-radius:90% 10% 90% 10%;background:linear-gradient(90deg,rgba(132,238,255,0),rgba(132,238,255,.40),rgba(255,255,255,.78));filter:blur(.2px) drop-shadow(0 0 16px rgba(132,238,255,.60));animation:watchWinglet .72s cubic-bezier(.16,1,.3,1) forwards;}
      @keyframes watchWinglet{to{left:calc(50% - 42px);opacity:0;transform:translateY(-20px) rotate(8deg)}}
      .watch-spotlight{position:absolute;inset:-20%;background:conic-gradient(from 250deg at 44% 46%,transparent 0 12%,rgba(137,213,230,.22) 16%,transparent 24% 100%);animation:watchSweep .74s ease-out forwards;}
      @keyframes watchSweep{to{transform:rotate(38deg);opacity:0}}
      .watch-arms{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);color:rgba(216,247,255,.78);font:900 120px/1 ui-monospace,Menlo,Consolas,monospace;text-shadow:0 0 24px rgba(101,243,255,.55);opacity:.82;transition:opacity .22s ease;}
      .watch-arms.quiet{opacity:0;}.watch-arms.beat{animation:watchBeat .46s ease-in-out 2;}@keyframes watchBeat{50%{transform:translate(-50%,-50%) scale(1.14) rotate(-4deg)}}
      body[data-watch-speaking="true"] .cb-eye-core{filter:drop-shadow(0 0 28px rgba(132,238,255,.95)) brightness(1.08);}body[data-watch-speaking="true"] .cb-eye-ring{animation:watchSpeakingRing .72s ease-in-out infinite alternate;}@keyframes watchSpeakingRing{to{opacity:.92;filter:drop-shadow(0 0 18px rgba(132,238,255,.68));}}
      body[data-watch-sequence]{--cb-watch-glow:1;}body[data-watch-sequence="curious_orb"] .cb-eye-core{filter:drop-shadow(0 0 24px rgba(132,238,255,.85));}body[data-watch-sequence="mini_showtime"] .cb-stage{filter:saturate(1.12) contrast(1.04);}body[data-watch-sequence="peek_a_blink"] .cb-eye-lens-contents{opacity:.82;}
      @media (prefers-reduced-motion: reduce){.watch-particle,.watch-winglet,.watch-spotlight,.watch-arms.beat{animation-duration:1ms!important}.hermes-watch-fx{mix-blend-mode:normal}.watch-particle{opacity:.42!important}}
    `;
    document.head.appendChild(style);
  }

  function timer(fn, delay) {
    const id = window.setTimeout(fn, Math.max(0, delay || 0));
    state.timers.push(id);
    return id;
  }
  function clearTimers() { for (const id of state.timers.splice(0)) window.clearTimeout(id); }

  function logEvent(payload) {
    try {
      const body = JSON.stringify({ ts: new Date().toISOString(), ...payload });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/watch-animation-log', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/watch-animation-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      }
    } catch (_) {}
  }

  function showCaption(text, ms = 1500, options = {}) {
    if (!entertainmentEnabled()) return;
    const cap = ensureLayer().querySelector('.watch-caption');
    cap.textContent = cleanText(text, 64);
    cap.classList.toggle('speaking', Boolean(options.speaking));
    cap.classList.remove('quiet');
    timer(() => { cap.classList.add('quiet'); cap.classList.remove('speaking'); }, ms);
  }

  function panForGesture(detail = {}) {
    return window.HermesAudio?.panForTouch?.(detail.zone, detail.x) ?? 0;
  }

  function playTone(freq, offsetSec, durationSec, gain, type = 'sine', detail = state.currentContext || {}) {
    const audio = window.HermesAudio;
    if (!audio || audio.isMuted?.() || audio.isQuietHours?.()) return false;
    const ctx = audio.ensureContext?.();
    if (!ctx) return false;
    const reducedScale = reducedMotion() ? 0.45 : 1;
    audio.playTone?.(freq, ctx.currentTime + Math.max(0, offsetSec || 0), Math.max(0.03, durationSec || 0.08), Math.min(gain || 0.014, 0.02) * reducedScale, type, { pan: panForGesture(detail) });
    return true;
  }
  function playSfx(asset, detail = state.currentContext || {}) {
    if (!entertainmentEnabled()) return;
    const notes = SFX[asset] || SFX['sfx-chime-soft'];
    notes.forEach(([freq, off, dur, gain]) => playTone(freq, off, dur, gain, asset === 'sfx-step' ? 'triangle' : 'sine', detail));
  }

  function canSpeakNow(lineId, options = {}) {
    if (!entertainmentEnabled()) return false;
    if (state.speaking || state.audio) return false;
    const audio = window.HermesAudio;
    if (audio?.isMuted?.()) return false;
    if (!options.force && audio?.isQuietHours?.()) return false;
    const now = Date.now();
    state.tts.hour = state.tts.hour.filter((ts) => now - ts < 3600000);
    state.tts.day = state.tts.day.filter((ts) => now - ts < 86400000);
    if (now - state.tts.lastAt < MIN_TTS_GAP_MS) return false;
    if (!options.force && lineId && state.tts.byLine[lineId] && now - state.tts.byLine[lineId] < MIN_SAME_LINE_GAP_MS) return false;
    if (state.tts.hour.length >= MAX_TTS_PER_HOUR || state.tts.day.length >= MAX_TTS_PER_DAY) return false;
    return true;
  }
  function markSpoken(lineId) {
    const now = Date.now();
    state.tts.lastAt = now;
    if (lineId) state.tts.byLine[lineId] = now;
    state.tts.hour.push(now); state.tts.day.push(now);
  }

  function speakWithBrowserFallback(text, options = {}) {
    if (window.HermesAudio?.isMuted?.()) return false;
    if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      // Base browser fallback keeps the previous audible setting; effective bus/reduced-motion gain is lower.
      // utterance.volume = TTS_VOLUME
      utterance.volume = TTS_VOLUME * (reducedMotion() ? 0.45 : 1);
      utterance.rate = text.length <= 5 ? 1.22 : 0.94;
      utterance.pitch = text.length <= 5 ? 1.24 : 1.05;
      utterance.onstart = () => window.HermesAudio?.startVoiceRms?.('browser_tts');
      utterance.onend = () => { window.HermesAudio?.stopVoiceRms?.('browser_tts'); options.done?.(); };
      utterance.onerror = () => { window.HermesAudio?.stopVoiceRms?.('browser_tts'); options.done?.(); };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_) { return false; }
  }

  async function playAudioUrl(url, done, detail = state.currentContext || {}) {
    try {
      const audio = new Audio(url);
      audio.volume = TTS_VOLUME;
      audio.preload = 'auto';
      state.audio = audio;
      const cleanup = () => { if (state.audio === audio) state.audio = null; window.HermesAudio?.stopEntertainmentAudio?.('tts'); done?.(); };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      const played = await window.HermesAudio?.playAudioElement?.(audio, { gain: 0.34, pan: panForGesture(detail), source: 'tts' });
      if (!played) await audio.play();
      return true;
    } catch (_) {
      if (state.audio) state.audio = null;
      done?.();
      return false;
    }
  }

  async function speakLine(lineIdOrText, options = {}) {
    const text = cleanText(options.text || lineIdOrText, MAX_TTS_TEXT_CHARS);
    const lineId = options.lineId || (SAFE_LINE_ID.test(lineIdOrText) ? lineIdOrText : '');
    showCaption(text, 1700, { speaking: true });
    if (!canSpeakNow(lineId, options)) return false;
    window.dispatchEvent(new CustomEvent('hermes-watch-speak-start', { detail: { line_id: lineId, sequence_id: options.sequenceId || '' } }));
    state.speaking = true;
    const done = () => {
      state.speaking = false;
      window.dispatchEvent(new CustomEvent('hermes-watch-speak-stop', { detail: { line_id: lineId, sequence_id: options.sequenceId || '' } }));
    };
    try {
      const tts = await fetch('/api/hermes-entertainment/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: options.sequenceId, line_id: lineId, text, voice: options.voice || 'marin', style: options.style || 'small cheerful robot friend, clear audible kiosk voice, gentle, playful, not shouty' })
      }).then((r) => r.json()).catch(() => null);
      if (tts?.ok && tts.audio_url) {
        markSpoken(lineId);
        logEvent({ event: 'tts_played', sequence_id: options.sequenceId, line_id: lineId, cached: Boolean(tts.cached) });
        return playAudioUrl(tts.audio_url, done, options.gesture || state.currentContext || {});
      }
      logEvent({ event: 'tts_fallback', sequence_id: options.sequenceId, line_id: lineId, cached: false });
      if (speakWithBrowserFallback(text, { done })) { markSpoken(lineId); return true; }
    } catch (_) {}
    timer(done, Math.max(500, text.length * 70));
    return false;
  }

  function particle(kind = 'sparkle', count = 14, origin = state.currentContext || {}) {
    if (!entertainmentEnabled()) return;
    const layer = ensureLayer();
    const reduced = reducedMotion();
    const intensity = Math.max(0.15, Math.min(1, Number(origin.intensity) || 0.6));
    const limit = reduced ? Math.min(count, 6) : Math.max(1, Math.round(count * (0.65 + intensity * 0.55)));
    const existing = layer.querySelectorAll('.watch-particle');
    existing.forEach((node, idx) => { if (idx < Math.max(0, existing.length + limit - MAX_FX_NODES)) node.remove(); });
    const cx = Number.isFinite(origin.x) ? origin.x : window.innerWidth * 0.493;
    const cy = Number.isFinite(origin.y) ? origin.y : window.innerHeight * 0.482;
    for (let i = 0; i < limit; i += 1) {
      const p = document.createElement('i');
      p.className = `watch-particle ${kind === 'feather' ? 'feather' : kind === 'confetti' ? 'confetti' : kind === 'star' ? 'star' : ''}`;
      const a = (Math.PI * 2 * i) / Math.max(1, limit) + Math.random() * 0.7;
      const r = reduced ? 60 + Math.random() * 50 : (kind === 'confetti' ? 330 + Math.random() * 260 : 120 + Math.random() * 230);
      p.style.left = `${cx + Math.cos(a) * 60}px`; p.style.top = `${cy + Math.sin(a) * 44}px`;
      p.style.setProperty('--dx', `${Math.cos(a) * r}px`); p.style.setProperty('--dy', `${Math.sin(a) * r}px`);
      p.style.setProperty('--rot', `${90 + Math.random() * 360}deg`); p.style.setProperty('--dur', `${kind === 'confetti' ? 1200 : 820}ms`); p.style.setProperty('--hue', String(Math.round(170 + Math.random() * 120)));
      layer.appendChild(p); timer(() => p.remove(), kind === 'confetti' ? 1400 : 1000);
    }
  }

  function currentOpticTarget() {
    const packet = state.getPacket?.() || {};
    const optic = packet.optic_state_packet || packet.puppet_state_packet || {};
    const mode = window.HermesBehaviorMachine?.modeFromPacket?.(packet, 'idle_watch')
      || optic.mode
      || 'idle_watch';
    return { mode, special: optic.special || 'none' };
  }

  function setEyePosture(kind) {
    const motion = window.__HERMES_CONCEPT_B_EYE_MOTION;
    if (!motion) return;
    if (kind === 'pupil') motion.setTarget?.({ pupilScale: 1.16, irisScale: 1.05, lid: 0.02, mode: 'listening' });
    if (kind === 'lidClosed') motion.setTarget?.({ lid: 0.82, pupilScale: 0.90, mode: 'waiting_user' });
    if (kind === 'lidOpen') motion.setTarget?.({ lid: 0.01, pupilScale: 1.18, mode: 'listening' });
  }
  function settle() {
    document.body.removeAttribute('data-watch-sequence');
    document.body.removeAttribute('data-watch-speaking');
    ensureLayer().querySelector('.watch-arms')?.classList.add('quiet');
    ensureLayer().querySelector('.watch-arms')?.classList.remove('beat');
    window.__HERMES_CONCEPT_B_EYE_MOTION?.setTarget?.(currentOpticTarget());
  }

  function normalizeStep(step) {
    const event = String(step.event || step.type || '').toUpperCase();
    if (!ALLOWED_STEP_TYPES.has(event)) {
      console.warn('[HermesEntertainment] ignored unknown sequence step', event);
      return null;
    }
    return { ...step, event, at: Math.round(Number(step.at_ms ?? (Number(step.t || 0) * 1000)) || 0) };
  }
  function validateCatalog(data) {
    if (!data || !Array.isArray(data.sequences)) throw new Error('invalid_sequences_json');
    const sequences = Object.create(null);
    for (const raw of data.sequences) {
      const id = String(raw.id || '');
      if (!SAFE_SEQUENCE_ID.test(id)) throw new Error('invalid_sequence_id');
      const steps = (raw.steps || []).map(normalizeStep).filter(Boolean).sort((a, b) => a.at - b.at);
      sequences[id] = { ...raw, id, durationMs: Math.min(30000, Number(raw.duration_ms || raw.durationMs || data.max_duration_ms || 30000)), steps };
    }
    return { schemaVersion: data.schema_version, voicePacks: { ...fallbackPack, ...(data.voice_packs || {}) }, prewarm: data.prewarm || {}, sequences };
  }
  async function loadCatalog() {
    if (state.loading) return state.loading;
    state.loading = fetch('./mascot/sequences.json', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`sequences_json_${r.status}`);
        return r.json().catch((error) => { throw new Error(`invalid_sequences_json: ${error?.message || 'parse failed'}`); });
      }).then((json) => {
        const catalog = validateCatalog(json);
        state.catalog = catalog; state.sequences = catalog.sequences; state.voicePacks = catalog.voicePacks;
        window.dispatchEvent(new CustomEvent('hermes-entertainment-catalog-ready', { detail: { ids: Object.keys(state.sequences) } }));
        return catalog;
      }).catch((err) => { console.warn('[HermesEntertainment] sequence catalog unavailable', err?.message || err); return null; });
    return state.loading;
  }

  function preconditionsOk(seq) {
    if (seq.preconditions?.includes('!screen_locked') && document.hidden) return false;
    if (seq.preconditions?.includes('!tts_active') && state.speaking) return false;
    return true;
  }

  function originForStep(step) {
    return {
      x: Number.isFinite(Number(step.x)) ? Number(step.x) : (Number.isFinite(state.currentContext?.x) ? state.currentContext.x : window.innerWidth / 2),
      y: Number.isFinite(Number(step.y)) ? Number(step.y) : (Number.isFinite(state.currentContext?.y) ? state.currentContext.y : window.innerHeight / 2),
      zone: step.zone || state.currentContext?.zone || 'boop',
      side: step.side || (state.currentContext?.zone === 'right' ? 'right' : 'left'),
      pointerCount: Number(step.pointerCount || state.currentContext?.pointerCount || 1),
      intensity: Math.max(0.15, Math.min(1, Number(step.intensity ?? state.currentContext?.intensity ?? 0.6))),
      angle: Number.isFinite(state.currentContext?.angle) ? state.currentContext.angle : 0,
      distance: Number.isFinite(state.currentContext?.distance) ? state.currentContext.distance : 0,
    };
  }

  function runStep(step, seq) {
    if (!entertainmentEnabled()) return;
    const origin = originForStep(step);
    const motion = window.__HERMES_CONCEPT_B_EYE_MOTION;
    if (step.event === 'SFX') playSfx(step.asset, origin);
    else if (step.event === 'SFX_SEQ') (step.assets || step.notes?.map((n) => n.asset) || []).forEach((asset, i) => timer(() => playSfx(asset, origin), i * (step.spacing_ms || 220)));
    else if (step.event === 'SPEAK') {
      const pack = state.voicePacks[step.voice_pack] || fallbackPack.tiny_orb;
      speakLine(step.line_id || step.text, { sequenceId: seq.id, lineId: step.line_id || `${seq.id}.line`, text: step.text, voice: step.voice || pack.voice, style: step.style || pack.instructions, gesture: origin });
    } else if (step.event === 'CAPTION') showCaption(step.text || step.caption, step.dur_ms || 1400);
    else if (step.event === 'PARTICLE') particle(step.kind || step.type || 'sparkle', step.count || 14, origin);
    else if (step.event === 'TRAIL') { const w = document.createElement('i'); w.className = 'watch-winglet'; ensureLayer().appendChild(w); timer(() => w.remove(), step.dur_ms || 900); }
    else if (step.event === 'SPOTLIGHT') { const s = document.createElement('i'); s.className = 'watch-spotlight'; ensureLayer().appendChild(s); timer(() => s.remove(), step.dur_ms || 900); }
    else if (step.event === 'GAZE') (step.targets || [step.target]).filter(Boolean).forEach((target, i) => timer(() => motion?.forceGaze?.(target, step.hold_ms || 340), i * (step.spacing_ms || 180)));
    else if (step.event === 'BLINK') { if (String(step.style || '').includes('close')) setEyePosture('lidClosed'); else if (String(step.style || '').includes('open')) setEyePosture('lidOpen'); else motion?.blinkNow?.(); }
    else if (step.event === 'WINK') motion?.blinkNow?.();
    else if (step.event === 'POSE') setEyePosture(step.kind || 'pupil');
    else if (step.event === 'PULSE') { if (step.kind === 'beat') ensureLayer().querySelector('.watch-arms')?.classList.add('beat'); else motion?.pulse?.(step.kind || 'notice'); }
    else if (step.event === 'GLOW') motion?.pulse?.(step.kind || 'complete');
    else if (step.event === 'ARMS') ensureLayer().querySelector('.watch-arms')?.classList.toggle('quiet', !step.visible);
    else if (step.event === 'CONSTELLATION') particle('star', 3, origin);
    else if (step.event === 'RIPPLE') window.HermesTouchFxController?.spawnEffect?.({ type: 'ripple', zone: origin.zone || 'boop', x: origin.x, y: origin.y, intensity: origin.intensity }) || motion?.pulse?.('notice');
    else if (step.event === 'COMET') window.HermesTouchFxController?.spawnEffect?.({ type: 'comet', side: origin.side || 'left', x: origin.x, y: origin.y, intensity: origin.intensity }) || motion?.pulse?.('notice');
    else if (step.event === 'ORBIT') window.HermesTouchFxController?.spawnEffect?.({ type: 'orbit', zone: origin.zone || 'boop', x: origin.x, y: origin.y, intensity: origin.intensity }) || motion?.pulse?.('notice');
    else if (step.event === 'IDLE') settle();
  }

  function abortCurrent() {
    window.clearTimeout(state.idleAttractTimer);
    state.idleAttractTimer = 0;
    if (!state.current) return false;
    const seqId = state.current;
    clearTimers();
    try { window.speechSynthesis?.cancel?.(); } catch (_) {}
    try { state.audio?.pause?.(); } catch (_) {}
    state.audio = null; state.speaking = false; state.current = null; state.currentContext = null; settle();
    logEvent({ event: 'sequence_aborted', sequence_id: seqId, aborted: true });
    window.dispatchEvent(new CustomEvent('hermes-watch-sequence-abort', { detail: { sequence_id: seqId } }));
    return true;
  }

  function playSequence(sequenceId, detail = {}) {
    if (!entertainmentEnabled()) return false;
    const seq = state.sequences[sequenceId];
    if (!seq || !preconditionsOk(seq)) return false;
    abortCurrent();
    state.currentContext = {
      trigger: detail.trigger || '',
      zone: detail.zone || 'center',
      x: Number(detail.x) || window.innerWidth / 2,
      y: Number(detail.y) || window.innerHeight / 2,
      pointerCount: Number(detail.pointerCount) || 1,
      intensity: Math.max(0.15, Math.min(1, Number(detail.intensity) || 0.6)),
      angle: Number.isFinite(Number(detail.angle)) ? Number(detail.angle) : 0,
      distance: Number.isFinite(Number(detail.distance)) ? Number(detail.distance) : 0,
    };
    state.current = seq.id; document.body.dataset.watchSequence = seq.id; ensureLayer();
    logEvent({ event: 'sequence_started', sequence_id: seq.id, aborted: false });
    window.dispatchEvent(new CustomEvent('hermes-watch-sequence-start', { detail: { sequence_id: seq.id, trigger: detail.trigger || '' } }));
    for (const step of seq.steps) timer(() => runStep(step, seq), step.at || 0);
    timer(() => { state.current = null; settle(); }, Math.min(30000, seq.durationMs + 360));
    return true;
  }

  async function preloadPack(packId) {
    await loadCatalog();
    if (!entertainmentEnabled() || window.HermesAudio?.isMuted?.() || window.HermesAudio?.isQuietHours?.()) return false;
    const lines = state.catalog?.prewarm?.[packId] || [];
    for (const line of lines.slice(0, 3)) {
      fetch('/api/hermes-entertainment/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequence_id: packId, line_id: `${packId}.prewarm`, text: line, voice: 'marin', style: fallbackPack.tiny_orb.instructions }) }).catch(() => {});
    }
    return true;
  }

  function nudgeEye(zone) {
    const renderer = state.renderer;
    renderer?.reactToTouch?.(zone, { intent: zone === 'left' ? 'glance_left' : zone === 'right' ? 'glance_right' : 'tiny_perk', holdMs: 700 }) ||
      (renderer?.pulseGaze?.(zone === 'left' ? 'glance_left' : zone === 'right' ? 'glance_right' : 'forward_focus', 700), renderer?.triggerIntent?.('tiny_perk'));
  }
  function classifyFunTouch(event) {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const x = event.clientX / w, y = event.clientY / h;
    const dx = event.clientX - (w * 0.493), dy = event.clientY - (h * 0.482), radius = Math.min(w, h) * 0.289;
    if ((dx * dx) + (dy * dy) <= radius * radius) return 'center';
    if (x < 0.32 && y > 0.12 && y < 0.90) return 'left';
    if (x > 0.68 && y > 0.12 && y < 0.90) return 'right';
    if (y < 0.22) return 'sky'; if (y > 0.80) return 'floor'; return 'field';
  }

  function sequenceForTap(zone, mode = currentMode(), gesture = {}) {
    const normalizedZone = normalizeGestureZone(zone);
    if (normalizedZone === 'center' && mode === 'tool_shell') return 'tool_grid_sparkle';
    if ((normalizedZone === 'field' || gesture.type === 'drag') && mode === 'searching') return 'searchlight_squid';
    if (normalizedZone === 'sky') return 'star_garden';
    if (normalizedZone === 'floor') return 'sleepy_lantern';
    if (normalizedZone === 'left') return 'feathered_flyby';
    if (normalizedZone === 'right') return 'mini_showtime';
    if (normalizedZone === 'field') return 'magnet_motes';
    return 'curious_orb';
  }

  function rememberTapZone(zone) {
    state.gesture.lastZones.push(normalizeGestureZone(zone));
    state.gesture.lastZones = state.gesture.lastZones.slice(-8);
  }

  function routePlayMemoryPayoff(gesture = {}) {
    const zones = state.gesture.lastZones;
    if (zones.slice(-3).join('-') === 'left-right-left') {
      state.gesture.lastZones = [];
      return playSequence('comet_ping_pong', { ...gesture, trigger: 'pattern:left-right-left', zone: 'field' });
    }
    return false;
  }

  function triggerTouchFx(eventOrGesture) {
    if (!entertainmentEnabled()) return false;
    const zone = typeof eventOrGesture === 'string' ? eventOrGesture : classifyFunTouch(eventOrGesture);
    if (zone === 'micro_show') return runMicroShow();
    if (zone === 'creature') { maybeCreatureGreeting(); return true; }
    if (zone === 'constellation') return handleConstellationLongPress();
    if (zone === 'rhythm') return echoRhythm();
    const seq = sequenceForTap(zone, currentMode(), { type: 'tap', zone });
    return playSequence(seq, { trigger: `tap:${zone}:single`, zone });
    nudgeEye(zone); return true;
  }

  function normalizeGestureZone(zone) {
    if (zone === 'boop') return 'center';
    return zone || 'field';
  }

  function canRunMultiPayoff(now = Date.now()) {
    if (now - state.gesture.lastMultiPayoffAt < MULTI_PAYOFF_GAP_MS) return false;
    state.gesture.lastMultiPayoffAt = now;
    return true;
  }

  function canRunPinchPayoff(now = Date.now()) {
    if (now - state.gesture.lastPinchPayoffAt < 900) return false;
    state.gesture.lastPinchPayoffAt = now;
    return true;
  }

  function routeEntertainmentGesture(gesture = {}) {
    if (!entertainmentEnabled()) return false;
    const type = String(gesture.type || 'tap');
    const zone = normalizeGestureZone(gesture.zone);
    if (type === 'three_finger_tap') {
      window.clearTimeout(state.gesture.centerTapTimer);
      abortCurrent();
      return runMicroShow(gesture);
    }
    if (type === 'tap_pattern') {
      window.clearTimeout(state.gesture.centerTapTimer);
      if (gesture.pattern === 'left-right-left') return playSequence('comet_ping_pong', { ...gesture, trigger: 'pattern:left-right-left', zone: 'field' });
      return false;
    }
    if (type === 'multi_touch') {
      window.clearTimeout(state.gesture.centerTapTimer);
      if (!canRunMultiPayoff()) return true;
      return playSequence('orbital_ring', { ...gesture, trigger: 'multi_touch:two_finger', zone: 'field' }) || (nudgeEye('field'), true);
    }
    if (type === 'spread' || type === 'pinch') {
      window.clearTimeout(state.gesture.centerTapTimer);
      if (!canRunPinchPayoff()) return true;
      if (type === 'spread') return playSequence('mirror_wave', { ...gesture, trigger: 'multi_touch:spread', zone: 'field' }) || (nudgeEye('field'), true);
      playSfx('sfx-inhale-soft', gesture);
      window.__HERMES_CONCEPT_B_EYE_MOTION?.pulse?.('notice');
      nudgeEye('field');
      return true;
    }
    if (type === 'long_press') {
      window.clearTimeout(state.gesture.centerTapTimer);
      if (zone === 'center') return handleConstellationLongPress(gesture) || playSequence('peek_a_blink', { ...gesture, trigger: 'longpress:center:>500ms' });
      nudgeEye(zone);
      return true;
    }
    if (type !== 'tap') return false;
    const now = Date.now();
    state.lastTouchAt = now;
    rememberTapZone(zone);
    if (routePlayMemoryPayoff(gesture)) return true;
    state.rhythm.push(now);
    state.rhythm = state.rhythm.slice(-8);
    if (echoRhythm()) return true;
    if (zone !== 'center') {
      const seq = sequenceForTap(zone, currentMode(), gesture);
      return playSequence(seq, { ...gesture, trigger: `tap:${zone}:single`, zone }) || (nudgeEye(zone), true);
    }
    if (zone !== 'center') { nudgeEye(zone); return true; }
    window.clearTimeout(state.gesture.centerTapTimer);
    if (state.gesture.lastCenterTapAt && now - state.gesture.lastCenterTapAt < 320) {
      state.gesture.lastCenterTapAt = 0;
      return playSequence('mini_showtime', { ...gesture, trigger: 'tap:center:double', zone });
    }
    state.gesture.lastCenterTapAt = now;
    state.gesture.centerTapTimer = window.setTimeout(() => {
      state.gesture.lastCenterTapAt = 0;
      const seq = sequenceForTap(zone, currentMode(), gesture);
      playSequence(seq, { ...gesture, trigger: 'tap:center:single', zone });
    }, 180);
    return true;
  }

  function installTouchControls(options = {}) {
    if (state.installedTouch || !kioskEnabled() || !entertainmentEnabled()) return false;
    state.renderer = options.renderer || state.renderer;
    state.getPacket = typeof options.getPacket === 'function' ? options.getPacket : state.getPacket;
    state.installedTouch = true;
    document.body.style.touchAction = 'none';
    document.body.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('hermes-touch-gesture', (event) => routeEntertainmentGesture(event.detail || {}));
    return true;
  }


  async function maybeGenerateLine(trigger, mode) {
    const now = Date.now();
    if (now - state.generatedLastAt < GENERATED_CONTENT_GAP_MS) return null;
    state.generatedLastAt = now;
    return fetch('/api/hermes-entertainment/line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger, mode, age_band: 'family', style: 'tiny friendly robot companion', max_chars: 48 }) }).then((r) => r.json()).catch(() => null);
  }

  function echoRhythm() {
    const now = Date.now();
    state.rhythm = state.rhythm.filter((ts) => now - ts < 4200);
    if (state.rhythm.length < 5 || state.rhythm.length > 8) return false;
    const first = state.rhythm[0];
    const offsets = state.rhythm.map((ts) => Math.max(0, Math.min(1.8, (ts - first) / 1000)));
    const gesture = state.currentContext || { zone: 'center', trigger: 'pattern:rhythm' };
    playSequence('tiny_drum_echo', { ...gesture, trigger: 'pattern:five-rhythm-taps', zone: gesture.zone || 'center' });
    offsets.forEach((offset, i) => playTone(360 + (i % 3) * 120, offset, 0.07, 0.012, 'triangle', gesture));
    particle('star', Math.min(12, state.rhythm.length + 3), gesture);
    maybeGenerateLine('rhythm', currentMode()).then((line) => {
      const text = line?.ok ? line.line : 'Tiny robot drum solo.';
      if (text) speakLine('rhythm.name', { sequenceId: 'curious_orb', lineId: 'rhythm.name', text, voice: 'marin', style: fallbackPack.space_bug.instructions });
    });
    state.rhythm = [];
    return true;
  }

  function handleConstellationLongPress(gesture = {}) {
    const now = Date.now();
    state.constellation = state.constellation.filter((star) => now - star.ts < 90000);
    state.constellation.push({ ts: now });
    particle('star', Math.min(8, 2 + state.constellation.length));
    if (state.constellation.length < 3) return false;
    state.constellation = [];
    playSequence('constellation_named', { ...gesture, trigger: 'pattern:third-long-press', zone: gesture.zone || 'center' });
    maybeGenerateLine('constellation', currentMode()).then((line) => {
      const text = line?.ok ? line.line : 'The Wiggly Spoon Nebula.';
      speakLine('constellation.name', { sequenceId: 'constellation_named', lineId: 'constellation.name', text, voice: 'cedar', style: fallbackPack.sleepy_star.instructions, gesture });
    });
    return true;
  }

  async function creatureOfTheDay() {
    const today = new Date().toISOString().slice(0, 10);
    const cached = state.creatureDay || (() => {
      try { return JSON.parse(window.sessionStorage.getItem('hermes-creature-of-day') || 'null'); } catch (_) { return null; }
    })();
    if (cached?.date === today) return cached.creature;
    try {
      const remote = await fetch('/api/hermes-entertainment/daily-creature', { cache: 'no-store' }).then((r) => r.json());
      if (remote?.name && remote?.line) {
        state.creatureDay = { date: today, creature: remote };
        try { window.sessionStorage.setItem('hermes-creature-of-day', JSON.stringify(state.creatureDay)); } catch (_) {}
        return remote;
      }
    } catch (_) {}
    const names = ['Zibble', 'Momo', 'Piploo', 'Nimbit', 'Orbsy'];
    const themes = ['blue-green', 'soft gold', 'moon cyan', 'tiny violet', 'warm teal'];
    const idx = today.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % names.length;
    const creature = { name: names[idx], color_theme: themes[idx], sound: 'chirp', favorite_motion: 'spiral', line: `${names[idx]} found a sparkle!`, sequence_hint: 'daily_creature_visit' };
    state.creatureDay = { date: today, creature };
    try { window.sessionStorage.setItem('hermes-creature-of-day', JSON.stringify(state.creatureDay)); } catch (_) {}
    return creature;
  }

  async function maybeCreatureGreeting() {
    const now = Date.now();
    if (now - state.partyLastAt < PARTY_BURST_GAP_MS) return;
    state.partyLastAt = now;
    const creature = await creatureOfTheDay();
    showCaption(creature.line, 1600);
    particle('sparkle', 10);
    if (creature.sequence_hint && state.sequences[creature.sequence_hint]) playSequence(creature.sequence_hint, { trigger: 'daily_creature', zone: 'center' });
  }

  async function runMicroShow(detail = {}, title = 'Moonbeam Parade') {
    const now = Date.now();
    if (now - state.partyLastAt < PARTY_BURST_GAP_MS) return false;
    state.partyLastAt = now;
    const origin = {
      trigger: detail.trigger || 'micro_show',
      zone: detail.zone || 'center',
      x: Number.isFinite(Number(detail.x)) ? Number(detail.x) : window.innerWidth / 2,
      y: Number.isFinite(Number(detail.y)) ? Number(detail.y) : window.innerHeight / 2,
      pointerCount: Number(detail.pointerCount) || 3,
      intensity: Math.max(0.15, Math.min(1, Number(detail.intensity) || 0.85)),
      angle: Number.isFinite(Number(detail.angle)) ? Number(detail.angle) : 0,
      distance: Number.isFinite(Number(detail.distance)) ? Number(detail.distance) : 0,
    };
    const show = await fetch('/api/hermes-entertainment/micro-show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trigger: 'micro_show', mode: currentMode() }) }).then((r) => r.json()).catch(() => null);
    if (show?.steps?.length) {
      showCaption(show.title || title, 1400);
      const seq = { id: 'micro_show.generated', durationMs: Math.min(12000, Number(show.duration_ms) || 4200), steps: show.steps.map(normalizeStep).filter(Boolean).sort((a, b) => a.at - b.at) };
      state.currentContext = origin;
      seq.steps.forEach((step) => timer(() => runStep(step, seq), step.at || 0));
      if (show.line) timer(() => speakLine('micro_show.line', { sequenceId: 'mini_showtime', lineId: 'micro_show.line', text: show.line, voice: 'coral', style: fallbackPack.mini_announcer.instructions, gesture: origin }), 900);
      timer(() => { state.currentContext = null; settle(); }, seq.durationMs + 360);
      return true;
    }
    showCaption(title, 1400);
    state.currentContext = origin;
    particle('star', 16, origin);
    timer(() => window.__HERMES_CONCEPT_B_EYE_MOTION?.forceGaze?.('augury_left', 420), 700);
    timer(() => playSfx('sfx-chime-soft', origin), 1100);
    timer(() => window.__HERMES_CONCEPT_B_EYE_MOTION?.forceGaze?.('route_right', 420), 1500);
    timer(() => particle('confetti', 18, origin), 2100);
    maybeGenerateLine('micro_show', currentMode()).then((line) => {
      const text = line?.ok ? line.line : 'Moonbeam parade!';
      speakLine('micro_show.line', { sequenceId: 'mini_showtime', lineId: 'micro_show.line', text, voice: 'coral', style: fallbackPack.mini_announcer.instructions, gesture: origin });
    });
    return true;
  }

  function currentMode() {
    return String(window.__HERMES_DISPLAY_BEHAVIOR?.mode || document.body.dataset.mode || 'idle_watch');
  }

  function getDebugState() {
    return { enabled: entertainmentEnabled(), current: state.current, speaking: state.speaking, ids: Object.keys(state.sequences), ttsHour: state.tts.hour.length, ttsDay: state.tts.day.length, installedTouch: state.installedTouch, reduced: reducedMotion() };
  }

  function safeForIdleAttract() {
    const mode = currentMode();
    const packet = state.getPacket?.() || {};
    const overlays = window.__HERMES_DISPLAY_BEHAVIOR?.overlays || {};
    if (!window.HermesActivityTrace?.allowsIdlePerformance({
      mode,
      freshness: packet.live?.freshness?.tier || 'unknown',
      health: overlays.health,
      quiet: overlays.quiet,
      hidden: document.hidden,
    })) return false;
    if (state.speaking || state.current || reducedMotion()) return false;
    const budget = window.HermesTouchFxController?.entertainmentBudget?.() || 'high';
    return budget !== 'low';
  }

  function scheduleIdleAttract() {
    window.clearTimeout(state.idleAttractTimer);
    state.idleAttractTimer = 0;
    const delay = 60000 + Math.round(Math.random() * 60000);
    state.idleAttractTimer = window.setTimeout(() => {
      state.idleAttractTimer = 0;
      const now = Date.now();
      if (now - state.lastTouchAt > 20000 && now - state.lastIdleAttractAt > 55000 && safeForIdleAttract()) {
        state.lastIdleAttractAt = now;
        const sequence = window.HermesActivityTrace.chooseIdleSequence(state.lastIdleSequence);
        if (playSequence(sequence, { trigger: 'idle:attract', zone: 'center', intensity: 0.35 })) state.lastIdleSequence = sequence;
      }
      scheduleIdleAttract();
    }, delay);
  }

  const api = { playSequence, speakLine, preloadPack, triggerTouchFx, getDebugState, abort: abortCurrent, loadCatalog, installTouchControls, routeEntertainmentGesture, sequenceForTap, setCatalog: (json) => { const catalog = validateCatalog(json); state.catalog = catalog; state.sequences = catalog.sequences; state.voicePacks = catalog.voicePacks; return catalog; }, ids: () => Object.keys(state.sequences), sequences: () => state.sequences };
  window.HermesEntertainment = Object.freeze(api);
  const watchApi = {
    play: (...args) => window.HermesEntertainment.playSequence(...args),
    abort: () => window.HermesEntertainment.abort?.(),
    isPlaying: () => Boolean(state.current),
    isSpeaking: () => Boolean(state.speaking),
    ids: () => api.ids(),
    get sequences() { return state.sequences; }
  };
  window.HermesWatchSequences = Object.freeze(watchApi);
  window.addEventListener('sensor:motion:entry', () => {
    // Notice the person before performing for them. The short delay preserves a readable
    // acknowledgment beat and keeps room-entry presence useful even when entertainment is off.
    window.__HERMES_CONCEPT_B_EYE_MOTION?.acknowledgeViewer?.('presence', 1400);
    if (!entertainmentEnabled()) return;
    timer(() => {
      playSequence('daily_creature_visit', { trigger: 'sensor:motion:entry:first-daily', zone: 'center' })
        || playSequence('peek_a_blink', { trigger: 'sensor:motion:entry' });
    }, 220);
  });
  window.addEventListener('hermes-watch-abort', abortCurrent);
  window.addEventListener('hermes-live-packet', () => {
    // Only automatic idle performances are interrupted; deliberate touch play
    // keeps its existing behavior. Observe the packet because this listener can
    // run before the panel has synchronized the behavior service.
    const packet = state.getPacket?.() || {};
    const mode = window.HermesBehaviorMachine?.modeFromPacket?.(packet);
    if (state.currentContext?.trigger === 'idle:attract' &&
        (mode !== 'idle_watch' || packet.live?.freshness?.tier !== 'fresh' || document.hidden)) {
      abortCurrent();
      scheduleIdleAttract();
    }
  });
  window.addEventListener('hermes-watch-speak-start', () => { document.body.dataset.watchSpeaking = 'true'; window.__HERMES_CONCEPT_B_EYE_MOTION?.pulse?.('notice'); });
  window.addEventListener('hermes-watch-speak-stop', () => { document.body.removeAttribute('data-watch-speaking'); window.__HERMES_CONCEPT_B_EYE_MOTION?.setTarget?.(currentOpticTarget()); });
  loadCatalog().then(() => { if (entertainmentEnabled()) { ['curious_orb', 'feathered_flyby', 'mini_showtime', 'peek_a_blink', 'aurora_breath'].forEach((id, idx) => timer(() => preloadPack(id), 3000 + idx * 1000)); scheduleIdleAttract(); } });
})();
