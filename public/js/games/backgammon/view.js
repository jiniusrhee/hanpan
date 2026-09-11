import { h, svg } from '../../core/util.js';
import { pipCount } from './rules.js';

const W = 300, H = 200, PW = 22, TH = 78;
const COL = { w: '#f3efe6', b: '#2b2b30', wStroke: '#9a917f', bStroke: '#000' };

export function create(root, ctx) {
  const persp = ctx.perspective;
  let selected = null; // 'bar' | point number
  let rolling = false;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto;display:block' });
  const el = h('div', { style: { width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.45)' } }, s);
  root.appendChild(el);
  const rollBtn = h('button', { class: 'btn btn-primary btn-lg', text: '🎲 주사위 굴리기', style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 8 }, onclick: () => { if (ctx.canAct()) { const mv = ctx.legalMoves().find((m) => m.roll); if (mv) ctx.submit(mv); } } });
  rollBtn.classList.add('hidden');
  root.appendChild(rollBtn);

  // 표시 포인트 → 좌표. 표시 기준: 1~6 오른쪽 아래(홈), 7~12 왼쪽 아래, 13~18 왼쪽 위, 19~24 오른쪽 위
  const dispOf = (p) => (persp === 0 ? p : 25 - p);
  function geom(dp) {
    const bottom = dp <= 12;
    let col; // 0..11 왼쪽부터
    if (dp <= 6) col = 12 - dp; else if (dp <= 12) col = 12 - dp; else col = dp - 13;
    const x = 12 + col * PW + (col >= 6 ? 16 : 0) + PW / 2;
    return { x, bottom };
  }
  const barX = W / 2 + 2, offX = W - 12;

  function checkerPos(dp, idx, count) {
    const { x, bottom } = geom(dp);
    const step = count > 5 ? (TH - 12) / (count - 1) : 18;
    const y = bottom ? H - 12 - idx * step : 12 + idx * step;
    return { x, y };
  }

  function drawBoard() {
    s.innerHTML = '';
    s.appendChild(svg('rect', { width: W, height: H, fill: '#6b4423' }));
    s.appendChild(svg('rect', { x: 8, y: 6, width: 138, height: H - 12, fill: '#c9a46a', rx: 3 }));
    s.appendChild(svg('rect', { x: 162, y: 6, width: 122, height: H - 12, fill: '#c9a46a', rx: 3 }));
    s.appendChild(svg('rect', { x: 146, y: 6, width: 16, height: H - 12, fill: '#4a2e14' }));
    s.appendChild(svg('rect', { x: 286, y: 6, width: 8, height: H - 12, fill: '#4a2e14', rx: 2 }));
    for (let dp = 1; dp <= 24; dp++) {
      const { x, bottom } = geom(dp);
      const y0 = bottom ? H - 6 : 6, y1 = bottom ? H - 6 - TH : 6 + TH;
      s.appendChild(svg('polygon', { points: `${x - PW / 2},${y0} ${x + PW / 2},${y0} ${x},${y1}`, fill: dp % 2 === 0 ? '#8b5a2b' : '#efd7ac', opacity: 0.95 }));
      const t = svg('text', { x, y: bottom ? H - 1 : 5, 'text-anchor': 'middle', 'font-size': 4, fill: '#f7e1b5', 'dominant-baseline': bottom ? 'auto' : 'hanging' }, String(persp === 0 ? dp : 25 - dp));
      s.appendChild(t);
    }
  }

  const hitG = svg('g'); const srcG = svg('g'); const pieceG = svg('g'); const hlG = svg('g'); const diceG = svg('g');

  function pxOf(x, y) { const r = s.getBoundingClientRect(); const k = r.width / W; return { x: x * k, y: y * k, size: 20 * k }; }

  function checker(x, y, color, cls) {
    const g = svg('g', { class: cls || '' });
    g.appendChild(svg('circle', { cx: x, cy: y + 0.8, r: 9.5, fill: 'rgba(0,0,0,.35)' }));
    g.appendChild(svg('circle', { cx: x, cy: y, r: 9.3, fill: color === 0 ? COL.w : COL.b, stroke: color === 0 ? COL.wStroke : COL.bStroke, 'stroke-width': 0.8 }));
    g.appendChild(svg('circle', { cx: x, cy: y, r: 6, fill: 'none', stroke: color === 0 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.15)', 'stroke-width': 1.2 }));
    return g;
  }

  function drawPieces(state, moveEv, animate) {
    pieceG.innerHTML = '';
    for (let p = 1; p <= 24; p++) {
      const v = state.board[p]; if (!v) continue;
      const color = v > 0 ? 0 : 1, n = Math.abs(v), dp = dispOf(p);
      for (let i = 0; i < Math.min(n, 5); i++) {
        const { x, y } = checkerPos(dp, i, Math.min(n, 5));
        const isTop = i === Math.min(n, 5) - 1;
        const g = checker(x, y, color);
        if (isTop && n > 5) g.appendChild(svg('text', { x, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 8, 'font-weight': 900, fill: color === 0 ? '#333' : '#fff' }, String(n)));
        if (animate && moveEv && isTop && moveEv.to === p) animateFrom(g, moveEv, x, y);
        pieceG.appendChild(g);
      }
    }
    // 바
    for (const seat of [0, 1]) {
      const n = state.bar[seat];
      for (let i = 0; i < Math.min(n, 4); i++) {
        const y = (seat === persp) ? H / 2 + 14 + i * 12 : H / 2 - 14 - i * 12;
        const g = checker(barX + 6, y, seat); pieceG.appendChild(g);
        if (i === Math.min(n, 4) - 1 && n > 4) g.appendChild(svg('text', { x: barX + 6, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 8, 'font-weight': 900, fill: seat === 0 ? '#333' : '#fff' }, String(n)));
      }
    }
    // 베어오프
    for (const seat of [0, 1]) {
      const n = state.off[seat];
      for (let i = 0; i < n; i++) {
        const y = seat === persp ? H - 8 - i * 5.6 : 8 + i * 5.6;
        pieceG.appendChild(svg('rect', { x: offX - 3, y: y - 2.2, width: 6, height: 4.4, rx: 1, fill: seat === 0 ? COL.w : COL.b, stroke: 'rgba(0,0,0,.4)', 'stroke-width': 0.4 }));
      }
    }
  }

  function animateFrom(g, ev, x, y) {
    let fx, fy;
    if (ev.from === 'bar') { fx = barX + 6; fy = H / 2; } else { const dp = dispOf(ev.from); const n = 1; const p = checkerPos(dp, 0, n); fx = p.x; fy = p.y; }
    g.style.transition = 'none';
    g.style.transform = `translate(${fx - x}px, ${fy - y}px)`;
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = 'transform .38s cubic-bezier(.2,.8,.2,1.15)'; g.style.transform = 'translate(0,0)'; }));
  }

  function drawDice(state, rollEv, animate) {
    diceG.innerHTML = '';
    const dice = state.dice;
    const cx = 224, cy = H / 2;
    const face = (x, y, n, dim) => {
      const g = svg('g', { opacity: dim ? 0.35 : 1 });
      g.appendChild(svg('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 4, fill: '#fff', stroke: '#999', 'stroke-width': 0.6 }));
      const pips = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n] || [];
      for (const [px, py] of pips) g.appendChild(svg('circle', { cx: x + px * 4.5, cy: y + py * 4.5, r: 1.7, fill: '#222' }));
      return g;
    };
    if (animate && rollEv) {
      rolling = true;
      let k = 0;
      const t = setInterval(() => {
        diceG.innerHTML = '';
        const jitter = () => (Math.random() - 0.5) * 6;
        diceG.appendChild(face(cx - 14 + jitter(), cy + jitter(), 1 + ((Math.random() * 6) | 0)));
        diceG.appendChild(face(cx + 14 + jitter(), cy + jitter(), 1 + ((Math.random() * 6) | 0)));
        if (++k >= 8) { clearInterval(t); rolling = false; diceG.innerHTML = ''; diceG.appendChild(face(cx - 14, cy, rollEv.dice[0])); diceG.appendChild(face(cx + 14, cy, rollEv.dice[1])); if (rollEv.dice[0] === rollEv.dice[1]) ctx.fx.stamp('더블!', { small: true, glow: 'rgba(255,194,71,.9)' }); }
      }, 70);
      return;
    }
    if (!dice) return;
    // 남은 주사위 + 사용한 주사위
    const all = [...dice, ...state.used];
    const n = all.length;
    all.forEach((d, i) => diceG.appendChild(face(cx + (i - (n - 1) / 2) * 22, cy, d, i >= dice.length)));
  }

  function drawHl(state) {
    hlG.innerHTML = ''; srcG.innerHTML = '';
    if (!ctx.canAct() || !state.dice) return;
    const moves = ctx.legalMoves().filter((m) => m.from != null);
    const mark = (target, color) => {
      if (target === 'off') { hlG.appendChild(svg('rect', { x: offX - 5, y: persp === 0 ? H - 60 : 6, width: 10, height: 54, rx: 2, fill: 'none', stroke: color, 'stroke-width': 1.5 })); return; }
      const { x, bottom } = geom(dispOf(target));
      hlG.appendChild(svg('circle', { cx: x, cy: bottom ? H - 12 : 12, r: 5, fill: color, opacity: 0.85 }));
    };
    if (selected == null) {
      // 움직일 수 있는 출발점 표시
      for (const from of new Set(moves.map((m) => m.from))) {
        if (from === 'bar') hlG.appendChild(svg('rect', { x: barX - 4, y: 8, width: 20, height: H - 16, rx: 3, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.5 }));
        else { const { x, bottom } = geom(dispOf(from)); srcG.appendChild(svg('polygon', { points: `${x - PW / 2},${bottom ? H - 6 : 6} ${x + PW / 2},${bottom ? H - 6 : 6} ${x},${bottom ? H - 6 - TH : 6 + TH}`, fill: 'rgba(255,122,69,.45)' })); }
      }
    } else {
      for (const m of moves) if (m.from === selected) mark(m.to, 'rgba(61,220,151,.95)');
    }
  }

  function onTap(target) {
    if (!ctx.canAct() || rolling) return;
    const state = ctx.match.state;
    if (!state.dice) return;
    const moves = ctx.legalMoves().filter((m) => m.from != null);
    if (selected != null) {
      const mv = moves.find((m) => m.from === selected && m.to === target);
      if (mv) { selected = null; ctx.submit(mv); return; }
    }
    const froms = moves.filter((m) => m.from === target);
    if (froms.length) {
      // 목적지가 하나뿐이면 바로 이동
      if (froms.length === 1) { selected = null; ctx.submit(froms[0]); return; }
      selected = target; ctx.sound.play('tap'); drawHl(state);
    } else { selected = null; drawHl(state); if (target !== selected) ctx.sound.play('error'); }
  }

  drawBoard();
  s.append(hitG, srcG, pieceG, hlG, diceG);
  // 히트 영역
  for (let dp = 1; dp <= 24; dp++) {
    const { x, bottom } = geom(dp);
    const r = svg('rect', { x: x - PW / 2, y: bottom ? H - 6 - TH - 10 : 6, width: PW, height: TH + 10, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
    r.addEventListener('click', () => onTap(persp === 0 ? dp : 25 - dp));
    hitG.appendChild(r);
  }
  const barHit = svg('rect', { x: barX - 4, y: 6, width: 20, height: H - 12, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
  barHit.addEventListener('click', () => onTap('bar')); hitG.appendChild(barHit);
  const offHit = svg('rect', { x: offX - 8, y: 6, width: 16, height: H - 12, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
  offHit.addEventListener('click', () => onTap('off')); hitG.appendChild(offHit);
  hitG.remove(); s.appendChild(hitG); // 맨 위로

  return {
    update(state, events, prev, animate) {
      selected = null;
      const rollEv = events.find((e) => e.type === 'roll');
      const moveEv = events.find((e) => e.type === 'move');
      drawPieces(state, moveEv, animate);
      drawDice(state, rollEv, animate);
      if (animate) {
        if (rollEv) { ctx.sound.play('dice'); ctx.haptics.rattle(); ctx.lock(600); }
        if (moveEv) {
          ctx.sound.play(moveEv.to === 'off' ? 'coin' : 'move'); ctx.haptics.tap();
          if (moveEv.hit) { const { x, bottom } = geom(dispOf(moveEv.to)); const p = pxOf(x, bottom ? H - 12 : 12); ctx.fx.burst(p.x, p.y, { count: 18, palette: moveEv.seat === 0 ? 'smoke' : 'white', speed: 1.1 }); ctx.sound.play('capture'); ctx.haptics.hit(); ctx.fx.shake(); ctx.fx.stamp('히트!', { small: true, glow: 'rgba(255,92,122,.9)' }); }
        }
        if (events.some((e) => e.type === 'noMoves') && !events.some((e) => e.type === 'win')) { const who = events.find((e) => e.type === 'noMoves').seat; setTimeout(() => ctx.fx.stamp(who === state.turn ? '' : '둘 수 없음', { small: true, glow: 'rgba(88,166,255,.9)' }), rollEv ? 650 : 0); }
      }
      setTimeout(() => drawHl(state), animate && rollEv ? 620 : 0);
      rollBtn.classList.toggle('hidden', !(ctx.canAct() && !state.dice));
      ctx.setSeatInfo(0, { score: `${state.off[0]}/15`, sub: `흰색 · 남은 거리 ${pipCount(state, 0)}` });
      ctx.setSeatInfo(1, { score: `${state.off[1]}/15`, sub: `검정 · 남은 거리 ${pipCount(state, 1)}` });
      if (ctx.canAct()) ctx.setStatus(state.dice ? (state.bar[state.turn] ? '<b>바</b>의 말을 먼저 들여보내세요' : '움직일 말이 있는 칸을 누르세요') : '주사위를 굴리세요');
    },
    destroy() { el.remove(); rollBtn.remove(); },
  };
}
