// 배틀십 공정성 점검: 기기 두 대(좌석 0·1)를 따로 두고, 실제 온라인처럼 배치 수는 상대에게 가려서 전달한다.
//  - 정직한 판: 두 기기의 공유 정보가 매 수마다 같고, 끝난 뒤 증명이 통과하고, 반칙패가 절대 나오지 않는지
//  - 부정행위: 명중을 숨기기 / 다른 소금값으로 증명 / 엉터리 증명 / 다른 함대로 바꿔치기 → 모두 반칙패로 끝나는지
//  - 가린 배치 수에 좌표·소금값이 남아 있지 않은지
// 사용: node test/battleship-cheat.js [판 수(기본 2000)]
import { performance } from 'node:perf_hooks';
globalThis.performance = performance;
const R = await import('../public/js/games/battleship/rules.js');

const GAMES = +(process.argv[2] || 2000);
let fails = 0;
const fail = (msg) => { fails++; if (fails <= 12) console.log('  ❌', msg); };

function mulberry(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 두 기기가 모두 알아야 하는 정보 (같아야 한다)
const SHARED = ['turn', 'phase', 'placed', 'shots', 'sunk', 'sunkShips', 'pendingShot', 'commits', 'proof', 'last'];
const sharedOf = (s) => JSON.stringify(SHARED.map((k) => s[k]));

// cheat: null | 'hide'(좌석 1이 항공모함 명중을 빗나감이라 우김) | 'badsalt'(증명 때 소금값 바꿈) | 'junk'(엉터리 증명) | 'swap'(증명 때 다른 함대)
function play(seed, cheat) {
  const rnd = mulberry(seed);
  const dev = [R.init({}, seed), R.init({}, seed)];      // dev[k] = 좌석 k 의 기기
  const log = [];
  // 좌석 owner 가 둔 수를 두 기기에 반영한다. 상대 기기는 가린 수를 받고 isLegal 로 검사한다(실제 applyRemote 와 같다).
  const send = (owner, move) => {
    const pub = R.meta.redactMove(move);
    for (const k of [0, 1]) {
      const m = k === owner || pub === undefined ? move : pub;
      if (!R.isLegal(dev[k], m)) return `기기 ${k} 가 좌석 ${owner} 의 수를 거부: ${JSON.stringify(m).slice(0, 80)}`;
      dev[k] = R.apply(dev[k], m).state;
    }
    log.push({ owner, move });
    if (sharedOf(dev[0]) !== sharedOf(dev[1])) return `공유 정보가 어긋남 (${log.length}수째)`;
    return null;
  };

  // 배치: 각자 무작위 배치 + 비밀 소금값
  for (const seat of [0, 1]) {
    const place = R.withSalt({ place: R.randomPlacement({ next: rnd, int: (n) => Math.floor(rnd() * n), pick: (a) => a[Math.floor(rnd() * a.length)] }) });
    const pub = R.meta.redactMove(place);
    if (pub.place !== null || 'salt' in pub || !/^[0-9a-f]{64}$/.test(pub.commit)) return { err: '가린 배치 수에 정보가 남아 있음' };
    const e = send(seat, place);
    if (e) return { err: e };
  }
  if (dev[0].ships[1] !== null || dev[1].ships[0] !== null) return { err: '상대 기기에 함대가 들어감' };
  if (dev[0].salts[1] !== null || dev[1].salts[0] !== null) return { err: '상대 기기에 소금값이 들어감' };

  const trueFleet1 = dev[1].ships[1];
  const carrier = new Set(R.shipCells(trueFleet1[0]));
  let k = 0;
  while (!R.status(dev[0]).over && k++ < 600) {
    const st = dev[0], seat = st.turn;
    let move;
    if (st.phase === 'play' && !st.pendingShot) {
      const open = []; for (let i = 0; i < 100; i++) if (!st.shots[seat][i]) open.push(i);
      move = { fire: open[Math.floor(rnd() * open.length)] };
    } else {
      // 결과 공개·증명은 그 좌석 기기만 만들 수 있다
      const own = R.legalMoves(dev[seat]);
      if (own.length !== 1) return { err: `좌석 ${seat} 기기가 만들 수 있는 수가 ${own.length}개` };
      move = own[0];
      if (seat === 1 && move.reveal !== undefined && cheat === 'hide' && st.pendingShot && carrier.has(st.pendingShot.i)) move = { reveal: -1 };   // 명중을 숨긴다
      if (seat === 1 && move.proof) {
        if (cheat === 'badsalt') move = { proof: { ...move.proof, salt: 'f'.repeat(32) } };
        if (cheat === 'junk') move = { proof: { salt: '', fleet: [] } };
        if (cheat === 'swap') move = { proof: { ...move.proof, fleet: R.randomPlacement({ next: rnd, int: (n) => Math.floor(rnd() * n), pick: (a) => a[Math.floor(rnd() * a.length)] }) } };
      }
    }
    // 거짓말한 쪽 기기는 자기 거짓 수를 isLegal 로 거부할 것이므로, 조작된 클라이언트처럼 검사 없이 자기 기기에 반영
    if (cheat && seat === 1 && (move.reveal === -1 || move.proof)) {
      const pub = move;
      if (!R.isLegal(dev[0], pub)) return { err: `상대 기기가 조작된 수를 거부함(통과해야 판정 가능): ${JSON.stringify(pub).slice(0, 60)}` };
      dev[0] = R.apply(dev[0], pub).state;
      dev[1] = R.apply(dev[1], pub).state;
      log.push({ owner: 1, move });
      if (sharedOf(dev[0]) !== sharedOf(dev[1])) return { err: '조작 수 뒤 공유 정보 어긋남' };
    } else {
      const e = send(seat, move);
      if (e) return { err: e };
    }
  }
  const st0 = R.status(dev[0]), st1 = R.status(dev[1]);
  if (!st0.over) return { err: '판이 끝나지 않음' };
  if (JSON.stringify(st0) !== JSON.stringify(st1)) return { err: '두 기기의 결과가 다름' };
  return { status: st0, moves: log.length, proof: dev[0].proof, revealedToLoser: dev[0].phase === 'done' && dev[0].proof.ok ? dev[1 - dev[0].proof.seat].ships[dev[0].proof.seat] != null : null };
}

const t0 = performance.now();
// 1) 정직한 판
let honest = 0, honestCheatFlag = 0, revealed = 0;
for (let g = 0; g < GAMES; g++) {
  const r = play(10000 + g, null);
  if (r.err) { fail(`정직한 판 ${g}: ${r.err}`); continue; }
  honest++;
  if (/반칙/.test(r.status.reason)) { honestCheatFlag++; fail(`정직한 판인데 반칙패: ${r.status.reason}`); }
  if (!r.proof || !r.proof.ok) fail(`정직한 판인데 증명 실패: ${JSON.stringify(r.proof)}`);
  if (r.revealedToLoser) revealed++;
}
console.log(`정직한 판 ${honest}/${GAMES}: 반칙 판정 ${honestCheatFlag}건, 진 쪽에 이긴 함대 공개 ${revealed}판`);

// 2) 부정행위
const want = { hide: /거짓/, badsalt: /약속/, junk: /형식/, swap: /약속|거짓|격침/ };
for (const cheat of ['hide', 'badsalt', 'junk', 'swap']) {
  let caught = 0, total = 0, how = {};
  for (let g = 0; g < Math.max(200, GAMES / 5); g++) {
    const r = play(50000 + g, cheat);
    if (r.err) { fail(`${cheat} 판 ${g}: ${r.err}`); continue; }
    total++;
    // 'hide' 는 좌석 1이 이기든 지든(83칸 초과) 반칙패여야 한다. 나머지는 좌석 1이 이겨 증명할 때만 의미가 있다.
    const cheaterWon = r.status.winner === 1;
    const flagged = /반칙/.test(r.status.reason) && r.status.winner === 0;
    if (cheat === 'hide') {
      if (flagged && want.hide.test(r.status.reason)) caught++; else fail(`hide 판 ${g}: 못 잡음 (${r.status.reason}, 승자 ${r.status.winner})`);
    } else if (r.proof && r.proof.seat === 1) {
      if (flagged && want[cheat].test(r.status.reason)) caught++; else fail(`${cheat} 판 ${g}: 못 잡음 (${r.status.reason})`);
    } else { total--; }     // 좌석 1이 진 판은 증명할 일이 없다
    // 어디서 잡혔는지: 진행 중(빗나감 83칸 초과) 또는 끝난 뒤 증명
    const key = (r.proof ? '증명에서: ' : '진행 중: ') + r.status.reason.replace(/^반칙패 — /, '');
    how[key] = (how[key] || 0) + 1;
    if (cheaterWon) fail(`${cheat} 판 ${g}: 속인 쪽이 이김`);
  }
  console.log(`부정행위 '${cheat}': ${caught}/${total} 적발  ${JSON.stringify(how)}`);
}

console.log(`\n${fails ? `❌ 실패 ${fails}건` : '✅ 모두 통과'} (${Math.round(performance.now() - t0)}ms)`);
process.exit(fails ? 1 : 0);
