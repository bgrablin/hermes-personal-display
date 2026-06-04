(() => {
  const SKINS = {
    'retro-robot-core': {
      palette: {
        name: 'graphite-teal',
        background: '#070A12',
        primary: '#65F3FF',
        secondary: '#2AD6A3',
        accent: '#B899FF',
        danger: '#FF4D7A',
        brightness: 0.72
      },
      glyphs: ['◇', '⌁', '◌', '✦'],
      texture: 'glass'
    },
    'retro-hermes-accent': {
      palette: {
        name: 'indigo-sigil',
        background: '#08071A',
        primary: '#72D7FF',
        secondary: '#8F7CFF',
        accent: '#E5C76B',
        danger: '#FF557C',
        brightness: 0.70
      },
      glyphs: ['☿', '✧', '⌬', '◊'],
      texture: 'sigil'
    },
    'retro-terminal-focus': {
      palette: {
        name: 'phosphor-green',
        background: '#030706',
        primary: '#63FFB8',
        secondary: '#26D6FF',
        accent: '#FFB84D',
        danger: '#FF4D7A',
        brightness: 0.76
      },
      glyphs: ['>', '_', '*', '#'],
      texture: 'scanline'
    },
    'retro-night-watch': {
      palette: {
        name: 'sleepy-navy',
        background: '#030815',
        primary: '#4DB7FF',
        secondary: '#6F7CFF',
        accent: '#E59E54',
        danger: '#C94D70',
        brightness: 0.42
      },
      glyphs: ['·', '°', '◦', '✧'],
      texture: 'hush'
    },
    'retro-amber-watch': {
      palette: {
        name: 'amber-skeptic',
        background: '#08080D',
        primary: '#F7D36B',
        secondary: '#FF9E4A',
        accent: '#FF4D7A',
        danger: '#FF335F',
        brightness: 0.80
      },
      glyphs: ['!', '×', '⚠', '…'],
      texture: 'jitter'
    }
  };

  const DISPLAY_CONTRACT = window.HermesDisplayContract || {};
  const DISPLAY_PRESETS = DISPLAY_CONTRACT.DISPLAY_PRESETS || {};

  const PRESETS = {
    idle_watchful: {
      schema_version: '0.1.0',
      generated_at: '2026-05-16T14:20:00Z',
      valid_for_seconds: 90,
      mood: 'idle_watchful',
      skin: 'retro-robot-core',
      playfulness: 0.58,
      energy: 0.28,
      focus: 0.25,
      curiosity: 0.52,
      impatience: 0.04,
      eyes: { expression: 'calm', gaze: 'wander', blink_rate: 'slow', pupil: 'soft', intensity: 0.50 },
      posture: { pose: 'hover_center', tilt: 'left_small', motion: 'breathing', orbit: 'lazy', scale: 1.0 },
      micro_actions: [{ name: 'blink_single', weight: 0.6 }, { name: 'mote_reorder', weight: 0.3 }],
      caption: { text: 'Quiet watch with opinions.', tone: 'dry', priority: 'ambient', max_width_chars: 42 },
      snippet: { id: 'idle-1', text: 'gateway quiet · cron polite', kind: 'system', sensitivity: 'display_safe' },
      duration: { transition_ms: 700 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    },
    thinking_focused: {
      schema_version: '0.1.0',
      generated_at: '2026-05-16T14:40:00Z',
      valid_for_seconds: 60,
      mood: 'thinking_focused',
      skin: 'retro-terminal-focus',
      playfulness: 0.55,
      energy: 0.64,
      focus: 0.88,
      curiosity: 0.73,
      impatience: 0.12,
      eyes: { expression: 'focused', gaze: 'track_activity', blink_rate: 'fast', pupil: 'scanline', intensity: 0.78 },
      posture: { pose: 'hover_center', tilt: 'forward', motion: 'focused_pulse', orbit: 'focused', scale: 1.02 },
      micro_actions: [{ name: 'tool_glyph_spark', weight: 0.7 }, { name: 'eye_track_right', weight: 0.45 }, { name: 'ring_pulse', weight: 0.5 }],
      caption: { text: 'Poking the machinery.', tone: 'focused', priority: 'status', max_width_chars: 42 },
      snippet: null,
      duration: { transition_ms: 350 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    },
    healthy_smug: {
      schema_version: '0.1.0',
      generated_at: '2026-05-16T14:30:05Z',
      valid_for_seconds: 90,
      mood: 'healthy_smug',
      skin: 'retro-robot-core',
      playfulness: 0.62,
      energy: 0.38,
      focus: 0.31,
      curiosity: 0.46,
      impatience: 0.05,
      eyes: { expression: 'smug', gaze: 'wander', blink_rate: 'slow', pupil: 'soft', intensity: 0.54 },
      posture: { pose: 'hover_center', tilt: 'left_small', motion: 'breathing', orbit: 'lazy', scale: 1.0 },
      micro_actions: [{ name: 'smug_nod', weight: 0.55 }, { name: 'mote_reorder', weight: 0.35 }],
      caption: { text: 'All green. I remain unconvinced.', tone: 'dry', priority: 'ambient', max_width_chars: 42 },
      snippet: { id: 'status-healthy-1', text: 'all green, suspiciously polite', kind: 'system', sensitivity: 'display_safe' },
      duration: { transition_ms: 700 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    },
    blocked_annoyed: {
      schema_version: '0.1.0',
      generated_at: '2026-05-16T14:35:05Z',
      valid_for_seconds: 75,
      mood: 'blocked_annoyed',
      skin: 'retro-amber-watch',
      playfulness: 0.72,
      energy: 0.58,
      focus: 0.66,
      curiosity: 0.28,
      impatience: 0.84,
      eyes: { expression: 'side_eye', gaze: 'left', blink_rate: 'staccato', pupil: 'pinpoint', intensity: 0.86 },
      posture: { pose: 'slumped_annoyed', tilt: 'right_small', motion: 'impatient_bounce', orbit: 'crossed', scale: 1.03 },
      micro_actions: [{ name: 'side_eye_hold', weight: 0.9 }, { name: 'glyph_arms_cross', weight: 0.75 }, { name: 'dramatic_sigh_wave', weight: 0.35 }],
      caption: { text: 'I require a human. Tragic.', tone: 'annoyed', priority: 'blocked', max_width_chars: 42 },
      snippet: { id: 'kanban-blocked-1', text: 'one blocked card is staring at us', kind: 'kanban', sensitivity: 'display_safe' },
      duration: { transition_ms: 450 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    },
    night_sleepy: {
      schema_version: '0.1.0',
      generated_at: '2026-05-16T03:12:00Z',
      valid_for_seconds: 180,
      mood: 'night_sleepy',
      skin: 'retro-night-watch',
      playfulness: 0.30,
      energy: 0.12,
      focus: 0.18,
      curiosity: 0.20,
      impatience: 0.02,
      eyes: { expression: 'sleepy', gaze: 'center', blink_rate: 'slow', pupil: 'soft', intensity: 0.32 },
      posture: { pose: 'hover_center', tilt: 'none', motion: 'slow_breathing', orbit: 'drift', scale: 0.98 },
      micro_actions: [{ name: 'sleepy_blink', weight: 0.7 }, { name: 'dim_mote_drift', weight: 0.6 }],
      caption: { text: 'Still here. Lower wattage judgment.', tone: 'sleepy', priority: 'ambient', max_width_chars: 42 },
      snippet: { id: 'night-1', text: 'quiet mode · display dimmed', kind: 'system', sensitivity: 'display_safe' },
      duration: { transition_ms: 1200 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    },
    degraded_offline: {
      schema_version: '0.1.0',
      generated_at: '2026-05-21T15:40:00Z',
      valid_for_seconds: 90,
      mood: 'degraded_offline',
      skin: 'retro-night-watch',
      playfulness: 0.18,
      energy: 0.08,
      focus: 0.34,
      curiosity: 0.16,
      impatience: 0.00,
      eyes: { expression: 'dim_offline', gaze: 'down_left', blink_rate: 'slow', pupil: 'small', intensity: 0.22 },
      posture: { pose: 'settled_low', tilt: 'left_small', motion: 'minimal_breathing', orbit: 'dim', scale: 0.98 },
      micro_actions: [{ name: 'slow_blink', weight: 0.8 }, { name: 'glance_left', weight: 0.2 }],
      caption: { text: 'Local feed degraded. Holding the last safe view.', tone: 'calm', priority: 'stale', max_width_chars: 42 },
      snippet: { id: 'degraded-offline-1', text: 'display-safe degraded state', kind: 'system', sensitivity: 'display_safe' },
      duration: { transition_ms: 1000 },
      safety: { boundary: 'local_trusted_display', redaction_level: 'display_safe', contains_credentials: false }
    }
  };

  const ALLOWED_MOODS = new Set(Object.keys(PRESETS));
  const ALLOWED_SKINS = new Set(Object.keys(SKINS));
  const MODE_OPTIC_POSTURE = DISPLAY_CONTRACT.OPTIC_STATE_BY_MODE || {};
  const OPTIC_MODES = new Set(Object.keys(MODE_OPTIC_POSTURE));
  const SECRET_PATTERN = /(api[_-]?key|token|password|passwd|secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|ghp_[a-z0-9_]+)/i;

  function clamp01(value, fallback = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(1, number));
  }

  function safeText(value, fallback, maxLength = 80) {
    const text = String(value ?? fallback ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    if (!text || SECRET_PATTERN.test(text)) return fallback;
    return text.slice(0, maxLength);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clampMotion(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeMotion(inputMotion, fallbackMotion) {
    const src = inputMotion && typeof inputMotion === 'object' ? inputMotion : {};
    const fb = fallbackMotion || DISPLAY_PRESETS.quiet_watch.motion;
    return {
      float_duration_ms: clampMotion(src.float_duration_ms, fb.float_duration_ms, 4800, 12000),
      blink_interval_ms: clampMotion(src.blink_interval_ms, fb.blink_interval_ms, 1800, 9000),
      eye_glow: clampMotion(src.eye_glow, fb.eye_glow, 0.16, 0.90),
      accent_intensity: clampMotion(src.accent_intensity, fb.accent_intensity, 0.12, 0.92),
      alert_pulse: clampMotion(src.alert_pulse, fb.alert_pulse, 0.00, 0.85),
      breath: clampMotion(src.breath, fb.breath, 0.08, 0.55),
      breath_hz: clampMotion(src.breath_hz, fb.breath_hz, 0.14, 0.70),
      wing_flap: clampMotion(src.wing_flap, fb.wing_flap, 0.02, 0.32),
      wing_hz: clampMotion(src.wing_hz, fb.wing_hz, 0.12, 0.90),
      root_y_max: clampMotion(src.root_y_max, fb.root_y_max, 0.50, 1.30),
      gaze_jitter_px: clampMotion(src.gaze_jitter_px, fb.gaze_jitter_px, 0.02, 0.12),
      reduced_motion: Boolean(src.reduced_motion || fb.reduced_motion)
    };
  }

  function presetForResolverState(state, work = {}) {
    if (state === 'critical_local_issue') return 'critical';
    if (state === 'blocked_user_task') return 'blocked';
    if (state === 'needs_attention') return 'waiting_input';
    if (state === 'planning_reasoning') return work?.visual_kind === 'planning' ? 'planning' : 'reasoning';
    if (state === 'active_work') return work?.visual_kind === 'planning' ? 'planning' : 'working';
    if (state === 'recently_completed') return 'completed';
    if (state === 'night_mode') return 'night_watch';
    if (state === 'feed_stale_degraded') return 'degraded_offline';
    return 'quiet_watch';
  }

  function severityForPacket(packet, liveStatus = {}) {
    const live = packet?.live || {};
    const resolverState = live.resolver?.display_state || live.state_reason || '';
    const freshnessTier = liveStatus.failures >= 8 ? 'lost' : liveStatus.failures ? 'stale' : live.freshness?.tier || 'fresh';
    if (packet?.state_preset === 'critical' || resolverState === 'critical_local_issue') return 'critical';
    if (['blocked', 'waiting_input'].includes(packet?.state_preset) || ['blocked_user_task', 'needs_attention'].includes(resolverState)) return 'attention';
    if (packet?.state_preset === 'feed_stale' || ['stale', 'aging', 'lost'].includes(freshnessTier)) return 'stale';
    if (packet?.state_preset === 'planning' || live.current_work?.visual_kind === 'planning') return 'active';
    if (['reasoning', 'working'].includes(packet?.state_preset) || live.current_work?.active) return 'active';
    return 'normal';
  }

  function thermalLoadForPacket(packet) {
    const sys = packet?.live?.system || {};
    const temp = Number(sys.cpu_temp_c ?? sys.temp_c ?? sys.package_temp_c);
    const cpuLoad = Number(sys.cpu ?? sys.cpu_load ?? sys.load);
    const normalizedLoad = Number.isFinite(cpuLoad) ? (cpuLoad > 1 ? cpuLoad / 100 : cpuLoad) : NaN;
    const loadAverage = Number(sys.load_average_1m ?? sys.load1 ?? sys.load_avg);
    let thermal = 'cool';
    if ((Number.isFinite(temp) && temp >= 88) || (Number.isFinite(normalizedLoad) && normalizedLoad >= 0.92) || (Number.isFinite(loadAverage) && loadAverage >= 5.5)) thermal = 'critical';
    else if ((Number.isFinite(temp) && temp >= 80) || (Number.isFinite(normalizedLoad) && normalizedLoad >= 0.78) || (Number.isFinite(loadAverage) && loadAverage >= 4.0)) thermal = 'hot';
    else if ((Number.isFinite(temp) && temp >= 72) || (Number.isFinite(normalizedLoad) && normalizedLoad >= 0.62) || (Number.isFinite(loadAverage) && loadAverage >= 2.5)) thermal = 'warm';
    return { thermal, temp_c: Number.isFinite(temp) ? temp : null, cpu_load: Number.isFinite(normalizedLoad) ? normalizedLoad : null };
  }

  function deriveAdaptiveMotion(packet, liveStatus = {}, options = {}) {
    const base = normalizeMotion(packet?.motion, DISPLAY_PRESETS[presetForResolverState(packet?.live?.resolver?.display_state, packet?.live?.current_work)]?.motion);
    const severity = severityForPacket(packet, liveStatus);
    const thermal = thermalLoadForPacket(packet);
    const reduced = Boolean(options.reducedMotion || base.reduced_motion || thermal.thermal === 'hot' || thermal.thermal === 'critical');
    const scaleByThermal = thermal.thermal === 'critical' ? 0.36 : thermal.thermal === 'hot' ? 0.48 : thermal.thermal === 'warm' ? 0.70 : 1.0;
    const scale = reduced ? Math.min(scaleByThermal, 0.42) : scaleByThermal;
    const motion = {
      ...base,
      float_duration_ms: clampMotion(base.float_duration_ms / Math.max(0.55, scale), base.float_duration_ms, 6000, 14000),
      blink_interval_ms: clampMotion(base.blink_interval_ms / Math.max(0.65, scale), base.blink_interval_ms, 2400, 11000),
      eye_glow: clampMotion(base.eye_glow * (severity === 'critical' ? 1.10 : severity === 'active' ? 1.04 : 1), base.eye_glow, 0.14, 0.86),
      accent_intensity: clampMotion(base.accent_intensity * (severity === 'critical' ? 1.10 : severity === 'active' ? 1.06 : 1) * Math.max(0.55, scale), base.accent_intensity, 0.10, 0.88),
      alert_pulse: severity === 'critical' ? Math.max(base.alert_pulse, 0.70)
        : ['attention', 'stale'].includes(severity) ? clampMotion(Math.max(base.alert_pulse, 0.18), base.alert_pulse, 0, 0.38)
        : severity === 'active' ? clampMotion(base.alert_pulse, 0.04, 0, 0.16) : 0,
      breath: clampMotion(base.breath * scale, base.breath, 0.06, 0.50),
      breath_hz: clampMotion(base.breath_hz * Math.max(0.60, scale), base.breath_hz, 0.10, 0.62),
      wing_flap: clampMotion(base.wing_flap * scale, base.wing_flap, 0.01, 0.28),
      wing_hz: clampMotion(base.wing_hz * Math.max(0.55, scale), base.wing_hz, 0.10, 0.82),
      root_y_max: clampMotion(base.root_y_max * Math.max(0.50, scale), base.root_y_max, 0.35, 1.15),
      gaze_jitter_px: clampMotion(base.gaze_jitter_px * Math.max(0.50, scale), base.gaze_jitter_px, 0.01, 0.10),
      reduced_motion: reduced
    };
    return { ...motion, severity, thermal: thermal.thermal, temp_c: thermal.temp_c, cpu_load: thermal.cpu_load };
  }

  function normalizePersonaPacket(input) {
    const source = input && typeof input === 'object' ? input : PRESETS.idle_watchful;
    const combined = source.persona_packet && typeof source.persona_packet === 'object' ? source.persona_packet : source;
    const requestedPreset = typeof combined.state_preset === 'string' ? combined.state_preset : null;
    const presetKey = DISPLAY_PRESETS[requestedPreset] ? requestedPreset : legacyPresetForMood(combined.mood);
    const displayPreset = DISPLAY_PRESETS[presetKey] || DISPLAY_PRESETS.quiet_watch;
    const moodCandidate = combined.mood || displayPreset.mood;
    const mood = ALLOWED_MOODS.has(moodCandidate) ? moodCandidate : displayPreset.mood;
    const preset = clone(PRESETS[mood]);
    const skin = ALLOWED_SKINS.has(combined.skin) ? combined.skin : (displayPreset.skin || preset.skin);
    const skinDefaults = SKINS[skin];
    const palette = { ...skinDefaults.palette, ...(combined.palette || {}) };
    const containsCredentials = Boolean(combined.safety?.contains_credentials) || SECRET_PATTERN.test(JSON.stringify(combined));
    const motion = normalizeMotion(combined.motion, displayPreset.motion);

    return {
      ...preset,
      ...combined,
      state_preset: presetKey,
      state_label: safeText(combined.state_label, displayPreset.label, 28),
      motion,
      mood,
      skin,
      playfulness: clamp01(combined.playfulness, preset.playfulness),
      energy: clamp01(combined.energy, preset.energy),
      focus: clamp01(combined.focus, preset.focus),
      curiosity: clamp01(combined.curiosity, preset.curiosity),
      impatience: clamp01(combined.impatience, preset.impatience),
      eyes: { ...preset.eyes, ...(combined.eyes || {}) },
      posture: { ...preset.posture, ...(combined.posture || {}) },
      palette: {
        name: safeText(palette.name, skinDefaults.palette.name, 36),
        background: safeText(palette.background, skinDefaults.palette.background, 16),
        primary: safeText(palette.primary, skinDefaults.palette.primary, 16),
        secondary: safeText(palette.secondary, skinDefaults.palette.secondary, 16),
        accent: safeText(palette.accent, skinDefaults.palette.accent, 16),
        danger: safeText(palette.danger, skinDefaults.palette.danger, 16),
        brightness: clamp01(palette.brightness, skinDefaults.palette.brightness)
      },
      caption: {
        ...(preset.caption || {}),
        ...(combined.caption || {}),
        text: containsCredentials ? '[redacted credential-like text]' : safeText(combined.caption?.text, preset.caption?.text, 72)
      },
      snippet: combined.snippet && !containsCredentials ? {
        ...combined.snippet,
        text: safeText(combined.snippet.text, '', 64)
      } : null,
      safety: {
        ...(preset.safety || {}),
        ...(combined.safety || {}),
        contains_credentials: containsCredentials
      },
      skinMeta: skinDefaults
    };
  }

  function legacyPresetForMood(mood) {
    if (mood === 'thinking_focused') return 'reasoning';
    if (mood === 'healthy_smug') return 'completed';
    if (mood === 'blocked_annoyed') return 'blocked';
    if (mood === 'night_sleepy') return 'night_watch';
    if (mood === 'degraded_offline') return 'degraded_offline';
    return 'quiet_watch';
  }

  function getZod() {
    const candidate = window.Zod || window.zod || window.z;
    return candidate?.z || candidate || null;
  }

  function buildOpticStateSchema(z) {
    if (!z?.object || !z?.enum || !z?.coerce?.number) return null;
    const numeric = (fallback, min, max) => z.preprocess(
      (value) => value == null || value === '' ? fallback : value,
      z.coerce.number().catch(fallback).transform((value) => clampMotion(value, fallback, min, max))
    );
    return z.object({
      mode: z.enum(Array.from(OPTIC_MODES)),
      attention: z.object({
        target: z.preprocess((value) => safeText(value, 'center', 32), z.string()),
        continuity_id: z.preprocess((value) => safeText(value, '', 48), z.string()),
      }).partial().default({}),
      optic: z.object({
        aperture_open: numeric(0.72, 0, 1),
        pupil_x: numeric(0, -1, 1),
        pupil_y: numeric(0, -1, 1),
        ring_motion_budget: numeric(0.35, 0, 1),
        glow: numeric(0.45, 0, 1),
      }).partial().default({}),
      caption: z.object({
        text: z.preprocess((value) => {
          return window.HermesSanitize?.captionText
            ? window.HermesSanitize.captionText(value, '', 96)
            : safeText(value, '', 96);
        }, z.string()),
        visibility: z.enum(['visible', 'hidden']).catch('visible'),
      }).partial().default({}),
    });
  }

  function validationErrorsFromZod(error) {
    const issues = error?.issues || [];
    if (!issues.length) return ['invalid optic state packet'];
    return issues.map((issue) => `${issue.path?.join('.') || 'packet'}: ${issue.message}`);
  }

  function validateOpticStatePacketFallback(input) {
    const errors = [];
    const source = input && typeof input === 'object' ? input : {};
    const mode = typeof source.mode === 'string' && OPTIC_MODES.has(source.mode) ? source.mode : null;
    if (!mode) errors.push(`invalid mode: ${source.mode ?? '<missing>'}`);

    const attentionSource = source.attention && typeof source.attention === 'object' ? source.attention : {};
    const opticSource = source.optic && typeof source.optic === 'object' ? source.optic : {};
    const captionSource = source.caption && typeof source.caption === 'object' ? source.caption : {};
    const captionText = window.HermesSanitize?.captionText
      ? window.HermesSanitize.captionText(captionSource.text, '', 96)
      : safeText(captionSource.text, '', 96);

    return {
      ok: errors.length === 0,
      errors,
      validator: 'fallback',
      packet: {
        mode: mode || 'idle_watch',
        attention: {
          target: safeText(attentionSource.target, 'center', 32),
          continuity_id: safeText(attentionSource.continuity_id, '', 48),
        },
        optic: {
          aperture_open: clampMotion(opticSource.aperture_open, 0.72, 0, 1),
          pupil_x: clampMotion(opticSource.pupil_x, 0, -1, 1),
          pupil_y: clampMotion(opticSource.pupil_y, 0, -1, 1),
          ring_motion_budget: clampMotion(opticSource.ring_motion_budget, 0.35, 0, 1),
          glow: clampMotion(opticSource.glow, 0.45, 0, 1),
        },
        caption: {
          text: captionText,
          visibility: captionSource.visibility === 'hidden' ? 'hidden' : 'visible',
        },
      },
    };
  }

  function validateOpticStatePacket(input) {
    const z = getZod();
    const schema = buildOpticStateSchema(z);
    if (!schema?.safeParse) return validateOpticStatePacketFallback(input);
    const result = schema.safeParse(input && typeof input === 'object' ? input : {});
    if (!result.success) {
      const fallback = validateOpticStatePacketFallback(input);
      return { ...fallback, ok: false, errors: validationErrorsFromZod(result.error) };
    }
    const packet = result.data;
    return {
      ok: true,
      errors: [],
      validator: 'zod',
      packet: {
        mode: packet.mode,
        attention: {
          target: safeText(packet.attention?.target, 'center', 32),
          continuity_id: safeText(packet.attention?.continuity_id, '', 48),
        },
        optic: {
          aperture_open: clampMotion(packet.optic?.aperture_open, 0.72, 0, 1),
          pupil_x: clampMotion(packet.optic?.pupil_x, 0, -1, 1),
          pupil_y: clampMotion(packet.optic?.pupil_y, 0, -1, 1),
          ring_motion_budget: clampMotion(packet.optic?.ring_motion_budget, 0.35, 0, 1),
          glow: clampMotion(packet.optic?.glow, 0.45, 0, 1),
        },
        caption: {
          text: safeText(packet.caption?.text, '', 96),
          visibility: packet.caption?.visibility === 'hidden' ? 'hidden' : 'visible',
        },
      },
    };
  }

  function opticPacketToPersonaPacket(opticPacket, basePacket = {}) {
    const validation = validateOpticStatePacket(opticPacket);
    const packet = validation.packet;
    const behavior = window.HermesBehaviorMachine;
    const mapped = behavior?.packetForMode ? behavior.packetForMode(packet.mode, basePacket) : {
      ...basePacket,
      behavior_mode: packet.mode,
      state_preset: packet.mode === 'blocked' ? 'blocked' : packet.mode === 'waiting_user' ? 'waiting_input' : packet.mode === 'complete' ? 'completed' : packet.mode === 'degraded_offline' ? 'degraded_offline' : ['tool_shell', 'searching', 'writing'].includes(packet.mode) ? 'working' : packet.mode === 'idle_watch' ? 'quiet_watch' : 'reasoning',
    };
    const displayPreset = DISPLAY_PRESETS[mapped.state_preset] || {};
    const opticProvided = Boolean(opticPacket?.optic && typeof opticPacket.optic === 'object');
    const baselineAccent = displayPreset.motion?.accent_intensity ?? mapped.motion?.accent_intensity ?? 0.2;
    const richOptic = { ...(MODE_OPTIC_POSTURE[packet.mode] || MODE_OPTIC_POSTURE.idle_watch), ...packet };
    return normalizePersonaPacket({
      ...mapped,
      mood: displayPreset.mood || mapped.mood,
      skin: displayPreset.skin || mapped.skin,
      state_label: displayPreset.label || mapped.state_label,
      caption: {
        ...(mapped.caption || {}),
        text: packet.caption.text || mapped.caption?.text,
      },
      motion: {
        ...(mapped.motion || {}),
        ...(displayPreset.motion || {}),
        eye_glow: opticProvided ? packet.optic.glow : (displayPreset.motion?.eye_glow ?? mapped.motion?.eye_glow ?? packet.optic.glow),
        accent_intensity: opticProvided ? Math.max(baselineAccent, packet.optic.ring_motion_budget) : baselineAccent,
        gaze_jitter_px: opticProvided ? Math.max(0.02, Math.min(0.12, packet.optic.ring_motion_budget * 0.12)) : (displayPreset.motion?.gaze_jitter_px ?? mapped.motion?.gaze_jitter_px ?? 0.05),
      },
      // Re-attach the rich per-mode posture (halo/ring/breath/blink/eyes/gaze/special).
      // The narrow optic schema only carries {mode, attention, optic, caption}, so without
      // this the eye renders flat idle posture for every previewed mode. Explicit fields on
      // the incoming packet still win over the table default. Mirror the same rich posture
      // into puppet_state_packet for older renderer paths that still read the legacy key.
      optic_state_packet: richOptic,
      puppet_state_packet: { ...(mapped.puppet_state_packet || {}), ...richOptic },
    });
  }

  window.HermesDisplayState = {
    SKINS,
    PRESETS,
    DISPLAY_PRESETS,
    normalizePersonaPacket,
    normalizeMotion,
    deriveAdaptiveMotion,
    presetForResolverState,
    severityForPacket,
    thermalLoadForPacket,
    validateOpticStatePacket,
    validateOpticStatePacketFallback,
    opticPacketToPersonaPacket,
    clone
  };
})();
