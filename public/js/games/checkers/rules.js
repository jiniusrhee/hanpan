// 체커(영국식 드래프츠) 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'checkers',
  name: '체커',
  description: '어두운 칸 위에서 대각선으로 움직이고, 상대 말을 뛰어넘어 잡아요. 잡을 수 있으면 반드시 잡아야 하고, 끝줄에 닿으면 왕이 돼요.',
  seatNames: () => ['빨강', '검정'],
  options: [],
  undo: true,
  rules: `## 목표
상대 말을 모두 잡거나, 상대가 움직일 수 없게 만들면 승리해요.

## 진행
- 빨강이 먼저 시작해요. 말은 어두운 칸에서만 대각선 앞으로 한 칸 움직여요.
- 바로 앞 대각선에 상대 말이 있고 그 너머가 비어 있으면 뛰어넘어 잡아요. 연속으로 잡을 수 있으면 계속 잡아요.
- **잡을 수 있으면 반드시 잡아야 해요.**
- 상대 끝줄에 도착하면 왕(킹)이 돼요. 왕은 앞뒤 대각선 모두 움직이고 잡을 수 있어요.
- 80수 동안 잡거나 승격한 말이 없거나, 같은 국면이 세 번 나오면 무승부예요.

## 팁
- 뒷줄 말을 남겨두면 상대가 왕이 되기 어려워요.
- 일부러 한 개를 내주고 두 개를 잡는 '2대1 교환'을 노려보세요.`,
};

const MAN = 1, KING = 2;
const colorOf = (p) => (p > 8 ? 1 : p > 0 ? 0 : -1);
const typeOf = (p) => p & 7;
const mk = (t, c) => t + c * 8;

export function init(options, seed) {
  const board = Array(64).fill(0);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 0) continue;
    if (r < 3) board[r * 8 + c] = mk(MAN, 1);
    else if (r > 4) board[r * 8 + c] = mk(MAN, 0);
  }
  return { turn: 0, board, last: null, quiet: 0, reps: {}, rng: seed | 0 };
}

function dirsFor(p) {
  const t = typeOf(p), color = colorOf(p);
  if (t === KING) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return color === 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function jumpsFrom(board, sq, p, path, caps, out) {
  const r = sq >> 3, c = sq & 7;
  let any = false;
  for (const [dr, dc] of dirsFor(p)) {
    const mr = r + dr, mc = c + dc, tr = r + 2 * dr, tc = c + 2 * dc;
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
    const mid = mr * 8 + mc, to = tr * 8 + tc;
    if (!board[mid] || colorOf(board[mid]) === colorOf(p) || caps.includes(mid)) continue;
    if (board[to] && to !== path[0]) continue;
    any = true;
    // 승격 칸에 닿으면 멈춘다
    const promote = typeOf(p) === MAN && (tr === 0 || tr === 7);
    if (promote) out.push({ from: path[0], to, path: [...path, to], caps: [...caps, mid] });
    else jumpsFrom(board, to, p, [...path, to], [...caps, mid], out);
  }
  if (!any && caps.length) out.push({ from: path[0], to: sq, path, caps });
}

export function legalMoves(state) {
  const { board, turn } = state;
  const jumps = [], steps = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    jumpsFrom(board, sq, p, [sq], [], jumps);
    if (jumps.length) continue;
    const r = sq >> 3, c = sq & 7;
    for (const [dr, dc] of dirsFor(p)) {
      const tr = r + dr, tc = c + dc;
      if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
      const to = tr * 8 + tc;
      if (!board[to]) steps.push({ from: sq, to, path: [sq, to], caps: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

export function apply(state, m) {
  const board = state.board.slice();
  const p = board[m.from];
  board[m.from] = 0;
  for (const c of m.caps) board[c] = 0;
  let np = p;
  const tr = m.to >> 3;
  const promoted = typeOf(p) === MAN && (tr === 0 || tr === 7);
  if (promoted) np = mk(KING, colorOf(p));
  board[m.to] = np;
  const irreversible = m.caps.length > 0 || promoted;
  const next = { turn: 1 - state.turn, board, last: m, quiet: irreversible ? 0 : state.quiet + 1, reps: irreversible ? {} : { ...state.reps }, rng: state.rng };
  const key = board.join(',') + '|' + next.turn;   // 킹(10)이 두 자리라 구분자 없이 이으면 다른 국면이 겹친다
  next.reps[key] = (next.reps[key] || 0) + 1;
  const events = [{ type: 'move', path: m.path, caps: m.caps, seat: state.turn, piece: p }];
  if (promoted) events.push({ type: 'promote', at: m.to });
  return { state: next, events };
}

export function status(state) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    const mine = state.board.filter((p) => p && colorOf(p) === state.turn).length;
    return { over: true, winner: 1 - state.turn, reason: mine === 0 ? '말을 모두 잡았어요' : '움직일 수 있는 말이 없어요' };
  }
  if (state.quiet >= 80) return { over: true, draw: true, winner: null, reason: '80수 동안 잡힌 말이 없어요' };
  const key = state.board.join(',') + '|' + state.turn;
  if ((state.reps[key] || 0) >= 3) return { over: true, draw: true, winner: null, reason: '같은 국면이 세 번 나왔어요' };
  return { over: false };
}

function evaluate(state, seat) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]; if (!p) continue;
    const r = i >> 3, c = i & 7, color = colorOf(p);
    let v = typeOf(p) === KING ? 175 : 100;
    if (typeOf(p) === MAN) v += color === 0 ? (7 - r) * 3 : r * 3;
    if ((color === 0 && r === 7) || (color === 1 && r === 0)) v += 6; // 뒷줄 수비
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4;
    s += color === seat ? v : -v;
  }
  return s;
}

const rulesForSearch = { legalMoves, apply, status };
const order = (state, moves) => moves.slice().sort((a, b) => b.caps.length - a.caps.length);

export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 2, timeMs: 300, randomness: 0.6, rng, orderMoves: order });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 5, timeMs: 900, randomness: 0.05, rng, orderMoves: order });
  return alphabeta(rulesForSearch, state, evaluate, { depth: 9, timeMs: 2200, rng, orderMoves: order });
}

export { colorOf, typeOf, KING, MAN };
