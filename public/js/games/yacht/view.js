import { h } from '../../core/util.js';
import { CATS, scoreFor, totals, BONUS_AT } from './rules.js';

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function create(root, ctx) {
  let held = [false, false, false, false, false];
  let rolling = false;
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .yc-dice { display: flex; justify-content: center; gap: 10px; padding: 10px 0; perspective: 600px; }
    .yc-die { width: 54px; height: 54px; border-radius: 12px; background: linear-gradient(160deg, #fff, #e6e6ea); box-shadow: 0 6px 14px rgba(0,0,0,.45), inset 0 -4px 0 rgba(0,0,0,.12); display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 9px; gap: 2px; cursor: pointer; transition: transform .15s, box-shadow .15s; position: relative; }
    .yc-die i { border-radius: 50%; background: transparent; }
    .yc-die i.on { background: #222; }
    .yc-die.held { transform: translateY(-8px); box-shadow: 0 10px 18px rgba(0,0,0,.5), 0 0 0 3px var(--accent); }
    .yc-die.held::after { content: '고정'; position: absolute; left: 50%; bottom: -18px; transform: translateX(-50%); font-size: 10px; font-weight: 800; color: var(--accent); }
    .yc-die.roll { animation: yc-roll .6s cubic-bezier(.3,.7,.4,1) both; }
    @keyframes yc-roll { 0% { transform: translateY(-40px) rotateX(0) rotateZ(0) scale(1.15); opacity: .6; } 60% { transform: translateY(4px) rotateX(360deg) rotateZ(180deg) scale(1); opacity: 1; } 80% { transform: translateY(-3px) rotateX(370deg) rotateZ(175deg); } 100% { transform: translateY(0) rotateX(360deg) rotateZ(180deg); } }
    .yc-die.empty { opacity: .35; }
    .yc-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 14px; background: var(--surface); border-radius: 12px; overflow: hidden; }
    .yc-table th, .yc-table td { padding: 5px 8px; border-bottom: 1px solid var(--border); text-align: center; }
    .yc-table th:first-child, .yc-table td:first-child { text-align: left; font-weight: 700; }
    .yc-table th { background: var(--surface-2); font-size: 12px; color: var(--muted); }
    .yc-table td.cur { background: var(--accent-soft); }
    .yc-table td.pick { color: var(--accent); font-weight: 900; cursor: pointer; }
    .yc-table td.pick.zero { color: var(--muted); font-weight: 600; }
    .yc-table td.filled { font-weight: 800; }
    .yc-table tr.sum td { background: var(--surface-2); font-weight: 900; }
    .yc-table td.new { animation: pop .35s var(--ease-pop); }
    .yc-desc { display: block; font-size: 10px; color: var(--muted); font-weight: 500; }
    .yc-table.dense th, .yc-table.dense td { padding: 5px 4px; font-size: 12px; }
    .yc-table.dense .yc-desc { display: none; }
    .yc-table.dense td:first-child { max-width: 96px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  ` });
  root.appendChild(style);
  const diceRow = h('div', { class: 'yc-dice' });
  const ctl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', minHeight: '48px', marginTop: '12px' } });
  const table = h('table', { class: 'yc-table' });
  const tableWrap = h('div', { style: { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: '10px' } }, table);
  wrap.append(diceRow, ctl, tableWrap);

  function dieEl(v, i, opts = {}) {
    const d = h('div', { class: 'yc-die' + (opts.held ? ' held' : '') + (opts.roll ? ' roll' : '') + (v === 0 ? ' empty' : ''), style: { animationDelay: `${i * 60}ms` } });
    for (let k = 0; k < 9; k++) d.appendChild(h('i', { class: v && PIPS[v].includes(k) ? 'on' : '' }));
    d.addEventListener('click', () => {
      const state = ctx.match.state;
      if (!ctx.canAct() || rolling || state.rolls === 0 || state.rolls >= 3) return;
      held[i] = !held[i]; ctx.sound.play('tap'); ctx.haptics.tap();
      renderDice(state, null, false);
    });
    return d;
  }
  function renderDice(state, rollEv, animate) {
    diceRow.innerHTML = '';
    state.dice.forEach((v, i) => diceRow.appendChild(dieEl(v, i, { held: held[i] && state.rolls > 0 && state.rolls < 3, roll: animate && rollEv && rollEv.rolled.includes(i) })));
  }
  function renderCtl(state) {
    ctl.innerHTML = '';
    if (!ctx.canAct()) { ctl.appendChild(h('span', { class: 'hint', text: state.n > 1 ? `${ctx.seats[state.turn].name}님 차례` : '' })); return; }
    const left = 3 - state.rolls;
    if (left > 0) ctl.appendChild(h('button', { class: 'btn btn-primary btn-lg', text: state.rolls === 0 ? '🎲 굴리기' : `🎲 다시 굴리기 (${left}번 남음)`, disabled: state.rolls > 0 && held.every(Boolean), onclick: () => { if (rolling) return; ctx.submit({ roll: true, held: state.rolls === 0 ? [false, false, false, false, false] : held.slice() }); } }));
    if (state.rolls > 0) ctl.appendChild(h('span', { class: 'hint', text: left > 0 ? '주사위를 눌러 고정 · 표에서 칸을 골라 점수 기록' : '표에서 칸을 골라 점수를 기록하세요' }));
  }
  function renderTable(state, scoreEv) {
    table.innerHTML = '';
    table.className = 'yc-table' + (state.n >= 3 || window.innerHeight < 1000 ? ' dense' : '');
    const head = h('tr', null, h('th', { text: '족보' }), ...Array.from({ length: state.n }, (_, i) => h('th', { text: state.n === 1 ? '점수' : ctx.seats[i].name.slice(0, 6) })));
    table.appendChild(head);
    const canPick = ctx.canAct() && state.rolls > 0;
    const row = (label, cells, cls) => { const tr = h('tr', { class: cls || '' }, h('td', { html: label })); cells.forEach((c) => tr.appendChild(c)); table.appendChild(tr); };
    CATS.forEach((cat, ci) => {
      const cells = [];
      for (let p = 0; p < state.n; p++) {
        const v = state.scores[p][ci];
        const isCur = p === state.turn && !state.over;
        const td = h('td', { class: (isCur ? 'cur ' : '') + (v !== null ? 'filled' : '') + (scoreEv && scoreEv.seat === p && scoreEv.cat === ci ? ' new' : '') });
        if (v !== null) td.textContent = v;
        else if (isCur && canPick) { const sc = scoreFor(ci, state.dice); td.textContent = sc; td.classList.add('pick'); if (sc === 0) td.classList.add('zero'); td.addEventListener('click', () => { if (rolling) return; ctx.submit({ score: ci }); }); }
        cells.push(td);
      }
      const label = cat.upper ? `${cat.name} <span class="yc-desc">눈 ${cat.n}의 합</span>` : `${cat.name} <span class="yc-desc">${cat.desc}</span>`;
      row(label, cells);
      if (ci === 5) row(`보너스 <span class="yc-desc">1~6 합 ${BONUS_AT}↑ → +35</span>`, Array.from({ length: state.n }, (_, p) => { const t = totals(state.scores[p]); return h('td', { text: `${t.upper}/${BONUS_AT}${t.bonus ? ' ✓' : ''}`, style: { fontSize: '11px', color: t.bonus ? 'var(--good)' : 'var(--muted)' } }); }), 'sum');
    });
    row('총점', Array.from({ length: state.n }, (_, p) => h('td', { text: totals(state.scores[p]).total })), 'sum');
  }

  return {
    update(state, events, prev, animate) {
      const rollEv = events.find((e) => e.type === 'roll');
      const scoreEv = events.find((e) => e.type === 'score');
      if (scoreEv || state.rolls === 0) held = [false, false, false, false, false];
      renderDice(state, rollEv, animate);
      if (animate && rollEv) {
        rolling = true; ctx.lock(560);
        ctx.sound.play('dice'); ctx.haptics.rattle();
        setTimeout(() => { rolling = false; renderCtl(state); renderTable(state, null); (ctx.relayout ? ctx.relayout() : window.dispatchEvent(new Event('resize'))); if (events.some((e) => e.type === 'yacht')) { ctx.fx.stamp('야찌!!', { glow: 'rgba(255,194,71,1)' }); ctx.sound.play('win'); ctx.haptics.success(); ctx.fx.shake(true); const r = diceRow.getBoundingClientRect(), r0 = ctx.boardArea.getBoundingClientRect(); ctx.fx.burst(r.left - r0.left + r.width / 2, r.top - r0.top + r.height / 2, { count: 40, palette: 'gold', speed: 1.6 }); } }, 600);
      }
      if (animate && scoreEv) {
        ctx.sound.play(scoreEv.value >= 30 ? 'bonus' : scoreEv.value > 0 ? 'score' : 'pop'); ctx.haptics.tap();
        if (scoreEv.value >= 25) ctx.fx.stamp(`+${scoreEv.value}`, { small: true, glow: 'rgba(61,220,151,.9)' });
        if (events.some((e) => e.type === 'bonus')) setTimeout(() => { ctx.fx.stamp('보너스 +35!', { small: true, glow: 'rgba(255,194,71,.9)' }); ctx.sound.play('coin'); }, 400);
      }
      renderCtl(state); renderTable(state, animate ? scoreEv : null);
      for (let p = 0; p < state.n; p++) ctx.setSeatInfo(p, { score: totals(state.scores[p]).total, sub: `${ctx.seatNames[p]} · ${state.scores[p].filter((v) => v !== null).length}/12` });
      if (ctx.canAct()) ctx.setStatus(state.rolls === 0 ? '주사위를 굴리세요' : '');
    },
    destroy() { wrap.remove(); style.remove(); },
  };
}
