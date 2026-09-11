// 루도 규칙 + 봇 (2~4인)
import { makeRng, randInt } from '../../core/rng.js';

const CORNER_NAMES = ['빨강', '초록', '노랑', '파랑'];
const CORNER_COLORS = ['#ff5c5c', '#3ddc97', '#ffc247', '#4fa3ff'];
export const cornersFor = (n) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);

export const meta = {
  id: 'ludo',
  name: '루도',
  description: '주사위를 굴려 말 네 개를 출발점에서 한 바퀴 돌아 집으로 먼저 보내면 승리! 6이 나와야 출발하고, 상대 말을 잡으면 처음으로 돌려보내요.',
  seatNames: (n) => cornersFor(n).map((c) => CORNER_NAMES[c]),
  seatColors: (n) => cornersFor(n).map((c) => CORNER_COLORS[c]),
  playerCounts: [2, 3, 4],
  options: [],
  undo: false,
  resultDelay: 1200,
  rules: `## 목표
내 말 4개를 모두 한 바퀴 돌려 가운데 집까지 먼저 보내면 승리해요.

## 진행
- 차례가 되면 주사위를 굴려요. **6**이 나와야 말을 출발시킬 수 있어요.
- 주사위 눈만큼 말 하나를 골라 움직여요. 6이 나오면 한 번 더 굴려요(연속 세 번 6이면 차례가 넘어가요).
- 상대 말이 혼자 있는 칸에 도착하면 잡아서 출발점으로 돌려보내고, 한 번 더 굴려요.
- 별(★)이 있는 칸과 각 색의 출발 칸은 안전 지대라 잡히지 않아요.
- 집에는 **정확한 눈**으로만 들어갈 수 있어요.

## 팁
- 말을 하나만 앞세우지 말고 여러 개를 골고루 움직이면 잡힐 위험이 줄어요.
- 상대 말 바로 앞 1~6칸은 위험해요.`,
};

const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function init(options, seed, playerCount = 2) {
  const n = Math.max(2, Math.min(4, playerCount));
  return { turn: 0, n, corners: cornersFor(n), tokens: Array.from({ length: n }, () => [-1, -1, -1, -1]), dice: null, sixes: 0, last: null, rng: seed | 0, winner: -1, ranking: [] };
}

export const absOf = (state, seat, p) => (state.corners[seat] * 13 + p) % 52;

function movable(state, seat, d) {
  const out = [];
  state.tokens[seat].forEach((p, i) => {
    if (p === 56) return;
    if (p === -1) { if (d === 6) out.push(i); return; }
    if (p + d <= 56) out.push(i);
  });
  return out;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  if (state.dice == null) return [{ roll: true }];
  const ms = movable(state, state.turn, state.dice);
  if (!ms.length) return [{ pass: true }];
  // 같은 칸의 말들은 하나만 대표로
  const seen = new Set();
  return ms.filter((i) => { const p = state.tokens[state.turn][i]; const k = String(p); if (p !== -1 && seen.has(k)) return false; seen.add(k); return true; }).map((i) => ({ token: i }));
}

export function apply(state, m) {
  const seat = state.turn;
  const clone = () => ({ ...state, tokens: state.tokens.map((a) => a.slice()), ranking: state.ranking.slice() });
  if (m.roll) {
    const s = clone();
    const d = 1 + randInt(s, 6);
    s.dice = d;
    s.sixes = d === 6 ? s.sixes + 1 : 0;
    const events = [{ type: 'roll', seat, dice: d }];
    if (s.sixes >= 3) { events.push({ type: 'threeSixes', seat }); return { state: nextTurn(s, events), events }; }
    if (!movable(s, seat, d).length) { events.push({ type: 'noMove', seat }); return { state: nextTurn(s, events), events }; }
    return { state: s, events };
  }
  if (m.pass) { const s = clone(); const events = [{ type: 'noMove', seat }]; return { state: nextTurn(s, events), events }; }
  const s = clone();
  const d = s.dice;
  const from = s.tokens[seat][m.token];
  const to = from === -1 ? 0 : from + d;
  s.tokens[seat][m.token] = to;
  const events = [{ type: 'move', seat, token: m.token, from, to, dice: d }];
  let again = d === 6;
  if (to <= 50) {
    const abs = absOf(s, seat, to);
    if (!SAFE.has(abs)) {
      let captured = 0;
      s.tokens.forEach((arr, os) => { if (os === seat) return; arr.forEach((p, i) => { if (p >= 0 && p <= 50 && absOf(s, os, p) === abs) { s.tokens[os][i] = -1; captured++; } }); });
      if (captured) { again = true; events.push({ type: 'capture', seat, abs, count: captured }); }
    }
  } else if (to === 56) {
    events.push({ type: 'home', seat, token: m.token });
    again = true;
    if (s.tokens[seat].every((p) => p === 56)) {
      s.ranking.push(seat);
      s.winner = s.ranking[0];
      events.push({ type: 'win', seat });
      return { state: { ...s, dice: null }, events };
    }
  }
  s.last = { seat, token: m.token, to };
  s.dice = null;
  if (again) { events.push({ type: 'again', seat }); return { state: s, events }; }
  return { state: nextTurn(s, events), events };
}

function nextTurn(s, events) {
  s.dice = null; s.sixes = 0;
  s.turn = (s.turn + 1) % s.n;
  events.push({ type: 'nextTurn', seat: s.turn });
  return s;
}

export function status(state) {
  if (state.winner >= 0) return { over: true, winner: state.winner, reason: '말을 모두 집으로 보냈어요' };
  return { over: false };
}

function danger(state, seat, p) {
  if (p < 0 || p > 50) return 0;
  const abs = absOf(state, seat, p);
  if (SAFE.has(abs)) return 0;
  let d = 0;
  state.tokens.forEach((arr, os) => { if (os === seat) return; for (const q of arr) { if (q < 0 || q > 50) continue; const oa = absOf(state, os, q); const dist = (abs - oa + 52) % 52; if (dist >= 1 && dist <= 6) d += 1; } });
  return d;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves[0].roll || moves[0].pass) return moves[0];
  const seat = state.turn, d = state.dice;
  const scored = moves.map((m) => {
    const from = state.tokens[seat][m.token];
    const to = from === -1 ? 0 : from + d;
    let v = 0;
    if (to === 56) v += 50;
    else if (to > 50) v += 20 + to - 50; // 홈 진입로
    else {
      const abs = absOf(state, seat, to);
      let cap = 0;
      state.tokens.forEach((arr, os) => { if (os !== seat) arr.forEach((p) => { if (p >= 0 && p <= 50 && absOf(state, os, p) === abs) cap++; }); });
      if (!SAFE.has(abs)) v += cap * 40; else v += 8;
      v -= danger(state, seat, to) * 12;
      v += danger(state, seat, from) * 8; // 위험한 곳에서 벗어남
      if (from === -1) v += 15;
      v += to * 0.3;
    }
    return { m, v: v + rng.next() * (level === 1 ? 30 : level === 2 ? 8 : 1) };
  });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}

export { CORNER_COLORS, SAFE };
