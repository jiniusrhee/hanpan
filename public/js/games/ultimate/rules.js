// 얼티밋 틱택토 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'ultimate',
  name: '얼티밋 틱택토',
  description: '3×3 틱택토 판 9개가 하나의 큰 판을 이뤄요. 내가 둔 칸의 위치가 상대가 둬야 할 작은 판을 정해요. 작은 판 3개를 한 줄로 이기면 승리!',
  seatNames: () => ['X', 'O'],
  options: [],
  undo: true,
  rules: `## 목표
작은 판을 이겨서 큰 판에서 가로·세로·대각선으로 3개를 먼저 이으면 승리해요.

## 진행
- X가 먼저 시작해요. 첫 수는 아무 곳에나 둘 수 있어요.
- 내가 작은 판의 어떤 칸에 뒀는지에 따라, 상대는 **큰 판에서 같은 위치의 작은 판**에 둬야 해요. 예를 들어 작은 판의 오른쪽 위 칸에 두면, 상대는 오른쪽 위 작은 판에 둬야 해요.
- 가야 할 작은 판이 이미 끝났으면(누가 이겼거나 가득 찼으면) 아무 판에나 둘 수 있어요.
- 작은 판에서 3개를 이으면 그 판은 그 사람의 것이 돼요.
- 큰 판에서 3개를 잇지 못하고 모든 판이 끝나면 무승부예요.

## 팁
- 상대를 이미 끝난 판이나 불리한 판으로 보내는 수가 좋은 수예요.
- 작은 판의 가운데를 잡으면 상대를 가운데 판으로 보내게 되니 신중하게!`,
};

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winnerOf(cells) {
  for (const [a, b, c] of LINES) if (cells[a] >= 0 && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
  return -1;
}

export function init(options, seed) {
  return { turn: 0, cells: Array(81).fill(-1), won: Array(9).fill(-1), next: -1, last: null, rng: seed | 0 };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  const boards = state.next >= 0 && state.won[state.next] === -1 ? [state.next] : [...Array(9).keys()].filter((b) => state.won[b] === -1);
  for (const b of boards) for (let c = 0; c < 9; c++) if (state.cells[b * 9 + c] === -1) out.push({ i: b * 9 + c });
  return out;
}

export function apply(state, m) {
  const cells = state.cells.slice();
  cells[m.i] = state.turn;
  const b = (m.i / 9) | 0, c = m.i % 9;
  const won = state.won.slice();
  const events = [{ type: 'place', i: m.i, seat: state.turn }];
  const small = cells.slice(b * 9, b * 9 + 9);
  const w = winnerOf(small);
  if (w >= 0) { won[b] = w; events.push({ type: 'smallWin', board: b, seat: w }); }
  else if (small.every((v) => v >= 0)) { won[b] = 2; events.push({ type: 'smallFull', board: b }); }
  const next = won[c] === -1 ? c : -1;
  const st = { turn: 1 - state.turn, cells, won, next, last: m.i, rng: state.rng };
  const big = winnerOf(won.map((v) => (v === 2 ? -1 : v)));
  if (big >= 0) events.push({ type: 'win', seat: big, line: LINES.find(([x, y, z]) => won[x] === big && won[y] === big && won[z] === big) });
  return { state: st, events };
}

export function status(state) {
  const big = winnerOf(state.won.map((v) => (v === 2 ? -1 : v)));
  if (big >= 0) return { over: true, winner: big };
  if (state.won.every((v) => v !== -1)) {
    const a = state.won.filter((v) => v === 0).length, b = state.won.filter((v) => v === 1).length;
    return { over: true, draw: true, winner: null, reason: `작은 판 ${a} : ${b}, 큰 줄이 없어요` };
  }
  return { over: false };
}

function lineScore(cells, seat, weights) {
  let s = 0;
  for (const [a, b, c] of LINES) {
    let me = 0, op = 0;
    for (const i of [a, b, c]) { if (cells[i] === seat) me++; else if (cells[i] >= 0) op++; }
    if (me && op) continue;
    if (me) s += weights[me]; else if (op) s -= weights[op];
  }
  return s;
}

function evaluate(state, seat) {
  let s = 0;
  const bigCells = state.won.map((v) => (v === 2 ? -1 : v));
  s += lineScore(bigCells, seat, [0, 30, 200, 5000]);
  for (let b = 0; b < 9; b++) {
    if (state.won[b] === seat) s += 120; else if (state.won[b] === 1 - seat) s -= 120;
    else if (state.won[b] === -1) s += lineScore(state.cells.slice(b * 9, b * 9 + 9), seat, [0, 2, 10, 0]) * (b === 4 ? 1.6 : 1);
  }
  if (state.next === -1) s += state.turn === seat ? 12 : -12;
  return s;
}

const rulesForSearch = { legalMoves, apply, status };
export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 2, timeMs: 300, randomness: 0.6, rng });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 4, timeMs: 900, randomness: 0.05, rng });
  return alphabeta(rulesForSearch, state, evaluate, { depth: 7, timeMs: 2000, rng });
}
