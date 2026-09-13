// 대량 시뮬레이션: 게임 × 인원수마다 N판(기본 10,000)을 병렬로 돌리며
//  - 예외 / 규칙 불변식 위반 / 상태에 NaN·undefined / 끝났는데 둘 수 있음 / 안 끝났는데 둘 수 없음 / 3000수 초과
//  - apply 원본 변경, 합법 수 중복, 이벤트 형식
//  - 잘못된 입력(퍼징)이 검증을 통과하거나 apply를 깨뜨리는지
//  - 봇이 합법적인 수를 두는지 + 소요 시간 (일부 판만)
//  - 같은 시드·같은 수 → 같은 상태 (결정성, 일부 판만)
// 를 검사한다.
// 사용: node test/sim10k.js [--games 10000] [--only chess,yut] [--workers 12] [--out ./sim10k]
//       (내부용) node test/sim10k.js --worker --game chess --players 2 --seed 100 --games 500 --out file.json
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

globalThis.performance = performance;
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const GAMES_DIR = path.join(ROOT, 'public/js/games');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

// 시드 난수 (mulberry32)
function makeRng(seed) {
  let a = seed | 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

const JUNK = [null, {}, { i: -1 }, { i: 1e9 }, { i: 3.5 }, { i: 'a' }, { from: -1, to: -1 }, { from: 'x', to: 'y' }, { from: 0, to: 0 }, { c: 99 }, { c: -1 }, { pit: 99 }, { pit: 'a' },
  { roll: true, held: 'abc' }, { roll: true, held: [1, 2] }, { roll: true, held: [true, true, true, true, true] }, { score: 99 }, { score: 'a' }, { score: -1 },
  { open: 'abc' }, { open: -1 }, { open: 1e9 }, { flag: 1e9 }, { flag: 'x' }, { chord: 'x' }, { set: 999, v: 5 }, { set: 0, v: '5' }, { set: 0, v: 99 }, { note: 0, v: 99 }, { note: 'a', v: 1 }, { clear: 'a' }, { hint: 'yes' },
  { place: 'bad' }, { place: [{ r: 0, c: 0, len: 5, dir: 'h' }] }, { place: 99 }, { fire: 'a' }, { fire: -5 }, { fire: 100 }, { fire: 3.5 }, { fire: '3' }, { place: [{ r: 'a', c: 0, len: 5, dir: 'h' }, { r: 0, c: 0, len: 4, dir: 'v' }, { r: 0, c: 1, len: 3, dir: 'v' }, { r: 0, c: 2, len: 3, dir: 'v' }, { r: 0, c: 3, len: 2, dir: 'v' }] }, { piece: 99, o: 0, r: 0, c: 0 }, { piece: 0, o: 99, r: 0, c: 0 }, { piece: 0, o: 0, r: -3, c: -3 }, { piece: 'a', o: 'b', r: 'c', c: 'd' },
  { type: 'wall', o: 'x', r: -1, c: -1 }, { type: 'wall', o: 'h', r: 99, c: 99 }, { type: 'wall', o: 'h', r: 0.3, c: 0.3 }, { type: 'wall', o: 'v', r: '1', c: '1' }, { type: 'move', r: 4.5, c: 4 }, { type: 'move', r: 99, c: 99 }, { type: 'move', r: 'a', c: 'b' }, { token: 99, result: 0 }, { token: 0, result: 99 }, { token: 'a', result: 'b' }, { discard: 'a' }, { discard: 99 }, { throw: 'x' }, { skip: 1 },
  { dir: 'diag' }, { setup: 'zzzz' }, { pass: 'yes' }, { remove: 99 }, { remove: -1 }, { from: 'bar', to: 'off', die: 9 }, { from: 1, to: 2, die: 'x' }, { t: 'h', i: -1 }, { t: 'z', i: 0 }, { t: 'h', i: 1e9 }, { i: 0, extra: 'x' }];

function moveAccepted(mod, state, legal, m) {
  if (mod.isLegal) return !!mod.isLegal(state, m);
  const k = JSON.stringify(m);
  return legal.some((x) => JSON.stringify(x) === k);
}

async function worker() {
  const gameId = arg('--game'), players = +arg('--players', 2), seedBase = +arg('--seed', 1), n = +arg('--games', 100), out = arg('--out');
  const mod = await import(pathToFileURL(path.join(GAMES_DIR, gameId, 'rules.js')).href);
  const { invariants, findBadValue } = await import(pathToFileURL(path.join(ROOT, 'test/invariants.js')).href);
  const inv = invariants[gameId] || null;
  const st = { game: gameId, players, games: 0, moves: 0, maxLen: 0, capped: 0, wins: [0, 0, 0, 0], draws: 0, lengths: {}, errors: [], violations: [], fuzz: { tried: 0, accepted: 0, broke: 0 }, ai: { 1: { calls: 0, ms: 0, maxMs: 0, illegal: 0 }, 2: { calls: 0, ms: 0, maxMs: 0, illegal: 0 }, 3: { calls: 0, ms: 0, maxMs: 0, illegal: 0 } }, det: { checked: 0, failed: 0 }, elapsedMs: 0 };
  const note = (list, entry) => { if (list.length < 8) list.push(entry); };
  const t0 = performance.now();
  for (let g = 0; g < n; g++) {
    const seed = seedBase + g;
    const rng = makeRng(seed * 7919 + 13);
    const opts = {};
    for (const o of mod.meta.options || []) opts[o.key] = o.values[rng.int(o.values.length)].value;
    let state, moves = [], k = 0, aiCalls = 0;
    try {
      state = mod.init(opts, seed, players);
      const bad0 = findBadValue(state); if (bad0) note(st.violations, { seed, k: 0, msg: 'init 상태 이상: ' + bad0 });
      while (k < 3000) {
        const s = mod.status(state);
        const legal = mod.legalMoves(state);
        if (s.over) { if (legal.length && !s.draw && s.winner == null) note(st.violations, { seed, k, msg: `끝났는데(무승부 아님) 둘 수 있는 수 ${legal.length}개` }); break; }
        if (!legal.length) { note(st.violations, { seed, k, msg: '안 끝났는데 둘 수 없음' }); break; }
        if (k % 10 === 0) { const keys = new Set(legal.map((m) => JSON.stringify(m))); if (keys.size !== legal.length) note(st.violations, { seed, k, msg: `합법 수 중복 (${legal.length - keys.size}개)` }); }
        // 퍼징: 잘못된 입력이 검증을 통과하면 안 되고, 통과했다면 apply가 깨지면 안 된다
        if (k % 40 === 1) {
          for (const junk of JUNK) {
            st.fuzz.tried++;
            let ok = false;
            try { ok = moveAccepted(mod, state, legal, junk); } catch (e) { st.fuzz.broke++; note(st.errors, { seed, k, msg: '검증 중 예외: ' + JSON.stringify(junk) + ' → ' + e.message }); continue; }
            if (!ok) continue;
            st.fuzz.accepted++;
            try {
              const r = mod.apply(state, junk);
              const bad = findBadValue(r.state) || (inv ? inv(r.state, state, junk, r.events || [], mod) : null);
              if (bad) { st.fuzz.broke++; note(st.violations, { seed, k, msg: '잘못된 입력이 통과되어 상태 손상: ' + JSON.stringify(junk) + ' → ' + bad }); }
            } catch (e) { st.fuzz.broke++; note(st.errors, { seed, k, msg: '잘못된 입력으로 apply 예외: ' + JSON.stringify(junk) + ' → ' + e.message }); }
          }
        }
        // 봇 검사 (100판에 1판, 판당 최대 3번)
        if (g % 100 === 0 && k % 60 === 5 && aiCalls < 3) {
          aiCalls++;
          const level = 1 + rng.int(3);
          const ta = performance.now();
          let mv = null;
          try { mv = mod.ai(JSON.parse(JSON.stringify(state)), level, { seat: state.turn }); } catch (e) { note(st.errors, { seed, k, msg: `봇(레벨 ${level}) 예외: ${e.message}` }); }
          const dt = performance.now() - ta;
          const a = st.ai[level]; a.calls++; a.ms += dt; a.maxMs = Math.max(a.maxMs, dt);
          if (mv == null || !moveAccepted(mod, state, legal, mv)) { a.illegal++; note(st.violations, { seed, k, msg: `봇(레벨 ${level}) 비합법 수 ${JSON.stringify(mv)}` }); }
        }
        const m = legal[rng.int(legal.length)];
        const snap = k % 25 === 0 ? JSON.stringify(state) : null;
        const res = mod.apply(state, m);
        if (snap && JSON.stringify(state) !== snap) note(st.violations, { seed, k, msg: 'apply가 입력 상태를 변경' });
        const next = res.state, events = res.events || [];
        if (!Array.isArray(events) || events.some((e) => !e || typeof e.type !== 'string')) note(st.violations, { seed, k, msg: '이벤트 형식 이상' });
        const bad = findBadValue(next);
        if (bad) note(st.violations, { seed, k, msg: '상태에 비정상 값: ' + bad });
        if (typeof next.turn !== 'number' || next.turn < 0 || next.turn >= players) note(st.violations, { seed, k, msg: `turn 값 이상 ${next.turn}` });
        if (inv) { const v = inv(next, state, m, events, mod); if (v) note(st.violations, { seed, k, msg: v + ' (수: ' + JSON.stringify(m) + ')' }); }
        moves.push(m); state = next; k++;
      }
      if (k >= 3000) st.capped++;
      const fin = mod.status(state);
      if (fin.over) { if (fin.winner == null) st.draws++; else st.wins[fin.winner]++; }
      // 결정성: 같은 시드로 같은 수를 두면 같은 상태
      if (g % 100 === 0) {
        st.det.checked++;
        let s2 = mod.init(opts, seed, players);
        for (const mv of moves) s2 = mod.apply(s2, mv).state;
        if (JSON.stringify(s2) !== JSON.stringify(state)) { st.det.failed++; note(st.violations, { seed, k, msg: '결정성 실패 (재생 결과가 다름)' }); }
      }
    } catch (e) {
      note(st.errors, { seed, k, msg: (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)) });
    }
    st.games++; st.moves += k; st.maxLen = Math.max(st.maxLen, k);
    const bucket = k < 20 ? '<20' : k < 50 ? '20-49' : k < 100 ? '50-99' : k < 200 ? '100-199' : k < 500 ? '200-499' : k < 1000 ? '500-999' : '1000+';
    st.lengths[bucket] = (st.lengths[bucket] || 0) + 1;
  }
  st.elapsedMs = performance.now() - t0;
  writeFileSync(out, JSON.stringify(st));
}

async function coordinator() {
  const total = +arg('--games', 10000);
  const only = arg('--only', '');
  const workers = +arg('--workers', Math.max(2, Math.min(12, os.cpus().length - 2)));
  const outDir = arg('--out', path.join(ROOT, 'sim10k'));
  mkdirSync(outDir, { recursive: true });
  const ids = readdirSync(GAMES_DIR).filter((d) => existsSync(path.join(GAMES_DIR, d, 'rules.js'))).filter((d) => !only || only.split(',').includes(d));
  const tasks = [];
  for (const id of ids) {
    const mod = await import(pathToFileURL(path.join(GAMES_DIR, id, 'rules.js')).href);
    const counts = mod.meta.playerCounts || [2];
    for (const n of counts) {
      const shard = Math.min(500, total);
      for (let s = 0; s < total; s += shard) tasks.push({ id, n, seed: 100000 + s, games: Math.min(shard, total - s), out: path.join(outDir, `${id}-${n}p-${s}.json`) });
    }
  }
  console.log(`설정 ${new Set(tasks.map((t) => t.id + t.n)).size}개, 작업 ${tasks.length}개, 워커 ${workers}개`);
  const t0 = Date.now();
  let idx = 0, done = 0;
  await new Promise((resolve) => {
    const launch = () => {
      if (idx >= tasks.length) { if (done >= tasks.length) resolve(); return; }
      const t = tasks[idx++];
      const child = spawn(process.execPath, [__filename, '--worker', '--game', t.id, '--players', String(t.n), '--seed', String(t.seed), '--games', String(t.games), '--out', t.out], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('close', (code) => { done++; if (code !== 0) console.log(`⚠️ 워커 실패: ${t.id} ${t.n}p seed ${t.seed} (code ${code})`); if (done % 20 === 0 || done === tasks.length) console.log(`  진행 ${done}/${tasks.length} (${Math.round((Date.now() - t0) / 1000)}s)`); launch(); });
    };
    for (let i = 0; i < workers; i++) launch();
  });
  // 합치기
  const merged = {};
  for (const t of tasks) {
    if (!existsSync(t.out)) continue;
    const r = JSON.parse(readFileSync(t.out, 'utf8'));
    const key = `${t.id}-${t.n}p`;
    const m = merged[key] || (merged[key] = { game: t.id, players: t.n, games: 0, moves: 0, maxLen: 0, capped: 0, wins: [0, 0, 0, 0], draws: 0, lengths: {}, errors: [], violations: [], fuzz: { tried: 0, accepted: 0, broke: 0 }, ai: { 1: { calls: 0, ms: 0, maxMs: 0, illegal: 0 }, 2: { calls: 0, ms: 0, maxMs: 0, illegal: 0 }, 3: { calls: 0, ms: 0, maxMs: 0, illegal: 0 } }, det: { checked: 0, failed: 0 }, elapsedMs: 0 });
    m.games += r.games; m.moves += r.moves; m.maxLen = Math.max(m.maxLen, r.maxLen); m.capped += r.capped; m.draws += r.draws; m.elapsedMs += r.elapsedMs;
    r.wins.forEach((w, i) => { m.wins[i] += w; });
    for (const [b, c] of Object.entries(r.lengths)) m.lengths[b] = (m.lengths[b] || 0) + c;
    m.errors.push(...r.errors); m.violations.push(...r.violations);
    m.fuzz.tried += r.fuzz.tried; m.fuzz.accepted += r.fuzz.accepted; m.fuzz.broke += r.fuzz.broke;
    for (const lv of [1, 2, 3]) { m.ai[lv].calls += r.ai[lv].calls; m.ai[lv].ms += r.ai[lv].ms; m.ai[lv].maxMs = Math.max(m.ai[lv].maxMs, r.ai[lv].maxMs); m.ai[lv].illegal += r.ai[lv].illegal; }
    m.det.checked += r.det.checked; m.det.failed += r.det.failed;
  }
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(merged, null, 1));
  // 리포트
  let md = `# 대량 시뮬레이션 결과 (설정당 ${total}판)\n\n| 게임 | 인원 | 판 | 총 수 | 최장 | 3000수 초과 | 승률(좌석별) | 무승부 | 예외 | 규칙 위반 | 퍼징(통과/손상) | 봇 비합법 | 봇 최대ms (L1/L2/L3) | 결정성 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  let problems = 0;
  for (const m of Object.values(merged)) {
    const wins = m.wins.slice(0, m.players).map((w) => `${Math.round((w / m.games) * 100)}%`).join('/');
    const aiMax = [1, 2, 3].map((l) => Math.round(m.ai[l].maxMs)).join('/');
    const illegal = m.ai[1].illegal + m.ai[2].illegal + m.ai[3].illegal;
    const bad = m.errors.length || m.violations.length || m.fuzz.broke || illegal || m.det.failed || m.capped > m.games * 0.01; // 3000수 초과는 1% 넘을 때만 문제로 본다 (무작위 플레이는 끝없이 헤맬 수 있다)
    if (bad) problems++;
    md += `| ${bad ? '❌ ' : ''}${m.game} | ${m.players} | ${m.games} | ${m.moves} | ${m.maxLen} | ${m.capped} | ${wins} | ${m.draws} | ${m.errors.length ? '⚠' + m.errors.length : 0} | ${m.violations.length ? '⚠' + m.violations.length : 0} | ${m.fuzz.accepted}/${m.fuzz.broke} | ${illegal} | ${aiMax} | ${m.det.failed ? '실패 ' + m.det.failed : 'OK'} |\n`;
  }
  md += `\n총 ${Object.values(merged).reduce((a, m) => a + m.games, 0)}판, ${Object.values(merged).reduce((a, m) => a + m.moves, 0)}수, ${Math.round((Date.now() - t0) / 60000)}분 소요. 문제 있는 설정 ${problems}개.\n`;
  for (const m of Object.values(merged)) {
    if (!m.errors.length && !m.violations.length) continue;
    md += `\n## ${m.game} ${m.players}p\n`;
    for (const e of m.errors.slice(0, 5)) md += `- 예외 (seed ${e.seed}, ${e.k}수): ${e.msg}\n`;
    for (const v of m.violations.slice(0, 5)) md += `- 위반 (seed ${v.seed}, ${v.k}수): ${v.msg}\n`;
  }
  writeFileSync(path.join(outDir, 'report.md'), md);
  console.log(md);
}

if (has('--worker')) worker().catch((e) => { console.error(e); process.exit(1); });
else coordinator().catch((e) => { console.error(e); process.exit(1); });
