// 사목(커넥트 포) 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'connect4',
  name: '사목',
  description: '7칸 × 6줄 판에 동전을 떨어뜨려 가로·세로·대각선으로 4개를 먼저 이으면 승리! 단순하지만 수읽기가 깊어요.',
  seatNames: () => ['빨강', '노랑'],
  options: [],
  undo: true,
  rules: `## 목표
내 동전 4개를 가로, 세로, 대각선 중 한 방향으로 먼저 연결하면 승리해요.

## 진행
- 빨강이 먼저 시작해요.
- 원하는 열을 누르면 동전이 그 열의 가장 아래 빈 칸으로 떨어져요.
- 판이 다 차도 4개가 이어지지 않으면 무승부예요.

## 팁
- 가운데 열이 가장 강력해요. 여러 방향으로 연결할 수 있거든요.
- 상대가 3개를 이었으면 반드시 막아야 해요. 동시에 두 곳을 위협하는 수를 노리세요.`,
};

const COLS = 7, ROWS = 6;

export function init(options, seed) {
  return { turn: 0, board: Array(COLS * ROWS).fill(-1), last: null, rng: seed | 0, n: 0 };
}

const idx = (r, c) => r * COLS + c;

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  for (let c = 0; c < COLS; c++) if (state.board[idx(0, c)] === -1) out.push({ c });
  return out;
}

export function apply(state, move) {
  const board = state.board.slice();
  let r = ROWS - 1;
  while (r >= 0 && board[idx(r, move.c)] !== -1) r--;
  board[idx(r, move.c)] = state.turn;
  const next = { turn: 1 - state.turn, board, last: idx(r, move.c), rng: state.rng, n: state.n + 1 };
  const events = [{ type: 'drop', r, c: move.c, seat: state.turn }];
  const line = winLine(board, r, move.c);
  if (line) events.push({ type: 'win', line, seat: state.turn });
  return { state: next, events };
}

function winLine(board, r, c) {
  const me = board[idx(r, c)];
  if (me < 0) return null;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && board[idx(rr, cc)] === me) { cells.push([rr, cc]); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells.map(([rr, cc]) => idx(rr, cc));
  }
  return null;
}

export function status(state) {
  if (state.last != null) {
    const line = winLine(state.board, (state.last / COLS) | 0, state.last % COLS);
    if (line) return { over: true, winner: state.board[state.last], line };
  }
  if (state.n >= COLS * ROWS) return { over: true, draw: true, winner: null, reason: '판이 가득 찼어요' };
  return { over: false };
}

// 평가: 4칸 창(window)마다 점수
function evaluate(state, seat) {
  const b = state.board;
  let score = 0;
  const win = (cells) => {
    let me = 0, op = 0;
    for (const i of cells) { if (b[i] === seat) me++; else if (b[i] >= 0) op++; }
    if (me && op) return 0;
    if (me === 3) return 60; if (me === 2) return 8; if (me === 1) return 1;
    if (op === 3) return -70; if (op === 2) return -8; if (op === 1) return -1;
    return 0;
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c + 3 < COLS) score += win([idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3)]);
    if (r + 3 < ROWS) score += win([idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c)]);
    if (r + 3 < ROWS && c + 3 < COLS) score += win([idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3)]);
    if (r + 3 < ROWS && c - 3 >= 0) score += win([idx(r, c), idx(r + 1, c - 1), idx(r + 2, c - 2), idx(r + 3, c - 3)]);
  }
  for (let r = 0; r < ROWS; r++) { if (b[idx(r, 3)] === seat) score += 4; else if (b[idx(r, 3)] >= 0) score -= 4; }
  return score;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const order = (state, moves) => moves.slice().sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c));
const rulesForSearch = { legalMoves, apply, status };

export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 2, timeMs: 300, randomness: 0.5, rng, orderMoves: order });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 5, timeMs: 900, randomness: 0.05, rng, orderMoves: order });
  return alphabeta(rulesForSearch, state, evaluate, { depth: 10, timeMs: 2000, rng, orderMoves: order });
}
