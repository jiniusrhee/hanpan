// 게임별 규칙 불변식 - 매 수마다 검사해서 규칙 위반(말 개수, 겹침, 비정상 값 등)을 잡는다.
// 각 함수는 (state, prev, move, events, mod) 를 받아 위반 설명 문자열을 돌려주거나 null 을 돌려준다.

const count = (arr, pred) => arr.reduce((a, v) => a + (pred(v) ? 1 : 0), 0);

export const invariants = {
  chess(state, prev, move, events, mod) {
    const b = state.board;
    for (const color of [0, 1]) {
      const mine = b.filter((p) => p && (p > 8 ? 1 : 0) === color);
      const kings = mine.filter((p) => (p & 7) === 6).length;
      if (kings !== 1) return `킹 개수 ${kings} (색 ${color})`;
      if (mine.length > 16) return `말 ${mine.length}개 (색 ${color})`;
      if (mine.filter((p) => (p & 7) === 1).length > 8) return `폰 9개 이상 (색 ${color})`;
    }
    for (let i = 0; i < 8; i++) { if (b[i] && (b[i] & 7) === 1) return '폰이 8랭크에'; if (b[56 + i] && (b[56 + i] & 7) === 1) return '폰이 1랭크에'; }
    if (state.check !== mod.inCheck(state)) return `check 플래그 불일치 (${state.check})`;
    if (state.ep !== -1 && !(state.ep >= 16 && state.ep < 48)) return `앙파상 칸 이상 ${state.ep}`;
    return null;
  },
  janggi(state) {
    if (state.phase === 'setup') return null;
    const b = state.board;
    for (const color of [0, 1]) {
      const mine = b.map((p, i) => [p, i]).filter(([p]) => p && (p > 8 ? 1 : 0) === color);
      const gens = mine.filter(([p]) => (p & 7) === 1);
      if (gens.length !== 1) return `궁 개수 ${gens.length} (색 ${color})`;
      const gi = gens[0][1], r = (gi / 9) | 0, c = gi % 9;
      const inPalace = c >= 3 && c <= 5 && (color === 0 ? r >= 7 : r <= 2);
      if (!inPalace) return `궁이 궁성 밖 (${r},${c})`;
      if (mine.length > 16) return `말 ${mine.length}개`;
    }
    return null;
  },
  othello(state, prev, move, events, mod) {
    if (prev && move && move.pass && mod.legalMoves(prev).some((m) => m.i != null)) return '둘 곳이 있는데 패스했다';
    const filled = count(state.board, (v) => v >= 0);
    if (prev && !(state.passes > prev.passes) && filled !== count(prev.board, (v) => v >= 0) + 1) return '돌 개수가 한 수에 1 늘지 않음';
    return null;
  },
  go(state, prev, move, events) {
    const { board, size } = state;
    const nb = (i) => { const r = (i / size) | 0, c = i % size, o = []; if (r > 0) o.push(i - size); if (r < size - 1) o.push(i + size); if (c > 0) o.push(i - 1); if (c < size - 1) o.push(i + 1); return o; };
    const seen = new Uint8Array(board.length);
    for (let i = 0; i < board.length; i++) {
      if (board[i] < 0 || seen[i]) continue;
      const color = board[i]; const stack = [i]; seen[i] = 1; let lib = false;
      while (stack.length) { const p = stack.pop(); for (const q of nb(p)) { if (board[q] === -1) lib = true; else if (board[q] === color && !seen[q]) { seen[q] = 1; stack.push(q); } } }
      if (!lib) return `활로 없는 돌 무리가 남아 있음 (${i})`;
    }
    if (prev && move && move.i != null) {
      const cap = events.find((e) => e.type === 'capture');
      const before = count(prev.board, (v) => v >= 0), after = count(board, (v) => v >= 0);
      if (after !== before + 1 - (cap ? cap.cells.length : 0)) return '돌 개수 변화가 이벤트와 불일치';
    }
    return null;
  },
  checkers(state) {
    for (let i = 0; i < 64; i++) {
      const p = state.board[i]; if (!p) continue;
      const r = i >> 3, c = i & 7;
      if ((r + c) % 2 === 0) return `밝은 칸에 말 (${r},${c})`;
      const color = p > 8 ? 1 : 0, man = (p & 7) === 1;
      if (man && ((color === 0 && r === 0) || (color === 1 && r === 7))) return '승격 안 된 말이 끝줄에';
    }
    for (const color of [0, 1]) if (count(state.board, (p) => p && (p > 8 ? 1 : 0) === color) > 12) return '말 13개 이상';
    return null;
  },
  connect4(state) {
    for (let c = 0; c < 7; c++) { let seenEmpty = false; for (let r = 0; r < 6; r++) { const v = state.board[r * 7 + c]; if (v === -1) seenEmpty = true; else if (seenEmpty && false) return ''; } }
    for (let c = 0; c < 7; c++) for (let r = 1; r < 6; r++) if (state.board[r * 7 + c] === -1 && state.board[(r - 1) * 7 + c] !== -1) return `공중에 뜬 동전 (${r - 1},${c})`;
    return null;
  },
  gomoku(state) {
    const b = count(state.board, (v) => v === 0), w = count(state.board, (v) => v === 1);
    if (!(b === w || b === w + 1)) return `돌 개수 흑 ${b} 백 ${w}`;
    return null;
  },
  ultimate(state) {
    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (let b = 0; b < 9; b++) {
      const cells = state.cells.slice(b * 9, b * 9 + 9);
      let w = -1; for (const [x, y, z] of LINES) if (cells[x] >= 0 && cells[x] === cells[y] && cells[x] === cells[z]) w = cells[x];
      if (w >= 0 && state.won[b] !== w) return `작은 판 ${b} 승자 불일치`;
    }
    return null;
  },
  mancala(state, prev) {
    const total = state.pits.reduce((a, b) => a + b, 0);
    if (prev && total !== prev.pits.reduce((a, b) => a + b, 0)) return `구슬 총합 변화 ${total}`;
    return null;
  },
  morris(state) {
    for (const s of [0, 1]) { const on = count(state.board, (v) => v === s); if (on + state.hand[s] > 9) return `말 합계 ${on + state.hand[s]} (좌석 ${s})`; }
    if (state.remove >= 0 && state.remove !== state.turn) return 'remove 좌석과 turn 불일치';
    return null;
  },
  hex(state) {
    const a = count(state.board, (v) => v === 0), b = count(state.board, (v) => v === 1);
    if (!(a === b || a === b + 1)) return `돌 개수 ${a}/${b}`;
    return null;
  },
  dots(state) {
    const n = state.n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const sides = state.h[r * n + c] + state.h[(r + 1) * n + c] + state.v[r * (n + 1) + c] + state.v[r * (n + 1) + c + 1];
      const owner = state.boxes[r * n + c];
      if (owner >= 0 && sides !== 4) return `변이 ${sides}개인 상자가 소유됨`;
      if (owner < 0 && sides === 4) return '네 변이 다 있는데 주인이 없음';
    }
    if (state.scores[0] !== count(state.boxes, (v) => v === 0) || state.scores[1] !== count(state.boxes, (v) => v === 1)) return '점수와 상자 수 불일치';
    return null;
  },
  battleship(state, prev, move, events, mod) {
    if (state.phase !== 'play') return null;
    for (const s of [0, 1]) {
      if (!mod.validPlacement(state.ships[s])) return `배치가 규칙 위반 (좌석 ${s})`;
      for (const idx of state.sunk[s]) for (const c of mod.shipCells(state.ships[s][idx])) if (state.shots[1 - s][c] !== 2) return '격침 판정된 배에 안 맞은 칸';
    }
    return null;
  },
  quoridor(state, prev, move, events, mod) {
    const placed = count(state.hw, Boolean) + count(state.vw, Boolean);
    if (placed + state.walls[0] + state.walls[1] !== 20) return `벽 합계 ${placed + state.walls[0] + state.walls[1]}`;
    if (state.pawns[0][0] === state.pawns[1][0] && state.pawns[0][1] === state.pawns[1][1]) return '말이 겹침';
    if (mod.distance(state, 0) < 0 || mod.distance(state, 1) < 0) return '골로 가는 길이 막힘';
    for (let i = 0; i < 64; i++) if (state.hw[i] && state.vw[i]) return `벽 교차 (${i})`;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 7; c++) if (state.hw[r * 8 + c] && state.hw[r * 8 + c + 1]) return '가로 벽 겹침';
    for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) if (state.vw[r * 8 + c] && state.vw[(r + 1) * 8 + c]) return '세로 벽 겹침';
    return null;
  },
  backgammon(state) {
    let w = state.bar[0] + state.off[0], b = state.bar[1] + state.off[1];
    for (let p = 1; p <= 24; p++) { const v = state.board[p]; if (v > 0) w += v; else b += -v; }
    if (w !== 15 || b !== 15) return `말 합계 흰 ${w} 검 ${b}`;
    if (state.board[0] !== 0 || state.board[25] !== 0) return '0/25 칸 사용됨';
    if (state.dice && state.dice.length > 4) return '주사위 5개 이상';
    return null;
  },
  yut(state, prev, move, events, mod) {
    const F = mod.FINISH;
    const rem = (t) => (t.pos === F ? 0 : t.pos === -1 ? 20 : mod.ROUTES[t.route].length - 1 - t.idx);
    if (prev && move && move.token != null) {
      const seat = prev.turn, r = prev.pending[move.result];
      const bt = prev.tokens[seat][move.token], at = state.tokens[seat][move.token];
      if (r === -1) {
        // 빽도는 지나온 길로 정확히 한 칸 뒤 (지름길 시작점이면 들어온 길의 바로 앞 칸)
        const want = bt.idx > 0 ? mod.ROUTES[bt.route][bt.idx - 1] : { A: 4, B: 9, C: 21 }[bt.route];
        if (want == null) return '출발점에서 더 뒤로 가는 빽도가 허용됨';
        if (at.pos !== want) return `빽도가 한 칸이 아님 (${bt.pos} → ${at.pos}, 기대 ${want})`;
      } else {
        const bonus = at.pos === 5 && at.route === 'A' && at.idx === 0 ? 4
          : at.pos === 10 && at.route === 'B' && at.idx === 0 ? 4
            : at.pos === 22 && at.route === 'C' && at.idx === 0 ? 5 : 0;
        const want = Math.max(0, rem(bt) - r - bonus);
        if (rem(at) !== want) return `이동 거리 불일치 (${r}칸인데 남은 ${rem(bt)}→${rem(at)}, 기대 ${want})`;
      }
      // 같은 칸에 있던 내 말은 모두 함께, 다른 칸 말은 그대로
      for (let i = 0; i < prev.tokens[seat].length; i++) {
        if (i === move.token) continue;
        const b2 = prev.tokens[seat][i], a2 = state.tokens[seat][i];
        const same = b2.pos === bt.pos && b2.pos !== -1 && b2.pos !== F;
        if (same && !(a2.pos === at.pos && a2.route === at.route && a2.idx === at.idx)) return `업힌 말이 같이 움직이지 않음 (말 ${i})`;
        if (!same && !(a2.pos === b2.pos && a2.route === b2.route && a2.idx === b2.idx)) return `관계없는 말이 움직임 (말 ${i})`;
      }
    }
    // 같은 칸의 내 말은 남은 칸수가 같아야 한다 (노선 이름이 달라도)
    for (const arr of state.tokens) {
      const byPos = new Map();
      for (const t of arr) { if (t.pos === -1 || t.pos === F) continue; const o = byPos.get(t.pos); if (o != null && o !== rem(t)) return `같은 칸인데 남은 칸수가 다름 (${t.pos})`; byPos.set(t.pos, rem(t)); }
    }
    const occ = new Map();
    for (let seat = 0; seat < state.tokens.length; seat++) for (const t of state.tokens[seat]) {
      if (t.pos >= 0 && t.pos !== F) { const o = occ.get(t.pos); if (o != null && o !== seat) return `두 사람 말이 같은 칸 ${t.pos}`; occ.set(t.pos, seat); }
    }
    for (const arr of state.tokens) for (const t of arr) if (!(t.pos === -1 || t.pos === F || (t.pos >= 0 && t.pos <= 28))) return `말 위치 이상 ${t.pos}`;
    if (state.throws < 0) return 'throws 음수';
    for (const r of state.pending) if (![-1, 1, 2, 3, 4, 5].includes(r)) return `pending 값 이상 ${r}`;
    return null;
  },
  ludo(state, prev, move, events, mod) {
    for (const e of events || []) if (e.type === 'capture' && e.count > 1) return `한 수에 ${e.count}개를 잡음`;
    if (prev && move && move.token != null) {
      const seat = prev.turn, d = prev.dice;
      const from = prev.tokens[seat][move.token];
      const to = from === -1 ? 0 : from + d;
      if (to > 56) return `집을 지나쳐 이동 (${to})`;
      if (state.tokens[seat][move.token] !== to) return `이동 결과 불일치 (${to} 기대)`;
      if (to <= 50) {
        // 같은 색 2개 이상이 선 칸은 지나가지도 멈추지도 못한다
        const cnt = new Map();
        prev.tokens.forEach((arr, os) => { if (os === seat) return; for (const p of arr) { if (p < 0 || p > 50) continue; const k = `${os}:${mod.absOf(prev, os, p)}`; cnt.set(k, (cnt.get(k) || 0) + 1); } });
        const wall = new Set(); for (const [k, v] of cnt) if (v >= 2) wall.add(+k.split(':')[1]);
        if (wall.size) for (let q = from === -1 ? 0 : from + 1; q <= to; q++) if (wall.has(mod.absOf(prev, seat, q))) return `길막을 통과함 (${q}번째 칸)`;
      }
    }
    const occ = new Map();
    for (let seat = 0; seat < state.n; seat++) {
      if (state.tokens[seat].length !== 4) return '말 4개 아님';
      for (const p of state.tokens[seat]) {
        if (p < -1 || p > 56) return `말 위치 ${p}`;
        if (p >= 0 && p <= 50) { const abs = mod.absOf(state, seat, p); if (!mod.SAFE.has(abs)) { const o = occ.get(abs); if (o != null && o !== seat) return `안전지대 아닌 칸에 두 사람 말 (${abs})`; occ.set(abs, seat); } }
      }
    }
    if (state.dice != null && (state.dice < 1 || state.dice > 6)) return `주사위 ${state.dice}`;
    return null;
  },
  blokus(state, prev, move, events, mod) {
    for (const e of events || []) if (e.type === 'allPlaced') {
      const want = state.lastPiece[e.seat] === 0 ? 20 : 15;
      if (e.bonus !== want) return `올 클리어 보너스 ${e.bonus} (기대 ${want})`;
    }
    for (let s = 0; s < state.n; s++) {
      const cells = count(state.board, (v) => v === s);
      if (cells !== state.placed[s]) return `placed 불일치 (좌석 ${s})`;
      const remaining = state.hands[s].reduce((a, id) => a + mod.PIECES[id].length, 0);
      if (cells + remaining !== 89) return `칸 합계 ${cells + remaining} (좌석 ${s})`;
    }
    return null;
  },
  yacht(state) {
    if (state.rolls < 0 || state.rolls > 3) return `rolls ${state.rolls}`;
    if (state.rolls > 0) for (const d of state.dice) if (d < 1 || d > 6) return `주사위 ${d}`;
    for (const sc of state.scores) for (let i = 0; i < sc.length; i++) { const v = sc[i]; if (v !== null && (v < 0 || v > 50 || (i < 6 && v > (i + 1) * 5))) return `점수 범위 이상 ${i}:${v}`; }
    return null;
  },
  g2048(state) {
    for (const v of state.board) if (v && (v & (v - 1)) !== 0) return `2의 거듭제곱 아님 ${v}`;
    return null;
  },
  minesweeper(state) {
    if (state.opened !== count(state.open, Boolean)) return 'opened 수 불일치';
    for (let i = 0; i < state.open.length; i++) { if (state.open[i] && state.flag[i]) return '열린 칸에 깃발'; if (state.open[i] && state.mine && state.mine[i] && !state.over) return '지뢰가 열렸는데 안 끝남'; }
    if (state.mine && count(state.mine, Boolean) !== state.mines) return '지뢰 수 불일치';
    return null;
  },
  sudoku(state) {
    for (let i = 0; i < 81; i++) { if (state.puzzle[i] && state.grid[i] !== state.puzzle[i]) return '주어진 숫자가 바뀜'; if (state.grid[i] < 0 || state.grid[i] > 9) return `값 이상 ${state.grid[i]}`; }
    const sol = state.solution;
    for (let k = 0; k < 9; k++) {
      const row = new Set(), col = new Set(), box = new Set();
      for (let j = 0; j < 9; j++) { row.add(sol[k * 9 + j]); col.add(sol[j * 9 + k]); box.add(sol[(((k / 3) | 0) * 3 + ((j / 3) | 0)) * 9 + (k % 3) * 3 + (j % 3)]); }
      if (row.size !== 9 || col.size !== 9 || box.size !== 9) return '해답이 스도쿠 규칙 위반';
    }
    return null;
  },
  tictactoe(state) {
    const x = count(state.board, (v) => v === 0), o = count(state.board, (v) => v === 1);
    if (!(x === o || x === o + 1)) return `X ${x} O ${o}`;
    return null;
  },
};

// 모든 게임 공통: 상태 안에 NaN/Infinity/undefined 가 없어야 한다 (온라인 동기화 시 깨짐)
export function findBadValue(v, path = '') {
  if (v === undefined) return path + ' = undefined';
  if (typeof v === 'number' && !Number.isFinite(v)) return path + ' = ' + v;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = findBadValue(v[i], `${path}[${i}]`); if (r) return r; } return null; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (k.startsWith('_')) continue; const r = findBadValue(v[k], path ? `${path}.${k}` : k); if (r) return r; } }
  return null;
}
