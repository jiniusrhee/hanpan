// 게임 목록 - 홈 화면용 가벼운 메타데이터. 규칙/옵션 등 자세한 정보는 각 게임의 rules.js에 있다.
export const CATEGORIES = [
  { id: 'all', name: '전체' },
  { id: 'strategy', name: '전략' },
  { id: 'casual', name: '가볍게' },
  { id: 'party', name: '파티' },
  { id: 'solo', name: '혼자' },
];

const othelloIcon = `<svg viewBox="0 0 64 64"><circle cx="24" cy="32" r="18" fill="#111"/><circle cx="40" cy="32" r="18" fill="#f4f4f4" stroke="#999" stroke-width="2"/></svg>`;
const janggiIcon = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#f2d9a6" stroke="#b7414f" stroke-width="4"/><text x="32" y="34" text-anchor="middle" dominant-baseline="central" font-size="30" font-weight="900" fill="#b7414f" font-family="serif">楚</text></svg>`;
const hexIcon = `<svg viewBox="0 0 64 64"><polygon points="32,6 55,19 55,45 32,58 9,45 9,19" fill="#4fa3ff"/><polygon points="32,20 44,27 44,41 32,48 20,41 20,27" fill="#ff6b6b"/></svg>`;
const goIcon = `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#e9c98f"/><path d="M19 6v52M32 6v52M45 6v52M6 19h52M6 32h52M6 45h52" stroke="#6b4b2a" stroke-width="1.5"/><circle cx="19" cy="19" r="7" fill="#111"/><circle cx="45" cy="32" r="7" fill="#111"/><circle cx="32" cy="45" r="7" fill="#fafafa" stroke="#999"/><circle cx="32" cy="19" r="7" fill="#fafafa" stroke="#999"/></svg>`;
const gomokuIcon = `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#e9c98f"/><path d="M19 6v52M32 6v52M45 6v52M6 19h52M6 32h52M6 45h52" stroke="#6b4b2a" stroke-width="1.5"/><circle cx="19" cy="45" r="6" fill="#111"/><circle cx="32" cy="32" r="6" fill="#111"/><circle cx="45" cy="19" r="6" fill="#111"/><circle cx="19" cy="19" r="6" fill="#fafafa" stroke="#999"/><circle cx="45" cy="45" r="6" fill="#fafafa" stroke="#999"/></svg>`;
const c4Icon = `<svg viewBox="0 0 64 64"><rect x="4" y="8" width="56" height="48" rx="8" fill="#2f6fed"/><g fill="#fff"><circle cx="16" cy="20" r="5"/><circle cx="32" cy="20" r="5"/><circle cx="48" cy="20" r="5"/><circle cx="16" cy="44" r="5"/><circle cx="48" cy="32" r="5"/></g><g fill="#ff4d4d"><circle cx="16" cy="32" r="5"/><circle cx="32" cy="32" r="5"/><circle cx="48" cy="44" r="5"/></g><circle cx="32" cy="44" r="5" fill="#ffd166"/></svg>`;
const morrisIcon = `<svg viewBox="0 0 64 64" fill="none" stroke="#c9a46a" stroke-width="3"><rect x="8" y="8" width="48" height="48"/><rect x="20" y="20" width="24" height="24"/><path d="M32 8v12M32 44v12M8 32h12M44 32h12"/><g fill="#111" stroke="none"><circle cx="8" cy="8" r="5"/><circle cx="32" cy="8" r="5"/><circle cx="56" cy="8" r="5"/></g><g fill="#fff" stroke="none"><circle cx="20" cy="44" r="5"/><circle cx="44" cy="44" r="5"/></g></svg>`;
const quoridorIcon = `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="6" fill="#e9c98f"/><rect x="12" y="30" width="26" height="5" rx="2" fill="#8b5a2b"/><rect x="34" y="12" width="5" height="24" rx="2" fill="#8b5a2b"/><circle cx="20" cy="47" r="7" fill="#4fa3ff"/><circle cx="47" cy="19" r="7" fill="#ff6b6b"/></svg>`;
const mancalaIcon = `<svg viewBox="0 0 64 64"><rect x="4" y="16" width="56" height="32" rx="12" fill="#8b5a2b"/><g fill="#5a3a1a"><circle cx="20" cy="26" r="5"/><circle cx="32" cy="26" r="5"/><circle cx="44" cy="26" r="5"/><circle cx="20" cy="38" r="5"/><circle cx="32" cy="38" r="5"/><circle cx="44" cy="38" r="5"/></g><g fill="#3ddc97"><circle cx="19" cy="25" r="2"/><circle cx="22" cy="27" r="2"/><circle cx="33" cy="37" r="2"/><circle cx="45" cy="25" r="2"/><circle cx="43" cy="39" r="2"/></g></svg>`;
const battleshipIcon = `<svg viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="8" fill="#1e3a5f"/><path d="M4 22h56M4 36h56M4 50h56M18 4v56M32 4v56M46 4v56" stroke="rgba(255,255,255,.15)"/><rect x="20" y="24" width="24" height="10" rx="5" fill="#9aa5b1"/><circle cx="52" cy="14" r="5" fill="#ff4d4d"/><circle cx="12" cy="44" r="4" fill="#fff" opacity=".7"/></svg>`;
const backgammonIcon = `<svg viewBox="0 0 64 64"><rect x="4" y="6" width="56" height="52" rx="6" fill="#7a4b25"/><g fill="#f2d9a6"><polygon points="8,10 16,10 12,34"/><polygon points="24,10 32,10 28,34"/><polygon points="40,10 48,10 44,34"/></g><g fill="#3b2410"><polygon points="16,10 24,10 20,34"/><polygon points="32,10 40,10 36,34"/><polygon points="48,10 56,10 52,34"/></g><circle cx="12" cy="50" r="5" fill="#fff"/><circle cx="28" cy="50" r="5" fill="#111"/><circle cx="44" cy="50" r="5" fill="#fff"/></svg>`;
const yutIcon = `<svg viewBox="0 0 64 64"><g transform="rotate(-20 32 32)"><rect x="12" y="8" width="8" height="48" rx="4" fill="#e9c98f" stroke="#8b5a2b" stroke-width="2"/><rect x="24" y="8" width="8" height="48" rx="4" fill="#8b5a2b"/><rect x="36" y="8" width="8" height="48" rx="4" fill="#e9c98f" stroke="#8b5a2b" stroke-width="2"/><rect x="48" y="8" width="8" height="48" rx="4" fill="#e9c98f" stroke="#8b5a2b" stroke-width="2"/></g></svg>`;
const checkersIcon = `<svg viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="6" fill="#efd7ac"/><g fill="#b58863"><rect x="4" y="4" width="14" height="14"/><rect x="32" y="4" width="14" height="14"/><rect x="18" y="18" width="14" height="14"/><rect x="46" y="18" width="14" height="14"/><rect x="4" y="32" width="14" height="14"/><rect x="32" y="32" width="14" height="14"/><rect x="18" y="46" width="14" height="14"/><rect x="46" y="46" width="14" height="14"/></g><circle cx="11" cy="11" r="5.5" fill="#c0392b"/><circle cx="39" cy="11" r="5.5" fill="#c0392b"/><circle cx="25" cy="25" r="5.5" fill="#c0392b"/><circle cx="25" cy="53" r="5.5" fill="#222"/><circle cx="53" cy="53" r="5.5" fill="#222"/><circle cx="11" cy="39" r="5.5" fill="#222"/></svg>`;
const blokusIcon = `<svg viewBox="0 0 64 64"><g fill="#4fa3ff"><rect x="6" y="6" width="12" height="12"/><rect x="18" y="6" width="12" height="12"/><rect x="18" y="18" width="12" height="12"/></g><g fill="#ff6b6b"><rect x="46" y="6" width="12" height="12"/><rect x="46" y="18" width="12" height="12"/><rect x="34" y="18" width="12" height="12"/><rect x="46" y="30" width="12" height="12"/></g><g fill="#3ddc97"><rect x="6" y="46" width="12" height="12"/><rect x="18" y="46" width="12" height="12"/><rect x="30" y="46" width="12" height="12"/><rect x="6" y="34" width="12" height="12"/></g><g fill="#ffc247"><rect x="46" y="46" width="12" height="12"/><rect x="34" y="46" width="12" height="12"/></g></svg>`;

export const GAMES = [
  { id: 'chess', name: '체스', icon: '♞', tagline: '세계에서 가장 유명한 전략 게임. 킹을 잡으면 승리!', players: [2], category: 'strategy' },
  { id: 'janggi', name: '장기', icon: { svg: janggiIcon }, tagline: '초나라와 한나라의 대결. 장군! 멍군!', players: [2], category: 'strategy' },
  { id: 'othello', name: '오셀로', icon: { svg: othelloIcon }, tagline: '뒤집고 또 뒤집기. 마지막에 많은 쪽이 이겨요.', players: [2], category: 'strategy' },
  { id: 'gomoku', name: '오목', icon: { svg: gomokuIcon }, tagline: '다섯 개를 먼저 이으면 승리. 간단하지만 깊어요.', players: [2], category: 'casual' },
  { id: 'go', name: '바둑', icon: { svg: goIcon }, tagline: '9줄·13줄 바둑판에서 집을 더 많이 짓는 사람이 승리.', players: [2], category: 'strategy' },
  { id: 'checkers', name: '체커', icon: { svg: checkersIcon }, tagline: '대각선으로 뛰어넘어 상대 말을 잡는 클래식.', players: [2], category: 'strategy' },
  { id: 'connect4', name: '사목', icon: { svg: c4Icon }, tagline: '동전을 떨어뜨려 네 개를 이으세요. 커넥트 포!', players: [2], category: 'casual' },
  { id: 'tictactoe', name: '틱택토', icon: '❌', tagline: '3×3 삼목. 1분이면 한 판 끝!', players: [2], category: 'casual' },
  { id: 'ultimate', name: '얼티밋 틱택토', icon: '#️⃣', tagline: '9개의 틱택토가 하나로. 내 수가 상대의 다음 판을 정해요.', players: [2], category: 'casual' },
  { id: 'mancala', name: '만칼라', icon: { svg: mancalaIcon }, tagline: '구슬을 뿌려 내 창고를 채우는 고대 보드게임.', players: [2], category: 'casual' },
  { id: 'morris', name: '나인 멘스 모리스', icon: { svg: morrisIcon }, tagline: '세 개를 일렬로 놓아 상대 말을 하나씩 제거!', players: [2], category: 'strategy' },
  { id: 'hex', name: '헥스', icon: { svg: hexIcon }, tagline: '육각형 판에서 내 색의 양쪽 변을 먼저 연결하세요.', players: [2], category: 'strategy' },
  { id: 'dots', name: '점과 상자', icon: '🔲', tagline: '선을 그어 상자를 완성하면 내 것. 한 번 더!', players: [2], category: 'casual' },
  { id: 'battleship', name: '배틀십', icon: { svg: battleshipIcon }, tagline: '숨겨진 상대 함대를 먼저 격침시키세요.', players: [2], category: 'casual' },
  { id: 'quoridor', name: '쿼리도', icon: { svg: quoridorIcon }, tagline: '벽으로 길을 막고, 내 말은 먼저 반대편에!', players: [2], category: 'strategy' },
  { id: 'backgammon', name: '백개먼', icon: { svg: backgammonIcon }, tagline: '주사위와 전략의 조화. 말을 모두 먼저 빼내세요.', players: [2], category: 'strategy' },
  { id: 'yut', name: '윷놀이', icon: { svg: yutIcon }, tagline: '도개걸윷모! 명절 최고의 파티 게임.', players: [2, 3, 4], category: 'party' },
  { id: 'ludo', name: '루도', icon: '🎲', tagline: '주사위를 굴려 네 말을 모두 집으로. 잡고 잡히는 재미!', players: [2, 3, 4], category: 'party' },
  { id: 'blokus', name: '블로커스', icon: { svg: blokusIcon }, tagline: '조각을 꼭짓점끼리만 이어 붙여 영역을 넓히세요.', players: [2, 4], category: 'party' },
  { id: 'yacht', name: '야찌', icon: '🎯', tagline: '주사위 5개로 족보를 만드는 다이스 게임.', players: [1, 2, 3, 4], category: 'party' },
  { id: 'g2048', name: '2048', icon: '🔢', tagline: '밀고 합쳐서 2048을 만들어 보세요.', players: [1], category: 'solo' },
  { id: 'minesweeper', name: '지뢰찾기', icon: '💣', tagline: '숫자를 읽고 지뢰를 피해 모든 칸을 여세요.', players: [1], category: 'solo' },
  { id: 'sudoku', name: '스도쿠', icon: '🧩', tagline: '1부터 9까지, 겹치지 않게 채우는 숫자 퍼즐.', players: [1], category: 'solo' },
];

export const gameById = (id) => GAMES.find((g) => g.id === id);

const moduleCache = new Map();
export async function loadGame(id) {
  if (moduleCache.has(id)) return moduleCache.get(id);
  const p = Promise.all([import(`../games/${id}/rules.js`), import(`../games/${id}/view.js`)]).then(([rules, view]) => ({ rules, view, meta: rules.meta }));
  moduleCache.set(id, p);
  return p;
}

export function iconHtml(icon, cls = '') {
  if (typeof icon === 'string') return `<span class="${cls}">${icon}</span>`;
  return icon.svg;
}
