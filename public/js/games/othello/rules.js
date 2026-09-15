// 오셀로(리버시) 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'othello',
  name: '오셀로',
  description: '상대 돌을 내 돌 사이에 끼우면 전부 뒤집혀요. 64칸이 다 차거나 둘 다 둘 곳이 없을 때 돌이 더 많은 쪽이 이겨요.',
  seatNames: () => ['흑', '백'],
  options: [],
  undo: true,
  autoPass: true,   // 둘 곳이 없으면 고를 게 없으니 앱이 알아서 패스한다
  rules: `## 목표
게임이 끝났을 때 판 위에 내 색 돌이 더 많으면 승리해요.

## 진행
- 흑이 먼저 시작해요.
- 내 돌을 놓았을 때, 새 돌과 기존 내 돌 사이에 상대 돌이 한 줄(가로·세로·대각선)로 끼어 있으면 그 돌들이 전부 내 색으로 뒤집혀요.
- 뒤집을 수 있는 자리에만 놓을 수 있어요. 놓을 자리가 없으면 **자동으로 패스**되고 차례가 넘어가요.
- 판이 가득 차거나 두 사람 모두 놓을 곳이 없으면 게임이 끝나요.

## 팁
- 모서리(코너) 돌은 절대 뒤집히지 않아요. 코너를 노리세요.
- 초반에 돌이 많다고 좋은 게 아니에요. 상대가 둘 곳을 줄이는 게 핵심이에요.`,
};

const N = 8;
const DIRS = [-9, -8, -7, -1, 1, 7, 8, 9];

export function init(options, seed) {
  const board = Array(64).fill(-1);
  board[27] = 1; board[28] = 0; board[35] = 0; board[36] = 1;
  return { turn: 0, board, last: null, passes: 0, rng: seed | 0 };
}

function flipsFor(board, i, color) {
  if (board[i] !== -1) return [];
  const out = [];
  const r0 = (i / 8) | 0, c0 = i % 8;
  for (const d of DIRS) {
    const dr = d === -9 || d === -8 || d === -7 ? -1 : d === 7 || d === 8 || d === 9 ? 1 : 0;
    const dc = d === -9 || d === -1 || d === 7 ? -1 : d === -7 || d === 1 || d === 9 ? 1 : 0;
    let r = r0 + dr, c = c0 + dc;
    const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const j = r * 8 + c;
      if (board[j] === 1 - color) line.push(j);
      else if (board[j] === color) { if (line.length) out.push(...line); break; }
      else break;
      r += dr; c += dc;
    }
  }
  return out;
}

function movesFor(board, color) {
  const out = [];
  for (let i = 0; i < 64; i++) if (board[i] === -1 && flipsFor(board, i, color).length) out.push(i);
  return out;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const ms = movesFor(state.board, state.turn);
  if (ms.length === 0) return [{ pass: true }];
  return ms.map((i) => ({ i }));
}

export function apply(state, move) {
  if (move.pass) {
    return { state: { ...state, turn: 1 - state.turn, passes: state.passes + 1, last: null }, events: [{ type: 'pass', seat: state.turn }] };
  }
  const board = state.board.slice();
  const flips = flipsFor(board, move.i, state.turn);
  board[move.i] = state.turn;
  for (const j of flips) board[j] = state.turn;
  const next = { turn: 1 - state.turn, board, last: move.i, passes: 0, rng: state.rng };
  return { state: next, events: [{ type: 'place', i: move.i, seat: state.turn }, { type: 'flip', cells: flips, seat: state.turn, origin: move.i }] };
}

export function count(board) {
  let b = 0, w = 0;
  for (const v of board) { if (v === 0) b++; else if (v === 1) w++; }
  return [b, w];
}

export function status(state) {
  const [b, w] = count(state.board);
  const full = b + w === 64;
  const noMoves = !full && movesFor(state.board, 0).length === 0 && movesFor(state.board, 1).length === 0;
  if (full || noMoves || state.passes >= 2) {
    const winner = b > w ? 0 : w > b ? 1 : null;
    return { over: true, winner, draw: winner == null, scores: [b, w], reason: winner == null ? `${b} : ${w}, 같은 수예요` : `${b} : ${w}` };
  }
  return { over: false };
}

// 위치 가중치
const W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];

function evaluate(state, seat) {
  const b = state.board;
  const [bc, wc] = count(b);
  const empties = 64 - bc - wc;
  if (empties <= 12) {
    const diff = seat === 0 ? bc - wc : wc - bc;
    return diff * 10 + (movesFor(b, seat).length - movesFor(b, 1 - seat).length) * 3;
  }
  let pos = 0;
  for (let i = 0; i < 64; i++) if (b[i] >= 0) pos += b[i] === seat ? W[i] : -W[i];
  // 코너를 가지면 인접한 X/C 칸 페널티는 없앤다
  const corners = [[0, [1, 8, 9]], [7, [6, 14, 15]], [56, [48, 49, 57]], [63, [54, 55, 62]]];
  for (const [c, adj] of corners) {
    if (b[c] === seat) for (const a of adj) if (b[a] === seat) pos += -W[a] + 10;
    if (b[c] === 1 - seat) for (const a of adj) if (b[a] === 1 - seat) pos -= -W[a] + 10;
  }
  const mob = movesFor(b, seat).length - movesFor(b, 1 - seat).length;
  return pos + mob * 8;
}

const rulesForSearch = { legalMoves, apply, status };

export function ai(state, level = 2) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves[0].pass) return moves[0];
  const rng = makeRng();
  const empties = state.board.filter((v) => v === -1).length;
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 1, timeMs: 300, randomness: 0.6, rng });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 3, timeMs: 800, randomness: 0.08, rng, orderMoves: order });
  const depth = empties <= 11 ? empties : 6;
  return alphabeta(rulesForSearch, state, evaluate, { depth, timeMs: 1800, rng, orderMoves: order });
}

function order(state, moves) {
  return moves.slice().sort((a, b) => (W[b.i] || 0) - (W[a.i] || 0));
}
