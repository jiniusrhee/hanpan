// 온라인 방에서 봇 좌석 + 관전 + 4인(윷놀이) 동기화 점검
// 사용: node tools/online-test2.js <스크린샷 폴더>  (localhost:3210 서버 필요)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const mk = async (name) => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name} console] ${m.text()}`); });
  return page;
};
let n = 0;
const shot = async (page, label) => { const f = path.join(OUT, `${String(++n).padStart(2, '0')}-${label}.png`); await page.screenshot({ path: f }); };
const clickText = async (page, sel, text) => { for (const b of await page.$$(sel)) { const t = await b.evaluate((e) => e.textContent); if (t.includes(text)) { await b.click(); return true; } } return false; };

// ---- 1) 오셀로: 방장 + 봇, 관전자 ----
const A = await mk('A');
await A.goto('http://localhost:3210/game/othello', { waitUntil: 'networkidle0' });
await A.waitForSelector('.mode-btn'); await clickText(A, '.mode-btn', '친구와 온라인'); await sleep(200);
await A.click('.btn-primary.btn-lg'); await A.waitForSelector('.room-code .rc-value');
const code = await A.$eval('.room-code .rc-value', (e) => e.textContent.trim());
await clickText(A, '.seat-row .btn', '봇 넣기'); await sleep(500);
await clickText(A, '.screen .btn-primary.btn-lg', '시작');
await A.waitForSelector('.board .cell'); await sleep(500);
// 관전자 참가
const C = await mk('C');
await C.goto(`http://localhost:3210/join/${code}`, { waitUntil: 'networkidle0' });
await C.waitForSelector('.board .cell', { timeout: 10000 }); await sleep(500);
// 방장이 한 수 두고 봇 응답 기다림
const myTurnA = (await A.$eval('.board-status', (e) => e.textContent)).includes('내 차례');
if (!myTurnA) await sleep(2500);
await A.click('.board .cell.hl-move'); await sleep(4000);
const piecesA = await A.$$eval('.board .piece', (els) => els.length);
const piecesC = await C.$$eval('.board .piece', (els) => els.length);
console.log('오셀로 방장/관전자 말 개수:', piecesA, piecesC, '(시작 4개, 사람+봇 한 수씩이면 6개)');
await shot(A, 'othello-host'); await shot(C, 'othello-spectator');
if (piecesA !== piecesC || piecesA < 6) errors.push('오셀로 봇/관전 동기화 실패');

// ---- 2) 윷놀이 4인: 방장 + 손님 + 봇 2 ----
const H = await mk('H'), G = await mk('G');
await H.goto('http://localhost:3210/game/yut', { waitUntil: 'networkidle0' });
await H.waitForSelector('.mode-btn'); await clickText(H, '.mode-btn', '친구와 온라인'); await sleep(200);
await clickText(H, '.seg button', '4명'); await sleep(100);
await H.click('.btn-primary.btn-lg'); await H.waitForSelector('.room-code .rc-value');
const code2 = await H.$eval('.room-code .rc-value', (e) => e.textContent.trim());
await G.goto(`http://localhost:3210/join/${code2}`, { waitUntil: 'networkidle0' });
await G.waitForSelector('.seat-list'); await sleep(500);
await clickText(H, '.screen .btn-primary.btn-lg', '시작');
await H.waitForSelector('.yut-ctl', { timeout: 10000 }); await G.waitForSelector('.yut-ctl', { timeout: 10000 });
// 방장이 던지기 (방장이 0번 자리 = 선공)
for (let k = 0; k < 4; k++) {
  const th = await H.$('.yut-ctl .btn-primary'); if (th) { await th.click(); await sleep(1400); continue; }
  const nt = await H.$('.yut-ctl .btn-good'); if (nt) { await nt.click(); await sleep(1500); continue; }
  await sleep(1500);
}
await sleep(6000); // 봇들 차례 진행
const subH = await H.$$eval('.seat-panel .sp-sub', (els) => els.map((e) => e.textContent));
const subG = await G.$$eval('.seat-panel .sp-sub', (els) => els.map((e) => e.textContent));
console.log('윷놀이 좌석 상태(방장):', subH.join(' | '));
console.log('윷놀이 좌석 상태(손님):', subG.join(' | '));
await shot(H, 'yut-host'); await shot(G, 'yut-guest');
const norm = (a) => a.map((s) => s.replace(/생각 중…/g, '').trim()).join('|');
if (norm(subH) !== norm(subG)) errors.push('윷놀이 4인 동기화 불일치');
await browser.close();
if (errors.length) { console.log('⚠️ 오류:'); errors.forEach((e) => console.log('  ', e)); process.exit(1); }
console.log('✅ 봇 좌석/관전/4인 동기화 OK');
