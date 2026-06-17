(() => {
  const MODES = [
    'idle_watch',
    'notice',
    'listening',
    'reading',
    'reasoning',
    'tool_shell',
    'searching',
    'writing',
    'waiting_user',
    'blocked',
    'complete',
    'degraded_offline',
  ];

  const MODE_TO_PRESET = {
    idle_watch: 'quiet_watch',
    notice: 'waiting_input',
    listening: 'waiting_input',
    reading: 'reasoning',
    reasoning: 'reasoning',
    tool_shell: 'working',
    searching: 'working',
    writing: 'working',
    waiting_user: 'waiting_input',
    blocked: 'blocked',
    complete: 'completed',
    degraded_offline: 'degraded_offline',
  };

  const PRESET_TO_MODE = {
    quiet_watch: 'idle_watch',
    reasoning: 'reasoning',
    planning: 'reasoning',
    working: 'tool_shell',
    completed: 'complete',
    waiting_input: 'waiting_user',
    blocked: 'blocked',
    feed_stale: 'degraded_offline',
    degraded_offline: 'degraded_offline',
    night_watch: 'idle_watch',
    critical: 'blocked',
  };

  function modeToPreset(mode, fallback = 'quiet_watch') {
    return MODE_TO_PRESET[mode] || fallback;
  }

  function presetToMode(preset, fallback = 'idle_watch') {
    return PRESET_TO_MODE[preset] || fallback;
  }

  function modeFromPacket(packet = {}, fallback = 'idle_watch') {
    const explicit = packet.behavior_mode
      || packet.optic_state_packet?.mode
      || packet.puppet_state_packet?.mode;
    if (MODES.includes(explicit)) return explicit;
    const presetMode = PRESET_TO_MODE[packet.state_preset];
    if (MODES.includes(presetMode)) return presetMode;
    return MODES.includes(fallback) ? fallback : 'idle_watch';
  }

  function packetForMode(mode, basePacket = {}) {
    const safeMode = MODES.includes(mode) ? mode : 'idle_watch';
    const packet = {
      ...basePacket,
      behavior_mode: safeMode,
      state_preset: MODE_TO_PRESET[safeMode] || 'quiet_watch',
    };
    if (basePacket.optic_state_packet) packet.optic_state_packet = { ...basePacket.optic_state_packet, mode: safeMode };
    if (basePacket.puppet_state_packet) packet.puppet_state_packet = { ...basePacket.puppet_state_packet, mode: safeMode };
    return packet;
  }

  window.HermesModePresets = {
    MODES,
    MODE_TO_PRESET,
    PRESET_TO_MODE,
    modeToPreset,
    presetToMode,
    modeFromPacket,
    packetForMode,
  };
})();
