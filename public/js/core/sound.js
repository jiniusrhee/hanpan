// WebAudio로 합성한 효과음 - 파일 없이 타격감 있는 소리를 만든다.
let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { type = 'sine', dur = 0.12, gain = 0.4, attack = 0.004, slideTo = null, delay = 0, curve = 'exp' } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.08, gain = 0.3, freq = 1200, q = 0.8, type = 'lowpass', delay = 0, slideTo = null } = {}) {
  const c = ensure(); if (!c) return;
  const t0 = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const LIB = {
  click: () => tone(900, { dur: 0.05, gain: 0.18, type: 'triangle' }),
  tap: () => { tone(520, { dur: 0.05, gain: 0.15, type: 'triangle' }); },
  move: () => { noise({ dur: 0.05, gain: 0.35, freq: 1500 }); tone(190, { dur: 0.09, gain: 0.35, slideTo: 120 }); },
  place: () => { noise({ dur: 0.04, gain: 0.3, freq: 2400 }); tone(320, { dur: 0.08, gain: 0.3, slideTo: 200, type: 'triangle' }); },
  capture: () => {
    tone(110, { dur: 0.22, gain: 0.7, slideTo: 45 });
    noise({ dur: 0.12, gain: 0.5, freq: 900 });
    tone(2200, { dur: 0.04, gain: 0.15, type: 'square', delay: 0.01 });
  },
  boom: () => {
    tone(90, { dur: 0.45, gain: 0.9, slideTo: 30 });
    noise({ dur: 0.4, gain: 0.7, freq: 600, slideTo: 80 });
    noise({ dur: 0.08, gain: 0.4, freq: 3000, type: 'highpass' });
  },
  splash: () => { noise({ dur: 0.25, gain: 0.35, freq: 1800, type: 'bandpass', q: 1.5, slideTo: 400 }); },
  flip: () => { noise({ dur: 0.035, gain: 0.25, freq: 3000 }); tone(740, { dur: 0.06, gain: 0.12, type: 'triangle', slideTo: 500 }); },
  check: () => { tone(660, { dur: 0.12, gain: 0.35, type: 'square' }); tone(990, { dur: 0.2, gain: 0.35, type: 'square', delay: 0.11 }); },
  alert: () => { tone(880, { dur: 0.09, gain: 0.3, type: 'square' }); tone(880, { dur: 0.09, gain: 0.3, type: 'square', delay: 0.12 }); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.32, gain: 0.32, type: 'triangle', delay: i * 0.11 })); tone(1319, { dur: 0.6, gain: 0.28, type: 'triangle', delay: 0.45 }); },
  lose: () => { [440, 392, 349, 262].forEach((f, i) => tone(f, { dur: 0.35, gain: 0.3, type: 'triangle', delay: i * 0.16 })); },
  draw: () => { tone(494, { dur: 0.25, gain: 0.3, type: 'triangle' }); tone(494, { dur: 0.35, gain: 0.3, type: 'triangle', delay: 0.25 }); },
  dice: () => { for (let i = 0; i < 6; i++) { noise({ dur: 0.03, gain: 0.35, freq: 2500 + i * 300, delay: i * 0.055 }); tone(300 + i * 40, { dur: 0.03, gain: 0.12, type: 'square', delay: i * 0.055 }); } },
  sticks: () => { for (let i = 0; i < 4; i++) { noise({ dur: 0.045, gain: 0.4, freq: 1800, delay: 0.05 + i * 0.07 }); tone(240 + i * 30, { dur: 0.07, gain: 0.25, slideTo: 150, delay: 0.05 + i * 0.07 }); } },
  error: () => tone(130, { dur: 0.16, gain: 0.3, type: 'square', curve: 'lin' }),
  notify: () => { tone(1175, { dur: 0.3, gain: 0.25, type: 'sine' }); tone(1568, { dur: 0.4, gain: 0.2, type: 'sine', delay: 0.08 }); },
  pop: () => tone(600, { dur: 0.07, gain: 0.25, type: 'triangle', slideTo: 900 }),
  slide: () => noise({ dur: 0.12, gain: 0.25, freq: 800, type: 'bandpass', q: 2, slideTo: 2200 }),
  merge: () => { tone(500, { dur: 0.08, gain: 0.3, type: 'triangle', slideTo: 800 }); tone(1000, { dur: 0.12, gain: 0.2, type: 'sine', delay: 0.05 }); },
  score: () => { tone(784, { dur: 0.1, gain: 0.28, type: 'triangle' }); tone(1175, { dur: 0.18, gain: 0.28, type: 'triangle', delay: 0.09 }); },
  coin: () => { tone(1568, { dur: 0.08, gain: 0.2, type: 'square' }); tone(2093, { dur: 0.25, gain: 0.2, type: 'square', delay: 0.07 }); },
  swoosh: () => noise({ dur: 0.2, gain: 0.3, freq: 400, type: 'bandpass', q: 1, slideTo: 3000 }),
  tick: () => tone(1500, { dur: 0.03, gain: 0.12, type: 'square' }),
  bonus: () => { [660, 880, 1100].forEach((f, i) => tone(f, { dur: 0.12, gain: 0.25, type: 'triangle', delay: i * 0.07 })); },
};

export const sound = {
  setEnabled(v) { enabled = !!v; if (enabled) ensure(); },
  get enabled() { return enabled; },
  unlock() { ensure(); },
  play(name) {
    if (!enabled) return;
    const f = LIB[name];
    if (!f) return;
    try { f(); } catch { /* 오디오 실패는 무시 */ }
  },
};
