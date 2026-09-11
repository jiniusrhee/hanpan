// 온라인 2인 대전 흐름 점검 (방 만들기 → 초대 링크 참가 → 동기화 → 이모티콘 → 무르기 → 재접속 → 다시 하기)
// 사용: node tools/online-test.js <스크린샷 폴더>  (서버가 localhost:3210 에 떠 있어야 함)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
const OUT = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
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
const shot = async (page, label) => { const f = path.join(OUT, `${String(++n).padStart(2, '0')}-${label}.png`); await page.screenshot({ path: f }); console.log('📸', f); };
const A = await mk('A'), B = await mk('B');
await A.goto('http://localhost:3210/game/tictactoe', { waitUntil: 'networkidle0' });
await A.waitForSelector('.mode-btn');
const modes = await A.$$('.mode-btn'); await modes[1].click(); await sleep(200); // 친구와 온라인
await A.click('.btn-primary.btn-lg');
await A.waitForSelector('.room-code .rc-value', { timeout: 8000 });
const code = await A.$eval('.room-code .rc-value', (e) => e.textContent.trim());
console.log('방 코드:', code);
await shot(A, 'A-lobby');
await B.goto(`http://localhost:3210/join/${code}`, { waitUntil: 'networkidle0' });
await B.waitForSelector('.seat-list', { timeout: 8000 });
await sleep(500);
await shot(B, 'B-lobby');
await shot(A, 'A-lobby-2');
// 방장 시작
const startBtn = await A.$('.screen .btn-primary.btn-lg');
await startBtn.click();
await A.waitForSelector('.board .cell', { timeout: 8000 });
await B.waitForSelector('.board .cell', { timeout: 8000 });
await sleep(1200);
await A.waitForSelector('.board-status', { timeout: 5000 });
// 누가 X(선공)인지 확인
const aTurn = await A.$eval('.board-status', (e) => e.textContent);
const first = aTurn.includes('내 차례') ? A : B;
const second = first === A ? B : A;
console.log('선공:', first === A ? 'A(방장)' : 'B(손님)');
const cell = (page, r, c) => page.$(`.board .cell[data-r="${r}"][data-c="${c}"]`);
await (await cell(first, 1, 1)).click(); await sleep(800);
await (await cell(second, 0, 0)).click(); await sleep(800);
await (await cell(first, 0, 2)).click(); await sleep(800);
await shot(A, 'A-play'); await shot(B, 'B-play');
const countA = await A.$$eval('.board .piece', (els) => els.length);
const countB = await B.$$eval('.board .piece', (els) => els.length);
console.log('말 개수 A/B:', countA, countB);
// 이모티콘
const emoteBtn = await A.$$('.action-bar .btn');
for (const b of emoteBtn) { const t = await b.evaluate((e) => e.textContent); if (t.includes('이모티콘')) { await b.click(); break; } }
await A.waitForSelector('.emote-grid button'); await A.click('.emote-grid button'); await sleep(600);
await shot(B, 'B-emote');
// 무르기 요청 (first가 방금 뒀으므로 first가 요청)
const undoBtns = await first.$$('.action-bar .btn');
for (const b of undoBtns) { const t = await b.evaluate((e) => e.textContent); if (t.includes('무르기')) { await b.click(); break; } }
await second.waitForSelector('.modal', { timeout: 5000 }); await sleep(300);
await shot(second, 'undo-request');
const mb = await second.$$('.modal .m-btns .btn'); await mb[1].click(); await sleep(800);
const countA2 = await A.$$eval('.board .piece', (els) => els.length);
console.log('무르기 후 말 개수:', countA2);
// 손님 새로고침 → 재접속 복구
await B.reload({ waitUntil: 'networkidle0' });
await B.waitForSelector('.board .cell', { timeout: 10000 }); await sleep(800);
const countB3 = await B.$$eval('.board .piece', (els) => els.length);
console.log('재접속 후 B 말 개수:', countB3);
await shot(B, 'B-rejoined');
// 끝까지 두기 (first: X 승리 시도) — 현재 말: first(1,1),(0,2) second(0,0) 상태에서 무르기로 (0,2) 제거됨 → first 차례
await (await cell(first, 2, 0)).click(); await sleep(700);
await (await cell(second, 0, 2)).click(); await sleep(700);
await (await cell(first, 2, 2)).click(); await sleep(700);
await (await cell(second, 2, 1)).click(); await sleep(700);
await (await cell(first, 0, 1)).click(); await sleep(700);
await (await cell(second, 1, 0)).click(); await sleep(700);
await (await cell(first, 1, 2)).click(); await sleep(2000);
await shot(A, 'A-result'); await shot(B, 'B-result');
// 다시 하기 양쪽 동의
const rem = async (p) => { const bs = await p.$$('.result-card .btn, .action-bar .btn'); for (const b of bs) { const t = await b.evaluate((e) => e.textContent); if (t.includes('다시')) { await b.click(); return true; } } return false; };
console.log('rematch A:', await rem(A)); await sleep(500); console.log('rematch B:', await rem(B));
await sleep(1500);
await A.waitForSelector('.board .cell', { timeout: 8000 });
const piecesAfter = await A.$$eval('.board .piece', (els) => els.length);
console.log('재대국 시작 후 말 개수:', piecesAfter);
await shot(A, 'A-rematch');
await browser.close();
if (errors.length) { console.log('⚠️ 오류:'); errors.forEach((e) => console.log('  ', e)); process.exit(1); }
console.log('✅ 온라인 흐름 OK');
