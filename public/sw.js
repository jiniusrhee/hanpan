// 서비스 워커: 앱 껍데기와 게임 모듈을 캐시해서 설치형 앱처럼, 오프라인에서도 혼자 하기가 되게 한다.
// 경로는 모두 이 파일이 놓인 위치(scope) 기준이라 루트/하위 경로 배포 모두 동작한다.
const VERSION = 'hanpan-v3';
const GAMES = ['chess', 'janggi', 'othello', 'gomoku', 'go', 'checkers', 'connect4', 'tictactoe', 'ultimate', 'mancala', 'morris', 'hex', 'dots', 'battleship', 'quoridor', 'backgammon', 'yut', 'ludo', 'blokus', 'yacht', 'g2048', 'minesweeper', 'sudoku'];
const CORE = [
  './', './index.html', './config.js', './manifest.json', './css/app.css', './img/icon.svg', './img/icon-192.png', './img/icon-512.png', './img/og.png',
  './js/app.js',
  ...['ai-worker', 'ai', 'board', 'bot', 'fx', 'haptics', 'install', 'match', 'net', 'registry', 'rng', 'router', 'session', 'share', 'sound', 'store', 'util'].map((m) => `./js/core/${m}.js`),
  ...['home', 'lobby', 'modal', 'play', 'setup', 'toast'].map((m) => `./js/ui/${m}.js`),
  './js/games/chess/pieces.js',
  ...GAMES.flatMap((g) => [`./js/games/${g}/rules.js`, `./js/games/${g}/view.js`]),
];

const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 하나가 실패해도 나머지는 캐시되도록 개별 처리
    await Promise.all(CORE.map((p) => cache.add(scopeUrl(p)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/ws') || url.pathname.includes('/api/')) return;

  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    // 온라인이면 서버가 만든 HTML(초대 링크 미리보기 포함), 오프라인이면 캐시된 껍데기
    e.respondWith(fetch(req).catch(async () => (await caches.match(scopeUrl('./index.html'))) || (await caches.match(scopeUrl('./')))));
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const fetching = fetch(req).then(async (res) => {
      if (res && res.ok && (url.pathname.match(/\.(js|css|png|svg|json|webmanifest)$/))) { const c = await caches.open(VERSION); c.put(req, res.clone()); }
      return res;
    }).catch(() => hit);
    return hit || fetching;
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
