import { GridBoard } from '../../core/board.js';
import { h } from '../../core/util.js';
import { conflicts } from './rules.js';

export function create(root, ctx) {
  let selected = null;
  let noteMode = false;
  let timer = null, startAt = 0;
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .sd .cell { display: grid; place-items: center; font-weight: 700; font-size: clamp(16px, 5.2vw, 26px); cursor: pointer; color: #1d5fd6; position: relative; }
    .sd .cell.given { color: #222; font-weight: 900; }
    .sd .cell.same { background: rgba(79,163,255,.22); }
    .sd .cell.peer { background: rgba(0,0,0,.06); }
    .sd .cell.sel { background: rgba(255,122,69,.35) !important; }
    .sd .cell.wrong { color: #d63a3a; background: rgba(255,92,92,.18); }
    .sd .cell.done { animation: pop .3s var(--ease-pop); }
    .sd .notes { position: absolute; inset: 2px; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); font-size: clamp(7px, 2.2vw, 10px); color: #666; font-weight: 600; line-height: 1; }
    .sd .notes span { display: grid; place-items: center; }
    .sd-pad { display: grid; grid-template-columns: repeat(9, 1fr); gap: 5px; margin-top: 10px; }
    .sd-pad button { min-height: 44px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--border); font-size: 20px; font-weight: 800; position: relative; }
    .sd-pad button:active { transform: scale(.94); }
    .sd-pad button.dim { opacity: .3; }
    .sd-pad button small { position: absolute; right: 4px; bottom: 2px; font-size: 9px; color: var(--muted); font-weight: 700; }
    .sd-tools { display: flex; gap: 6px; justify-content: center; margin-top: 8px; }
  ` });
  root.appendChild(style);
  const thick = [3, 6].map((k) => `<line x1="${k}" y1="0" x2="${k}" y2="9" stroke="#222" stroke-width="0.09"/><line x1="0" y1="${k}" x2="9" y2="${k}" stroke="#222" stroke-width="0.09"/>`).join('');
  const boardWrap = h('div');
  const board = new GridBoard(boardWrap, { rows: 9, cols: 9, style: 'plain', theme: 'paper', className: 'sd', extraSvg: thick + `<rect x="0" y="0" width="9" height="9" fill="none" stroke="#222" stroke-width="0.12"/>`, onCell(r, c) { select(r * 9 + c); } });
  board.el.style.setProperty('--light', '#fbf8f1');
  board.el.style.setProperty('--line', 'rgba(0,0,0,.25)');
  board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
  const pad = h('div', { class: 'sd-pad' });
  const tools = h('div', { class: 'sd-tools' });
  const noteBtn = h('button', { class: 'btn btn-sm', text: '✏️ 메모: 꺼짐', onclick: () => { noteMode = !noteMode; noteBtn.textContent = `✏️ 메모: ${noteMode ? '켜짐' : '꺼짐'}`; noteBtn.classList.toggle('btn-primary', noteMode); ctx.sound.play('click'); } });
  tools.append(
    noteBtn,
    h('button', { class: 'btn btn-sm', text: '⌫ 지우기', onclick: () => { if (selected == null || !ctx.canAct()) return; const st = ctx.match.state; if (st.puzzle[selected]) return; ctx.submit({ clear: selected, t: elapsed() }); } }),
    h('button', { class: 'btn btn-sm', text: '💡 힌트', onclick: () => { if (!ctx.canAct()) return; ctx.submit({ hint: true, t: elapsed() }); } }),
  );
  for (let v = 1; v <= 9; v++) pad.appendChild(h('button', { text: v, dataset: { v }, onclick: () => input(v) }));
  wrap.append(boardWrap, pad, tools);
  const elapsed = () => performance.now() - startAt;

  function select(i) { selected = i; ctx.sound.play('tap'); render(ctx.match.state); }
  function input(v) {
    if (selected == null) { ctx.setStatus('먼저 칸을 고르세요'); ctx.sound.play('error'); return; }
    if (!ctx.canAct()) return;
    const st = ctx.match.state;
    if (st.puzzle[selected]) { ctx.sound.play('error'); return; }
    if (noteMode && !st.grid[selected]) ctx.submit({ note: selected, v, t: elapsed() });
    else if (st.grid[selected] === v) ctx.submit({ clear: selected, t: elapsed() });
    else ctx.submit({ set: selected, v, t: elapsed() });
  }
  const onKey = (e) => { if (e.key >= '1' && e.key <= '9') input(+e.key); else if (e.key === 'Backspace' || e.key === 'Delete') { if (selected != null) ctx.submit({ clear: selected, t: elapsed() }); } };
  document.addEventListener('keydown', onKey);

  function render(state) {
    const selV = selected != null ? state.grid[selected] : 0;
    const selR = selected != null ? (selected / 9) | 0 : -1, selC = selected != null ? selected % 9 : -1;
    const selB = selected != null ? (((selR / 3) | 0) * 3 + ((selC / 3) | 0)) : -1;
    const counts = Array(10).fill(0);
    for (const v of state.grid) counts[v]++;
    for (const el of board.cellsEl.children) {
      const i = +el.dataset.r * 9 + +el.dataset.c;
      const v = state.grid[i];
      el.className = 'cell';
      if (state.puzzle[i]) el.classList.add('given');
      const r = (i / 9) | 0, c = i % 9, b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      if (selected != null && (r === selR || c === selC || b === selB)) el.classList.add('peer');
      if (selV && v === selV) el.classList.add('same');
      if (i === selected) el.classList.add('sel');
      if (v) {
        el.innerHTML = '';
        el.textContent = v;
        if (!state.puzzle[i] && (v !== state.solution[i] || conflicts(state.grid, i).length)) el.classList.add('wrong');
      } else {
        el.textContent = '';
        const notes = state.notes[i];
        if (notes.length) { const n = h('div', { class: 'notes' }); for (let k = 1; k <= 9; k++) n.appendChild(h('span', { text: notes.includes(k) ? k : '' })); el.appendChild(n); }
      }
    }
    for (const b of pad.children) { const v = +b.dataset.v; b.classList.toggle('dim', counts[v] >= 9); b.innerHTML = `${v}<small>${Math.max(0, 9 - counts[v])}</small>`; }
  }

  function tick() { ctx.setSeatInfo(0, { score: fmt(elapsed()) }); }
  const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  return {
    update(state, events, prev, animate) {
      if (!timer && !state.over) { startAt = performance.now() - (state.time || 0); timer = setInterval(tick, 1000); }
      if (state.over && timer) { clearInterval(timer); timer = null; }
      render(state);
      if (animate) for (const ev of events) {
        if (ev.type === 'set') { ctx.sound.play('place'); ctx.haptics.tap(); }
        else if (ev.type === 'wrong') { ctx.sound.play('error'); ctx.haptics.fail(); const p = board.centerOf((ev.i / 9) | 0, ev.i % 9); ctx.fx.ring(p.x, p.y, { color: '#ff5c5c', size: 24 }); }
        else if (ev.type === 'hint') { selected = ev.i; render(state); const p = board.centerOf((ev.i / 9) | 0, ev.i % 9); ctx.fx.sparkle(p.x, p.y, 22, 'gold'); ctx.sound.play('coin'); }
        else if (ev.type === 'lineDone') { ctx.sound.play('score'); const cells = []; for (let k = 0; k < 9; k++) { if (ev.row >= 0) cells.push({ r: ev.row, c: k }); if (ev.col >= 0) cells.push({ r: k, c: ev.col }); } for (const { r, c } of cells) board.cellEl(r, c).classList.add('done'); }
        else if (ev.type === 'solved') { ctx.fx.stamp('완성!', { glow: 'rgba(61,220,151,1)' }); }
        else if (ev.type === 'note') ctx.sound.play('tick');
      }
      ctx.setSeatInfo(0, { score: fmt(state.over ? state.time : elapsed()), sub: `실수 ${state.mistakes} · 힌트 ${state.hints}` });
      ctx.setStatus(state.over ? '' : selected == null ? '칸을 누르고 숫자를 입력하세요' : '');
    },
    reset() { selected = null; if (timer) { clearInterval(timer); timer = null; } },
    destroy() { if (timer) clearInterval(timer); document.removeEventListener('keydown', onKey); wrap.remove(); style.remove(); },
  };
}
