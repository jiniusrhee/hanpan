// 헥스 규칙 + 봇 (최단 경로 평가)
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'hex',
  name: '헥스',
  description: '육각형 칸으로 된 마름모 판. 빨강은 위와 아래, 파랑은 왼쪽과 오른쪽을 내 돌로 먼저 이으면 승리해요. 무승부가 절대 없는 게임이에요.',
  seatNames: () => ['빨강', '파랑'],
  options: [
    { key: 'size', label: '판 크기', values: [{ value: 7, label: '7' }, { value: 9, label: '9' }, { value: 11, label: '11' }], default: 9 },
  ],
  undo: true,
  rules: `## 목표
- **빨강**은 판의 위쪽 변과 아래쪽 변을 자기 돌로 이으면 승리해요.
- **파랑**은 왼쪽 변과 오른쪽 변을 이으면 승리해요.

## 진행
- 빨강이 먼저 시작하고, 빈 칸에 번갈아 돌을 놓아요. 놓은 돌은 움직이거나 잡히지 않아요.
- 육각형이라 가운데 칸은 이웃이 6개예요(가장자리는 더 적어요). 대각선 방향으로 이어진 것처럼 보여도 실제 이웃인지 잘 확인하세요.
- 판이 다 차면 반드시 한쪽이 연결돼 있어서 무승부가 없어요.

## 팁
- 한 칸 띄운 '다리(브릿지)' 모양은 상대가 한쪽을 막아도 다른 쪽으로 이을 수 있어서 사실상 연결된 거예요.
- 가운데 칸이 가장 강력해요.`,
};

const NB = new Map();
function neighbors(n) {
  if (NB.has(n)) return NB.get(n);
  const arr = [];
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n, out = [];
    for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
    arr.push(out);
  }
  NB.set(n, arr);
  return arr;
}

export function init(options, seed) {
  const size = options.size || 9;
  return { turn: 0, size, board: Array(size * size).fill(-1), last: null, win: -1, winCells: null, rng: seed | 0 };
}

export function legalMoves(state) {
  if (state.win >= 0) return [];
  const out = [];
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === -1) out.push({ i });
  return out;
}

// 놓은 돌이 속한 그룹이 양쪽 변에 닿는지
function connected(board, n, i, color) {
  const nb = neighbors(n);
  const seen = new Uint8Array(n * n);
  const stack = [i]; seen[i] = 1;
  const cells = [];
  let a = false, b = false;
  while (stack.length) {
    const p = stack.pop(); cells.push(p);
    const r = (p / n) | 0, c = p % n;
    if (color === 0) { if (r === 0) a = true; if (r === n - 1) b = true; } else { if (c === 0) a = true; if (c === n - 1) b = true; }
    for (const q of nb[p]) if (!seen[q] && board[q] === color) { seen[q] = 1; stack.push(q); }
  }
  return a && b ? cells : null;
}

export function apply(state, m) {
  const board = state.board.slice();
  board[m.i] = state.turn;
  const cells = connected(board, state.size, m.i, state.turn);
  const next = { ...state, turn: 1 - state.turn, board, last: m.i, win: cells ? state.turn : -1, winCells: cells };
  const events = [{ type: 'place', i: m.i, seat: state.turn }];
  if (cells) events.push({ type: 'win', seat: state.turn, cells });
  return { state: next, events };
}

export function status(state) {
  if (state.win >= 0) return { over: true, winner: state.win, reason: state.win === 0 ? '위와 아래를 이었어요' : '왼쪽과 오른쪽을 이었어요' };
  return { over: false };
}

// 최단 연결 거리 (비어 있는 칸 = 1, 내 돌 = 0, 상대 돌 = 통과 불가)
function distance(board, n, color) {
  const nb = neighbors(n);
  const dist = new Int32Array(n * n).fill(1e9);
  const dq = []; // 0-1 BFS
  for (let k = 0; k < n; k++) {
    const i = color === 0 ? k : k * n;
    if (board[i] === 1 - color) continue;
    const d = board[i] === color ? 0 : 1;
    dist[i] = d; dq.push(i);
  }
  dq.sort((x, y) => dist[x] - dist[y]);
  let head = 0;
  const q0 = [], q1 = [];
  for (const i of dq) (dist[i] === 0 ? q0 : q1).push(i);
  const queues = [q0, q1];
  let best = 1e9;
  // 다익스트라 (0/1 가중치)
  const visited = new Uint8Array(n * n);
  let cur = 0;
  while (queues[0].length || queues[1].length) {
    if (!queues[0].length) { queues[0] = queues[1]; queues[1] = []; cur++; }
    const i = queues[0].shift();
    if (visited[i]) continue; visited[i] = 1;
    const r = (i / n) | 0, c = i % n;
    if ((color === 0 && r === n - 1) || (color === 1 && c === n - 1)) { best = Math.min(best, dist[i]); break; }
    for (const q of nb[i]) {
      if (board[q] === 1 - color || visited[q]) continue;
      const w = board[q] === color ? 0 : 1;
      const nd = dist[i] + w;
      if (nd < dist[q]) { dist[q] = nd; (w === 0 ? queues[0] : queues[1]).push(q); }
    }
  }
  return best;
}

function evaluate(state, seat) {
  const n = state.size;
  const mine = distance(state.board, n, seat), theirs = distance(state.board, n, 1 - seat);
  if (mine === 0) return 10000; if (theirs === 0) return -10000;
  return (theirs - mine) * 10;
}

function candidates(state, k) {
  const n = state.size;
  const empties = legalMoves(state);
  if (state.board.every((v) => v === -1)) return [{ i: ((n / 2) | 0) * n + ((n / 2) | 0) }];
  const scored = empties.map((m) => {
    const b = state.board.slice(); b[m.i] = state.turn;
    const s1 = { ...state, board: b };
    const r = (m.i / n) | 0, c = m.i % n;
    const center = -(Math.abs(r - (n - 1) / 2) + Math.abs(c - (n - 1) / 2)) * 0.1;
    return { m, v: evaluate(s1, state.turn) + center };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, k).map((x) => x.m);
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (level === 1) { const c = candidates(state, 5); return c[rng.int(Math.min(3, c.length))]; }
  const searchRules = { legalMoves: (s) => candidates(s, level === 2 ? 8 : 10), apply, status };
  return alphabeta(searchRules, state, evaluate, { depth: level === 2 ? 2 : 3, timeMs: level === 2 ? 900 : 2200, rng }) || candidates(state, 1)[0];
}
