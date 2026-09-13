// 봇 품질 점검: 게임마다 (쉬움 vs 무작위), (보통 vs 무작위), (어려움 vs 쉬움) 대결을 앞뒤 자리를 바꿔 가며 치르고
// 승률·수당 소요 시간·비합법 수·예외를 기록한다. 게임별로 워커 프로세스 하나씩 병렬 실행.
// 사용: node test/bots.js [--games 10] [--only chess,go] [--workers 8] [--out ./bots]
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

function makeRng(seed) {
  let a = seed | 0;
  const next = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next, int: (n) => Math.floor(next() * n) };
}

const MATCHUPS = [
  { name: '쉬움 vs 무작위', a: 1, b: 0 },
  { name: '보통 vs 무작위', a: 2, b: 0 },
  { name: '어려움 vs 쉬움', a: 3, b: 1 },
];

async function worker() {
  const gameId = arg('--game'), n = +arg('--games', 10), out = arg('--out');
  const mod = await import(pathToFileURL(path.join(GAMES_DIR, gameId, 'rules.js')).href);
  const counts = mod.meta.playerCounts || [2];
  const players = counts.includes(2) ? 2 : counts[0];
  const res = { game: gameId, players, matchups: [], time: { 1: { calls: 0, ms: 0, max: 0 }, 2: { calls: 0, ms: 0, max: 0 }, 3: { calls: 0, ms: 0, max: 0 } }, illegal: 0, errors: [] };
  const isLegal = (state, legal, m) => { if (!m || typeof m !== 'object') return false; if (mod.isLegal) return !!mod.isLegal(state, m); const k = JSON.stringify(m); return legal.some((x) => JSON.stringify(x) === k); };
  for (const mu of MATCHUPS) {
    const r = { name: mu.name, games: 0, aWins: 0, bWins: 0, draws: 0, avgLen: 0, capped: 0 };
    for (let g = 0; g < n; g++) {
      const seed = 5000 + g;
      const rng = makeRng(seed * 31 + mu.a * 7 + mu.b);
      // 앞뒤 자리 번갈아: 짝수 판은 A가 0번, 홀수 판은 A가 1번 자리
      const aSeat = g % 2;
      const levelOf = (seat) => (players === 2 ? (seat === aSeat ? mu.a : mu.b) : (seat === 0 ? mu.a : mu.b));
      const opts = {};
      for (const o of mod.meta.options || []) opts[o.key] = o.values[0].value;
      let state, k = 0;
      try {
        state = mod.init(opts, seed, players);
        while (k < 1500) {
          const s = mod.status(state);
          if (s.over) { if (s.winner == null) r.draws++; else if (s.winner === (players === 2 ? aSeat : 0)) r.aWins++; else r.bWins++; break; }
          const legal = mod.legalMoves(state);
          if (!legal.length) { res.errors.push({ seed, k, msg: '안 끝났는데 둘 수 없음' }); break; }
          const level = levelOf(state.turn);
          let m;
          if (level === 0) m = legal[rng.int(legal.length)];
          else {
            const t0 = performance.now();
            try { m = mod.ai(JSON.parse(JSON.stringify(state)), level, { seat: state.turn }); } catch (e) { res.errors.push({ seed, k, msg: `봇(레벨 ${level}) 예외: ${e.message}` }); m = null; }
            const dt = performance.now() - t0;
            const t = res.time[level]; t.calls++; t.ms += dt; t.max = Math.max(t.max, dt);
            if (!isLegal(state, legal, m)) { res.illegal++; if (res.errors.length < 10) res.errors.push({ seed, k, msg: `봇(레벨 ${level}) 비합법 수 ${JSON.stringify(m)}` }); m = legal[rng.int(legal.length)]; }
          }
          state = mod.apply(state, m).state; k++;
        }
        if (k >= 1500) r.capped++;
      } catch (e) { res.errors.push({ seed, k, msg: (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : String(e)) }); }
      r.games++; r.avgLen += k;
    }
    r.avgLen = Math.round(r.avgLen / Math.max(1, r.games));
    res.matchups.push(r);
  }
  writeFileSync(out, JSON.stringify(res));
}

async function coordinator() {
  const n = +arg('--games', 10);
  const only = arg('--only', '');
  const workers = +arg('--workers', Math.max(2, Math.min(12, os.cpus().length - 2)));
  const outDir = arg('--out', path.join(ROOT, 'bots'));
  mkdirSync(outDir, { recursive: true });
  const ids = readdirSync(GAMES_DIR).filter((d) => existsSync(path.join(GAMES_DIR, d, 'rules.js'))).filter((d) => !only || only.split(',').includes(d));
  const tasks = [];
  for (const id of ids) {
    const mod = await import(pathToFileURL(path.join(GAMES_DIR, id, 'rules.js')).href);
    const counts = mod.meta.playerCounts || [2];
    if (Math.max(...counts) < 2) continue; // 혼자 하는 게임은 봇 대결이 없다
    tasks.push({ id, out: path.join(outDir, `${id}.json`) });
  }
  // 무거운 게임(체스·장기·바둑)이 먼저 시작하도록
  const heavy = ['chess', 'janggi', 'go', 'blokus', 'morris', 'checkers', 'quoridor'];
  tasks.sort((a, b) => (heavy.includes(a.id) ? heavy.indexOf(a.id) : 99) - (heavy.includes(b.id) ? heavy.indexOf(b.id) : 99));
  console.log(`게임 ${tasks.length}개, 워커 ${workers}개, 대결당 ${n}판`);
  const t0 = Date.now();
  let idx = 0, done = 0;
  await new Promise((resolve) => {
    const launch = () => {
      if (idx >= tasks.length) { if (done >= tasks.length) resolve(); return; }
      const t = tasks[idx++];
      const child = spawn(process.execPath, [__filename, '--worker', '--game', t.id, '--games', String(n), '--out', t.out], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('close', (code) => { done++; console.log(`  ${t.id} 완료 (${Math.round((Date.now() - t0) / 1000)}s)${code ? ' ⚠️ code ' + code : ''}`); launch(); });
    };
    for (let i = 0; i < workers; i++) launch();
  });
  let md = `# 봇 품질 (대결당 ${n}판, 앞뒤 자리 번갈아)\n\n| 게임 | 쉬움 vs 무작위 | 보통 vs 무작위 | 어려움 vs 쉬움 | 평균 ms (L1/L2/L3) | 최대 ms (L1/L2/L3) | 비합법 | 예외 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`;
  for (const t of tasks) {
    if (!existsSync(t.out)) { md += `| ${t.id} | 결과 없음 | | | | | | |\n`; continue; }
    const r = JSON.parse(readFileSync(t.out, 'utf8'));
    const cell = (m) => `${m.aWins}승 ${m.bWins}패 ${m.draws}무${m.capped ? ' (미완 ' + m.capped + ')' : ''}`;
    const avg = [1, 2, 3].map((l) => (r.time[l].calls ? Math.round(r.time[l].ms / r.time[l].calls) : '-')).join('/');
    const max = [1, 2, 3].map((l) => Math.round(r.time[l].max)).join('/');
    const weak = r.matchups[1].aWins < r.matchups[1].bWins || r.matchups[2].aWins < r.matchups[2].bWins;
    md += `| ${weak || r.illegal || r.errors.length ? '❌ ' : ''}${r.game} | ${cell(r.matchups[0])} | ${cell(r.matchups[1])} | ${cell(r.matchups[2])} | ${avg} | ${max} | ${r.illegal} | ${r.errors.length} |\n`;
    for (const e of r.errors.slice(0, 5)) md += `|  | (seed ${e.seed}, ${e.k}수) ${e.msg} | | | | | | |\n`;
  }
  md += `\n${Math.round((Date.now() - t0) / 60000)}분 소요.\n`;
  writeFileSync(path.join(outDir, 'report.md'), md);
  console.log(md);
}

if (has('--worker')) worker().catch((e) => { console.error(e); process.exit(1); });
else coordinator().catch((e) => { console.error(e); process.exit(1); });
