// 진동 피드백 (지원하는 기기에서만)
let enabled = true;
const can = () => enabled && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const haptics = {
  setEnabled(v) { enabled = !!v; },
  get enabled() { return enabled; },
  tap() { if (can()) navigator.vibrate(12); },
  hit() { if (can()) navigator.vibrate(35); },
  heavy() { if (can()) navigator.vibrate([45, 30, 60]); },
  success() { if (can()) navigator.vibrate([20, 40, 20, 40, 80]); },
  fail() { if (can()) navigator.vibrate([80, 40, 80]); },
  rattle() { if (can()) navigator.vibrate([15, 30, 15, 30, 15, 30, 25]); },
};
