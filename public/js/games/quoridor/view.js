import { GridBoard, discSvg } from '../../core/board.js';
import { h } from '../../core/util.js';
import { distance } from './rules.js';

const COLORS = ['#4fa3ff', '#ff6b6b'];

export function create(root, ctx) {
  let mode = 'move';   // move | h | v
  let preview = null;  // {o, r, c}
  const flip = ctx.perspective === 1;
  const board = new GridBoard(root, {
    rows: 9, cols: 9, style: 'plain', theme: 'wood', flip, className: 'quoridor',
    onCell(r, c) { onTap(r, c); },
  });
  board.el.style.setProperty('--light', '#e9c98f');
  board.el.style.setProperty('--line', 'rgba(0,0,0,.18)');
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
  // 골 라인 표시
  const goals = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none' } },
    h('div', { style: { position: 'absolute', left: 0, right: 0, top: 0, height: '11.1%', background: `linear-gradient(${COLORS[0]}55, transparent)` } }),
    h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '11.1%', background: `linear-gradient(transparent, ${COLORS[1]}55)` } }));
  if (flip) { goals.firstChild.style.background = `linear-gradient(${COLORS[1]}55, transparent)`; goals.lastChild.style.background = `linear-gradient(transparent, ${COLORS[0]}55)`; }
  board.el.insertBefore(goals, board.cellsEl);
  const wallLayer = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 } });
  board.el.appendChild(wallLayer);

  // 모드 버튼
  const bar = h('div', { class: 'row', style: { justifyContent: 'center', gap: '6px', marginTop: '8px' } });
  const btns = {};
  for (const [id, label] of [['move', '🚶 이동'], ['h', '▬ 가로 벽'], ['v', '▮ 세로 벽']]) {
    btns[id] = h('button', { class: 'btn btn-sm' + (id === mode ? ' btn-primary' : ''), text: label, onclick: () => { setMode(id); ctx.sound.play('click'); } });
    bar.appendChild(btns[id]);
  }
  const confirmBtn = h('button', { class: 'btn btn-sm btn-good hidden', text: '✓ 여기에 놓기', onclick: () => { if (preview) submitWall(); } });
  bar.appendChild(confirmBtn);
  root.appendChild(bar);

  function setMode(m) {
    mode = m; preview = null;
    for (const [id, b] of Object.entries(btns)) b.classList.toggle('btn-primary', id === m);
    confirmBtn.classList.add('hidden');
    render(ctx.match.state);
  }

  function onTap(r, c) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    if (mode === 'move') {
      const mv = ctx.legalMoves().find((m) => m.type === 'move' && m.r === r && m.c === c);
      if (mv) ctx.submit(mv); else ctx.sound.play('error');
      return;
    }
    // 벽: 표시 좌표 기준으로 앵커 보정 (뒤집힌 판이면 앵커가 반대쪽)
    let wr = r, wc = c;
    if (flip) { wr = r - 1; wc = c - 1; }
    if (mode === 'h') { wr = Math.min(7, Math.max(0, wr)); wc = Math.min(7, Math.max(0, wc)); }
    else { wr = Math.min(7, Math.max(0, wr)); wc = Math.min(7, Math.max(0, wc)); }
    const legal = ctx.rules.isLegal(state, { type: 'wall', o: mode, r: wr, c: wc });
    if (preview && preview.r === wr && preview.c === wc && preview.o === mode) { if (legal) submitWall(); return; }
    preview = { o: mode, r: wr, c: wc, legal };
    ctx.sound.play('tap');
    render(state);
    confirmBtn.classList.toggle('hidden', !legal);
    if (!legal) ctx.setStatus('<b style="color:var(--bad)">여기엔 놓을 수 없어요</b> (겹치거나 길을 완전히 막아요)');
    else ctx.setStatus('한 번 더 누르면 벽을 놓아요');
  }
  function submitWall() {
    const m = { type: 'wall', o: preview.o, r: preview.r, c: preview.c };
    preview = null; confirmBtn.classList.add('hidden');
    ctx.submit(m);
  }

  function wallEl(o, r, c, color, ghost) {
    // 가로 벽: (r,c)와 (r,c+1) 아래. 세로 벽: (r,c)와 (r+1,c) 오른쪽
    const dr = flip ? 7 - r : r, dc = flip ? 7 - c : c;
    const cell = 100 / 9;
    const st = { position: 'absolute', background: color, borderRadius: '4px', boxShadow: ghost ? 'none' : '0 2px 6px rgba(0,0,0,.5)', opacity: ghost ? 0.55 : 1, transition: 'opacity .15s' };
    if (o === 'h') Object.assign(st, { left: `calc(${dc * cell}% + 3px)`, width: `calc(${2 * cell}% - 6px)`, top: `calc(${(dr + 1) * cell}% - 4px)`, height: '8px' });
    else Object.assign(st, { top: `calc(${dr * cell}% + 3px)`, height: `calc(${2 * cell}% - 6px)`, left: `calc(${(dc + 1) * cell}% - 4px)`, width: '8px' });
    return h('div', { style: st, class: ghost ? '' : 'pop-in' });
  }

  function render(state) {
    wallLayer.innerHTML = '';
    for (let i = 0; i < 64; i++) {
      if (state.hw[i]) wallLayer.appendChild(wallEl('h', (i / 8) | 0, i % 8, '#5a3d22', false));
      if (state.vw[i]) wallLayer.appendChild(wallEl('v', (i / 8) | 0, i % 8, '#5a3d22', false));
    }
    if (preview) wallLayer.appendChild(wallEl(preview.o, preview.r, preview.c, preview.legal ? COLORS[state.turn] : '#ff3b3b', true));
    board.clearHighlights();
    if (mode === 'move' && ctx.canAct()) board.highlight(ctx.legalMoves().filter((m) => m.type === 'move').map((m) => ({ r: m.r, c: m.c })), 'hl-move');
    if (state.last && state.last.type === 'move') board.highlight([{ r: state.last.r, c: state.last.c }], 'hl-last');
  }

  return {
    update(state, events, prev, animate) {
      preview = null; confirmBtn.classList.add('hidden');
      if (mode !== 'move' && state.walls[state.turn] === 0 && ctx.canAct()) setMode('move');
      board.sync([
        { id: 'p0', r: state.pawns[0][0], c: state.pawns[0][1], html: discSvg(COLORS[0], { label: '' }) },
        { id: 'p1', r: state.pawns[1][0], c: state.pawns[1][1], html: discSvg(COLORS[1], { label: '' }) },
      ], { animate });
      render(state);
      if (animate) for (const ev of events) {
        if (ev.type === 'move') { ctx.sound.play('move'); ctx.haptics.tap(); }
        else if (ev.type === 'wall') { ctx.sound.play('capture'); ctx.haptics.hit(); ctx.fx.shake(); }
        else if (ev.type === 'win') { ctx.fx.stamp('도착!', { glow: COLORS[ev.seat] + 'e6' }); ctx.sound.play('bonus'); }
      }
      const d0 = distance(state, 0), d1 = distance(state, 1);
      ctx.setSeatInfo(0, { score: `🧱${state.walls[0]}`, sub: `파랑 · 골까지 ${d0}칸` });
      ctx.setSeatInfo(1, { score: `🧱${state.walls[1]}`, sub: `빨강 · 골까지 ${d1}칸` });
      if (ctx.canAct()) ctx.setStatus(mode === 'move' ? '갈 칸을 누르거나 벽 모드를 고르세요' : '벽을 놓을 위치를 누르세요');
    },
    destroy() { board.destroy(); bar.remove(); },
  };
}
