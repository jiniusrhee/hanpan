// 바둑 규칙 (9×9 / 13×13, 패, 자살수 금지, 두 번 패스로 종료, 지역 계가) + MCTS 봇
import { makeRng } from '../../core/rng.js';

export const meta = {
  id: 'go',
  name: '바둑',
  description: '교차점에 돌을 놓아 집을 짓고 상대 돌을 둘러싸 잡아요. 9줄·13줄 판으로 가볍게 즐기는 바둑이에요. 두 사람이 연달아 패스하면 자동으로 계가해요.',
  seatNames: () => ['흑', '백'],
  options: [
    { key: 'size', label: '판 크기', values: [{ value: 9, label: '9줄' }, { value: 13, label: '13줄' }], default: 9 },
  ],
  undo: true,
  extraActions: [{ id: 'pass', label: '패스' }],
  testGames: 6,
  testAiEvery: 30,
  rules: `## 목표
게임이 끝났을 때 내 돌과 내 집(내 돌로만 둘러싸인 빈 곳)을 합쳐 더 많으면 승리해요. 백은 덤(9줄 6.5집, 13줄 7.5집)을 받아요.

## 진행
- 흑이 먼저 시작해요. 빈 교차점 아무 곳에나 둘 수 있어요.
- 상대 돌(무리)의 숨자리(활로)를 모두 막으면 그 돌을 따내요.
- 내 돌이 바로 잡히는 자리(자살수)에는 둘 수 없어요. 단, 두면서 상대를 잡는 경우는 괜찮아요.
- **패**: 방금 따낸 자리를 바로 되따내는 건 안 돼요. 한 수 다른 곳에 둔 뒤에 가능해요.
- 둘 곳이 없거나 끝내고 싶으면 **패스**를 눌러요. 두 사람이 연달아 패스하면 게임이 끝나요.

## 계가
- 이 앱은 **내 돌 + 내가 둘러싼 빈 칸**을 세는 방식이에요(중국식 계가에 가까워요). 따낸 돌은 따로 더하지 않아요.
- 죽은 돌은 자동으로 판정하지 않으니, 끝내기 전에 상대의 죽은 돌은 직접 따내 주세요.
- 양쪽이 모두 접한 빈 칸(공배)은 누구 것도 아니에요. 끝내기 전에 메워 두면 깔끔해요.
- 너무 길어지면(판 크기의 세 배 수) 그 자리에서 계가해 끝내요.

## 팁
- 처음에는 귀(모서리) → 변 → 중앙 순서로 두는 게 효율적이에요.
- 내 돌이 두 개의 눈(집)을 가지면 절대 잡히지 않아요.`,
};

const NB = new Map();
function neighbors(size) {
  if (NB.has(size)) return NB.get(size);
  const arr = [];
  for (let i = 0; i < size * size; i++) {
    const r = (i / size) | 0, c = i % size, n = [];
    if (r > 0) n.push(i - size); if (r < size - 1) n.push(i + size); if (c > 0) n.push(i - 1); if (c < size - 1) n.push(i + 1);
    arr.push(n);
  }
  NB.set(size, arr);
  return arr;
}

export function init(options, seed) {
  const size = options.size || 9;
  return { turn: 0, size, board: Array(size * size).fill(-1), ko: -1, passes: 0, caps: [0, 0], last: null, moves: 0, rng: seed | 0, komi: size >= 13 ? 7.5 : 6.5 };
}

// ---- 빠른 판 조작 (배열을 직접 수정) ----
let stampArr = null, stampVal = 0;
function stamps(n) { if (!stampArr || stampArr.length < n) { stampArr = new Int32Array(n); stampVal = 0; } if (++stampVal > 2e9) { stampArr.fill(0); stampVal = 1; } return stampVal; }

// 그룹에 활로가 하나라도 있는가 (있으면 true). stack 재사용.
const stack = new Int32Array(400);
function hasLiberty(board, nb, i) {
  const color = board[i];
  const st = stamps(board.length);
  let sp = 0; stack[sp++] = i; stampArr[i] = st;
  while (sp > 0) {
    const p = stack[--sp];
    for (const q of nb[p]) {
      const v = board[q];
      if (v === -1) return true;
      if (v === color && stampArr[q] !== st) { stampArr[q] = st; stack[sp++] = q; }
    }
  }
  return false;
}

function removeGroup(board, nb, i, out) {
  const color = board[i];
  let sp = 0; stack[sp++] = i; board[i] = -1; out.push(i);
  while (sp > 0) {
    const p = stack[--sp];
    for (const q of nb[p]) if (board[q] === color) { board[q] = -1; out.push(q); stack[sp++] = q; }
  }
}

// 돌을 놓고 따낸 돌 목록을 돌려준다. 자살수면 원상복구 후 null.
function playInPlace(board, nb, i, color) {
  board[i] = color;
  const captured = [];
  const opp = 1 - color;
  for (const q of nb[i]) if (board[q] === opp && !hasLiberty(board, nb, q)) removeGroup(board, nb, q, captured);
  if (captured.length === 0 && !hasLiberty(board, nb, i)) { board[i] = -1; return null; }
  return captured;
}

function koAfter(board, nb, i, captured) {
  if (captured.length !== 1) return -1;
  // 놓은 돌이 외톨이고 활로가 딱 하나(따낸 자리)면 패
  const color = board[i];
  let libs = 0;
  for (const q of nb[i]) { if (board[q] === color) return -1; if (board[q] === -1) libs++; }
  return libs === 1 ? captured[0] : -1;
}

function isLegalPoint(board, nb, i, color, ko) {
  if (board[i] !== -1 || i === ko) return false;
  for (const q of nb[i]) if (board[q] === -1) return true;
  const copy = board.slice();
  return playInPlace(copy, nb, i, color) !== null;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const nb = neighbors(state.size);
  const out = [];
  for (let i = 0; i < state.board.length; i++) if (isLegalPoint(state.board, nb, i, state.turn, state.ko)) out.push({ i });
  out.push({ pass: true });
  return out;
}

export function apply(state, m) {
  if (m.pass) {
    return { state: { ...state, turn: 1 - state.turn, ko: -1, passes: state.passes + 1, last: null, moves: state.moves + 1 }, events: [{ type: 'pass', seat: state.turn }] };
  }
  const nb = neighbors(state.size);
  const board = state.board.slice();
  const captured = playInPlace(board, nb, m.i, state.turn);
  if (captured === null) throw new Error('자살수예요');
  const caps = state.caps.slice(); caps[state.turn] += captured.length;
  const next = { ...state, turn: 1 - state.turn, board, ko: koAfter(board, nb, m.i, captured), passes: 0, caps, last: m.i, moves: state.moves + 1 };
  const events = [{ type: 'place', i: m.i, seat: state.turn }];
  if (captured.length) events.push({ type: 'capture', cells: captured, seat: state.turn });
  return { state: next, events };
}

// 지역 계가: 돌 + 한 색으로만 둘러싸인 빈 곳
export function territory(board, size) {
  const nb = neighbors(size);
  const owner = new Array(board.length).fill(-1);
  const seen = new Uint8Array(board.length);
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== -1 || seen[i]) continue;
    const region = []; let touch = 0; let sp = 0; stack[sp++] = i; seen[i] = 1;
    while (sp > 0) { const p = stack[--sp]; region.push(p); for (const q of nb[p]) { if (board[q] === -1) { if (!seen[q]) { seen[q] = 1; stack[sp++] = q; } } else touch |= board[q] === 0 ? 1 : 2; } }
    const o = touch === 1 ? 0 : touch === 2 ? 1 : -1;
    for (const p of region) owner[p] = o;
  }
  return owner;
}

export function scoreOf(state) {
  const owner = territory(state.board, state.size);
  let b = 0, w = 0;
  for (let i = 0; i < state.board.length; i++) { if (state.board[i] === 0 || owner[i] === 0) b++; else if (state.board[i] === 1 || owner[i] === 1) w++; }
  return { black: b, white: w + state.komi, owner };
}

export function status(state) {
  if (state.passes >= 2 || state.moves >= state.size * state.size * 3) {
    const { black, white } = scoreOf(state);
    const winner = black > white ? 0 : 1;
    const diff = Math.abs(black - white);
    return { over: true, winner, scores: [black, white], reason: `${winner === 0 ? '흑' : '백'} ${diff}집 승 (흑 ${black} : 백 ${white}, 덤 ${state.komi})` };
  }
  return { over: false };
}

// ---- MCTS 봇 ----
function isEye(board, nb, size, i, color) {
  for (const q of nb[i]) if (board[q] !== color) return false;
  const r = (i / size) | 0, c = i % size;
  let opp = 0, total = 0;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
    total++;
    if (board[rr * size + cc] === 1 - color) opp++;
  }
  return total < 4 ? opp === 0 : opp <= 1;
}

function playout(board, nb, size, turn, ko, rng, maxMoves) {
  let passes = 0, moves = 0;
  const n = board.length;
  while (moves < maxMoves && passes < 2) {
    let played = -1;
    const start = rng.int(n);
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (board[i] !== -1 || i === ko || isEye(board, nb, size, i, turn)) continue;
      const copyNeeded = !nb[i].some((q) => board[q] === -1);
      if (copyNeeded) {
        const bak = board.slice();
        const cap = playInPlace(board, nb, i, turn);
        if (cap === null) { for (let z = 0; z < n; z++) board[z] = bak[z]; continue; }
        ko = koAfter(board, nb, i, cap);
      } else {
        const cap = playInPlace(board, nb, i, turn);
        ko = koAfter(board, nb, i, cap);
      }
      played = i; break;
    }
    if (played < 0) { passes++; ko = -1; } else passes = 0;
    turn = 1 - turn; moves++;
  }
  // 계가
  const owner = territory(board, size);
  let b = 0, w = 0;
  for (let i = 0; i < n; i++) { if (board[i] === 0 || owner[i] === 0) b++; else if (board[i] === 1 || owner[i] === 1) w++; }
  return { b, w };   // 주인 없는 공배가 있으면 b + w < 전체 이므로 둘 다 돌려준다
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const size = state.size, nb = neighbors(size);
  const timeMs = level === 1 ? 350 : level === 2 ? 1300 : 2600;
  const deadline = performance.now() + timeMs;
  const komi = state.komi;
  const rootMoves = legalMoves(state).filter((m) => !m.pass && !isEye(state.board, nb, size, m.i, state.turn));
  if (rootMoves.length === 0) return { pass: true };
  // 우선순위(사전 방문 수): 상대 돌/내 돌 근처, 3~4선
  const prior = (i) => {
    const r = (i / size) | 0, c = i % size;
    const edge = Math.min(r, c, size - 1 - r, size - 1 - c);
    let p = edge === 0 ? 0 : edge === 1 ? 1 : edge <= 3 ? 3 : 2;
    for (const q of nb[i]) if (state.board[q] !== -1) p += 2;
    return p;
  };
  const root = { n: 0, w: 0, children: rootMoves.map((m) => ({ m, n: prior(m.i), w: prior(m.i) * 0.5, board: null, ko: -1 })) };
  const me = state.turn;
  let it = 0;
  while ((it & 7) !== 0 || performance.now() < deadline) {
    it++;
    if (it > 20000) break;
    // 선택 (1단계 UCT)
    let best = null, bestV = -Infinity;
    const logN = Math.log(root.n + 2);
    for (const ch of root.children) {
      const v = ch.w / (ch.n + 1e-6) + 1.1 * Math.sqrt(logN / (ch.n + 1e-6));
      if (v > bestV) { bestV = v; best = ch; }
    }
    const board = state.board.slice();
    const cap = playInPlace(board, nb, best.m.i, me);
    if (cap === null) { best.n += 1000; continue; }
    const ko = koAfter(board, nb, best.m.i, cap);
    const { b: black, w: white } = playout(board, nb, size, 1 - me, ko, rng, size * size * 2);
    const blackWins = black > white + komi; // 흑 점수 > 백 점수(공배 제외 + 덤)
    const win = (me === 0) === blackWins ? 1 : 0;
    best.n++; best.w += win; root.n++; root.w += win;
    if ((it & 15) === 0 && performance.now() > deadline) break;
  }
  let pick = root.children[0];
  for (const ch of root.children) if (ch.n > pick.n) pick = ch;
  // 승률이 매우 낮고 판이 많이 진행됐으면 패스 (끝내기)
  if (state.moves > size * size && pick.w / pick.n < 0.05) return { pass: true };
  // 상대가 패스했고 내가 확실히 이기고 있으면 패스로 마무리
  if (state.passes === 1) {
    const { black, white } = scoreOf(state);
    if ((me === 0 && black > white) || (me === 1 && white > black)) return { pass: true };
  }
  return pick.m;
}
