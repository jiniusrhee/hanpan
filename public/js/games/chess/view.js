import { GridBoard } from '../../core/board.js';
import { pieceSvg } from './pieces.js';
import { colorOf, typeOf, VAL, pieceChar, KING } from './rules.js';
import { openModal } from '../../ui/modal.js';
import { h } from '../../core/util.js';

const PIECE_NAME = { q: '퀸', r: '룩', b: '비숍', n: '나이트' };

export function create(root, ctx) {
  let selected = null;
  let ids = new Array(64).fill(null);
  let nextId = 1;
  const board = new GridBoard(root, {
    rows: 8, cols: 8, style: 'checker', theme: 'wood', coords: true, flip: ctx.perspective === 1, className: 'chess',
    onCell(r, c) { onTap(r * 8 + c); },
  });
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';

  function html(p) { return pieceSvg(pieceChar(p), colorOf(p)); }

  function onTap(sq) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    const p = state.board[sq];
    const moves = ctx.legalMoves();
    if (selected != null) {
      const cands = moves.filter((m) => m.from === selected && m.to === sq);
      if (cands.length === 1) { select(null); ctx.submit(cands[0]); return; }
      if (cands.length > 1) { select(null); pickPromotion(cands); return; }
    }
    if (p && colorOf(p) === state.turn) { select(sq === selected ? null : sq); ctx.sound.play('tap'); }
    else if (selected != null) select(null);
  }

  function pickPromotion(cands) {
    const color = ctx.match.state.turn;
    let m;
    const grid = h('div', { class: 'emote-grid' }, cands.map((c) => h('button', { html: `<div style="width:56px;height:56px;margin:0 auto">${pieceSvg(c.promo, color)}</div><div class="small">${PIECE_NAME[c.promo]}</div>`, onclick: () => { m.close(); ctx.submit(c); } })));
    m = openModal({ title: '어떤 말로 승격할까요?', body: grid, dismissible: true });
  }

  function select(sq) {
    selected = sq;
    board.clearHighlights('hl-move'); board.clearHighlights('hl-capture'); board.clearHighlights('hl-select');
    if (sq == null) return;
    board.highlight([{ r: sq >> 3, c: sq & 7 }], 'hl-select');
    const state = ctx.match.state;
    for (const m of ctx.legalMoves()) {
      if (m.from !== sq) continue;
      const cap = state.board[m.to] || m.ep;
      board.highlight([{ r: m.to >> 3, c: m.to & 7 }], cap ? 'hl-capture' : 'hl-move');
    }
  }

  function rebuildIds(state) {
    ids = new Array(64).fill(null);
    state.board.forEach((p, i) => { if (p) ids[i] = 'p' + (nextId++); });
  }

  function capturedHtml(state) {
    // 초기 배치와 비교해 잡힌 말 목록
    const counts = [{}, {}];
    for (const p of state.board) if (p) { const k = pieceChar(p); counts[colorOf(p)][k] = (counts[colorOf(p)][k] || 0) + 1; }
    const full = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const out = ['', ''];
    let mat = [0, 0];
    for (const color of [0, 1]) {
      let s = '';
      for (const k of ['q', 'r', 'b', 'n', 'p']) {
        const missing = full[k] - (counts[color][k] || 0);
        for (let i = 0; i < Math.max(0, missing); i++) s += `<span style="display:inline-block;width:16px;height:16px;margin-right:-5px">${pieceSvg(k, color)}</span>`;
        mat[color] += (counts[color][k] || 0) * VAL['pnbrqk'.indexOf(k) + 1];
      }
      out[1 - color] = s; // 상대가 잡은 말은 상대 패널에
    }
    const diff = mat[0] - mat[1];
    return { html: out, diff };
  }

  return {
    update(state, events, prev, animate) {
      board.clearHighlights();
      selected = null;
      const moveEv = events.find((e) => e.type === 'move');
      if (!animate || !moveEv || !prev) rebuildIds(prev && !animate ? state : state);
      else {
        // 이벤트로 id 이동
        for (const ev of events) {
          if (ev.type === 'capture') ids[ev.at] = null;
        }
        ids[moveEv.to] = ids[moveEv.from]; ids[moveEv.from] = null;
        const castle = events.find((e) => e.type === 'castle');
        if (castle) { ids[castle.rookTo] = ids[castle.rookFrom]; ids[castle.rookFrom] = null; }
        state.board.forEach((p, i) => { if (p && !ids[i]) ids[i] = 'p' + (nextId++); });
      }
      const list = [];
      state.board.forEach((p, i) => { if (p) list.push({ id: ids[i], r: i >> 3, c: i & 7, html: html(p), cls: 'col' + colorOf(p) }); });
      if (animate && moveEv) {
        const capEv = events.find((e) => e.type === 'capture');
        // 잡히는 말은 이동이 끝난 뒤 사라지게: 먼저 이동만 반영
        const capId = capEv ? board.pieceAt(capEv.at >> 3, capEv.at & 7)?.id : null;
        const listPlusCap = capId ? [...list, { ...boardPieceInfo(capId), r: capEv.at >> 3, c: capEv.at & 7 }] : list;
        board.sync(listPlusCap, { animate: true });
        ctx.lock(380);
        if (capEv) {
          setTimeout(() => {
            board.removePiece(capId, { animate: true });
            const { x, y, size } = board.centerOf(capEv.at >> 3, capEv.at & 7);
            ctx.fx.burst(x, y, { count: 22, palette: colorOf(capEv.piece) === 0 ? 'white' : 'smoke', speed: 1.2, size: size * 0.07 });
            ctx.fx.ring(x, y, { color: '#ff5c7a', size: size * 0.8 });
            ctx.sound.play('capture'); ctx.haptics.hit();
            ctx.fx.shake(typeOf(capEv.piece) >= 4);
          }, 300);
        } else { ctx.sound.play('move'); ctx.haptics.tap(); }
        const promo = events.find((e) => e.type === 'promote');
        if (promo) setTimeout(() => { board.animatePiece(ids[promo.at], 'spawn', 350); const { x, y } = board.centerOf(promo.at >> 3, promo.at & 7); ctx.fx.sparkle(x, y, 40, 'gold'); ctx.sound.play('bonus'); }, 360);
        const check = events.find((e) => e.type === 'check' || e.type === 'mate');
        if (check) setTimeout(() => {
          ctx.fx.stamp(check.type === 'mate' ? '체크메이트!' : '체크!', { glow: 'rgba(255,60,60,.9)' });
          ctx.sound.play('check'); ctx.haptics.heavy();
          if (check.type === 'mate') ctx.fx.shake(true);
        }, capEv ? 500 : 340);
      } else board.sync(list, { animate: false });

      if (state.last) board.highlight([{ r: state.last.from >> 3, c: state.last.from & 7 }, { r: state.last.to >> 3, c: state.last.to & 7 }], 'hl-last');
      if (state.check) {
        const k = state.board.findIndex((p) => p && typeOf(p) === KING && colorOf(p) === state.turn);
        if (k >= 0) board.highlight([{ r: k >> 3, c: k & 7 }], 'hl-check');
      }
      const cap = capturedHtml(state);
      ctx.setSeatInfo(0, { extraHtml: cap.html[0] + (cap.diff > 0 ? `<b style="margin-left:6px;color:var(--good)">+${cap.diff / 100}</b>` : ''), score: '' });
      ctx.setSeatInfo(1, { extraHtml: cap.html[1] + (cap.diff < 0 ? `<b style="margin-left:6px;color:var(--good)">+${-cap.diff / 100}</b>` : ''), score: '' });
      if (ctx.canAct()) ctx.setStatus(state.check ? '<b style="color:var(--bad)">체크!</b> 킹을 지켜야 해요' : '말을 눌러 선택하세요');
    },
    destroy() { board.destroy(); },
  };

  function boardPieceInfo(id) { const p = board.getPiece(id); return { id, html: p.html, cls: p.cls }; }
}
