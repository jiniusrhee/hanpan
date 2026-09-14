// 서버 깨우기 화면 테스트: 앱(3210)에 config.js를 끼워 넣어 서버 주소를 잠든 척하는 프록시(3211)로 돌린 뒤
//  1) 온라인 방 만들기 → 깨우기 화면이 뜨고, 프록시가 깨어나면 방이 만들어지는지
//  2) 초대 링크(/room/CODE) 진입 → 깨우기 화면 → 방에 들어가는지
//  3) 그만두기 버튼이 바로 닫히는지
// 사용: node tools/sleepy-proxy.js --sleep 12000 를 먼저 띄우고, node tools/wake-test.js <outdir>
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || './wake-shots';
mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'http://localhost:3210';
const PROXY_WS = process.env.PROXY_WS || 'ws://localhost:3211/ws';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
async function newPage(wsUrl = PROXY_WS, { fresh = false } = {}) {
  // 페이지마다 새 브라우저 컨텍스트: 앞 페이지가 등록한 서비스 워커가 config.js를 캐시에서 주면 가로채기가 안 되기 때문
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/\/config\.js(\?|$)/.test(req.url())) req.respond({ status: 200, contentType: 'application/javascript', body: `window.APP_CONFIG = { wsUrl: '${wsUrl}', kakaoJsKey: '' };` });
    else req.continue();
  });
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error:', m.text().slice(0, 160)); });
  if (fresh) await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('hanpan.session.v1'); } catch { /* */ } });
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('hanpan.settings.v1', JSON.stringify({ name: '테스터', sound: false, haptic: false, theme: 'dark', anim: true, boardTheme: 'wood' })); } catch { /* */ } });
  return page;
}
const wakeVisible = (page) => page.evaluate(() => { const w = document.querySelector('.wake'); return !!w && getComputedStyle(w).opacity !== '0'; });
const wakeText = (page) => page.evaluate(() => { const w = document.querySelector('.wake'); return w ? [w.querySelector('.wake-title')?.textContent, w.querySelector('.wake-dots')?.textContent, w.querySelector('.wake-sec')?.textContent, w.querySelector('.wake-bar i')?.style.width].join(' | ') : ''; });

// 1) 방 만들기 흐름 (프록시가 잠든 상태)
let page = await newPage();
const t0 = Date.now();
await page.goto(`${APP}/game/chess`, { waitUntil: 'load' }); await sleep(800);
await page.evaluate(() => { for (const b of document.querySelectorAll('.mode-btn')) if (b.textContent.includes('친구와 온라인')) b.click(); });
await sleep(200);
const startText = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('방 만들고')); if (b) b.click(); return b ? b.textContent : ''; });
ok('온라인 시작 버튼', startText.includes('방 만들고'), startText);
await sleep(600);
ok('1.2초 전에는 깨우기 화면 없음', !(await wakeVisible(page)));
await sleep(1400);
const shown = await wakeVisible(page);
ok('잠든 서버 → 깨우기 화면 표시', shown, await wakeText(page));
await page.screenshot({ path: path.join(OUT, 'wake-1-early.png') });
await sleep(6000);
ok('깨우는 동안 진행 표시', await wakeVisible(page), await wakeText(page));
await page.screenshot({ path: path.join(OUT, 'wake-2-mid.png') });
// 방이 만들어질 때까지 (최대 60초)
let code = '';
for (let i = 0; i < 120; i++) { await sleep(500); const u = page.url(); const m = u.match(/\/room\/([A-Z0-9]+)/); if (m) { code = m[1]; break; } }
ok('프록시가 깨어난 뒤 방 생성', !!code, `${code} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
await sleep(900);
ok('방 생성 뒤 깨우기 화면 닫힘', !(await page.$('.wake')));
await page.screenshot({ path: path.join(OUT, 'wake-3-room.png') });

// 2) 초대 링크로 들어오기 — PROXY2_WS(잠든 두 번째 프록시)가 있으면 깨우기 화면을 거쳐, 없으면 깨어 있는 서버로 바로
const PROXY2_WS = process.env.PROXY2_WS || '';
const page2 = await newPage(PROXY2_WS || PROXY_WS);
await page2.goto(`${APP}/join/${code}`, { waitUntil: 'load' }); await sleep(800);
await sleep(1500);
if (PROXY2_WS) {
  ok('잠든 서버 + 초대 링크 → 깨우기 화면 표시', await wakeVisible(page2), await wakeText(page2));
  await page2.screenshot({ path: path.join(OUT, 'wake-5-join-waking.png') });
  let joined = false;
  for (let i = 0; i < 120; i++) { await sleep(500); if (!(await page2.$('.wake')) && (await page2.evaluate(() => document.body.innerText.includes('초대')))) { joined = true; break; } }
  ok('프록시가 깨어난 뒤 초대 링크로 입장', joined && page2.url().includes(`/room/${code}`), page2.url());
} else {
  ok('깨어 있는 서버: 초대 링크 즉시 입장 (화면 없음)', !(await page2.$('.wake')) && page2.url().includes(`/room/${code}`), page2.url());
}
const seats = await page2.evaluate(() => document.body.innerText.includes('테스터'));
ok('대기실에 참가자 표시', seats);
await page2.screenshot({ path: path.join(OUT, 'wake-4-join.png') });

// 3) 그만두기: 프록시를 다시 재울 수 없으니 존재하지 않는 서버 주소로 시도
const page3 = await newPage('ws://localhost:3299/ws', { fresh: true });
await page3.goto(`${APP}/game/othello`, { waitUntil: 'load' }); await sleep(800);
await page3.evaluate(() => { for (const b of document.querySelectorAll('.mode-btn')) if (b.textContent.includes('친구와 온라인')) b.click(); });
await sleep(200);
await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('방 만들고')); if (b) b.click(); });
await sleep(2200);
ok('죽은 서버 → 깨우기 화면 표시', await wakeVisible(page3), (await wakeText(page3)) + ' ' + page3.url());
await page3.evaluate(() => document.querySelector('.wake-cancel')?.click());
await sleep(600);
const gone = !(await page3.$('.wake'));
const btnEnabled = await page3.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('방 만들고')); return b && !b.disabled; });
ok('그만두기 → 화면 닫히고 버튼 복구', gone && btnEnabled, `gone=${gone} enabled=${btnEnabled}`);
const toasts = await page3.evaluate(() => document.getElementById('toasts')?.innerText || '');
ok('취소는 오류 토스트 없음', !toasts.includes('취소'), JSON.stringify(toasts));

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
process.exit(bad.length ? 1 : 0);
