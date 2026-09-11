import { GridBoard } from '../../core/board.js';
import { h } from '../../core/util.js';
import { SHIPS, shipCells, validPlacement, randomPlacement } from './rules.js';
import { makeRng } from '../../core/rng.js';

const N = 10;
const MISS = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="14" fill="#e6f0ff" opacity=".9"/><circle cx="50" cy="50" r="26" fill="none" stroke="#e6f0ff" stroke-width="4" opacity=".45"/></svg>`;
const HIT = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="#ff4d2e" opacity=".9"/><path d="M30 30L70 70M70 30L30 70" stroke="#fff" stroke-width="12" stroke-linecap="round"/></svg>`;

export function create(root, ctx) {
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .bs-sea { position: relative; }
    .bs-sea .board { --light: #17365e; --line: rgba(255,255,255,.14); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
    .bs-label { font-size: 12px; font-weight: 800; color: var(--muted); margin: 6px 2px 4px; display: flex; justify-content: space-between; }
    .bs-ships { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
    .bs-ship { position: absolute; border-radius: 999px; background: linear-gradient(180deg, #b8c2cf, #7d8a99); box-shadow: inset 0 -3px 0 rgba(0,0,0,.25), 0 3px 8px rgba(0,0,0,.4); border: 2px solid rgba(255,255,255,.35); }
    .bs-ship.sunk { background: linear-gradient(180deg, #6b2a2a, #3a1414); border-color: rgba(255,90,90,.5); }
    .bs-ship.ghost { opacity: .55; }
    .bs-ship.bad { background: #ff3b3b; opacity: .6; }
    .bs-tray { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
    .bs-tray button { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); font-size: 12px; font-weight: 700; }
    .bs-tray button.sel { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
    .bs-tray button.done { opacity: .45; }
    .bs-tray .bar { display: inline-flex; gap: 2px; }
    .bs-tray .bar i { width: 8px; height: 8px; background: #b8c2cf; border-radius: 2px; }
    .bs-mini { width: 38%; margin: 0 auto 6px; }
    .bs-mini .board { border-radius: 6px; }
  ` });
  root.appendChild(style);

  let phaseBuilt = null;
  let big = null, mini = null;
  let draft = [], sel = 0, dir = 'h';
  let shipLayerBig = null, shipLayerMini = null;
  let tray = null, controls = null;

  function clearAll() {
    if (big) big.destroy(); if (mini) mini.destroy();
    big = mini = null; wrap.innerHTML = '';
  }

  function shipDiv(s, cls) {
    const st = { left: `${s.c * 10}%`, top: `${s.r * 10}%`, width: `${(s.dir === 'h' ? s.len : 1) * 10}%`, height: `${(s.dir === 'v' ? s.len : 1) * 10}%`, padding: '0' };
    const el = h('div', { class: 'bs-ship ' + cls });
    Object.assign(el.style, st);
    el.style.transform = 'scale(.86)';
    return el;
  }

  // ---------- 배치 화면 ----------
  function buildPlace(state) {
    clearAll(); phaseBuilt = 'place';
    draft = []; sel = 0; dir = 'h';
    const sea = h('div', { class: 'bs-sea' });
    wrap.append(h('div', { class: 'bs-label' }, h('span', { text: '내 바다 · 함선을 배치하세요' })), sea);
    big = new GridBoard(sea, { rows: N, cols: N, style: 'plain', theme: 'blue', onCell(r, c) { onPlaceTap(r, c); } });
    shipLayerBig = h('div', { class: 'bs-ships' });
    big.el.appendChild(shipLayerBig);
    tray = h('div', { class: 'bs-tray' });
    controls = h('div', { class: 'row', style: { justifyContent: 'center', gap: '6px', marginTop: '8px' } },
      h('button', { class: 'btn btn-sm', text: '🔄 회전', onclick: () => { dir = dir === 'h' ? 'v' : 'h'; const cur = draft[sel]; if (cur) { const t = { ...cur, dir }; draft[sel] = null; if (fits(t)) draft[sel] = t; else draft[sel] = cur; } renderPlace(); ctx.sound.play('click'); } }),
      h('button', { class: 'btn btn-sm', text: '🎲 랜덤 배치', onclick: () => { draft = randomPlacement(makeRng()); renderPlace(); ctx.sound.play('dice'); } }),
      h('button', { class: 'btn btn-sm btn-primary', text: '✓ 배치 완료', onclick: () => { if (!validPlacement(draft)) { ctx.sound.play('error'); return; } ctx.submit({ place: draft }); } }));
    wrap.append(tray, controls);
    renderPlace();
  }
  function fits(s) {
    if (s.dir === 'h' ? s.c + s.len > N || s.r >= N : s.r + s.len > N || s.c >= N) return false;
    if (s.r < 0 || s.c < 0) return false;
    const cells = shipCells(s);
    return draft.every((o, i) => !o || i === sel || !shipCells(o).some((x) => cells.includes(x)));
  }
  function onPlaceTap(r, c) {
    if (!ctx.canAct()) return;
    // 이미 놓인 배를 누르면 집어 올린다
    const idx = draft.findIndex((s, i) => s && i !== sel && shipCells(s).includes(r * N + c));
    if (idx >= 0) { sel = idx; dir = draft[idx].dir; draft[idx] = null; renderPlace(); ctx.sound.play('tap'); return; }
    const s = { r, c, len: SHIPS[sel].len, dir };
    if (!fits(s)) { ctx.sound.play('error'); ctx.setStatus('<b style="color:var(--bad)">거기엔 놓을 수 없어요</b>'); return; }
    draft[sel] = s;
    ctx.sound.play('place'); ctx.haptics.tap();
    const next = SHIPS.findIndex((_, i) => !draft[i]);
    if (next >= 0) sel = next;
    renderPlace();
  }
  function renderPlace() {
    shipLayerBig.innerHTML = '';
    draft.forEach((s) => { if (s) shipLayerBig.appendChild(shipDiv(s, '')); });
    tray.innerHTML = '';
    SHIPS.forEach((sh, i) => {
      const b = h('button', { class: (i === sel ? 'sel' : '') + (draft[i] ? ' done' : ''), onclick: () => { sel = i; if (draft[i]) dir = draft[i].dir; renderPlace(); ctx.sound.play('tap'); } },
        h('span', { class: 'bar' }, Array.from({ length: sh.len }, () => h('i'))), sh.name);
      tray.appendChild(b);
    });
    const left = SHIPS.filter((_, i) => !draft[i]).length;
    ctx.setStatus(left ? `<b>${SHIPS[sel].name}</b>(${SHIPS[sel].len}칸)을 놓을 칸을 누르세요 · 남은 함선 ${left}척` : '배치가 끝났어요. 완료를 누르세요!');
  }

  // ---------- 포격 화면 ----------
  function buildPlay() {
    clearAll(); phaseBuilt = 'play';
    const miniWrap = h('div', { class: 'bs-mini bs-sea' });
    const seaWrap = h('div', { class: 'bs-sea big' });
    wrap.append(h('div', { class: 'bs-label' }, h('span', { text: '내 바다' })), miniWrap, h('div', { class: 'bs-label' }, h('span', { text: '상대 바다 · 누르면 포격' }), h('span', { id: 'bs-left' })), seaWrap);
    mini = new GridBoard(miniWrap, { rows: N, cols: N, style: 'plain', theme: 'blue' });
    shipLayerMini = h('div', { class: 'bs-ships' }); mini.el.appendChild(shipLayerMini);
    big = new GridBoard(seaWrap, { rows: N, cols: N, style: 'plain', theme: 'blue', onCell(r, c) { if (!ctx.canAct()) return; const mv = ctx.legalMoves().find((m) => m.fire === r * N + c); if (!mv) { ctx.sound.play('error'); return; } ctx.submit(mv); } });
    shipLayerBig = h('div', { class: 'bs-ships' }); big.el.appendChild(shipLayerBig);
  }

  function renderPlay(state, viewer, events, animate) {
    const opp = 1 - viewer;
    // 내 바다: 내 배 + 상대가 쏜 곳
    shipLayerMini.innerHTML = '';
    (state.ships[viewer] || []).forEach((s, i) => shipLayerMini.appendChild(shipDiv(s, state.sunk[viewer].includes(i) ? 'sunk' : '')));
    const myShots = state.shots[opp];
    mini.sync(myShots.map((v, i) => (v ? { id: 'm' + i, r: (i / N) | 0, c: i % N, html: v === 2 ? HIT : MISS } : null)).filter(Boolean), { animate });
    // 상대 바다: 내가 쏜 곳 + 격침된 상대 배
    shipLayerBig.innerHTML = '';
    (state.ships[opp] || []).forEach((s, i) => { if (state.sunk[opp].includes(i)) shipLayerBig.appendChild(shipDiv(s, 'sunk')); });
    const shots = state.shots[viewer];
    big.sync(shots.map((v, i) => (v ? { id: 's' + i, r: (i / N) | 0, c: i % N, html: v === 2 ? HIT : MISS } : null)).filter(Boolean), { animate });
    const leftEl = wrap.querySelector('#bs-left');
    if (leftEl) leftEl.textContent = `남은 적함 ${SHIPS.length - state.sunk[opp].length}척`;
    if (animate) for (const ev of events) {
      if (ev.type !== 'shot') continue;
      const onBig = ev.seat === viewer;
      const b = onBig ? big : mini;
      const { x, y, size } = b.centerOf((ev.i / N) | 0, ev.i % N);
      const pt = onBig ? { x, y } : (() => { const r1 = b.el.getBoundingClientRect(), r0 = ctx.boardArea.getBoundingClientRect(); return { x: r1.left - r0.left + x, y: r1.top - r0.top + y }; })();
      if (ev.result === 'miss') { ctx.fx.burst(pt.x, pt.y, { count: 10, palette: 'water', speed: 0.8, size: size * 0.08, gravity: 0.25 }); ctx.sound.play('splash'); ctx.haptics.tap(); }
      else {
        ctx.fx.burst(pt.x, pt.y, { count: 26, palette: 'fire', speed: 1.4, size: size * 0.09 }); ctx.fx.ring(pt.x, pt.y, { color: '#ffb547', size: size * 1.2 });
        ctx.sound.play('boom'); ctx.haptics.heavy(); ctx.fx.shake(ev.result === 'sunk');
        if (ev.result === 'sunk') setTimeout(() => { ctx.fx.stamp(onBig ? '격침!' : '피격! 침몰…', { glow: 'rgba(255,77,46,.9)' }); ctx.sound.play('capture'); }, 250);
        else ctx.fx.stamp(onBig ? '명중!' : '피격!', { small: true, glow: 'rgba(255,122,69,.9)' });
      }
    }
  }

  return {
    update(state, events, prev, animate) {
      const viewer = ctx.viewer();
      if (state.phase === 'place') {
        if (phaseBuilt !== 'place' || (prev && prev.turn !== state.turn)) buildPlace(state);
        if (!ctx.canAct()) ctx.setStatus(ctx.online || ctx.mode === 'bot' ? '상대가 함선을 배치하는 중…' : `${ctx.seats[state.turn].name}님이 배치할 차례예요`);
        if (ctx.canAct() && draft.length === 0) { /* 초기 상태 */ }
        ctx.setSeatInfo(0, { score: '', sub: `${ctx.seatNames[0]}${state.ships[0] ? ' · 배치 완료' : ''}` });
        ctx.setSeatInfo(1, { score: '', sub: `${ctx.seatNames[1]}${state.ships[1] ? ' · 배치 완료' : ''}` });
        return;
      }
      if (phaseBuilt !== 'play') buildPlay();
      renderPlay(state, viewer, events, animate);
      ctx.setSeatInfo(0, { score: `🚢${SHIPS.length - state.sunk[0].length}`, sub: ctx.seatNames[0] });
      ctx.setSeatInfo(1, { score: `🚢${SHIPS.length - state.sunk[1].length}`, sub: ctx.seatNames[1] });
      if (ctx.canAct()) ctx.setStatus('상대 바다에서 쏠 칸을 누르세요');
    },
    reset() { phaseBuilt = null; clearAll(); },
    destroy() { clearAll(); wrap.remove(); style.remove(); },
  };
}
