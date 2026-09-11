import { GridBoard } from '../../core/board.js';
import { h } from '../../core/util.js';

const X = `<svg viewBox="0 0 100 100"><path d="M26 26 L74 74 M74 26 L26 74" stroke="#4fa3ff" stroke-width="13" stroke-linecap="round" fill="none"/></svg>`;
const O = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="26" stroke="#ff6b6b" stroke-width="12" fill="none"/></svg>`;
const BIG_X = `<svg viewBox="0 0 100 100"><path d="M22 22 L78 78 M78 22 L22 78" stroke="#4fa3ff" stroke-width="12" stroke-linecap="round" fill="none"/></svg>`;
const BIG_O = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" stroke="#ff6b6b" stroke-width="11" fill="none"/></svg>`;

const toRC = (i) => { const b = (i / 9) | 0, c = i % 9; return { r: ((b / 3) | 0) * 3 + ((c / 3) | 0), c: (b % 3) * 3 + (c % 3) }; };

export function create(root, ctx) {
  let lines = '';
  for (let k = 1; k < 9; k++) { const w = k % 3 === 0 ? 0.09 : 0.025; const col = k % 3 === 0 ? '#3a2a1a' : 'rgba(0,0,0,.25)'; lines += `<line x1="${k}" y1="0" x2="${k}" y2="9" stroke="${col}" stroke-width="${w}"/><line x1="0" y1="${k}" x2="9" y2="${k}" stroke="${col}" stroke-width="${w}"/>`; }
  const board = new GridBoard(root, {
    rows: 9, cols: 9, style: 'none', theme: 'paper', className: 'ultimate', extraSvg: `<rect width="9" height="9" fill="#f5e6c8"/>${lines}`,
    onCell(r, c) {
      if (!ctx.canAct()) return;
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0), cc = (r % 3) * 3 + (c % 3);
      const i = b * 9 + cc;
      const mv = ctx.legalMoves().find((m) => m.i === i);
      if (!mv) { ctx.sound.play('error'); ctx.setStatus('지금은 <b>강조된 판</b>에만 둘 수 있어요'); return; }
      ctx.submit(mv);
    },
  });
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
  const overlay = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 } });
  board.el.appendChild(overlay);
  const bigMarks = new Map();
  const activeLayer = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 } });
  board.el.insertBefore(activeLayer, board.cellsEl);

  function showActive(state) {
    activeLayer.innerHTML = '';
    if (ctx.isOver()) return;
    const boards = state.next >= 0 && state.won[state.next] === -1 ? [state.next] : [...Array(9).keys()].filter((b) => state.won[b] === -1);
    for (const b of boards) {
      const br = (b / 3) | 0, bc = b % 3;
      activeLayer.appendChild(h('div', { style: { position: 'absolute', left: `${bc * 100 / 3}%`, top: `${br * 100 / 3}%`, width: `${100 / 3}%`, height: `${100 / 3}%`, background: state.turn === 0 ? 'rgba(79,163,255,.22)' : 'rgba(255,107,107,.22)', boxShadow: 'inset 0 0 0 3px ' + (state.turn === 0 ? 'rgba(79,163,255,.7)' : 'rgba(255,107,107,.7)'), transition: 'all .25s' } }));
    }
  }

  return {
    update(state, events, prev, animate) {
      board.clearHighlights();
      const list = [];
      state.cells.forEach((v, i) => { if (v >= 0) { const { r, c } = toRC(i); list.push({ id: 'p' + i, r, c, html: v === 0 ? X : O }); } });
      board.sync(list, { animate });
      // 작은 판 승자 표시
      state.won.forEach((w, b) => {
        if (w === -1 || w === 2) { const el = bigMarks.get(b); if (el) { el.remove(); bigMarks.delete(b); } return; }
        if (bigMarks.has(b)) return;
        const br = (b / 3) | 0, bc = b % 3;
        const el = h('div', { class: animate ? 'pop-in' : '', style: { position: 'absolute', left: `${bc * 100 / 3}%`, top: `${br * 100 / 3}%`, width: `${100 / 3}%`, height: `${100 / 3}%`, background: w === 0 ? 'rgba(79,163,255,.35)' : 'rgba(255,107,107,.35)', backdropFilter: 'blur(1px)' }, html: w === 0 ? BIG_X : BIG_O });
        overlay.appendChild(el); bigMarks.set(b, el);
      });
      for (const ev of events) {
        if (ev.type === 'place' && animate) { ctx.sound.play('place'); ctx.haptics.tap(); const { r, c } = toRC(ev.i); const p = board.centerOf(r, c); ctx.fx.ring(p.x, p.y, { color: ev.seat === 0 ? '#4fa3ff' : '#ff6b6b', size: 20 }); }
        else if (ev.type === 'smallWin' && animate) { const br = (ev.board / 3) | 0, bc = ev.board % 3; const p = board.centerOf(br * 3 + 1, bc * 3 + 1); ctx.fx.burst(p.x, p.y, { count: 24, palette: ev.seat === 0 ? 'blue' : 'red', speed: 1.3 }); ctx.sound.play('score'); ctx.haptics.hit(); ctx.fx.shake(); }
        else if (ev.type === 'win') { ctx.fx.stamp('승리!', { glow: ev.seat === 0 ? 'rgba(79,163,255,.9)' : 'rgba(255,107,107,.9)' }); ctx.sound.play('capture'); ctx.fx.shake(true); }
      }
      if (state.last != null) { const { r, c } = toRC(state.last); board.highlight([{ r, c }], 'hl-last'); }
      showActive(state);
      const a = state.won.filter((v) => v === 0).length, b = state.won.filter((v) => v === 1).length;
      ctx.setSeatInfo(0, { score: a }); ctx.setSeatInfo(1, { score: b });
      if (ctx.canAct()) ctx.setStatus(state.next === -1 ? '아무 판에나 둘 수 있어요' : '강조된 판에 두세요');
    },
    reset() { overlay.innerHTML = ''; bigMarks.clear(); },
    destroy() { board.destroy(); },
  };
}
