import { h, svg } from '../../core/util.js';
import { POINTS, MILLS } from './rules.js';

const COLORS = ['#f3efe6', '#2b2b30'];
const S = 12; // 그리드 단위
const P = (k) => 8 + k * S;

export function create(root, ctx) {
  let selected = null;
  const W = 6 * S + 16;
  const s = svg('svg', { viewBox: `0 0 ${W} ${W}`, style: 'width:100%;height:auto;display:block' });
  s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: W, rx: 4, fill: '#e9c98f' }));
  const linesG = svg('g', { stroke: '#5a3d22', 'stroke-width': 0.7, 'stroke-linecap': 'round', fill: 'none' });
  for (const [a, b, c] of MILLS) linesG.appendChild(svg('line', { x1: P(POINTS[a][0]), y1: P(POINTS[a][1]), x2: P(POINTS[c][0]), y2: P(POINTS[c][1]) }));
  s.appendChild(linesG);
  const dotsG = svg('g');
  POINTS.forEach(([x, y]) => dotsG.appendChild(svg('circle', { cx: P(x), cy: P(y), r: 1.3, fill: '#5a3d22' })));
  s.appendChild(dotsG);
  const hlG = svg('g'); const piecesG = svg('g'); const hitG = svg('g');
  s.append(hlG, piecesG, hitG);
  POINTS.forEach(([x, y], i) => {
    const c = svg('circle', { cx: P(x), cy: P(y), r: 5.2, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
    c.addEventListener('click', () => onTap(i));
    hitG.appendChild(c);
  });
  const el = h('div', { style: { width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.4)' } }, s);
  root.appendChild(el);
  const style = h('style', { text: `.morris-rm { animation: pulse-bg .8s ease-in-out infinite; }` });
  root.appendChild(style);

  function px(i) { const rect = s.getBoundingClientRect(); const k = rect.width / W; return { x: P(POINTS[i][0]) * k, y: P(POINTS[i][1]) * k, size: 10 * k }; }

  function onTap(i) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    const moves = ctx.legalMoves();
    if (state.remove >= 0) { const mv = moves.find((m) => m.remove === i); if (mv) ctx.submit(mv); else ctx.sound.play('error'); return; }
    if (state.hand[state.turn] > 0) { const mv = moves.find((m) => m.place === i); if (mv) ctx.submit(mv); else ctx.sound.play('error'); return; }
    if (selected != null) { const mv = moves.find((m) => m.from === selected && m.to === i); if (mv) { selected = null; ctx.submit(mv); return; } }
    if (state.board[i] === state.turn) { selected = selected === i ? null : i; ctx.sound.play('tap'); drawHl(state); }
    else if (selected != null) { selected = null; drawHl(state); }
  }

  function drawHl(state) {
    hlG.innerHTML = '';
    if (ctx.isOver()) return;
    const moves = ctx.canAct() ? ctx.legalMoves() : [];
    const ring = (i, color, r = 4.6) => hlG.appendChild(svg('circle', { cx: P(POINTS[i][0]), cy: P(POINTS[i][1]), r, fill: 'none', stroke: color, 'stroke-width': 1.1 }));
    if (state.remove >= 0 && ctx.canAct()) { for (const m of moves) { const c = svg('circle', { cx: P(POINTS[m.remove][0]), cy: P(POINTS[m.remove][1]), r: 5, fill: 'rgba(255,92,122,.35)', class: 'morris-rm' }); hlG.appendChild(c); } return; }
    if (selected != null) { ring(selected, 'var(--accent)'); for (const m of moves) if (m.from === selected) hlG.appendChild(svg('circle', { cx: P(POINTS[m.to][0]), cy: P(POINTS[m.to][1]), r: 1.8, fill: 'rgba(0,0,0,.4)' })); }
    else if (ctx.canAct() && state.hand[state.turn] > 0) for (const m of moves) hlG.appendChild(svg('circle', { cx: P(POINTS[m.place][0]), cy: P(POINTS[m.place][1]), r: 1.6, fill: 'rgba(0,0,0,.25)' }));
    if (state.last != null) ring(state.last, 'rgba(255,194,71,.9)', 4.9);
  }

  return {
    update(state, events, prev, animate) {
      selected = null;
      piecesG.innerHTML = '';
      state.board.forEach((v, i) => {
        if (v < 0) return;
        const [x, y] = POINTS[i];
        const g = svg('g', { class: animate && (events.some((e) => (e.type === 'place' && e.i === i) || (e.type === 'move' && e.to === i))) ? 'pop-in' : '', style: `transform-origin:${P(x)}px ${P(y)}px` });
        g.appendChild(svg('circle', { cx: P(x), cy: P(y) + 0.5, r: 4.2, fill: 'rgba(0,0,0,.35)' }));
        g.appendChild(svg('circle', { cx: P(x), cy: P(y), r: 4.1, fill: COLORS[v], stroke: v === 0 ? '#9a917f' : '#000', 'stroke-width': 0.4 }));
        g.appendChild(svg('ellipse', { cx: P(x) - 1.2, cy: P(y) - 1.4, rx: 1.6, ry: 0.9, fill: v === 0 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)' }));
        piecesG.appendChild(g);
      });
      if (animate) for (const ev of events) {
        if (ev.type === 'place' || ev.type === 'move') { ctx.sound.play(ev.type === 'place' ? 'place' : 'move'); ctx.haptics.tap(); }
        else if (ev.type === 'mill') { ctx.fx.stamp('밀!', { glow: 'rgba(255,194,71,.9)' }); ctx.sound.play('bonus'); ctx.haptics.heavy(); for (const p of ev.line) { const q = px(p); ctx.fx.burst(q.x, q.y, { count: 10, palette: 'gold', speed: 0.8 }); } }
        else if (ev.type === 'remove') { const q = px(ev.i); ctx.fx.burst(q.x, q.y, { count: 22, palette: ev.seat === 0 ? 'smoke' : 'white', speed: 1.2 }); ctx.fx.ring(q.x, q.y, { color: '#ff5c7a', size: q.size * 0.8 }); ctx.sound.play('capture'); ctx.haptics.hit(); ctx.fx.shake(); }
      }
      drawHl(state);
      const c0 = state.board.filter((v) => v === 0).length, c1 = state.board.filter((v) => v === 1).length;
      ctx.setSeatInfo(0, { score: c0, sub: `흰색 · 손에 ${state.hand[0]}개` }); ctx.setSeatInfo(1, { score: c1, sub: `검정 · 손에 ${state.hand[1]}개` });
      if (ctx.canAct()) ctx.setStatus(state.remove >= 0 ? '<b style="color:var(--bad)">밀!</b> 제거할 상대 말을 고르세요' : state.hand[state.turn] > 0 ? `말을 놓으세요 (남은 말 ${state.hand[state.turn]}개)` : c0 === 3 && state.turn === 0 || c1 === 3 && state.turn === 1 ? '말이 3개! 어디로든 날아갈 수 있어요' : '움직일 말을 고르세요');
    },
    destroy() { el.remove(); style.remove(); },
  };
}
