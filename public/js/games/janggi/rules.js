// 장기 규칙 + 봇 (진형 선택, 궁성 대각선, 포 넘기, 빅장, 한 수 쉬기 포함)
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'janggi',
  name: '장기',
  description: '초(楚)와 한(漢)의 대결. 차·포·마·상·사·졸을 움직여 상대 궁(장)을 외통으로 몰면 승리해요. 시작할 때 마·상 진형을 고를 수 있어요.',
  seatNames: () => ['초 (楚)', '한 (漢)'],
  options: [],
  undo: true,
  testGames: 6,
  testAiEvery: 45,
  extraActions: [{ id: 'pass', label: '한 수 쉬기' }],
  rules: `## 목표
상대의 궁(장)이 공격받고 있는데(장군) 피할 방법이 없으면 외통, 승리예요.

## 시작
- 한(漢)이 먼저 마·상 진형을 고르고, 초(楚)가 고른 뒤 초부터 둬요.
- 진형은 마상마상, 상마상마, 마상상마, 상마마상 네 가지예요.

## 말의 움직임
- **궁·사**: 궁성 안에서만 한 칸. 궁성의 대각선 위에서는 대각선으로도 움직여요.
- **차**: 가로·세로로 원하는 만큼. 궁성 안에서는 대각선으로도 가요.
- **포**: 가로·세로로 다른 말을 딱 하나 넘어서 움직여요. 포를 넘거나 포를 잡을 수는 없어요.
- **마**: 한 칸 직진 후 대각선 한 칸(日자). 직진하는 첫 칸이 막혀 있으면 못 가요.
- **상**: 한 칸 직진 후 대각선 두 칸(用자). 지나는 두 칸이 막혀 있으면 못 가요.
- **졸·병**: 앞이나 옆으로 한 칸. 상대 궁성 안 대각선 위에서는 대각선 앞으로도 가요. 뒤로는 못 가요.

## 특수 규칙
- **장군**: 상대 궁을 공격하면 장군! 상대는 반드시 피해야 해요.
- **빅장**: 두 궁이 같은 줄에서 마주 보면 빅장. 차례인 쪽이 피하지 않고 한 수 쉬면 무승부예요.
- **한 수 쉬기**: 장군이 아닐 때는 차례를 넘길 수 있어요.
- 같은 국면이 세 번 나오거나, 서로 연속으로 쉬면 무승부예요.

## 점수
차 13, 포 7, 마 5, 상 3, 사 3, 졸 2점이에요. 참고용으로 표시돼요.`,
};

const ROWS = 10, COLS = 9;
const G = 1, A = 2, E = 3, H = 4, R = 5, C = 6, S = 7;
const colorOf = (p) => (p > 8 ? 1 : p > 0 ? 0 : -1);
const typeOf = (p) => p & 7;
const mk = (t, color) => t + color * 8;
const VAL = [0, 0, 3, 3, 5, 13, 7, 2];
const SETUPS = { msms: [H, E, H, E], smsm: [E, H, E, H], mssm: [H, E, E, H], smms: [E, H, H, E] };
export const SETUP_NAMES = { msms: '마상마상', smsm: '상마상마', mssm: '마상상마', smms: '상마마상' };
const idx = (r, c) => r * COLS + c;
const inb = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

// 궁성: color 0 (초) 아래쪽 7~9행, color 1 (한) 위쪽 0~2행, 열 3~5
const inPalace = (r, c, color) => c >= 3 && c <= 5 && (color === 0 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const anyPalace = (r, c) => c >= 3 && c <= 5 && ((r >= 7 && r <= 9) || (r >= 0 && r <= 2));
const palaceCenter = (r, c) => (r === 8 || r === 1) && c === 4;
const palaceCorner = (r, c) => (c === 3 || c === 5) && (r === 7 || r === 9 || r === 0 || r === 2);
// 궁성 대각선으로 연결된 두 점인가
function diagLinked(r1, c1, r2, c2) {
  if (!anyPalace(r1, c1) || !anyPalace(r2, c2)) return false;
  if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) return false;
  return (palaceCenter(r1, c1) && palaceCorner(r2, c2)) || (palaceCorner(r1, c1) && palaceCenter(r2, c2));
}

export function init(options, seed) {
  return { turn: 1, phase: 'setup', setups: [null, null], board: Array(90).fill(0), last: null, half: 0, reps: {}, passes: 0, rng: seed | 0, check: false, facing: false, facingDraw: false };
}

function placeSetup(board, color, key) {
  const arr = SETUPS[key];
  const row = color === 0 ? 9 : 0;
  const order = color === 0 ? arr : arr.slice().reverse();
  const officers = [R, order[0], order[1], A, 0, A, order[2], order[3], R];
  for (let c = 0; c < 9; c++) if (officers[c]) board[idx(row, c)] = mk(officers[c], color);
  board[idx(color === 0 ? 8 : 1, 4)] = mk(G, color);
  const cRow = color === 0 ? 7 : 2, sRow = color === 0 ? 6 : 3;
  board[idx(cRow, 1)] = mk(C, color); board[idx(cRow, 7)] = mk(C, color);
  for (const c of [0, 2, 4, 6, 8]) board[idx(sRow, c)] = mk(S, color);
}

function pseudoMoves(state, color, onlyCaptures = false) {
  const { board } = state;
  const out = [];
  const add = (from, to) => { const t = board[to]; if (t && colorOf(t) === color) return; if (onlyCaptures && !t) return; out.push({ from, to }); };
  for (let from = 0; from < 90; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== color) continue;
    const t = typeOf(p), r = (from / COLS) | 0, c = from % COLS;
    if (t === G || t === A) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (inPalace(rr, cc, color)) add(from, idx(rr, cc)); }
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) { const rr = r + dr, cc = c + dc; if (inPalace(rr, cc, color) && diagLinked(r, c, rr, cc)) add(from, idx(rr, cc)); }
    } else if (t === R) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc)) { add(from, idx(rr, cc)); if (board[idx(rr, cc)]) break; rr += dr; cc += dc; }
      }
      if (anyPalace(r, c)) {
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          let pr = r, pc = c, rr = r + dr, cc = c + dc;
          while (inb(rr, cc) && diagLinked(pr, pc, rr, cc)) { add(from, idx(rr, cc)); if (board[idx(rr, cc)]) break; pr = rr; pc = cc; rr += dr; cc += dc; }
        }
      }
    } else if (t === C) {
      const scan = (steps) => {
        // steps: 순서대로 지나갈 칸 목록
        let screen = false;
        for (const [rr, cc] of steps) {
          const q = board[idx(rr, cc)];
          if (!screen) { if (q) { if (typeOf(q) === C) break; screen = true; } continue; }
          if (!q) { if (!onlyCaptures) out.push({ from, to: idx(rr, cc) }); continue; }
          if (colorOf(q) !== color && typeOf(q) !== C) out.push({ from, to: idx(rr, cc) });
          break;
        }
      };
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const steps = []; let rr = r + dr, cc = c + dc;
        while (inb(rr, cc)) { steps.push([rr, cc]); rr += dr; cc += dc; }
        scan(steps);
      }
      if (palaceCorner(r, c)) {
        const cr = r <= 2 ? 1 : 8, cc2 = 4;
        const or = cr + (cr - r), oc = cc2 + (cc2 - c);
        scan([[cr, cc2], [or, oc]]);
      }
    } else if (t === H) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const lr = r + dr, lc = c + dc;
        if (!inb(lr, lc) || board[idx(lr, lc)]) continue;
        const targets = dc === 0 ? [[r + 2 * dr, c - 1], [r + 2 * dr, c + 1]] : [[r - 1, c + 2 * dc], [r + 1, c + 2 * dc]];
        for (const [rr, cc] of targets) if (inb(rr, cc)) add(from, idx(rr, cc));
      }
    } else if (t === E) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const lr = r + dr, lc = c + dc;
        if (!inb(lr, lc) || board[idx(lr, lc)]) continue;
        const legs = dc === 0 ? [[[r + 2 * dr, c - 1], [r + 3 * dr, c - 2]], [[r + 2 * dr, c + 1], [r + 3 * dr, c + 2]]] : [[[r - 1, c + 2 * dc], [r - 2, c + 3 * dc]], [[r + 1, c + 2 * dc], [r + 2, c + 3 * dc]]];
        for (const [[l2r, l2c], [rr, cc]] of legs) { if (!inb(rr, cc) || !inb(l2r, l2c) || board[idx(l2r, l2c)]) continue; add(from, idx(rr, cc)); }
      }
    } else if (t === S) {
      const fwd = color === 0 ? -1 : 1;
      for (const [dr, dc] of [[fwd, 0], [0, -1], [0, 1]]) { const rr = r + dr, cc = c + dc; if (inb(rr, cc)) add(from, idx(rr, cc)); }
      // 상대 궁성 대각선
      for (const dc of [-1, 1]) { const rr = r + fwd, cc = c + dc; if (inb(rr, cc) && inPalace(rr, cc, 1 - color) && anyPalace(r, c) && diagLinked(r, c, rr, cc)) add(from, idx(rr, cc)); }
    }
  }
  return out;
}

function generalSq(board, color) { const g = mk(G, color); for (let i = 0; i < 90; i++) if (board[i] === g) return i; return -1; }

function attackedBy(state, sq, color) {
  for (const m of pseudoMoves(state, color, true)) if (m.to === sq) return true;
  return false;
}

export function inCheck(state, color = state.turn) {
  const g = generalSq(state.board, color);
  return g >= 0 && attackedBy(state, g, 1 - color);
}

function isFacing(board) {
  const g0 = generalSq(board, 0), g1 = generalSq(board, 1);
  if (g0 < 0 || g1 < 0) return false;
  if (g0 % COLS !== g1 % COLS) return false;
  const c = g0 % COLS;
  const r1 = Math.min((g0 / COLS) | 0, (g1 / COLS) | 0), r2 = Math.max((g0 / COLS) | 0, (g1 / COLS) | 0);
  for (let r = r1 + 1; r < r2; r++) if (board[idx(r, c)]) return false;
  return true;
}

function posKey(s) { return s.board.join(',') + '|' + s.turn; }

function makeMove(state, m) {
  const board = state.board.slice();
  const captured = board[m.to];
  board[m.to] = board[m.from]; board[m.from] = 0;
  const next = { ...state, turn: 1 - state.turn, board, last: { from: m.from, to: m.to }, half: captured ? 0 : state.half + 1, passes: 0, reps: captured ? {} : { ...state.reps }, check: false, facing: false };
  const key = posKey(next);
  next.reps[key] = (next.reps[key] || 0) + 1;
  return { next, captured };
}

export function legalMoves(state) {
  if (state.phase === 'setup') return Object.keys(SETUPS).map((k) => ({ setup: k }));
  if (state.facingDraw) return [];
  const out = [];
  const facing = state.facing;
  for (const m of pseudoMoves(state, state.turn)) {
    const { next } = makeMove(state, m);
    if (inCheck(next, state.turn)) continue;
    if (facing && isFacing(next.board)) continue; // 빅장은 반드시 피해야 함
    out.push(m);
  }
  if (!state.check) out.push({ pass: true });
  return out;
}

export function apply(state, m) {
  if (m.setup) {
    const board = state.board.slice();
    placeSetup(board, state.turn, m.setup);
    const setups = state.setups.slice(); setups[state.turn] = m.setup;
    const done = state.turn === 0;
    const next = { ...state, board, setups, turn: done ? 0 : 0, phase: done ? 'play' : 'setup' };
    if (!done) next.turn = 0; // 한 다음 초가 고른다
    if (done) { next.reps = { [posKey(next)]: 1 }; }
    return { state: next, events: [{ type: 'setup', seat: state.turn, key: m.setup }] };
  }
  if (m.pass) {
    const next = { ...state, turn: 1 - state.turn, passes: state.passes + 1, last: null, check: false };
    if (state.facing) next.facingDraw = true;
    next.facing = isFacing(next.board);
    next.check = inCheck(next);
    return { state: next, events: [{ type: 'pass', seat: state.turn }] };
  }
  const { next, captured } = makeMove(state, m);
  const events = [{ type: 'move', from: m.from, to: m.to, piece: state.board[m.from], seat: state.turn }];
  if (captured) events.push({ type: 'capture', at: m.to, piece: captured, seat: state.turn });
  next.check = inCheck(next);
  next.facing = isFacing(next.board);
  if (next.check) {
    const mate = legalMoves(next).length === 0;
    events.push({ type: mate ? 'mate' : 'check', seat: state.turn });
  } else if (next.facing) events.push({ type: 'facing', seat: state.turn });
  return { state: next, events };
}

export function status(state) {
  if (state.phase === 'setup') return { over: false };
  if (state.facingDraw) return { over: true, draw: true, winner: null, reason: '빅장을 받아들여 무승부예요' };
  if (state.passes >= 2) return { over: true, draw: true, winner: null, reason: '서로 한 수씩 쉬어 무승부예요' };
  if (state.check) {
    const moves = legalMoves(state);
    if (moves.length === 0) return { over: true, winner: 1 - state.turn, reason: '외통! 장군을 피할 수 없어요' };
  }
  if ((state.reps[posKey(state)] || 0) >= 3) return { over: true, draw: true, winner: null, reason: '같은 국면이 세 번 나왔어요' };
  if (state.half >= 200) return { over: true, draw: true, winner: null, reason: '200수 동안 잡힌 말이 없어 무승부예요' };
  return { over: false };
}

export function score(board, color) {
  let s = 0;
  for (const p of board) if (p && colorOf(p) === color) s += VAL[typeOf(p)];
  return color === 1 ? s + 1.5 : s;
}

// ---- 평가 ----
function evaluate(state, seat) {
  const b = state.board;
  let s = 0;
  for (let i = 0; i < 90; i++) {
    const p = b[i]; if (!p) continue;
    const t = typeOf(p), color = colorOf(p), r = (i / COLS) | 0, c = i % COLS;
    let v = VAL[t] * 10;
    if (t === S) { const adv = color === 0 ? 6 - r : r - 3; v += Math.max(0, adv) * 3 + (c >= 3 && c <= 5 ? 2 : 0); }
    else if (t === H || t === E) v += (c >= 2 && c <= 6 ? 2 : 0) + (color === 0 ? (9 - r) : r) * 0.5;
    else if (t === R) v += (color === 0 ? (9 - r) : r) * 0.4;
    else if (t === C) v += (r >= 3 && r <= 6 ? 3 : 0);
    s += color === seat ? v : -v;
  }
  if (state.check) s += state.turn === seat ? -6 : 6;
  return s + (seat === 1 ? 15 : -15);
}

const captures = (state) => pseudoMoves(state, state.turn, true).filter((m) => {
  const { next } = makeMove(state, m);
  return !inCheck(next, state.turn);
});
const order = (state, moves) => moves.slice().sort((a, b) => {
  const va = a.pass ? -100 : a.setup ? 0 : (state.board[a.to] ? VAL[typeOf(state.board[a.to])] * 10 - VAL[typeOf(state.board[a.from])] : 0);
  const vb = b.pass ? -100 : b.setup ? 0 : (state.board[b.to] ? VAL[typeOf(state.board[b.to])] * 10 - VAL[typeOf(state.board[b.from])] : 0);
  return vb - va;
});
const searchRules = { legalMoves: (s) => legalMoves(s).filter((m) => !m.pass || legalMoves(s).length === 1), apply, status };

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (state.phase === 'setup') return moves[rng.int(moves.length)];
  const nonPass = moves.filter((m) => !m.pass);
  if (!nonPass.length) return moves[0];
  if (level === 1) return alphabeta(searchRules, state, evaluate, { depth: 1, timeMs: 400, randomness: 0.5, rng, orderMoves: order, captures, qDepth: 2 });
  if (level === 2) return alphabeta(searchRules, state, evaluate, { depth: 2, timeMs: 1200, randomness: 0.05, rng, orderMoves: order, captures, qDepth: 4 });
  return alphabeta(searchRules, state, evaluate, { depth: 4, timeMs: 2600, rng, orderMoves: order, captures, qDepth: 4 });
}

export { colorOf, typeOf, VAL, G as GENERAL, ROWS, COLS };
