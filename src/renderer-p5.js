(() => {
  const WIDTH = 320;
  const HEIGHT = 480;

  class HermesP5Renderer {
    constructor(rootId, initialPacket) {
      this.rootId = rootId;
      this.packet = window.HermesDisplayState.normalizePersonaPacket(initialPacket);
      this.target = this.packet;
      this.transition = 1;
      this.transitionStart = 0;
      this.lastPacket = this.packet;
      this.motes = [];
      this.seed = 6718;
      this.lastBlinkAt = 0;
      this.blinkUntil = 0;
      this.nextBlinkDelay = 2100;
      this.p = new p5((p) => this.sketch(p), rootId);
    }

    setPacket(nextPacket) {
      this.lastPacket = this.packet;
      this.target = window.HermesDisplayState.normalizePersonaPacket(nextPacket);
      this.transition = 0;
      this.transitionStart = performance.now();
      this.resetMotes();
    }

    sketch(p) {
      p.setup = () => {
        p5.disableFriendlyErrors = true;
        p.pixelDensity(1);
        p.createCanvas(WIDTH, HEIGHT);
        p.frameRate(60);
        p.textFont('ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');
        p.randomSeed(this.seed);
        p.noiseSeed(this.seed);
        this.resetMotes();
      };

      p.draw = () => {
        const now = p.millis();
        this.updateTransition();
        this.updateBlink(now);
        this.drawFrame(p, now / 1000);
      };
    }

    resetMotes() {
      const glyphs = this.target.skinMeta?.glyphs || ['◇', '⌁', '◌', '✦'];
      this.motes = Array.from({ length: 14 }, (_, index) => ({
        index,
        glyph: glyphs[index % glyphs.length],
        phase: (Math.PI * 2 * index) / 14,
        radius: 82 + (index % 4) * 8,
        speed: 0.26 + (index % 5) * 0.035,
        size: 2 + (index % 3) * 0.7,
        wobble: 0.8 + (index % 6) * 0.18
      }));
    }

    updateTransition() {
      if (this.transition >= 1) {
        this.packet = this.target;
        return;
      }
      const duration = this.target.duration?.transition_ms || 650;
      this.transition = Math.min(1, (performance.now() - this.transitionStart) / duration);
      const eased = easeInOutCubic(this.transition);
      this.packet = mixPackets(this.lastPacket, this.target, eased);
    }

    updateBlink(now) {
      const packet = this.target;
      let cadence = 3600;
      if (packet.eyes?.blink_rate === 'fast') cadence = 1450;
      if (packet.eyes?.blink_rate === 'staccato') cadence = 920;
      if (packet.mood === 'night_sleepy') cadence = 4700;

      if (now - this.lastBlinkAt > this.nextBlinkDelay) {
        this.lastBlinkAt = now;
        this.blinkUntil = now + (packet.eyes?.blink_rate === 'staccato' ? 105 : 155);
        this.nextBlinkDelay = cadence + ((this.motes.length * 97 + Math.floor(now)) % 900);
      }
    }

    drawFrame(p, t) {
      const packet = this.packet;
      const pal = packet.palette;
      const energy = packet.energy;
      const impatience = packet.impatience;
      const focus = packet.focus;
      const brightness = 0.45 + pal.brightness * 0.55;
      const breathing = Math.sin(t * (1.2 + energy * 1.8)) * (3.0 + energy * 5.0);
      const bounce = packet.mood === 'blocked_annoyed' ? Math.abs(Math.sin(t * 8.3)) * impatience * 7 : 0;
      const sleepySag = packet.mood === 'night_sleepy' ? 7 : 0;
      const cx = WIDTH / 2 + gazeOffset(packet, t).x * 0.28 + Math.sin(t * 0.71) * 1.2;
      const cy = 196 + breathing * 0.35 + bounce + sleepySag;
      const tilt = tiltRadians(packet.posture?.tilt) + Math.sin(t * 0.67) * 0.025;

      drawBackground(p, pal, t, packet);
      drawStatusHeader(p, packet, pal, t);
      drawAmbientField(p, pal, t, packet);
      drawOrbit(p, packet, pal, cx, cy, t, this.motes);
      drawBody(p, packet, pal, cx, cy, breathing, tilt, brightness, t);
      drawEyes(p, packet, pal, cx, cy, tilt, t, this.blinkUntil > p.millis());
      drawWingSigils(p, packet, pal, cx, cy, tilt, t);
      drawStatusZone(p, packet, pal, t);
    }
  }

  function drawBackground(p, pal, t, packet) {
    p.background(pal.background);
    const bg = p.color(pal.background);
    const primary = p.color(pal.primary);
    const accent = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.accent);

    for (let y = 0; y < HEIGHT; y += 2) {
      const amt = y / HEIGHT;
      const c = p.lerpColor(bg, primary, 0.05 * (1 - amt) + 0.03 * Math.sin(t + amt * 3));
      p.stroke(p.red(c), p.green(c), p.blue(c), 120);
      p.line(0, y, WIDTH, y);
    }

    p.noStroke();
    for (let i = 0; i < 38; i++) {
      const x = (i * 73 + Math.sin(t * 0.11 + i) * 28) % WIDTH;
      const y = (i * 47 + Math.cos(t * 0.09 + i * 2) * 34) % HEIGHT;
      const alpha = 10 + 14 * p.noise(i * 0.1, t * 0.08);
      p.fill(p.red(primary), p.green(primary), p.blue(primary), alpha);
      p.circle(x, y, 1.1 + (i % 4) * 0.35);
    }

    p.noFill();
    p.stroke(p.red(accent), p.green(accent), p.blue(accent), packet.mood === 'blocked_annoyed' ? 38 : 18);
    p.strokeWeight(1);
    p.arc(WIDTH * 0.5, HEIGHT * 0.44, 250, 250, -0.5 + t * 0.06, 1.2 + t * 0.06);
    p.arc(WIDTH * 0.5, HEIGHT * 0.44, 288, 288, 2.0 - t * 0.04, 3.25 - t * 0.04);
  }

  function drawStatusHeader(p, packet, pal, t) {
    const label = packet.mood.replace(/_/g, ' ');
    const color = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.secondary);
    p.noStroke();
    p.fill(255, 255, 255, 18);
    p.rect(16, 18, 288, 34, 12);
    p.fill(p.red(color), p.green(color), p.blue(color), 210);
    p.textSize(10);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(label.toUpperCase(), 28, 35);
    p.textAlign(p.RIGHT, p.CENTER);
    p.fill(235, 250, 255, 130);
    const tick = ['·', '·', '•', '·'][Math.floor(t * 2) % 4];
    p.text(`${packet.skin} ${tick}`, 292, 35);
  }

  function drawAmbientField(p, pal, t, packet) {
    p.noFill();
    const color = p.color(pal.primary);
    const alpha = packet.mood === 'night_sleepy' ? 18 : 30;
    for (let i = 0; i < 8; i++) {
      const y = 76 + i * 28;
      const amp = 6 + packet.focus * 10;
      p.stroke(p.red(color), p.green(color), p.blue(color), alpha - i);
      p.strokeWeight(i % 3 === 0 ? 1.2 : 0.55);
      p.beginShape();
      for (let x = 24; x <= 296; x += 12) {
        const n = p.noise(x * 0.013, i * 0.2, t * 0.16);
        p.vertex(x, y + (n - 0.5) * amp + Math.sin(t * 0.7 + x * 0.02 + i) * 1.8);
      }
      p.endShape();
    }
  }

  function drawOrbit(p, packet, pal, cx, cy, t, motes) {
    const crossed = packet.posture?.orbit === 'crossed';
    const focused = packet.posture?.orbit === 'focused';
    const orbitColor = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.primary);

    p.push();
    p.translate(cx, cy);
    p.noFill();
    p.stroke(p.red(orbitColor), p.green(orbitColor), p.blue(orbitColor), 46);
    p.strokeWeight(1);
    p.ellipse(0, 0, 184, crossed ? 96 : 148);
    p.ellipse(0, 0, crossed ? 178 : 126, 176);

    for (const mote of motes) {
      const dir = crossed && mote.index % 2 ? -1 : 1;
      const angle = mote.phase + t * mote.speed * dir * (focused ? 2.2 : 1.0);
      const rx = mote.radius * (crossed ? 1.05 : 0.95);
      const ry = mote.radius * (crossed ? 0.48 : 0.72);
      const x = Math.cos(angle) * rx;
      const y = Math.sin(angle + (crossed ? mote.index * 0.35 : 0)) * ry;
      const pulse = 0.65 + 0.35 * Math.sin(t * (1.5 + mote.wobble) + mote.index);
      p.noStroke();
      p.fill(p.red(orbitColor), p.green(orbitColor), p.blue(orbitColor), 98 + pulse * 90);
      p.circle(x, y, mote.size + pulse * 1.8 + packet.energy * 1.4);
      if (mote.index % 4 === 0 || packet.focus > 0.7) {
        p.fill(255, 255, 255, 100);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(9);
        p.text(mote.glyph, x, y - 10);
      }
    }
    p.pop();
  }

  function drawBody(p, packet, pal, cx, cy, breathing, tilt, brightness, t) {
    const primary = p.color(pal.primary);
    const secondary = p.color(pal.secondary);
    const accent = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.accent);
    const bodyW = 116 * (packet.posture?.scale || 1) + breathing * 0.6;
    const bodyH = 138 * (packet.posture?.scale || 1) + breathing;

    p.push();
    p.translate(cx, cy);
    p.rotate(tilt);
    p.noStroke();

    for (let r = 0; r < 5; r++) {
      p.fill(p.red(primary), p.green(primary), p.blue(primary), (24 - r * 3) * brightness);
      p.ellipse(0, 5, bodyW + r * 18, bodyH + r * 18);
    }

    p.fill(8, 14, 26, 238);
    p.stroke(p.red(primary), p.green(primary), p.blue(primary), 155);
    p.strokeWeight(1.5);
    p.ellipse(0, 0, bodyW, bodyH);

    p.noStroke();
    p.fill(p.red(secondary), p.green(secondary), p.blue(secondary), 30);
    p.ellipse(-18, -20, bodyW * 0.42, bodyH * 0.64);
    p.fill(p.red(accent), p.green(accent), p.blue(accent), 30);
    p.ellipse(26, 24, bodyW * 0.36, bodyH * 0.38);

    p.noFill();
    p.stroke(p.red(primary), p.green(primary), p.blue(primary), 70);
    p.strokeWeight(0.8);
    for (let i = 0; i < 5; i++) {
      const yy = -48 + i * 23 + Math.sin(t + i) * 2;
      p.arc(0, yy, bodyW * (0.74 - i * 0.045), 16, 0.2, Math.PI - 0.2);
    }

    if (packet.skin === 'terminal-sprite') {
      p.stroke(p.red(primary), p.green(primary), p.blue(primary), 42);
      for (let y = -56; y < 58; y += 9) p.line(-42, y, 42, y + Math.sin(t * 2 + y) * 1.6);
    }

    if (packet.skin === 'hermetic-companion') {
      p.stroke(229, 199, 107, 110);
      p.line(0, -58, 0, 58);
      p.arc(-14, -10, 24, 44, -Math.PI / 2, Math.PI / 2);
      p.arc(14, 10, 24, 44, Math.PI / 2, Math.PI * 1.5);
    }

    p.pop();
  }

  function drawEyes(p, packet, pal, cx, cy, tilt, t, blinking) {
    const gaze = gazeOffset(packet, t);
    const eyeY = cy - 18;
    const baseW = packet.eyes?.expression === 'sleepy' ? 29 : 35;
    let eyeH = 18;
    if (packet.eyes?.expression === 'focused') eyeH = 13;
    if (packet.eyes?.expression === 'smug') eyeH = 12;
    if (packet.eyes?.expression === 'side_eye') eyeH = 11;
    if (packet.eyes?.expression === 'sleepy') eyeH = 8;
    if (blinking) eyeH = 2.2;

    p.push();
    p.translate(cx, eyeY);
    p.rotate(tilt);
    for (const side of [-1, 1]) {
      const ex = side * 27;
      const skew = packet.eyes?.expression === 'side_eye' ? side * -4 : packet.eyes?.expression === 'smug' ? side * 2.8 : 0;
      const eyeColor = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.primary);
      p.noStroke();
      p.fill(p.red(eyeColor), p.green(eyeColor), p.blue(eyeColor), 62);
      p.ellipse(ex, 0, baseW + 11, eyeH + 10);
      p.fill(p.red(eyeColor), p.green(eyeColor), p.blue(eyeColor), 235);
      p.ellipse(ex + skew, 0, baseW, eyeH);
      p.fill(255, 255, 255, 210);
      const pupilSize = packet.eyes?.pupil === 'pinpoint' ? 3.2 : 5.5;
      p.circle(ex + gaze.x * 0.30 + skew, gaze.y * 0.20, pupilSize);

      p.stroke(5, 8, 14, 210);
      p.strokeWeight(2.2);
      if (packet.eyes?.expression === 'side_eye') p.line(ex - 19, -9, ex + 18, -3);
      if (packet.eyes?.expression === 'smug') p.line(ex - 18, -7, ex + 18, -10);
      if (packet.eyes?.expression === 'sleepy') p.line(ex - 18, -5, ex + 18, -5);
    }
    p.pop();
  }

  function drawWingSigils(p, packet, pal, cx, cy, tilt, t) {
    const color = p.color(pal.secondary);
    p.push();
    p.translate(cx, cy);
    p.rotate(tilt);
    p.noFill();
    p.stroke(p.red(color), p.green(color), p.blue(color), 94);
    p.strokeWeight(1.2);
    const flap = Math.sin(t * 1.4) * (packet.energy * 4 + 2);
    p.arc(-66, -18, 46, 32 + flap, Math.PI * 0.76, Math.PI * 1.82);
    p.arc(-74, -8, 38, 24 + flap, Math.PI * 0.72, Math.PI * 1.78);
    p.arc(66, -18, 46, 32 + flap, Math.PI * 1.18, Math.PI * 2.24);
    p.arc(74, -8, 38, 24 + flap, Math.PI * 1.22, Math.PI * 2.28);
    p.pop();
  }

  function drawStatusZone(p, packet, pal, t) {
    const zoneY = 348;
    const primary = p.color(pal.primary);
    const accent = p.color(packet.mood === 'blocked_annoyed' ? pal.danger : pal.accent);
    p.noStroke();
    p.fill(0, 0, 0, 92);
    p.rect(16, zoneY, 288, 104, 18);
    p.fill(p.red(primary), p.green(primary), p.blue(primary), 24);
    p.rect(18, zoneY + 2, 284, 100, 16);

    const rings = [packet.energy, packet.focus, packet.impatience];
    const labels = ['ENG', 'FOC', 'IMP'];
    for (let i = 0; i < 3; i++) {
      const x = 43 + i * 38;
      p.noFill();
      p.stroke(255, 255, 255, 32);
      p.strokeWeight(4);
      p.arc(x, zoneY + 28, 24, 24, -Math.PI / 2, Math.PI * 1.5);
      p.stroke(i === 2 ? p.red(accent) : p.red(primary), i === 2 ? p.green(accent) : p.green(primary), i === 2 ? p.blue(accent) : p.blue(primary), 170);
      p.arc(x, zoneY + 28, 24, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * rings[i]);
      p.noStroke();
      p.fill(230, 246, 255, 120);
      p.textSize(7);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(labels[i], x, zoneY + 49);
    }

    p.textAlign(p.LEFT, p.TOP);
    p.textSize(12);
    p.fill(232, 250, 255, 226);
    p.text(wrapText(packet.caption?.text || '...', 32), 132, zoneY + 17, 154, 44);

    p.textSize(10);
    p.fill(p.red(primary), p.green(primary), p.blue(primary), 155 + Math.sin(t * 2.8) * 40);
    const snippet = packet.snippet?.text || 'no snippet · safely bored';
    p.text(wrapText(snippet, 42), 28, zoneY + 72, 246, 28);
  }

  function gazeOffset(packet, t) {
    const gaze = packet.eyes?.gaze;
    if (gaze === 'left') return { x: -18 + Math.sin(t * 0.9) * 2, y: 2 };
    if (gaze === 'right' || gaze === 'track_activity') return { x: Math.sin(t * 1.9) * 14, y: Math.cos(t * 1.2) * 4 };
    if (gaze === 'center') return { x: Math.sin(t * 0.4) * 2, y: Math.cos(t * 0.35) * 1 };
    return { x: Math.sin(t * 0.7) * 10 + Math.sin(t * 1.9) * 3, y: Math.cos(t * 0.8) * 4 };
  }

  function tiltRadians(tilt) {
    if (tilt === 'left_small') return -0.055;
    if (tilt === 'right_small') return 0.075;
    if (tilt === 'forward') return -0.02;
    return 0;
  }

  function wrapText(text, maxChars) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxChars) {
        lines.push(line.trim());
        line = word;
      } else {
        line = `${line} ${word}`.trim();
      }
    }
    if (line) lines.push(line.trim());
    return lines.slice(0, 3).join('\n');
  }

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function mixPackets(a, b, t) {
    const mixed = window.HermesDisplayState.clone(b);
    for (const key of ['playfulness', 'energy', 'focus', 'curiosity', 'impatience']) {
      mixed[key] = Number(a[key] || 0) + (Number(b[key] || 0) - Number(a[key] || 0)) * t;
    }
    mixed.palette = { ...b.palette };
    mixed.palette.brightness = Number(a.palette?.brightness || b.palette.brightness) + (Number(b.palette?.brightness || 0.7) - Number(a.palette?.brightness || 0.7)) * t;
    return mixed;
  }

  window.HermesP5Renderer = HermesP5Renderer;
})();
