import { GridBoard, stoneSvg } from '../../core/board.js';
import { scoreOf } from './rules.js';
import { h } from '../../core/util.js';

export function create(root, ctx) {
  let board = null, size = 0;
  const BLACK = stoneSvg('black'), WHITE = stoneSvg('white');
  const BLACK_L = stoneSvg('black', { ring: true }), WHITE_L = stoneSvg('white', { ring: true });
  let terrLayer = null;

  function build(n) {
    if (board) board.destroy();
    size = n;
    const stars = n === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] : n === 13 ? [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6], [3, 6], [6, 3], [9, 6], [6, 9]] : [];
    board = new GridBoard(root, {
      rows: n, cols: n, style: 'lines', theme: 'wood', className: 'go', stars,
      onCell(r, c) {
        if (!ctx.canAct()) return;
        const i = r * size + c;
        if (ctx.match.state.board[i] !== -1) return;
        const mv = ctx.legalMoves().find((m) => m.i === i);
        if (!mv) { ctx.sound.play('error'); ctx.setStatus(i === ctx.match.state.ko ? '패! 지금은 되따낼 수 없어요' : '자살수라서 둘 수 없어요'); return; }
        ctx.submit(mv);
      },
    });
    board.el.style.setProperty('--light', '#e9c98f');
    board.el.style.setProperty('--line', '#5a3d22');
    board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
    terrLayer = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 } });
    board.el.appendChild(terrLayer);
  }

  function showTerritory(state) {
    terrLayer.innerHTML = '';
    const { owner } = scoreOf(state);
    owner.forEach((o, i) => {
      if (o < 0 || state.board[i] !== -1) return;
      const r = (i / size) | 0, c = i % size;
      terrLayer.appendChild(h('div', { style: { position: 'absolute', left: `calc(${c} * 100% / ${size} + 100% / ${size} * 0.32)`, top: `calc(${r} * 100% / ${size} + 100% / ${size} * 0.32)`, width: `calc(100% / ${size} * 0.36)`, height: `calc(100% / ${size} * 0.36)`, background: o === 0 ? '#111' : '#fff', border: '1px solid rgba(0,0,0,.4)', borderRadius: '2px', opacity: 0.85 } }));
    });
  }

  return {
    update(state, events, prev, animate) {
      if (state.size !== size) build(state.size);
      board.clearHighlights();
      terrLayer.innerHTML = '';
      const capEv = events.find((e) => e.type === 'capture');
      const list = [];
      state.board.forEach((v, i) => {
        if (v < 0) return;
        const last = i === state.last;
        list.push({ id: 'g' + i, r: (i / size) | 0, c: i % size, html: v === 0 ? (last ? BLACK_L : BLACK) : (last ? WHITE_L : WHITE) });
      });
      if (animate && capEv) {
        // 따낸 돌은 잠깐 남겨뒀다가 터뜨린다
        const keep = capEv.cells.map((i) => ({ id: 'g' + i, r: (i / size) | 0, c: i % size, html: capEv.seat === 0 ? WHITE : BLACK }));
        board.sync([...list, ...keep], { animate: true });
        ctx.lock(420);
        setTimeout(() => {
          for (const i of capEv.cells) { board.removePiece('g' + i, { animate: true }); const p = board.centerOf((i / size) | 0, i % size); ctx.fx.burst(p.x, p.y, { count: 10, palette: capEv.seat === 0 ? 'white' : 'smoke', speed: 0.9, size: p.size * 0.08 }); }
          ctx.sound.play('capture'); ctx.haptics.hit();
          if (capEv.cells.length >= 3) { ctx.fx.shake(); ctx.fx.stamp(`${capEv.cells.length}점 따냄!`, { small: true }); }
        }, 200);
      } else board.sync(list, { animate });
      for (const ev of events) {
        if (ev.type === 'place' && animate) { ctx.sound.play('place'); ctx.haptics.tap(); }
        else if (ev.type === 'pass' && animate) { ctx.fx.stamp('패스', { small: true, glow: 'rgba(88,166,255,.9)' }); ctx.sound.play('alert'); }
      }
      if (state.ko >= 0) board.highlight([{ r: (state.ko / size) | 0, c: state.ko % size }], 'hl-hint');
      ctx.setSeatInfo(0, { score: state.caps[0], sub: `흑 · 따낸 돌 ${state.caps[0]}` });
      ctx.setSeatInfo(1, { score: state.caps[1], sub: `백 · 따낸 돌 ${state.caps[1]} · 덤 ${state.komi}` });
      if (ctx.isOver()) { showTerritory(state); const s = scoreOf(state); ctx.setStatus(`흑 ${s.black} : 백 ${s.white}`); }
      else if (ctx.canAct()) ctx.setStatus(state.passes === 1 ? '상대가 패스했어요. 패스하면 계가해요' : '교차점을 눌러 돌을 놓으세요');
    },
    action(id) {
      if (id === 'pass' && ctx.canAct()) ctx.submit({ pass: true });
    },
    destroy() { if (board) board.destroy(); },
  };
}
