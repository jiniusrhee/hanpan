import { GridBoard, discSvg } from '../../core/board.js';

const COLS = 7, ROWS = 6;
const RED = discSvg('#ff4d4d', { border: 'rgba(0,0,0,.4)' });
const YEL = discSvg('#ffd166', { border: 'rgba(0,0,0,.35)' });

export function create(root, ctx) {
  // 배경: 파란 판 + 구멍
  let holes = '';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) holes += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.4" fill="var(--bg)"/>`;
  const extraSvg = `<rect x="0" y="0" width="${COLS}" height="${ROWS}" fill="#2f6fed"/>${holes}`;
  const board = new GridBoard(root, {
    rows: ROWS, cols: COLS, style: 'none', theme: 'blue', className: 'connect4', extraSvg,
    onCell(r, c) {
      if (!ctx.canAct()) return;
      const mv = ctx.legalMoves().find((m) => m.c === c);
      if (!mv) { ctx.sound.play('error'); return; }
      ctx.submit(mv);
    },
  });
  board.piecesEl.style.zIndex = '0';
  board.bg.style.zIndex = '1';
  board.bg.style.pointerEvents = 'none';
  board.cellsEl.style.zIndex = '2';
  // 구멍 밖은 판이 가리도록: 배경(svg)에 구멍을 투명하게 뚫는 대신, 말이 판 뒤에서 보이게 마스크를 쓴다
  board.bg.querySelector('svg').style.mixBlendMode = 'normal';
  board.bg.innerHTML = '';
  const maskSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  maskSvg.setAttribute('viewBox', `0 0 ${COLS} ${ROWS}`);
  maskSvg.setAttribute('preserveAspectRatio', 'none');
  let holesMask = '';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) holesMask += `<circle cx="${c + 0.5}" cy="${r + 0.5}" r="0.4" fill="#000"/>`;
  maskSvg.innerHTML = `<defs><mask id="c4mask"><rect width="${COLS}" height="${ROWS}" fill="#fff"/>${holesMask}</mask></defs><rect width="${COLS}" height="${ROWS}" fill="#2f6fed" mask="url(#c4mask)"/>`;
  board.bg.appendChild(maskSvg);
  board.el.style.background = 'var(--bg-2)';
  board.el.style.borderRadius = '12px';
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';

  return {
    update(state, events, prev, animate) {
      board.clearHighlights();
      const dropEv = events.find((e) => e.type === 'drop');
      const winEv = events.find((e) => e.type === 'win');
      const list = [];
      state.board.forEach((v, i) => { if (v >= 0) list.push({ id: 'p' + i, r: (i / COLS) | 0, c: i % COLS, html: v === 0 ? RED : YEL }); });
      if (animate && dropEv) {
        const id = 'p' + (dropEv.r * COLS + dropEv.c);
        // 떨어지는 애니메이션: 위에서 생성 후 목표로 이동
        const others = list.filter((p) => p.id !== id);
        board.sync(others, { animate: false });
        const el = board.addPiece(id, -1, dropEv.c, dropEv.seat === 0 ? RED : YEL, { spawn: false });
        el.classList.add('drop');
        requestAnimationFrame(() => requestAnimationFrame(() => board.movePiece(id, dropEv.r, dropEv.c)));
        ctx.lock(520);
        ctx.sound.play('swoosh');
        setTimeout(() => {
          el.classList.remove('drop');
          ctx.sound.play('capture'); ctx.haptics.hit();
          const { x, y } = board.centerOf(dropEv.r, dropEv.c);
          ctx.fx.burst(x, y, { count: 10, palette: dropEv.seat === 0 ? 'red' : 'gold', speed: 0.7, size: 3, life: 400, angle: -Math.PI / 2, spread: Math.PI });
          ctx.fx.shake();
        }, 500);
      } else board.sync(list, { animate: false });
      if (winEv) {
        setTimeout(() => {
          board.highlight(winEv.line.map((i) => ({ r: (i / COLS) | 0, c: i % COLS })), 'hl-last');
          winEv.line.forEach((i, k) => { const { x, y } = board.centerOf((i / COLS) | 0, i % COLS); setTimeout(() => ctx.fx.burst(x, y, { count: 16, palette: winEv.seat === 0 ? 'red' : 'gold' }), k * 100); });
          ctx.fx.stamp('4목!', { glow: winEv.seat === 0 ? 'rgba(255,77,77,.9)' : 'rgba(255,209,102,.9)' });
        }, animate ? 550 : 0);
      }
      if (ctx.canAct()) ctx.setStatus('열을 눌러 동전을 떨어뜨리세요');
    },
    destroy() { board.destroy(); },
  };
}
