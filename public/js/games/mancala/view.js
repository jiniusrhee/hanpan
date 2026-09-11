import { h, clear } from '../../core/util.js';

const SEED_COLORS = ['#3ddc97', '#58a6ff', '#ffc247', '#ff6b6b', '#c084fc', '#f4f4f4'];
// 구슬 배치 패턴 (구덩이 안 상대 좌표 %)
const SPOTS = [[50, 50], [32, 38], [68, 38], [32, 64], [68, 64], [50, 28], [50, 72], [22, 50], [78, 50], [38, 50], [62, 50], [50, 40], [50, 60], [30, 26], [70, 26], [30, 76], [70, 76]];

export function create(root, ctx) {
  const me = ctx.perspective;
  const other = 1 - me;
  const bottomPits = me === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
  const topPits = me === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0];
  const rightStore = me === 0 ? 6 : 13, leftStore = me === 0 ? 13 : 6;

  const wrap = h('div', { class: 'mancala' });
  const style = h('style', { text: `
    .mancala { width: 100%; aspect-ratio: 7 / 3.4; background: linear-gradient(160deg, #8b5a2b, #5e3a17); border-radius: 22px; box-shadow: 0 12px 30px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.15); padding: 3%; display: grid; grid-template-columns: 1fr 6fr 1fr; gap: 2%; position: relative; }
    .mancala .store { border-radius: 999px; background: radial-gradient(ellipse at 40% 30%, #4a2a10, #2d1a0a); box-shadow: inset 0 6px 14px rgba(0,0,0,.6); position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .mancala .store.mine { box-shadow: inset 0 6px 14px rgba(0,0,0,.6), 0 0 0 3px var(--accent-soft); }
    .mancala .rows { display: grid; grid-template-rows: 1fr 1fr; gap: 6%; }
    .mancala .row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3%; }
    .mancala .pit { position: relative; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(ellipse at 40% 30%, #4a2a10, #2d1a0a); box-shadow: inset 0 5px 12px rgba(0,0,0,.6); transition: transform .12s, box-shadow .2s; }
    .mancala .pit.can { box-shadow: inset 0 5px 12px rgba(0,0,0,.6), 0 0 0 3px var(--accent); cursor: pointer; }
    .mancala .pit.can:active { transform: scale(.94); }
    .mancala .pit.last { box-shadow: inset 0 5px 12px rgba(0,0,0,.6), 0 0 0 3px rgba(255,194,71,.7); }
    .mancala .pit.flash { animation: mflash .5s; }
    @keyframes mflash { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(2); } }
    .mancala .seed { position: absolute; width: 22%; height: 22%; border-radius: 50%; transform: translate(-50%, -50%); box-shadow: inset -2px -2px 3px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.4); animation: pop .25s var(--ease-pop); }
    .mancala .store .seed { width: 38%; height: 12%; }
    .mancala .cnt { position: absolute; left: 50%; bottom: -22px; transform: translateX(-50%); font-weight: 900; font-size: 14px; color: #f7e1b5; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
    .mancala .row.top .cnt { bottom: auto; top: -22px; }
    .mancala .store .cnt { bottom: auto; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 22px; pointer-events: none; }
    .mancala .store .seeds { position: absolute; inset: 8% 10%; }
    .mancala .pit .seeds { position: absolute; inset: 0; }
  ` });
  root.append(style, wrap);

  const pitEls = new Map();
  function makePit(i, isStore) {
    const el = h('div', { class: isStore ? 'store' : 'pit', dataset: { pit: i } }, h('div', { class: 'seeds' }), h('div', { class: 'cnt' }));
    if (!isStore) el.addEventListener('click', () => { if (!ctx.canAct()) return; const mv = ctx.legalMoves().find((m) => m.pit === i); if (!mv) { ctx.sound.play('error'); return; } ctx.submit(mv); });
    pitEls.set(i, el);
    return el;
  }
  const left = makePit(leftStore, true);
  const rows = h('div', { class: 'rows' }, h('div', { class: 'row top' }, topPits.map((i) => makePit(i))), h('div', { class: 'row bottom' }, bottomPits.map((i) => makePit(i))));
  const right = makePit(rightStore, true);
  right.classList.add('mine');
  wrap.append(left, rows, right);

  const shown = Array(14).fill(0);
  function renderPit(i, n, popIdx = -1) {
    const el = pitEls.get(i);
    const seeds = el.querySelector('.seeds');
    const isStore = i === 6 || i === 13;
    clear(seeds);
    const max = isStore ? 24 : SPOTS.length;
    for (let k = 0; k < Math.min(n, max); k++) {
      let x, y;
      if (isStore) { x = 25 + ((k * 37) % 50); y = 8 + ((k * 13) % 84); } else { [x, y] = SPOTS[k]; }
      const s = h('div', { class: 'seed', style: { left: x + '%', top: y + '%', background: SEED_COLORS[(i * 3 + k) % SEED_COLORS.length], animation: k === popIdx ? '' : 'none' } });
      seeds.appendChild(s);
    }
    el.querySelector('.cnt').textContent = n;
    shown[i] = n;
  }
  function renderAll(pits) { for (let i = 0; i < 14; i++) renderPit(i, pits[i]); }
  function scores(pits) { ctx.setSeatInfo(0, { score: pits[6] }); ctx.setSeatInfo(1, { score: pits[13] }); }
  function hints() {
    for (const [, el] of pitEls) el.classList.remove('can');
    if (!ctx.canAct() || ctx.isOver()) return;
    for (const m of ctx.legalMoves()) pitEls.get(m.pit).classList.add('can');
  }
  function fxAt(i, opts) { const p = ctx.fx.pointOf(pitEls.get(i)); ctx.fx.burst(p.x, p.y, opts); }

  return {
    update(state, events, prev, animate) {
      for (const [, el] of pitEls) el.classList.remove('last', 'can');
      const sow = events.find((e) => e.type === 'sow');
      if (!animate || !sow || !prev) { renderAll(state.pits); scores(state.pits); hints(); return; }
      // 뿌리기 애니메이션
      const disp = prev.pits.slice();
      disp[sow.from] = 0;
      renderAll(disp);
      const step = Math.max(90, Math.min(160, 1400 / sow.path.length));
      ctx.lock(step * sow.path.length + 500);
      sow.path.forEach((pit, k) => {
        setTimeout(() => {
          disp[pit]++;
          renderPit(pit, disp[pit], disp[pit] - 1);
          ctx.sound.play('tap');
          if (k === sow.path.length - 1) ctx.haptics.tap();
        }, k * step);
      });
      const after = step * sow.path.length + 60;
      setTimeout(() => {
        const cap = events.find((e) => e.type === 'capture');
        const extra = events.find((e) => e.type === 'extra');
        if (cap) {
          pitEls.get(cap.pit).classList.add('flash'); pitEls.get(cap.opp).classList.add('flash');
          fxAt(cap.opp, { count: 16, palette: 'gold', speed: 1 });
          ctx.sound.play('capture'); ctx.haptics.hit(); ctx.fx.shake();
          ctx.fx.stamp(`${cap.count}개 획득!`, { small: true, glow: 'rgba(255,194,71,.9)' });
        }
        if (extra) { ctx.fx.stamp('한 번 더!', { small: true, glow: 'rgba(61,220,151,.9)' }); ctx.sound.play('bonus'); ctx.haptics.success(); }
        setTimeout(() => {
          renderAll(state.pits);
          pitEls.get(sow.from).classList.add('last');
          scores(state.pits);
          hints();
        }, cap || extra ? 380 : 0);
      }, after);
    },
    destroy() { style.remove(); wrap.remove(); },
  };
}
