// 규칙 엔진 자동 점검: 무작위 플레이아웃 + 봇이 합법적인 수를 두는지 + 시간 확인
// 사용: node test/run.js [gameId ...]
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

globalThis.performance = performance;

const root = path.resolve('public/js/games');
const args = process.argv.slice(2);
const gamesArg = args.includes('--games') ? +args[args.indexOf('--games') + 1] : 0;
const fast = args.includes('--fast');
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--games').length ? args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--games') : readdirSync(root).filter((d) => existsSync(path.join(root, d, 'rules.js')));

function rand(n) { return Math.floor(Math.random() * n); }
const key = (m) => JSON.stringify(m);

let failed = 0;
for (const id of ids) {
  const mod = await import(pathToFileURL(path.join(root, id, 'rules.js')).href);
  const meta = mod.meta;
  const counts = meta.playerCounts || [2];
  let ok = true;
  const problems = [];
  const t0 = performance.now();
  let totalMoves = 0, games = 0, maxLen = 0;
  const results = { w: [0, 0, 0, 0], d: 0 };
  for (const n of counts) {
    const aiEvery = fast ? 1e9 : (meta.testAiEvery || 7);
    for (let g = 0; g < (gamesArg || meta.testGames || 30); g++) {
      const opts = {};
      for (const o of meta.options || []) opts[o.key] = o.values[rand(o.values.length)].value;
      let state;
      try { state = mod.init(opts, 1234 + g, n); } catch (e) { problems.push(`init 실패: ${e.stack}`); ok = false; break; }
      let steps = 0;
      try {
        while (steps < 3000) {
          const st = mod.status(state);
          if (st.over) { if (st.draw || st.winner == null) results.d++; else results.w[st.winner]++; break; }
          const moves = mod.legalMoves(state);
          if (!moves.length) { problems.push(`끝나지 않았는데 둘 수가 없음 (게임 ${g}, ${steps}수, turn ${state.turn})`); ok = false; break; }
          if (typeof state.turn !== 'number' || state.turn < 0 || state.turn >= n) { problems.push(`turn 값 이상: ${state.turn}`); ok = false; break; }
          // 가끔 봇 수도 검증
          let m;
          if (steps % aiEvery === 3) {
            const lvl = 1 + rand(3);
            const ts = performance.now();
            m = mod.ai(JSON.parse(JSON.stringify(state)), lvl, { seat: state.turn });
            const dt = performance.now() - ts;
            if (dt > 4000) problems.push(`봇(레벨 ${lvl})이 너무 느림: ${dt.toFixed(0)}ms (${steps}수)`);
            if (m == null || !moves.some((x) => key(x) === key(m))) { problems.push(`봇이 잘못된 수: ${key(m)} (게임 ${g}, ${steps}수, 레벨 ${lvl})`); ok = false; m = moves[rand(moves.length)]; }
          } else m = moves[rand(moves.length)];
          const before = JSON.stringify(state);
          const res = mod.apply(state, m);
          if (JSON.stringify(state) !== before) { problems.push(`apply가 원본 상태를 변경함 (게임 ${g}, ${steps}수)`); ok = false; }
          state = res.state;
          JSON.stringify(state); // 직렬화 가능해야 함
          steps++;
        }
        if (steps >= 3000) problems.push(`3000수가 넘도록 끝나지 않음 (게임 ${g})`);
      } catch (e) { problems.push(`게임 ${g} ${steps}수에서 예외: ${e.stack}`); ok = false; }
      totalMoves += steps; games++; maxLen = Math.max(maxLen, steps);
    }
  }
  const dt = performance.now() - t0;
  console.log(`${ok ? '✅' : '❌'} ${id.padEnd(12)} ${games}판 ${totalMoves}수 (최장 ${maxLen}) ${dt.toFixed(0)}ms  승:${results.w.slice(0, Math.max(...counts)).join('/')} 무:${results.d}`);
  for (const p of problems.slice(0, 8)) console.log('    -', p);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
