// 홈 화면: 게임 목록
import { h, clear, fmtPlayers } from '../core/util.js';
import { GAMES, CATEGORIES, iconHtml } from '../core/registry.js';
import { store } from '../core/store.js';
import { navigate } from '../core/router.js';
import { sound } from '../core/sound.js';
import { haptics } from '../core/haptics.js';
import { openModal, prompt } from './modal.js';
import { net } from '../core/net.js';
import * as install from '../core/install.js';
import { toast } from './toast.js';

// 앱 설치 안내/실행
export async function openInstall() {
  sound.play('click');
  if (install.canPrompt()) {
    const r = await install.prompt();
    if (r === 'accepted') toast('설치했어요! 홈 화면에서 한판!을 열어보세요', { type: 'good', ms: 3000 });
    return;
  }
  const steps = install.manualGuide();
  openModal({
    title: '📲 홈 화면에 앱으로 추가',
    body: h('div', null,
      h('p', { text: '앱 스토어 없이 바로 설치돼요. 아이콘으로 열면 전체 화면으로 실행되고, 혼자 하는 게임은 오프라인에서도 돼요.' }),
      h('ol', { style: { margin: '0 0 8px 18px', padding: 0, lineHeight: 1.7, fontSize: '14px' } }, steps.map((s) => h('li', { text: s })))),
    buttons: [{ text: '알겠어요', cls: 'btn-primary' }],
  });
}

let category = 'all';

export function avatarFor(name, type) {
  if (type === 'bot') return '🤖';
  const set = ['🐧', '🐱', '🦦', '🦊', '🐼', '🦔', '🐢', '🐿️', '🦉', '🐰', '🐨', '🐯', '🐸', '🐮', '🦁', '🐥'];
  let hsh = 0;
  for (const ch of String(name || '')) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  return set[hsh % set.length];
}

export function openSettings(onChange) {
  const toggle = (label, key) => {
    const sw = h('button', { class: 'switch' + (store.settings[key] ? ' on' : ''), onclick: () => { store.set(key, !store.settings[key]); sw.classList.toggle('on', store.settings[key]); sound.setEnabled(store.settings.sound); haptics.setEnabled(store.settings.haptic); if (store.settings.sound) sound.play('click'); if (onChange) onChange(); } });
    return h('div', { class: 'toggle-row' }, h('span', { text: label }), sw);
  };
  const themeSeg = h('div', { class: 'seg' }, ['dark', 'light'].map((t) => h('button', { class: store.settings.theme === t ? 'active' : '', text: t === 'dark' ? '다크' : '라이트', onclick: (e) => { store.set('theme', t); [...themeSeg.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); sound.play('click'); } })));
  const nameRow = h('div', { class: 'toggle-row' }, h('span', { text: '닉네임' }), h('button', { class: 'btn btn-sm', text: store.name, onclick: async () => {
    const v = await prompt('닉네임 바꾸기', { label: '게임에서 보일 이름 (12자까지)', value: store.name });
    if (v) { store.set('name', v); nameRow.lastChild.textContent = v; if (onChange) onChange(); }
  } }));
  openModal({
    title: '설정',
    body: h('div', null,
      nameRow,
      toggle('효과음', 'sound'),
      toggle('진동', 'haptic'),
      h('div', { class: 'toggle-row' }, h('span', { text: '테마' }), themeSeg),
      install.canInstall() ? h('div', { class: 'toggle-row' }, h('span', { text: '홈 화면에 앱으로 추가' }), h('button', { class: 'btn btn-sm btn-primary', text: '📲 설치', onclick: () => openInstall() })) : null,
      h('p', { class: 'hint mt', text: '한판! v1.1 · 앱 설치 없이 링크 하나로 친구와 바로 즐기세요.' }),
    ),
    buttons: [{ text: '닫기', cls: 'btn-primary' }],
  });
}

export function renderHome() {
  const app = document.getElementById('app');
  clear(app);

  const meChip = h('button', { class: 'me-chip', onclick: () => openSettings(() => { meChip.querySelector('span').textContent = store.name; meChip.querySelector('.avatar').textContent = avatarFor(store.name); }) },
    h('div', { class: 'avatar', text: avatarFor(store.name) }), h('span', { text: store.name }));

  const hero = h('div', { class: 'home-hero' },
    h('div', null, h('div', { class: 'home-logo', html: '한<em>판!</em>' }), h('div', { class: 'home-tag', text: '두뇌 보드게임 컬렉션 · 친구와 온라인으로, 혹은 봇과' })),
    meChip);

  const grid = h('div', { class: 'game-grid' });
  const chips = h('div', { class: 'chips' }, CATEGORIES.map((c) => h('button', { class: 'chip' + (c.id === category ? ' active' : ''), text: c.name, onclick: (e) => { category = c.id; [...chips.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); sound.play('click'); fill(); } })));

  function fill() {
    clear(grid);
    const list = GAMES.filter((g) => category === 'all' || g.category === category);
    list.forEach((g, i) => {
      const st = store.statsOf(g.id);
      const played = st.win + st.lose + st.draw;
      grid.appendChild(h('button', { class: 'game-card', style: { animationDelay: `${Math.min(i, 12) * 30}ms` }, onclick: () => { sound.play('click'); haptics.tap(); navigate(`/game/${g.id}`); } },
        h('div', { class: 'gc-icon', html: iconHtml(g.icon) }),
        h('div', { class: 'gc-name', text: g.name }),
        h('div', { class: 'gc-tag', text: g.tagline }),
        h('div', { class: 'gc-meta' },
          h('span', { class: 'badge', text: '👤 ' + fmtPlayers(g.players) }),
          g.players.length > 1 || g.players[0] > 1 ? h('span', { class: 'badge info', text: '온라인' }) : h('span', { class: 'badge good', text: '퍼즐' }),
          played ? h('span', { class: 'badge accent', text: `${st.win}승` }) : null,
        ),
      ));
    });
  }
  fill();

  const screen = h('div', { class: 'screen wide' }, hero);
  // 앱 설치 안내 (설치 가능하거나 iOS 브라우저일 때)
  if (install.canInstall() && !sessionStorage.getItem('hanpan.installDismissed')) {
    const chip = h('div', { class: 'install-chip' },
      h('div', { class: 'ic-ico', text: '📲' }),
      h('div', { class: 'grow' }, h('div', { class: 'ic-title', text: '홈 화면에 앱으로 추가' }), h('div', { class: 'ic-desc', text: '전체 화면으로 열리고, 혼자 하는 게임은 오프라인에서도 돼요' })),
      h('button', { class: 'btn btn-sm btn-primary', text: '설치', onclick: () => openInstall() }),
      h('button', { class: 'btn btn-icon plain', text: '✕', onclick: () => { try { sessionStorage.setItem('hanpan.installDismissed', '1'); } catch { /* */ } chip.remove(); } }));
    screen.appendChild(chip);
    install.onChange(() => { if (!install.canInstall()) chip.remove(); });
  }
  // 진행 중이던 온라인 방이 있으면 안내
  const sess = store.session;
  if (sess && sess.code) {
    screen.appendChild(h('div', { class: 'banner' }, `${sess.gameName || '게임'} 방(${sess.code})에 있었어요`,
      h('button', { class: 'btn btn-primary', text: '돌아가기', onclick: () => navigate(`/room/${sess.code}`) }),
      h('button', { class: 'btn', text: '잊기', onclick: (e) => { store.session = null; net.close(); e.currentTarget.parentElement.remove(); } })));
  }
  screen.append(chips, grid);
  app.appendChild(screen);
}
