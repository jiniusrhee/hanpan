// 플레이 화면: 보드 + 좌석 패널 + 액션 + 결과 + 온라인 동기화
import { h, clear } from '../core/util.js';
import { gameById, loadGame } from '../core/registry.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { sound } from '../core/sound.js';
import { haptics } from '../core/haptics.js';
import { net } from '../core/net.js';
import { session } from '../core/session.js';
import { Match } from '../core/match.js';
import { Fx, confetti } from '../core/fx.js';
import { toast } from './toast.js';
import { confirm, openModal, showRules } from './modal.js';
import { avatarFor, openSettings } from './home.js';

export const SEAT_COLORS = ['#4fa3ff', '#ff6b6b', '#3ddc97', '#ffc247', '#c084fc', '#f472b6', '#22d3ee', '#a3e635'];
const LEVEL_NAME = ['', '쉬움', '보통', '어려움'];
const EMOTES = ['😀', '😎', '😮', '😭', '🔥', '👍', '🙏', '😤'];
const PHRASES = ['잘 부탁해요!', '좋은 수네요', '앗, 실수', '잠깐만요', 'ㅋㅋㅋ', '고마워요', '한 판 더?', '졌어요…'];

export async function renderPlay() {
  const cfg = session.pending;
  if (!cfg) {
    // 새로고침 등으로 설정이 사라졌으면, 온라인 방에 있었다면 그 방으로 돌아간다
    const sess = store.session;
    navigate(sess && sess.code ? `/room/${sess.code}` : '/', { replace: true });
    return;
  }
  const app = document.getElementById('app');
  clear(app);
  app.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' })));

  let game = cfg.game;
  if (!game) { try { game = await loadGame(cfg.gameId); } catch (e) { console.error(e); toast('게임을 불러오지 못했어요', { type: 'error' }); navigate('/', { replace: true }); return; } }
  const { rules, view: viewMod, meta } = game;
  const g = gameById(cfg.gameId);
  const online = cfg.mode === 'online';
  const hotseat = cfg.mode === 'hotseat';
  const seats = cfg.seats.map((s) => ({ ...s }));
  const n = seats.length;
  const seatNames = meta.seatNames ? meta.seatNames(n, cfg.options) : seats.map((_, i) => `${i + 1}번`);
  const seatColors = meta.seatColors ? meta.seatColors(n, cfg.options) : SEAT_COLORS;
  const mySeat = online ? cfg.mySeat : -1;
  const localHumans = seats.map((s, i) => (s.type === 'human' && s.local ? i : -1)).filter((i) => i >= 0);
  const perspective = online ? Math.max(0, mySeat) : localHumans.length ? localHumans[0] : 0;
  let round = cfg.round || 0;
  let viewStatus = null;
  let laidOut = false;
  let ended = false;
  let resultOverlay = null;
  let pendingUndo = false;
  let destroyed = false;
  const offs = [];

  // ---------- DOM ----------
  const root = h('div', { class: 'play' });
  const modeLabel = online ? `온라인 · 방 ${cfg.roomCode}` : cfg.mode === 'bot' ? '봇과 대결' : hotseat ? '한 기기에서' : '혼자 하기';
  const topbar = h('div', { class: 'play-top' },
    h('button', { class: 'btn btn-icon plain', text: '‹', style: { fontSize: '28px' }, onclick: onBack }),
    h('div', { class: 'play-title' }, g.name, h('small', { text: modeLabel })),
    h('button', { class: 'btn btn-icon plain', text: '⋯', onclick: openMenu }));
  const body = h('div', { class: 'play-body' });
  const bottom = h('div', { class: 'play-bottom' });
  const boardArea = h('div', { class: 'board-area' });
  const statusEl = h('div', { class: 'board-status' });
  const banner = h('div', { class: 'banner hidden' });
  const stackedSeats = n === 2 && meta.fit !== false; // 위/아래로 나누는 2인 배치
  const panels = seats.map((s, i) => makePanel(i, n > 2 || (n === 2 && !stackedSeats)));
  const topStrip = h('div', { class: 'seats-strip top' });
  const bottomStrip = h('div', { class: 'seats-strip bottom' });
  if (stackedSeats) { topStrip.appendChild(panels[1 - perspective]); bottomStrip.appendChild(panels[perspective]); }
  else { panels.forEach((p) => topStrip.appendChild(p)); }
  body.append(banner, topStrip, boardArea, statusEl, bottomStrip);
  const actionBar = h('div', { class: 'action-bar' });
  bottom.appendChild(actionBar);
  root.append(topbar, body, bottom);
  clear(app);
  app.appendChild(root);
  const fx = new Fx(boardArea);
  fx.enabled = store.settings.anim !== false;

  // ---------- 화면 맞춤: 어떤 기기에서도 보드가 화면 안에 들어오도록 ----------
  let fitTimer = null;
  function applyLayout() {
    if (destroyed) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const landscape = vw > vh * 1.15 && vh < 620;
    root.classList.toggle('landscape', landscape);
    root.classList.toggle('wide', vw > vh * 1.15); // 넓은 화면(태블릿 가로, PC)에서는 보조 컨트롤을 보드 옆에
    // 가로 모드에서는 액션바를 오른쪽 열(내 패널 아래)로 옮긴다
    if (landscape) { if (actionBar.parentElement !== bottomStrip) bottomStrip.appendChild(actionBar); }
    else if (actionBar.parentElement !== bottom) bottom.appendChild(actionBar);
    fitBoard(landscape);
  }
  function fitBoard(landscape) {
    boardArea.style.width = '';
    if (meta.fit === false) return; // 표 중심 화면(야찌 등)은 줄여도 높이가 안 줄어 스크롤이 자연스럽다
    const vh = window.innerHeight, vw = window.innerWidth;
    if (landscape) {
      // 가로 모드: 양옆 열을 뺀 너비와 세로 여유 중 작은 쪽에 맞춘다
      const availH = vh - topbar.getBoundingClientRect().height - 16; // 가로 모드에서 상태줄은 옆 열에 있다
      const sideW = Math.max(150, Math.min(260, vw * 0.22));
      const availW = vw - sideW * 2 - 40;
      boardArea.style.width = Math.max(200, Math.floor(availW)) + 'px';
      for (let pass = 0; pass < 3; pass++) {
        const r = boardArea.getBoundingClientRect();
        if (!r.height || !r.width || r.height <= availH + 1) return;
        // 보드 아래 컨트롤(고정 높이)이 있을 수 있어 몇 번 반복해 맞춘다
        const w = Math.min(availW, r.width * (availH / r.height));
        boardArea.style.width = Math.max(200, Math.floor(w)) + 'px';
      }
      return;
    }
    for (let pass = 0; pass < 3; pass++) {
      const r = boardArea.getBoundingClientRect();
      if (!r.height || !r.width) return;
      // 보드를 뺀 나머지 높이(패널, 상태줄, 간격, 여백, 상단바, 액션바)를 실제로 재서 남는 높이를 구한다
      const kids = [...body.children].filter((el) => !el.classList.contains('hidden')); // 높이 0인 빈 줄도 간격(gap)은 차지한다
      const contentH = kids.reduce((a, el) => a + el.getBoundingClientRect().height, 0) + 8 * Math.max(0, kids.length - 1) + 8;
      const nonBoard = (contentH - r.height) + topbar.getBoundingClientRect().height + bottom.getBoundingClientRect().height;
      const availH = vh - nonBoard - 2;
      if (r.height <= availH + 1) return;
      const w = Math.max(landscape ? 200 : 240, Math.floor(r.width * (availH / r.height)));
      if (w >= r.width - 1) return;
      boardArea.style.width = w + 'px';
    }
  }
  const onResize = () => { clearTimeout(fitTimer); fitTimer = setTimeout(applyLayout, 80); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  function makePanel(i, compact) {
    const s = seats[i];
    const el = h('div', { class: 'seat-panel' + (compact ? ' compact' : ''), style: { '--seat-color': seatColors[i] } },
      h('div', { class: 'sp-avatar', text: avatarFor(s.name, s.type) }),
      h('div', { class: 'sp-body' }, h('div', { class: 'sp-name', text: s.name }), h('div', { class: 'sp-sub', text: subOf(i) }), h('div', { class: 'sp-extra' })),
      h('div', { class: 'sp-score' }),
      h('div', { class: 'sp-turn', text: '차례' }));
    return el;
  }
  function subOf(i) {
    const s = seats[i];
    const parts = [seatNames[i]];
    if (s.type === 'bot') parts.push(`봇 ${LEVEL_NAME[s.level] || ''}`.trim());
    else if (online && i === mySeat) parts.push('나');
    else if (online && s.connected === false) parts.push('연결 끊김');
    return parts.join(' · ');
  }
  function refreshPanel(i) {
    const p = panels[i];
    p.querySelector('.sp-name').textContent = seats[i].name;
    p.querySelector('.sp-sub').textContent = subOf(i);
    p.querySelector('.sp-avatar').textContent = avatarFor(seats[i].name, seats[i].type);
  }

  // ---------- 매치 ----------
  const match = new Match({
    rules, gameId: cfg.gameId, options: cfg.options, seed: cfg.seed, seats, mode: cfg.mode, net: online ? net : null, isHost: !!cfg.isHost,
    hooks: {
      onState(state, events, prev, animate) {
        viewStatus = null;
        for (const ev of events) {
          if (ev.type === 'stamp') fx.stamp(ev.text, { color: ev.color, glow: ev.glow, small: ev.small });
          else if (ev.type === 'sound') sound.play(ev.name);
          else if (ev.type === 'shake') fx.shake(!!ev.hard);
          else if (ev.type === 'haptic') (haptics[ev.kind] || haptics.tap)();
        }
        try { view.update(state, events, prev, animate); } catch (e) { console.error(e); }
        updateTurnUI();
        if (!laidOut) { laidOut = true; requestAnimationFrame(applyLayout); setTimeout(applyLayout, 350); }
        else { applyLayout(); onResize(); } // 패널 내용(잡은 말 등)이 늘어나면 바로, 그리고 잠시 뒤 한 번 더 맞춘다
      },
      onOver(st) { onGameOver(st); },
      onBotThinking(seat, on) { panels.forEach((p, i) => p.classList.toggle('thinking', on && i === seat)); if (seat >= 0 && on) updateTurnUI(); },
      onError(msg) { toast(msg, { type: 'error' }); sound.play('error'); },
      onDesync() { if (online) net.send({ t: 'sync' }); },
      onTurn() { updateTurnUI(); },
    },
  });

  // ---------- 뷰 컨텍스트 ----------
  const ctx = {
    match, rules, meta, options: cfg.options, seats, mode: cfg.mode, online, hotseat, perspective, mySeat, seatNames,
    seatColors,
    mySeats: new Set(localHumans),
    boardArea, fx, sound, haptics,
    canAct: (seat) => match.canAct(seat == null ? match.state.turn : seat),
    submit: (move) => match.submit(move),
    legalMoves: () => match.legalMoves(),
    viewer: () => (hotseat && meta.hidden ? match.state.turn : perspective),
    setStatus: (txt) => { viewStatus = txt; renderStatus(); },
    setSeatInfo: (seat, info) => {
      const p = panels[seat]; if (!p) return;
      if (info.score != null) p.querySelector('.sp-score').textContent = info.score;
      if (info.extraHtml != null) p.querySelector('.sp-extra').innerHTML = info.extraHtml;
      if (info.sub != null) p.querySelector('.sp-sub').textContent = info.sub;
    },
    lock: (ms) => { match.locked = true; setTimeout(() => { match.locked = false; }, ms); },
    relayout: () => applyLayout(), // 뷰가 지연 렌더로 높이를 바꿨을 때 즉시 화면을 다시 맞춘다
    stamp: (text, opts) => fx.stamp(text, opts),
    isOver: () => !!match.over,
    restart: () => restart(),
  };

  let view;
  try { view = viewMod.create(boardArea, ctx); } catch (e) { console.error(e); toast('보드를 그리지 못했어요', { type: 'error' }); }
  requestAnimationFrame(applyLayout);

  // ---------- 상태 표시 ----------
  function renderStatus() {
    if (viewStatus != null) { statusEl.innerHTML = viewStatus; return; }
    const st = match.state; if (!st) return;
    if (match.over) { statusEl.textContent = '게임 종료'; return; }
    const t = st.turn; const s = seats[t];
    if (n === 1) { statusEl.textContent = ''; return; }
    if (s.type === 'bot') statusEl.innerHTML = `<b>${s.name}</b>이(가) 생각 중…`;
    else if (match.isLocalHuman(t)) statusEl.innerHTML = hotseat ? `<b>${s.name}</b>님 차례예요` : '<b>내 차례</b>예요';
    else statusEl.innerHTML = `<b>${s.name}</b>님 차례를 기다리는 중…`;
  }
  function updateTurnUI() {
    const st = match.state; if (!st) return;
    panels.forEach((p, i) => p.classList.toggle('current', !match.over && st.turn === i));
    renderStatus();
    renderActions();
  }

  // ---------- 액션 ----------
  function renderActions() {
    clear(actionBar);
    if (match.over) return;
    const canUndo = meta.undo !== false && (online ? n === 2 && mySeat >= 0 : true) && match.history.length > 0;
    if (meta.undo !== false && n > 1) actionBar.appendChild(h('button', { class: 'btn btn-sm', html: '↩ 무르기', disabled: !canUndo, onclick: onUndo }));
    if (online) actionBar.appendChild(h('button', { class: 'btn btn-sm', html: '💬 이모티콘', disabled: mySeat < 0, onclick: openEmotes }));
    if (n === 1) actionBar.appendChild(h('button', { class: 'btn btn-sm', html: '🔄 새 게임', onclick: async () => { if (await confirm('새로 시작할까요?', '지금 판은 사라져요.')) restart(); } }));
    else if (!(online && mySeat < 0)) actionBar.appendChild(h('button', { class: 'btn btn-sm btn-danger', html: n === 2 ? '🏳 항복' : '🚪 나가기', onclick: n === 2 ? onResign : onBack }));
    if (meta.extraActions) for (const a of meta.extraActions) actionBar.appendChild(h('button', { class: 'btn btn-sm', html: a.label, onclick: () => view.action && view.action(a.id) }));
  }

  async function onUndo() {
    sound.play('click');
    if (online) {
      if (pendingUndo) { toast('이미 요청을 보냈어요'); return; }
      const count = match.undoCountForSeat(mySeat);
      if (!count) return;
      const opp = seats[1 - mySeat];
      if (opp.type === 'bot') { net.send({ t: 'undo', count }); return; }
      pendingUndo = true;
      net.send({ t: 'relay', payload: { kind: 'undoReq', count } });
      toast('무르기 요청을 보냈어요. 상대의 답을 기다려요.');
      setTimeout(() => { pendingUndo = false; }, 15000);
      return;
    }
    let count = 1;
    if (cfg.mode === 'bot') count = match.undoCountForSeat(localHumans[0]);
    const done = match.undo(count);
    if (done) { sound.play('swoosh'); haptics.tap(); toast(`${done}수 물렀어요`); }
  }

  async function onResign() {
    sound.play('click');
    const seat = online ? mySeat : match.state.turn;
    if (seat < 0) return;
    if (!(await confirm('항복할까요?', `${seats[1 - seat].name}의 승리로 끝나요.`, { okText: '항복', danger: true }))) return;
    if (online) net.send({ t: 'relay', payload: { kind: 'resign', seat } });
    match.forceOver({ over: true, winner: 1 - seat, reason: `${seats[seat].name}님이 항복했어요` });
  }

  async function onBack() {
    sound.play('click');
    if (!match.over && match.history.length > 0 && n > 1) {
      if (!(await confirm('게임을 나갈까요?', online ? '나가면 상대에게 승리가 돌아가요.' : '지금 판은 사라져요.', { okText: '나가기', danger: true }))) return;
    }
    leave();
  }
  function leave() {
    if (online) { net.leave(); store.session = null; }
    navigate('/', { replace: true });
  }

  function openMenu() {
    sound.play('click');
    openModal({
      title: g.name,
      body: h('div', { style: { display: 'grid', gap: '8px' } },
        h('button', { class: 'btn btn-block', text: '📖 규칙 보기', onclick: () => showRules(g, meta.rules) }),
        h('button', { class: 'btn btn-block', text: '⚙️ 설정', onclick: () => openSettings() }),
        !online ? h('button', { class: 'btn btn-block', text: '🔄 처음부터 다시', onclick: async () => { if (await confirm('처음부터 다시 할까요?', '지금 판은 사라져요.')) restart(); } }) : null,
        h('button', { class: 'btn btn-block btn-danger', text: '🚪 나가기', onclick: onBack })),
      buttons: [{ text: '닫기' }],
    });
  }

  function openEmotes() {
    sound.play('click');
    const grid = h('div', { class: 'emote-grid' });
    let m;
    const send = (text, big) => { m.close(); showBubble(mySeat, text, big); net.send({ t: 'relay', payload: { kind: 'emote', text, big } }); };
    EMOTES.forEach((e) => grid.appendChild(h('button', { text: e, onclick: () => send(e, true) })));
    PHRASES.forEach((p) => grid.appendChild(h('button', { class: 'text', text: p, onclick: () => send(p, false) })));
    m = openModal({ title: '이모티콘 · 한마디', body: grid });
  }
  function showBubble(seat, text, big) {
    const p = panels[seat]; if (!p) return;
    p.querySelector('.bubble')?.remove();
    const b = h('div', { class: 'bubble' + (big ? ' big' : ''), text });
    p.appendChild(b);
    sound.play('pop');
    setTimeout(() => b.remove(), 2600);
  }

  // ---------- 결과 ----------
  function onGameOver(st) {
    if (ended) return;
    ended = true;
    updateTurnUI();
    if (online && cfg.isHost) net.send({ t: 'gameOver' });
    const delay = meta.resultDelay != null ? meta.resultDelay : 900;
    setTimeout(() => { if (!destroyed) showResult(st); }, delay);
  }

  function showResult(st) {
    let kind, title, emoji;
    const winnerName = st.winner != null && seats[st.winner] ? seats[st.winner].name : ''; // 혼자 하는 게임의 '패배'(winner=1)는 좌석이 없다
    if (n === 1) {
      kind = st.winner === 0 ? 'win' : 'lose';
      title = st.title || (kind === 'win' ? '클리어!' : '아쉬워요');
      emoji = kind === 'win' ? '🎉' : '💥';
    } else if (st.draw || st.winner == null) { kind = 'draw'; title = '무승부'; emoji = '🤝'; }
    else if (localHumans.length === 0) { kind = 'draw'; title = `${winnerName} 승리`; emoji = '🏆'; }
    else if (localHumans.includes(st.winner)) { kind = 'win'; title = hotseat && localHumans.length > 1 ? `${winnerName} 승리!` : '승리!'; emoji = '🏆'; }
    else { kind = 'lose'; title = hotseat ? `${winnerName} 승리` : '패배…'; emoji = '😢'; }

    if (kind === 'win') { sound.play('win'); haptics.success(); confetti(); }
    else if (kind === 'lose') { sound.play('lose'); haptics.fail(); }
    else { sound.play('draw'); }

    // 전적
    if (cfg.mode === 'bot' && localHumans.length === 1) store.addResult(cfg.gameId, kind === 'win' ? 'win' : kind === 'lose' ? 'lose' : 'draw');
    if (n === 1 && st.score != null) { if (store.setBest(cfg.gameId, 'best', st.score, meta.bestHigher !== false)) toast('최고 기록 갱신!', { type: 'good' }); }

    const scores = st.scores ? h('div', { class: 'r-scores' }, st.scores.map((sc, i) => h('div', null, h('b', { text: sc }), seats[i] ? seats[i].name : ''))) : null;
    const btns = h('div', { class: 'r-btns' });
    if (online) {
      if (mySeat >= 0) {
        const rb = h('button', { class: 'btn btn-primary btn-lg', text: '🔄 다시 하기', onclick: () => { sound.play('click'); net.send({ t: 'rematch' }); rb.disabled = true; rb.textContent = '상대의 응답을 기다리는 중…'; } });
        btns.appendChild(rb);
      }
      btns.appendChild(h('button', { class: 'btn', text: '판 보기', onclick: () => hideResult() }));
      btns.appendChild(h('button', { class: 'btn btn-ghost', text: '나가기', onclick: leave }));
    } else {
      btns.appendChild(h('button', { class: 'btn btn-primary btn-lg', text: n === 1 ? '🔄 새 게임' : '🔄 다시 하기', onclick: () => { sound.play('click'); restart(); } }));
      btns.appendChild(h('button', { class: 'btn', text: '판 보기', onclick: () => hideResult() }));
      btns.appendChild(h('button', { class: 'btn btn-ghost', text: '홈으로', onclick: () => navigate('/', { replace: true }) }));
    }
    resultOverlay = h('div', { class: 'result-overlay' }, h('div', { class: 'result-card' },
      h('div', { class: 'r-emoji', text: emoji }),
      h('h2', { class: kind, text: title }),
      h('p', { text: st.reason || (st.draw ? '' : winnerName ? `${winnerName}의 승리예요` : '') }),
      scores, btns));
    root.appendChild(resultOverlay);
  }
  function hideResult() {
    if (!resultOverlay) return;
    resultOverlay.remove(); resultOverlay = null;
    clear(actionBar);
    if (online) {
      if (mySeat >= 0) actionBar.appendChild(h('button', { class: 'btn btn-primary', text: '🔄 다시 하기', onclick: (e) => { net.send({ t: 'rematch' }); e.currentTarget.disabled = true; } }));
      actionBar.appendChild(h('button', { class: 'btn', text: '나가기', onclick: leave }));
    } else {
      actionBar.appendChild(h('button', { class: 'btn btn-primary', text: '🔄 다시 하기', onclick: () => restart() }));
      actionBar.appendChild(h('button', { class: 'btn', text: '홈으로', onclick: () => navigate('/', { replace: true }) }));
    }
  }

  function restart() {
    if (online) return;
    if (resultOverlay) { resultOverlay.remove(); resultOverlay = null; }
    ended = false;
    match.stop();
    match.stopped = false;
    if (view.reset) view.reset();
    match.start((Math.random() * 2 ** 31) | 0);
  }

  // ---------- 핫시트 커튼 (숨은 정보 게임) ----------
  let viewerOverride = null;
  ctx.viewer = () => (viewerOverride != null ? viewerOverride : hotseat && meta.hidden ? match.state.turn : perspective);
  if (hotseat && meta.hidden && !cfg.sim) {
    let lastTurn = null;
    const origOnState = match.hooks.onState;
    match.hooks.onState = (state, events, prev, animate) => {
      if (lastTurn !== null && state.turn !== lastTurn && !match.over) {
        // 방금 둔 사람의 시점으로 결과 애니메이션을 먼저 보여준 뒤 커튼을 내린다
        viewerOverride = lastTurn;
        match.locked = true;
        origOnState(state, events, prev, animate);
        const curtain = h('div', { class: 'curtain' }, h('div', null,
          h('div', { style: { fontSize: '48px' }, text: '📱' }),
          h('h2', { text: `${seats[state.turn].name}님 차례` }),
          h('p', { text: '기기를 넘겨주세요. 준비되면 아래 버튼을 눌러요.' }),
          h('button', { class: 'btn btn-primary btn-lg', text: '준비됐어요', onclick: () => { curtain.remove(); viewerOverride = null; match.locked = false; origOnState(state, [], null, false); } })));
        setTimeout(() => { if (!destroyed) root.appendChild(curtain); }, animate ? 1500 : 0);
      } else origOnState(state, events, prev, animate);
      lastTurn = state.turn;
    };
  }

  // ---------- 온라인 ----------
  if (online) {
    const setBanner = (text, btn) => { clear(banner); if (!text) { banner.classList.add('hidden'); return; } banner.classList.remove('hidden'); banner.append(text, btn || null); };
    offs.push(net.on('move', (m) => match.applyRemote(m.move, m.seat, m.idx)));
    offs.push(net.on('undo', (m) => { pendingUndo = false; const done = match.undo(m.count); if (done) { sound.play('swoosh'); toast(`${done}수 물렀어요`); } }));
    offs.push(net.on('relay', (m) => {
      const p = m.payload || {};
      if (p.kind === 'emote') showBubble(m.seat, p.text, p.big);
      else if (p.kind === 'undoReq') {
        if (mySeat < 0) return;
        openModal({ title: '무르기 요청', body: `${m.name}님이 ${p.count}수 무르기를 요청했어요. 들어줄까요?`, dismissible: false,
          buttons: [
            { text: '거절', onClick: () => net.send({ t: 'relay', payload: { kind: 'undoRes', ok: false } }) },
            { text: '수락', cls: 'btn-primary', onClick: () => net.send({ t: 'undo', count: p.count }) },
          ] });
        sound.play('notify');
      } else if (p.kind === 'undoRes') { pendingUndo = false; toast(p.ok ? '무르기를 수락했어요' : '상대가 무르기를 거절했어요'); }
      else if (p.kind === 'resign') { if (!match.over) match.forceOver({ over: true, winner: 1 - p.seat, reason: `${m.name}님이 항복했어요` }); }
      else if (p.kind === 'left') {
        if (!match.over) {
          if (n === 2 && m.seat !== mySeat) match.forceOver({ over: true, winner: mySeat >= 0 ? mySeat : 1 - m.seat, reason: `${m.name}님이 나갔어요` });
          else { toast(`${m.name}님이 나갔어요`); if (cfg.isHost) setBanner(`${m.name}님이 나갔어요`, h('button', { class: 'btn btn-primary', text: '봇으로 대체', onclick: () => net.send({ t: 'botify', seat: m.seat }) })); }
        }
      }
    }));
    offs.push(net.on('room', (m) => {
      const room = m.room;
      if (room.round !== round && room.status === 'playing' && room.seed) {
        // 다시 하기로 새 판이 시작됨 → 좌석이 바뀌므로 화면을 새로 그린다
        session.pending = {
          gameId: room.gameId, game, options: room.options || {}, mode: 'online', seed: room.seed, roomCode: room.code, round: room.round,
          mySeat: room.mySeat, isHost: room.isHost,
          seats: room.seats.map((s, i) => ({ type: s.type === 'bot' ? 'bot' : 'human', name: s.name || `${i + 1}번`, level: s.level || 2, local: i === room.mySeat, connected: s.connected })),
          moves: room.moves || [],
        };
        navigate('/play', { replace: true });
        return;
      }
      // 좌석 정보 갱신 (봇 대체, 재접속 등)
      room.seats.forEach((s, i) => {
        if (!seats[i]) return;
        const wasType = seats[i].type;
        seats[i].type = s.type === 'bot' ? 'bot' : 'human';
        seats[i].name = s.name || seats[i].name;
        seats[i].level = s.level || seats[i].level;
        seats[i].connected = s.connected;
        seats[i].local = i === mySeat;
        refreshPanel(i);
        if (wasType !== seats[i].type) match.next();
      });
      const disconnected = room.seats.map((s, i) => (s.type === 'human' && !s.connected && i !== mySeat ? s.name : null)).filter(Boolean);
      if (disconnected.length && !match.over) setBanner(`${disconnected.join(', ')}님 연결이 끊겼어요. 기다리는 중…`, cfg.isHost ? h('button', { class: 'btn btn-primary', text: '봇으로 대체', onclick: () => room.seats.forEach((s, i) => { if (s.type === 'human' && !s.connected && i !== mySeat) net.send({ t: 'botify', seat: i }); }) }) : null);
      else if (net.connected) setBanner('');
      // 무브 로그 동기화
      if (room.moves && room.moves.length !== match.moveCount && room.status !== 'lobby') match.replay(room.moves);
      if (room.rematchVotes && room.rematchVotes.length && match.over) {
        const others = room.rematchVotes.filter((s) => s !== mySeat).map((s) => seats[s]?.name).filter(Boolean);
        if (others.length) toast(`${others.join(', ')}님이 다시 하기를 원해요`);
      }
    }));
    offs.push(net.on('notice', (m) => toast(m.text)));
    offs.push(net.on('error', (m) => toast(m.msg, { type: 'error' })));
    offs.push(net.on('close', () => setBanner('연결이 끊어졌어요. 다시 연결 중…')));
    offs.push(net.on('open', () => setBanner('')));
    // 화면 전환 사이에 놓친 수가 있을 수 있으니 상태를 한 번 맞춘다
    setTimeout(() => { if (!destroyed) net.send({ t: 'sync' }); }, 50);
  }

  // ---------- 시뮬레이션 훅 (테스트 전용) ----------
  if (cfg.sim) {
    window.__hanpan = {
      gameId: cfg.gameId, players: n, match, ctx,
      step() {
        if (match.over) return { over: true };
        const ms = match.legalMoves();
        if (!ms.length) return { stuck: true };
        match.locked = false;
        const m = ms[(Math.random() * ms.length) | 0];
        const ok = match.submit(m);
        return { ok, over: !!match.over, turn: match.state.turn, moves: match.history.length };
      },
      restart() { restart(); },
      layout() { applyLayout(); },
      isOver: () => !!match.over,
    };
  }

  // ---------- 시작 ----------
  if (online && cfg.moves && cfg.moves.length) { match.seed = cfg.seed; match.replay(cfg.moves); }
  else match.start(cfg.seed);
  if (online && mySeat < 0) toast('관전 모드예요');

  return () => {
    destroyed = true;
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    clearTimeout(fitTimer);
    if (cfg.sim) delete window.__hanpan;
    match.stop();
    offs.forEach((o) => o());
    try { view && view.destroy && view.destroy(); } catch { /* */ }
    fx.destroy();
    session.pending = null;
  };
}
