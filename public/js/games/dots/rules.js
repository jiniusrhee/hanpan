// 점과 상자 규칙 + 봇
import { makeRng } from '../../core/rng.js';

export const meta = {
  id: 'dots',
  name: '점과 상자',
  description: '점과 점 사이에 선을 그어요. 네 변을 모두 그어 상자를 완성하면 내 것이 되고 한 번 더 그을 수 있어요. 상자를 더 많이 차지하면 승리!',
  seatNames: () => ['파랑', '빨강'],
  options: [
    { key: 'size', label: '판 크기', values: [{ value: 3, label: '3×3' }, { value: 4, label: '4×4' }, { value: 5, label: '5×5' }, { value: 6, label: '6×6' }], default: 4 },
  ],
  undo: true,
  rules: `## 목표
게임이 끝났을 때 내가 완성한 상자가 더 많으면 승리해요.

## 진행
- 파랑이 먼저 시작해요. 이웃한 두 점 사이에 선을 하나 그어요.
- 내가 그은 선으로 상자의 네 번째 변이 완성되면 그 상자는 내 것! 그리고 **한 번 더** 그어요.
- 모든 선이 다 그어지면 게임이 끝나요.

## 팁
- 세 번째 변을 그으면 상대에게 상자를 그냥 주는 거예요. 가능한 한 피하세요.
- 어쩔 수 없이 줘야 할 땐 가장 짧은 사슬(연결된 상자 묶음)을 내주세요.
- 고수는 긴 사슬의 마지막 두 상자를 일부러 남겨 상대에게 차례를 넘기는 '더블 크로스'를 써요.`,
};

export function init(options, seed) {
  const n = options.size || 4;
  return { turn: 0, n, h: Array((n + 1) * n).fill(0), v: Array(n * (n + 1)).fill(0), boxes: Array(n * n).fill(-1), scores: [0, 0], last: null, rng: seed | 0 };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  const out = [];
  state.h.forEach((x, i) => { if (!x) out.push({ t: 'h', i }); });
  state.v.forEach((x, i) => { if (!x) out.push({ t: 'v', i }); });
  return out;
}

function sides(state, r, c) {
  const n = state.n;
  return state.h[r * n + c] + state.h[(r + 1) * n + c] + state.v[r * (n + 1) + c] + state.v[r * (n + 1) + c + 1];
}

function boxesOf(n, m) {
  if (m.t === 'h') { const r = (m.i / n) | 0, c = m.i % n; const out = []; if (r > 0) out.push([r - 1, c]); if (r < n) out.push([r, c]); return out; }
  const r = (m.i / (n + 1)) | 0, c = m.i % (n + 1); const out = []; if (c > 0) out.push([r, c - 1]); if (c < n) out.push([r, c]); return out;
}

export function apply(state, m) {
  const n = state.n;
  const h = state.h.slice(), v = state.v.slice(), boxes = state.boxes.slice(), scores = state.scores.slice();
  if (m.t === 'h') h[m.i] = 1; else v[m.i] = 1;
  const tmp = { ...state, h, v };
  const done = [];
  for (const [r, c] of boxesOf(n, m)) if (sides(tmp, r, c) === 4 && boxes[r * n + c] === -1) { boxes[r * n + c] = state.turn; scores[state.turn]++; done.push(r * n + c); }
  const events = [{ type: 'line', t: m.t, i: m.i, seat: state.turn }];
  if (done.length) events.push({ type: 'box', boxes: done, seat: state.turn }, { type: 'extra', seat: state.turn });
  const over = boxes.every((b) => b >= 0);
  return { state: { ...state, h, v, boxes, scores, turn: done.length && !over ? state.turn : 1 - state.turn, last: m }, events };
}

export function status(state) {
  if (state.boxes.every((b) => b >= 0)) {
    const [a, b] = state.scores;
    const winner = a > b ? 0 : b > a ? 1 : null;
    return { over: true, winner, draw: winner == null, scores: [a, b], reason: `${a} : ${b}` };
  }
  return { over: false };
}

// 선을 그은 뒤 상대가 (탐욕적으로) 가져갈 수 있는 상자 수
function greedyTake(state) {
  let s = state, taken = 0, guard = 0;
  while (guard++ < 200) {
    const ms = legalMoves(s);
    const take = ms.find((m) => boxesOf(s.n, m).some(([r, c]) => sides(s, r, c) === 3 && s.boxes[r * s.n + c] === -1));
    if (!take) break;
    s = apply(s, take).state; taken++;
  }
  return taken;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const n = state.n;
  const taking = moves.filter((m) => boxesOf(n, m).some(([r, c]) => sides(state, r, c) === 3 && state.boxes[r * n + c] === -1));
  const safe = moves.filter((m) => !boxesOf(n, m).some(([r, c]) => sides(state, r, c) === 2));
  if (level === 1) {
    if (taking.length && rng.next() < 0.85) return rng.pick(taking);
    return rng.pick(safe.length && rng.next() < 0.7 ? safe : moves);
  }
  if (taking.length) {
    if (level === 3 && safe.length === 0) {
      // 더블 크로스: 남은 사슬이 길면 마지막 2칸을 남겨 상대에게 넘긴다 — 간단 버전: 다 먹었을 때 넘겨줄 사슬이 더 크면 그냥 다 먹는다
      const afterAll = (() => { let s = state, g = 0; while (g++ < 200) { const t = legalMoves(s).find((m) => boxesOf(n, m).some(([r, c]) => sides(s, r, c) === 3 && s.boxes[r * n + c] === -1)); if (!t) return s; s = apply(s, t).state; } return s; })();
      const safeAfter = legalMoves(afterAll).filter((m) => !boxesOf(n, m).some(([r, c]) => sides(afterAll, r, c) === 2));
      if (!safeAfter.length && legalMoves(afterAll).length > 0 && taking.length >= 2) {
        // 손해가 큰 경우 (다 먹고 나면 긴 사슬을 줘야 함): 하나만 남기고 넘기는 수를 찾는다
        const remaining = legalMoves(afterAll);
        const worst = Math.max(...remaining.map((m) => greedyTake(apply(afterAll, m).state)));
        if (worst >= 3) {
          // 지금 먹을 수 있는 상자 중 하나 대신, 사슬 끝을 남겨두는 '희생' 수: 먹지 않고 안전하지 않은 다른 선을 그어 두 칸을 넘김
          const give = moves.filter((m) => !taking.includes(m) && greedyTake(apply(state, m).state) <= 2);
          if (give.length) return rng.pick(give);
        }
      }
    }
    return rng.pick(taking);
  }
  if (safe.length) {
    if (level === 2) return rng.pick(safe);
    // 어려움: 안전한 수 중에서도 상대에게 안전한 수를 가장 적게 남기는 수
    const scored = safe.map((m) => { const s = apply(state, m).state; const oppSafe = legalMoves(s).filter((x) => !boxesOf(n, x).some(([r, c]) => sides(s, r, c) === 2)).length; return { m, v: -oppSafe + rng.next() * 0.5 }; });
    scored.sort((a, b) => b.v - a.v);
    return scored[0].m;
  }
  // 어쩔 수 없이 줘야 함: 가장 적게 주는 수
  const scored = moves.map((m) => ({ m, v: -greedyTake(apply(state, m).state) + rng.next() * 0.1 }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}
