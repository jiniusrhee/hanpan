// 나인 멘스 모리스 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'morris',
  name: '나인 멘스 모리스',
  description: '9개의 말을 놓고 움직여 세 개를 일렬(밀)로 만들면 상대 말을 하나 제거해요. 상대 말을 2개로 줄이거나 움직이지 못하게 하면 승리!',
  seatNames: () => ['흰색', '검정'],
  options: [],
  undo: true,
  rules: `## 목표
상대 말을 2개만 남기거나, 상대가 움직일 수 없게 만들면 승리해요.

## 진행
- **놓기 단계**: 각자 9개의 말을 번갈아 빈 점에 놓아요.
- **움직이기 단계**: 말을 다 놓으면, 선을 따라 이웃한 빈 점으로 한 칸씩 움직여요.
- **밀(Mill)**: 내 말 3개가 선 하나에 나란히 놓이면 밀! 상대 말을 하나 골라 제거해요. 밀에 들어 있는 상대 말은 제거할 수 없어요(모두 밀 안에 있을 때만 가능).
- **날기**: 내 말이 3개만 남으면 어디로든 자유롭게 날아갈 수 있어요.
- 양쪽 합쳐 100수 동안 제거된 말이 없거나, 같은 국면이 세 번 나오면 무승부예요.

## 팁
- 놓기 단계에서 밀을 서두르기보다 움직일 공간(이동성)을 확보하세요.
- 밀을 열었다 닫는 '왕복 밀'을 만들면 매 턴 상대 말을 제거할 수 있어요.`,
};

export const POINTS = [[0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]];
export const MILLS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23], [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]];
export const ADJ = Array.from({ length: 24 }, () => []);
for (const [a, b, c] of MILLS) { ADJ[a].push(b); ADJ[b].push(a, c); ADJ[c].push(b); }
const MILLS_OF = Array.from({ length: 24 }, (_, i) => MILLS.filter((m) => m.includes(i)));

export function init(options, seed) {
  return { turn: 0, board: Array(24).fill(-1), hand: [9, 9], remove: -1, last: null, quiet: 0, reps: {}, rng: seed | 0 };
}

function inMill(board, i, color) { return MILLS_OF[i].some((m) => m.every((p) => board[p] === color)); }
const countOf = (board, color) => board.filter((v) => v === color).length;

export function legalMoves(state) {
  if (status(state).over) return [];
  const { board, turn } = state;
  const out = [];
  if (state.remove >= 0) {
    const opp = 1 - turn;
    const all = [];
    for (let i = 0; i < 24; i++) if (board[i] === opp) all.push(i);
    const free = all.filter((i) => !inMill(board, i, opp));
    for (const i of free.length ? free : all) out.push({ remove: i });
    return out;
  }
  if (state.hand[turn] > 0) {
    for (let i = 0; i < 24; i++) if (board[i] === -1) out.push({ place: i });
    return out;
  }
  const flying = countOf(board, turn) === 3;
  for (let i = 0; i < 24; i++) {
    if (board[i] !== turn) continue;
    const targets = flying ? [...Array(24).keys()] : ADJ[i];
    for (const t of targets) if (board[t] === -1) out.push({ from: i, to: t });
  }
  return out;
}

export function apply(state, m) {
  const board = state.board.slice();
  const hand = state.hand.slice();
  const turn = state.turn;
  const events = [];
  let next;
  if (m.remove != null) {
    board[m.remove] = -1;
    events.push({ type: 'remove', i: m.remove, seat: turn });
    next = { ...state, board, turn: 1 - turn, remove: -1, quiet: 0, reps: {}, last: null };
  } else {
    let at;
    if (m.place != null) { board[m.place] = turn; hand[turn]--; at = m.place; events.push({ type: 'place', i: m.place, seat: turn }); }
    else { board[m.to] = turn; board[m.from] = -1; at = m.to; events.push({ type: 'move', from: m.from, to: m.to, seat: turn }); }
    const mill = inMill(board, at, turn);
    if (mill) events.push({ type: 'mill', i: at, seat: turn, line: MILLS_OF[at].find((l) => l.every((p) => board[p] === turn)) });
    next = { ...state, board, hand, turn: mill ? turn : 1 - turn, remove: mill ? turn : -1, last: at, quiet: m.place != null ? 0 : state.quiet + 1, reps: m.place != null ? {} : { ...state.reps } };
  }
  const key = board.join('') + next.turn + next.remove;
  next.reps[key] = (next.reps[key] || 0) + 1;
  return { state: next, events };
}

export function status(state) {
  const { board, hand, turn } = state;
  if (hand[0] === 0 && hand[1] === 0) {
    for (const s of [0, 1]) if (countOf(board, s) < 3) return { over: true, winner: 1 - s, reason: '말이 2개만 남았어요' };
  }
  if (state.remove < 0 && hand[turn] === 0) {
    const flying = countOf(board, turn) === 3;
    let can = false;
    for (let i = 0; i < 24 && !can; i++) if (board[i] === turn) { for (const t of flying ? [...Array(24).keys()] : ADJ[i]) if (board[t] === -1) { can = true; break; } }
    if (!can) return { over: true, winner: 1 - turn, reason: '움직일 수 있는 말이 없어요' };
  }
  if (state.quiet >= 100) return { over: true, draw: true, winner: null, reason: '50수 동안 제거된 말이 없어요' };
  const key = board.join('') + turn + state.remove;
  if ((state.reps[key] || 0) >= 3) return { over: true, draw: true, winner: null, reason: '같은 국면이 세 번 나왔어요' };
  return { over: false };
}

function evaluate(state, seat) {
  const b = state.board;
  const opp = 1 - seat;
  let s = (countOf(b, seat) + state.hand[seat] - countOf(b, opp) - state.hand[opp]) * 100;
  let mob = 0, mills = 0, twos = 0;
  for (const m of MILLS) {
    const mine = m.filter((p) => b[p] === seat).length, theirs = m.filter((p) => b[p] === opp).length;
    if (mine === 3) mills++; else if (theirs === 3) mills--;
    if (mine === 2 && theirs === 0) twos++; else if (theirs === 2 && mine === 0) twos--;
  }
  for (let i = 0; i < 24; i++) if (b[i] >= 0) for (const t of ADJ[i]) if (b[t] === -1) mob += b[i] === seat ? 1 : -1;
  if (state.remove === seat) s += 60; else if (state.remove === opp) s -= 60;
  return s + mills * 25 + twos * 10 + mob * 4;
}

const rulesForSearch = { legalMoves, apply, status };
const order = (state, moves) => moves.slice().sort((a, b) => (b.remove != null ? 1 : 0) - (a.remove != null ? 1 : 0));
export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 2, timeMs: 300, randomness: 0.6, rng, orderMoves: order });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 4, timeMs: 900, randomness: 0.05, rng, orderMoves: order });
  return alphabeta(rulesForSearch, state, evaluate, { depth: 7, timeMs: 2200, rng, orderMoves: order });
}
