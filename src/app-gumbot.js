(() => {
  const { PRESETS, clone, normalizePersonaPacket } = window.HermesDisplayState;
  const textarea = document.querySelector('#state-json');
  const output = document.querySelector('#status-output');
  const skinSelect = document.querySelector('#skin-select');
  const renderer = new window.HermesGumBotRenderer('display-root', PRESETS.idle_watchful);
  let currentPacket = clone(PRESETS.idle_watchful);

  function writePacket(packet, message) {
    currentPacket = normalizePersonaPacket(packet);
    textarea.value = JSON.stringify(currentPacket, null, 2);
    skinSelect.value = currentPacket.skin;
    renderer.setPacket(currentPacket);
    output.value = message || `Applied ${currentPacket.mood} / ${currentPacket.skin}.`;
  }

  function selectedSkinPacket(packet) {
    return normalizePersonaPacket({ ...packet, skin: skinSelect.value });
  }

  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = PRESETS[button.dataset.preset];
      writePacket(preset, `Previewing Gum Bot state: ${button.dataset.preset}.`);
    });
  });

  skinSelect.addEventListener('change', () => {
    writePacket(selectedSkinPacket(currentPacket), `Skin metadata switched to ${skinSelect.value}; base CC0 sprite remains unchanged.`);
  });

  document.querySelector('#apply-json').addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      const packet = normalizePersonaPacket(parsed);
      writePacket(packet, `Applied JSON: ${packet.mood} / ${packet.skin}.`);
      if (packet.safety?.contains_credentials) {
        output.value = 'Applied with redaction: credential-like text was detected and suppressed.';
      }
    } catch (error) {
      output.value = `JSON parse failed: ${error.message}`;
    }
  });

  document.querySelector('#randomize').addEventListener('click', () => {
    const nudged = clone(currentPacket);
    nudged.energy = clamp01(nudged.energy + (Math.random() - 0.5) * 0.22);
    nudged.focus = clamp01(nudged.focus + (Math.random() - 0.5) * 0.24);
    nudged.curiosity = clamp01(nudged.curiosity + (Math.random() - 0.5) * 0.20);
    nudged.impatience = clamp01(nudged.impatience + (Math.random() - 0.5) * 0.26);
    nudged.caption = {
      ...(nudged.caption || {}),
      text: chooseQuip(nudged)
    };
    writePacket(nudged, 'Randomized runtime drives and quip. Sprite state remains finite.');
  });

  document.querySelector('#reset').addEventListener('click', () => {
    writePacket(PRESETS.idle_watchful, 'Reset to idle_watchful.');
  });

  window.addEventListener('keydown', (event) => {
    if (event.target === textarea) return;
    const keyMap = {
      '1': 'idle_watchful',
      '2': 'thinking_focused',
      '3': 'healthy_smug',
      '4': 'blocked_annoyed',
      '5': 'night_sleepy'
    };
    if (keyMap[event.key]) writePacket(PRESETS[keyMap[event.key]], `Keyboard preset ${event.key}: ${keyMap[event.key]}.`);
  });

  function chooseQuip(packet) {
    const quips = {
      idle_watchful: ['Standing by with opinions.', 'Quiet systems. Suspicious.', 'Watching the home base.'],
      thinking_focused: ['Poking the machinery.', 'Chasing a thread.', 'Logs are judging us.'],
      healthy_smug: ['All green. Suspiciously polite.', 'No fires. Tiny miracle.', 'Uptime tastes like victory.'],
      blocked_annoyed: ['Blocked. Stare deployed.', 'Waiting on a human API.', 'Approval wall detected.'],
      night_sleepy: ['Dim, not gone.', 'Guard mode: sleepy edition.', 'Keeping one eye on things.']
    };
    const list = quips[packet.mood] || quips.idle_watchful;
    return list[Math.floor(Math.random() * list.length)];
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  writePacket(currentPacket, 'Ready. Gum Bot sprite route loaded. Use buttons or keys 1-5.');
})();
