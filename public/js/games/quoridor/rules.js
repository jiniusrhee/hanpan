// 쿼리도 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'quoridor',
  name: '쿼리도',
  description: '9×9 판에서 내 말을 반대편 끝줄까지 먼저 보내면 승리! 매 턴 말을 움직이거나 벽(10개)을 놓아 상대의 길을 멀리 돌려요. 길을 완전히 막을 수는 없어요.',
  seatNames: () => ['파랑', '빨강'],
  options: [],
  undo: true,
  rules: `## 목표
내 말을 반대편 끝줄(파랑은 맨 위, 빨강은 맨 아래) 아무 칸에나 먼저 도착시키면 승리해요.

## 진행
- 파랑이 먼저 시작해요. 매 턴 **말 한 칸 이동** 또는 **벽 하나 놓기** 중 하나를 해요.
- 말은 가로·세로로 한 칸 움직여요. 상대 말이 바로 옆에 있으면 뛰어넘을 수 있고, 뒤가 막혀 있으면 대각선으로 갈 수 있어요.
- 벽은 두 칸 길이이고, 각자 10개씩 있어요. 벽끼리 겹치거나 교차할 수 없어요.
- **누구든 길이 완전히 막히는 벽은 놓을 수 없어요 (내 길도 포함).** 반드시 골까지 가는 길이 하나는 남아야 해요.

## 조작
- '이동' 모드에서 갈 수 있는 칸을 누르면 이동해요.
- '가로 벽' / '세로 벽' 모드에서 칸을 누르면 미리보기가 나오고, 한 번 더 누르면 놓아요.

## 팁
- 초반에는 말을 전진시키고, 벽은 상대가 가까워졌을 때 결정적으로 쓰는 게 좋아요.
- 벽은 내 길도 길게 만들어요. 남은 걸음 수를 비교해 보고 놓으세요.`,
};

const N = 9;
export function init(options, seed) {
  return { turn: 0, pawns: [[8, 4], [0, 4]], walls: [10, 10], hw: Array(64).fill(0), vw: Array(64).fill(0), last: null, rng: seed | 0 };
}

// (r,c)에서 방향(dr,dc)으로 한 칸 이동이 벽에 막히는가
export function blocked(state, r, c, dr, dc) {
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return true;
  if (dr === -1) return (c < 8 && state.hw[(r - 1) * 8 + c]) || (c > 0 && state.hw[(r - 1) * 8 + c - 1]);
  if (dr === 1) return (c < 8 && state.hw[r * 8 + c]) || (c > 0 && state.hw[r * 8 + c - 1]);
  if (dc === -1) return (r < 8 && state.vw[r * 8 + c - 1]) || (r > 0 && state.vw[(r - 1) * 8 + c - 1]);
  return (r < 8 && state.vw[r * 8 + c]) || (r > 0 && state.vw[(r - 1) * 8 + c]);
}

function pawnMoves(state, seat) {
  const [r, c] = state.pawns[seat];
  const [orr, oc] = state.pawns[1 - seat];
  const out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (blocked(state, r, c, dr, dc)) continue;
    const nr = r + dr, nc = c + dc;
    if (nr === orr && nc === oc) {
      // 뛰어넘기
      if (!blocked(state, nr, nc, dr, dc)) out.push({ type: 'move', r: nr + dr, c: nc + dc });
      else {
        for (const [sr, sc] of dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]) if (!blocked(state, nr, nc, sr, sc)) out.push({ type: 'move', r: nr + sr, c: nc + sc });
      }
    } else out.push({ type: 'move', r: nr, c: nc });
  }
  return out;
}

// BFS 최단 거리 (상대 말은 무시)
export function distance(state, seat) {
  const [sr, sc] = state.pawns[seat];
  const goal = seat === 0 ? 0 : 8;
  const dist = new Int16Array(81).fill(-1);
  const q = [sr * 9 + sc]; dist[sr * 9 + sc] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++]; const r = (cur / 9) | 0, c = cur % 9;
    if (r === goal) return dist[cur];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (blocked(state, r, c, dr, dc)) continue;
      const n = (r + dr) * 9 + c + dc;
      if (dist[n] < 0) { dist[n] = dist[cur] + 1; q.push(n); }
    }
  }
  return -1;
}

function wallOk(state, o, r, c) {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 7 || c < 0 || c > 7) return false;
  if (o === 'h') { if (state.hw[r * 8 + c] || (c > 0 && state.hw[r * 8 + c - 1]) || (c < 7 && state.hw[r * 8 + c + 1]) || state.vw[r * 8 + c]) return false; }
  else { if (state.vw[r * 8 + c] || (r > 0 && state.vw[(r - 1) * 8 + c]) || (r < 7 && state.vw[(r + 1) * 8 + c]) || state.hw[r * 8 + c]) return false; }
  const s = placeWall(state, o, r, c);
  return distance(s, 0) >= 0 && distance(s, 1) >= 0;
}

function placeWall(state, o, r, c) {
  const s = { ...state, hw: state.hw.slice(), vw: state.vw.slice() };
  if (o === 'h') s.hw[r * 8 + c] = 1; else s.vw[r * 8 + c] = 1;
  return s;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = pawnMoves(state, state.turn);
  if (state.walls[state.turn] > 0) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (wallOk(state, 'h', r, c)) out.push({ type: 'wall', o: 'h', r, c });
      if (wallOk(state, 'v', r, c)) out.push({ type: 'wall', o: 'v', r, c });
    }
  }
  return out;
}

export function isLegal(state, m) {
  if (!m || status(state).over) return false;
  if (m.type === 'move') return pawnMoves(state, state.turn).some((x) => x.r === m.r && x.c === m.c);
  if (m.type === 'wall') return state.walls[state.turn] > 0 && (m.o === 'h' || m.o === 'v') && wallOk(state, m.o, m.r, m.c);
  return false;
}

export function apply(state, m) {
  if (m.type === 'move') {
    const pawns = state.pawns.map((p) => p.slice());
    const from = pawns[state.turn].slice();
    pawns[state.turn] = [m.r, m.c];
    const next = { ...state, pawns, turn: 1 - state.turn, last: m };
    const goal = state.turn === 0 ? 0 : 8;
    const events = [{ type: 'move', seat: state.turn, from, to: [m.r, m.c] }];
    if (m.r === goal) events.push({ type: 'win', seat: state.turn });
    return { state: next, events };
  }
  const s = placeWall(state, m.o, m.r, m.c);
  const walls = state.walls.slice(); walls[state.turn]--;
  return { state: { ...s, walls, turn: 1 - state.turn, last: m }, events: [{ type: 'wall', seat: state.turn, o: m.o, r: m.r, c: m.c }] };
}

export function status(state) {
  if (state.pawns[0][0] === 0) return { over: true, winner: 0, reason: '맨 위에 도착했어요' };
  if (state.pawns[1][0] === 8) return { over: true, winner: 1, reason: '맨 아래에 도착했어요' };
  return { over: false };
}

function evaluate(state, seat) {
  const me = distance(state, seat), op = distance(state, 1 - seat);
  return (op - me) * 10 + (state.walls[seat] - state.walls[1 - seat]) * 2 + (state.turn === seat ? 3 : -3);
}

function candidates(state, k) {
  const seat = state.turn;
  const moves = pawnMoves(state, seat);
  const out = moves.map((m) => ({ m, v: evaluate(apply(state, m).state, seat) + 1 }));
  if (state.walls[seat] > 0) {
    const opBase = distance(state, 1 - seat);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const o of ['h', 'v']) {
      if (!wallOk(state, o, r, c)) continue;
      const s = placeWall(state, o, r, c);
      const op = distance(s, 1 - seat);
      if (op - opBase <= 0) continue; // 상대를 늦추지 않는 벽은 후보 제외
      out.push({ m: { type: 'wall', o, r, c }, v: (op - distance(s, seat)) * 10 - 2 });
    }
  }
  out.sort((a, b) => b.v - a.v);
  return out.slice(0, k).map((x) => x.m);
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const cands = candidates(state, level === 1 ? 4 : level === 2 ? 7 : 8);
  if (!cands.length) return legalMoves(state)[0] || null;
  if (level === 1) return cands[rng.int(Math.min(3, cands.length))];
  const searchRules = { legalMoves: (s) => candidates(s, level === 2 ? 5 : 7), apply, status };
  return alphabeta(searchRules, state, evaluate, { depth: level === 2 ? 2 : 3, timeMs: level === 2 ? 900 : 2200, rng }) || cands[0];
}
