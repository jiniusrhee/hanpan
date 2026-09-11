// 배틀십 규칙 + 봇 (배치 → 포격, 헌트/타겟 봇)
import { makeRng, nextRand } from '../../core/rng.js';

export const meta = {
  id: 'battleship',
  name: '배틀십',
  description: '10×10 바다에 함선 5척을 몰래 배치하고, 번갈아 좌표를 포격해요. 상대 함대를 먼저 모두 격침시키면 승리!',
  seatNames: () => ['1번 함대', '2번 함대'],
  options: [
    { key: 'again', label: '명중하면', values: [{ value: 0, label: '차례 넘김' }, { value: 1, label: '한 번 더' }], default: 0 },
  ],
  undo: false,
  hidden: true,
  resultDelay: 1600,
  rules: `## 목표
상대의 함선 5척(길이 5·4·3·3·2)을 모두 격침시키면 승리해요.

## 진행
- **배치**: 내 바다에 함선을 놓아요. 함선을 고른 뒤 칸을 누르면 놓이고, 회전 버튼으로 방향을 바꿔요. '랜덤 배치'도 있어요. 함선끼리 겹칠 수는 없어요.
- **포격**: 번갈아 상대 바다의 한 칸을 골라 쏴요. 명중이면 🔥, 빗나가면 💧가 표시돼요.
- 한 함선의 모든 칸을 맞히면 격침! 격침된 함선은 상대에게도 공개돼요.
- 설정에 따라 명중하면 한 번 더 쏠 수도 있어요.

## 팁
- 초반엔 체스판 무늬처럼 한 칸씩 건너뛰며 쏘면 효율적이에요. 가장 작은 배(2칸)도 반드시 걸리거든요.
- 명중하면 상하좌우를 차례로 쏴서 방향을 찾으세요.`,
};

const N = 10;
export const SHIPS = [{ len: 5, name: '항공모함' }, { len: 4, name: '전함' }, { len: 3, name: '순양함' }, { len: 3, name: '잠수함' }, { len: 2, name: '구축함' }];

export function init(options, seed) {
  return { turn: 0, phase: 'place', again: options.again ? 1 : 0, ships: [null, null], shots: [Array(100).fill(0), Array(100).fill(0)], sunk: [[], []], last: null, rng: seed | 0 };
}

export function shipCells(s) {
  const out = [];
  for (let k = 0; k < s.len; k++) out.push(s.dir === 'h' ? s.r * N + s.c + k : (s.r + k) * N + s.c);
  return out;
}

export function validPlacement(ships) {
  if (!Array.isArray(ships) || ships.length !== SHIPS.length) return false;
  const used = new Set();
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i];
    if (!s || s.len !== SHIPS[i].len || (s.dir !== 'h' && s.dir !== 'v')) return false;
    if (s.r < 0 || s.c < 0 || (s.dir === 'h' ? s.c + s.len > N || s.r >= N : s.r + s.len > N || s.c >= N)) return false;
    for (const cell of shipCells(s)) { if (used.has(cell)) return false; used.add(cell); }
  }
  return true;
}

export function randomPlacement(rng) {
  for (let tries = 0; tries < 1000; tries++) {
    const ships = [];
    const used = new Set();
    let ok = true;
    for (const { len } of SHIPS) {
      let placed = false;
      for (let t = 0; t < 100 && !placed; t++) {
        const dir = rng.next() < 0.5 ? 'h' : 'v';
        const r = rng.int(dir === 'h' ? N : N - len + 1), c = rng.int(dir === 'h' ? N - len + 1 : N);
        const s = { r, c, len, dir };
        const cells = shipCells(s);
        if (cells.some((x) => used.has(x))) continue;
        cells.forEach((x) => used.add(x)); ships.push(s); placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return null;
}

export function legalMoves(state) {
  if (status(state).over) return [];
  if (state.phase === 'place') {
    const rng = makeRng(state.rng ^ (state.turn * 7919));
    return [{ place: randomPlacement(rng) }];
  }
  const out = [];
  const shots = state.shots[state.turn];
  for (let i = 0; i < 100; i++) if (!shots[i]) out.push({ fire: i });
  return out;
}

export function isLegal(state, m) {
  if (state.phase === 'place') return !!m.place && validPlacement(m.place);
  return typeof m.fire === 'number' && m.fire >= 0 && m.fire < 100 && !state.shots[state.turn][m.fire];
}

export function apply(state, m) {
  if (state.phase === 'place') {
    const ships = state.ships.slice();
    ships[state.turn] = m.place.map((s) => ({ ...s }));
    const both = ships[0] && ships[1];
    return { state: { ...state, ships, turn: both ? 0 : 1 - state.turn, phase: both ? 'play' : 'place' }, events: [{ type: 'placed', seat: state.turn }] };
  }
  const seat = state.turn, opp = 1 - seat;
  const shots = state.shots.map((a) => a.slice());
  const sunk = state.sunk.map((a) => a.slice());
  let hitShip = -1;
  state.ships[opp].forEach((s, idx) => { if (shipCells(s).includes(m.fire)) hitShip = idx; });
  shots[seat][m.fire] = hitShip >= 0 ? 2 : 1;
  const events = [];
  let isSunk = false;
  if (hitShip >= 0) {
    const cells = shipCells(state.ships[opp][hitShip]);
    isSunk = cells.every((c) => shots[seat][c] === 2);
    if (isSunk) sunk[opp].push(hitShip);
  }
  events.push({ type: 'shot', seat, i: m.fire, result: hitShip < 0 ? 'miss' : isSunk ? 'sunk' : 'hit', ship: hitShip });
  const allSunk = sunk[opp].length === SHIPS.length;
  const keep = state.again && hitShip >= 0 && !allSunk;
  return { state: { ...state, shots, sunk, turn: keep ? seat : opp, last: { seat, i: m.fire } }, events };
}

export function status(state) {
  if (state.phase !== 'play') return { over: false };
  for (const s of [0, 1]) if (state.sunk[s].length === SHIPS.length) return { over: true, winner: 1 - s, reason: '함대를 모두 격침시켰어요' };
  return { over: false };
}

// ---- 봇 ----
export function ai(state, level = 2) {
  const rng = makeRng();
  if (state.phase === 'place') return { place: randomPlacement(rng) };
  const seat = state.turn, opp = 1 - seat;
  const shots = state.shots[seat];
  const sunkCells = new Set();
  for (const idx of state.sunk[opp]) for (const c of shipCells(state.ships[opp][idx])) sunkCells.add(c);
  const empty = [];
  for (let i = 0; i < 100; i++) if (!shots[i]) empty.push(i);
  if (level === 1 && rng.next() < 0.5) return { fire: rng.pick(empty) };
  // 타겟 모드: 격침되지 않은 명중 칸 주변
  const hits = [];
  for (let i = 0; i < 100; i++) if (shots[i] === 2 && !sunkCells.has(i)) hits.push(i);
  if (hits.length) {
    const cand = new Map();
    for (const hcell of hits) {
      const r = (hcell / N) | 0, c = hcell % N;
      // 같은 줄로 이어진 명중이 있으면 그 방향 우선
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const j = rr * N + cc;
        if (shots[j]) continue;
        const back = (r - dr) * N + (c - dc);
        const aligned = r - dr >= 0 && r - dr < N && c - dc >= 0 && c - dc < N && shots[back] === 2 && !sunkCells.has(back);
        cand.set(j, (cand.get(j) || 0) + (aligned ? 5 : 1));
      }
    }
    if (cand.size) {
      const best = Math.max(...cand.values());
      const top = [...cand.entries()].filter(([, v]) => v === best).map(([k]) => k);
      return { fire: rng.pick(top) };
    }
  }
  // 헌트 모드
  const remaining = SHIPS.map((s, i) => i).filter((i) => !state.sunk[opp].includes(i)).map((i) => SHIPS[i].len);
  const minLen = Math.min(...remaining);
  if (level >= 3) {
    // 확률 밀도: 남은 배가 놓일 수 있는 자리 수
    const density = new Array(100).fill(0);
    for (const len of remaining) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const dir of ['h', 'v']) {
      if (dir === 'h' ? c + len > N : r + len > N) continue;
      const cells = []; let ok = true;
      for (let k = 0; k < len; k++) { const j = dir === 'h' ? r * N + c + k : (r + k) * N + c; if (shots[j] === 1 || sunkCells.has(j)) { ok = false; break; } cells.push(j); }
      if (ok) for (const j of cells) if (!shots[j]) density[j]++;
    }
    const best = Math.max(...density);
    const top = density.map((v, i) => (v >= best * 0.9 && !shots[i] ? i : -1)).filter((i) => i >= 0);
    return { fire: rng.pick(top) };
  }
  const parity = empty.filter((i) => (((i / N) | 0) + (i % N)) % minLen === 0);
  return { fire: rng.pick(parity.length ? parity : empty) };
}
