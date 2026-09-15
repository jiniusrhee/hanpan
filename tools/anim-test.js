// 봇 대전 애니메이션 검증: 봇이 앞 수의 연출이 끝나기 전에 다음 수를 두면
// 이동 중 숨겨 둔 말이 지워져 "말이 사라진 것처럼" 보인다. 그 겹침이 없는지 실제 브라우저에서 측정한다.
// 각 게임마다 봇끼리 두게 하고, 상태 갱신 시각과 뷰가 요청한 애니메이션 종료 시각(match.lockUntil)을 비교한다.
// 사용: node tools/anim-test.js [outdir] [--games yut,ludo] [--seconds 20]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : './anim-shots';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'http://localhost:3210';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SECONDS = +arg('--seconds', 18);
// 연출이 긴(그래서 잘리기 쉬운) 게임들
const GAMES = (arg('--games', 'yut,ludo,mancala,othello,checkers,backgammon,yacht,connect4,blokus,g2048') || '').split(',').filter(Boolean);
const PLAYERS = { yut: 4, ludo: 4, blokus: 4, yacht: 3, g2048: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const rows = [];

for (const game of GAMES) {
  const n = PLAYERS[game] || 2;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('hanpan.settings.v1', JSON.stringify({ name: '테스터', sound: false, haptic: false, theme: 'dark', anim: true, boardTheme: 'wood' })); } catch { /* */ } });
  const bots = game === 'g2048' ? '0' : 'all';
  await page.goto(`${APP}/play?sim=${game}&players=${n}&bots=${bots}&level=1`, { waitUntil: 'load' });
  await sleep(1200);

  // 상태 갱신마다 (시각, 이 갱신이 요청한 애니메이션 종료 시각) 을 기록한다
  const hooked = await page.evaluate(() => {
    const H = window.__hanpan;
    if (!H || !H.match) return false;
    const m = H.match;
    window.__anim = { updates: [], overlaps: [], ghosts: 0, hidden: 0 };
    const orig = m.hooks.onState;
    m.hooks.onState = (state, events, prev, animate) => {
      const now = performance.now();
      const a = window.__anim;
      const prevEnd = a.updates.length ? a.updates[a.updates.length - 1].lockUntil : 0;
      // 앞 연출이 끝나기 전에 새 갱신이 들어오면 연출이 잘린다
      if (animate && prevEnd > now + 1) a.overlaps.push({ at: Math.round(now), cut: Math.round(prevEnd - now) });
      orig(state, events, prev, animate);
      a.updates.push({ at: Math.round(now), lockUntil: m.lockUntil, animate: !!animate });
    };
    return true;
  });
  if (!hooked) { rows.push({ game, ok: false, note: '훅 실패' }); await ctx.close(); continue; }

  // 봇끼리 두는 동안 지켜본다. 판이 끝나면 다시 시작해서 계속 관찰한다.
  const t0 = Date.now();
  let restarts = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    await sleep(700);
    const over = await page.evaluate(() => !!(window.__hanpan && window.__hanpan.isOver));
    if (over && restarts < 3) { restarts++; await page.evaluate(() => window.__hanpan.restart()); await sleep(900); }
  }
  const r = await page.evaluate(() => {
    const a = window.__anim;
    // 화면에서 사라진(opacity 0) 말이 남아 있는지 — 연출이 잘렸을 때 생기는 흔적
    const stuck = [...document.querySelectorAll('.board-area *')].filter((el) => el.style && el.style.opacity === '0').length;
    return { updates: a.updates.length, animated: a.updates.filter((u) => u.animate).length, overlaps: a.overlaps.slice(0, 5), overlapCount: a.overlaps.length, stuck };
  });
  await page.screenshot({ path: path.join(OUT, `${game}.png`) });
  rows.push({ game, players: n, ...r, errors: errors.slice(0, 3), ok: r.overlapCount === 0 && r.stuck === 0 && errors.length === 0 });
  const mark = rows[rows.length - 1].ok ? '✅' : '❌';
  console.log(`${mark} ${game.padEnd(11)} ${n}인  갱신 ${r.updates}(연출 ${r.animated})  잘림 ${r.overlapCount}  사라진말 ${r.stuck}  오류 ${errors.length}`);
  if (r.overlaps.length) console.log('     잘린 예:', JSON.stringify(r.overlaps.slice(0, 3)));
  if (errors.length) console.log('     오류:', errors.slice(0, 2).join(' | '));
  await ctx.close();
}

await browser.close();
writeFileSync(path.join(OUT, 'anim-results.json'), JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} 게임 통과`);
process.exit(bad.length ? 1 : 0);
