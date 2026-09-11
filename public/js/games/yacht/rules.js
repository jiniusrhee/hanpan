// 야찌(요트 다이스) 규칙 + 봇 (1~4인, 12개 족보, 굴리기 3번)
import { makeRng, randInt } from '../../core/rng.js';

export const CATS = [
  { id: 'ones', name: '1', short: '1', upper: true, n: 1 },
  { id: 'twos', name: '2', short: '2', upper: true, n: 2 },
  { id: 'threes', name: '3', short: '3', upper: true, n: 3 },
  { id: 'fours', name: '4', short: '4', upper: true, n: 4 },
  { id: 'fives', name: '5', short: '5', upper: true, n: 5 },
  { id: 'sixes', name: '6', short: '6', upper: true, n: 6 },
  { id: 'choice', name: '초이스', desc: '주사위 합' },
  { id: 'four', name: '포카드', desc: '같은 눈 4개 · 합' },
  { id: 'full', name: '풀하우스', desc: '3개+2개 · 합' },
  { id: 'small', name: '스몰 스트레이트', desc: '4연속 · 15점' },
  { id: 'large', name: '라지 스트레이트', desc: '5연속 · 30점' },
  { id: 'yacht', name: '야찌', desc: '같은 눈 5개 · 50점' },
];
export const BONUS_AT = 63, BONUS = 35;

export const meta = {
  id: 'yacht',
  name: '야찌',
  description: '주사위 5개를 최대 세 번 굴려 족보를 완성해요. 12칸을 모두 채웠을 때 점수가 높은 사람이 승리! 혼자서 최고 기록에 도전할 수도 있어요.',
  seatNames: (n) => ['1번', '2번', '3번', '4번'].slice(0, n),
  playerCounts: [1, 2, 3, 4],
  options: [],
  undo: false,
  fit: false,
  bestHigher: true,
  resultDelay: 1000,
  rules: `## 목표
12개의 족보 칸을 모두 채웠을 때 총점이 가장 높은 사람이 승리해요.

## 진행
- 차례마다 주사위 5개를 굴려요. 마음에 드는 주사위는 눌러서 **고정**하고, 나머지만 다시 굴릴 수 있어요. 한 차례에 최대 3번 굴려요.
- 굴리기가 끝나면 족보 칸 하나를 골라 점수를 적어요. 조건이 안 맞아도 0점으로 채울 수 있어요(빈칸 채우기).

## 족보
- **1~6**: 해당 눈의 합. 여섯 칸 합이 63점 이상이면 보너스 +35!
- **초이스**: 주사위 합 그대로.
- **포카드**: 같은 눈 4개 이상이면 주사위 합.
- **풀하우스**: 같은 눈 3개 + 2개면 주사위 합.
- **스몰 스트레이트**: 4개가 연속(1234, 2345, 3456)이면 15점.
- **라지 스트레이트**: 5개가 연속이면 30점.
- **야찌**: 같은 눈 5개면 50점!

## 팁
- 상단 보너스(63점)를 노리려면 각 숫자를 3개씩은 채워야 해요.
- 초이스는 아깝게 실패한 높은 눈을 받아주는 안전망이에요.`,
};

export function init(options, seed, playerCount = 1) {
  const n = Math.max(1, Math.min(4, playerCount));
  return { turn: 0, n, dice: [0, 0, 0, 0, 0], rolls: 0, scores: Array.from({ length: n }, () => Array(CATS.length).fill(null)), round: 0, rng: seed | 0, over: false };
}

export function scoreFor(cat, dice) {
  const c = CATS[cat];
  const sum = dice.reduce((a, b) => a + b, 0);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  if (c.upper) return counts[c.n] * c.n;
  switch (c.id) {
    case 'choice': return sum;
    case 'four': return counts.some((k) => k >= 4) ? sum : 0;
    case 'full': return (counts.some((k) => k === 3) && counts.some((k) => k === 2)) || counts.some((k) => k === 5) ? sum : 0;
    case 'small': { const s = new Set(dice); return [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]].some((seq) => seq.every((v) => s.has(v))) ? 15 : 0; }
    case 'large': { const s = new Set(dice); return [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]].some((seq) => seq.every((v) => s.has(v))) ? 30 : 0; }
    case 'yacht': return counts.some((k) => k === 5) ? 50 : 0;
  }
  return 0;
}

export function totals(scores) {
  const upper = scores.slice(0, 6).reduce((a, b) => a + (b || 0), 0);
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  const lower = scores.slice(6).reduce((a, b) => a + (b || 0), 0);
  return { upper, bonus, lower, total: upper + bonus + lower };
}

export function legalMoves(state) {
  if (state.over) return [];
  const out = [];
  if (state.rolls < 3) {
    if (state.rolls === 0) out.push({ roll: true, held: [false, false, false, false, false] });
    else {
      // 고정 패턴 32가지 (봇/검증용). 사람은 isLegal로 검증
      for (let mask = 0; mask < 31; mask++) out.push({ roll: true, held: [0, 1, 2, 3, 4].map((i) => !!(mask & (1 << i))) });
    }
  }
  if (state.rolls > 0) state.scores[state.turn].forEach((v, i) => { if (v === null) out.push({ score: i }); });
  return out;
}

export function isLegal(state, m) {
  if (state.over) return false;
  if (m.roll) return state.rolls < 3 && Array.isArray(m.held) && m.held.length === 5 && (state.rolls > 0 || m.held.every((x) => !x)) && !m.held.every(Boolean);
  if (m.score != null) return state.rolls > 0 && state.scores[state.turn][m.score] === null;
  return false;
}

export function apply(state, m) {
  const seat = state.turn;
  if (m.roll) {
    const s = { ...state, dice: state.dice.slice() };
    const rolled = [];
    for (let i = 0; i < 5; i++) if (!m.held[i] || state.rolls === 0) { s.dice[i] = 1 + randInt(s, 6); rolled.push(i); }
    s.rolls = state.rolls + 1;
    const events = [{ type: 'roll', seat, dice: s.dice.slice(), rolled, rollNo: s.rolls }];
    if (scoreFor(11, s.dice) === 50) events.push({ type: 'yacht', seat });
    return { state: s, events };
  }
  const scores = state.scores.map((a) => a.slice());
  const val = scoreFor(m.score, state.dice);
  scores[seat][m.score] = val;
  const events = [{ type: 'score', seat, cat: m.score, value: val }];
  const before = totals(state.scores[seat]).bonus, after = totals(scores[seat]).bonus;
  if (after > before) events.push({ type: 'bonus', seat });
  let turn = (seat + 1) % state.n;
  let round = state.round + (turn === 0 ? 1 : 0);
  const over = round >= CATS.length;
  if (over) events.push({ type: 'end' });
  return { state: { ...state, scores, turn, round, rolls: 0, dice: over ? state.dice : [0, 0, 0, 0, 0], over }, events };
}

export function status(state) {
  if (!state.over) return { over: false };
  const t = state.scores.map((sc) => totals(sc).total);
  if (state.n === 1) return { over: true, winner: 0, score: t[0], scores: t, title: `${t[0]}점!`, reason: t[0] >= 250 ? '대단해요! 고수의 점수예요' : t[0] >= 200 ? '훌륭해요!' : '다음엔 더 높이 노려봐요' };
  const best = Math.max(...t);
  const ws = t.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  return { over: true, winner: ws.length === 1 ? ws[0] : null, draw: ws.length > 1, scores: t, reason: t.map((v, i) => `${i + 1}번 ${v}점`).join(' · ') };
}

// ---- 봇 ----
function bestScoreChoice(scores, dice, rollsLeft) {
  // 남은 칸 중 (점수 - 기대치) 가 가장 큰 칸
  const EXPECT = [2.1, 4.2, 6.3, 8.4, 10.5, 12.6, 22, 13, 18, 12, 10, 4.6];
  let best = -1, bestV = -Infinity;
  scores.forEach((v, i) => {
    if (v !== null) return;
    const sc = scoreFor(i, dice);
    let val = sc - EXPECT[i] * 0.85;
    if (i < 6) { const upperSum = scores.slice(0, 6).reduce((a, b) => a + (b || 0), 0); if (sc >= (i + 1) * 3) val += 6; if (upperSum + sc >= BONUS_AT) val += 20; }
    if (sc === 0) val -= i === 11 ? -8 : 4; // 야찌 칸을 0으로 버리는 건 손해가 적음
    if (val > bestV) { bestV = val; best = i; }
  });
  return { cat: best, v: bestV };
}

function heuristicHold(dice) {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) counts[d]++;
  const uniq = [...new Set(dice)].sort();
  // 4연속이 있으면 스트레이트 노림
  const runs = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
  for (const r of runs) { const have = r.filter((v) => uniq.includes(v)); if (have.length >= 3) { const keep = new Set(); return dice.map((d) => { if (r.includes(d) && !keep.has(d)) { keep.add(d); return true; } return false; }); } }
  let bestVal = 1, bestCnt = 0;
  for (let v = 6; v >= 1; v--) if (counts[v] > bestCnt) { bestCnt = counts[v]; bestVal = v; }
  return dice.map((d) => d === bestVal);
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const seat = state.turn;
  const scores = state.scores[seat];
  if (state.rolls === 0) return { roll: true, held: [false, false, false, false, false] };
  const dice = state.dice;
  const cur = bestScoreChoice(scores, dice, 3 - state.rolls);
  if (state.rolls >= 3) return { score: cur.cat };
  if (level === 1) {
    if (rng.next() < 0.4) return { score: cur.cat };
    return { roll: true, held: heuristicHold(dice) };
  }
  // 몬테카를로: 고정 패턴별 기대 점수
  const samples = level === 3 ? 60 : 25;
  let bestHold = null, bestV = cur.v + (level === 3 ? 1.5 : 3);
  for (let mask = 0; mask < 31; mask++) {
    const held = [0, 1, 2, 3, 4].map((i) => !!(mask & (1 << i)));
    let sum = 0;
    for (let k = 0; k < samples; k++) {
      const d = dice.map((v, i) => (held[i] ? v : 1 + rng.int(6)));
      sum += bestScoreChoice(scores, d, 2 - state.rolls).v;
    }
    const v = sum / samples;
    if (v > bestV) { bestV = v; bestHold = held; }
  }
  if (!bestHold) return { score: cur.cat };
  return { roll: true, held: bestHold };
}
