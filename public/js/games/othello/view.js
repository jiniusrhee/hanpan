import { GridBoard, stoneSvg } from '../../core/board.js';
import { count } from './rules.js';

export function create(root, ctx) {
  const board = new GridBoard(root, {
    rows: 8, cols: 8, style: 'plain', theme: 'green', className: 'othello',
    onCell(r, c) {
      if (!ctx.canAct()) return;
      const i = r * 8 + c;
      const mv = ctx.legalMoves().find((m) => m.i === i);
      if (!mv) { ctx.sound.play('error'); return; }
      ctx.submit(mv);
    },
  });
  board.el.style.setProperty('--light', '#2f8a4d');
  board.el.style.setProperty('--line', 'rgba(0,0,0,.45)');
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
  const BLACK = stoneSvg('black'), WHITE = stoneSvg('white');
  let lastState = null;

  function showHints(state) {
    board.clearHighlights('hl-move');
    if (!ctx.canAct() || ctx.isOver()) return;
    board.highlight(ctx.legalMoves().filter((m) => !m.pass).map((m) => ({ r: (m.i / 8) | 0, c: m.i % 8 })), 'hl-move');
  }

  function scores(state) {
    const [b, w] = count(state.board);
    ctx.setSeatInfo(0, { score: b });
    ctx.setSeatInfo(1, { score: w });
  }

  return {
    update(state, events, prev, animate) {
      board.clearHighlights();
      const placeEv = events.find((e) => e.type === 'place');
      const flipEv = events.find((e) => e.type === 'flip');
      const passEv = events.find((e) => e.type === 'pass');
      const list = [];
      // 뒤집힌 돌은 잠시 이전 색으로 두고 순차적으로 바꾼다
      const delayed = new Set(animate && flipEv ? flipEv.cells : []);
      state.board.forEach((v, i) => {
        if (v < 0) return;
        const color = delayed.has(i) ? 1 - v : v;
        list.push({ id: 's' + i, r: (i / 8) | 0, c: i % 8, html: color === 0 ? BLACK : WHITE, cls: 'c' + color });
      });
      board.sync(list, { animate });
      if (animate && placeEv) {
        ctx.sound.play('place'); ctx.haptics.tap();
        const { x, y } = board.centerOf((placeEv.i / 8) | 0, placeEv.i % 8);
        ctx.fx.ring(x, y, { color: placeEv.seat === 0 ? '#222' : '#fff', size: 30 });
      }
      if (animate && flipEv && flipEv.cells.length) {
        // 놓은 자리에서 가까운 순으로 뒤집기
        const or = (flipEv.origin / 8) | 0, oc = flipEv.origin % 8;
        const sorted = flipEv.cells.slice().sort((a, b) => Math.hypot(((a / 8) | 0) - or, (a % 8) - oc) - Math.hypot(((b / 8) | 0) - or, (b % 8) - oc));
        ctx.lock(80 * sorted.length + 300);
        sorted.forEach((i, k) => {
          setTimeout(() => {
            board.animatePiece('s' + i, 'flip3d', 450);
            setTimeout(() => board.setPieceHtml('s' + i, flipEv.seat === 0 ? BLACK : WHITE, 'c' + flipEv.seat), 200);
            ctx.sound.play('flip');
            if (k === sorted.length - 1) { ctx.haptics.hit(); if (sorted.length >= 6) { ctx.fx.shake(); ctx.fx.stamp(`${sorted.length}개 뒤집기!`, { small: true, glow: 'rgba(61,220,151,.9)' }); } }
          }, 60 + k * 80);
        });
        setTimeout(() => scores(state), 60 + sorted.length * 80);
      } else scores(state);
      if (animate && passEv) { ctx.fx.stamp('패스', { small: true, glow: 'rgba(88,166,255,.9)' }); ctx.sound.play('alert'); }
      if (state.last != null) board.highlight([{ r: (state.last / 8) | 0, c: state.last % 8 }], 'hl-last');
      lastState = state;
      const delay = animate && flipEv ? 80 * flipEv.cells.length + 360 : 0;
      setTimeout(() => showHints(state), delay);
    },
    destroy() { board.destroy(); },
  };
}
