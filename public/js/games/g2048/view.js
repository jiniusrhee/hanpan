import { GridBoard } from '../../core/board.js';
import { h } from '../../core/util.js';

const COLORS = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'] };
function tileHtml(v) {
  const [bg, fg] = COLORS[v] || ['#3c3a32', '#fff'];
  const fs = v >= 1024 ? 0.6 : v >= 128 ? 0.76 : 1;
  return `<div style="width:88%;height:88%;border-radius:10px;background:${bg};color:${fg};display:grid;place-items:center;font-weight:900;font-size:${fs}em;line-height:1;box-shadow:0 3px 6px rgba(0,0,0,.25);overflow:hidden">${v}</div>`;
}

export function create(root, ctx) {
  let board = null, size = 0;
  let ids = [];
  let nextId = 1;
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const boardWrap = h('div');
  const arrows = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gap: '6px', justifyContent: 'center', marginTop: '12px' } });
  const mk = (dir, label, col, row) => h('button', { class: 'btn btn-icon', text: label, style: { gridColumn: col, gridRow: row }, onclick: () => go(dir) });
  arrows.append(mk('up', '↑', 2, 1), mk('left', '←', 1, 2), mk('down', '↓', 2, 2), mk('right', '→', 3, 2));
  wrap.append(boardWrap, arrows);

  function go(dir) {
    if (!ctx.canAct()) return;
    const mv = ctx.legalMoves().find((m) => m.dir === dir);
    if (!mv) { ctx.sound.play('error'); ctx.fx.shake(); return; }
    ctx.submit(mv);
  }

  // 스와이프 + 키보드
  let sx = 0, sy = 0, tracking = false;
  const onDown = (e) => { tracking = true; sx = e.clientX; sy = e.clientY; };
  const onUp = (e) => {
    if (!tracking) return; tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };
  const onKey = (e) => { const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }; if (map[e.key]) { e.preventDefault(); go(map[e.key]); } };
  document.addEventListener('keydown', onKey);

  function build(n) {
    boardWrap.innerHTML = '';
    size = n;
    board = new GridBoard(boardWrap, { rows: n, cols: n, style: 'none', theme: 'paper', className: 'g2048', extraSvg: `<rect width="${n}" height="${n}" rx="0.15" fill="#bbada0"/>${Array.from({ length: n * n }, (_, i) => `<rect x="${(i % n) + 0.06}" y="${((i / n) | 0) + 0.06}" width="0.88" height="0.88" rx="0.1" fill="rgba(238,228,218,.35)"/>`).join('')}` });
    board.el.style.touchAction = 'none';
    board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
    board.el.addEventListener('pointerdown', onDown);
    board.el.addEventListener('pointerup', onUp);
    board.el.addEventListener('pointercancel', () => { tracking = false; });
    ids = Array(n * n).fill(null);
    const ro = new ResizeObserver(() => { board.el.style.fontSize = (board.el.clientWidth / n) * 0.44 + 'px'; });
    ro.observe(board.el);
    board.el.style.fontSize = (board.el.clientWidth / n) * 0.44 + 'px';
  }

  return {
    update(state, events, prev, animate) {
      if (state.size !== size) build(state.size);
      const slideEv = events.find((e) => e.type === 'slide');
      const spawnEv = events.find((e) => e.type === 'spawn');
      const n = size;
      if (animate && slideEv && prev) {
        // 이동: 기존 id를 목적지로, 합쳐지는 타일은 도착 후 제거
        const newIds = Array(n * n).fill(null);
        const dying = [];
        for (const mv of slideEv.moved) {
          const id = ids[mv.from] || ('t' + nextId++);
          if (mv.merged && newIds[mv.to]) dying.push({ id, to: mv.to });
          else newIds[mv.to] = id;
          if (!board.getPiece(id)) board.addPiece(id, (mv.from / n) | 0, mv.from % n, tileHtml(mv.v), { spawn: false });
          if (mv.from !== mv.to) board.movePiece(id, (mv.to / n) | 0, mv.to % n, { land: false });
        }
        ids = newIds;
        ctx.sound.play('slide'); ctx.lock(160);
        setTimeout(() => {
          for (const d of dying) board.removePiece(d.id, { animate: false });
          // 값 갱신 + 합쳐진 타일 팝
          state.board.forEach((v, i) => { if (v && ids[i]) { const p = board.getPiece(ids[i]); if (p && p.html !== tileHtml(v)) { board.setPieceHtml(ids[i], tileHtml(v)); board.animatePiece(ids[i], 'spawn', 300); } } });
          const mergeEv = events.find((e) => e.type === 'merge');
          if (mergeEv) { ctx.sound.play('merge'); ctx.haptics.tap(); if (mergeEv.best >= 128) { const i = state.board.indexOf(mergeEv.best); const p = board.centerOf((i / n) | 0, i % n); ctx.fx.burst(p.x, p.y, { count: 14, palette: 'gold', speed: 0.9 }); } if (mergeEv.best >= 512) ctx.fx.stamp(String(mergeEv.best), { small: true, glow: 'rgba(237,194,46,.9)' }); }
          if (spawnEv) { const id = 't' + nextId++; ids[spawnEv.i] = id; board.addPiece(id, (spawnEv.i / n) | 0, spawnEv.i % n, tileHtml(spawnEv.v), { spawn: true }); }
          if (events.some((e) => e.type === 'win2048')) { ctx.fx.stamp('2048!', { glow: 'rgba(237,194,46,1)' }); ctx.sound.play('win'); ctx.haptics.success(); }
        }, 170);
      } else {
        ids = Array(n * n).fill(null);
        const list = [];
        state.board.forEach((v, i) => { if (v) { const id = 't' + nextId++; ids[i] = id; list.push({ id, r: (i / n) | 0, c: i % n, html: tileHtml(v) }); } });
        board.sync(list, { animate: false });
      }
      ctx.setSeatInfo(0, { score: state.score, sub: `최고 타일 ${state.max}` });
      ctx.setStatus(ctx.isOver() ? '' : '밀어서 타일을 합치세요 (스와이프 / 방향키)');
    },
    destroy() { document.removeEventListener('keydown', onKey); wrap.remove(); },
  };
}
