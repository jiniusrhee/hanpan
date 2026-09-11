// 틱택토 규칙 + 봇
import { makeRng } from '../../core/rng.js';

export const meta = {
  id: 'tictactoe',
  name: '틱택토',
  description: '3×3 판에 번갈아 표시를 놓아 가로·세로·대각선으로 셋을 먼저 이으면 이겨요. 완벽하게 두면 항상 무승부가 나는 게임이라, 상대의 실수를 노려야 해요.',
  seatNames: () => ['X', 'O'],
  options: [],
  undo: true,
  rules: `## 목표
가로, 세로, 대각선 중 한 줄에 내 표시 3개를 먼저 놓으면 승리해요.

## 진행
- X가 먼저 시작하고, 빈 칸에 번갈아 표시를 놓아요.
- 9칸이 모두 차도 줄이 완성되지 않으면 무승부예요.

## 팁
- 가운데 칸이 가장 강력해요.
- 두 줄을 동시에 노리는 '더블 스레트'를 만들면 이길 수 있어요.`,
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function init(options, seed) {
  return { turn: 0, board: Array(9).fill(-1), last: null, rng: seed | 0 };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  for (let i = 0; i < 9; i++) if (state.board[i] < 0) out.push({ i });
  return out;
}

export function apply(state, move) {
  const board = state.board.slice();
  board[move.i] = state.turn;
  const next = { turn: 1 - state.turn, board, last: move.i, rng: state.rng };
  const events = [{ type: 'place', i: move.i, seat: state.turn }];
  const st = status(next);
  if (st.over && st.line) events.push({ type: 'win', line: st.line, seat: state.turn });
  return { state: next, events };
}

export function status(state) {
  const b = state.board;
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] >= 0 && b[a] === b[c] && b[a] === b[d]) return { over: true, winner: b[a], line };
  }
  if (b.every((v) => v >= 0)) return { over: true, draw: true, winner: null, reason: '판이 꽉 찼어요' };
  return { over: false };
}

function minimax(b, turn, me) {
  for (const [a, c, d] of LINES) if (b[a] >= 0 && b[a] === b[c] && b[a] === b[d]) return b[a] === me ? 1 : -1;
  if (b.every((v) => v >= 0)) return 0;
  let best = turn === me ? -2 : 2;
  for (let i = 0; i < 9; i++) {
    if (b[i] >= 0) continue;
    b[i] = turn;
    const v = minimax(b, 1 - turn, me);
    b[i] = -1;
    if (turn === me) best = Math.max(best, v); else best = Math.min(best, v);
  }
  return best;
}

export function ai(state, level = 2) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const rng = makeRng();
  if (level === 1 && rng.next() < 0.6) return rng.pick(moves);
  const scored = moves.map((m) => {
    const b = state.board.slice();
    b[m.i] = state.turn;
    return { m, v: minimax(b, 1 - state.turn, state.turn) };
  });
  scored.sort((a, b) => b.v - a.v);
  if (level === 2 && rng.next() < 0.3) {
    // 보통: 가끔 최선이 아닌 수도 둔다 (지는 수는 피함)
    const ok = scored.filter((s) => s.v >= 0);
    if (ok.length > 1) return rng.pick(ok).m;
  }
  const best = scored.filter((s) => s.v === scored[0].v);
  return rng.pick(best).m;
}
