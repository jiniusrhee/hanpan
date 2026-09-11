import { GridBoard } from '../../core/board.js';
import { colorOf, typeOf, KING } from './rules.js';

const CROWN = `<path d="M30 62l-6-22 14 10 12-18 12 18 14-10-6 22z" fill="#ffd166" stroke="rgba(0,0,0,.35)" stroke-width="2" stroke-linejoin="round"/>`;
function piece(p) {
  const color = colorOf(p) === 0 ? '#d63a3a' : '#2b2b30';
  const rim = colorOf(p) === 0 ? '#8f1f1f' : '#0b0b0d';
  return `<svg viewBox="0 0 100 100" style="filter: drop-shadow(0 3px 2px rgba(0,0,0,.45))">
    <circle cx="50" cy="54" r="40" fill="${rim}"/>
    <circle cx="50" cy="47" r="40" fill="${color}"/>
    <circle cx="50" cy="47" r="30" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/>
    <ellipse cx="40" cy="32" rx="16" ry="8" fill="rgba(255,255,255,.18)"/>
    ${typeOf(p) === KING ? CROWN : ''}
  </svg>`;
}

export function create(root, ctx) {
  let selected = null;
  let ids = new Array(64).fill(null);
  let nextId = 1;
  const board = new GridBoard(root, {
    rows: 8, cols: 8, style: 'checker', theme: 'wood', flip: ctx.perspective === 1, className: 'checkers',
    onCell(r, c) { onTap(r * 8 + c); },
  });
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';

  function onTap(sq) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    const moves = ctx.legalMoves();
    if (selected != null) {
      const mv = moves.find((m) => m.from === selected && m.to === sq);
      if (mv) { select(null); ctx.submit(mv); return; }
    }
    const p = state.board[sq];
    if (p && colorOf(p) === state.turn) {
      if (!moves.some((m) => m.from === sq)) { ctx.sound.play('error'); ctx.setStatus(moves[0].caps.length ? '잡을 수 있는 말은 반드시 잡아야 해요' : '이 말은 움직일 수 없어요'); return; }
      select(sq === selected ? null : sq); ctx.sound.play('tap');
    } else if (selected != null) select(null);
  }

  function select(sq) {
    selected = sq;
    board.clearHighlights('hl-move'); board.clearHighlights('hl-capture'); board.clearHighlights('hl-select');
    if (sq == null) return;
    board.highlight([{ r: sq >> 3, c: sq & 7 }], 'hl-select');
    for (const m of ctx.legalMoves()) if (m.from === sq) board.highlight([{ r: m.to >> 3, c: m.to & 7 }], m.caps.length ? 'hl-capture' : 'hl-move');
  }

  function rebuild(state) { ids = new Array(64).fill(null); state.board.forEach((p, i) => { if (p) ids[i] = 'k' + (nextId++); }); }

  function counts(state) {
    const n = [0, 0];
    for (const p of state.board) if (p) n[colorOf(p)]++;
    ctx.setSeatInfo(0, { score: n[0] }); ctx.setSeatInfo(1, { score: n[1] });
  }

  return {
    update(state, events, prev, animate) {
      board.clearHighlights(); selected = null;
      const mv = events.find((e) => e.type === 'move');
      if (!animate || !mv || !prev) {
        rebuild(state);
        board.sync(state.board.map((p, i) => (p ? { id: ids[i], r: i >> 3, c: i & 7, html: piece(p) } : null)).filter(Boolean), { animate: false });
        counts(state);
      } else {
        const id = ids[mv.path[0]];
        ids[mv.path[mv.path.length - 1]] = id; if (mv.path[0] !== mv.path[mv.path.length - 1]) ids[mv.path[0]] = null;
        const stepMs = 320;
        ctx.lock(stepMs * (mv.path.length - 1) + 200);
        mv.path.slice(1).forEach((sq, k) => {
          setTimeout(() => {
            board.movePiece(id, sq >> 3, sq & 7);
            ctx.sound.play(mv.caps.length ? 'swoosh' : 'move');
            const cap = mv.caps[k];
            if (cap != null) setTimeout(() => {
              const cp = board.pieceAt(cap >> 3, cap & 7);
              if (cp) board.removePiece(cp.id, { animate: true });
              ids[cap] = null;
              const { x, y, size } = board.centerOf(cap >> 3, cap & 7);
              ctx.fx.burst(x, y, { count: 18, palette: colorOf(mv.piece) === 0 ? 'smoke' : 'red', speed: 1.1, size: size * 0.07 });
              ctx.sound.play('capture'); ctx.haptics.hit(); ctx.fx.shake();
            }, 200);
          }, k * stepMs);
        });
        const promo = events.find((e) => e.type === 'promote');
        setTimeout(() => {
          board.sync(state.board.map((p, i) => (p ? { id: ids[i], r: i >> 3, c: i & 7, html: piece(p) } : null)).filter(Boolean), { animate: false });
          if (promo) { const { x, y } = board.centerOf(promo.at >> 3, promo.at & 7); ctx.fx.sparkle(x, y, 40, 'gold'); ctx.fx.stamp('킹!', { small: true, glow: 'rgba(255,209,102,.9)' }); ctx.sound.play('bonus'); board.animatePiece(ids[promo.at], 'spawn', 350); }
          if (mv.caps.length >= 2) ctx.fx.stamp(`${mv.caps.length}연속 점프!`, { small: true });
          counts(state);
        }, stepMs * (mv.path.length - 1) + 250);
      }
      if (state.last) board.highlight([{ r: state.last.from >> 3, c: state.last.from & 7 }, { r: state.last.to >> 3, c: state.last.to & 7 }], 'hl-last');
      if (ctx.canAct()) { const ms = ctx.legalMoves(); ctx.setStatus(ms.length && ms[0].caps.length ? '<b style="color:var(--bad)">잡을 수 있어요!</b> 반드시 잡아야 해요' : '말을 눌러 선택하세요'); }
    },
    destroy() { board.destroy(); },
  };
}
