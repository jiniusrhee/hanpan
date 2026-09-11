// 봇 실행기 - 가능하면 워커에서, 안 되면 메인 스레드에서 계산한다.
let worker = null;
let workerBroken = false;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error)); else p.resolve(e.data.move);
    };
    worker.onerror = (e) => {
      console.warn('AI 워커 오류, 메인 스레드로 전환', e.message);
      workerBroken = true;
      for (const [, p] of pending) p.reject(new Error('worker-failed'));
      pending.clear();
      try { worker.terminate(); } catch { /* */ }
      worker = null;
    };
  } catch (e) {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

const modCache = new Map();
async function inline(gameId, state, level, options) {
  let mod = modCache.get(gameId);
  if (!mod) { mod = await import(`../games/${gameId}/rules.js`); modCache.set(gameId, mod); }
  return mod.ai(state, level, options || {});
}

export async function runBot(gameId, state, level = 2, options = {}) {
  const w = getWorker();
  if (w) {
    const id = ++seq;
    try {
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        w.postMessage({ id, gameId, state, level, options });
      });
    } catch (e) {
      if (e.message !== 'worker-failed') throw e;
    }
  }
  return inline(gameId, state, level, options);
}

export function cancelBots() {
  if (worker) { try { worker.terminate(); } catch { /* */ } worker = null; }
  for (const [, p] of pending) p.reject(new Error('cancelled'));
  pending.clear();
}
