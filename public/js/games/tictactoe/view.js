import { GridBoard } from '../../core/board.js';

const X = `<svg viewBox="0 0 100 100"><path d="M24 24 L76 76 M76 24 L24 76" stroke="#4fa3ff" stroke-width="14" stroke-linecap="round" fill="none"/></svg>`;
const O = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="27" stroke="#ff6b6b" stroke-width="13" fill="none"/></svg>`;

export function create(root, ctx) {
  const board = new GridBoard(root, {
    rows: 3, cols: 3, style: 'plain', theme: 'paper', className: 'ttt',
    onCell(r, c) {
      if (!ctx.canAct()) return;
      const i = r * 3 + c;
      if (ctx.match.state.board[i] >= 0) return;
      ctx.submit({ i });
    },
  });
  board.el.style.setProperty('--line', 'rgba(0,0,0,.35)');

  return {
    update(state, events) {
      board.clearHighlights();
      const list = [];
      state.board.forEach((v, i) => { if (v >= 0) list.push({ id: 'p' + i, r: (i / 3) | 0, c: i % 3, html: v === 0 ? X : O }); });
      board.sync(list);
      for (const ev of events) {
        if (ev.type === 'place') {
          ctx.sound.play('place'); ctx.haptics.tap();
          const { x, y } = board.centerOf((ev.i / 3) | 0, ev.i % 3);
          ctx.fx.burst(x, y, { count: 10, palette: ev.seat === 0 ? 'blue' : 'red', speed: 0.8, size: 3, life: 450 });
        } else if (ev.type === 'win') {
          board.highlight(ev.line.map((i) => ({ r: (i / 3) | 0, c: i % 3 })), 'hl-last');
          ev.line.forEach((i, k) => { const { x, y } = board.centerOf((i / 3) | 0, i % 3); setTimeout(() => ctx.fx.burst(x, y, { count: 18, palette: ev.seat === 0 ? 'blue' : 'red' }), k * 120); });
          ctx.fx.shake();
          ctx.sound.play('capture');
        }
      }
      if (state.last != null) board.highlight([{ r: (state.last / 3) | 0, c: state.last % 3 }], 'hl-last');
    },
    destroy() { board.destroy(); },
  };
}
