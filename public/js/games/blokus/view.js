import { GridBoard } from '../../core/board.js';
import { h, svg } from '../../core/util.js';
import { ORIENTS, anchors, validPlacement, scores } from './rules.js';

const COLORS = ['#4fa3ff', '#ff6b6b', '#3ddc97', '#ffc247'];

export function create(root, ctx) {
  let board = null, size = 0;
  let cellLayer = null, ghostLayer = null, anchorLayer = null;
  let sel = null;     // 선택한 조각 id
  let orient = 0;
  let preview = null; // {piece, o, r, c, ok}
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .bk-tray { display: flex; gap: 6px; overflow-x: auto; padding: 8px 2px; scrollbar-width: none; }
    .bk-tray::-webkit-scrollbar { display: none; }
    .bk-tray button { flex: none; width: 52px; height: 52px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); padding: 5px; }
    .bk-tray button.sel { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); background: var(--surface-3); }
    .bk-tray svg { width: 100%; height: 100%; }
    .bk-ctl { display: flex; gap: 6px; justify-content: center; align-items: center; }
  ` });
  root.appendChild(style);
  // 작은 화면에서는 20×20 칸이 너무 작아 확대 모드를 제공한다 (보드가 2배가 되고 스크롤로 이동)
  let zoomed = false;
  const boardWrap = h('div');
  const scroller = h('div', { style: { width: '100%', overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '12px' } }, boardWrap);
  const tray = h('div', { class: 'bk-tray' });
  const ctl = h('div', { class: 'bk-ctl' });
  wrap.append(scroller, ctl, tray);
  function setZoom(on) {
    zoomed = on;
    boardWrap.style.width = on ? '200%' : '';
    scroller.style.maxHeight = on ? scroller.getBoundingClientRect().width + 'px' : '';
    if (on) { const b = scroller.getBoundingClientRect(); scroller.scrollTo({ left: b.width / 2, top: b.width / 2 }); }
    window.dispatchEvent(new Event('resize')); // 플레이 화면이 다시 맞추도록
  }

  function build(n) {
    boardWrap.innerHTML = '';
    size = n;
    board = new GridBoard(boardWrap, { rows: n, cols: n, style: 'plain', theme: 'paper', className: 'blokus', onCell(r, c) { onTap(r, c); } });
    board.el.style.setProperty('--light', '#efe9dc');
    board.el.style.setProperty('--line', 'rgba(0,0,0,.12)');
    board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
    const mk = () => { const s = svg('svg', { viewBox: `0 0 ${n} ${n}`, style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none' }); return s; };
    cellLayer = mk(); anchorLayer = mk(); ghostLayer = mk();
    cellLayer.style.zIndex = '1'; anchorLayer.style.zIndex = '2'; ghostLayer.style.zIndex = '3';
    board.el.append(cellLayer, anchorLayer, ghostLayer);
  }

  function pieceThumb(id, o, color) {
    const cells = ORIENTS[id][o % ORIENTS[id].length];
    const s = svg('svg', { viewBox: '-0.5 -0.5 6 6' });
    const mr = Math.max(...cells.map((c) => c[0])) + 1, mc = Math.max(...cells.map((c) => c[1])) + 1;
    const ox = (5 - mc) / 2, oy = (5 - mr) / 2;
    for (const [r, c] of cells) s.appendChild(svg('rect', { x: c + ox, y: r + oy, width: 0.92, height: 0.92, rx: 0.15, fill: color }));
    return s;
  }

  function drawCells(state, events, animate) {
    cellLayer.innerHTML = '';
    const last = state.last;
    state.board.forEach((v, i) => {
      if (v < 0) return;
      const r = (i / size) | 0, c = i % size;
      const isNew = animate && last && last.cells.some(([rr, cc]) => rr === r && cc === c);
      const rect = svg('rect', { x: c + 0.06, y: r + 0.06, width: 0.88, height: 0.88, rx: 0.14, fill: COLORS[v], class: isNew ? 'pop-in' : '', style: `transform-origin:${c + 0.5}px ${r + 0.5}px` });
      cellLayer.appendChild(rect);
    });
    // 시작점
    state.starts.forEach(([r, c], seat) => { if (state.board[r * size + c] === -1) cellLayer.appendChild(svg('circle', { cx: c + 0.5, cy: r + 0.5, r: 0.22, fill: COLORS[seat], opacity: 0.7 })); });
  }
  function drawAnchors(state) {
    anchorLayer.innerHTML = '';
    if (!ctx.canAct()) return;
    for (const [r, c] of anchors(state, state.turn)) anchorLayer.appendChild(svg('circle', { cx: c + 0.5, cy: r + 0.5, r: 0.14, fill: COLORS[state.turn], opacity: 0.55 }));
  }
  function drawGhost(state) {
    ghostLayer.innerHTML = '';
    if (!preview) return;
    for (const [r, c] of ORIENTS[preview.piece][preview.o]) ghostLayer.appendChild(svg('rect', { x: preview.c + c + 0.06, y: preview.r + r + 0.06, width: 0.88, height: 0.88, rx: 0.14, fill: preview.ok ? COLORS[state.turn] : '#ff3b3b', opacity: 0.55, stroke: preview.ok ? '#fff' : '#ff3b3b', 'stroke-width': 0.06 }));
  }

  function trayFor(state) {
    const seat = ctx.online ? ctx.mySeat : state.turn;
    return seat >= 0 ? seat : state.turn;
  }
  function renderTray(state) {
    tray.innerHTML = '';
    const seat = trayFor(state);
    const hand = state.hands[seat] || [];
    if (sel != null && !hand.includes(sel)) sel = null;
    for (const id of hand) {
      const b = h('button', { class: id === sel ? 'sel' : '', onclick: () => { sel = id; orient = 0; preview = null; ctx.sound.play('tap'); renderTray(state); renderCtl(state); drawGhost(state); } });
      b.appendChild(pieceThumb(id, id === sel ? orient : 0, COLORS[seat]));
      tray.appendChild(b);
    }
  }
  function renderCtl(state) {
    ctl.innerHTML = '';
    if (!ctx.canAct()) { ctl.appendChild(h('span', { class: 'hint', text: `남은 조각 ${state.hands.map((hd, i) => `${ctx.seatNames[i]} ${hd.length}`).join(' · ')}` })); return; }
    ctl.append(
      h('button', { class: 'btn btn-sm' + (zoomed ? ' btn-primary' : ''), text: zoomed ? '🔍 축소' : '🔍 확대', onclick: () => { setZoom(!zoomed); ctx.sound.play('click'); renderCtl(state); } }),
      h('button', { class: 'btn btn-sm', text: '↻ 회전', disabled: sel == null, onclick: () => { if (sel == null) return; orient = (orient + 1) % ORIENTS[sel].length; ctx.sound.play('click'); reapplyPreview(state); renderTray(state); } }),
      h('button', { class: 'btn btn-sm', text: '⇄ 뒤집기', disabled: sel == null, onclick: () => { if (sel == null) return; orient = flipOrient(sel, orient); ctx.sound.play('click'); reapplyPreview(state); renderTray(state); } }),
      h('button', { class: 'btn btn-sm btn-good', text: '✓ 놓기', disabled: !(preview && preview.ok), onclick: () => { if (preview && preview.ok) submitPreview(); } }),
    );
  }
  // 뒤집힌 모양 찾기 (없으면 다음 회전)
  function flipOrient(id, o) {
    const cells = ORIENTS[id][o];
    const mc = Math.max(...cells.map((c) => c[1]));
    const flipped = cells.map(([r, c]) => [r, mc - c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const k = JSON.stringify(flipped);
    const idx = ORIENTS[id].findIndex((x) => JSON.stringify(x) === k);
    return idx >= 0 ? idx : (o + 1) % ORIENTS[id].length;
  }
  function reapplyPreview(state) {
    if (preview) { const p = snap(state, preview.tapR, preview.tapC); preview = p; drawGhost(state); renderCtl(state); }
  }
  // 누른 칸이 조각의 어느 칸이 되든 놓을 수 있는 위치를 찾는다
  function snap(state, r, c) {
    const cells = ORIENTS[sel][orient];
    let first = null;
    for (const [kr, kc] of cells) {
      const m = { piece: sel, o: orient, r: r - kr, c: c - kc };
      if (validPlacement(state, state.turn, m)) return { ...m, ok: true, tapR: r, tapC: c };
      if (!first) first = { ...m, ok: false, tapR: r, tapC: c };
    }
    return first;
  }
  function onTap(r, c) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    if (sel == null) { ctx.setStatus('먼저 아래에서 조각을 고르세요'); ctx.sound.play('error'); return; }
    if (preview && preview.ok && preview.tapR === r && preview.tapC === c) { submitPreview(); return; }
    preview = snap(state, r, c);
    ctx.sound.play('tap');
    drawGhost(state); renderCtl(state);
    ctx.setStatus(preview.ok ? '한 번 더 누르거나 <b>놓기</b>를 누르세요' : '<b style="color:var(--bad)">여기엔 놓을 수 없어요</b> (꼭짓점만 닿아야 해요)');
  }
  function submitPreview() {
    const m = { piece: preview.piece, o: preview.o, r: preview.r, c: preview.c };
    preview = null; sel = null;
    ctx.submit(m);
  }

  return {
    update(state, events, prev, animate) {
      if (state.size !== size) { build(state.size); if (!zoomed && board.el.clientWidth / state.size < 20) setZoom(true); } // 칸이 20px보다 작으면 처음부터 확대
      preview = null;
      drawCells(state, events, animate);
      drawAnchors(state); drawGhost(state);
      renderTray(state); renderCtl(state);
      if (animate) for (const ev of events) {
        if (ev.type === 'place') {
          ctx.sound.play('place'); ctx.haptics.tap();
          const [r, c] = ev.cells[0]; const p = board.centerOf(r, c);
          ctx.fx.burst(p.x, p.y, { count: 8 + ev.cells.length * 2, palette: ev.seat === 0 ? 'blue' : ev.seat === 1 ? 'red' : ev.seat === 2 ? 'green' : 'gold', speed: 0.8, size: 3 });
        } else if (ev.type === 'allPlaced') { ctx.fx.stamp('올 클리어! +15', { glow: 'rgba(255,194,71,.9)' }); ctx.sound.play('bonus'); }
        else if (ev.type === 'skip') { ctx.fx.stamp(`${ctx.seats[ev.from].name} 패스`, { small: true, glow: 'rgba(88,166,255,.9)' }); }
      }
      const sc = scores(state);
      for (let i = 0; i < state.n; i++) ctx.setSeatInfo(i, { score: sc[i], sub: `${ctx.seatNames[i]} · 남은 조각 ${state.hands[i].length}` });
      if (ctx.canAct()) ctx.setStatus(sel == null ? '아래에서 조각을 고르세요' : '판을 눌러 놓을 자리를 정하세요');
    },
    destroy() { wrap.remove(); style.remove(); },
  };
}
