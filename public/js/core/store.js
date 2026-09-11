// 설정 / 전적 / 세션 저장
const KEY = 'hanpan.settings.v1';
const STATS_KEY = 'hanpan.stats.v1';
const SESSION_KEY = 'hanpan.session.v1';

const ADJ = ['용감한', '느긋한', '재빠른', '수줍은', '든든한', '엉뚱한', '차분한', '반짝이는', '배고픈', '똑똑한', '장난꾸러기', '신나는'];
const ANIMAL = ['펭귄', '고양이', '수달', '여우', '판다', '고슴도치', '거북이', '다람쥐', '올빼미', '해달', '토끼', '코알라'];

function randomName() {
  return `${ADJ[(Math.random() * ADJ.length) | 0]} ${ANIMAL[(Math.random() * ANIMAL.length) | 0]}`;
}

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : { ...fallback }; } catch { return { ...fallback }; }
}
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 불가 */ } }

export const store = {
  settings: read(KEY, { name: '', sound: true, haptic: true, theme: 'dark', anim: true, boardTheme: 'wood' }),
  stats: read(STATS_KEY, {}),

  init() {
    if (!this.settings.name) { this.settings.name = randomName(); this.save(); }
    this.applyTheme();
  },
  save() { write(KEY, this.settings); },
  set(k, v) { this.settings[k] = v; this.save(); if (k === 'theme') this.applyTheme(); },
  applyTheme() {
    document.documentElement.dataset.theme = this.settings.theme === 'light' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.settings.theme === 'light' ? '#f3f4f8' : '#0e1016';
  },
  get name() { return this.settings.name; },
  randomName,

  // 전적: 게임별 {win, lose, draw, best}
  addResult(gameId, result) {
    const s = this.stats[gameId] || (this.stats[gameId] = { win: 0, lose: 0, draw: 0 });
    if (result in s) s[result] += 1;
    write(STATS_KEY, this.stats);
  },
  setBest(gameId, key, value, higherIsBetter = true) {
    const s = this.stats[gameId] || (this.stats[gameId] = { win: 0, lose: 0, draw: 0 });
    const cur = s[key];
    if (cur == null || (higherIsBetter ? value > cur : value < cur)) { s[key] = value; write(STATS_KEY, this.stats); return true; }
    return false;
  },
  statsOf(gameId) { return this.stats[gameId] || { win: 0, lose: 0, draw: 0 }; },

  // 온라인 방 재접속 정보
  get session() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } },
  set session(v) { try { if (v) sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* */ } },
};
