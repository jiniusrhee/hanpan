// 온라인 대기실: 초대 링크 공유, 좌석 관리, 시작
import { h, clear } from '../core/util.js';
import { gameById, loadGame } from '../core/registry.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { sound } from '../core/sound.js';
import { haptics } from '../core/haptics.js';
import { net } from '../core/net.js';
import { session } from '../core/session.js';
import { inviteUrl, shareKakao, shareNative, copyText, hasKakaoKey, hasNativeShare, inviteText } from '../core/share.js';
import { toast } from './toast.js';
import { confirm, openModal, showRules } from './modal.js';
import { avatarFor } from './home.js';

const SEAT_COLORS = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', '#c084fc', '#f472b6', '#22d3ee', '#a3e635'];

export async function renderLobby({ code }) {
  code = code.toUpperCase();
  const app = document.getElementById('app');
  clear(app);
  if (!net.available) {
    // 정적 호스팅(GitHub Pages 등)에는 대전 서버가 없다
    app.appendChild(h('div', { class: 'screen center' },
      h('div', { style: { fontSize: '52px', marginTop: '40px' }, text: '🔌' }),
      h('h2', { text: '이 주소에서는 온라인 대전을 쓸 수 없어요' }),
      h('p', { class: 'muted', text: '초대 링크로 함께 하려면 대전 서버가 있는 주소(서버 배포판)에서 방을 만들어야 해요. 이 주소에서는 봇 대전과 한 기기 대전을 즐길 수 있어요.' }),
      h('button', { class: 'btn btn-primary btn-lg', text: '홈으로', onclick: () => navigate('/', { replace: true }) })));
    return;
  }
  app.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('div', { text: '방에 들어가는 중…' })));

  // 접속 / 재접속
  const sess = store.session;
  try {
    if (net.room && net.room.code === code && net.connected) {
      // 이미 이 방에 있음
    } else if (sess && sess.code === code && sess.token) {
      await net.rejoin(code, sess.token, store.name);
    } else {
      await net.join(code, store.name);
    }
  } catch (e) {
    if (e.cancelled) { navigate('/', { replace: true }); return; }
    clear(app);
    app.appendChild(h('div', { class: 'screen center' },
      h('div', { style: { fontSize: '52px', marginTop: '40px' }, text: '😵' }),
      h('h2', { text: '방에 들어갈 수 없어요' }),
      h('p', { class: 'muted', text: e.message || '링크가 만료됐거나 방이 사라졌어요.' }),
      h('button', { class: 'btn btn-primary btn-lg', text: '홈으로', onclick: () => navigate('/', { replace: true }) })));
    return;
  }
  store.session = { code, token: net.room.token, name: store.name, gameName: sess && sess.code === code ? sess.gameName : '' };

  let room = null;
  let game = null;
  let started = false;
  const offs = [];

  const screen = h('div', { class: 'screen' });
  const topbar = h('div', { class: 'topbar' },
    h('button', { class: 'btn btn-icon plain', text: '‹', style: { fontSize: '28px' }, onclick: leave }),
    h('div', { class: 'topbar-title', text: '대기실' }),
    h('button', { class: 'btn btn-icon plain', text: '📖', onclick: () => { if (game) showRules(gameById(room.gameId), game.meta.rules); } }));
  clear(app);
  app.append(topbar, screen);

  async function leave() {
    if (!(await confirm('방에서 나갈까요?', room && room.isHost ? '방장이 나가도 방은 유지되지만, 다른 사람이 시작할 수는 없어요.' : '다시 들어오려면 초대 링크가 필요해요.'))) return;
    net.leave();
    store.session = null;
    navigate('/', { replace: true });
  }

  function render() {
    if (!room) return;
    clear(screen);
    const g = gameById(room.gameId);
    const gName = g ? g.name : room.gameName;
    const url = inviteUrl(room.code);
    const shareData = { code: room.code, gameName: gName, hostName: room.seats[room.hostSeat >= 0 ? room.hostSeat : 0]?.name || store.name };

    const codeCard = h('div', { class: 'room-code' },
      h('div', { class: 'rc-label', text: '초대 코드' }),
      h('div', { class: 'rc-value', text: room.code }),
      h('div', { class: 'rc-url', text: url }));

    const inviteBtns = h('div', { style: { display: 'grid', gap: '8px' } });
    const kakaoBtn = h('button', { class: 'btn btn-kakao btn-lg', html: '<span class="ico">💬</span> 카카오톡으로 초대하기', onclick: async () => {
      sound.play('click'); haptics.tap();
      if (hasKakaoKey()) { if (await shareKakao(shareData)) return; }
      if (hasNativeShare()) { const r = await shareNative(shareData); if (r === true || r === 'abort') return; }
      if (await copyText(`${inviteText(shareData)}\n${url}`)) toast('초대 메시지를 복사했어요. 카톡에 붙여넣기 하세요!', { type: 'good', ms: 3000 });
      else toast('복사에 실패했어요. 링크를 길게 눌러 복사해 주세요.', { type: 'error' });
    } });
    inviteBtns.appendChild(kakaoBtn);
    inviteBtns.appendChild(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', html: '<span class="ico">🔗</span> 링크 복사', onclick: async () => { sound.play('click'); if (await copyText(url)) toast('링크를 복사했어요', { type: 'good' }); else toast('복사에 실패했어요', { type: 'error' }); } }),
      hasNativeShare() ? h('button', { class: 'btn', html: '<span class="ico">📤</span> 다른 앱으로', onclick: () => shareNative(shareData) }) : null));

    const seatList = h('div', { class: 'seat-list' });
    const names = game && game.meta.seatNames ? game.meta.seatNames(room.seats.length, room.options) : room.seats.map((_, i) => `${i + 1}번`);
    room.seats.forEach((s, i) => {
      const isMe = i === room.mySeat;
      const row = h('div', { class: 'seat-row ' + s.type });
      row.appendChild(h('div', { class: 's-color', style: { background: SEAT_COLORS[i] } }));
      row.appendChild(h('div', { class: 's-avatar', text: s.type === 'open' ? '➕' : avatarFor(s.name, s.type) }));
      const label = s.type === 'open' ? '친구를 기다리는 중…' : s.name + (isMe ? ' (나)' : '') + (i === room.hostSeat ? ' 👑' : '');
      const sub = s.type === 'bot' ? `봇 · ${['', '쉬움', '보통', '어려움'][s.level] || '보통'}` : s.type === 'human' ? (s.connected ? '접속 중' : '연결 끊김') : '';
      row.appendChild(h('div', { class: 's-name' }, label, h('span', { class: 's-sub' }, s.type === 'human' ? h('span', { class: 'online-dot' + (s.connected ? '' : ' off') }) : null, `${names[i]}${sub ? ' · ' + sub : ''}`)));
      if (room.isHost && s.type !== 'human') {
        const ctrl = h('div', { class: 's-ctrl' });
        if (s.type === 'open') ctrl.appendChild(h('button', { class: 'btn btn-sm', text: '🤖 봇 넣기', onclick: () => { sound.play('click'); net.send({ t: 'setSeat', index: i, type: 'bot', level: 2 }); } }));
        else {
          ctrl.appendChild(h('button', { class: 'btn btn-sm', text: ['', '쉬움', '보통', '어려움'][s.level] || '보통', onclick: () => { sound.play('click'); net.send({ t: 'setSeat', index: i, type: 'bot', level: (s.level % 3) + 1 }); } }));
          ctrl.appendChild(h('button', { class: 'btn btn-sm', text: '✕', onclick: () => { sound.play('click'); net.send({ t: 'setSeat', index: i, type: 'open' }); } }));
        }
        row.appendChild(ctrl);
      }
      seatList.appendChild(row);
    });
    if (room.spectators && room.spectators.length) seatList.appendChild(h('div', { class: 'hint', text: `관전: ${room.spectators.join(', ')}` }));

    const humans = room.seats.filter((s) => s.type === 'human').length;
    const openSeats = room.seats.filter((s) => s.type === 'open').length;
    let action;
    if (room.mySeat < 0) {
      action = h('p', { class: 'hint center', text: '자리가 다 찼어요. 관전 모드로 지켜볼 수 있어요.' });
    } else if (room.isHost) {
      action = h('div', { style: { display: 'grid', gap: '8px' } },
        h('button', { class: 'btn btn-primary btn-lg btn-block', text: humans >= 2 || openSeats === 0 ? '게임 시작!' : '봇을 채워서 시작', disabled: false, onclick: () => { sound.play('click'); haptics.tap(); net.send({ t: 'start' }); } }),
        openSeats > 0 ? h('p', { class: 'hint center', text: `아직 빈 자리가 ${openSeats}개 있어요. 지금 시작하면 봇이 대신 앉아요.` }) : null);
    } else {
      action = h('div', { class: 'loading', style: { padding: '14px' } }, h('div', { class: 'spinner' }), h('div', { text: '방장이 시작하기를 기다리는 중…' }));
    }

    screen.append(
      h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { style: { fontSize: '13px', color: 'var(--muted)', fontWeight: 700 }, text: '게임' }), h('div', { style: { fontSize: '22px', fontWeight: 900 }, text: gName })),
      codeCard,
      h('div', { class: 'section-title', text: '친구 초대' }), inviteBtns,
      h('div', { class: 'section-title', text: `자리 (${room.seats.length}명)` }), seatList,
      action,
      h('button', { class: 'btn btn-ghost btn-block', text: '나가기', onclick: leave }),
    );
  }

  function goPlay() {
    if (started) return;
    started = true;
    session.pending = {
      gameId: room.gameId, game, options: room.options || {}, mode: 'online', seed: room.seed, roomCode: room.code, round: room.round,
      mySeat: room.mySeat, isHost: room.isHost,
      seats: room.seats.map((s, i) => ({ type: s.type === 'bot' ? 'bot' : 'human', name: s.name || `${i + 1}번`, level: s.level || 2, local: i === room.mySeat, connected: s.connected })),
      moves: room.moves || [],
    };
    navigate('/play', { replace: true });
  }

  offs.push(net.on('room', async (m) => {
    room = m.room;
    if (!game) {
      try { game = await loadGame(room.gameId); } catch (e) { console.error(e); }
      store.session = { ...store.session, gameName: room.gameName };
    }
    if (room.status === 'playing' && room.seed) { goPlay(); return; }
    render();
  }));
  offs.push(net.on('start', () => { /* room 메시지가 곧 따라오므로 거기서 처리 */ }));
  offs.push(net.on('notice', (m) => { toast(m.text); sound.play('notify'); }));
  offs.push(net.on('error', (m) => toast(m.msg, { type: 'error' })));
  offs.push(net.on('close', () => toast('연결이 끊어졌어요. 다시 연결 중…', { type: 'error' })));

  // 첫 room 메시지가 리스너 등록 전에 지나갔을 수 있으니 상태를 한 번 요청한다
  net.send({ t: 'sync' });

  return () => { offs.forEach((o) => o()); };
}
