// 시드 기반 난수 (mulberry32) - 게임 상태 안에 seed를 넣어 두면 모든 기기에서 같은 결과가 나온다.
export function nextRand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state, n) {
  return Math.floor(nextRand(state) * n);
}

export function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 독립 난수 생성기 (AI가 무작위성을 섞을 때 사용)
export function makeRng(seed = (Math.random() * 2 ** 31) | 0) {
  const s = { rng: seed | 0 };
  return {
    next: () => nextRand(s),
    int: (n) => randInt(s, n),
    pick: (arr) => arr[randInt(s, arr.length)],
  };
}
