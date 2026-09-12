import { h, svg } from '../../core/util.js';
import { CORNER_COLORS, SAFE, absOf } from './rules.js';

const PATH = [];
for (let c = 1; c <= 5; c++) PATH.push([c, 6]);
for (let r = 5; r >= 0; r--) PATH.push([6, r]);
PATH.push([7, 0]);
for (let r = 0; r <= 5; r++) PATH.push([8, r]);
for (let c = 9; c <= 14; c++) PATH.push([c, 6]);
PATH.push([14, 7]);
for (let c = 14; c >= 9; c--) PATH.push([c, 8]);
for (let r = 9; r <= 14; r++) PATH.push([8, r]);
PATH.push([7, 14]);
for (let r = 14; r >= 9; r--) PATH.push([6, r]);
for (let c = 5; c >= 0; c--) PATH.push([c, 8]);
PATH.push([0, 7]);
PATH.push([0, 6]);
const HOME_COL = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
];
const YARD = [[0, 0], [9, 0], [9, 9], [0, 9]];
const SLOTS = [[2, 2], [4, 2], [2, 4], [4, 4]];
const CENTER = [[6.8, 7.5], [7.5, 6.8], [8.2, 7.5], [7.5, 8.2]];

export function create(root, ctx) {
  let animating = false;
  const s = svg('svg', { viewBox: '0 0 15 15', style: 'width:100%;height:auto;display:block' });
  const el = h('div', { class: 'side-main', style: { width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.45)' } }, s);
  const ctl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '10px', marginTop: '8px', minHeight: '54px' } });
  const wrap = h('div', { class: 'side-layout' }, el, h('div', { class: 'side-aux' }, ctl));
  root.appendChild(wrap);

  // ---- 판 ----
  s.appendChild(svg('rect', { width: 15, height: 15, fill: '#f7f3ea' }));
  for (let k = 0; k < 4; k++) {
    const [x, y] = YARD[k];
    s.appendChild(svg('rect', { x, y, width: 6, height: 6, fill: CORNER_COLORS[k] }));
    s.appendChild(svg('rect', { x: x + 1, y: y + 1, width: 4, height: 4, rx: 0.4, fill: '#fff' }));
    for (const [sx, sy] of SLOTS) s.appendChild(svg('circle', { cx: x + sx, cy: y + sy, r: 0.45, fill: CORNER_COLORS[k], opacity: 0.25 }));
  }
  PATH.forEach(([x, y], i) => {
    const startOf = [0, 13, 26, 39].indexOf(i);
    s.appendChild(svg('rect', { x, y, width: 1, height: 1, fill: startOf >= 0 ? CORNER_COLORS[startOf] : '#fff', stroke: '#d9d2c3', 'stroke-width': 0.04 }));
    if (SAFE.has(i) && startOf < 0) s.appendChild(svg('text', { x: x + 0.5, y: y + 0.55, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.7, fill: '#c9b48a' }, '★'));
  });
  HOME_COL.forEach((cells, k) => cells.forEach(([x, y]) => s.appendChild(svg('rect', { x, y, width: 1, height: 1, fill: CORNER_COLORS[k], stroke: '#fff', 'stroke-width': 0.04 }))));
  s.appendChild(svg('polygon', { points: '6,6 7.5,7.5 6,9', fill: CORNER_COLORS[0] }));
  s.appendChild(svg('polygon', { points: '6,6 7.5,7.5 9,6', fill: CORNER_COLORS[1] }));
  s.appendChild(svg('polygon', { points: '9,6 7.5,7.5 9,9', fill: CORNER_COLORS[2] }));
  s.appendChild(svg('polygon', { points: '6,9 7.5,7.5 9,9', fill: CORNER_COLORS[3] }));
  const hlG = svg('g'); const tokG = svg('g'); const hitG = svg('g');
  s.append(hlG, tokG, hitG);

  function posOf(state, seat, p, tokenIdx) {
    const corner = state.corners[seat];
    if (p === -1) { const [x, y] = YARD[corner]; const [sx, sy] = SLOTS[tokenIdx]; return [x + sx, y + sy]; }
    if (p <= 50) { const [x, y] = PATH[absOf(state, seat, p)]; return [x + 0.5, y + 0.5]; }
    if (p <= 55) { const [x, y] = HOME_COL[corner][p - 51]; return [x + 0.5, y + 0.5]; }
    return CENTER[corner];
  }
  function pxOf(x, y) { const r = s.getBoundingClientRect(), r0 = ctx.boardArea.getBoundingClientRect(); const k = r.width / 15; return { x: r.left - r0.left + x * k, y: r.top - r0.top + y * k, size: k }; }

  function tokenEl(x, y, color, count) {
    const g = svg('g');
    g.appendChild(svg('circle', { cx: x, cy: y + 0.05, r: 0.4, fill: 'rgba(0,0,0,.35)' }));
    g.appendChild(svg('circle', { cx: x, cy: y, r: 0.38, fill: color, stroke: '#fff', 'stroke-width': 0.08 }));
    g.appendChild(svg('circle', { cx: x, cy: y, r: 0.16, fill: 'rgba(255,255,255,.55)' }));
    if (count > 1) { g.appendChild(svg('circle', { cx: x + 0.28, cy: y - 0.28, r: 0.2, fill: '#fff' })); g.appendChild(svg('text', { x: x + 0.28, y: y - 0.27, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.28, 'font-weight': 900, fill: '#222' }, String(count))); }
    return g;
  }

  function renderTokens(state) {
    tokG.innerHTML = ''; hlG.innerHTML = ''; hitG.innerHTML = '';
    const moves = ctx.canAct() ? ctx.legalMoves().filter((m) => m.token != null) : [];
    const movable = new Set(moves.map((m) => m.token));
    // 같은 좌표에 있는 말 묶기
    const groups = new Map();
    state.tokens.forEach((arr, seat) => arr.forEach((p, i) => {
      const [x, y] = posOf(state, seat, p, i);
      const key = `${seat}:${x.toFixed(2)},${y.toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, { seat, x, y, ids: [] });
      groups.get(key).ids.push(i);
    }));
    for (const g of groups.values()) {
      const color = CORNER_COLORS[state.corners[g.seat]];
      const t = tokenEl(g.x, g.y, color, g.ids.length);
      const isMovable = g.seat === state.turn && g.ids.some((i) => movable.has(i));
      if (isMovable) { t.style.filter = 'drop-shadow(0 0 0.15px #fff) drop-shadow(0 0 0.25px #fff)'; hlG.appendChild(svg('circle', { cx: g.x, cy: g.y, r: 0.5, fill: 'none', stroke: '#fff', 'stroke-width': 0.08, class: 'ludo-pulse' })); }
      tokG.appendChild(t);
      const hit = svg('circle', { cx: g.x, cy: g.y, r: 0.6, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
      hit.addEventListener('click', () => { if (!ctx.canAct() || animating) return; const mv = moves.find((m) => g.ids.includes(m.token)); if (mv) ctx.submit(mv); else ctx.sound.play('error'); });
      hitG.appendChild(hit);
    }
    // 목적지 표시
    for (const m of moves) {
      const p = state.tokens[state.turn][m.token];
      const to = p === -1 ? 0 : p + state.dice;
      const [x, y] = posOf(state, state.turn, to, m.token);
      hlG.appendChild(svg('circle', { cx: x, cy: y, r: 0.42, fill: 'none', stroke: CORNER_COLORS[state.corners[state.turn]], 'stroke-width': 0.1, 'stroke-dasharray': '0.2 0.12' }));
    }
  }

  function dieFace(n, big) {
    const size = big ? 46 : 34;
    const d = h('div', { style: { width: size + 'px', height: size + 'px', borderRadius: '10px', background: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,.4), inset 0 -3px 0 rgba(0,0,0,.12)', position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gridTemplateRows: 'repeat(3,1fr)', padding: '6px', gap: '2px' } });
    const map = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n] || [];
    for (let i = 0; i < 9; i++) d.appendChild(h('div', { style: { borderRadius: '50%', background: map.includes(i) ? '#222' : 'transparent' } }));
    return d;
  }

  function renderCtl(state, rollEv, animate) {
    ctl.innerHTML = '';
    if (animate && rollEv) {
      const holder = h('div');
      ctl.appendChild(holder);
      let k = 0;
      const t = setInterval(() => {
        holder.innerHTML = ''; holder.appendChild(dieFace(1 + ((Math.random() * 6) | 0), true));
        holder.firstChild.style.transform = `rotate(${(Math.random() - 0.5) * 40}deg)`;
        if (++k >= 8) {
          clearInterval(t); holder.innerHTML = ''; holder.appendChild(dieFace(rollEv.dice, true)); holder.firstChild.classList.add('pop-in');
          if (rollEv.dice === 6) { ctx.fx.stamp('6! 한 번 더', { small: true, glow: 'rgba(255,194,71,.9)' }); ctx.sound.play('bonus'); }
          renderTokens(state); afterRoll(state);
          // 굴렸는데 움직일 말이 없어 차례가 넘어간 경우: 잠시 보여준 뒤 다음 사람 컨트롤로
          if (state.dice == null) setTimeout(() => { if (ctx.match.state === state) renderCtl(state, null, false); }, 700);
          (ctx.relayout ? ctx.relayout() : window.dispatchEvent(new Event('resize')));
        }
      }, 70);
      return;
    }
    if (state.dice != null) ctl.appendChild(dieFace(state.dice, true));
    if (ctx.canAct() && state.dice == null) ctl.appendChild(h('button', { class: 'btn btn-primary btn-lg', text: '🎲 굴리기', onclick: () => { if (!animating) ctx.submit({ roll: true }); } }));
  }
  function afterRoll(state) {
    // 움직일 말이 하나뿐이면 자동으로
    if (!ctx.canAct()) return;
    const moves = ctx.legalMoves().filter((m) => m.token != null);
    if (moves.length === 1) setTimeout(() => { if (ctx.canAct() && ctx.match.state === state) ctx.submit(moves[0]); }, 500);
  }

  return {
    update(state, events, prev, animate) {
      const rollEv = events.find((e) => e.type === 'roll');
      const moveEv = events.find((e) => e.type === 'move');
      if (animate && rollEv) { ctx.sound.play('dice'); ctx.haptics.rattle(); ctx.lock(620); }
      if (animate && moveEv && prev) {
        // 말이 칸을 따라 통통 튀며 이동
        const seat = moveEv.seat;
        const steps = [];
        if (moveEv.from === -1) steps.push(0); else for (let p = moveEv.from + 1; p <= moveEv.to; p++) steps.push(p);
        const stepMs = steps.length > 6 ? 90 : 130;
        animating = true; ctx.lock(steps.length * stepMs + 60);
        renderTokens(state);
        // 도착 말 숨기고 유령 말로 이동
        const [tx, ty] = posOf(state, seat, moveEv.to, moveEv.token);
        const dest = [...tokG.children].find((g) => { const c = g.querySelector('circle:nth-child(2)'); return c && Math.abs(+c.getAttribute('cx') - tx) < 0.01 && Math.abs(+c.getAttribute('cy') - ty) < 0.01; });
        if (dest) dest.style.opacity = '0';
        const color = CORNER_COLORS[state.corners[seat]];
        const ghost = tokenEl(0, 0, color, 1);
        const [fx0, fy0] = posOf(prev, seat, moveEv.from, moveEv.token);
        ghost.style.transition = `transform ${stepMs}ms ease-in-out`;
        ghost.style.transform = `translate(${fx0}px, ${fy0}px)`;
        tokG.appendChild(ghost);
        steps.forEach((p, k) => setTimeout(() => { const [x, y] = posOf(state, seat, p, moveEv.token); ghost.style.transform = `translate(${x}px, ${y}px)`; ctx.sound.play('tap'); }, 30 + k * stepMs));
        setTimeout(() => {
          ghost.remove(); animating = false;
          if (dest) dest.style.opacity = '';
          const cap = events.find((e) => e.type === 'capture');
          const home = events.find((e) => e.type === 'home');
          const p = pxOf(tx, ty);
          if (cap) { ctx.fx.burst(p.x, p.y, { count: 24, palette: 'fire', speed: 1.3 }); ctx.fx.stamp('잡았다!', { glow: 'rgba(255,92,122,.95)' }); ctx.sound.play('capture'); ctx.haptics.heavy(); ctx.fx.shake(true); }
          else if (home) { ctx.fx.sparkle(p.x, p.y, p.size, 'gold'); ctx.fx.stamp('집 도착!', { small: true, glow: 'rgba(61,220,151,.95)' }); ctx.sound.play('score'); ctx.haptics.success(); }
          else ctx.haptics.tap();
          renderTokens(state); renderCtl(state, null, false);
          if (state.dice != null) afterRoll(state);
        }, steps.length * stepMs + 80);
      } else renderTokens(state);
      if (!(animate && moveEv)) renderCtl(state, rollEv, animate);
      if (animate && events.some((e) => e.type === 'threeSixes')) setTimeout(() => ctx.fx.stamp('6 세 번! 차례 넘김', { small: true, glow: 'rgba(255,92,122,.9)' }), 600);
      for (let seat = 0; seat < state.n; seat++) {
        const arr = state.tokens[seat];
        ctx.setSeatInfo(seat, { score: `${arr.filter((p) => p === 56).length}/4`, sub: `${ctx.seatNames[seat]} · 대기 ${arr.filter((p) => p === -1).length}` });
      }
      if (ctx.canAct()) ctx.setStatus(state.dice == null ? '주사위를 굴리세요' : '움직일 말을 누르세요');
      else ctx.setStatus(`<b>${ctx.seats[state.turn].name}</b>님 차례`);
    },
    destroy() { wrap.remove(); },
  };
}
