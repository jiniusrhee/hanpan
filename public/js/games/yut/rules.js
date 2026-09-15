// 윷놀이 규칙 + 봇 (2~4인, 업기/잡기/지름길/빽도)
import { makeRng, nextRand } from '../../core/rng.js';

export const meta = {
  id: 'yut',
  name: '윷놀이',
  description: '윷가락 네 개를 던져 도·개·걸·윷·모! 말 네 개를 모두 먼저 집으로 돌려보내면 승리해요. 지름길, 업기, 잡기, 빽도까지 정식 규칙 그대로예요.',
  seatNames: (n) => ['파랑', '빨강', '초록', '노랑'].slice(0, n),
  playerCounts: [2, 3, 4],
  options: [
    { key: 'pieces', label: '말 개수', values: [{ value: 2, label: '2개' }, { value: 3, label: '3개' }, { value: 4, label: '4개' }], default: 4 },
  ],
  undo: false,
  resultDelay: 1200,
  rules: `## 목표
내 말을 모두 출발점에서 한 바퀴 돌려 먼저 집(도착)으로 보내면 승리해요.

## 윷 던지기
- 윷가락 4개를 던져요. 등(둥근 면)이 아닌 배(평평한 면)가 위로 온 개수로 결과가 정해져요.
- **도** 1칸, **개** 2칸, **걸** 3칸, **윷** 4칸, **모** 5칸.
- 윷이나 모가 나오면 **한 번 더** 던져요.
- 배가 하나만 나왔는데 그게 표시된 윷가락이면 **빽도**! 지나온 길을 **정확히 한 칸** 되돌아가요. (움직일 말이 없으면 그냥 넘어가요.)

## 말 움직이기
- 던진 결과마다 어떤 말을 움직일지 골라요. 새 말을 꺼낼 수도 있어요.
- 모서리(위 오른쪽, 위 왼쪽)나 가운데에 **정확히 멈추면** 다음부터 지름길로 갈 수 있어요.
- 내 말이 있는 칸에 도착하면 **업어서** 함께 움직여요.
- 상대 말이 있는 칸에 도착하면 **잡아서** 출발점으로 돌려보내고, 한 번 더 던져요.
- 도착점을 지나면 그 말은 완주예요.

## 팁
- 잡히기 쉬운 자리(상대 말 바로 앞 1~5칸)는 피하세요.
- 업으면 빨리 가지만, 잡히면 한꺼번에 잃어요!`,
};

// 노드: 0~19 바깥 둘레(0 출발, 5·10·15 모서리), 20·21 (5→중앙), 22 중앙, 23·24 (중앙→15), 25·26 (10→중앙), 27·28 (중앙→도착)
export const NODE_XY = [];
for (let k = 0; k < 5; k++) NODE_XY.push([6, 6 - 1.2 * k]);      // 0..4 오른쪽 변 (아래→위)
for (let k = 0; k < 5; k++) NODE_XY.push([6 - 1.2 * k, 0]);      // 5..9 위쪽 변 (오른쪽→왼쪽)
for (let k = 0; k < 5; k++) NODE_XY.push([0, 1.2 * k]);          // 10..14 왼쪽 변 (위→아래)
for (let k = 0; k < 5; k++) NODE_XY.push([1.2 * k, 6]);          // 15..19 아래쪽 변 (왼쪽→오른쪽)
NODE_XY.push([5, 1], [4, 2], [3, 3], [2, 4], [1, 5], [1, 1], [2, 2], [4, 4], [5, 5]);
export const FINISH = 99;
export const ROUTES = {
  O: [...Array.from({ length: 20 }, (_, i) => i), FINISH],
  A: [5, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19, FINISH],
  B: [10, 25, 26, 22, 27, 28, FINISH],
  C: [22, 27, 28, FINISH],
};
export const NAMES = { 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모', '-1': '빽도' };

export function init(options, seed, playerCount = 2) {
  const n = Math.max(2, Math.min(4, playerCount));
  const per = options.pieces || 4;
  return {
    turn: 0, n, per,
    tokens: Array.from({ length: n }, () => Array.from({ length: per }, () => ({ pos: -1, route: 'O', idx: 0 }))),
    throws: 1, pending: [], lastThrow: null, last: null, rng: seed | 0, winner: -1,
  };
}

// 지름길 시작점에서 빽도로 한 칸 뒤로 갔을 때 되돌아가는 자리 (들어온 길로 되돌아간다)
const BACK_FROM_START = { A: { route: 'O', idx: 4 }, B: { route: 'O', idx: 9 }, C: { route: 'A', idx: 2 } };

// 모서리·가운데에 멈추면 지름길을 탄다 (앞으로 갔든 빽도로 물러났든 똑같이 적용)
function rest(pos, route, idx) {
  if (pos === 5 && route === 'O') return { pos, route: 'A', idx: 0 };
  if (pos === 10 && route === 'O') return { pos, route: 'B', idx: 0 };
  if (pos === 22 && route === 'A') return { pos, route: 'C', idx: 0 };
  return { pos, route, idx };
}

// 토큰이 결과 r만큼 움직였을 때의 새 상태 (없으면 null)
function advance(tok, r) {
  if (tok.pos === FINISH) return null;
  if (r === -1) {
    // 빽도: 지나온 길을 따라 정확히 한 칸만 뒤로 간다
    if (tok.pos === -1) return null;                 // 대기 중인 말은 빽도로 꺼낼 수 없다
    if (tok.idx > 0) { const idx = tok.idx - 1; return rest(ROUTES[tok.route][idx], tok.route, idx); }
    const b = BACK_FROM_START[tok.route];
    if (!b) return null;                             // 출발점(바깥 둘레 0번)보다 뒤로는 갈 수 없다
    return rest(ROUTES[b.route][b.idx], b.route, b.idx);
  }
  let route = tok.route, idx = tok.idx;
  if (tok.pos === -1) { route = 'O'; idx = 0; }
  const path = ROUTES[route];
  idx += r;
  if (idx >= path.length - 1) return { pos: FINISH, route, idx: path.length - 1 };
  return rest(path[idx], route, idx);
}

// 표시용: r만큼 움직였을 때 도착하는 칸 (뷰가 같은 계산을 중복하지 않도록 내보낸다)
export function destOf(tok, r) { const nt = advance(tok, r); return nt ? nt.pos : null; }

// 이동 중 지나가는 노드 목록 (애니메이션용)
function pathOf(tok, r) {
  if (r === -1) { const nt = advance(tok, -1); return nt ? [nt.pos] : []; }
  let route = tok.route, idx = tok.idx;
  const out = [];
  if (tok.pos === -1) { route = 'O'; idx = 0; }
  const p = ROUTES[route];
  for (let k = 1; k <= r; k++) { const j = idx + k; if (j >= p.length - 1) { out.push(FINISH); break; } out.push(p[j]); }
  return out;
}

function tokenMoves(state, seat) {
  const out = [];
  const seen = new Set();
  state.pending.forEach((r, pi) => {
    state.tokens[seat].forEach((tok, ti) => {
      if (tok.pos === FINISH) return;
      const nt = advance(tok, r);
      if (!nt) return;
      // 같은 칸의 말은(노선이 달라도 남은 칸수가 같다) 한 묶음, 대기 중인 말도 서로 구별할 필요가 없다
      const key = `${pi}:${tok.pos}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ token: ti, result: pi });
    });
  });
  return out;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  if (state.throws > 0) return [{ throw: true }];
  if (state.pending.length === 0) return [];
  const moves = tokenMoves(state, state.turn);
  if (moves.length === 0) return [{ skip: true }];
  // 쓸 수 없는 결과가 섞여 있으면 그것만 버릴 수도 있게
  const usable = new Set(moves.map((m) => m.result));
  state.pending.forEach((r, pi) => { if (!usable.has(pi)) moves.push({ discard: pi }); });
  return moves;
}

function throwSticks(state) {
  let flats = 0, marked = false;
  const sticks = [];
  for (let i = 0; i < 4; i++) { const flat = nextRand(state) < 0.6; sticks.push(flat); if (flat) { flats++; if (i === 0) marked = true; } }
  let r;
  if (flats === 0) r = 5; else if (flats === 4) r = 4; else if (flats === 1) r = marked ? -1 : 1; else r = flats;
  return { r, sticks };
}

export function apply(state, m) {
  const seat = state.turn;
  const clone = (s) => ({ ...s, tokens: s.tokens.map((arr) => arr.map((t) => ({ ...t }))), pending: s.pending.slice() });
  if (m.throw) {
    const s = clone(state);
    const { r, sticks } = throwSticks(s);
    s.throws -= 1;
    s.pending.push(r);
    s.lastThrow = { r, sticks };
    if (r === 4 || r === 5) s.throws += 1;
    const events = [{ type: 'throw', seat, r, sticks, again: r === 4 || r === 5 }];
    return { state: endTurnIfDone(s, events), events };
  }
  if (m.skip) {
    const s = clone(state); s.pending = []; s.throws = 0;
    const events = [{ type: 'skip', seat }];
    return { state: endTurnIfDone(s, events), events };
  }
  if (m.discard != null) {
    const s = clone(state); s.pending.splice(m.discard, 1);
    const events = [{ type: 'discard', seat }];
    return { state: endTurnIfDone(s, events), events };
  }
  const s = clone(state);
  const r = s.pending[m.result];
  s.pending.splice(m.result, 1);
  const lead = s.tokens[seat][m.token];
  // 같은 칸에 있으면 업은 것: 노선 이름이 달라도 실제로 같은 자리이고 남은 칸수도 같으므로 함께 움직인다
  const group = lead.pos === -1 ? [m.token] : s.tokens[seat].map((t, i) => (t.pos === lead.pos && t.pos !== FINISH ? i : -1)).filter((i) => i >= 0);
  const nt = advance(lead, r);
  const events = [{ type: 'move', seat, tokens: group, from: lead.pos, to: nt.pos, r, path: pathOf(lead, r) }];
  for (const i of group) s.tokens[seat][i] = { ...nt };
  if (nt.pos !== FINISH && nt.pos !== -1) {
    // 잡기
    let captured = 0;
    s.tokens.forEach((arr, os) => { if (os === seat) return; arr.forEach((t, i) => { if (t.pos === nt.pos) { s.tokens[os][i] = { pos: -1, route: 'O', idx: 0 }; captured++; } }); });
    if (captured) { s.throws += 1; events.push({ type: 'capture', seat, at: nt.pos, count: captured }); }
    const stacked = group.length + s.tokens[seat].filter((t, i) => !group.includes(i) && t.pos === nt.pos).length;
    if (stacked > group.length) events.push({ type: 'stack', seat, at: nt.pos, count: stacked });
    if (nt.pos === 5 || nt.pos === 10 || nt.pos === 22) events.push({ type: 'shortcut', seat, at: nt.pos });
  } else if (nt.pos === FINISH) events.push({ type: 'finish', seat, count: group.length });
  s.last = { seat, to: nt.pos };
  if (s.tokens[seat].every((t) => t.pos === FINISH)) { s.winner = seat; events.push({ type: 'win', seat }); return { state: s, events }; }
  return { state: endTurnIfDone(s, events), events };
}

function endTurnIfDone(s, events) {
  if (s.throws > 0) return s;
  if (s.pending.length > 0) {
    // 남은 결과를 쓸 수 있는 말이 있으면 계속
    if (tokenMoves(s, s.turn).length > 0) return s;
    if (s.pending.some((r) => r !== -1) && s.tokens[s.turn].some((t) => t.pos !== FINISH)) return s;
    s.pending = [];
  }
  s.turn = (s.turn + 1) % s.n; s.throws = 1;
  events.push({ type: 'nextTurn', seat: s.turn });
  return s;
}

export function status(state) {
  if (state.winner >= 0) return { over: true, winner: state.winner, reason: '말을 모두 완주시켰어요' };
  return { over: false };
}

// ---- 봇 ----
function progressOf(tok) {
  if (tok.pos === FINISH) return 30;
  if (tok.pos === -1) return 0;
  const remaining = ROUTES[tok.route].length - 1 - tok.idx;
  return 30 - remaining;
}
function dangerAt(state, seat, pos) {
  // 상대 말이 1~5칸 뒤에 있으면 위험 (대략: 바깥 둘레 기준)
  if (pos === FINISH || pos === -1) return 0;
  let d = 0;
  state.tokens.forEach((arr, os) => { if (os === seat) return; for (const t of arr) { if (t.pos === -1 || t.pos === FINISH) continue; for (let k = 1; k <= 5; k++) { const nt = advance(t, k); if (nt && nt.pos === pos) { d += k <= 3 ? 3 : 1; break; } } } });
  return d;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves[0].throw || moves[0].skip) return moves[0];
  const seat = state.turn;
  const scored = moves.map((m) => {
    if (m.discard != null) return { m, v: -100 };
    const tok = state.tokens[seat][m.token];
    const r = state.pending[m.result];
    const nt = advance(tok, r);
    let v = 0;
    const group = tok.pos === -1 ? 1 : state.tokens[seat].filter((t) => t.pos === tok.pos).length;
    if (nt.pos === FINISH) v += 40 * group;
    else {
      const capt = state.tokens.reduce((acc, arr, os) => acc + (os === seat ? 0 : arr.filter((t) => t.pos === nt.pos).length), 0);
      v += capt * 35;
      const own = state.tokens[seat].filter((t, i) => i !== m.token && t.pos === nt.pos && t.pos !== -1).length;
      v += own ? 6 : 0;
      if (nt.pos === 5 || nt.pos === 10) v += 12; if (nt.pos === 22) v += 8;
      v -= dangerAt(state, seat, nt.pos) * 4 * group;
      v += (progressOf(nt) - progressOf(tok)) * 1.2;
      if (tok.pos === -1) v += 3;
    }
    return { m, v: v + rng.next() * (level === 1 ? 25 : level === 2 ? 6 : 1) };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}
