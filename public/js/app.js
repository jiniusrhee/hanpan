// 앱 진입점: 라우팅, 초기화
import { route, start, navigate } from './core/router.js';
import { store } from './core/store.js';
import { sound } from './core/sound.js';
import { haptics } from './core/haptics.js';
import { initKakao } from './core/share.js';
import { session } from './core/session.js';
import { loadGame, gameById } from './core/registry.js';
import * as install from './core/install.js';
import { renderHome } from './ui/home.js';
import { renderSetup } from './ui/setup.js';
import { renderLobby } from './ui/lobby.js';
import { renderPlay } from './ui/play.js';
import { toast } from './ui/toast.js';
import { net } from './core/net.js';
import { showWake, hideWake, setWakeStage } from './ui/wake.js';

store.init();
sound.setEnabled(store.settings.sound);
haptics.setEnabled(store.settings.haptic);
install.init();

// 대전 서버가 잠들어 있으면(무료 서버) 깨우는 동안 우리 로딩 화면을 보여 주고, 앱을 열 때 미리 조용히 깨워 둔다
net.hooks.wake = (phase, info) => {
  if (phase === 'start') showWake({ cancel: info && info.cancel });
  else if (phase === 'stage') setWakeStage(info);
  else if (phase === 'done') hideWake(true);
  else if (phase === 'fail') hideWake(false);
};
net.prewarm();

// 첫 터치에서 오디오 잠금 해제
const unlock = () => { sound.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
document.addEventListener('pointerdown', unlock);
document.addEventListener('keydown', unlock);

route('/', renderHome);
route('/game/:id', renderSetup);
route('/room/:code', renderLobby);
route('/join/:code', ({ code }) => { navigate(`/room/${code.toUpperCase()}`, { replace: true }); });
route('/play', async (params, query) => {
  // 테스트/시뮬레이션용 바로 시작: /play?sim=<게임id>&players=<n>&<옵션키>=<값>
  //   추가: &bots=all 또는 &bots=1,2 로 해당 좌석을 봇으로, &level=1~3 으로 난이도 지정
  const simId = query && query.get('sim');
  if (simId && gameById(simId)) {
    const game = await loadGame(simId);
    const g = gameById(simId);
    const options = {};
    for (const o of game.meta.options || []) {
      options[o.key] = o.default;
      const v = query.get(o.key);
      if (v != null) { const found = o.values.find((x) => String(x.value) === v); if (found) options[o.key] = found.value; }
    }
    let n = +(query.get('players') || 0);
    if (!g.players.includes(n)) n = g.players[0];
    const names = game.meta.seatNames ? game.meta.seatNames(n, options) : [];
    const botsArg = query.get('bots') || '';
    const botSeats = botsArg === 'all' ? Array.from({ length: n }, (_, i) => i) : botsArg.split(',').filter((x) => x !== '').map(Number);
    const level = Math.min(3, Math.max(1, +(query.get('level') || 2)));
    session.pending = {
      gameId: simId, game, options, mode: botSeats.length ? 'bot' : 'hotseat', sim: true, seed: +(query.get('seed') || ((Math.random() * 2 ** 31) | 0)),
      seats: Array.from({ length: n }, (_, i) => (botSeats.includes(i)
        ? { type: 'bot', name: `${names[i] || i + 1} 봇`, level, local: true }
        : { type: 'human', name: i === 0 ? store.name : `${names[i] || i + 1} 플레이어`, local: true })),
    };
  }
  return renderPlay();
});

start();
initKakao();

// 서비스 워커 (오프라인 캐시, 홈 화면 추가). https 또는 localhost에서만.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).then((reg) => {
      // 새 버전이 준비되면 조용히 교체
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('새 버전이 준비됐어요. 다음에 열 때 적용돼요.'); });
      });
    }).catch(() => {});
  });
}

window.addEventListener('error', (e) => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (e.reason && e.reason.message && /연결/.test(e.reason.message)) toast(e.reason.message, { type: 'error' }); });
