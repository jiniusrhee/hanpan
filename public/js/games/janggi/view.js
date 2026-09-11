import { GridBoard } from '../../core/board.js';
import { colorOf, typeOf, VAL, GENERAL, ROWS, COLS, SETUP_NAMES, score } from './rules.js';
import { h } from '../../core/util.js';

const HANJA = [['', '楚', '士', '象', '馬', '車', '包', '卒'], ['', '漢', '士', '象', '馬', '車', '包', '兵']];
const SIZE = [0, 1, 0.8, 0.9, 0.9, 0.92, 0.9, 0.78];
const cache = new Map();

export function pieceSvg(p) {
  if (cache.has(p)) return cache.get(p);
  const t = typeOf(p), color = colorOf(p);
  const s = SIZE[t];
  const col = color === 0 ? '#1f7a3a' : '#c0392b';
  const w = 50 * s;
  const oct = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; oct.push(`${(50 + Math.cos(a) * w).toFixed(1)},${(50 + Math.sin(a) * w).toFixed(1)}`); }
  const svg = `<svg viewBox="0 0 100 100" style="filter: drop-shadow(0 2px 2px rgba(0,0,0,.45))">
    <defs><linearGradient id="jw${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e1b5"/><stop offset="1" stop-color="#d9b77c"/></linearGradient></defs>
    <polygon points="${oct.join(' ')}" fill="url(#jw${t})" stroke="${col}" stroke-width="${3.5}" stroke-linejoin="round"/>
    <polygon points="${oct.join(' ')}" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1" transform="scale(.9) translate(5.5 5.5)"/>
    <text x="50" y="${t === G ? 53 : 52}" text-anchor="middle" dominant-baseline="central" font-family="'Songti SC','Noto Serif KR','Noto Serif CJK KR','Batang','Apple Myungjo',serif" font-weight="900" font-size="${(t === 1 ? 52 : 46) * s}" fill="${col}">${HANJA[color][t]}</text>
  </svg>`;
  cache.set(p, svg);
  return svg;
}
const G = GENERAL;

export function create(root, ctx) {
  let selected = null;
  let ids = new Array(90).fill(null);
  let nextId = 1;
  const diag = (r1, c1, r2, c2) => `<line x1="${c1 + 0.5}" y1="${r1 + 0.5}" x2="${c2 + 0.5}" y2="${r2 + 0.5}" stroke="var(--line, #3d2a14)" stroke-width="0.035"/>`;
  const extraSvg = diag(0, 3, 2, 5) + diag(0, 5, 2, 3) + diag(7, 3, 9, 5) + diag(7, 5, 9, 3);
  const board = new GridBoard(root, {
    rows: ROWS, cols: COLS, style: 'lines', theme: 'wood', flip: ctx.perspective === 1, className: 'janggi', extraSvg,
    onCell(r, c) { onTap(r * COLS + c); },
  });
  board.el.style.setProperty('--light', '#e8c58c');
  board.el.style.setProperty('--line', '#5a3d22');
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
  board.el.style.padding = '0';
  let setupPanel = null;

  function onTap(sq) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    if (state.phase === 'setup') return;
    const p = state.board[sq];
    const moves = ctx.legalMoves();
    if (selected != null) {
      const mv = moves.find((m) => m.from === selected && m.to === sq);
      if (mv) { select(null); ctx.submit(mv); return; }
    }
    if (p && colorOf(p) === state.turn) { select(sq === selected ? null : sq); ctx.sound.play('tap'); }
    else if (selected != null) select(null);
  }

  function select(sq) {
    selected = sq;
    board.clearHighlights('hl-move'); board.clearHighlights('hl-capture'); board.clearHighlights('hl-select');
    if (sq == null) return;
    board.highlight([{ r: (sq / COLS) | 0, c: sq % COLS }], 'hl-select');
    const state = ctx.match.state;
    for (const m of ctx.legalMoves()) {
      if (m.from !== sq) continue;
      board.highlight([{ r: (m.to / COLS) | 0, c: m.to % COLS }], state.board[m.to] ? 'hl-capture' : 'hl-move');
    }
  }

  function showSetup(state) {
    hideSetup();
    const seat = state.turn;
    const mine = ctx.canAct(seat);
    setupPanel = h('div', { style: { position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', zIndex: 15, background: 'rgba(0,0,0,.35)', borderRadius: '10px' } });
    const card = h('div', { class: 'card', style: { width: 'min(88%, 340px)', textAlign: 'center' } });
    card.appendChild(h('div', { style: { fontWeight: 900, fontSize: '17px', marginBottom: '4px' }, text: `${ctx.seatNames[seat]} 진형 선택` }));
    if (mine) {
      card.appendChild(h('p', { class: 'hint', style: { margin: '0 0 10px' }, text: '마(馬)와 상(象)의 배치를 골라요' }));
      const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } });
      for (const [key, name] of Object.entries(SETUP_NAMES)) {
        grid.appendChild(h('button', { class: 'btn', text: name, onclick: () => { ctx.sound.play('click'); ctx.submit({ setup: key }); } }));
      }
      card.appendChild(grid);
    } else card.appendChild(h('div', { class: 'loading', style: { padding: '8px' } }, h('div', { class: 'spinner' }), h('div', { class: 'hint', text: '상대가 진형을 고르는 중…' })));
    setupPanel.appendChild(card);
    board.el.appendChild(setupPanel);
  }
  function hideSetup() { if (setupPanel) { setupPanel.remove(); setupPanel = null; } }

  function rebuildIds(state) {
    ids = new Array(90).fill(null);
    state.board.forEach((p, i) => { if (p) ids[i] = 'j' + (nextId++); });
  }

  function capturedHtml(state) {
    const full = { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
    const counts = [{}, {}];
    for (const p of state.board) if (p) counts[colorOf(p)][typeOf(p)] = (counts[colorOf(p)][typeOf(p)] || 0) + 1;
    const out = ['', ''];
    for (const color of [0, 1]) {
      let s = '';
      for (const t of [5, 6, 4, 3, 2, 7]) {
        const missing = full[t] - (counts[color][t] || 0);
        for (let i = 0; i < Math.max(0, missing); i++) s += `<span style="display:inline-block;width:18px;height:18px;margin-right:-4px">${pieceSvg(t + color * 8)}</span>`;
      }
      out[1 - color] = s;
    }
    return out;
  }

  return {
    update(state, events, prev, animate) {
      board.clearHighlights();
      selected = null;
      if (state.phase === 'setup') {
        const list = [];
        state.board.forEach((p, i) => { if (p) list.push({ id: 'j' + i, r: (i / COLS) | 0, c: i % COLS, html: pieceSvg(p) }); });
        board.sync(list, { animate });
        if (animate && events.some((e) => e.type === 'setup')) ctx.sound.play('place');
        showSetup(state);
        ctx.setSeatInfo(0, { score: '', extraHtml: '' }); ctx.setSeatInfo(1, { score: '', extraHtml: '' });
        return;
      }
      hideSetup();
      const moveEv = events.find((e) => e.type === 'move');
      if (!animate || !moveEv || !prev || prev.phase === 'setup') rebuildIds(state);
      else {
        const capEv = events.find((e) => e.type === 'capture');
        if (capEv) ids[capEv.at] = null;
        ids[moveEv.to] = ids[moveEv.from]; ids[moveEv.from] = null;
      }
      const list = [];
      state.board.forEach((p, i) => { if (p) list.push({ id: ids[i], r: (i / COLS) | 0, c: i % COLS, html: pieceSvg(p) }); });
      if (animate && moveEv) {
        const capEv = events.find((e) => e.type === 'capture');
        const capPiece = capEv ? board.pieceAt((capEv.at / COLS) | 0, capEv.at % COLS) : null;
        const withCap = capPiece ? [...list, { id: capPiece.id, r: capPiece.r, c: capPiece.c, html: capPiece.html }] : list;
        board.sync(withCap, { animate: true });
        ctx.lock(380);
        if (capEv) {
          setTimeout(() => {
            if (capPiece) board.removePiece(capPiece.id, { animate: true });
            const { x, y, size } = board.centerOf((capEv.at / COLS) | 0, capEv.at % COLS);
            ctx.fx.burst(x, y, { count: 22, palette: colorOf(capEv.piece) === 0 ? 'green' : 'red', speed: 1.2, size: size * 0.08 });
            ctx.fx.ring(x, y, { color: '#fff', size: size * 0.9 });
            ctx.sound.play('capture'); ctx.haptics.hit();
            ctx.fx.shake(VAL[typeOf(capEv.piece)] >= 7);
          }, 300);
        } else { ctx.sound.play('move'); ctx.haptics.tap(); }
        const special = events.find((e) => e.type === 'check' || e.type === 'mate' || e.type === 'facing');
        if (special) setTimeout(() => {
          if (special.type === 'facing') { ctx.fx.stamp('빅장!', { glow: 'rgba(88,166,255,.9)' }); ctx.sound.play('alert'); }
          else { ctx.fx.stamp(special.type === 'mate' ? '외통!' : '장군!', { glow: 'rgba(255,60,60,.9)' }); ctx.sound.play('check'); ctx.haptics.heavy(); if (special.type === 'mate') ctx.fx.shake(true); }
        }, capEv ? 500 : 340);
      } else {
        board.sync(list, { animate: false });
        if (animate && events.some((e) => e.type === 'pass')) { ctx.fx.stamp('한 수 쉼', { small: true, glow: 'rgba(88,166,255,.9)' }); ctx.sound.play('alert'); }
      }
      if (state.last) board.highlight([{ r: (state.last.from / COLS) | 0, c: state.last.from % COLS }, { r: (state.last.to / COLS) | 0, c: state.last.to % COLS }], 'hl-last');
      if (state.check) {
        const g = state.board.findIndex((p) => p && typeOf(p) === G && colorOf(p) === state.turn);
        if (g >= 0) board.highlight([{ r: (g / COLS) | 0, c: g % COLS }], 'hl-check');
      }
      const cap = capturedHtml(state);
      ctx.setSeatInfo(0, { score: score(state.board, 0), extraHtml: cap[0] });
      ctx.setSeatInfo(1, { score: score(state.board, 1), extraHtml: cap[1] });
      if (ctx.canAct()) ctx.setStatus(state.check ? '<b style="color:var(--bad)">장군!</b> 궁을 지켜야 해요' : state.facing ? '<b style="color:var(--info)">빅장!</b> 피하지 않고 쉬면 무승부예요' : '말을 눌러 선택하세요');
    },
    action(id) {
      if (id === 'pass') {
        if (!ctx.canAct()) return;
        const mv = ctx.legalMoves().find((m) => m.pass);
        if (!mv) { ctx.sound.play('error'); ctx.setStatus('장군일 때는 쉴 수 없어요'); return; }
        ctx.submit(mv);
      }
    },
    destroy() { board.destroy(); },
  };
}
