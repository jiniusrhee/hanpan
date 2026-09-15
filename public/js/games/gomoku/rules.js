// 오목 규칙 + 봇 (자유 규칙: 5개 이상 연속이면 승리)
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'gomoku',
  name: '오목',
  description: '바둑판(15·19줄)에 번갈아 돌을 놓아 가로·세로·대각선으로 5개를 먼저 이으면 이겨요. 삼삼 같은 금수 없이 편하게 즐기는 자유 오목이에요.',
  seatNames: () => ['흑', '백'],
  options: [
    { key: 'size', label: '판 크기', values: [{ value: 15, label: '15줄' }, { value: 19, label: '19줄' }], default: 15 },
  ],
  undo: true,
  rules: `## 목표
내 돌 5개를 가로, 세로, 대각선 중 한 방향으로 먼저 이으면 승리해요.

## 진행
- 흑이 먼저 시작하고, 교차점에 번갈아 돌을 놓아요.
- 이 앱은 자유 규칙이라 삼삼·사사 같은 금수가 없고, 6개 이상 이어도 승리로 인정해요.
- 판이 다 차면 무승부예요.

## 팁
- 양쪽이 열린 3(열린 삼)을 만들면 상대는 막을 수밖에 없어요.
- 열린 삼 두 개, 혹은 사와 열린 삼을 동시에 만들면 사실상 승리예요.`,
};

export function init(options, seed) {
  const size = options.size || 15;
  return { turn: 0, size, board: Array(size * size).fill(-1), last: null, n: 0, rng: seed | 0 };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === -1) out.push({ i });
  return out;
}

export function apply(state, move) {
  const board = state.board.slice();
  board[move.i] = state.turn;
  const next = { ...state, turn: 1 - state.turn, board, last: move.i, n: state.n + 1 };
  const events = [{ type: 'place', i: move.i, seat: state.turn }];
  const line = winLine(board, state.size, move.i);
  if (line) events.push({ type: 'win', line, seat: state.turn });
  return { state: next, events };
}

function winLine(board, size, i) {
  const me = board[i];
  if (me < 0) return null;
  const r = (i / size) | 0, c = i % size;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [i];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] === me) { cells.push(rr * size + cc); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

export function status(state) {
  if (state.last != null) {
    const line = winLine(state.board, state.size, state.last);
    if (line) return { over: true, winner: state.board[state.last], line };
  }
  if (state.n >= state.size * state.size) return { over: true, draw: true, winner: null, reason: '판이 가득 찼어요' };
  return { over: false };
}

// ---- 평가 ----
// 한 방향의 연속 돌 개수와 열린 끝 수로 점수를 매긴다
const SCORE = { 5: 1000000, 4: { 2: 100000, 1: 5000, 0: 0 }, 3: { 2: 4000, 1: 300, 0: 0 }, 2: { 2: 200, 1: 20, 0: 0 }, 1: { 2: 10, 1: 2, 0: 0 } };

function lineScore(board, size, i, color, dr, dc) {
  const r0 = (i / size) | 0, c0 = i % size;
  let count = 1, open = 0;
  for (const s of [1, -1]) {
    let r = r0 + dr * s, c = c0 + dc * s;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === color) { count++; r += dr * s; c += dc * s; }
    if (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === -1) open++;
  }
  if (count >= 5) return SCORE[5];
  return SCORE[count][open];
}

// 어떤 빈 칸에 color 돌을 놓았을 때의 공격 점수
function pointScore(board, size, i, color) {
  board[i] = color;
  let s = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) s += lineScore(board, size, i, color, dr, dc);
  board[i] = -1;
  return s;
}

function candidates(state, k) {
  const { board, size } = state;
  const near = new Set();
  let any = false;
  for (let i = 0; i < board.length; i++) {
    if (board[i] < 0) continue;
    any = true;
    const r = (i / size) | 0, c = i % size;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
      const j = rr * size + cc;
      if (board[j] === -1) near.add(j);
    }
  }
  if (!any) return [{ m: { i: ((size / 2) | 0) * size + ((size / 2) | 0) }, v: 1 }];
  const me = state.turn, op = 1 - me;
  const b = board.slice();
  const scored = [];
  for (const i of near) {
    const atk = pointScore(b, size, i, me);
    const def = pointScore(b, size, i, op);
    scored.push({ m: { i }, v: atk + def * 0.85 });
  }
  scored.sort((a, b2) => b2.v - a.v);
  return scored.slice(0, k);
}

// 전체 판 정적 평가 (seat 입장)
function evaluate(state, seat) {
  const { board, size } = state;
  let me = 0, op = 0;
  const b = board.slice();
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== -1) continue;
    // 빈 칸을 기준으로 "여기 두면 얼마나 좋은가"를 양쪽에 대해 합산 (위협 정도)
    let touch = false;
    const r = (i / size) | 0, c = i % size;
    for (let dr = -1; dr <= 1 && !touch; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < size && cc >= 0 && cc < size && board[rr * size + cc] >= 0) { touch = true; break; } }
    if (!touch) continue;
    me = Math.max(me, pointScore(b, size, i, seat));
    op = Math.max(op, pointScore(b, size, i, 1 - seat));
  }
  // 내 차례면 내 최고 위협이 먼저 실현된다
  return state.turn === seat ? me - op * 0.7 : me * 0.7 - op;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const cands = candidates(state, level === 1 ? 6 : 10);
  if (level === 1) {
    // 쉬움: 급한 수(5목/4목 막기)는 두되, 나머지는 상위 후보 중 무작위
    if (cands[0].v >= 5000) return cands[0].m;
    return cands[rng.int(Math.min(4, cands.length))].m;
  }
  if (cands[0].v >= 100000) return cands[0].m;
  const searchRules = {
    legalMoves: (s) => candidates(s, level === 2 ? 6 : 8).map((x) => x.m),
    apply, status,
  };
  const depth = level === 2 ? 2 : 4;
  return alphabeta(searchRules, state, evaluate, { depth, timeMs: level === 2 ? 700 : 1800, rng, randomness: level === 2 ? 0.05 : 0 }) || cands[0].m;
}
