// 배포 환경 설정 (선택 사항). 값을 비워 두면 같은 서버에서 모든 기능이 동작해요.
window.APP_CONFIG = {
  // 카카오 개발자 콘솔(developers.kakao.com)에서 발급받은 JavaScript 키.
  // 비워 두면 기기의 기본 공유 시트(카카오톡 포함)와 링크 복사 방식으로 초대해요.
  kakaoJsKey: '',

  // 온라인 대전 서버 주소 (예: 'wss://hanpan.onrender.com/ws').
  // GitHub Pages처럼 정적 호스팅에 올렸을 때, 별도로 띄운 서버를 여기에 적으면 온라인 대전이 켜져요.
  wsUrl: '',

  // true 로 두면 온라인 대전 메뉴를 숨겨요 (서버 없이 정적으로만 배포할 때).
  staticHost: false,
};
