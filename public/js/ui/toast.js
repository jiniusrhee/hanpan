import { h } from '../core/util.js';

export function toast(text, { type = '', ms = 2200 } = {}) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const el = h('div', { class: 'toast ' + type, text });
  wrap.appendChild(el);
  while (wrap.children.length > 3) wrap.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
}
