// 기기별 시뮬레이션 결과(sim-results.json) 요약 출력
// 사용: node tools/sim-report.js <sim 폴더> [--all]
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!dirs.length) dirs.push('./sim');
const all = process.argv.includes('--all');
const rows = dirs.flatMap((d) => JSON.parse(readFileSync(path.join(d, 'sim-results.json'), 'utf8')).results);
const play = rows.filter((r) => r.screen === 'play');
const other = rows.filter((r) => r.screen !== 'play');

const totalSteps = play.reduce((a, r) => a + (r.steps || 0), 0);
const totalGames = play.reduce((a, r) => a + (r.games || 0), 0);
console.log(`설정 ${play.length}개 (기기 ${new Set(play.map((r) => r.device)).size}종), 총 ${totalSteps}턴, 완주 ${totalGames}판`);

const byIssue = {};
for (const r of rows) for (const [k, v] of Object.entries(r.anomalies || {})) (byIssue[k] = byIssue[k] || []).push({ r, v });
console.log('\n이상 유형별 건수:');
for (const [k, list] of Object.entries(byIssue).sort((a, b) => b[1].length - a[1].length)) {
  const devs = new Set(list.map((x) => x.r.device));
  console.log(`  ${k.padEnd(16)} ${String(list.length).padStart(4)}개 설정 · 기기 ${devs.size}종 · 최대 ${Math.max(...list.map((x) => x.v))}회`);
}

console.log('\n화면별 (플레이 외):');
for (const r of other) console.log(`  ${r.device.padEnd(20)} ${r.screen.padEnd(11)} ${Object.keys(r.anomalies || {}).length ? JSON.stringify(r.anomalies) + ' ' + ((r.sample && r.sample.smallButtons) || []).join(',') + ' ' + ((r.sample && r.sample.clipped) || []).join(',') : 'OK'}`);

console.log('\n플레이 화면 이상 (턴 수 기준 5% 이상만' + (all ? ', --all' : '') + '):');
for (const r of play) {
  const sig = Object.entries(r.anomalies || {}).filter(([k, v]) => all || v >= r.steps * 0.05 || k === 'errors' || k === 'failed');
  if (!sig.length) continue;
  console.log(`  ${r.device.padEnd(20)} ${r.game.padEnd(12)} ${r.players}p  ${sig.map(([k, v]) => `${k}:${v}`).join(' ')}${r.errors && r.errors.length ? '  ⚠ ' + r.errors[0].slice(0, 80) : ''}`);
}
