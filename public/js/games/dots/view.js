import { h, svg } from '../../core/util.js';

const COLORS = ['#4fa3ff', '#ff6b6b'];
const U = 10; // 점 간격

export function create(root, ctx) {
  let n = 0, s = null, linesG = null, boxesG = null, hitG = null, el = null;
  const dot = (k) => 5 + k * U;

  function build(size) {
    if (el) el.remove();
    n = size;
    const W = n * U + 10;
    s = svg('svg', { viewBox: `0 0 ${W} ${W}`, style: 'width:100%;height:auto;display:block' });
    s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: W, rx: 3, fill: '#f5e6c8' }));
    boxesG = svg('g'); linesG = svg('g'); hitG = svg('g');
    const dotsG = svg('g');
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) dotsG.appendChild(svg('circle', { cx: dot(c), cy: dot(r), r: 0.85, fill: '#3a2a1a' }));
    s.append(boxesG, linesG, dotsG, hitG);
    // 히트 영역
    const hit = (t, i, x1, y1, x2, y2) => {
      const l = svg('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,0)', 'stroke-width': 4.2, 'stroke-linecap': 'round', style: 'cursor:pointer' });
      l.addEventListener('click', () => { if (!ctx.canAct()) return; const mv = ctx.legalMoves().find((m) => m.t === t && m.i === i); if (!mv) { ctx.sound.play('error'); return; } ctx.submit(mv); });
      hitG.appendChild(l);
    };
    for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) hit('h', r * n + c, dot(c), dot(r), dot(c + 1), dot(r));
    for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) hit('v', r * (n + 1) + c, dot(c), dot(r), dot(c), dot(r + 1));
    el = h('div', { style: { width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.4)' } }, s);
    root.appendChild(el);
  }

  function lineCoords(t, i) {
    if (t === 'h') { const r = (i / n) | 0, c = i % n; return [dot(c), dot(r), dot(c + 1), dot(r)]; }
    const r = (i / (n + 1)) | 0, c = i % (n + 1); return [dot(c), dot(r), dot(c), dot(r + 1)];
  }
  function px(x, y) { const rect = s.getBoundingClientRect(); const k = rect.width / (n * U + 10); return { x: x * k, y: y * k, k }; }

  return {
    update(state, events, prev, animate) {
      if (state.n !== n) build(state.n);
      linesG.innerHTML = ''; boxesG.innerHTML = '';
      const lineEv = events.find((e) => e.type === 'line');
      const drawLine = (t, i, owner, anim) => {
        const [x1, y1, x2, y2] = lineCoords(t, i);
        const l = svg('line', { x1, y1, x2, y2, stroke: COLORS[owner] || '#6b5a40', 'stroke-width': 1.5, 'stroke-linecap': 'round' });
        if (anim) { l.style.strokeDasharray = U; l.style.strokeDashoffset = U; l.style.transition = 'stroke-dashoffset .22s ease-out'; requestAnimationFrame(() => { l.style.strokeDashoffset = 0; }); }
        linesG.appendChild(l);
      };
      // 선의 주인은 기록하지 않으므로 중립색, 마지막 선만 플레이어 색
      state.h.forEach((x, i) => { if (x) drawLine('h', i, state.last && state.last.t === 'h' && state.last.i === i ? (lineEv ? lineEv.seat : -1) : -1, animate && lineEv && lineEv.t === 'h' && lineEv.i === i); });
      state.v.forEach((x, i) => { if (x) drawLine('v', i, state.last && state.last.t === 'v' && state.last.i === i ? (lineEv ? lineEv.seat : -1) : -1, animate && lineEv && lineEv.t === 'v' && lineEv.i === i); });
      const boxEv = events.find((e) => e.type === 'box');
      state.boxes.forEach((o, i) => {
        if (o < 0) return;
        const r = (i / n) | 0, c = i % n;
        const isNew = animate && boxEv && boxEv.boxes.includes(i);
        const g = svg('g', { class: isNew ? 'pop-in' : '', style: `transform-origin:${dot(c) + U / 2}px ${dot(r) + U / 2}px` });
        g.appendChild(svg('rect', { x: dot(c) + 0.8, y: dot(r) + 0.8, width: U - 1.6, height: U - 1.6, rx: 1.2, fill: COLORS[o], opacity: 0.55 }));
        g.appendChild(svg('text', { x: dot(c) + U / 2, y: dot(r) + U / 2 + 0.2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 4.5, 'font-weight': 900, fill: '#fff' }, o === 0 ? 'B' : 'R'));
        boxesG.appendChild(g);
      });
      if (animate) {
        if (lineEv) { ctx.sound.play('tap'); ctx.haptics.tap(); }
        if (boxEv) {
          for (const i of boxEv.boxes) { const r = (i / n) | 0, c = i % n; const p = px(dot(c) + U / 2, dot(r) + U / 2); ctx.fx.burst(p.x, p.y, { count: 16, palette: boxEv.seat === 0 ? 'blue' : 'red', speed: 1 }); }
          ctx.sound.play('score'); ctx.haptics.hit();
          if (!ctx.isOver()) ctx.fx.stamp('한 번 더!', { small: true, glow: boxEv.seat === 0 ? 'rgba(79,163,255,.9)' : 'rgba(255,107,107,.9)' });
        }
      }
      ctx.setSeatInfo(0, { score: state.scores[0] }); ctx.setSeatInfo(1, { score: state.scores[1] });
      if (ctx.canAct()) ctx.setStatus('두 점 사이를 눌러 선을 그으세요');
    },
    destroy() { if (el) el.remove(); },
  };
}
