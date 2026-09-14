# 한판! — 모바일 두뇌 보드게임 컬렉션

친구와 **카카오톡 초대 링크**로 바로 붙는 온라인 대전, **봇 대전**, **한 기기에서 번갈아 하기**를 모두 지원하는 웹 보드게임 모음이에요. 앱 설치 없이 링크 하나로 열리고, 홈 화면에 추가하면 앱처럼 쓸 수 있어요(PWA).

- 🌐 앱 주소: **https://jiniusrhee.github.io/hanpan/** — GitHub Pages. 봇 대전·한 기기 대전·혼자 하기·앱 설치, 그리고 아래 서버와 연결돼 온라인 대전까지 돼요. (푸시하면 자동 배포)
- 🔗 대전 서버: **https://hanpan.onrender.com** — Render 무료 플랜. 이 주소로 직접 접속해도 모든 기능이 되고, 카카오톡 초대 링크 미리보기(누가 무슨 게임에 초대했는지)는 이 주소에서 만든 방이 가장 예뻐요.

## 게임 목록 (23종)

| 분류 | 게임 | 인원 |
| --- | --- | --- |
| 전략 | 체스, 장기, 오셀로, 바둑(9·13줄), 체커, 나인 멘스 모리스, 헥스, 쿼리도, 백개먼 | 2인 |
| 가볍게 | 오목, 사목(커넥트 포), 틱택토, 얼티밋 틱택토, 만칼라, 점과 상자, 배틀십 | 2인 |
| 파티 | 윷놀이, 루도 | 2~4인 |
| 파티 | 블로커스 | 2·4인 |
| 파티 | 야찌 | 1~4인 |
| 혼자 | 2048, 지뢰찾기, 스도쿠 | 1인 |

모든 다인용 게임은 봇(쉬움·보통·어려움)과 온라인 대전을 지원해요. 온라인 방의 빈 자리는 봇으로 채울 수 있어요.

## 실행하기 (내 컴퓨터)

```bash
npm install
npm start          # http://localhost:3000
```

개발 중에는 `npm run dev`(파일 변경 시 자동 재시작)를 쓰면 편해요.

## 배포하기

### 1) GitHub Pages — 링크 하나로 바로 열리는 정적 버전

저장소를 GitHub에 올리면 `.github/workflows/pages.yml`이 자동으로 `public/`을 GitHub Pages에 배포해요.

1. GitHub에서 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정해요.
2. `main` 브랜치에 푸시하면 1~2분 뒤 `https://<아이디>.github.io/<저장소>/`에서 열려요.
3. 정적 호스팅에는 WebSocket 서버가 없어서 **온라인 대전 메뉴는 꺼진 상태**로 나와요. (봇 대전, 한 기기 대전, 혼자 하기, 앱 설치는 모두 됩니다.)
4. 아래 2)로 서버를 따로 띄웠다면, 저장소 **Settings → Secrets and variables → Actions → Variables**에 `WS_URL` = `wss://<서버주소>/ws`를 추가하고 다시 배포하면 Pages 버전에서도 온라인 대전이 켜져요. (이 저장소는 `WS_URL = wss://hanpan.onrender.com/ws`로 설정돼 있어요.)

### 2) Render — 온라인 대전까지 되는 서버 버전 (무료)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/jiniusrhee/hanpan)

1. 위 버튼을 누르거나 [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**에서 이 저장소를 고르면 `render.yaml` 설정대로 배포돼요.
2. 몇 분 뒤 `https://hanpan-xxxx.onrender.com` 같은 주소가 생겨요. 이 주소에서는 카카오톡 초대 링크와 온라인 대전이 모두 동작해요.
3. 무료 플랜은 15분 동안 아무도 안 쓰면 잠들었다가 첫 접속 때 30초쯤 걸려 깨어나요. 앱은 서버가 잠든 걸 감지하면 **깨우는 중 화면**(진행 막대·게임 팁)을 보여 주고 깨어나는 대로 이어서 진행해요. 앱을 열 때 미리 조용히 깨워 두기도 해요. 방은 서버 메모리에만 있으니 서버가 재시작되면 진행 중이던 방은 사라져요(끝난 뒤 새로 만들면 돼요).

Railway, Fly.io, 개인 서버(Nginx + Node)도 같은 방식이에요. `PORT` 환경변수만 읽고, `/ws` 경로의 WebSocket 업그레이드를 허용해 주면 돼요.

> 기기 공유 시트(카카오톡 포함), 클립보드 복사, 진동, 앱 설치는 **HTTPS에서만** 동작해요. GitHub Pages와 Render는 기본으로 HTTPS예요.

## 폰에 앱으로 설치하기

배포한 주소를 폰에서 열면 홈 화면에 "홈 화면에 앱으로 추가" 안내가 떠요. 설정(닉네임 칩)에서도 언제든 설치할 수 있어요.

- **Android (Chrome, 삼성 인터넷)**: 안내의 **설치** 버튼을 누르면 바로 설치돼요. 안 뜨면 브라우저 메뉴(⋮) → "앱 설치" 또는 "홈 화면에 추가".
- **iPhone / iPad (Safari)**: 공유 버튼(□↑) → **홈 화면에 추가** → 추가. (iOS는 Safari에서만 가능해요.)
- **PC (Chrome, Edge)**: 주소창 오른쪽의 설치 아이콘을 누르면 창 앱으로 설치돼요.

설치한 앱은 전체 화면으로 열리고, 혼자 하는 게임과 봇 대전은 오프라인에서도 돼요. 새 버전이 나오면 다음 실행 때 자동으로 갱신돼요.

## 카카오톡 초대 링크

기본 상태에서도 잘 동작해요.

1. 방을 만들면 초대 코드와 링크(`https://내주소/join/코드`)가 생겨요.
2. **카카오톡으로 초대하기** 버튼을 누르면 휴대폰의 공유 시트가 열리고, 거기서 카카오톡을 고르면 초대 메시지와 링크가 전송돼요. (공유 시트가 없는 환경에서는 초대 문구가 클립보드에 복사돼요.)
3. 친구가 링크를 누르면 바로 대기실로 들어와요. 카카오톡 미리보기에는 "○○님이 체스 한판 하자고 초대했어요!"처럼 방 정보가 표시돼요.

카카오 SDK로 카드 형태의 메시지를 보내고 싶다면 [developers.kakao.com](https://developers.kakao.com)에서 **JavaScript 키**를 발급받아 배포 도메인을 등록하고, `public/config.js`의 `kakaoJsKey`(Pages 배포는 Actions 변수 `KAKAO_JS_KEY`)에 넣어요.

## 폴더 구조

```
server/            Express + WebSocket 서버 (방 관리·중계만 담당, 게임 로직 없음)
public/            정적 파일 (빌드 없이 그대로 서비스)
  js/core/         공용 모듈: 보드 렌더러, 탐색 알고리즘, 효과, 사운드, 네트워크, 매치 진행, 설치
  js/ui/           화면: 홈, 게임 설정, 대기실, 플레이
  js/games/<id>/   게임별 rules.js(규칙+봇) / view.js(그리기+입력)
  sw.js            서비스 워커 (오프라인 캐시)
test/run.js        규칙 엔진 자동 점검 (무작위 플레이아웃 + 봇 합법성)
test/sim10k.js     대량 시뮬레이션 (설정당 1만 판, 병렬) · test/invariants.js 게임별 규칙 불변식 · test/bots.js 봇 품질
tools/             아이콘 생성, 브라우저 스크린샷/온라인 흐름/기기별 레이아웃 시뮬레이션
.github/workflows  GitHub Pages 자동 배포
render.yaml        Render 블루프린트 (서버 배포)
```

## 게임 추가하기

1. `public/js/core/registry.js`에 메타데이터(이름, 아이콘, 인원, 분류)를 추가해요.
2. `public/js/games/<id>/rules.js`에 `meta`, `init`, `legalMoves`, `apply`, `status`, `ai`를 구현해요. 상태는 JSON으로 직렬화 가능해야 하고, `apply`는 원본을 바꾸지 않아야 해요. 난수는 `state.rng`와 `core/rng.js`를 쓰면 온라인에서도 모든 기기가 같은 결과를 얻어요.
3. `view.js`에 `create(root, ctx)`를 구현해 보드를 그리고 `ctx.submit(move)`로 수를 보내요.
4. `public/sw.js`의 게임 목록에 id를 추가하고, `node test/run.js <id>`로 규칙을 점검해요.

## 테스트

```bash
npm test                                   # 모든 게임 규칙 엔진 점검 (--games 100 으로 판 수 지정)
npm run test:mass                          # 게임 × 인원수마다 10,000판 병렬 시뮬레이션 (규칙 불변식·잘못된 입력·봇 합법성·결정성 검사, 약 15분)
npm run test:bots                          # 봇 품질 점검 (쉬움/보통 vs 무작위, 어려움 vs 쉬움 승률과 응답 시간, 약 15분)
npm run shots                              # 헤드리스 크롬 스크린샷 (localhost:3210 서버 필요)
npm run test:online                        # 브라우저 여러 개로 온라인 대전 흐름 점검 (기본 localhost:3210, SERVER=https://... 로 배포 서버 지정)
node tools/sim-devices.js --out ./sim      # 15종 기기 × 모든 게임 × 인원수 레이아웃 시뮬레이션 (설정당 100턴)
node tools/sleepy-proxy.js --sleep 12000   # 잠든 서버 흉내 (3211 → 3210). 이어서 PROXY_WS=ws://localhost:3211/ws node tools/wake-test.js ./wake-shots 로 깨우기 화면 점검
```

브라우저 테스트는 `puppeteer-core`와 로컬 Chrome을 사용해요. Chrome 경로가 다르면 `CHROME` 환경변수로 지정하세요.
