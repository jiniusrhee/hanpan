// 블로커스 규칙 + 봇 (2인 14×14 듀오, 4인 20×20)
import { makeRng } from '../../core/rng.js';

export const PIECES = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]], [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3]],
  [[0, 0], [0, 1], [1, 0], [1, 1], [0, 2]], [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]], [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
];

function normalize(cells) {
  const mr = Math.min(...cells.map((c) => c[0])), mc = Math.min(...cells.map((c) => c[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
export const ORIENTS = PIECES.map((p) => {
  const seen = new Map();
  let cur = p;
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      const n = normalize(cur);
      const k = JSON.stringify(n);
      if (!seen.has(k)) seen.set(k, n);
      cur = cur.map(([rr, cc]) => [cc, -rr]); // 회전
    }
    cur = cur.map(([rr, cc]) => [rr, -cc]); // 뒤집기
  }
  return [...seen.values()];
});

const COLORS = ['#4fa3ff', '#ff6b6b', '#3ddc97', '#ffc247'];
export const meta = {
  id: 'blokus',
  name: '블로커스',
  description: '21가지 모양의 조각을 판에 놓아요. 내 조각끼리는 꼭짓점으로만 닿아야 하고 변이 맞닿으면 안 돼요. 조각을 더 많이 놓은 사람이 승리! 2인은 14×14, 4인은 20×20 판이에요.',
  seatNames: (n) => ['파랑', '빨강', '초록', '노랑'].slice(0, n),
  seatColors: (n) => COLORS.slice(0, n),
  playerCounts: [2, 4],
  options: [],
  undo: true,
  rules: `## 목표
게임이 끝났을 때 판에 놓은 칸 수가 가장 많은 사람이 승리해요. (남은 조각이 적을수록 좋아요.)

## 진행
- 각자 21개의 조각(1칸~5칸)을 가지고 시작해요.
- 첫 조각은 시작점(4인: 자기 모서리, 2인: 표시된 점)을 덮어야 해요.
- 그다음부터 놓는 조각은 **내 조각과 꼭짓점(모서리)으로 닿아야** 하고, **변으로는 닿으면 안 돼요.** 다른 사람 조각과는 아무렇게나 닿아도 괜찮아요.
- 더 놓을 수 없는 사람은 차례를 건너뛰어요. 아무도 놓을 수 없으면 끝!

## 점수
- 놓은 칸 수가 점수예요.
- 21개를 다 놓으면 +15, 마지막에 놓은 조각이 1칸짜리면 +5 보너스!

## 조작
아래 조각을 고르고 회전/뒤집기 버튼으로 모양을 맞춘 뒤, 판을 누르면 미리보기가 나와요. 한 번 더 누르거나 확인을 누르면 놓여요.

## 팁
- 큰 조각부터 먼저 쓰세요. 나중엔 놓을 자리가 없어요.
- 판 가운데로 빨리 뻗어 나가 상대의 길을 막으세요.`,
};

export function init(options, seed, playerCount = 2) {
  const n = playerCount === 4 ? 4 : 2;
  const size = n === 4 ? 20 : 14;
  const starts = n === 4 ? [[0, 0], [0, size - 1], [size - 1, size - 1], [size - 1, 0]] : [[4, 4], [9, 9]];
  return { turn: 0, n, size, board: Array(size * size).fill(-1), hands: Array.from({ length: n }, () => PIECES.map((_, i) => i)), starts, lastPiece: Array(n).fill(-1), placed: Array(n).fill(0), over: false, rng: seed | 0 };
}

function cellsOf(m) { return ORIENTS[m.piece][m.o].map(([r, c]) => [m.r + r, m.c + c]); }

export function validPlacement(state, seat, m) {
  const { size, board } = state;
  if (!ORIENTS[m.piece] || !ORIENTS[m.piece][m.o]) return false;
  if (!state.hands[seat].includes(m.piece)) return false;
  const cells = cellsOf(m);
  let corner = false, first = state.placed[seat] === 0;
  let coversStart = false;
  const [sr, sc] = state.starts[seat];
  for (const [r, c] of cells) {
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    if (board[r * size + c] !== -1) return false;
    if (r === sr && c === sc) coversStart = true;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < size && cc < size && board[rr * size + cc] === seat) return false; }
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < size && cc < size && board[rr * size + cc] === seat) corner = true; }
  }
  return first ? coversStart : corner;
}

// 이 좌석이 새 조각을 이어 붙일 수 있는 빈 칸(대각선 접점) 목록
export function anchors(state, seat) {
  const { size, board } = state;
  if (state.placed[seat] === 0) return [state.starts[seat]];
  const out = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (board[r * size + c] !== -1) continue;
    let edge = false, diag = false;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < size && cc < size && board[rr * size + cc] === seat) { edge = true; break; } }
    if (edge) continue;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < size && cc < size && board[rr * size + cc] === seat) { diag = true; break; } }
    if (diag) out.push([r, c]);
  }
  return out;
}

// 놓을 수 있는 자리가 하나라도 있는지 (전체 목록을 만들지 않고 첫 성공에서 바로 반환)
export function canMove(state, seat) {
  const anc = anchors(state, seat);
  if (!anc.length) return false;
  for (const piece of state.hands[seat]) {
    const orients = ORIENTS[piece];
    for (let o = 0; o < orients.length; o++) {
      const cells = orients[o];
      for (const [ar, ac] of anc) for (const [kr, kc] of cells) if (validPlacement(state, seat, { piece, o, r: ar - kr, c: ac - kc })) return true;
    }
  }
  return false;
}

export function movesFor(state, seat) {
  const anc = anchors(state, seat);
  const out = [];
  const seen = new Set();
  for (const piece of state.hands[seat]) {
    ORIENTS[piece].forEach((cells, o) => {
      for (const [ar, ac] of anc) for (const [kr, kc] of cells) {
        const m = { piece, o, r: ar - kr, c: ac - kc };
        const key = `${piece}:${o}:${m.r}:${m.c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (validPlacement(state, seat, m)) out.push(m);
      }
    });
  }
  return out;
}

export function legalMoves(state) {
  if (state.over) return [];
  return movesFor(state, state.turn);
}
export function isLegal(state, m) { return !!m && !state.over && validPlacement(state, state.turn, m); }

export function apply(state, m) {
  const seat = state.turn;
  const board = state.board.slice();
  const cells = cellsOf(m);
  for (const [r, c] of cells) board[r * state.size + c] = seat;
  const hands = state.hands.map((h) => h.slice());
  hands[seat] = hands[seat].filter((p) => p !== m.piece);
  const placed = state.placed.slice(); placed[seat] += cells.length;
  const lastPiece = state.lastPiece.slice(); lastPiece[seat] = m.piece;
  const next = { ...state, board, hands, placed, lastPiece, last: { seat, cells } };
  const events = [{ type: 'place', seat, cells, piece: m.piece }];
  if (hands[seat].length === 0) events.push({ type: 'allPlaced', seat, bonus: m.piece === 0 ? 20 : 15 });
  // 다음에 놓을 수 있는 사람을 찾는다
  let t = seat, found = false;
  const skipped = [];
  for (let k = 1; k <= state.n; k++) {
    t = (seat + k) % state.n;
    if (canMove(next, t)) { found = true; break; }
    skipped.push(t);
  }
  if (found) { if (skipped.length) events.push({ type: 'skip', from: skipped[0], to: t, seats: skipped }); next.turn = t; }
  else { next.over = true; events.push({ type: 'end' }); }
  return { state: next, events };
}

export function scores(state) {
  return state.placed.map((p, seat) => p + (state.hands[seat].length === 0 ? 15 + (state.lastPiece[seat] === 0 ? 5 : 0) : 0));
}

export function status(state) {
  if (!state.over) return { over: false };
  const sc = scores(state);
  const best = Math.max(...sc);
  const winners = sc.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  return { over: true, winner: winners.length === 1 ? winners[0] : null, draw: winners.length > 1, scores: sc, reason: sc.map((v, i) => `${['파랑', '빨강', '초록', '노랑'][i]} ${v}`).join(' · ') };
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const seat = state.turn;
  const size = state.size;
  const myAnc = anchors(state, seat).length;
  const oppAnc = state.n === 2 ? anchors(state, 1 - seat).length : 0;
  const early = state.placed[seat] < 25;
  // 큰 조각부터 살펴보고, 시간이 다 되면 남은 후보는 조각 크기만으로 평가한다 (느린 기기에서도 오래 기다리지 않게)
  const deadline = performance.now() + (level === 3 ? 1800 : level === 2 ? 900 : 100);
  moves.sort((a, b) => ORIENTS[b.piece][b.o].length - ORIENTS[a.piece][a.o].length);
  const scored = moves.map((m) => {
    const cells = ORIENTS[m.piece][m.o].length;
    let v = cells * 10;
    if (level >= 2 && performance.now() < deadline) {
      const next = apply(state, m).state;
      v += (anchors(next, seat).length - myAnc) * 2.2;
      if (state.n === 2) v += (oppAnc - anchors(next, 1 - seat).length) * (level === 3 ? 3 : 2);
      else if (level === 3) { let blocked = 0; for (let o = 0; o < state.n; o++) if (o !== seat) blocked += anchors(state, o).length - anchors(next, o).length; v += blocked * 1.5; }
      if (early) { const cr = m.r + 2, cc = m.c + 2; v -= (Math.abs(cr - size / 2) + Math.abs(cc - size / 2)) * 0.6; }
    }
    return { m, v: v + rng.next() * (level === 1 ? 25 : 0.8) };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}
