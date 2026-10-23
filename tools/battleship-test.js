// 온라인 배틀십 비밀 유지 점검
// 1) 두 사람이 각자 배치한 뒤, 상대 기기에 내 함대 위치가 남아 있지 않은지 (상태·수 기록 전부)
// 2) 포격 결과(명중·빗나감·격침)가 양쪽에 똑같이 반영되는지
// 3) 새로고침으로 다시 들어와도 내 배치는 살아 있고 상대 배치는 여전히 없는지
// 4) 거짓 격침 주장이 거부되는지
// 사용: node tools/battleship-test.js <스크린샷 폴더>   (서버가 localhost:3210 에 떠 있어야 함)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || './bs-shots';
mkdirSync(OUT, { recursive: true });
const SERVER = process.env.SERVER || 'http://localhost:3210';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const mk = async (name) => {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text().slice(0, 140)}`); });
  await page.evaluateOnNewDocument((nm) => {
    try {
      localStorage.setItem('hanpan.settings.v1', JSON.stringify({ name: nm, sound: false, haptic: false, theme: 'dark', anim: true, boardTheme: 'wood' }));
      localStorage.setItem('hanpan.debug', '1');
    } catch { /* */ }
  }, name);
  return page;
};

const A = await mk('선장A'), B = await mk('선장B');

// ── 방 만들기 → 참가 → 시작 ──
await A.goto(`${SERVER}/game/battleship`, { waitUntil: 'load' });
await A.waitForSelector('.mode-btn');
await A.evaluate(() => { for (const b of document.querySelectorAll('.mode-btn')) if (b.textContent.includes('친구와 온라인')) b.click(); });
await sleep(250);
await A.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('방 만들고')); b.click(); });
await A.waitForSelector('.room-code .rc-value', { timeout: 15000 });
const code = await A.$eval('.room-code .rc-value', (e) => e.textContent.trim());
console.log('방 코드:', code);
await B.goto(`${SERVER}/join/${code}`, { waitUntil: 'load' });
await B.waitForSelector('.seat-list', { timeout: 15000 });
await sleep(700);
await A.evaluate(() => { const b = [...document.querySelectorAll('.screen .btn-primary.btn-lg')].pop(); if (b) b.click(); });
await A.waitForSelector('.bs-sea', { timeout: 15000 });
await B.waitForSelector('.bs-sea', { timeout: 15000 });
await sleep(900);

// ── 배치: 랜덤 배치 → 완료 (배치는 좌석 순서대로 진행된다) ──
const canPlace = (page) => page.evaluate(() => {
  const H = window.__hanpan; if (!H) return false;
  return H.match.state.phase === 'place' && H.match.canAct();
});
const place = async (page) => {
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('랜덤 배치')); if (b) b.click(); });
  await sleep(350);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('배치 완료')); if (b) b.click(); });
  await sleep(800);
};
for (let k = 0; k < 6; k++) {
  if (await canPlace(A)) await place(A);
  else if (await canPlace(B)) await place(B);
  else break;
}
await sleep(1200);
await A.screenshot({ path: path.join(OUT, '1-A-play.png') });
await B.screenshot({ path: path.join(OUT, '2-B-play.png') });

// 각 기기의 상태와 수 기록에서 상대 함대 정보가 보이는지 확인한다
const inspect = (page) => page.evaluate(() => {
  const H = window.__hanpan;
  if (!H) return { err: '훅 없음' };
  const mt = H.match, st = mt.state, me = H.mySeat;
  return {
    mySeat: me,
    phase: st.phase,
    placed: String(st.placed),
    myShips: st.ships[me] ? st.ships[me].length : 0,
    oppShips: st.ships[1 - me] === null ? 'null' : JSON.stringify(st.ships[1 - me]),
    logHasOppPlace: mt.history.some((h) => h.seat !== me && h.move && Array.isArray(h.move.place)),
    myHits: st.shots[me].filter((v) => v === 2).length,       // 내가 때린 명중 수
    oppHits: st.shots[1 - me].filter((v) => v === 2).length,   // 내가 맞은 수
    sunk: String(st.sunk.map((a) => a.length)),
    over: !!mt.over,
    commits: st.commits.map((c) => (c ? c.slice(0, 12) : null)).join(','),
    mySaltKnown: typeof st.salts[me] === 'string',
    oppSaltKnown: st.salts[1 - me] != null,
    proof: st.proof ? `${st.proof.seat}:${st.proof.ok}` : null,
    reason: mt.over ? mt.over.reason : '',
    revealedDrawn: document.querySelectorAll('.bs-ship.revealed').length,
  };
});

const ia = await inspect(A), ib = await inspect(B);
ok('A가 자기 함대 5척을 안다', ia.myShips === 5, `myShips=${ia.myShips}`);
ok('B가 자기 함대 5척을 안다', ib.myShips === 5, `myShips=${ib.myShips}`);
ok('A 기기에 상대 함대 위치가 없다', ia.oppShips === 'null', `oppShips=${String(ia.oppShips).slice(0, 70)}`);
ok('B 기기에 상대 함대 위치가 없다', ib.oppShips === 'null', `oppShips=${String(ib.oppShips).slice(0, 70)}`);
ok('A 수 기록에 상대 배치가 없다', ia.logHasOppPlace === false);
ok('B 수 기록에 상대 배치가 없다', ib.logHasOppPlace === false);
ok('양쪽 다 배치 완료로 보인다', ia.placed === 'true,true' && ib.placed === 'true,true', `${ia.placed} / ${ib.placed}`);

// ── 거짓 격침 주장이 거부되는지 (쏜 쪽 기기 시점으로 검증) ──
const lie = await A.evaluate(() => {
  const H = window.__hanpan, mt = H.match, st = mt.state, me = H.mySeat;
  // 쏜 쪽 기기 상태를 흉내낸다: 상대 배치를 모르고, 방금 0번 칸을 쐈다
  const fake = { ...st, pendingShot: { by: me, i: 0 }, turn: 1 - me, ships: me === 0 ? [st.ships[0], null] : [null, st.ships[1]] };
  const r = mt.rules;
  return {
    fakeSunk: r.isLegal(fake, { reveal: 0, ship: { r: 0, c: 0, len: 5, dir: 'h' } }),   // 안 맞힌 칸까지 격침 주장
    badIdx: r.isLegal(fake, { reveal: 9 }),                                              // 없는 함선 번호
    badLen: r.isLegal(fake, { reveal: 0, ship: { r: 0, c: 0, len: 2, dir: 'h' } }),      // 길이 불일치
    plainHit: r.isLegal(fake, { reveal: 0 }),                                            // 단순 명중 주장은 통과해야 정상
  };
});
ok('안 맞힌 칸을 포함한 격침 주장이 거부된다', lie.fakeSunk === false, JSON.stringify(lie));
ok('없는 함선 번호가 거부된다', lie.badIdx === false);
ok('길이가 안 맞는 함선 주장이 거부된다', lie.badLen === false);

// ── 포격: 차례인 쪽이 계속 쏘게 해서 격침까지 진행 ──
const fireOnce = async () => {
  for (const page of [A, B]) {
    const fired = await page.evaluate(() => {
      const H = window.__hanpan, mt = H.match, st = mt.state;
      if (mt.over || st.pendingShot || st.turn !== H.mySeat) return false;
      const ms = mt.legalMoves();
      if (!ms.length || ms[0].fire == null) return false;
      return mt.submit(ms[(Math.random() * ms.length) | 0]);
    });
    if (fired) return true;
  }
  return false;
};
let shots = 0;
for (let k = 0; k < 90; k++) {          // 판이 끝나기 전까지만 (재접속 검사를 먼저 해야 한다)
  if (await A.evaluate(() => !!window.__hanpan.match.over)) break;
  if (await fireOnce()) { shots++; await sleep(140); } else await sleep(180);
}
await sleep(1000);
const fa = await inspect(A), fb = await inspect(B);
await A.screenshot({ path: path.join(OUT, '3-A-after.png') });
await B.screenshot({ path: path.join(OUT, '4-B-after.png') });
ok('포격이 충분히 진행됐다', shots > 20, `${shots}발`);
ok('명중 기록이 양쪽에서 같다', fa.myHits === fb.oppHits && fa.oppHits === fb.myHits, `A(내가때림 ${fa.myHits}/내가맞음 ${fa.oppHits}) B(${fb.myHits}/${fb.oppHits})`);
ok('격침 수가 양쪽에서 같다', fa.sunk === fb.sunk, `${fa.sunk} / ${fb.sunk}`);
// (격침은 무작위 포격이라 중간 시점엔 없을 수도 있다 — 판 끝에서 '한쪽 함대가 전멸했다'로 확인한다)
ok('포격 중에도 상대 함대 위치는 없다', fa.oppShips === 'null' && fb.oppShips === 'null');

ok('중간 점검 시점에 판이 아직 진행 중이다', fa.over === false, `over=${fa.over}`);

// ── 새로고침 재접속: 내 배치는 살아 있고 상대 배치는 여전히 없어야 한다 ──
await B.reload({ waitUntil: 'load' });
await sleep(3500);
const rb = await inspect(B);
ok('새로고침 후에도 내 함대를 안다', rb.myShips === 5, `myShips=${rb.myShips}`);
ok('새로고침 후에도 상대 함대는 없다', rb.oppShips === 'null', `oppShips=${String(rb.oppShips).slice(0, 70)}`);
ok('새로고침 후 포격 기록이 유지된다', rb.myHits === fb.myHits && rb.oppHits === fb.oppHits, `${rb.myHits}/${rb.oppHits} vs ${fb.myHits}/${fb.oppHits}`);
await B.screenshot({ path: path.join(OUT, '5-B-reload.png') });

// ── 재접속 뒤에도 끝까지 정상 진행되는지 ──
for (let k = 0; k < 400; k++) {
  if (await A.evaluate(() => !!(window.__hanpan && window.__hanpan.match.over))) break;
  if (await fireOnce()) { shots++; await sleep(130); } else await sleep(180);
}
await sleep(1400);
const ea = await inspect(A), eb = await inspect(B);
ok('판이 끝까지 진행된다', ea.over === true, `over=${ea.over} 격침=${ea.sunk}`);
ok('끝난 뒤에도 양쪽 격침 수가 같다', ea.sunk === eb.sunk, `${ea.sunk} / ${eb.sunk}`);
ok('한쪽 함대가 전멸했다', ea.sunk.split(',').some((v) => v === '5'), ea.sunk);
// 배치 약속·끝난 뒤 증명
ok('두 기기의 배치 약속값이 같다', ea.commits === eb.commits && !ea.commits.includes('null'), `${ea.commits} / ${eb.commits}`);
ok('소금값은 자기 것만 안다', ea.mySaltKnown && eb.mySaltKnown && !ea.oppSaltKnown && !eb.oppSaltKnown);
ok('이긴 쪽 함대 증명이 통과했다', ea.proof && ea.proof.endsWith(':true') && ea.proof === eb.proof, `${ea.proof} / ${eb.proof}`);
ok('결과가 정상 승리다(반칙 아님)', !/반칙/.test(ea.reason) && ea.reason === eb.reason, `${ea.reason} / ${eb.reason}`);
{
  // 진 쪽 기기에는 이긴 쪽 함대가 이제 공개되어 있어야 한다 (남은 함선이 점선으로 그려진다)
  const winner = +ea.proof.split(':')[0];
  const loser = winner === ea.mySeat ? eb : ea;
  const winnerDev = winner === ea.mySeat ? ea : eb;
  const unsunk = 5 - +winnerDev.sunk.split(',')[winner];
  ok('진 쪽 기기에 이긴 쪽 함대가 공개됐다', loser.oppShips !== 'null', `oppShips=${String(loser.oppShips).slice(0, 40)}`);
  ok('진 쪽 화면에 남은 함선이 점선으로 보인다', loser.revealedDrawn === unsunk, `그려진 ${loser.revealedDrawn} / 남은 ${unsunk}`);
}
await A.screenshot({ path: path.join(OUT, '6-A-end.png') });
await B.screenshot({ path: path.join(OUT, '7-B-end.png') });

ok('콘솔 오류 없음', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
process.exit(bad.length ? 1 : 0);
