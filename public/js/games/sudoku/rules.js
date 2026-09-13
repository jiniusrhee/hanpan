// 스도쿠 규칙 + 퍼즐 생성기 (유일해 보장)
import { makeRng, randInt, shuffle } from '../../core/rng.js';

const CLUES = { 1: 40, 2: 33, 3: 27 };

export const meta = {
  id: 'sudoku',
  name: '스도쿠',
  description: '가로·세로·3×3 상자마다 1부터 9까지 겹치지 않게 채우는 숫자 퍼즐이에요. 메모와 힌트 기능이 있어요.',
  seatNames: () => ['나'],
  playerCounts: [1],
  options: [
    { key: 'level', label: '난이도', values: [{ value: 1, label: '쉬움' }, { value: 2, label: '보통' }, { value: 3, label: '어려움' }], default: 1 },
  ],
  undo: true,
  bestHigher: false,
  formatBest: (v) => `${Math.floor(v / 60)}분 ${v % 60}초`,
  testGames: 4,
  rules: `## 목표
빈 칸을 모두 채워요. 모든 **가로줄, 세로줄, 3×3 상자**에 1부터 9까지 숫자가 한 번씩만 들어가야 해요.

## 조작
- 칸을 누르고 아래 숫자 패드를 누르면 숫자가 들어가요.
- **메모** 모드를 켜면 후보 숫자를 작게 적어둘 수 있어요.
- 틀린 숫자는 빨갛게 표시돼요. 힌트를 누르면 한 칸을 대신 채워줘요.

## 팁
- 한 줄이나 상자에서 이미 8개가 채워졌다면 남은 하나는 정해져 있어요.
- 어떤 숫자가 특정 상자에서 들어갈 수 있는 칸이 하나뿐인지 살펴보세요.`,
};

const box = (i) => ((((i / 9) | 0) / 3) | 0) * 3 + (((i % 9) / 3) | 0);

function candidates(grid, i) {
  const r = (i / 9) | 0, c = i % 9, b = box(i);
  const used = new Set();
  for (let k = 0; k < 9; k++) { used.add(grid[r * 9 + k]); used.add(grid[k * 9 + c]); }
  const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) used.add(grid[(br + dr) * 9 + bc + dc]);
  const out = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

function solveCount(grid, limit = 2) {
  // 가장 후보가 적은 칸부터 채우며 해의 개수를 센다 (limit에서 중단)
  let count = 0;
  const g = grid.slice();
  const rec = () => {
    if (count >= limit) return;
    let best = -1, bestC = null;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const cs = candidates(g, i);
      if (cs.length === 0) return;
      if (bestC === null || cs.length < bestC.length) { best = i; bestC = cs; if (cs.length === 1) break; }
    }
    if (best < 0) { count++; return; }
    for (const v of bestC) { g[best] = v; rec(); g[best] = 0; if (count >= limit) return; }
  };
  rec();
  return count;
}

function fillGrid(rng) {
  const g = Array(81).fill(0);
  const rec = (i) => {
    if (i === 81) return true;
    const cs = shuffle({ rng: rng.int(2 ** 30) }, candidates(g, i));
    for (const v of cs) { g[i] = v; if (rec(i + 1)) return true; }
    g[i] = 0; return false;
  };
  rec(0);
  return g;
}

export function generate(seed, clues) {
  const rng = makeRng(seed);
  const solution = fillGrid(rng);
  const puzzle = solution.slice();
  const order = shuffle({ rng: rng.int(2 ** 30) }, [...Array(81).keys()]);
  let remaining = 81;
  for (const i of order) {
    if (remaining <= clues) break;
    const backup = puzzle[i];
    puzzle[i] = 0;
    if (solveCount(puzzle, 2) !== 1) puzzle[i] = backup; else remaining--;
  }
  return { puzzle, solution };
}

export function init(options, seed) {
  const clues = CLUES[options.level || 1];
  const { puzzle, solution } = generate(seed | 0, clues);
  return { turn: 0, puzzle, solution, grid: puzzle.slice(), notes: Array.from({ length: 81 }, () => []), mistakes: 0, hints: 0, time: 0, over: false, won: false, rng: seed | 0 };
}

export function legalMoves(state) {
  if (state.over) return [];
  const out = [];
  for (let i = 0; i < 81; i++) if (!state.puzzle[i] && state.grid[i] !== state.solution[i]) out.push({ set: i, v: state.solution[i] });
  return out;
}

const cellOk = (i) => Number.isInteger(i) && i >= 0 && i < 81;
const digitOk = (v) => Number.isInteger(v) && v >= 1 && v <= 9;

export function isLegal(state, m) {
  if (!m || state.over) return false;
  if (m.set != null) return cellOk(m.set) && !state.puzzle[m.set] && digitOk(m.v);
  if (m.clear != null) return cellOk(m.clear) && !state.puzzle[m.clear];
  if (m.note != null) return cellOk(m.note) && !state.puzzle[m.note] && !state.grid[m.note] && digitOk(m.v);
  if (m.hint) return state.grid.some((v, i) => v !== state.solution[i]);
  return false;
}

export function conflicts(grid, i) {
  const v = grid[i]; if (!v) return [];
  const r = (i / 9) | 0, c = i % 9, b = box(i), out = [];
  for (let j = 0; j < 81; j++) { if (j === i || grid[j] !== v) continue; if (((j / 9) | 0) === r || j % 9 === c || box(j) === b) out.push(j); }
  return out;
}

export function apply(state, m) {
  const s = { ...state, grid: state.grid.slice(), notes: state.notes.map((n) => n.slice()) };
  if (m.t != null) s.time = m.t;
  const events = [];
  if (m.set != null) {
    s.grid[m.set] = m.v; s.notes[m.set] = [];
    const wrong = m.v !== s.solution[m.set];
    if (wrong) { s.mistakes++; events.push({ type: 'wrong', i: m.set }); }
    else {
      events.push({ type: 'set', i: m.set, v: m.v });
      // 같은 줄/상자의 메모에서 제거
      for (let j = 0; j < 81; j++) if (((j / 9) | 0) === ((m.set / 9) | 0) || j % 9 === m.set % 9 || box(j) === box(m.set)) s.notes[j] = s.notes[j].filter((x) => x !== m.v);
      const r = (m.set / 9) | 0, c = m.set % 9;
      const rowDone = [...Array(9)].every((_, k) => s.grid[r * 9 + k] === s.solution[r * 9 + k]);
      const colDone = [...Array(9)].every((_, k) => s.grid[k * 9 + c] === s.solution[k * 9 + c]);
      if (rowDone || colDone) events.push({ type: 'lineDone', row: rowDone ? r : -1, col: colDone ? c : -1 });
    }
  } else if (m.clear != null) { s.grid[m.clear] = 0; events.push({ type: 'clear', i: m.clear }); }
  else if (m.note != null) { const n = s.notes[m.note]; s.notes[m.note] = n.includes(m.v) ? n.filter((x) => x !== m.v) : [...n, m.v].sort(); events.push({ type: 'note', i: m.note }); }
  else if (m.hint) {
    const empties = []; for (let i = 0; i < 81; i++) if (s.grid[i] !== s.solution[i]) empties.push(i);
    const i = empties[randInt(s, empties.length)];
    s.grid[i] = s.solution[i]; s.notes[i] = []; s.hints++;
    events.push({ type: 'hint', i });
  }
  if (s.grid.every((v, i) => v === s.solution[i])) { s.over = true; s.won = true; events.push({ type: 'solved' }); }
  return { state: s, events };
}

export function status(state) {
  if (!state.over) return { over: false };
  const secs = Math.round(state.time / 1000);
  return { over: true, winner: 0, score: secs, title: '완성!', reason: `${Math.floor(secs / 60)}분 ${secs % 60}초 · 실수 ${state.mistakes}번 · 힌트 ${state.hints}번` };
}

export function ai(state) {
  const ms = legalMoves(state);
  return ms.length ? ms[0] : null;
}
