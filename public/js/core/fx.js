// 시각 효과: 파티클, 링, 스탬프 텍스트, 흔들림, 컨페티
import { h } from './util.js';

const PALETTES = {
  gold: ['#ffd166', '#ffb703', '#fff1a8', '#ffe066'],
  red: ['#ff5c7a', '#ff8fa3', '#ff2d55', '#ffc2cc'],
  blue: ['#58a6ff', '#8ec5ff', '#3b82f6', '#bfdbfe'],
  green: ['#3ddc97', '#8ff0c4', '#22c55e', '#d1fae5'],
  white: ['#ffffff', '#e5e7eb', '#f9fafb', '#d1d5db'],
  fire: ['#ff7a45', '#ffb547', '#ff4d2e', '#ffe066'],
  smoke: ['#9aa0ad', '#6b7280', '#cfd3dc', '#4b5563'],
  water: ['#7dd3fc', '#38bdf8', '#e0f2fe', '#0ea5e9'],
};

export class Fx {
  constructor(area) {
    this.area = area;
    this.canvas = h('canvas', { class: 'fx-overlay' });
    area.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.parts = [];
    this.raf = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(area);
    this.resize();
    this.enabled = true;
  }

  resize() {
    const r = this.area.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, r.width * this.dpr);
    this.canvas.height = Math.max(1, r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // 요소의 중심을 이 영역 기준 좌표로
  pointOf(el) {
    const a = this.area.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, size: Math.min(r.width, r.height) };
  }

  burst(x, y, { count = 18, palette = 'gold', colors = null, speed = 1, size = 4, gravity = 0.18, life = 650, shape = 'mix', spread = Math.PI * 2, angle = -Math.PI / 2 } = {}) {
    if (!this.enabled) return;
    const cols = colors || PALETTES[palette] || PALETTES.gold;
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = (1.5 + Math.random() * 3.5) * speed;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity,
        size: size * (0.6 + Math.random() * 0.9), color: cols[(Math.random() * cols.length) | 0],
        born: now, life: life * (0.7 + Math.random() * 0.6), rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        shape: shape === 'mix' ? (Math.random() < 0.5 ? 'circle' : 'square') : shape,
      });
    }
    this.loop();
  }

  ring(x, y, { color = '#fff', size = 40, life = 450, width = 4 } = {}) {
    if (!this.enabled) return;
    this.parts.push({ ring: true, x, y, color, size, width, born: performance.now(), life });
    this.loop();
  }

  sparkle(x, y, r = 30, palette = 'gold') {
    this.burst(x, y, { count: 12, palette, speed: 0.7, size: 3, gravity: 0.02, life: 500, shape: 'spark' });
    this.ring(x, y, { color: (PALETTES[palette] || PALETTES.gold)[0], size: r });
  }

  loop() {
    if (this.raf) return;
    const step = () => {
      const now = performance.now();
      const c = this.ctx;
      c.clearRect(0, 0, this.w, this.h);
      this.parts = this.parts.filter((p) => now - p.born < p.life);
      for (const p of this.parts) {
        const t = (now - p.born) / p.life;
        if (p.ring) {
          c.beginPath();
          c.globalAlpha = 1 - t;
          c.lineWidth = p.width * (1 - t) + 1;
          c.strokeStyle = p.color;
          c.arc(p.x, p.y, p.size * (0.2 + t * 1.6), 0, Math.PI * 2);
          c.stroke();
          continue;
        }
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.985;
        c.globalAlpha = 1 - t * t;
        c.fillStyle = p.color;
        if (p.shape === 'circle') { c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill(); }
        else if (p.shape === 'spark') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size * 1.6, -p.size * 0.35, p.size * 3.2, p.size * 0.7); c.restore(); }
        else { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillRect(-p.size, -p.size, p.size * 2, p.size * 2); c.restore(); }
      }
      c.globalAlpha = 1;
      if (this.parts.length) this.raf = requestAnimationFrame(step);
      else { this.raf = 0; c.clearRect(0, 0, this.w, this.h); }
    };
    this.raf = requestAnimationFrame(step);
  }

  stamp(text, { color = '#fff', glow = 'rgba(255,122,69,.85)', small = false, duration = 900 } = {}) {
    if (!this.enabled) return;
    const el = h('div', { class: 'stamp' + (small ? ' small' : ''), text, style: { color, '--stamp-glow': glow, animationDuration: duration + 'ms' } });
    this.area.appendChild(el);
    setTimeout(() => el.remove(), duration + 50);
  }

  shake(hard = false) {
    if (!this.enabled) return;
    const el = this.area;
    el.classList.remove('shaking', 'hard');
    void el.offsetWidth;
    el.classList.add('shaking');
    if (hard) el.classList.add('hard');
    setTimeout(() => el.classList.remove('shaking', 'hard'), 520);
  }

  destroy() {
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }
}

// 전체 화면 컨페티
let confettiRaf = 0;
export function confetti({ duration = 2600, count = 160, palette = 'gold' } = {}) {
  const canvas = document.getElementById('confetti');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.classList.add('on');
  const cols = [...PALETTES[palette], ...PALETTES.blue, ...PALETTES.green, ...PALETTES.red];
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      color: cols[(Math.random() * cols.length) | 0], rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25, sway: Math.random() * Math.PI * 2,
    });
  }
  const start = performance.now();
  cancelAnimationFrame(confettiRaf);
  const step = () => {
    const t = performance.now() - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.sway += 0.08; p.x += p.vx + Math.sin(p.sway) * 0.8; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.abs(Math.cos(p.sway)) * p.h + 2);
      ctx.restore();
    }
    if (t < duration) confettiRaf = requestAnimationFrame(step);
    else { canvas.classList.remove('on'); ctx.clearRect(0, 0, innerWidth, innerHeight); }
  };
  confettiRaf = requestAnimationFrame(step);
}
