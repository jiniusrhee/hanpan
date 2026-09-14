// 게임 설정 화면: 모드 선택(봇/온라인/한 기기), 옵션, 시작
import { h, clear, fmtPlayers } from '../core/util.js';
import { gameById, loadGame, iconHtml } from '../core/registry.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { sound } from '../core/sound.js';
import { haptics } from '../core/haptics.js';
import { net } from '../core/net.js';
import { session } from '../core/session.js';
import { toast } from './toast.js';
import { showRules } from './modal.js';

const LEVELS = [{ value: 1, label: '쉬움' }, { value: 2, label: '보통' }, { value: 3, label: '어려움' }];

function seg(values, current, onPick) {
  const el = h('div', { class: 'seg' });
  for (const v of values) {
    el.appendChild(h('button', { class: v.value === current ? 'active' : '', text: v.label, onclick: (e) => { sound.play('click'); [...el.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); onPick(v.value); } }));
  }
  return el;
}

export async function renderSetup({ id }) {
  const app = document.getElementById('app');
  const g = gameById(id);
  if (!g) { navigate('/', { replace: true }); return; }
  clear(app);
  app.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('div', { text: `${g.name} 불러오는 중…` })));

  let game;
  try { game = await loadGame(id); } catch (e) { console.error(e); toast('게임을 불러오지 못했어요', { type: 'error' }); navigate('/', { replace: true }); return; }
  const meta = game.meta;
  clear(app);

  const soloOnly = g.players.length === 1 && g.players[0] === 1;
  const canSolo = g.players.includes(1);
  const multi = g.players.some((n) => n >= 2);
  const modes = [];
  if (canSolo) modes.push({ id: 'solo', ico: '🧠', title: soloOnly ? '시작하기' : '혼자 하기', desc: soloOnly ? '바로 시작해요' : '혼자서 기록에 도전해요' });
  if (multi) {
    modes.push({ id: 'bot', ico: '🤖', title: '봇과 대결', desc: '난이도를 고르고 바로 시작' });
    modes.push(net.available
      ? { id: 'online', ico: '🔗', title: '친구와 온라인', desc: '초대 링크를 카톡으로 보내면 끝' }
      : { id: 'online', ico: '🔗', title: '친구와 온라인', desc: '이 주소에서는 서버가 없어 쓸 수 없어요. 아래 "한 기기에서"로 함께 즐기거나 서버 배포판을 이용해 주세요.', disabled: true });
    modes.push({ id: 'hotseat', ico: '📱', title: '한 기기에서', desc: '폰 하나로 번갈아 가며' });
  }
  let mode = modes[0].id;
  const options = {};
  for (const o of meta.options || []) options[o.key] = o.default;
  let level = 2;
  let mySide = 'random';       // 'first' | 'second' | 'random'
  let playerCount = Math.min(...g.players.filter((n) => n >= 2)) || 1;
  if (mode === 'solo') playerCount = 1;

  const st = store.statsOf(id);

  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn btn-icon plain', text: '‹', style: { fontSize: '28px' }, onclick: () => navigate('/') }),
    h('div', { class: 'topbar-title', text: g.name }),
    h('button', { class: 'btn btn-icon plain', text: '📖', title: '규칙', onclick: () => showRules(g, meta.rules) }));

  const hero = h('div', { class: 'setup-hero' },
    h('div', { class: 'big-icon', html: iconHtml(g.icon) }),
    h('div', { class: 'grow' }, h('h1', { text: g.name }), h('p', { text: meta.description || g.tagline }),
      h('div', { class: 'row mt', style: { gap: '6px', flexWrap: 'wrap' } },
        h('span', { class: 'badge', text: '👤 ' + fmtPlayers(g.players) }),
        multi ? h('span', { class: 'badge info', text: '온라인 대전' }) : null,
        multi ? h('span', { class: 'badge accent', text: '봇 지원' }) : null)));

  const optsCard = h('div', { class: 'card' });
  const modeList = h('div', { class: 'mode-list' });
  const startBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', text: '시작하기' });

  function renderModes() {
    clear(modeList);
    for (const m of modes) {
      modeList.appendChild(h('button', { class: 'mode-btn' + (mode === m.id ? ' active' : '') + (m.disabled ? ' disabled' : ''), onclick: () => { if (m.disabled) { sound.play('error'); toast('이 주소에서는 온라인 대전을 쓸 수 없어요'); return; } mode = m.id; if (mode === 'online') net.prewarm(); sound.play('click'); haptics.tap(); renderModes(); renderOptions(); } },
        h('div', { class: 'm-ico', text: m.ico }), h('div', null, h('div', { class: 'm-title', text: m.title }), h('div', { class: 'm-desc', text: m.desc }))));
    }
  }

  function renderOptions() {
    clear(optsCard);
    const rows = [];
    const counts = g.players.filter((n) => mode === 'solo' ? n === 1 : n >= 2);
    if (counts.length > 1) {
      if (!counts.includes(playerCount)) playerCount = counts[0];
      rows.push(h('div', { class: 'opt-row' }, h('div', null, h('div', { class: 'opt-label', text: '인원' }), h('div', { class: 'opt-desc', text: mode === 'bot' ? '나머지는 봇이 채워요' : mode === 'online' ? '빈 자리는 봇으로 채울 수 있어요' : '' })),
        seg(counts.map((n) => ({ value: n, label: `${n}명` })), playerCount, (v) => { playerCount = v; })));
    } else playerCount = counts[0] || 1;
    for (const o of meta.options || []) {
      if (o.modes && !o.modes.includes(mode)) continue;
      rows.push(h('div', { class: 'opt-row' }, h('div', null, h('div', { class: 'opt-label', text: o.label }), o.desc ? h('div', { class: 'opt-desc', text: o.desc }) : null),
        seg(o.values, options[o.key], (v) => { options[o.key] = v; })));
    }
    if (mode === 'bot') {
      rows.push(h('div', { class: 'opt-row' }, h('div', null, h('div', { class: 'opt-label', text: '봇 난이도' })), seg(LEVELS, level, (v) => { level = v; })));
      if (playerCount === 2) {
        const names = meta.seatNames ? meta.seatNames(2, options) : ['선공', '후공'];
        rows.push(h('div', { class: 'opt-row' }, h('div', null, h('div', { class: 'opt-label', text: '내 차례' })),
          seg([{ value: 'first', label: names[0] }, { value: 'second', label: names[1] }, { value: 'random', label: '랜덤' }], mySide, (v) => { mySide = v; })));
      }
    }
    if (rows.length === 0) rows.push(h('p', { class: 'hint', text: '추가 설정 없이 바로 시작할 수 있어요.' }));
    optsCard.append(...rows);
    startBtn.textContent = mode === 'online' ? '방 만들고 초대하기' : mode === 'bot' ? '봇과 시작' : mode === 'hotseat' ? '같이 시작' : '시작하기';
  }

  startBtn.addEventListener('click', async () => {
    sound.play('click'); haptics.tap();
    const seatNames = (n) => (meta.seatNames ? meta.seatNames(n, options) : Array.from({ length: n }, (_, i) => `${i + 1}번`));
    if (mode === 'online') {
      startBtn.disabled = true;
      try {
        const seats = Array.from({ length: playerCount }, () => ({ type: 'open' }));
        const res = await net.create({ gameId: id, gameName: g.name, options, seats, name: store.name });
        store.session = { code: res.code, token: res.token, gameName: g.name, name: store.name };
        navigate(`/room/${res.code}`);
      } catch (e) {
        if (!e.cancelled) toast(e.message || '방을 만들지 못했어요', { type: 'error' });
        startBtn.disabled = false;
      }
      return;
    }
    let seats;
    if (mode === 'solo') {
      seats = [{ type: 'human', name: store.name, local: true }];
    } else if (mode === 'bot') {
      const n = playerCount;
      let my = 0;
      if (n === 2) my = mySide === 'first' ? 0 : mySide === 'second' ? 1 : (Math.random() < 0.5 ? 0 : 1);
      else my = (Math.random() * n) | 0;
      const names = seatNames(n);
      const botNames = ['알파', '베타', '감마', '델타'];
      let b = 0;
      seats = Array.from({ length: n }, (_, i) => i === my
        ? { type: 'human', name: store.name, local: true }
        : { type: 'bot', name: `${botNames[b++]}봇`, level, local: true, seatName: names[i] });
    } else {
      const names = seatNames(playerCount);
      seats = Array.from({ length: playerCount }, (_, i) => ({ type: 'human', name: i === 0 ? store.name : `${names[i]} 플레이어`, local: true }));
    }
    session.pending = { gameId: id, game, options, seats, mode, seed: (Math.random() * 2 ** 31) | 0, level };
    navigate('/play');
  });

  renderModes();
  renderOptions();

  const statCard = (st.win + st.lose + st.draw) > 0 || st.best != null ? h('div', { class: 'stat-line' },
    multi ? h('span', { html: `봇 상대 전적 <b>${st.win}승 ${st.lose}패${st.draw ? ' ' + st.draw + '무' : ''}</b>` }) : null,
    st.best != null ? h('span', { html: `최고 기록 <b>${meta.formatBest ? meta.formatBest(st.best) : st.best}</b>` }) : null) : null;

  app.append(topbar, h('div', { class: 'screen' }, hero, h('div', { class: 'section-title', text: '어떻게 할까요?' }), modeList, h('div', { class: 'section-title', text: '설정' }), optsCard, statCard, startBtn,
    h('button', { class: 'btn btn-ghost btn-block', text: '📖 규칙 보기', onclick: () => showRules(g, meta.rules) })));
}
