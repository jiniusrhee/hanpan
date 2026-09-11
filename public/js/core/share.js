// 초대 링크 공유: 카카오 SDK(키가 있을 때) → 기기 공유 시트 → 링크 복사
import { withBase } from './router.js';

export function inviteUrl(code) {
  return `${location.origin}${withBase('/join/' + code)}`;
}

let kakaoLoading = null;
export function initKakao() {
  const key = window.APP_CONFIG && window.APP_CONFIG.kakaoJsKey;
  if (!key) return Promise.resolve(false);
  if (window.Kakao && window.Kakao.isInitialized()) return Promise.resolve(true);
  if (kakaoLoading) return kakaoLoading;
  kakaoLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => { try { window.Kakao.init(key); resolve(true); } catch { resolve(false); } };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return kakaoLoading;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* 아래 폴백 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function inviteText({ gameName, hostName }) {
  return `${hostName}님이 ${gameName} 한판 하자고 초대했어요! 링크를 누르면 바로 참여할 수 있어요 👇`;
}

export async function shareKakao({ code, gameName, hostName }) {
  const ok = await initKakao();
  if (!ok) return false;
  const url = inviteUrl(code);
  try {
    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: `${gameName} 한판 하실래요?`,
        description: inviteText({ gameName, hostName }),
        imageUrl: new URL('img/og.png', document.baseURI).href,
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: '참여하기', link: { mobileWebUrl: url, webUrl: url } }],
    });
    return true;
  } catch (e) {
    console.warn('카카오 공유 실패', e);
    return false;
  }
}

export async function shareNative({ code, gameName, hostName }) {
  if (!navigator.share) return false;
  const url = inviteUrl(code);
  try {
    await navigator.share({ title: `${gameName} 한판 하실래요?`, text: inviteText({ gameName, hostName }), url });
    return true;
  } catch (e) {
    return e && e.name === 'AbortError' ? 'abort' : false;
  }
}

export const hasKakaoKey = () => !!(window.APP_CONFIG && window.APP_CONFIG.kakaoJsKey);
export const hasNativeShare = () => typeof navigator.share === 'function';
