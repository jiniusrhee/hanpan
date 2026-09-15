import { h, svg } from '../../core/util.js';
import { NODE_XY, FINISH, NAMES, destOf } from './rules.js';

const COLORS = ['#4fa3ff', '#ff6b6b', '#3ddc97', '#ffc247'];
const M = 0.6; // 여백
const X = (i) => NODE_XY[i][0] + M, Y = (i) => NODE_XY[i][1] + M;

export function create(root, ctx) {
  let selResult = 0;
  let animating = false;
  const wrap = h('div', { class: 'side-layout' });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .yut-sticks { display: flex; justify-content: center; gap: 10px; height: 52px; align-items: center; }
    .yut-stick { width: 13px; height: 44px; border-radius: 7px; background: linear-gradient(90deg, #8b5a2b, #5e3a17); box-shadow: 0 3px 6px rgba(0,0,0,.4); transition: transform .2s; }
    .yut-stick.flat { background: linear-gradient(90deg, #f1d9a7, #d9b77c); border: 1px solid #8b5a2b; }
    .yut-stick.marked::after { content: ''; display: block; width: 6px; height: 6px; border-radius: 50%; background: #c0392b; margin: 6px auto 0; }
    .yut-stick.tumble { animation: yut-tumble .75s cubic-bezier(.3,.7,.4,1) both; }
    @keyframes yut-tumble { 0% { transform: translateY(-60px) rotate(0) scale(1.2); opacity: 0; } 30% { opacity: 1; } 60% { transform: translateY(6px) rotate(380deg) scale(1); } 80% { transform: translateY(-4px) rotate(355deg); } 100% { transform: translateY(0) rotate(360deg); } }
    .yut-ctl { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; align-items: center; margin-top: 4px; }
    .yut-chip { min-height: 36px; padding: 6px 12px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); font-weight: 800; font-size: 13px; }
    .yut-chip.sel { background: var(--accent); color: #fff; border-color: transparent; }
    .yut-token { cursor: pointer; }
    .yut-token.movable { filter: drop-shadow(0 0 3px #fff); }
  ` });
  root.appendChild(style);

  const s = svg('svg', { viewBox: `0 0 ${6 + M * 2} ${6 + M * 2}`, style: 'width:100%;height:auto;display:block' });
  const boardEl = h('div', { class: 'side-main', style: { width: '100%', background: '#e9c98f', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,.4)' } }, s);
  wrap.appendChild(boardEl);
  // 선
  const L = (a, b) => svg('line', { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), stroke: '#5a3d22', 'stroke-width': 0.05 });
  s.append(L(0, 5), L(5, 10), L(10, 15), L(15, 0), L(5, 15), L(10, 0));
  const nodeG = svg('g'); const hlG = svg('g'); const tokG = svg('g'); const hitG = svg('g');
  s.append(nodeG, hlG, tokG, hitG);
  for (let i = 0; i < NODE_XY.length; i++) {
    const big = i === 0 || i === 5 || i === 10 || i === 15 || i === 22;
    nodeG.appendChild(svg('circle', { cx: X(i), cy: Y(i), r: big ? 0.32 : 0.2, fill: big ? '#f5e6c8' : '#f1d9a7', stroke: '#5a3d22', 'stroke-width': 0.05 }));
    if (big) nodeG.appendChild(svg('circle', { cx: X(i), cy: Y(i), r: 0.2, fill: 'none', stroke: '#5a3d22', 'stroke-width': 0.04 }));
    const hit = svg('circle', { cx: X(i), cy: Y(i), r: 0.42, fill: 'rgba(0,0,0,0)', style: 'cursor:pointer' });
    hit.addEventListener('click', () => onNodeTap(i));
    hitG.appendChild(hit);
  }
  nodeG.appendChild(svg('text', { x: X(0), y: Y(0) + 0.55, 'text-anchor': 'middle', 'font-size': 0.24, 'font-weight': 800, fill: '#5a3d22' }, '출발·도착'));

  const sticksEl = h('div', { class: 'yut-sticks' });
  const ctl = h('div', { class: 'yut-ctl' });
  wrap.append(h('div', { class: 'side-aux' }, sticksEl, ctl));

  function pxOf(i) { const r = s.getBoundingClientRect(), r0 = ctx.boardArea.getBoundingClientRect(); const k = r.width / (6 + M * 2); return { x: r.left - r0.left + X(i) * k, y: r.top - r0.top + Y(i) * k, size: k }; }

  function renderSticks(sticks, tumble) {
    sticksEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const flat = sticks ? sticks[i] : i % 2 === 0;
      const el = h('div', { class: 'yut-stick' + (flat ? ' flat' : '') + (i === 0 ? ' marked' : '') + (tumble ? ' tumble' : ''), style: { animationDelay: `${i * 60}ms` } });
      sticksEl.appendChild(el);
    }
  }

  function movesFor(state) { return ctx.canAct() ? ctx.legalMoves() : []; }

  function renderTokens(state) {
    tokG.innerHTML = ''; hlG.innerHTML = '';
    const moves = movesFor(state).filter((m) => m.token != null && m.result === selResult);
    const movableTokens = new Set(moves.map((m) => m.token));
    // 위치별로 묶기
    const groups = new Map();
    state.tokens.forEach((arr, seat) => arr.forEach((t, i) => { if (t.pos === -1 || t.pos === FINISH) return; const k = `${t.pos}`; if (!groups.has(k)) groups.set(k, { pos: t.pos, seat, ids: [] }); groups.get(k).ids.push(i); }));
    for (const g of groups.values()) {
      const cx = X(g.pos), cy = Y(g.pos);
      const isMine = g.seat === state.turn && g.ids.some((i) => movableTokens.has(i));
      const el = svg('g', { class: 'yut-token' + (isMine ? ' movable' : '') });
      el.appendChild(svg('circle', { cx, cy: cy + 0.03, r: 0.27, fill: 'rgba(0,0,0,.35)' }));
      el.appendChild(svg('circle', { cx, cy, r: 0.26, fill: COLORS[g.seat], stroke: '#fff', 'stroke-width': 0.05 }));
      if (g.ids.length > 1) { el.appendChild(svg('circle', { cx: cx + 0.2, cy: cy - 0.2, r: 0.13, fill: '#fff' })); el.appendChild(svg('text', { x: cx + 0.2, y: cy - 0.19, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.17, 'font-weight': 900, fill: '#222' }, String(g.ids.length))); }
      el.addEventListener('click', () => onTokenTap(g.seat, g.ids[0]));
      tokG.appendChild(el);
    }
    // 목적지 표시
    for (const m of moves) {
      const tok = state.tokens[state.turn][m.token];
      const dest = destOf(tok, state.pending[m.result]);
      if (dest == null || dest === FINISH || dest < 0) continue; // 완주·출발점 복귀는 표시할 칸이 없다
      hlG.appendChild(svg('circle', { cx: X(dest), cy: Y(dest), r: 0.3, fill: 'none', stroke: COLORS[state.turn], 'stroke-width': 0.07, 'stroke-dasharray': '0.12 0.08' }));
    }
  }

  function onTokenTap(seat, tokenId) {
    if (!ctx.canAct() || animating) return;
    const state = ctx.match.state;
    if (seat !== state.turn) return;
    const mv = ctx.legalMoves().find((m) => m.token === tokenId && m.result === selResult) || ctx.legalMoves().find((m) => m.token === tokenId);
    if (mv) ctx.submit(mv); else ctx.sound.play('error');
  }
  function onNodeTap(node) {
    if (!ctx.canAct() || animating) return;
    const state = ctx.match.state;
    // 목적지 노드를 눌러도 이동
    for (const m of ctx.legalMoves()) {
      if (m.token == null || m.result !== selResult) continue;
      if (destOf(state.tokens[state.turn][m.token], state.pending[m.result]) === node) { ctx.submit(m); return; }
    }
    const g = state.tokens[state.turn].findIndex((t) => t.pos === node);
    if (g >= 0) onTokenTap(state.turn, g);
  }

  function renderCtl(state) {
    ctl.innerHTML = '';
    const moves = movesFor(state);
    if (!ctx.canAct()) {
      if (state.pending.length) state.pending.forEach((r) => ctl.appendChild(h('span', { class: 'yut-chip', text: `${NAMES[r]} ${r > 0 ? r + '칸' : '뒤로'}` })));
      return;
    }
    if (moves.some((m) => m.throw)) { ctl.appendChild(h('button', { class: 'btn btn-primary btn-lg', text: '🎲 윷 던지기', onclick: () => { if (!animating) ctx.submit({ throw: true }); } })); return; }
    if (moves.some((m) => m.skip)) { ctl.appendChild(h('button', { class: 'btn', text: '움직일 말이 없어요 · 넘기기', onclick: () => ctx.submit({ skip: true }) })); return; }
    if (selResult >= state.pending.length) selResult = 0;
    state.pending.forEach((r, i) => ctl.appendChild(h('button', { class: 'yut-chip' + (i === selResult ? ' sel' : ''), text: `${NAMES[r]} ${r > 0 ? r + '칸' : '뒤로'}`, onclick: () => { selResult = i; ctx.sound.play('click'); renderTokens(state); renderCtl(state); } })));
    const newTok = moves.find((m) => m.token != null && m.result === selResult && state.tokens[state.turn][m.token].pos === -1);
    if (newTok) ctl.appendChild(h('button', { class: 'btn btn-sm btn-good', text: '🐎 새 말 꺼내기', onclick: () => ctx.submit(newTok) }));
    const disc = moves.find((m) => m.discard === selResult);
    if (disc) ctl.appendChild(h('button', { class: 'btn btn-sm', text: '이 결과 버리기', onclick: () => ctx.submit(disc) }));
  }

  function seatInfo(state) {
    for (let seat = 0; seat < state.n; seat++) {
      const arr = state.tokens[seat];
      const fin = arr.filter((t) => t.pos === FINISH).length, wait = arr.filter((t) => t.pos === -1).length;
      ctx.setSeatInfo(seat, { score: `${fin}/${state.per}`, sub: `${ctx.seatNames[seat]} · 대기 ${wait}` });
    }
  }

  return {
    update(state, events, prev, animate) {
      const throwEv = events.find((e) => e.type === 'throw');
      const moveEv = events.find((e) => e.type === 'move');
      if (animate && throwEv) {
        animating = true; ctx.lock(780);
        renderSticks(throwEv.sticks, true);
        ctx.sound.play('sticks'); ctx.haptics.rattle();
        setTimeout(() => {
          const name = NAMES[throwEv.r];
          const big = throwEv.r === 5 ? '모!!' : throwEv.r === 4 ? '윷!' : throwEv.r === -1 ? '빽도…' : name + '!';
          ctx.fx.stamp(big, { glow: throwEv.again ? 'rgba(255,194,71,.95)' : 'rgba(88,166,255,.8)', small: !throwEv.again });
          if (throwEv.again) { ctx.sound.play('bonus'); ctx.haptics.success(); ctx.fx.shake(); } else ctx.sound.play('pop');
          animating = false;
          renderTokens(state); renderCtl(state);
          (ctx.relayout ? ctx.relayout() : window.dispatchEvent(new Event('resize')));
        }, 800);
      } else if (state.lastThrow) renderSticks(state.lastThrow.sticks, false);
      else renderSticks(null, false);

      if (animate && moveEv) {
        const cap = events.find((e) => e.type === 'capture');
        const fin = events.find((e) => e.type === 'finish');
        const sc = events.find((e) => e.type === 'shortcut');
        const st = events.find((e) => e.type === 'stack');
        const path = (moveEv.path || []).filter((n) => n !== FINISH && n >= 0); // 완주/출발점 복귀(-1)는 그리지 않는다
        const stepMs = 150;
        const total = Math.max(1, path.length) * stepMs;
        animating = true; ctx.lock(total + 40);
        // 도착 칸의 말은 잠시 숨기고, 유령 말이 경로를 따라 움직인다
        renderTokens(state); renderCtl(state);
        const hideTo = moveEv.to !== FINISH && moveEv.to >= 0 ? [...tokG.children].find((g) => { const c = g.querySelector('circle:nth-child(2)'); return c && Math.abs(+c.getAttribute('cx') - X(moveEv.to)) < 0.01 && Math.abs(+c.getAttribute('cy') - Y(moveEv.to)) < 0.01; }) : null;
        if (hideTo) hideTo.style.opacity = '0';
        const startNode = moveEv.from === -1 ? 0 : moveEv.from;
        const ghost = svg('g');
        ghost.appendChild(svg('circle', { cx: 0, cy: 0.03, r: 0.27, fill: 'rgba(0,0,0,.35)' }));
        ghost.appendChild(svg('circle', { cx: 0, cy: 0, r: 0.26, fill: COLORS[moveEv.seat], stroke: '#fff', 'stroke-width': 0.05 }));
        if (moveEv.tokens.length > 1) { ghost.appendChild(svg('circle', { cx: 0.2, cy: -0.2, r: 0.13, fill: '#fff' })); ghost.appendChild(svg('text', { x: 0.2, y: -0.19, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.17, 'font-weight': 900, fill: '#222' }, String(moveEv.tokens.length))); }
        ghost.style.transition = `transform ${stepMs}ms ease-in-out`;
        ghost.style.transform = `translate(${X(startNode)}px, ${Y(startNode)}px)`;
        tokG.appendChild(ghost);
        path.forEach((node, k) => setTimeout(() => { ghost.style.transform = `translate(${X(node)}px, ${Y(node)}px)`; ctx.sound.play('tap'); }, 30 + k * stepMs));
        setTimeout(() => {
          ghost.remove();
          animating = false;
          if (hideTo) hideTo.style.opacity = '';
          if (moveEv.to === FINISH) renderTokens(state);
          ctx.haptics.tap();
          if (cap) { const p = pxOf(cap.at); ctx.fx.burst(p.x, p.y, { count: 24, palette: 'fire', speed: 1.3 }); ctx.fx.stamp('잡았다!', { glow: 'rgba(255,92,122,.95)' }); ctx.sound.play('capture'); ctx.haptics.heavy(); ctx.fx.shake(true); }
          else if (fin) { ctx.fx.stamp(fin.count > 1 ? `${fin.count}개 완주!` : '완주!', { glow: 'rgba(61,220,151,.95)' }); ctx.sound.play('score'); ctx.haptics.success(); }
          else if (sc) { const p = pxOf(sc.at); ctx.fx.sparkle(p.x, p.y, p.size * 0.5, 'gold'); ctx.fx.stamp('지름길!', { small: true, glow: 'rgba(255,194,71,.9)' }); ctx.sound.play('coin'); }
          else if (st) { ctx.fx.stamp('업기!', { small: true, glow: 'rgba(79,163,255,.9)' }); ctx.sound.play('pop'); }
          renderCtl(state);
          (ctx.relayout ? ctx.relayout() : window.dispatchEvent(new Event('resize')));
        }, total + 60);
      }
      if (!(animate && throwEv) && !(animate && moveEv)) { renderTokens(state); renderCtl(state); }
      seatInfo(state);
      if (ctx.canAct()) ctx.setStatus(state.throws > 0 ? '윷을 던지세요' : state.pending.length ? '결과를 고르고 움직일 말을 누르세요' : '');
      else ctx.setStatus(`<b>${ctx.seats[state.turn].name}</b>님 차례`);
    },
    destroy() { wrap.remove(); style.remove(); },
  };
}
