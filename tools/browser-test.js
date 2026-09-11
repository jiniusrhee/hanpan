// 헤드리스 크롬으로 화면을 열어 스크린샷을 찍고 콘솔 오류를 수집한다.
// 사용: node tools/browser-test.js <url> <outdir> [script.js]
//   script.js 가 있으면 export default async (page, shot) => {...} 를 실행한다.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [url = 'http://localhost:3210/', outdir = './shots', scriptFile] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });

let n = 0;
const shot = async (name) => { const f = path.join(outdir, `${String(++n).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }); console.log('📸', f); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(url, { waitUntil: 'networkidle0' });
await sleep(300);
await shot('home');
if (scriptFile) {
  const mod = await import(pathToFileURL(path.resolve(scriptFile)).href);
  try { await mod.default(page, shot, { sleep, browser }); } catch (e) { errors.push(`[script] ${e.stack}`); }
}
await browser.close();
if (errors.length) { console.log('⚠️ 콘솔/네트워크 문제:'); for (const e of errors) console.log('  ', e); process.exit(1); }
console.log('✅ 오류 없음');
