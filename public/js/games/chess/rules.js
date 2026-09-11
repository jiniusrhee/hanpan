// 체스 규칙 + 봇 (캐슬링, 앙파상, 프로모션, 3회 반복, 50수 규칙 포함)
import { makeRng } from '../../core/rng.js';

export const meta = {
  id: 'chess',
  name: '체스',
  description: '가장 널리 사랑받는 전략 게임. 상대 킹을 잡을 수밖에 없는 상황(체크메이트)으로 몰면 승리해요. 캐슬링, 앙파상, 프로모션까지 정식 규칙을 지원해요.',
  seatNames: () => ['백', '흑'],
  options: [],
  undo: true,
  testGames: 6,
  testAiEvery: 45,
  rules: `## 목표
상대 킹이 공격받고 있는데 피할 방법이 전혀 없으면 체크메이트, 승리예요.

## 말의 움직임
- **폰**: 앞으로 한 칸(처음엔 두 칸 가능), 잡을 때는 대각선 앞 한 칸. 끝줄에 도착하면 퀸·룩·비숍·나이트 중 하나로 승격해요.
- **나이트**: L자(두 칸 + 옆으로 한 칸). 다른 말을 뛰어넘을 수 있어요.
- **비숍**: 대각선으로 원하는 만큼.
- **룩**: 가로·세로로 원하는 만큼.
- **퀸**: 가로·세로·대각선 모두 원하는 만큼.
- **킹**: 모든 방향으로 한 칸. 공격받는 칸으로는 못 가요.

## 특수 규칙
- **캐슬링**: 킹과 룩이 한 번도 안 움직였고, 사이가 비어 있고, 킹이 지나는 칸이 공격받지 않으면 킹이 두 칸 옆으로 가고 룩이 킹을 넘어와요.
- **앙파상**: 상대 폰이 두 칸 전진해 내 폰 옆에 섰을 때, 바로 다음 수에 그 폰을 대각선으로 잡을 수 있어요.
- **무승부**: 둘 곳이 없는데 체크가 아니면(스테일메이트), 같은 국면이 3번 나오면, 50수 동안 폰 이동이나 포획이 없으면 무승부예요.

## 조작
말을 누르면 갈 수 있는 칸이 표시돼요. 그 칸을 누르면 이동! 백이 먼저 시작해요.`,
};

// 말 코드: 0 빈칸, 1~6 백 (P N B R Q K), 9~14 흑
const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
const colorOf = (p) => (p > 8 ? 1 : p > 0 ? 0 : -1);
const typeOf = (p) => p & 7;
const mk = (t, color) => t + color * 8;
const TYPE_CH = 'pnbrqk';
const VAL = [0, 100, 320, 330, 500, 900, 20000];

const START = [
  R, N, B, Q, K, B, N, R,
  P, P, P, P, P, P, P, P,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
  P, P, P, P, P, P, P, P,
  R, N, B, Q, K, B, N, R,
];

export function init(options, seed) {
  const board = START.map((p, i) => (p === 0 ? 0 : i < 16 ? p + 8 : p));
  const s = { turn: 0, board, castle: 15, ep: -1, half: 0, full: 1, last: null, reps: {}, rng: seed | 0, check: false };
  s.reps[posKey(s)] = 1;
  return s;
}

function posKey(s) { return s.board.join('') + '|' + s.turn + '|' + s.castle + '|' + s.ep; }

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function attacked(board, sq, by) {
  const r = sq >> 3, c = sq & 7;
  // 폰
  const pr = by === 0 ? r + 1 : r - 1;
  if (pr >= 0 && pr < 8) {
    if (c > 0 && board[pr * 8 + c - 1] === mk(P, by)) return true;
    if (c < 7 && board[pr * 8 + c + 1] === mk(P, by)) return true;
  }
  for (const [dr, dc] of KN) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === mk(N, by)) return true; }
  for (const [dr, dc] of KG) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && board[rr * 8 + cc] === mk(K, by)) return true; }
  for (const [dr, dc] of BD) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const p = board[rr * 8 + cc];
      if (p) { if (colorOf(p) === by && (typeOf(p) === B || typeOf(p) === Q)) return true; break; }
      rr += dr; cc += dc;
    }
  }
  for (const [dr, dc] of RD) {
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      const p = board[rr * 8 + cc];
      if (p) { if (colorOf(p) === by && (typeOf(p) === R || typeOf(p) === Q)) return true; break; }
      rr += dr; cc += dc;
    }
  }
  return false;
}

function kingSq(board, color) { const k = mk(K, color); for (let i = 0; i < 64; i++) if (board[i] === k) return i; return -1; }

export function inCheck(state, color = state.turn) {
  return attacked(state.board, kingSq(state.board, color), 1 - color);
}

function pseudoMoves(state, onlyCaptures = false) {
  const { board, turn } = state;
  const out = [];
  const add = (from, to, extra) => out.push(extra ? { from, to, ...extra } : { from, to });
  for (let from = 0; from < 64; from++) {
    const p = board[from];
    if (!p || colorOf(p) !== turn) continue;
    const t = typeOf(p), r = from >> 3, c = from & 7;
    if (t === P) {
      const dir = turn === 0 ? -1 : 1;
      const r1 = r + dir;
      const promo = r1 === 0 || r1 === 7;
      if (r1 >= 0 && r1 < 8) {
        if (!onlyCaptures && !board[r1 * 8 + c]) {
          if (promo) for (const pr of 'qrbn') add(from, r1 * 8 + c, { promo: pr }); else add(from, r1 * 8 + c);
          const r2 = r + 2 * dir;
          if ((turn === 0 ? r === 6 : r === 1) && !board[r2 * 8 + c]) add(from, r2 * 8 + c, { double: true });
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc; if (cc < 0 || cc > 7) continue;
          const to = r1 * 8 + cc;
          if (board[to] && colorOf(board[to]) !== turn) { if (promo) for (const pr of 'qrbn') add(from, to, { promo: pr }); else add(from, to); }
          else if (to === state.ep && !board[to]) add(from, to, { ep: true });
        }
      }
    } else if (t === N || t === K) {
      for (const [dr, dc] of t === N ? KN : KG) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
        const to = rr * 8 + cc;
        if (!board[to]) { if (!onlyCaptures) add(from, to); }
        else if (colorOf(board[to]) !== turn) add(from, to);
      }
      if (t === K && !onlyCaptures) {
        // 캐슬링
        const home = turn === 0 ? 60 : 4;
        if (from === home) {
          const kBit = turn === 0 ? 1 : 4, qBit = turn === 0 ? 2 : 8;
          const opp = 1 - turn;
          if ((state.castle & kBit) && !board[home + 1] && !board[home + 2] && board[home + 3] === mk(R, turn) &&
            !attacked(board, home, opp) && !attacked(board, home + 1, opp) && !attacked(board, home + 2, opp)) add(from, home + 2, { castle: 'K' });
          if ((state.castle & qBit) && !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4] === mk(R, turn) &&
            !attacked(board, home, opp) && !attacked(board, home - 1, opp) && !attacked(board, home - 2, opp)) add(from, home - 2, { castle: 'Q' });
        }
      }
    } else {
      const dirs = t === B ? BD : t === R ? RD : KG;
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const to = rr * 8 + cc;
          if (!board[to]) { if (!onlyCaptures) add(from, to); }
          else { if (colorOf(board[to]) !== turn) add(from, to); break; }
          rr += dr; cc += dc;
        }
      }
    }
  }
  return out;
}

function makeMove(state, m) {
  const board = state.board.slice();
  const p = board[m.from];
  const t = typeOf(p), turn = state.turn;
  let captured = board[m.to];
  let capAt = captured ? m.to : -1;
  board[m.to] = p; board[m.from] = 0;
  let ep = -1;
  if (t === P) {
    if (m.ep) { capAt = m.to + (turn === 0 ? 8 : -8); captured = board[capAt]; board[capAt] = 0; }
    if (m.double) ep = (m.from + m.to) / 2;
    if (m.promo) board[m.to] = mk('pnbrqk'.indexOf(m.promo) + 1, turn);
  }
  let rookFrom = -1, rookTo = -1;
  if (m.castle) {
    if (m.castle === 'K') { rookFrom = m.to + 1; rookTo = m.to - 1; } else { rookFrom = m.to - 2; rookTo = m.to + 1; }
    board[rookTo] = board[rookFrom]; board[rookFrom] = 0;
  }
  let castle = state.castle;
  if (t === K) castle &= turn === 0 ? ~3 : ~12;
  const rookBits = { 63: 1, 56: 2, 7: 4, 0: 8 };
  if (rookBits[m.from]) castle &= ~rookBits[m.from];
  if (rookBits[m.to]) castle &= ~rookBits[m.to];
  const irreversible = t === P || captured;
  const next = {
    turn: 1 - turn, board, castle, ep,
    half: irreversible ? 0 : state.half + 1,
    full: state.full + (turn === 1 ? 1 : 0),
    last: { from: m.from, to: m.to },
    reps: irreversible ? {} : { ...state.reps },
    rng: state.rng, check: false,
  };
  const key = posKey(next);
  next.reps[key] = (next.reps[key] || 0) + 1;
  return { next, captured, capAt, rookFrom, rookTo };
}

export function legalMoves(state) {
  if (state._over) return [];
  const out = [];
  for (const m of pseudoMoves(state)) {
    const { next } = makeMove(state, m);
    if (!attacked(next.board, kingSq(next.board, state.turn), 1 - state.turn)) out.push(m);
  }
  return out;
}

export function apply(state, m) {
  const { next, captured, capAt, rookFrom, rookTo } = makeMove(state, m);
  const p = state.board[m.from];
  const events = [{ type: 'move', from: m.from, to: m.to, piece: p, seat: state.turn }];
  if (captured) events.push({ type: 'capture', at: capAt, piece: captured, seat: state.turn });
  if (m.castle) events.push({ type: 'castle', rookFrom, rookTo });
  if (m.promo) events.push({ type: 'promote', at: m.to, piece: next.board[m.to] });
  next.check = inCheck(next);
  if (next.check) {
    const mate = legalMoves(next).length === 0;
    events.push({ type: mate ? 'mate' : 'check', seat: state.turn });
  }
  return { state: next, events };
}

function insufficient(board) {
  let minors = 0;
  for (const p of board) {
    if (!p) continue;
    const t = typeOf(p);
    if (t === P || t === R || t === Q) return false;
    if (t === N || t === B) minors++;
  }
  return minors <= 1;
}

export function status(state) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    if (inCheck(state)) return { over: true, winner: 1 - state.turn, reason: '체크메이트!' };
    return { over: true, draw: true, winner: null, reason: '스테일메이트 (둘 곳이 없어요)' };
  }
  if (state.half >= 100) return { over: true, draw: true, winner: null, reason: '50수 규칙' };
  if (insufficient(state.board)) return { over: true, draw: true, winner: null, reason: '남은 말로는 체크메이트가 불가능해요' };
  const key = posKey(state);
  if ((state.reps[key] || 0) >= 3) return { over: true, draw: true, winner: null, reason: '같은 국면이 세 번 나왔어요' };
  return { over: false };
}

// ---- 평가 ----
const PST = {
  [P]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [B]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [R]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [K]: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};
const K_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

export function evaluate(state, seat) {
  const b = state.board;
  let score = 0, material = 0;
  for (let i = 0; i < 64; i++) { const p = b[i]; if (p) { const t = typeOf(p); if (t !== K) material += VAL[t]; } }
  const endgame = material < 2600;
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p) continue;
    const t = typeOf(p), color = colorOf(p);
    const sq = color === 0 ? i : ((7 - (i >> 3)) << 3) | (i & 7);
    const table = t === K && endgame ? K_END : PST[t];
    const v = VAL[t] + table[sq];
    score += color === seat ? v : -v;
  }
  return score;
}

// ---- 탐색 (알파베타 + 정지 탐색) ----
class Timeout extends Error {}
const WINV = 100000;

function mvvLva(state, m) {
  const victim = state.board[m.to];
  let s = 0;
  if (victim) s = VAL[typeOf(victim)] * 10 - VAL[typeOf(state.board[m.from])];
  else if (m.ep) s = 1000 - 100;
  if (m.promo) s += m.promo === 'q' ? 9000 : 500;
  return s;
}

function searchRoot(state, maxDepth, timeMs, rng, randomness) {
  const deadline = performance.now() + timeMs;
  let nodes = 0;
  const myKingAttacked = (s, color) => attacked(s.board, kingSq(s.board, color), 1 - color);

  function qs(s, alpha, beta, qd) {
    if ((++nodes & 2047) === 0 && performance.now() > deadline) throw new Timeout();
    const stand = evaluate(s, s.turn);
    if (qd <= 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = pseudoMoves(s, true).sort((a, b2) => mvvLva(s, b2) - mvvLva(s, a));
    for (const m of moves) {
      const { next } = makeMove(s, m);
      if (myKingAttacked(next, s.turn)) continue;
      const v = -qs(next, -beta, -alpha, qd - 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function search(s, depth, alpha, beta, ply) {
    if ((++nodes & 2047) === 0 && performance.now() > deadline) throw new Timeout();
    if (s.half >= 100) return 0;
    if ((s.reps[posKey(s)] || 0) >= 3) return 0;
    const check = inCheck(s);
    if (check) depth++; // 체크 연장
    if (depth <= 0) return qs(s, alpha, beta, 6);
    const moves = pseudoMoves(s).sort((a, b2) => mvvLva(s, b2) - mvvLva(s, a));
    let legal = 0, best = -Infinity;
    for (const m of moves) {
      const { next } = makeMove(s, m);
      if (myKingAttacked(next, s.turn)) continue;
      legal++;
      const v = -search(next, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (legal === 0) return check ? -WINV + ply : 0;
    return best;
  }

  const rootMoves = legalMoves(state).sort((a, b2) => mvvLva(state, b2) - mvvLva(state, a));
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0];
  let ordered = rootMoves, scored = null;
  for (let d = 1; d <= maxDepth; d++) {
    const cur = [];
    let alpha = -Infinity;
    try {
      for (const m of ordered) {
        const { next } = makeMove(state, m);
        const v = -search(next, d - 1, -Infinity, -alpha, 1);
        cur.push({ m, v });
        if (v > alpha) alpha = v;
      }
    } catch (e) { if (e instanceof Timeout) break; throw e; }
    cur.sort((a, b2) => b2.v - a.v);
    scored = cur;
    ordered = cur.map((x) => x.m);
    if (scored[0].v >= WINV - 50 || performance.now() > deadline) break;
  }
  if (!scored) return rootMoves[0];
  if (randomness > 0) {
    const top = scored[0].v;
    const pool = scored.filter((x) => top - x.v <= randomness * 120 && x.v > -WINV + 500);
    if (!pool.length) return scored[0].m; // 모든 수가 지는 수면 그중 최선
    return pool[rng.int(Math.min(pool.length, 4))].m;
  }
  return scored[0].m;
}

export function ai(state, level = 2) {
  const rng = makeRng();
  if (level === 1) return searchRoot(state, 1, 400, rng, 1.2);
  if (level === 2) return searchRoot(state, 3, 1200, rng, 0.15);
  return searchRoot(state, 5, 2600, rng, 0);
}

export const pieceChar = (p) => TYPE_CH[typeOf(p) - 1];
export { colorOf, typeOf, VAL, K as KING, P as PAWN };
