// 2048 규칙
import { randInt, makeRng } from '../../core/rng.js';

export const meta = {
  id: 'g2048',
  name: '2048',
  description: '타일을 밀어 같은 숫자끼리 합쳐요. 2048을 만들면 클리어! 더 높은 숫자에도 도전해 보세요.',
  seatNames: () => ['나'],
  playerCounts: [1],
  options: [
    { key: 'size', label: '판 크기', values: [{ value: 4, label: '4×4' }, { value: 5, label: '5×5' }], default: 4 },
  ],
  undo: true,
  bestHigher: true,
  formatBest: (v) => `${v}점`,
  rules: `## 목표
같은 숫자 타일을 합쳐 **2048** 타일을 만들면 클리어예요. 그 뒤에도 계속해서 더 높은 점수에 도전할 수 있어요.

## 조작
- 판을 **밀어서(스와이프)** 모든 타일을 한 방향으로 움직여요. 키보드 방향키도 돼요.
- 같은 숫자 타일이 부딪히면 하나로 합쳐지고, 합친 숫자만큼 점수를 얻어요.
- 밀 때마다 빈 칸에 새 타일(2 또는 4)이 나타나요.
- 더 이상 움직일 수 없으면 게임 끝!

## 팁
- 가장 큰 타일을 한쪽 구석에 고정하고, 한 방향은 되도록 쓰지 마세요.
- 한 줄을 큰 수부터 순서대로 채워 두면 합치기가 쉬워요.`,
};

export function init(options, seed) {
  const size = options.size || 4;
  const s = { turn: 0, size, board: Array(size * size).fill(0), score: 0, moves: 0, won: false, rng: seed | 0, max: 0 };
  spawn(s); spawn(s);
  s.max = Math.max(...s.board);
  return s;
}

function spawn(s) {
  const empties = [];
  s.board.forEach((v, i) => { if (!v) empties.push(i); });
  if (!empties.length) return null;
  const i = empties[randInt(s, empties.length)];
  const v = randInt(s, 10) === 0 ? 4 : 2;
  s.board[i] = v;
  return { i, v };
}

const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

// 밀기: 새 판, 점수, 타일 이동 목록
function slide(board, size, dir) {
  const [dr, dc] = DIRS[dir];
  const out = board.slice();
  const moved = [];
  let gained = 0, changed = false;
  const lines = [];
  for (let k = 0; k < size; k++) {
    const line = [];
    for (let j = 0; j < size; j++) {
      let r, c;
      if (dir === 'up') { r = j; c = k; } else if (dir === 'down') { r = size - 1 - j; c = k; } else if (dir === 'left') { r = k; c = j; } else { r = k; c = size - 1 - j; }
      line.push(r * size + c);
    }
    lines.push(line);
  }
  for (const line of lines) {
    const tiles = line.filter((i) => board[i]).map((i) => ({ i, v: board[i] }));
    const result = [];
    for (let t = 0; t < tiles.length; t++) {
      if (t + 1 < tiles.length && tiles[t].v === tiles[t + 1].v) {
        result.push({ v: tiles[t].v * 2, from: [tiles[t].i, tiles[t + 1].i], merged: true });
        gained += tiles[t].v * 2; t++;
      } else result.push({ v: tiles[t].v, from: [tiles[t].i] });
    }
    for (const i of line) out[i] = 0;
    result.forEach((cell, k) => {
      const to = line[k];
      out[to] = cell.v;
      for (const f of cell.from) { moved.push({ from: f, to, v: board[f], merged: cell.merged }); if (f !== to) changed = true; }
      if (cell.merged) changed = true;
    });
  }
  return { board: out, gained, moved, changed };
}

export function legalMoves(state) {
  if (status(state).over) return [];
  return Object.keys(DIRS).filter((d) => slide(state.board, state.size, d).changed).map((d) => ({ dir: d }));
}

export function apply(state, m) {
  const { board, gained, moved } = slide(state.board, state.size, m.dir);
  const s = { ...state, board, score: state.score + gained, moves: state.moves + 1 };
  const sp = spawn(s);
  s.max = Math.max(...s.board);
  const events = [{ type: 'slide', dir: m.dir, moved, gained }];
  if (sp) events.push({ type: 'spawn', i: sp.i, v: sp.v });
  if (!state.won && s.max >= 2048) { s.won = true; events.push({ type: 'win2048' }); }
  const merges = moved.filter((x) => x.merged);
  if (merges.length) events.push({ type: 'merge', count: merges.length / 2, best: Math.max(...merges.map((x) => x.v * 2)) });
  return { state: s, events };
}

export function status(state) {
  const can = Object.keys(DIRS).some((d) => slide(state.board, state.size, d).changed);
  if (can) return { over: false };
  return { over: true, winner: state.max >= 2048 ? 0 : 1, score: state.score, title: state.max >= 2048 ? `${state.max} 달성!` : `최고 타일 ${state.max}`, reason: `${state.score}점 · ${state.moves}수` };
}

export function ai(state, level = 2) {
  const rng = makeRng();
  const ms = legalMoves(state);
  if (!ms.length) return null;
  // 빈 칸이 가장 많이 남는 방향 (간단 힌트용)
  const scored = ms.map((m) => { const r = slide(state.board, state.size, m.dir); const empty = r.board.filter((v) => !v).length; const pref = m.dir === 'down' || m.dir === 'left' ? 1 : 0; return { m, v: empty * 2 + r.gained / 8 + pref + rng.next() * 0.1 }; });
  scored.sort((a, b) => b.v - a.v);
  return scored[0].m;
}
