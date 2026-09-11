// 기기별 레이아웃 시뮬레이션
// 여러 기기(폰, 폴드, 태블릿, PC) × 모든 게임 × 인원수 조합마다 실제 화면에서 N턴을 진행하며
// 레이아웃 이상(가로 넘침, 스크롤 필요, 보드가 너무 작음, 버튼이 너무 작음, 글자 잘림, 겹침, 콘솔 오류)을 수집한다.
// 사용: node tools/sim-devices.js --out ./sim [--steps 100] [--devices a,b] [--games x,y] [--server http://localhost:3210]
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', './sim');
const STEPS = +arg('--steps', 100);
const SERVER = arg('--server', 'http://localhost:3210');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-se', w: 375, h: 667, dpr: 1, mobile: true },
  { name: 'iphone-14', w: 390, h: 844, dpr: 3, mobile: true },
  { name: 'iphone-15-pro-max', w: 430, h: 932, dpr: 1, mobile: true },
  { name: 'galaxy-s23', w: 360, h: 780, dpr: 2, mobile: true },
  { name: 'galaxy-fold5-cover', w: 344, h: 882, dpr: 1, mobile: true },
  { name: 'galaxy-fold5-open', w: 720, h: 840, dpr: 1, mobile: true },
  { name: 'galaxy-flip', w: 360, h: 880, dpr: 1, mobile: true },
  { name: 'phone-landscape', w: 844, h: 390, dpr: 1, mobile: true },
  { name: 'ipad-mini', w: 744, h: 1133, dpr: 1, mobile: true },
  { name: 'ipad-pro-12', w: 1024, h: 1366, dpr: 1, mobile: true },
  { name: 'tablet-landscape', w: 1180, h: 820, dpr: 1, mobile: true },
  { name: 'laptop', w: 1366, h: 768, dpr: 1, mobile: false },
  { name: 'desktop-fhd', w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'ultrawide', w: 2560, h: 1080, dpr: 1, mobile: false },
  { name: 'small-window', w: 500, h: 600, dpr: 1, mobile: false },
];
const devFilter = arg('--devices', '');
const devices = devFilter ? DEVICES.filter((d) => devFilter.split(',').includes(d.name)) : DEVICES;

const registry = await import(pathToFileURL(path.resolve('public/js/core/registry.js')).href);
const gameFilter = arg('--games', '');
const games = registry.GAMES.filter((g) => !gameFilter || gameFilter.split(',').includes(g.id));
const configs = [];
for (const g of games) for (const n of g.players) configs.push({ id: g.id, name: g.name, players: n });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const METRICS = () => {
  const vw = innerWidth, vh = innerHeight;
  const de = document.documentElement;
  const m = { vw, vh, overflowX: de.scrollWidth > vw + 1, pageH: de.scrollHeight, needsScroll: de.scrollHeight > vh + 2 };
  const q = (s) => document.querySelector(s);
  const ba = q('.board-area');
  if (ba) { const r = ba.getBoundingClientRect(); m.board = { w: Math.round(r.width), h: Math.round(r.height) }; m.boardOut = r.bottom > vh + 1 || r.top < 0; m.boardRatio = r.width / Math.min(vw, vh); }
  const ab = q('.action-bar');
  if (ab && ab.children.length) { const r = ab.getBoundingClientRect(); m.actionVisible = r.bottom <= vh + 1 && r.top >= 0; }
  const small = [];
  for (const b of document.querySelectorAll('.play button, .screen button')) { const r = b.getBoundingClientRect(); if (r.width && r.height && Math.min(r.width, r.height) < 34 && !b.classList.contains('plain')) small.push((b.textContent.trim() || b.className).slice(0, 14)); }
  m.smallButtons = [...new Set(small)];
  // 여러 보드(배틀십 미니맵 등)가 있으면 가장 큰 보드의 칸 크기를 본다
  let cellMax = null;
  for (const b of document.querySelectorAll('.board')) { const c = b.querySelector('.cell'); if (!c) continue; const r = c.getBoundingClientRect(); const v = Math.min(r.width, r.height); if (cellMax == null || v > cellMax) cellMax = v; }
  if (cellMax != null) m.cell = Math.round(cellMax * 10) / 10;
  const clipped = [];
  for (const el of document.querySelectorAll('.btn, .yut-chip, .yc-table td, .chip, .badge, .gc-name, .opt-label')) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis' && getComputedStyle(el).overflow !== 'auto') clipped.push(el.className.split(' ')[0] + ':' + el.textContent.trim().slice(0, 12));
  }
  m.clipped = [...new Set(clipped)];
  let overlap = false;
  if (ba) { const b = ba.getBoundingClientRect(); for (const p of document.querySelectorAll('.seat-panel')) { const r = p.getBoundingClientRect(); if (r.width && r.left < b.right - 2 && r.right > b.left + 2 && r.top < b.bottom - 2 && r.bottom > b.top + 2) overlap = true; } }
  m.overlap = overlap;
  const rc = q('.result-card');
  if (rc) { const r = rc.getBoundingClientRect(); m.resultOut = r.top < -1 || r.bottom > vh + 1; }
  let outX = false;
  for (const el of document.querySelectorAll('.seat-panel, .board-area, .action-bar, .board-status, .card, .game-card')) { const r = el.getBoundingClientRect(); if (r.width && (r.left < -1 || r.right > vw + 1)) outX = true; }
  m.outX = outX;
  return m;
};

function anomaliesOf(m, dev, screen) {
  const a = [];
  if (m.overflowX || m.outX) a.push('overflow-x');
  if (screen === 'play') {
    if (m.needsScroll) a.push('scroll');
    if (m.board && m.cell != null && dev.mobile && m.boardRatio < 0.45) a.push('small-board');
    if (m.cell != null && m.cell < 20) a.push('tiny-cells');
    if (m.actionVisible === false) a.push('actions-hidden');
    if (m.overlap) a.push('overlap');
    if (m.resultOut) a.push('result-out');
  }
  if (m.smallButtons.length) a.push('small-buttons');
  if (m.clipped.length) a.push('clipped');
  return a;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const t0 = Date.now();
let totalSteps = 0, totalGames = 0;

for (const dev of devices) {
  const page = await browser.newPage();
  await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile });
  await page.evaluateOnNewDocument(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }'; document.head.appendChild(st); }); });
  let errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 일반 화면: 홈, 설정, 대기실
  for (const [screen, url, ready] of [['home', '/', '.game-card'], ['setup', '/game/yut', '.mode-btn'], ['setup-solo', '/game/sudoku', '.mode-btn']]) {
    errors = [];
    await page.goto(SERVER + url, { waitUntil: 'networkidle0' });
    await page.waitForSelector(ready, { timeout: 10000 });
    await sleep(200);
    const m = await page.evaluate(METRICS);
    const an = anomaliesOf(m, dev, screen);
    if (errors.length) an.push('errors');
    results.push({ device: dev.name, screen, game: '-', players: 0, steps: 1, anomalies: Object.fromEntries(an.map((x) => [x, 1])), sample: m, errors: errors.slice(0, 3) });
    if (an.length) await page.screenshot({ path: path.join(OUT, `${dev.name}__${screen}.png`) });
  }
  // 대기실 (서버가 있을 때만)
  try {
    errors = [];
    await page.goto(SERVER + '/game/yut', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.mode-btn');
    for (const b of await page.$$('.mode-btn')) { const t = await b.evaluate((e) => e.textContent); if (t.includes('온라인')) { await b.click(); break; } }
    await sleep(150);
    for (const b of await page.$$('.seg button')) { const t = await b.evaluate((e) => e.textContent); if (t === '4명') { await b.click(); break; } }
    await page.click('.btn-primary.btn-lg');
    await page.waitForSelector('.room-code', { timeout: 8000 });
    await sleep(300);
    const m = await page.evaluate(METRICS);
    const an = anomaliesOf(m, dev, 'lobby');
    if (errors.length) an.push('errors');
    results.push({ device: dev.name, screen: 'lobby', game: '-', players: 4, steps: 1, anomalies: Object.fromEntries(an.map((x) => [x, 1])), sample: m, errors: errors.slice(0, 3) });
    if (an.length) await page.screenshot({ path: path.join(OUT, `${dev.name}__lobby.png`) });
    await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
  } catch (e) { results.push({ device: dev.name, screen: 'lobby', game: '-', players: 4, steps: 0, anomalies: { 'lobby-failed': 1 }, errors: [String(e.message).slice(0, 120)] }); }

  // 플레이 화면: 게임 × 인원
  for (const cfg of configs) {
    errors = [];
    const counts = {};
    const shots = new Set();
    let gamesDone = 0, stuck = 0, sample = null;
    const tc = Date.now();
    try {
      await page.goto(`${SERVER}/play?sim=${cfg.id}&players=${cfg.players}`, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__hanpan && window.__hanpan.match && window.__hanpan.match.state, { timeout: 15000 });
      await sleep(300);
      for (let i = 0; i < STEPS; i++) {
        const r = await page.evaluate(() => window.__hanpan.step());
        totalSteps++;
        if (r.stuck) { stuck++; await page.evaluate(() => window.__hanpan.restart()); await sleep(200); continue; }
        await sleep(15);
        const m = await page.evaluate(METRICS);
        if (i === 0 || i === Math.floor(STEPS / 2)) sample = m;
        const an = anomaliesOf(m, dev, 'play');
        for (const a of an) {
          counts[a] = (counts[a] || 0) + 1;
          if (!shots.has(a) && shots.size < 3) { shots.add(a); await page.screenshot({ path: path.join(OUT, `${dev.name}__${cfg.id}-${cfg.players}p__${a}.png`) }); }
        }
        if (r.over) {
          gamesDone++; totalGames++;
          await sleep(1300); // 결과 오버레이가 뜬 뒤 측정
          const m2 = await page.evaluate(METRICS);
          const an2 = anomaliesOf(m2, dev, 'play');
          if (an2.includes('result-out')) { counts['result-out'] = (counts['result-out'] || 0) + 1; if (!shots.has('result-out')) { shots.add('result-out'); await page.screenshot({ path: path.join(OUT, `${dev.name}__${cfg.id}-${cfg.players}p__result-out.png`) }); } }
          if (!shots.has('result')) { shots.add('result'); if (['iphone-14', 'phone-landscape', 'galaxy-fold5-cover'].includes(dev.name)) await page.screenshot({ path: path.join(OUT, `${dev.name}__${cfg.id}-${cfg.players}p__result.png`) }); }
          await page.evaluate(() => window.__hanpan.restart());
          await sleep(250);
        }
      }
      if (errors.length) counts.errors = errors.length;
      // 마지막 상태 스크린샷 (대표 기기만)
      if (['iphone-14', 'galaxy-fold5-cover', 'phone-landscape', 'ipad-pro-12', 'desktop-fhd'].includes(dev.name)) await page.screenshot({ path: path.join(OUT, `${dev.name}__${cfg.id}-${cfg.players}p.png`) });
    } catch (e) {
      counts.failed = 1; errors.push(String(e.message).slice(0, 200));
    }
    results.push({ device: dev.name, screen: 'play', game: cfg.id, players: cfg.players, steps: STEPS, games: gamesDone, stuck, anomalies: counts, sample, errors: [...new Set(errors)].slice(0, 4) });
    process.stdout.write(`${dev.name.padEnd(20)} ${cfg.id.padEnd(12)} ${cfg.players}p  판:${String(gamesDone).padStart(3)}  ${Math.round((Date.now() - tc) / 1000)}s  ${Object.keys(counts).length ? JSON.stringify(counts) : 'OK'}\n`);
    writeFileSync(path.join(OUT, 'sim-results.json'), JSON.stringify({ devices, configs, steps: STEPS, results }, null, 1));
  }
  await page.close();
}
await browser.close();

// 요약
const byIssue = {};
for (const r of results) for (const [k, v] of Object.entries(r.anomalies || {})) { (byIssue[k] = byIssue[k] || []).push(`${r.device}/${r.screen}${r.game !== '-' ? '/' + r.game + '-' + r.players + 'p' : ''}(${v})`); }
let md = `# 기기별 시뮬레이션 요약\n\n- 기기 ${devices.length}종 × 설정 ${configs.length}개, 설정당 ${STEPS}턴 (총 ${totalSteps}턴, 완주 ${totalGames}판), ${Math.round((Date.now() - t0) / 60000)}분 소요\n\n`;
const issues = Object.keys(byIssue).sort();
if (!issues.length) md += '이상 없음 🎉\n';
for (const k of issues) md += `## ${k} (${byIssue[k].length}건)\n${byIssue[k].slice(0, 60).map((x) => '- ' + x).join('\n')}${byIssue[k].length > 60 ? `\n- … 외 ${byIssue[k].length - 60}건` : ''}\n\n`;
writeFileSync(path.join(OUT, 'sim-summary.md'), md);
console.log(md);
