import { h, svg } from '../../core/util.js';

const RED = '#ff5c5c', BLUE = '#4fa3ff';
const W = Math.sqrt(3);

export function create(root, ctx) {
  let n = 0, el = null, cellsG = null, stonesG = null, s = null;
  let pos = [];

  function build(size) {
    if (el) el.remove();
    n = size;
    const margin = 1.2;
    const width = W * (n + (n - 1) / 2) + margin * 2, height = 1.5 * (n - 1) + 2 + margin * 2;
    s = svg('svg', { viewBox: `0 0 ${width} ${height}`, style: 'width:100%;height:auto;display:block;filter:drop-shadow(0 8px 16px rgba(0,0,0,.4))' });
    pos = [];
    for (let i = 0; i < n * n; i++) { const r = (i / n) | 0, c = i % n; pos.push({ x: margin + W * (c + r / 2) + W / 2, y: margin + 1.5 * r + 1 }); }
    const hexPts = (x, y, rad = 1) => [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return `${(x + Math.cos(a) * rad).toFixed(3)},${(y + Math.sin(a) * rad).toFixed(3)}`; }).join(' ');
    // 테두리 색상 띠
    const top = pos.slice(0, n), bottom = pos.slice(n * (n - 1)), left = pos.filter((_, i) => i % n === 0), right = pos.filter((_, i) => i % n === n - 1);
    const strip = (cells, dx, dy, color) => s.appendChild(svg('polyline', { points: cells.map((p) => `${(p.x + dx).toFixed(2)},${(p.y + dy).toFixed(2)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 }));
    strip(top, 0, -1.25, RED); strip(bottom, 0, 1.25, RED); strip(left, -1.15, 0.2, BLUE); strip(right, 1.15, -0.2, BLUE);
    cellsG = svg('g'); stonesG = svg('g');
    s.append(cellsG, stonesG);
    for (let i = 0; i < n * n; i++) {
      const p = pos[i];
      const poly = svg('polygon', { points: hexPts(p.x, p.y, 0.96), fill: '#e9dcc4', stroke: '#6b5a40', 'stroke-width': 0.08, dataset: null });
      poly.dataset.i = i;
      poly.addEventListener('click', () => {
        if (!ctx.canAct()) return;
        const mv = ctx.legalMoves().find((m) => m.i === i);
        if (!mv) { ctx.sound.play('error'); return; }
        ctx.submit(mv);
      });
      cellsG.appendChild(poly);
    }
    el = h('div', { class: 'hex-board', style: { width: '100%', position: 'relative' } }, s);
    root.appendChild(el);
  }

  function pointPx(i) {
    // SVG 좌표 → 화면(px) 좌표 (fx용)
    const rect = s.getBoundingClientRect();
    const vb = s.viewBox.baseVal;
    const scale = rect.width / vb.width;
    return { x: pos[i].x * scale, y: pos[i].y * scale, size: W * scale };
  }

  return {
    update(state, events, prev, animate) {
      if (state.size !== n) build(state.size);
      stonesG.innerHTML = '';
      state.board.forEach((v, i) => {
        if (v < 0) return;
        const p = pos[i];
        const g = svg('g', { class: animate && i === state.last ? 'pop-in' : '', style: `transform-origin:${p.x}px ${p.y}px` });
        g.appendChild(svg('circle', { cx: p.x, cy: p.y + 0.08, r: 0.66, fill: 'rgba(0,0,0,.35)' }));
        g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 0.64, fill: v === 0 ? RED : BLUE, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 0.06 }));
        g.appendChild(svg('ellipse', { cx: p.x - 0.18, cy: p.y - 0.22, rx: 0.25, ry: 0.14, fill: 'rgba(255,255,255,.35)' }));
        if (i === state.last) g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 0.28, fill: 'none', stroke: '#fff', 'stroke-width': 0.08 }));
        stonesG.appendChild(g);
      });
      for (const c of cellsG.children) c.setAttribute('fill', '#e9dcc4');
      for (const ev of events) {
        if (ev.type === 'place' && animate) { ctx.sound.play('place'); ctx.haptics.tap(); const p = pointPx(ev.i); ctx.fx.ring(p.x, p.y, { color: ev.seat === 0 ? RED : BLUE, size: p.size * 0.8 }); }
        else if (ev.type === 'win') {
          for (const i of ev.cells) cellsG.children[i].setAttribute('fill', ev.seat === 0 ? 'rgba(255,92,92,.45)' : 'rgba(79,163,255,.45)');
          ev.cells.forEach((i, k) => setTimeout(() => { const p = pointPx(i); ctx.fx.burst(p.x, p.y, { count: 8, palette: ev.seat === 0 ? 'red' : 'blue', speed: 0.8 }); }, k * 40));
          ctx.fx.stamp('연결!', { glow: ev.seat === 0 ? 'rgba(255,92,92,.9)' : 'rgba(79,163,255,.9)' });
          ctx.sound.play('capture'); ctx.fx.shake(true);
        }
      }
      const c0 = state.board.filter((v) => v === 0).length, c1 = state.board.filter((v) => v === 1).length;
      ctx.setSeatInfo(0, { score: c0, sub: '빨강 · 위↔아래' }); ctx.setSeatInfo(1, { score: c1, sub: '파랑 · 왼쪽↔오른쪽' });
      if (ctx.canAct()) ctx.setStatus(state.turn === 0 ? '<b style="color:#ff5c5c">위와 아래</b>를 이으세요' : '<b style="color:#4fa3ff">왼쪽과 오른쪽</b>을 이으세요');
    },
    destroy() { if (el) el.remove(); },
  };
}
