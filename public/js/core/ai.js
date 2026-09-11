// 공용 탐색 알고리즘 - 2인 게임용 알파베타(반복 심화, 시간 제한) + 간단한 MCTS
import { makeRng } from './rng.js';

export const WIN = 1e6;

class Timeout extends Error {}

/**
 * 2인 번갈아 두기 게임용 알파베타 탐색 (같은 사람이 연속으로 두는 게임도 지원).
 * rules: { legalMoves(state), apply(state, move) -> {state}, status(state) -> {over, winner, draw} }
 * evaluate(state, seat): seat 입장의 점수 (클수록 좋음)
 * opts: { depth, timeMs, orderMoves(state, moves), randomness(0~1), rng, maxMoves }
 */
export function alphabeta(rules, root, evaluate, opts = {}) {
  const { depth: maxDepth = 3, timeMs = 1500, orderMoves = null, randomness = 0, rng = makeRng(), maxMoves = 0, captures = null, qDepth = 4 } = opts;
  const deadline = performance.now() + timeMs;
  let nodes = 0;

  function terminal(st, seat, ply) {
    if (st.draw || st.winner == null) return 0;
    return st.winner === seat ? WIN - ply : -WIN + ply;
  }

  // 정지 탐색: 잡는 수만 계속 읽어서 지평선 효과를 줄인다
  function qsearch(state, alpha, beta, qd, ply) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout();
    const st = rules.status(state);
    if (st.over) return terminal(st, state.turn, ply);
    const stand = evaluate(state, state.turn);
    if (qd <= 0) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    let moves = captures(state);
    if (orderMoves && moves.length > 1) moves = orderMoves(state, moves);
    for (const m of moves) {
      const child = rules.apply(state, m).state;
      let v;
      if (child.turn === state.turn) v = qsearch(child, alpha, beta, qd - 1, ply + 1);
      else v = -qsearch(child, -beta, -alpha, qd - 1, ply + 1);
      if (v >= beta) return v;
      if (v > alpha) alpha = v;
    }
    return alpha;
  }

  function search(state, depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new Timeout();
    const st = rules.status(state);
    if (st.over) return terminal(st, state.turn, ply);
    if (depth <= 0) return captures ? qsearch(state, alpha, beta, qDepth, ply) : evaluate(state, state.turn);
    let moves = rules.legalMoves(state);
    if (moves.length === 0) return evaluate(state, state.turn);
    if (orderMoves) moves = orderMoves(state, moves);
    if (maxMoves && moves.length > maxMoves) moves = moves.slice(0, maxMoves);
    let best = -Infinity;
    for (const m of moves) {
      const child = rules.apply(state, m).state;
      let v;
      if (child.turn === state.turn) v = search(child, depth - 1, alpha, beta, ply + 1);
      else v = -search(child, depth - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  let moves = rules.legalMoves(root);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];
  if (orderMoves) moves = orderMoves(root, moves);
  if (maxMoves && moves.length > maxMoves) moves = moves.slice(0, maxMoves);

  let bestMove = moves[0];
  let scored = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= maxDepth; d++) {
    const cur = [];
    let alpha = -Infinity;
    try {
      for (const m of moves) {
        const child = rules.apply(root, m).state;
        let v;
        if (child.turn === root.turn) v = search(child, d - 1, alpha, Infinity, 1);
        else v = -search(child, d - 1, -Infinity, -alpha, 1);
        cur.push({ m, v });
        if (v > alpha) alpha = v;
      }
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    cur.sort((a, b) => b.v - a.v);
    scored = cur;
    bestMove = cur[0].m;
    moves = cur.map((x) => x.m); // 다음 반복은 좋은 수부터
    if (Math.abs(cur[0].v) >= WIN - 100) break; // 승부가 확정되면 더 볼 필요 없음
    if (performance.now() > deadline) break;
  }

  if (randomness > 0 && scored.length > 1) {
    // 상위 수 중에서 확률적으로 고른다 (쉬운 난이도용). 확실한 승리/패배 수는 그대로.
    const top = scored[0].v;
    const cands = scored.filter((s) => top - s.v <= Math.max(1, Math.abs(top)) * randomness * 4 && s.v > -WIN + 1000);
    const pool = cands.length ? cands : scored.slice(0, 1);
    const k = Math.min(pool.length, 1 + Math.floor(randomness * 4));
    return pool[rng.int(k)].m;
  }
  return bestMove;
}

/**
 * 간단한 MCTS (UCT). 무작위 플레이아웃 기반. N인 게임도 지원 (점수는 승자 기준).
 * rules: legalMoves/apply/status, playoutPolicy(state, moves, rng) 선택 사항.
 */
export function mcts(rules, root, opts = {}) {
  const { timeMs = 1500, iterations = 20000, rng = makeRng(), playoutPolicy = null, maxPlayout = 400, uct = 1.2, heuristic = null } = opts;
  const deadline = performance.now() + timeMs;
  const rootMoves = rules.legalMoves(root);
  if (rootMoves.length === 0) return null;
  if (rootMoves.length === 1) return rootMoves[0];

  const node = (state, move, parent) => ({ state, move, parent, children: null, n: 0, w: 0, untried: null });
  const rootNode = node(root, null, null);

  function expand(nd) {
    if (nd.untried === null) {
      nd.untried = rules.legalMoves(nd.state);
      if (heuristic) nd.untried.sort((a, b) => heuristic(nd.state, b) - heuristic(nd.state, a));
      nd.children = [];
    }
    if (nd.untried.length === 0) return null;
    const idx = heuristic ? 0 : rng.int(nd.untried.length);
    const m = nd.untried.splice(idx, 1)[0];
    const child = node(rules.apply(nd.state, m).state, m, nd);
    nd.children.push(child);
    return child;
  }

  function select(nd) {
    let best = null, bestV = -Infinity;
    const logN = Math.log(nd.n + 1);
    for (const c of nd.children) {
      const v = c.w / (c.n + 1e-9) + uct * Math.sqrt(logN / (c.n + 1e-9));
      if (v > bestV) { bestV = v; best = c; }
    }
    return best;
  }

  function playout(state) {
    let s = state;
    for (let i = 0; i < maxPlayout; i++) {
      const st = rules.status(s);
      if (st.over) return st;
      const moves = rules.legalMoves(s);
      if (moves.length === 0) return { over: true, draw: true };
      const m = playoutPolicy ? playoutPolicy(s, moves, rng) : moves[rng.int(moves.length)];
      s = rules.apply(s, m).state;
    }
    return rules.status(s);
  }

  let it = 0;
  while (it < iterations) {
    if ((it & 31) === 0 && performance.now() > deadline) break;
    it++;
    let nd = rootNode;
    // 선택
    while (nd.untried !== null && nd.untried.length === 0 && nd.children.length > 0 && !rules.status(nd.state).over) nd = select(nd);
    // 확장
    const st = rules.status(nd.state);
    if (!st.over) { const c = expand(nd); if (c) nd = c; }
    // 시뮬레이션
    const result = playout(nd.state);
    // 역전파: 각 노드의 w는 "그 노드로 이동한 플레이어(부모의 turn)" 입장의 결과
    while (nd) {
      nd.n += 1;
      if (nd.parent) {
        const mover = nd.parent.state.turn;
        if (result.draw || result.winner == null) nd.w += 0.5;
        else if (result.winner === mover) nd.w += 1;
        else if (result.scores) nd.w += 0; else nd.w += 0;
      }
      nd = nd.parent;
    }
  }
  if (!rootNode.children || rootNode.children.length === 0) return rootMoves[rng.int(rootMoves.length)];
  let best = rootNode.children[0];
  for (const c of rootNode.children) if (c.n > best.n) best = c;
  return best.move;
}

// 상위 후보 중 무작위 (heuristic 점수를 매긴 목록에서)
export function pickTop(scored, k, rng = makeRng()) {
  scored.sort((a, b) => b.v - a.v);
  return scored[rng.int(Math.min(k, scored.length))].m;
}
