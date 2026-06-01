(() => {
  const WIDTH = 320;
  const HEIGHT = 480;
  const ASSET_ROOT = './assets/foozle-cute-robot';
  const SECRET_PATTERN = /(api[_-]?key|token|password|passwd|secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|ghp_[a-z0-9_]+)/i;

  const STATE_CONFIG = {
    idle_watchful: {
      label: 'LOCAL',
      accent: '#4DEBFF',
      subAccent: '#5CF2D6',
      bgTop: '#071016',
      bgBottom: '#090D16',
      animation: 'idle',
      frames: makeFrames('Idle/Armature_Idle_', 0, 20),
      fps: 8,
      scale: 0.57,
      y: 150,
      bob: 3,
      lean: 0,
      motes: 3,
      dim: 1,
      caption: 'Standing by. Mostly.',
      snippet: 'local display · no cloud runtime'
    },
    thinking_focused: {
      label: 'THINKING',
      accent: '#D8FBFF',
      subAccent: '#4DEBFF',
      bgTop: '#07131A',
      bgBottom: '#05070B',
      animation: 'jump-dip',
      frames: makeFrames('Jump/Armature_Jump_', 0, 8),
      fps: 11,
      scale: 0.57,
      y: 150,
      bob: 2,
      lean: -0.025,
      motes: 5,
      dim: 1.02,
      caption: 'Indexing the obvious.',
      snippet: 'working memory motes active'
    },
    healthy_smug: {
      label: 'HEALTHY',
      accent: '#5CF2D6',
      subAccent: '#48F2A2',
      bgTop: '#061416',
      bgBottom: '#07100F',
      animation: 'idle',
      frames: makeFrames('Idle/Armature_Idle_', 2, 18),
      fps: 8,
      scale: 0.58,
      y: 146,
      bob: 4,
      lean: 0.018,
      motes: 4,
      dim: 1.08,
      caption: 'All green. Suspiciously tidy.',
      snippet: 'nominal · unfortunately competent'
    },
    blocked_annoyed: {
      label: 'BLOCKED',
      accent: '#FFB84D',
      subAccent: '#FF6B8D',
      bgTop: '#150D09',
      bgBottom: '#09080D',
      animation: 'walk-held',
      frames: makeFrames('Walk/Armature_Walking_', 5, 12),
      fps: 4,
      scale: 0.58,
      y: 149,
      bob: 1,
      lean: -0.035,
      motes: 4,
      dim: 1,
      caption: 'Blocked. Naturally.',
      snippet: 'waiting on human input'
    },
    night_sleepy: {
      label: 'NIGHT WATCH',
      accent: '#4DB7FF',
      subAccent: '#6D7CFF',
      bgTop: '#030815',
      bgBottom: '#030509',
      animation: 'idle-slow',
      frames: makeFrames('Idle/Armature_Idle_', 0, 20),
      fps: 3,
      scale: 0.55,
      y: 158,
      bob: 1,
      lean: 0,
      motes: 1,
      dim: 0.42,
      caption: 'Low glow. Still watching.',
      snippet: 'quiet mode · display dimmed'
    }
  };

  function makeFrames(prefix, start, end) {
    const frames = [];
    for (let i = start; i <= end; i += 1) frames.push(`${ASSET_ROOT}/${prefix}${String(i).padStart(2, '0')}.png`);
    return frames;
  }

  class HermesFoozleRenderer {
    constructor(rootId, initialPacket) {
      this.root = document.getElementById(rootId);
      if (!this.root) throw new Error(`Display root not found: ${rootId}`);
      this.packet = initialPacket || {};
      this.state = this.packet.mood || 'idle_watchful';
      this.start = performance.now();
      this.frameIndex = 0;
      this.lastFrameAt = this.start;
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.images = new Map();
      this.missing = [];
      this.canvas = document.createElement('canvas');
      this.canvas.width = WIDTH;
      this.canvas.height = HEIGHT;
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'Hermes Foozle cute platformer robot prototype');
      this.ctx = this.canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = 'high';
      this.root.innerHTML = '';
      this.root.appendChild(this.canvas);
      this.drawLoadScreen();
      this.loadImages().then(() => this.loop(performance.now())).catch((error) => this.drawLoadError(error));
    }

    setPacket(packet) {
      this.packet = packet || {};
      const nextState = STATE_CONFIG[this.packet.mood] ? this.packet.mood : 'idle_watchful';
      if (nextState !== this.state) {
        this.state = nextState;
        this.frameIndex = 0;
        this.lastFrameAt = performance.now();
      }
    }

    async loadImages() {
      const urls = new Set();
      Object.values(STATE_CONFIG).forEach((config) => config.frames.forEach((src) => urls.add(src)));
      await Promise.all([...urls].map((src) => this.loadImage(src)));
      if (this.missing.length) throw new Error(`missing Foozle assets: ${this.missing.slice(0, 3).join(', ')}`);
    }

    loadImage(src) {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
          this.images.set(src, image);
          resolve();
        };
        image.onerror = () => {
          this.missing.push(src);
          resolve();
        };
        image.src = src;
      });
    }

    loop(now) {
      this.draw(now);
      this.raf = requestAnimationFrame((next) => this.loop(next));
    }

    currentConfig() {
      return STATE_CONFIG[this.state] || STATE_CONFIG.idle_watchful;
    }

    currentImage(now, config) {
      if (this.reducedMotion) return this.images.get(config.frames[0]);
      const frameMs = 1000 / config.fps;
      if (now - this.lastFrameAt > frameMs) {
        this.frameIndex = (this.frameIndex + 1) % config.frames.length;
        this.lastFrameAt = now;
      }
      return this.images.get(config.frames[this.frameIndex] || config.frames[0]);
    }

    draw(now) {
      const ctx = this.ctx;
      const config = this.currentConfig();
      const t = (now - this.start) / 1000;
      const image = this.currentImage(now, config);
      ctx.save();
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      this.drawBackground(ctx, t, config);
      this.drawTopLine(ctx, t, config);
      this.drawStage(ctx, t, config);
      this.drawMotes(ctx, t, config);
      if (image) this.drawSprite(ctx, t, config, image);
      this.drawStatus(ctx, config);
      ctx.restore();
    }

    drawBackground(ctx, t, config) {
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, config.bgTop);
      bg.addColorStop(0.58, '#05070B');
      bg.addColorStop(1, config.bgBottom);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.save();
      ctx.globalAlpha = (this.state === 'night_sleepy' ? 0.10 : 0.18) * config.dim;
      const glow = ctx.createRadialGradient(160, 214, 6, 160, 214, 205);
      glow.addColorStop(0, config.accent);
      glow.addColorStop(0.42, `${config.accent}33`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = this.state === 'night_sleepy' ? 0.035 : 0.065;
      ctx.strokeStyle = config.accent;
      ctx.lineWidth = 1;
      for (let y = 62; y < 374; y += 28) {
        ctx.beginPath();
        ctx.moveTo(28, y + Math.sin(t * 0.7 + y) * 0.5);
        ctx.lineTo(WIDTH - 28, y + Math.sin(t * 0.7 + y) * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawTopLine(ctx, t, config) {
      ctx.save();
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.state === 'night_sleepy' ? 'rgba(216,247,255,0.42)' : 'rgba(216,247,255,0.72)';
      ctx.fillText(`HERMES // ${config.label}`, 16, 22);
      ctx.globalAlpha = this.state === 'thinking_focused' ? 0.82 + Math.sin(t * 5) * 0.18 : 0.78;
      ctx.fillStyle = config.accent;
      ctx.fillRect(230, 18, 52, 2);
      ctx.fillStyle = config.subAccent;
      ctx.fillRect(288, 18, 16, 2);
      ctx.restore();
    }

    drawStage(ctx, t, config) {
      ctx.save();
      ctx.globalAlpha = 0.86 * config.dim;
      ctx.fillStyle = 'rgba(2, 6, 12, 0.78)';
      ctx.beginPath();
      ctx.ellipse(160, 348, 104, 23, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.34 * config.dim;
      ctx.strokeStyle = config.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(160, 345, 108 + Math.sin(t * 1.2) * 2, 26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawMotes(ctx, t, config) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const centerX = 160;
      const centerY = this.state === 'thinking_focused' ? 165 : 205;
      for (let i = 0; i < config.motes; i += 1) {
        const angle = t * (this.state === 'thinking_focused' ? 0.95 : 0.32) + i * 1.9;
        const radius = this.state === 'blocked_annoyed' ? 66 + (i % 2) * 7 : 80 + Math.sin(t + i) * 5;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle * 1.25) * (radius * 0.34);
        ctx.globalAlpha = this.state === 'night_sleepy' ? 0.35 : 0.62;
        ctx.fillStyle = i % 2 ? config.subAccent : config.accent;
        ctx.beginPath();
        ctx.arc(x, y, 2.2 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawSprite(ctx, t, config, image) {
      const bounds = this.contentBounds(image);
      const contentH = bounds.h || image.height;
      const destH = contentH * config.scale;
      const destW = (bounds.w || image.width) * config.scale;
      const bob = Math.sin(t * (this.state === 'night_sleepy' ? 0.7 : 1.8)) * config.bob;
      const tap = this.state === 'blocked_annoyed' ? Math.max(0, Math.sin(t * 2.1)) * 4 : 0;
      const dx = Math.round((WIDTH - destW) / 2 + (this.state === 'blocked_annoyed' ? Math.sign(Math.sin(t * 7)) * 1.3 : 0));
      const dy = Math.round(config.y + bob + tap);

      ctx.save();
      ctx.translate(dx + destW / 2, dy + destH / 2);
      ctx.rotate(config.lean + (this.state === 'thinking_focused' ? Math.sin(t * 1.6) * 0.01 : 0));
      ctx.globalAlpha = Math.min(1, config.dim);
      ctx.filter = this.spriteFilter(config);
      ctx.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h, -destW / 2, -destH / 2, destW, destH);
      ctx.restore();
    }

    contentBounds(image) {
      if (!image.__bounds) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] > 8) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
        }
        image.__bounds = maxX > minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : { x: 0, y: 0, w: image.width, h: image.height };
      }
      return image.__bounds;
    }

    spriteFilter(config) {
      if (this.state === 'night_sleepy') return 'brightness(0.70) saturate(0.72)';
      if (this.state === 'blocked_annoyed') return 'contrast(1.05) saturate(1.08)';
      if (this.state === 'healthy_smug') return 'brightness(1.04) saturate(1.04)';
      return 'none';
    }

    drawStatus(ctx, config) {
      const caption = this.safeDisplayText(this.packet.caption?.text || config.caption, config.caption, 36);
      const snippet = this.safeDisplayText(this.packet.snippet?.text || config.snippet, config.snippet, 44);
      ctx.save();
      ctx.fillStyle = this.state === 'night_sleepy' ? 'rgba(3, 7, 12, 0.54)' : 'rgba(5, 9, 15, 0.72)';
      ctx.fillRect(18, 384, 284, 68);
      ctx.strokeStyle = `${config.accent}66`;
      ctx.strokeRect(18.5, 384.5, 283, 67);
      ctx.fillStyle = this.state === 'night_sleepy' ? 'rgba(216,247,255,0.72)' : '#D8F7FF';
      ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(caption, 31, 398);
      if (snippet && this.state !== 'night_sleepy') {
        ctx.fillStyle = 'rgba(122,143,166,0.9)';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        ctx.fillText(snippet, 31, 425);
      }
      ctx.fillStyle = config.accent;
      ctx.fillRect(31, 443, Math.max(16, Math.round((this.packet.focus || 0.25) * 78)), 2);
      ctx.fillStyle = config.subAccent;
      ctx.fillRect(116, 443, Math.max(16, Math.round((this.packet.energy || 0.25) * 74)), 2);
      ctx.restore();
    }

    safeDisplayText(value, fallback, maxLength) {
      const raw = String(value || fallback || '').replace(/[\r\n\t]+/g, ' ').trim();
      if (!raw || SECRET_PATTERN.test(raw)) return fallback;
      return raw.slice(0, maxLength);
    }

    drawLoadScreen() {
      const ctx = this.ctx;
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#65F3FF';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('loading Foozle robot...', 54, 240);
    }

    drawLoadError(error) {
      const ctx = this.ctx;
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#FFB84D';
      ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText('Foozle asset load failed', 48, 226);
      ctx.fillStyle = '#8AA2B2';
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.fillText(String(error?.message || error).slice(0, 42), 28, 248);
    }
  }

  window.HermesFoozleRenderer = HermesFoozleRenderer;
  window.__HermesFoozleRendererLoaded = true;
})();
