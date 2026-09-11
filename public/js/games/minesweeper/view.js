import { GridBoard } from '../../core/board.js';
import { h } from '../../core/util.js';

const NUM_COLORS = ['', '#1d5fd6', '#1a8a3a', '#d63a3a', '#1d1d8f', '#7a2020', '#0f7a7a', '#222', '#777'];

export function create(root, ctx) {
  let board = null, rows = 0, cols = 0;
  let flagMode = false;
  let timer = null, startAt = 0, elapsed = 0;
  let pressTimer = null, longPressed = false;
  const wrap = h('div', { style: { width: '100%' } });
  root.appendChild(wrap);
  const style = h('style', { text: `
    .ms .cell { display: grid; place-items: center; font-weight: 900; font-size: calc(var(--fs, 16px)); user-select: none; cursor: pointer; border-radius: 3px; }
    .ms .cell.closed { background: linear-gradient(160deg, #cfd6e2, #9aa5b8); box-shadow: inset 0 -2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.5); margin: 1px; }
    .ms .cell.closed:active { filter: brightness(.9); }
    .ms .cell.opened { background: #e8ecf3; margin: 1px; animation: pop .18s var(--ease-pop); }
    .ms .cell.boom { background: #ff5c5c !important; }
    .ms .cell.wrong { background: #ffb3b3 !important; }
  ` });
  root.appendChild(style);
  const boardWrap = h('div');
  const ctl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px', marginTop: '10px' } });
  const flagBtn = h('button', { class: 'btn btn-sm', text: '🚩 깃발 모드: 꺼짐', onclick: () => { flagMode = !flagMode; flagBtn.textContent = `🚩 깃발 모드: ${flagMode ? '켜짐' : '꺼짐'}`; flagBtn.classList.toggle('btn-primary', flagMode); ctx.sound.play('click'); } });
  ctl.append(flagBtn, h('span', { class: 'hint', text: '길게 누르면 깃발' }));
  wrap.append(boardWrap, ctl);

  function build(r, c) {
    boardWrap.innerHTML = '';
    rows = r; cols = c;
    board = new GridBoard(boardWrap, { rows: r, cols: c, style: 'none', theme: 'blue', className: 'ms', extraSvg: `<rect width="${c}" height="${r}" fill="#7f8ca0"/>` });
    board.el.style.setProperty('--fs', c > 12 ? '13px' : c > 9 ? '15px' : '18px');
    board.el.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
    board.el.style.borderRadius = '8px';
    board.bg.style.borderRadius = '8px';
    // 길게 누르기
    board.cellsEl.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.cell'); if (!cell) return;
      longPressed = false;
      pressTimer = setTimeout(() => { longPressed = true; act(+cell.dataset.r, +cell.dataset.c, true); }, 380);
    });
    const cancel = () => clearTimeout(pressTimer);
    board.cellsEl.addEventListener('pointerup', cancel); board.cellsEl.addEventListener('pointerleave', cancel); board.cellsEl.addEventListener('pointercancel', cancel);
    board.cellsEl.addEventListener('contextmenu', (e) => e.preventDefault());
    board.opts.onCell = (rr, cc) => { if (longPressed) { longPressed = false; return; } act(rr, cc, flagMode); };
  }

  function act(r, c, flag) {
    if (!ctx.canAct()) return;
    const state = ctx.match.state;
    const i = r * cols + c;
    const t = state.started ? performance.now() - startAt : 0;
    if (state.open[i]) { if (state.adj && state.adj[i] > 0) ctx.submit({ chord: i, t }); return; }
    if (flag) { ctx.submit({ flag: i, t }); return; }
    if (state.flag[i]) { ctx.sound.play('error'); return; }
    ctx.submit({ open: i, t });
  }

  function render(state, events, animate) {
    for (const el of board.cellsEl.children) {
      const i = +el.dataset.r * cols + +el.dataset.c;
      el.className = 'cell';
      el.innerHTML = '';
      el.style.color = '';
      if (state.open[i]) {
        el.classList.add('opened');
        const n = state.adj[i];
        if (n) { el.textContent = n; el.style.color = NUM_COLORS[n]; }
      } else {
        el.classList.add('closed');
        if (state.flag[i]) el.textContent = '🚩';
      }
      if (state.over) {
        if (state.mine && state.mine[i] && !state.flag[i]) { el.classList.remove('closed'); el.classList.add('opened'); el.textContent = state.won ? '🚩' : '💣'; }
        if (state.flag[i] && state.mine && !state.mine[i]) { el.classList.add('wrong'); el.textContent = '❌'; }
        if (i === state.boom) el.classList.add('boom');
      }
    }
  }

  function tick() {
    elapsed = performance.now() - startAt;
    ctx.setSeatInfo(0, { score: `${Math.floor(elapsed / 1000)}s` });
  }

  return {
    update(state, events, prev, animate) {
      if (state.rows !== rows || state.cols !== cols) build(state.rows, state.cols);
      if (state.started && !timer && !state.over) { startAt = performance.now() - (state.time || 0); timer = setInterval(tick, 500); }
      if (state.over && timer) { clearInterval(timer); timer = null; }
      render(state, events, animate);
      const flags = state.flag.filter(Boolean).length;
      ctx.setSeatInfo(0, { score: state.started ? `${Math.floor((state.over ? state.time : performance.now() - startAt) / 1000)}s` : '0s', sub: `💣 ${state.mines - flags} 남음` });
      if (animate) for (const ev of events) {
        if (ev.type === 'open') { ctx.sound.play(ev.cells.length > 3 ? 'swoosh' : 'tap'); ctx.haptics.tap(); }
        else if (ev.type === 'flag') { ctx.sound.play('pop'); ctx.haptics.tap(); }
        else if (ev.type === 'boom') { const p = board.centerOf((ev.i / cols) | 0, ev.i % cols); ctx.fx.burst(p.x, p.y, { count: 40, palette: 'fire', speed: 1.8, size: 5 }); ctx.fx.ring(p.x, p.y, { color: '#ffb547', size: 60 }); ctx.sound.play('boom'); ctx.haptics.fail(); ctx.fx.shake(true); ctx.fx.stamp('펑!', { glow: 'rgba(255,77,46,1)' }); }
        else if (ev.type === 'clear') { ctx.fx.stamp('클리어!', { glow: 'rgba(61,220,151,1)' }); ctx.sound.play('score'); }
        else if (ev.type === 'nochord') ctx.sound.play('error');
      }
      ctx.setStatus(state.over ? '' : state.started ? '' : '아무 칸이나 눌러 시작하세요 (첫 칸은 안전해요)');
    },
    reset() { if (timer) { clearInterval(timer); timer = null; } },
    destroy() { if (timer) clearInterval(timer); wrap.remove(); style.remove(); },
  };
}
