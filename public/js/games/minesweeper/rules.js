// 지뢰찾기 규칙 (첫 클릭 안전, 자동 열기, 코드 열기)
import { makeRng, randInt } from '../../core/rng.js';

const LEVELS = { 1: { rows: 9, cols: 9, mines: 10 }, 2: { rows: 12, cols: 12, mines: 25 }, 3: { rows: 16, cols: 16, mines: 50 } };

export const meta = {
  id: 'minesweeper',
  name: '지뢰찾기',
  description: '숫자는 주변 8칸에 있는 지뢰의 개수예요. 지뢰가 없는 칸을 모두 열면 클리어! 첫 클릭은 항상 안전해요.',
  seatNames: () => ['나'],
  playerCounts: [1],
  options: [
    { key: 'level', label: '난이도', values: [{ value: 1, label: '초급 9×9' }, { value: 2, label: '중급 12×12' }, { value: 3, label: '고급 16×16' }], default: 1 },
  ],
  undo: false,
  bestHigher: false,
  formatBest: (v) => `${v}초`,
  testGames: 10,
  rules: `## 목표
지뢰가 없는 칸을 모두 열면 클리어예요. 지뢰를 열면 끝!

## 진행
- 칸을 누르면 열려요. 숫자는 **주변 8칸에 있는 지뢰 개수**예요.
- 숫자가 0인 칸을 열면 주변이 자동으로 열려요.
- 지뢰라고 확신하는 칸은 **길게 누르거나** 깃발 모드에서 눌러 🚩 깃발을 꽂아요.
- 숫자 칸 주변에 깃발을 숫자만큼 꽂았다면, 숫자 칸을 눌러 나머지를 한 번에 열 수 있어요.
- 첫 클릭은 항상 안전해요.

## 팁
- 숫자 1 옆에 닫힌 칸이 하나뿐이면 그 칸은 지뢰예요.
- 확신이 없을 땐 열린 칸이 많은 쪽부터 추리하세요.`,
};

export function init(options, seed) {
  const lv = LEVELS[options.level || 1];
  return { turn: 0, rows: lv.rows, cols: lv.cols, mines: lv.mines, mine: null, open: Array(lv.rows * lv.cols).fill(false), flag: Array(lv.rows * lv.cols).fill(false), adj: null, started: false, over: false, won: false, boom: -1, time: 0, opened: 0, rng: seed | 0 };
}

function neighbors(rows, cols, i) {
  const r = (i / cols) | 0, c = i % cols, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc); }
  return out;
}

function placeMines(s, safe) {
  const n = s.rows * s.cols;
  const avoid = new Set([safe, ...neighbors(s.rows, s.cols, safe)]);
  const cells = [];
  for (let i = 0; i < n; i++) if (!avoid.has(i)) cells.push(i);
  const mine = Array(n).fill(false);
  for (let k = 0; k < s.mines; k++) { const j = randInt(s, cells.length); mine[cells[j]] = true; cells.splice(j, 1); }
  s.mine = mine;
  s.adj = Array(n).fill(0);
  for (let i = 0; i < n; i++) s.adj[i] = neighbors(s.rows, s.cols, i).filter((j) => mine[j]).length;
  s.started = true;
}

export function legalMoves(state) {
  if (state.over) return [];
  const out = [];
  state.open.forEach((o, i) => { if (!o && !state.flag[i]) out.push({ open: i }); });
  return out;
}

const cellOk = (state, i) => Number.isInteger(i) && i >= 0 && i < state.rows * state.cols;

export function isLegal(state, m) {
  if (!m || state.over) return false;
  if (m.open != null) return cellOk(state, m.open) && !state.open[m.open] && !state.flag[m.open];
  if (m.flag != null) return cellOk(state, m.flag) && !state.open[m.flag];
  if (m.chord != null) return cellOk(state, m.chord) && state.open[m.chord] && !!state.adj && state.adj[m.chord] > 0;
  return false;
}

function openCell(s, i, opened) {
  if (s.open[i] || s.flag[i]) return;
  const stack = [i];
  while (stack.length) {
    const j = stack.pop();
    if (s.open[j] || s.flag[j]) continue;
    s.open[j] = true; s.opened++; opened.push(j);
    if (s.adj[j] === 0) for (const k of neighbors(s.rows, s.cols, j)) if (!s.open[k]) stack.push(k);
  }
}

export function apply(state, m) {
  const s = { ...state, open: state.open.slice(), flag: state.flag.slice() };
  if (m.t != null) s.time = m.t;
  const events = [];
  if (m.flag != null) {
    s.flag[m.flag] = !s.flag[m.flag];
    events.push({ type: 'flag', i: m.flag, on: s.flag[m.flag] });
    return { state: s, events };
  }
  let targets = [];
  if (m.open != null) { if (!s.started) placeMines(s, m.open); targets = [m.open]; }
  else if (m.chord != null) {
    const nb = neighbors(s.rows, s.cols, m.chord);
    const flags = nb.filter((j) => s.flag[j]).length;
    if (flags !== s.adj[m.chord]) return { state: s, events: [{ type: 'nochord' }] };
    targets = nb.filter((j) => !s.open[j] && !s.flag[j]);
  }
  const opened = [];
  for (const t of targets) {
    if (s.mine[t]) { s.over = true; s.boom = t; events.push({ type: 'boom', i: t }); break; }
    openCell(s, t, opened);
  }
  if (opened.length) events.push({ type: 'open', cells: opened });
  if (!s.over && s.opened === s.rows * s.cols - s.mines) { s.over = true; s.won = true; events.push({ type: 'clear' }); }
  return { state: s, events };
}

export function status(state) {
  if (!state.over) return { over: false };
  const secs = Math.round(state.time / 1000);
  if (state.won) return { over: true, winner: 0, score: secs, title: '클리어!', reason: `${secs}초 만에 모든 지뢰를 찾았어요` };
  return { over: true, winner: 1, title: '펑! 지뢰를 밟았어요', reason: `${state.opened}칸 열었어요` };
}

// 단순 봇: 확실히 안전한 칸이 있으면 열고, 없으면 무작위
export function ai(state) {
  const rng = makeRng();
  const ms = legalMoves(state);
  if (!ms.length) return null;
  if (state.started) {
    const n = state.rows * state.cols;
    const sure = new Set();
    for (let i = 0; i < n; i++) {
      if (!state.open[i] || !state.adj[i]) continue;
      const nb = neighbors(state.rows, state.cols, i);
      const closed = nb.filter((j) => !state.open[j]);
      const flagged = closed.filter((j) => state.flag[j]);
      if (flagged.length === state.adj[i]) for (const j of closed) if (!state.flag[j]) sure.add(j);
    }
    if (sure.size) return { open: [...sure][0] };
  }
  return rng.pick(ms);
}
