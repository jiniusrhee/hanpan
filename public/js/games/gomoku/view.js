import { GridBoard, stoneSvg } from '../../core/board.js';

export function create(root, ctx) {
  let board = null;
  let size = 0;
  const BLACK = stoneSvg('black'), WHITE = stoneSvg('white');
  const BLACK_L = stoneSvg('black', { ring: true }), WHITE_L = stoneSvg('white', { ring: true });

  function build(n) {
    if (board) board.destroy();
    size = n;
    const stars = n === 15 ? [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]] : [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
    board = new GridBoard(root, {
      rows: n, cols: n, style: 'lines', theme: 'wood', className: 'gomoku', stars,
      onCell(r, c) {
        if (!ctx.canAct()) return;
        const i = r * size + c;
        if (ctx.match.state.board[i] !== -1) { ctx.sound.play('error'); return; }
        ctx.submit({ i });
      },
    });
    board.el.style.setProperty('--light', '#e9c98f');
    board.el.style.setProperty('--line', '#5a3d22');
  }

  return {
    update(state, events, prev, animate) {
      if (state.size !== size) build(state.size);
      board.clearHighlights();
      const list = [];
      state.board.forEach((v, i) => {
        if (v < 0) return;
        const isLast = i === state.last;
        list.push({ id: 's' + i, r: (i / size) | 0, c: i % size, html: v === 0 ? (isLast ? BLACK_L : BLACK) : (isLast ? WHITE_L : WHITE) });
      });
      board.sync(list, { animate });
      for (const ev of events) {
        if (ev.type === 'place' && animate) {
          ctx.sound.play('place'); ctx.haptics.tap();
          const { x, y } = board.centerOf((ev.i / size) | 0, ev.i % size);
          ctx.fx.ring(x, y, { color: ev.seat === 0 ? '#222' : '#fff', size: 22, width: 3 });
        } else if (ev.type === 'win') {
          board.highlight(ev.line.map((i) => ({ r: (i / size) | 0, c: i % size })), 'hl-last');
          ev.line.forEach((i, k) => { const { x, y } = board.centerOf((i / size) | 0, i % size); setTimeout(() => ctx.fx.burst(x, y, { count: 14, palette: ev.seat === 0 ? 'blue' : 'gold', speed: 0.8 }), k * 90); });
          ctx.fx.shake(true);
          ctx.fx.stamp('오목!', { glow: 'rgba(255,194,71,.9)' });
          ctx.sound.play('capture');
        }
      }
      const n0 = state.board.filter((v) => v === 0).length, n1 = state.board.filter((v) => v === 1).length;
      ctx.setSeatInfo(0, { score: n0 }); ctx.setSeatInfo(1, { score: n1 });
    },
    destroy() { if (board) board.destroy(); },
  };
}
