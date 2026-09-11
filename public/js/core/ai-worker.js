// 봇 계산용 워커 - 게임 규칙 모듈을 불러와 ai()를 실행한다.
const cache = new Map();

self.onmessage = async (e) => {
  const { id, gameId, state, level, options } = e.data;
  try {
    let mod = cache.get(gameId);
    if (!mod) { mod = await import(`../games/${gameId}/rules.js`); cache.set(gameId, mod); }
    const t0 = performance.now();
    const move = mod.ai(state, level, options || {});
    self.postMessage({ id, move, ms: performance.now() - t0 });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.stack || err) });
  }
};
