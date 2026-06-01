(() => {
  const WIDTH = 320;
  const HEIGHT = 480;
  const FRAME = 32;
  const SPRITE_SRC = './assets/gum-bot/gum-bot-sprites-transparent.png';

  const STATE_CONFIG = {
    idle_watchful: {
      label: 'IDLE',
      accent: '#65F3FF',
      subAccent: '#2AD6A3',
      moodLine: 'Standing by with opinions.',
      frames: [{ x: 1, y: 1, ms: 1200 }, { x: 2, y: 3, ms: 120 }, { x: 1, y: 1, ms: 2600 }, { x: 1, y: 3, ms: 110 }, { x: 1, y: 1, ms: 1800 }],
      scale: 5,
      bob: 3,
      motes: 4,
      dim: 1,
      eye: 'open'
    },
    thinking_focused: {
      label: 'THINKING',
      accent: '#63FFB8',
      subAccent: '#26D6FF',
      moodLine: 'Poking the machinery.',
      frames: [{ x: 5, y: 1, ms: 180 }, { x: 6, y: 1, ms: 180 }, { x: 1, y: 2, ms: 240 }, { x: 2, y: 2, ms: 240 }],
      scale: 5,
      bob: 2,
      motes: 6,
      dim: 1,
      eye: 'focus'
    },
    healthy_smug: {
      label: 'HEALTHY',
      accent: '#48F2A2',
      subAccent: '#65F3FF',
      moodLine: 'All green. Suspiciously polite.',
      frames: [{ x: 1, y: 5, ms: 900 }, { x: 2, y: 5, ms: 180 }, { x: 1, y: 5, ms: 900 }, { x: 3, y: 5, ms: 180 }],
      scale: 5,
      bob: 2,
      motes: 5,
      dim: 1.05,
      eye: 'smug'
    },
    blocked_annoyed: {
      label: 'BLOCKED',
      accent: '#FF4D7A',
      subAccent: '#FFB84D',
      moodLine: 'Blocked. Stare deployed.',
      frames: [{ x: 4, y: 1, ms: 900 }, { x: 5, y: 1, ms: 160 }, { x: 4, y: 1, ms: 1200 }, { x: 3, y: 1, ms: 140 }],
      scale: 5,
      bob: 1,
      motes: 5,
      dim: 1,
      eye: 'annoyed'
    },
    night_sleepy: {
      label: 'NIGHT',
      accent: '#4DB7FF',
      subAccent: '#6F7CFF',
      moodLine: 'Dim, not gone.',
      frames: [{ x: 4, y: 3, ms: 1700 }, { x: 1, y: 3, ms: 220 }, { x: 4, y: 3, ms: 2300 }, { x: 2, y: 3, ms: 220 }],
      scale: 5,
      bob: 1,
      motes: 2,
      dim: 0.48,
      eye: 'sleepy'
    }
  };

  class HermesGumBotRenderer {
    constructor(rootId, initialPacket) {
      this.root = document.getElementById(rootId);
      if (!this.root) throw new Error(`Display root not found: ${rootId}`);
      this.packet = initialPacket || {};
      this.state = this.packet.mood || 'idle_watchful';
      this.start = performance.now();
      this.last = this.start;
      this.frameIndex = 0;
      this.frameStarted = this.start;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.canvas = document.createElement('canvas');
      this.canvas.width = WIDTH;
      this.canvas.height = HEIGHT;
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'Hermes Gum Bot sprite character prototype');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.sprite = new Image();
      this.sprite.onload = () => {
        this.loaded = true;
        this.loop(performance.now());
      };
      this.sprite.onerror = () => this.drawLoadError();
      this.sprite.src = SPRITE_SRC;
      this.root.innerHTML = '';
      this.root.appendChild(this.canvas);
      this.drawLoadScreen();
    }

    setPacket(packet) {
      this.packet = packet || {};
      const nextState = STATE_CONFIG[this.packet.mood] ? this.packet.mood : 'idle_watchful';
      if (nextState !== this.state) {
        this.state = nextState;
        this.frameIndex = 0;
        this.frameStarted = performance.now();
      }
    }

    loop(now) {
      this.last = now;
      this.draw(now);
      this.raf = requestAnimationFrame((next) => this.loop(next));
    }

    currentConfig() {
      return STATE_CONFIG[this.state] || STATE_CONFIG.idle_watchful;
    }

    currentFrame(now, config) {
      if (this.reducedMotion) return config.frames[0];
      const frame = config.frames[this.frameIndex] || config.frames[0];
      if (now - this.frameStarted > frame.ms) {
        this.frameIndex = (this.frameIndex + 1) % config.frames.length;
        this.frameStarted = now;
      }
      return config.frames[this.frameIndex] || config.frames[0];
    }

    draw(now) {
      if (!this.loaded) return;
      const ctx = this.ctx;
      const config = this.currentConfig();
      const t = (now - this.start) / 1000;
      const frame = this.currentFrame(now, config);

      ctx.save();
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.imageSmoothingEnabled = false;
      this.drawBackground(ctx, t, config);
      this.drawTopLine(ctx, config);
      this.drawMotes(ctx, t, config);
      this.drawStage(ctx, t, config);
      this.drawSprite(ctx, t, config, frame);
      this.drawStatus(ctx, config);
      ctx.restore();
    }

    drawBackground(ctx, t, config) {
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, '#07101A');
      bg.addColorStop(0.56, '#05070B');
      bg.addColorStop(1, '#090D16');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.globalAlpha = 0.18 * config.dim;
      const glow = ctx.createRadialGradient(160, 204, 4, 160, 204, 210);
      glow.addColorStop(0, config.accent);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.globalAlpha = this.state === 'night_sleepy' ? 0.07 : 0.13;
      ctx.strokeStyle = config.accent;
      ctx.lineWidth = 1;
      for (let y = 60; y < HEIGHT; y += 24) {
        ctx.beginPath();
        ctx.moveTo(22, y + Math.sin(t + y) * 0.8);
        ctx.lineTo(WIDTH - 22, y + Math.sin(t + y) * 0.8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    drawTopLine(ctx, config) {
      ctx.save();
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(216,247,255,0.70)';
      ctx.fillText(`HERMES // ${config.label}`, 16, 21);
      ctx.fillStyle = config.accent;
      ctx.fillRect(244, 18, 44, 2);
      ctx.fillStyle = config.subAccent;
      ctx.fillRect(292, 18, 12, 2);
      ctx.restore();
    }

    drawMotes(ctx, t, config) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const centerX = 160;
      const centerY = this.state === 'thinking_focused' ? 150 : 185;
      for (let i = 0; i < config.motes; i += 1) {
        const angle = t * (0.35 + i * 0.05) + i * 1.7;
        const radius = this.state === 'blocked_annoyed' ? 54 + (i % 2) * 8 : 74 + Math.sin(t + i) * 7;
        const bunch = this.state === 'blocked_annoyed' ? -34 : 0;
        const x = centerX + bunch + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle * 1.25) * (radius * 0.32);
        ctx.globalAlpha = this.state === 'night_sleepy' ? 0.38 : 0.64;
        ctx.fillStyle = i % 2 ? config.subAccent : config.accent;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawStage(ctx, t, config) {
      ctx.save();
      ctx.globalAlpha = 0.78 * config.dim;
      ctx.fillStyle = 'rgba(2, 6, 12, 0.72)';
      ctx.beginPath();
      ctx.ellipse(160, 337, 88, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.34 * config.dim;
      ctx.strokeStyle = config.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(160, 335, 92 + Math.sin(t) * 2, 23, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawSprite(ctx, t, config, frame) {
      const scale = config.scale;
      const destW = FRAME * scale;
      const destH = FRAME * scale;
      const bob = Math.sin(t * (this.state === 'night_sleepy' ? 1.1 : 2.1)) * config.bob;
      const jitter = this.state === 'blocked_annoyed' ? Math.sign(Math.sin(t * 8)) * 1.5 : 0;
      const dx = Math.round((WIDTH - destW) / 2 + jitter);
      const dy = Math.round(174 + bob + (this.state === 'blocked_annoyed' ? 5 : 0));

      ctx.save();
      ctx.globalAlpha = config.dim;
      if (this.state === 'night_sleepy') ctx.filter = 'brightness(0.72) saturate(0.72)';
      if (this.state === 'blocked_annoyed') ctx.filter = 'contrast(1.08) saturate(1.12)';
      ctx.drawImage(this.sprite, frame.x * FRAME, frame.y * FRAME, FRAME, FRAME, dx, dy, destW, destH);
      ctx.restore();

      this.drawEyeOverlay(ctx, dx, dy, scale, config);
      this.drawBadge(ctx, dx, dy, scale, config);
    }

    drawEyeOverlay(ctx, dx, dy, scale, config) {
      const eyeY = dy + 11 * scale;
      const leftX = dx + 11 * scale;
      const rightX = dx + 20 * scale;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = config.accent;
      ctx.shadowColor = config.accent;
      ctx.shadowBlur = this.state === 'night_sleepy' ? 4 : 9;
      const h = config.eye === 'sleepy' ? 1.2 * scale : config.eye === 'annoyed' || config.eye === 'smug' ? 1.4 * scale : 2.2 * scale;
      const w = config.eye === 'focus' ? 2.3 * scale : 2 * scale;
      const offset = config.eye === 'annoyed' ? -1.4 * scale : config.eye === 'smug' ? 1 * scale : 0;
      ctx.globalAlpha = config.eye === 'sleepy' ? 0.62 : 0.88;
      ctx.fillRect(leftX + offset, eyeY, w, h);
      ctx.fillRect(rightX + offset, eyeY, w, h);
      if (config.eye === 'annoyed') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.shadowBlur = 0;
        ctx.strokeStyle = config.subAccent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(leftX - scale, eyeY - scale);
        ctx.lineTo(leftX + 4 * scale, eyeY + 0.4 * scale);
        ctx.moveTo(rightX - scale, eyeY + 0.4 * scale);
        ctx.lineTo(rightX + 4 * scale, eyeY - scale);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBadge(ctx, dx, dy, scale, config) {
      ctx.save();
      ctx.globalAlpha = this.state === 'night_sleepy' ? 0.42 : 0.78;
      ctx.fillStyle = 'rgba(3, 9, 14, 0.62)';
      ctx.fillRect(dx + 13 * scale, dy + 19 * scale, 6 * scale, 3 * scale);
      ctx.fillStyle = config.accent;
      ctx.fillRect(dx + 14 * scale, dy + 20 * scale, 4 * scale, 1.3 * scale);
      ctx.restore();
    }

    drawStatus(ctx, config) {
      const caption = this.safeDisplayText(this.packet.caption?.text || config.moodLine, config.moodLine, 34);
      const snippet = this.safeDisplayText(this.packet.snippet?.text || '', '', 42);
      ctx.save();
      ctx.fillStyle = 'rgba(5, 9, 15, 0.72)';
      ctx.fillRect(18, 382, 284, 70);
      ctx.strokeStyle = `${config.accent}66`;
      ctx.strokeRect(18.5, 382.5, 283, 69);
      ctx.fillStyle = '#D8F7FF';
      ctx.font = '700 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(caption, 32, 397);
      if (snippet && this.state !== 'night_sleepy') {
        ctx.fillStyle = 'rgba(122,143,166,0.9)';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(snippet, 32, 425);
      }
      ctx.fillStyle = config.accent;
      ctx.fillRect(32, 443, Math.max(18, Math.round((this.packet.focus || 0.25) * 82)), 2);
      ctx.fillStyle = config.subAccent;
      ctx.fillRect(122, 443, Math.max(18, Math.round((this.packet.energy || 0.25) * 72)), 2);
      ctx.restore();
    }

    safeDisplayText(value, fallback, maxLength) {
      const raw = String(value || fallback || '').replace(/[\r\n\t]+/g, ' ').trim();
      return raw.slice(0, maxLength);
    }

    drawLoadScreen() {
      const ctx = this.ctx;
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#65F3FF';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('loading gum bot sprite...', 48, 240);
    }

    drawLoadError() {
      const ctx = this.ctx;
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#FF4D7A';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('sprite load failed', 76, 232);
      ctx.fillStyle = '#8AA2B2';
      ctx.fillText(SPRITE_SRC, 38, 252);
    }
  }

  window.HermesGumBotRenderer = HermesGumBotRenderer;
})();
