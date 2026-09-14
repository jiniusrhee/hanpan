// 대전 서버 깨우기 화면: 무료 서버는 한동안 안 쓰면 잠들어서 첫 접속에 30초쯤 걸린다.
// 그동안 빈 화면 대신 우리 스타일의 로딩 화면(말이 통통 튀는 애니메이션 + 진행 막대 + 게임 팁)을 보여준다.
import { h } from '../core/util.js';
import { sound } from '../core/sound.js';

const TIPS = [
  '오셀로에서 모서리 돌은 절대 뒤집히지 않아요. 모서리를 노려 보세요.',
  '장기의 포는 다른 말을 딱 하나 넘어야 움직여요. 포끼리는 넘을 수 없어요.',
  '체스에서 킹과 룩 사이가 비어 있고 둘 다 움직인 적이 없으면 캐슬링을 할 수 있어요.',
  '윷놀이에서 빽도가 나오면 말이 한 칸 뒤로 가요. 출발 직후라면 다시 집으로!',
  '바둑은 상대 돌을 완전히 둘러싸면 따낼 수 있어요. 집이 두 개면 절대 안 잡혀요.',
  '만칼라에서 마지막 씨앗이 내 저장고에 떨어지면 한 번 더 둘 수 있어요.',
  '쿼리도의 벽은 상대 길을 완전히 막을 수는 없어요. 길게 돌아가게만 할 수 있죠.',
  '헥스는 무승부가 없는 게임이에요. 누군가는 반드시 양쪽을 잇게 돼요.',
  '점과 상자에서는 세 번째 변을 긋는 사람이 손해예요. 상대에게 상자를 내주게 되거든요.',
  '블로커스의 조각은 내 조각과 꼭짓점으로만 닿아야 해요. 변끼리는 닿으면 안 돼요.',
  '백개먼에서 더블(같은 눈)이 나오면 그 눈으로 네 번 움직일 수 있어요.',
  '야찌에서 1~6 합계가 63점 이상이면 보너스 35점을 받아요.',
  '초대 링크를 받은 친구는 앱 설치 없이 바로 들어올 수 있어요.',
  '홈 화면에 앱으로 추가하면 전체 화면으로 열리고, 혼자 하는 게임은 오프라인에서도 돼요.',
  '방의 빈 자리는 봇으로 채울 수 있어요. 친구가 늦으면 봇과 먼저 한 판!',
];

let el = null, timer = null, tipTimer = null, startedAt = 0, tipIdx = 0, onCancel = null;

function progressAt(ms) {
  // 처음엔 빠르게, 뒤로 갈수록 천천히 차서 30초쯤에 80%, 60초에 95% — 끝나기 전엔 100%가 되지 않는다
  return Math.min(97, 100 * (1 - Math.exp(-ms / 21000)));
}

function tick() {
  if (!el) return;
  const ms = Date.now() - startedAt;
  el.querySelector('.wake-bar i').style.width = progressAt(ms).toFixed(1) + '%';
  el.querySelector('.wake-sec').textContent = Math.floor(ms / 1000) + '초';
  const sub = el.querySelector('.wake-sub');
  if (ms > 75000) sub.textContent = '서버가 응답하지 않으면 잠시 뒤 다시 시도해 주세요.';
  else if (ms > 45000) sub.textContent = '생각보다 오래 걸리네요… 조금만 더 기다려 주세요.';
}

function nextTip() {
  if (!el) return;
  const tip = el.querySelector('.wake-tip');
  tip.classList.add('out');
  setTimeout(() => { if (!el) return; tipIdx = (tipIdx + 1) % TIPS.length; tip.textContent = '💡 ' + TIPS[tipIdx]; tip.classList.remove('out'); }, 260);
}

export function showWake({ cancel = null } = {}) {
  if (el) { onCancel = cancel; return; }
  onCancel = cancel;
  startedAt = Date.now();
  tipIdx = Math.floor(Math.random() * TIPS.length);
  el = h('div', { class: 'wake', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'wake-card' },
      h('div', { class: 'wake-logo', html: '한<em>판!</em>' }),
      h('div', { class: 'wake-pieces', 'aria-hidden': 'true' }, ['♟', '⚫', '🎲', '♜', '⚪'].map((p, i) => h('span', { text: p, style: { animationDelay: `${i * 120}ms` } }))),
      h('h2', { class: 'wake-title', text: '대전 서버를 깨우는 중이에요' }),
      h('p', { class: 'wake-sub', text: '잠들어 있던 서버는 깨어나는 데 30초쯤 걸려요. 잠깐만요!' }),
      h('div', { class: 'wake-bar' }, h('i')),
      h('div', { class: 'wake-meta' }, h('span', { class: 'wake-sec', text: '0초' }), h('span', { class: 'wake-dots', text: '연결 준비 중' })),
      h('div', { class: 'wake-tip', text: '💡 ' + TIPS[tipIdx] }),
      h('button', { class: 'btn plain wake-cancel', text: '그만두기', onclick: () => { sound.play('click'); const fn = onCancel; hideWake(false); if (fn) fn(); } })));
  document.body.appendChild(el);
  requestAnimationFrame(() => el && el.classList.add('in'));
  timer = setInterval(tick, 250);
  tipTimer = setInterval(nextTip, 4500);
  tick();
}

export function setWakeStage(text) {
  if (!el) return;
  el.querySelector('.wake-dots').textContent = text;
}

export function hideWake(ok = true) {
  if (!el) return;
  clearInterval(timer); clearInterval(tipTimer); timer = tipTimer = null;
  const node = el; el = null; onCancel = null;
  if (ok) {
    node.querySelector('.wake-bar i').style.width = '100%';
    node.querySelector('.wake-title').textContent = '깨어났어요!';
    node.querySelector('.wake-sub').textContent = '바로 이어서 갈게요.';
    node.querySelector('.wake-dots').textContent = '연결됐어요 ✓';
    node.classList.add('done');
    sound.play('notify');
    setTimeout(() => { node.classList.remove('in'); setTimeout(() => node.remove(), 320); }, 520);
  } else {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
  }
}

export const wakeVisible = () => !!el;
