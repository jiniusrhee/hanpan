// 배틀십 규칙 + 봇 (배치 → 포격, 헌트/타겟 봇)
import { makeRng, nextRand } from '../../core/rng.js';
import { sha256Hex, randomSalt } from '../../core/hash.js';

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
  // 배치 수에는 내 함대 위치가 담겨 있으므로 상대에게는 가려서 보낸다 (상대 기기는 내 배치를 아예 받지 않는다)
  // 대신 '이 배치로 하겠다'는 약속(해시)만 보낸다 — 판이 끝나면 이 약속과 대조한다
  redactMove: (m) => (m && m.place ? { place: null, commit: fleetCommit(m.salt || '', m.place) } : undefined),
  // 포격 결과 공개와 끝난 뒤 함대 증명은 고를 것이 없으니 자동으로 처리
  autoMove: (state, move) => move.reveal !== undefined || move.proof !== undefined,
  autoMoveDelay: 0,
  // 결과 공개·함대 증명 대기는 진짜 차례 넘김이 아니다 (핫시트 커튼을 내리지 않는다)
  midTurn: (state) => !!state.pendingShot || state.phase === 'proof',
  rules: `## 목표
상대의 함선 5척(길이 5·4·3·3·2)을 모두 격침시키면 승리해요.

## 진행
- **배치**: 내 바다에 함선을 놓아요. 함선을 고른 뒤 칸을 누르면 놓이고, 회전 버튼으로 방향을 바꿔요. '랜덤 배치'도 있어요. 함선끼리 겹칠 수는 없지만 딱 붙여 놓는 건 괜찮아요. 이미 쏜 칸은 다시 쏠 수 없어요.
- **포격**: 번갈아 상대 바다의 한 칸을 골라 쏴요. 명중이면 🔥, 빗나가면 💧가 표시돼요.
- 한 함선의 모든 칸을 맞히면 격침! 격침된 함선만 상대에게 공개돼요.
- 내 함대 위치는 **내 기기에만** 있어요. 상대에게는 쏜 칸의 명중·빗나감만 전해져요.
- 설정에 따라 명중하면 한 번 더 쏠 수도 있어요.

## 공정하게
- 배치할 때 내 함대로 만든 **약속값(해시)**만 상대에게 보내요. 위치는 보내지 않아요.
- 판이 끝나면 이긴 쪽이 함대를 공개하고, 처음 약속·지금까지의 포격 결과와 하나라도 다르면 **반칙패**예요.
- 함선 칸은 모두 17칸이라, 빗나감이 83칸을 넘게 나오면 결과를 숨긴 것이 확실하므로 그 자리에서 반칙패예요.

## 팁
- 초반엔 체스판 무늬처럼 한 칸씩 건너뛰며 쏘면 효율적이에요. 가장 작은 배(2칸)도 반드시 걸리거든요.
- 명중하면 상하좌우를 차례로 쏴서 방향을 찾으세요.`,
};

const N = 10;
export const SHIPS = [{ len: 5, name: '항공모함' }, { len: 4, name: '전함' }, { len: 3, name: '순양함' }, { len: 3, name: '잠수함' }, { len: 2, name: '구축함' }];
const SHIP_CELLS = SHIPS.reduce((a, s) => a + s.len, 0);   // 17
const HEX64 = /^[0-9a-f]{64}$/, SALT = /^[0-9a-f]{0,64}$/;

// 함대를 항상 같은 문자열로 (배 순서·필드 순서 고정)
export function canonFleet(fleet) { return fleet.map((s) => `${s.r},${s.c},${s.len},${s.dir}`).join(';'); }
// 배치 약속: 비밀 소금값 + 함대의 해시. 소금값이 없으면 함대 경우의 수가 적어 거꾸로 맞혀 볼 수 있다.
export function fleetCommit(salt, fleet) { return sha256Hex(`hanpan-battleship-v1|${salt}|${canonFleet(fleet)}`); }
// 배치 수에 소금값을 붙인다 (사람·봇 모두 이걸 거쳐서 낸다)
export function withSalt(move) { return move && move.place && !move.salt ? { ...move, salt: randomSalt() } : move; }

export function init(options, seed) {
  return {
    turn: 0, phase: 'place', again: options.again ? 1 : 0,
    ships: [null, null],        // 내 기기가 아는 배치만 담긴다 (온라인에서 상대 것은 끝까지 null)
    placed: [false, false],     // 배치를 마쳤는지 — 이건 모두가 알아도 되는 정보
    shots: [Array(100).fill(0), Array(100).fill(0)],
    sunk: [[], []],
    sunkShips: [[], []],        // 격침돼 공개된 함선 { ship, r, c, len, dir }
    pendingShot: null,          // { by, i } — 맞은 쪽이 결과를 공개할 차례
    commits: [null, null],      // 배치 약속(해시) — 모두가 같은 값을 갖는다
    salts: [null, null],        // 약속에 쓴 비밀 소금값 — 내 것만 안다
    proof: null,                // 끝난 뒤 함대 증명 결과 { seat, ok, why }
    last: null, rng: seed | 0,
  };
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
    if (!Number.isInteger(s.r) || !Number.isInteger(s.c) || s.r < 0 || s.c < 0 || (s.dir === 'h' ? s.c + s.len > N || s.r >= N : s.r + s.len > N || s.c >= N)) return false;
    for (const cell of shipCells(s)) { if (used.has(cell)) return false; used.add(cell); }
  }
  return true;
}

// 격침 공개로 들어온 함선 모양이 말이 되는지 (상대 기기를 그대로 믿지 않기 위한 최소 검증)
function validSunkShip(sh, idx) {
  if (!sh || sh.len !== SHIPS[idx].len || (sh.dir !== 'h' && sh.dir !== 'v')) return false;
  if (!Number.isInteger(sh.r) || !Number.isInteger(sh.c) || sh.r < 0 || sh.c < 0) return false;
  return sh.dir === 'h' ? sh.c + sh.len <= N && sh.r < N : sh.r + sh.len <= N && sh.c < N;
}

// 판이 끝난 뒤 이긴 쪽이 내는 함대 증명. 내 함대를 아는 기기에서만 만들 수 있다.
function proofFor(state) {
  const seat = state.turn, fleet = state.ships[seat];
  if (!fleet) return null;
  return { proof: { salt: state.salts[seat] || '', fleet: fleet.map((s) => ({ r: s.r, c: s.c, len: s.len, dir: s.dir })) } };
}

// 공개된 함대가 (1) 처음 약속과 같고 (2) 지금까지 알린 모든 포격 결과·격침 공개와 맞는지
export function verifyProof(state, seat, proof) {
  if (!proof || typeof proof !== 'object' || typeof proof.salt !== 'string' || !validPlacement(proof.fleet)) return { ok: false, why: '공개한 함대 형식이 잘못됐어요' };
  if (fleetCommit(proof.salt, proof.fleet) !== state.commits[seat]) return { ok: false, why: '처음에 약속한 배치와 달라요' };
  const own = new Set();
  for (const sh of proof.fleet) for (const c of shipCells(sh)) own.add(c);
  const shots = state.shots[1 - seat];
  for (let c = 0; c < 100; c++) if (shots[c] && (shots[c] === 2) !== own.has(c)) return { ok: false, why: '포격 결과를 거짓으로 알렸어요' };
  for (const sh of state.sunkShips[seat]) {
    const f = proof.fleet[sh.ship];
    if (f.r !== sh.r || f.c !== sh.c || f.dir !== sh.dir) return { ok: false, why: '격침 공개가 실제 배치와 달라요' };
  }
  return { ok: true, why: '' };
}

// 맞은 쪽이 자기 배치를 보고 만드는 결과. 그 배치를 모르는 기기(=쏜 쪽)에서는 만들 수 없다.
export function revealFor(state) {
  const p = state.pendingShot;
  if (!p) return null;
  const fleet = state.ships[1 - p.by];
  if (!fleet) return null;
  let idx = -1;
  fleet.forEach((sh, k) => { if (shipCells(sh).includes(p.i)) idx = k; });
  if (idx < 0) return { reveal: -1 };
  const cells = shipCells(fleet[idx]);
  const sank = cells.every((c) => c === p.i || state.shots[p.by][c] === 2);
  return sank ? { reveal: idx, ship: { ...fleet[idx] } } : { reveal: idx };
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
  if (state.phase === 'proof') { const pf = proofFor(state); return pf ? [pf] : []; }
  if (state.pendingShot) { const r = revealFor(state); return r ? [r] : []; }
  const out = [];
  const shots = state.shots[state.turn];
  for (let i = 0; i < 100; i++) if (!shots[i]) out.push({ fire: i });
  return out;
}

export function isLegal(state, m) {
  if (!m || status(state).over) return false;
  if (state.phase === 'place') {
    // place: null 은 상대에게 가려서 전달된 배치 완료 신호 — 약속값이 반드시 있어야 한다
    if (m.place === null) return typeof m.commit === 'string' && HEX64.test(m.commit);
    return !!m.place && validPlacement(m.place) && (m.salt == null || (typeof m.salt === 'string' && SALT.test(m.salt)));
  }
  // 증명은 모양만 확인하고 받는다. 맞는지는 apply 가 판정해 모두가 같은 결론(반칙패 여부)을 낸다.
  // 여기서 거절하면 받는 쪽에서 동기화 오류로 처리돼 판이 끝나지 않는다.
  if (state.phase === 'proof') return !!m.proof && typeof m.proof === 'object' && typeof m.proof.salt === 'string' && m.proof.salt.length <= 64 && Array.isArray(m.proof.fleet);
  if (state.phase !== 'play') return false;
  if (state.pendingShot) {
    const p = state.pendingShot, target = 1 - p.by;
    if (!Number.isInteger(m.reveal) || m.reveal < -1 || m.reveal >= SHIPS.length) return false;
    if (m.reveal >= 0 && state.sunk[target].includes(m.reveal)) return false;
    if (m.ship != null && !(m.reveal >= 0 && validSunkShip(m.ship, m.reveal))) return false;
    const truth = revealFor(state);
    if (truth) {
      // 그 배치를 아는 기기에서는 진짜 결과와 정확히 같아야 한다
      if (truth.reveal !== m.reveal || !truth.ship !== !m.ship) return false;
      if (truth.ship && (truth.ship.r !== m.ship.r || truth.ship.c !== m.ship.c || truth.ship.dir !== m.ship.dir)) return false;
      return true;
    }
    // 상대 배치를 모르는 기기(=쏜 쪽)에서는 공개 정보, 즉 내가 쏜 기록만으로 검증한다.
    if (m.ship == null) return true;                          // 명중·빗나감 주장은 더 확인할 방법이 없다
    const cells = shipCells(m.ship);
    if (!cells.includes(p.i)) return false;                   // 방금 맞힌 칸이 그 배에 없다
    if (!cells.every((c) => c === p.i || state.shots[p.by][c] === 2)) return false;   // 격침이면 나머지 칸도 이미 맞혔어야 한다
    for (const sh of state.sunkShips[target]) if (shipCells(sh).some((c) => cells.includes(c))) return false;  // 이미 공개된 배와 겹친다
    return true;
  }
  return Number.isInteger(m.fire) && m.fire >= 0 && m.fire < 100 && !state.shots[state.turn][m.fire];
}

export function apply(state, m) {
  if (state.phase === 'place') {
    const ships = state.ships.slice();
    const placed = state.placed.slice();
    const commits = state.commits.slice(), salts = state.salts.slice();
    placed[state.turn] = true;
    if (m.place) {
      ships[state.turn] = m.place.map((s) => ({ r: s.r, c: s.c, len: s.len, dir: s.dir }));
      salts[state.turn] = m.salt || '';
      commits[state.turn] = fleetCommit(m.salt || '', m.place);
    } else commits[state.turn] = m.commit;
    const both = placed[0] && placed[1];
    return { state: { ...state, ships, placed, commits, salts, turn: both ? 0 : 1 - state.turn, phase: both ? 'play' : 'place' }, events: [{ type: 'placed', seat: state.turn }] };
  }
  // 끝난 뒤: 이긴 쪽의 함대 증명을 판정한다. 모든 기기가 같은 데이터로 같은 결론을 낸다.
  if (state.phase === 'proof') {
    const seat = state.turn;
    const v = verifyProof(state, seat, m.proof);
    const ships = state.ships.slice();
    if (v.ok) ships[seat] = m.proof.fleet.map((s) => ({ r: s.r, c: s.c, len: s.len, dir: s.dir }));   // 이제 공개해도 되는 정보
    return { state: { ...state, ships, phase: 'done', proof: { seat, ok: v.ok, why: v.why } }, events: [{ type: 'proof', seat, ok: v.ok, why: v.why }] };
  }
  // 1단계: 쏜다. 결과는 아직 아무도 모른다 — 차례를 맞은 쪽으로 넘겨 결과를 공개받는다.
  if (m.fire != null) {
    return { state: { ...state, pendingShot: { by: state.turn, i: m.fire }, turn: 1 - state.turn }, events: [{ type: 'aim', seat: state.turn, i: m.fire }] };
  }
  // 2단계: 맞은 쪽이 결과를 공개한다.
  const { by, i } = state.pendingShot;
  const target = 1 - by;
  const shots = state.shots.map((a) => a.slice());
  const sunk = state.sunk.map((a) => a.slice());
  const sunkShips = state.sunkShips.map((a) => a.slice());
  shots[by][i] = m.reveal >= 0 ? 2 : 1;
  let result = m.reveal < 0 ? 'miss' : 'hit';
  if (m.reveal >= 0 && m.ship) { sunk[target].push(m.reveal); sunkShips[target].push({ ship: m.reveal, ...m.ship }); result = 'sunk'; }
  const events = [{ type: 'shot', seat: by, i, result, ship: m.reveal }];
  const allSunk = sunk[target].length === SHIPS.length;
  const base = { ...state, shots, sunk, sunkShips, pendingShot: null, last: { seat: by, i } };
  // 상대 함대를 다 격침시켰다 — 이긴 쪽이 자기 함대를 증명해야 판이 끝난다
  if (allSunk) return { state: { ...base, phase: 'proof', turn: by }, events };
  const keep = state.again && m.reveal >= 0;
  return { state: { ...base, turn: keep ? by : target }, events };
}

export function status(state) {
  if (state.phase === 'done') {
    const p = state.proof;
    if (p && p.ok) return { over: true, winner: p.seat, reason: '함대를 모두 격침시켰어요' };
    return { over: true, winner: 1 - p.seat, reason: `반칙패 — ${(p && p.why) || '함대 증명에 실패했어요'}` };
  }
  if (state.phase !== 'play') return { over: false };
  // 함선 칸은 정확히 17칸. 빗나감이 83칸을 넘거나 명중이 17칸을 넘으면 결과를 속인 것이 확실하다.
  for (const t of [0, 1]) {
    let hit = 0, miss = 0;
    const sh = state.shots[1 - t];
    for (let c = 0; c < 100; c++) { if (sh[c] === 2) hit++; else if (sh[c] === 1) miss++; }
    if (miss > 100 - SHIP_CELLS || hit > SHIP_CELLS) return { over: true, winner: 1 - t, reason: '반칙패 — 포격 결과를 거짓으로 알렸어요' };
  }
  return { over: false };
}

// ---- 봇 ----
export function ai(state, level = 2) {
  const rng = makeRng();
  if (state.phase === 'place') return withSalt({ place: randomPlacement(rng) });
  if (state.phase === 'proof') return proofFor(state);   // 이겼으면 함대를 증명한다
  if (state.pendingShot) return revealFor(state);   // 내 바다가 맞았으면 결과를 공개한다
  const seat = state.turn, opp = 1 - seat;
  const shots = state.shots[seat];
  const sunkCells = new Set();
  for (const sh of state.sunkShips[opp]) for (const c of shipCells(sh)) sunkCells.add(c);
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
