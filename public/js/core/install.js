// 홈 화면에 앱으로 설치하기 (PWA)
let deferred = null;
const listeners = new Set();

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isSafari = () => /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios|edgios/i.test(navigator.userAgent);
export const canPrompt = () => !!deferred;
// 설치 안내를 보여줄 만한 상황인가: 아직 설치 안 됐고, 바로 설치 프롬프트가 있거나 iOS(수동 안내)일 때
export const canInstall = () => !isStandalone() && (!!deferred || isIos());

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function init() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    for (const fn of listeners) fn();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    for (const fn of listeners) fn();
  });
}

// 브라우저 설치 프롬프트 띄우기. 결과: 'accepted' | 'dismissed' | 'unavailable'
export async function prompt() {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null;
  try {
    ev.prompt();
    const { outcome } = await ev.userChoice;
    for (const fn of listeners) fn();
    return outcome;
  } catch { return 'dismissed'; }
}

// iOS/기타 브라우저용 수동 설치 안내 문구
export function manualGuide() {
  if (isIos()) {
    return isSafari()
      ? ['Safari 아래쪽 가운데의 공유 버튼(네모에서 화살표가 나가는 모양)을 눌러요.', '메뉴에서 "홈 화면에 추가"를 고르고 "추가"를 눌러요.', '홈 화면에 생긴 "한판!" 아이콘으로 열면 앱처럼 전체 화면으로 실행돼요.']
      : ['iPhone에서는 Safari로 열어야 홈 화면에 추가할 수 있어요.', '이 링크를 Safari에서 연 뒤, 공유 버튼 → "홈 화면에 추가"를 눌러요.'];
  }
  return ['브라우저 메뉴(⋮)를 열어요.', '"앱 설치" 또는 "홈 화면에 추가"를 눌러요.', '홈 화면의 "한판!" 아이콘으로 열면 앱처럼 실행돼요.'];
}
