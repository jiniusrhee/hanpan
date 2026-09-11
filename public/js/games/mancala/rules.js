// 만칼라(칼라) 규칙 + 봇
import { makeRng } from '../../core/rng.js';
import { alphabeta } from '../../core/ai.js';

export const meta = {
  id: 'mancala',
  name: '만칼라',
  description: '내 쪽 구덩이의 구슬을 집어 반시계 방향으로 하나씩 뿌려요. 마지막 구슬이 내 창고에 들어가면 한 번 더! 창고에 구슬을 더 많이 모으면 승리예요.',
  seatNames: () => ['아래쪽', '위쪽'],
  options: [
    { key: 'seeds', label: '구슬 수', values: [{ value: 3, label: '3개' }, { value: 4, label: '4개' }, { value: 5, label: '5개' }], default: 4 },
  ],
  undo: true,
  rules: `## 목표
게임이 끝났을 때 내 창고(큰 구덩이)에 구슬이 더 많으면 승리해요.

## 진행
- 내 쪽 구덩이 6개 중 하나를 고르면, 그 구슬을 전부 집어 반시계 방향으로 한 칸에 하나씩 뿌려요. 내 창고에는 넣지만 상대 창고는 건너뛰어요.
- 마지막 구슬이 **내 창고**에 들어가면 한 번 더 둬요.
- 마지막 구슬이 **내 쪽의 빈 구덩이**에 떨어지고 맞은편 상대 구덩이에 구슬이 있으면, 그 구슬과 내 구슬을 모두 내 창고로 가져와요.
- 한쪽의 구덩이가 모두 비면 게임이 끝나요. 남은 구슬은 그 쪽 주인의 창고로 들어가요.

## 팁
- 마지막 구슬이 정확히 창고에 들어가는 구덩이를 먼저 찾아보세요. 연속 턴이 승부를 가르니까요.
- 상대 쪽 구슬이 많은 구덩이의 맞은편을 비워두면 큰 포획 기회가 생겨요.`,
};

// 구덩이 배열: 0~5 아래(0번 좌석), 6 아래 창고, 7~12 위(1번 좌석), 13 위 창고
export function init(options, seed) {
  const n = options.seeds || 4;
  const pits = Array(14).fill(n);
  pits[6] = 0; pits[13] = 0;
  return { turn: 0, pits, last: null, rng: seed | 0 };
}

const store = (seat) => (seat === 0 ? 6 : 13);
const own = (seat, i) => (seat === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  const base = state.turn === 0 ? 0 : 7;
  for (let i = base; i < base + 6; i++) if (state.pits[i] > 0) out.push({ pit: i });
  return out;
}

export function apply(state, m) {
  const pits = state.pits.slice();
  const seat = state.turn;
  let seeds = pits[m.pit];
  pits[m.pit] = 0;
  let i = m.pit;
  const path = [];
  while (seeds > 0) {
    i = (i + 1) % 14;
    if (i === store(1 - seat)) continue;
    pits[i]++; seeds--; path.push(i);
  }
  const events = [{ type: 'sow', from: m.pit, path, seat }];
  let again = false;
  if (i === store(seat)) { again = true; events.push({ type: 'extra', seat }); }
  else if (own(seat, i) && pits[i] === 1) {
    const opp = 12 - i;
    if (pits[opp] > 0) {
      const got = pits[opp] + 1;
      pits[store(seat)] += got;
      pits[opp] = 0; pits[i] = 0;
      events.push({ type: 'capture', pit: i, opp, count: got, seat });
    }
  }
  // 한쪽이 비면 정리
  const sum = (a, b) => pits.slice(a, b).reduce((x, y) => x + y, 0);
  if (sum(0, 6) === 0 || sum(7, 13) === 0) {
    const s0 = sum(0, 6), s1 = sum(7, 13);
    for (let k = 0; k < 6; k++) pits[k] = 0;
    for (let k = 7; k < 13; k++) pits[k] = 0;
    pits[6] += s0; pits[13] += s1;
    events.push({ type: 'sweep', to0: s0, to1: s1 });
  }
  return { state: { turn: again ? seat : 1 - seat, pits, last: m.pit, rng: state.rng }, events };
}

export function status(state) {
  const p = state.pits;
  const side0 = p.slice(0, 6).reduce((a, b) => a + b, 0), side1 = p.slice(7, 13).reduce((a, b) => a + b, 0);
  if (side0 === 0 || side1 === 0) {
    const s0 = p[6] + side0, s1 = p[13] + side1;
    const winner = s0 > s1 ? 0 : s1 > s0 ? 1 : null;
    return { over: true, winner, draw: winner == null, scores: [s0, s1], reason: `${s0} : ${s1}` };
  }
  return { over: false };
}

function evaluate(state, seat) {
  const p = state.pits;
  const mine = seat === 0 ? p[6] : p[13], theirs = seat === 0 ? p[13] : p[6];
  const side = (s) => (s === 0 ? p.slice(0, 6) : p.slice(7, 13)).reduce((a, b) => a + b, 0);
  return (mine - theirs) * 10 + (side(seat) - side(1 - seat)) * 1.5;
}

const rulesForSearch = { legalMoves, apply, status };
export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return alphabeta(rulesForSearch, state, evaluate, { depth: 2, timeMs: 300, randomness: 0.6, rng });
  if (level === 2) return alphabeta(rulesForSearch, state, evaluate, { depth: 6, timeMs: 800, randomness: 0.05, rng });
  return alphabeta(rulesForSearch, state, evaluate, { depth: 12, timeMs: 1800, rng });
}
