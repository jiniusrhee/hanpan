// 백개먼 규칙 + 봇 (더블링 큐브 없음)
import { makeRng, randInt } from '../../core/rng.js';

export const meta = {
  id: 'backgammon',
  name: '백개먼',
  description: '주사위 두 개를 굴려 말 15개를 내 홈으로 모은 뒤 먼저 모두 빼내면 승리해요. 혼자 있는 상대 말은 잡아서 처음으로 돌려보낼 수 있어요.',
  seatNames: () => ['흰색', '검정'],
  options: [],
  undo: false,
  testAiEvery: 5,
  rules: `## 목표
내 말 15개를 모두 내 홈 보드(마지막 6칸)로 모은 뒤, 판 밖으로 먼저 다 빼내면 승리해요.

## 진행
- 흰색은 시계 반대 방향(24 → 1), 검정은 그 반대로 움직여요.
- 차례가 되면 주사위 두 개를 굴려요. 각 주사위 눈만큼 말 하나를 움직이거나, 한 말을 두 번 움직여요. 같은 눈(더블)이 나오면 네 번 움직여요.
- 상대 말이 2개 이상 있는 칸에는 갈 수 없어요.
- 상대 말이 딱 1개 있는 칸(블롯)에 가면 그 말을 잡아 **바(bar)** 로 보내요.
- 바에 말이 있으면 먼저 그 말을 상대 홈 보드로 들여보내야 해요.
- **가능하면 두 주사위를 모두 써야 하고**, 하나만 쓸 수 있으면 큰 눈을 써야 해요.
- 말이 모두 홈 보드에 모이면 주사위 눈에 맞춰 밖으로 빼낼 수 있어요(베어링 오프).

## 조작
'주사위 굴리기'를 누른 뒤, 움직일 말이 있는 칸을 누르고 목적지를 누르세요. 남은 주사위는 위에 표시돼요.

## 팁
- 같은 칸에 말 2개 이상을 두면(포인트 만들기) 잡히지 않아요.
- 혼자 있는 말(블롯)은 상대 주사위 사정거리에 두지 마세요.`,
};

// 보드: 26칸. 1~24 포인트, 0 = 흰색 베어오프, 25 = 검정 베어오프. 값 >0 흰색 개수, <0 검정 개수.
export function init(options, seed) {
  const b = Array(26).fill(0);
  b[24] = 2; b[13] = 5; b[8] = 3; b[6] = 5;
  b[1] = -2; b[12] = -5; b[17] = -3; b[19] = -5;
  return { turn: 0, board: b, bar: [0, 0], off: [0, 0], dice: null, used: [], last: null, rng: seed | 0, noMove: false };
}

const sign = (seat) => (seat === 0 ? 1 : -1);
const homeOf = (seat, p) => (seat === 0 ? p >= 1 && p <= 6 : p >= 19 && p <= 24);

function allHome(s, seat) {
  if (s.bar[seat]) return false;
  for (let p = 1; p <= 24; p++) {
    const v = s.board[p];
    if (seat === 0 ? v > 0 && p > 6 : v < 0 && p < 19) return false;
  }
  return true;
}

// 한 주사위로 가능한 단일 이동 목록
function stepsWithDie(s, seat, die) {
  const out = [];
  const sg = sign(seat);
  const canLand = (p) => { const v = s.board[p] * sg; return v >= -1; };
  if (s.bar[seat] > 0) {
    const to = seat === 0 ? 25 - die : die;
    if (canLand(to)) out.push({ from: 'bar', to, die });
    return out;
  }
  const home = allHome(s, seat);
  for (let p = 1; p <= 24; p++) {
    if (s.board[p] * sg <= 0) continue;
    const to = p - sg * die;
    if (to >= 1 && to <= 24) { if (canLand(to)) out.push({ from: p, to, die }); }
    else if (home) {
      const dist = seat === 0 ? p : 25 - p;
      if (dist === die) out.push({ from: p, to: 'off', die });
      else if (die > dist) {
        // 더 뒤쪽에 말이 없을 때만 큰 눈으로 빼낼 수 있다
        let further = false;
        for (let q = 1; q <= 24; q++) { if (s.board[q] * sg > 0) { const d = seat === 0 ? q : 25 - q; if (d > dist) { further = true; break; } } }
        if (!further) out.push({ from: p, to: 'off', die });
      }
    }
  }
  return out;
}

function applyStep(s, seat, st) {
  const board = s.board.slice();
  const bar = s.bar.slice(), off = s.off.slice();
  const sg = sign(seat);
  let hit = false;
  if (st.from === 'bar') bar[seat]--; else board[st.from] -= sg;
  if (st.to === 'off') off[seat]++;
  else {
    if (board[st.to] * sg === -1) { board[st.to] = 0; bar[1 - seat]++; hit = true; }
    board[st.to] += sg;
  }
  return { ...s, board, bar, off, hit };
}

// 남은 주사위로 가능한 모든 시퀀스 (최대 길이 규칙 적용)
function sequences(s, seat, dice) {
  const results = [];
  const rec = (st, remaining, path) => {
    let any = false;
    const tried = new Set();
    for (let i = 0; i < remaining.length; i++) {
      const die = remaining[i];
      if (tried.has(die)) continue; tried.add(die);
      for (const step of stepsWithDie(st, seat, die)) {
        any = true;
        const rest = remaining.slice(); rest.splice(i, 1);
        rec(applyStep(st, seat, step), rest, [...path, step]);
      }
    }
    if (!any) results.push(path);
  };
  rec(s, dice, []);
  const maxLen = Math.max(0, ...results.map((p) => p.length));
  let best = results.filter((p) => p.length === maxLen);
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0], dice[1]);
    const withHi = best.filter((p) => p[0].die === hi);
    if (withHi.length) best = withHi;
  }
  return { seqs: best, maxLen };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  if (!state.dice) return [{ roll: true }];
  const { seqs, maxLen } = sequences(state, state.turn, state.dice);
  if (maxLen === 0) return [{ pass: true }];
  const seen = new Map();
  for (const p of seqs) { const st = p[0]; const k = `${st.from}>${st.to}:${st.die}`; if (!seen.has(k)) seen.set(k, { from: st.from, to: st.to, die: st.die }); }
  return [...seen.values()];
}

export function apply(state, m) {
  const seat = state.turn;
  if (m.roll) {
    const s = { ...state };
    const d1 = 1 + randInt(s, 6), d2 = 1 + randInt(s, 6);
    s.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    s.used = [];
    const { maxLen } = sequences(s, seat, s.dice);
    const events = [{ type: 'roll', dice: [d1, d2], seat }];
    if (maxLen === 0) { events.push({ type: 'noMoves', seat }); return { state: { ...s, dice: null, turn: 1 - seat, last: null }, events }; }
    return { state: s, events };
  }
  if (m.pass) return { state: { ...state, dice: null, turn: 1 - seat }, events: [{ type: 'noMoves', seat }] };
  const stepped = applyStep(state, seat, m);
  const dice = state.dice.slice();
  dice.splice(dice.indexOf(m.die), 1);
  const events = [{ type: 'move', from: m.from, to: m.to, seat, hit: stepped.hit, die: m.die }];
  let next = { ...stepped, dice, used: [...state.used, m.die], last: m };
  delete next.hit;
  if (next.off[seat] >= 15) { events.push({ type: 'win', seat }); return { state: { ...next, dice: null }, events }; }
  if (dice.length === 0 || sequences(next, seat, dice).maxLen === 0) { next = { ...next, dice: null, turn: 1 - seat }; if (dice.length) events.push({ type: 'noMoves', seat }); }
  return { state: next, events };
}

export function status(state) {
  if (state.off[0] >= 15) return { over: true, winner: 0, reason: '말을 모두 빼냈어요' };
  if (state.off[1] >= 15) return { over: true, winner: 1, reason: '말을 모두 빼냈어요' };
  return { over: false };
}

export function pipCount(s, seat) {
  let pips = s.bar[seat] * 25;
  for (let p = 1; p <= 24; p++) { const v = s.board[p] * sign(seat); if (v > 0) pips += v * (seat === 0 ? p : 25 - p); }
  return pips;
}

function evaluate(s, seat) {
  const opp = 1 - seat;
  let score = (pipCount(s, opp) - pipCount(s, seat)) * 1.0;
  const sg = sign(seat);
  for (let p = 1; p <= 24; p++) {
    const v = s.board[p] * sg;
    if (v === 1) {
      // 블롯: 상대 사정거리 안이면 위험
      let danger = 8;
      if (homeOf(seat, p)) danger += 6;
      score -= danger;
    } else if (v >= 2) { score += homeOf(seat, p) ? 6 : 3; if (v > 4) score -= (v - 4) * 1.5; }
    if (-v === 1) score += 4; // 상대 블롯
  }
  score += s.off[seat] * 12 - s.off[opp] * 12;
  score -= s.bar[seat] * 20; score += s.bar[opp] * 20;
  return score;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  if (moves[0].roll || moves[0].pass) return moves[0];
  const seat = state.turn;
  const { seqs } = sequences(state, seat, state.dice);
  let best = null, bestV = -Infinity;
  const scored = [];
  for (const seq of seqs) {
    let s = state;
    for (const st of seq) s = applyStep(s, seat, st);
    const v = evaluate(s, seat) + (level === 1 ? rng.next() * 30 : rng.next() * 0.5);
    scored.push({ seq, v });
    if (v > bestV) { bestV = v; best = seq; }
  }
  if (level === 2 && rng.next() < 0.2) { scored.sort((a, b) => b.v - a.v); best = scored[Math.min(scored.length - 1, 1)].seq; }
  const st = best[0];
  return { from: st.from, to: st.to, die: st.die };
}
