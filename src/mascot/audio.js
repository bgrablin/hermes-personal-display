(() => {
  const STORAGE_KEY = 'hermes-display-audio-muted-v2';
  const QUIET_START_HOUR = 21;
  const QUIET_END_HOUR = 8;
  const ENTERTAINMENT_MASTER_GAIN = 0.28;
  const TTS_GAIN = 0.34;
  const SFX_GAIN = 0.16;
  const REVIEW_PROOF_GAIN = 0.50;

  class HermesAudio {
    constructor() {
      this.ctx = null;
      this.lastAnyAt = 0;
      this.lastAttentionAt = 0;
      this.lastTempAt = 0;
      this.lastClickAt = 0;
      this.entertainmentBus = null;
      this.voiceRaf = 0;
      this.voiceRms = 0;
      window.__HERMES_VOICE_RMS = 0;
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
    }

    isMuted() {
      return this.muted;
    }

    setMuted(value) {
      this.muted = Boolean(value);
      window.localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
      window.dispatchEvent(new CustomEvent('hermes-audio-muted', { detail: { muted: this.muted } }));
      return this.muted;
    }

    toggleMuted() {
      return this.setMuted(!this.muted);
    }

    isQuietHours() {
      const hour = new Date().getHours();
      return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
    }

    canPlay(kind, critical = false) {
      if (this.muted) return false;
      if (!critical && this.isQuietHours()) return false;
      const now = Date.now();
      if (now - this.lastAnyAt < 20000) return false;
      if (kind === 'attention' && now - this.lastAttentionAt < 60000) return false;
      if (kind === 'temp' && now - this.lastTempAt < 300000) return false;
      return true;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.ctx = new AudioContext();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    playTone(freq, start, duration, gain = 0.035, type = 'sine', options = {}) {
      const ctx = this.ensureContext();
      if (!ctx) return false;
      const bus = this.createEntertainmentBus();
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const panValue = Number.isFinite(options.pan) ? options.pan : 0;
      const reducedGain = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0.45 : 1;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * SFX_GAIN * reducedGain), start + 0.025);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      const sourcePan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (sourcePan) sourcePan.pan.setValueAtTime(panValue, start);
      if (sourcePan) osc.connect(amp).connect(sourcePan).connect(bus?.input || ctx.destination);
      else osc.connect(amp).connect(bus?.input || ctx.destination);
      this.publishPanEvent('tone', panValue, { freq, start, duration, gain });
      osc.start(start);
      osc.stop(start + duration + 0.03);
      return true;
    }

    panForTouch(zone, x = window.innerWidth / 2) {
      if (zone === 'left') return -0.65;
      if (zone === 'right') return 0.65;
      const width = Math.max(1, window.innerWidth || 1);
      return Math.max(-0.75, Math.min(0.75, ((Number(x) || width / 2) / width - 0.5) * 1.5));
    }

    createEntertainmentBus() {
      const ctx = this.ensureContext();
      if (!ctx) return null;
      if (this.entertainmentBus) return this.entertainmentBus;
      const input = ctx.createGain();
      const analyser = ctx.createAnalyser();
      const compressor = ctx.createDynamicsCompressor();
      const master = ctx.createGain();
      analyser.fftSize = 512;
      master.gain.value = ENTERTAINMENT_MASTER_GAIN;
      input.connect(analyser);
      input.connect(compressor);
      compressor.connect(master);
      master.connect(ctx.destination);
      this.entertainmentBus = { ctx, input, analyser, compressor, master };
      return this.entertainmentBus;
    }

    publishPanEvent(source, pan, detail = {}) {
      const value = Math.max(-1, Math.min(1, Number(pan) || 0));
      window.__HERMES_LAST_AUDIO_PAN = { source, pan: value, ts: Date.now(), detail };
      window.dispatchEvent(new CustomEvent('hermes-audio-pan', { detail: { source, pan: value, ...detail } }));
    }

    publishVoiceRms(rms, source = 'tts') {
      const clamped = Math.max(0, Math.min(1, Number(rms) || 0));
      this.voiceRms = clamped;
      window.__HERMES_VOICE_RMS = clamped;
      document.documentElement.style.setProperty('--hermes-voice-rms', clamped.toFixed(3));
      window.dispatchEvent(new CustomEvent('hermes-audio-rms', { detail: { rms: clamped, source } }));
    }

    startVoiceRms(source = 'tts') {
      if (this.voiceRaf) {
        window.cancelAnimationFrame(this.voiceRaf);
        this.voiceRaf = 0;
      }
      if (source === 'browser_tts') {
        const started = performance.now();
        const tick = () => {
          const age = performance.now() - started;
          const envelope = Math.max(0.08, Math.min(0.42, 0.20 + Math.sin(age / 74) * 0.10 + Math.sin(age / 31) * 0.06));
          this.publishVoiceRms(envelope, source);
          this.voiceRaf = window.requestAnimationFrame(tick);
        };
        if (!this.voiceRaf) tick();
        return;
      }
      const bus = this.createEntertainmentBus();
      if (!bus?.analyser) return;
      const samples = new Uint8Array(bus.analyser.fftSize);
      const tick = () => {
        bus.analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const centered = (samples[i] - 128) / 128;
          sum += centered * centered;
        }
        this.publishVoiceRms(Math.sqrt(sum / Math.max(1, samples.length)), source);
        this.voiceRaf = window.requestAnimationFrame(tick);
      };
      if (!this.voiceRaf) tick();
    }

    stopVoiceRms(source = 'tts') {
      if (this.voiceRaf) window.cancelAnimationFrame(this.voiceRaf);
      this.voiceRaf = 0;
      this.publishVoiceRms(0, source);
    }

    async playAudioElement(audio, options = {}) {
      if (!audio || this.muted) return false;
      const ctx = this.ensureContext();
      const bus = this.createEntertainmentBus();
      if (!ctx || !bus) return false;
      try {
        if (!audio.__hermesSource) {
          audio.__hermesSource = ctx.createMediaElementSource(audio);
          audio.__hermesGain = ctx.createGain();
          audio.__hermesPanner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          if (audio.__hermesPanner) audio.__hermesSource.connect(audio.__hermesGain).connect(audio.__hermesPanner).connect(bus.input);
          else audio.__hermesSource.connect(audio.__hermesGain).connect(bus.input);
        }
        const gain = Number.isFinite(options.gain) ? options.gain : TTS_GAIN;
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0.45 : 1;
        audio.__hermesGain.gain.value = Math.max(0.01, gain * reduced);
        const pan = Number.isFinite(options.pan) ? options.pan : 0;
        if (audio.__hermesPanner) audio.__hermesPanner.pan.setTargetAtTime(pan, ctx.currentTime, 0.08);
        this.publishPanEvent(options.source || 'tts', pan, { gain });
        this.startVoiceRms(options.source || 'tts');
        const played = audio.play();
        if (played && typeof played.then === 'function') await played;
        return true;
      } catch (_) {
        this.stopVoiceRms(options.source || 'tts');
        return false;
      }
    }

    playReviewProof(kind = 'center', options = {}) {
      const ctx = this.ensureContext();
      if (!ctx || this.muted) return false;
      const pan = kind === 'left' ? -0.72 : kind === 'right' ? 0.72 : 0;
      const base = ctx.currentTime + (Number(options.delaySec) || 0.02);
      const freq = kind === 'left' ? 392 : kind === 'right' ? 784 : 554;
      this.playTone(freq, base, 0.42, REVIEW_PROOF_GAIN, 'triangle', { pan });
      this.playTone(freq * 1.5, base + 0.08, 0.32, REVIEW_PROOF_GAIN * 0.72, 'sine', { pan });
      return true;
    }

    playReviewVoiceProof(options = {}) {
      const ctx = this.ensureContext();
      if (!ctx || this.muted) return false;
      const bus = this.createEntertainmentBus();
      if (!bus) return false;
      const start = ctx.currentTime + (Number(options.delaySec) || 0.03);
      const duration = Math.max(2.5, Math.min(7, Number(options.durationSec) || 4.8));
      const pan = Number.isFinite(options.pan) ? options.pan : 0;
      const sourcePan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const voiceGain = ctx.createGain();
      const carrier = ctx.createOscillator();
      const formant = ctx.createOscillator();
      const shimmer = ctx.createOscillator();
      carrier.type = 'sawtooth';
      formant.type = 'triangle';
      shimmer.type = 'sine';
      carrier.frequency.setValueAtTime(165, start);
      carrier.frequency.linearRampToValueAtTime(190, start + duration * 0.42);
      carrier.frequency.linearRampToValueAtTime(145, start + duration);
      formant.frequency.setValueAtTime(510, start);
      formant.frequency.linearRampToValueAtTime(620, start + duration * 0.55);
      shimmer.frequency.setValueAtTime(920, start);
      voiceGain.gain.setValueAtTime(0.0001, start);
      voiceGain.gain.linearRampToValueAtTime(REVIEW_PROOF_GAIN * 0.24, start + 0.18);
      for (let t = 0.35; t < duration; t += 0.42) {
        const phrase = 0.10 + 0.06 * Math.sin(t * 4.7);
        voiceGain.gain.setTargetAtTime(REVIEW_PROOF_GAIN * (0.16 + phrase), start + t, 0.07);
      }
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      carrier.connect(voiceGain);
      formant.connect(voiceGain);
      shimmer.connect(voiceGain);
      if (sourcePan) {
        sourcePan.pan.setValueAtTime(pan, start);
        voiceGain.connect(sourcePan).connect(bus.input);
      } else voiceGain.connect(bus.input);
      this.publishPanEvent('voice_proof', pan, { duration });
      this.startVoiceRms('voice_proof');
      window.setTimeout(() => this.stopVoiceRms('voice_proof'), Math.round((duration + 0.2) * 1000));
      [carrier, formant, shimmer].forEach((osc) => { osc.start(start); osc.stop(start + duration + 0.05); });
      return true;
    }

    stopEntertainmentAudio(source = 'tts') {
      this.stopVoiceRms(source);
    }

    mark(kind) {
      const now = Date.now();
      this.lastAnyAt = now;
      if (kind === 'attention') this.lastAttentionAt = now;
      if (kind === 'temp') this.lastTempAt = now;
    }

    ensureClickAudioElement() {
      if (this.clickAudio) return this.clickAudio;
      const audio = new Audio('data:audio/wav;base64,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');
      audio.preload = 'auto';
      audio.volume = 0.85;
      this.clickAudio = audio;
      return audio;
    }

    playClick() {
      if (this.muted) return false;
      const now = Date.now();
      if (now - this.lastClickAt < 60) return false;
      const audio = this.ensureClickAudioElement();
      if (!audio) return false;
      try {
        audio.pause();
        audio.currentTime = 0;
        const played = audio.play();
        if (played && typeof played.catch === 'function') played.catch(() => {});
      } catch (_) {
        return false;
      }
      this.lastClickAt = now;
      return true;
    }

    installTapClick() {
      if (this.tapClickInstalled) return;
      const params = new URLSearchParams(window.location.search);
      if (['1', 'true', 'yes'].includes((params.get('kiosk') || '').toLowerCase()) &&
          (params.get('touch') || '').toLowerCase() === 'off') {
        return;
      }
      this.tapClickInstalled = true;
      document.addEventListener('pointerdown', () => this.playClick(), { capture: true, passive: true });
    }

    playAttention() {
      if (!this.canPlay('attention', true)) return false;
      const ctx = this.ensureContext();
      if (!ctx) return false;
      const t = ctx.currentTime + 0.02;
      this.playTone(740, t, 0.16, 0.045, 'triangle');
      this.playTone(988, t + 0.18, 0.22, 0.040, 'triangle');
      this.mark('attention');
      return true;
    }

    playResolved() {
      if (!this.canPlay('resolved')) return false;
      const ctx = this.ensureContext();
      if (!ctx) return false;
      const t = ctx.currentTime + 0.02;
      this.playTone(523, t, 0.13, 0.026);
      this.playTone(659, t + 0.12, 0.14, 0.026);
      this.playTone(784, t + 0.25, 0.20, 0.030);
      this.mark('resolved');
      return true;
    }

    playTempAlert() {
      if (!this.canPlay('temp', true)) return false;
      const ctx = this.ensureContext();
      if (!ctx) return false;
      const t = ctx.currentTime + 0.02;
      [0, 0.18, 0.36].forEach((offset) => this.playTone(220, t + offset, 0.11, 0.045, 'square'));
      this.mark('temp');
      return true;
    }
  }

  window.HermesAudio = new HermesAudio();
  window.HermesAudio.installTapClick();
})();
