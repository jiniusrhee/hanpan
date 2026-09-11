// 체스 말 SVG (직접 그린 단순한 실루엣)
const SHAPES = {
  p: (s) => `<path d="M22.5 9c-2.2 0-4 1.8-4 4 0 1.1.5 2.1 1.2 2.9-2.2 1.2-3.7 3.5-3.7 6.1 0 2.3 1.1 4.3 2.8 5.5C15 29.6 12.5 33.2 12.5 37.5h20c0-4.3-2.5-7.9-6.3-10 1.7-1.2 2.8-3.2 2.8-5.5 0-2.6-1.5-4.9-3.7-6.1.7-.8 1.2-1.8 1.2-2.9 0-2.2-1.8-4-4-4z" ${s}/>`,
  r: (s) => `<path d="M9 39h27v-3H9z" ${s}/><path d="M12 36v-4h21v4z" ${s}/><path d="M14 32V17h17v15z" ${s}/><path d="M11 14V9h4v2h5V9h5v2h5V9h4v5l-3 3H14z" ${s}/><path d="M14 17h17M12.5 32h20" ${s} fill="none"/>`,
  n: (s, d) => `<path d="M11 39h23v-6l-1-8 2-7-4-8-4-2-3 3-4-2-2 3c-3 4-5.5 8.5-5.5 11.5 0 2 1 3 3 3l4-3-2 5c-2 4-2.5 7.5-2.5 10.5z" ${s}/><circle cx="24" cy="16" r="1.4" fill="${d}"/><path d="M27 12l1.5-4M15 27l3-2" stroke="${d}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  b: (s, d) => `<circle cx="22.5" cy="8.5" r="2.6" ${s}/><path d="M22.5 12c-5 4.5-8 9-7 14 .7 3.3 3.5 5 7 5s6.3-1.7 7-5c1-5-2-9.5-7-14z" ${s}/><path d="M14.5 33h16v2.5h-16z" ${s}/><path d="M11 39h23v-3c-3-1-6-1.5-11.5-1.5S14 35 11 36z" ${s}/><path d="M22.5 17.5v9M19 22h7" stroke="${d}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  q: (s) => `<path d="M8.5 27l3-13 6.5 10 4.5-14 4.5 14 6.5-10 3 13-2 6h-24z" ${s}/><path d="M12 39h21v-3c-2-1.5-4-2-10.5-2S14 34.5 12 36z" ${s}/><circle cx="11.5" cy="12.5" r="2" ${s}/><circle cx="22.5" cy="8.5" r="2" ${s}/><circle cx="33.5" cy="12.5" r="2" ${s}/><path d="M10.5 33h24" ${s} fill="none"/>`,
  k: (s) => `<path d="M22.5 4v7M19 7.5h7" ${s} fill="none" stroke-width="2.2"/><path d="M22.5 12c-2 3-3.5 5.5-3.5 8.5 0 0-2.5-3.5-6-3.5-4.5 0-6.5 3.5-6 7 .5 3.5 3 5.5 5.5 7H32.5c2.5-1.5 5-3.5 5.5-7 .5-3.5-1.5-7-6-7-3.5 0-6 3.5-6 3.5 0-3-1.5-5.5-3.5-8.5z" ${s}/><path d="M12 39h21v-3c-2-1.5-4-2-10.5-2S14 34.5 12 36z" ${s}/><path d="M12.5 31h20" ${s} fill="none"/>`,
};

const cache = new Map();

/** type: 'p'|'n'|'b'|'r'|'q'|'k', color: 0 백 / 1 흑 */
export function pieceSvg(type, color) {
  const key = type + color;
  if (cache.has(key)) return cache.get(key);
  const fill = color === 0 ? '#f8f4ea' : '#2c2c31';
  const stroke = color === 0 ? '#3a352e' : '#050506';
  const detail = color === 0 ? '#3a352e' : '#a8a8b3';
  const s = `fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;
  const svg = `<svg viewBox="0 0 45 45" style="filter: drop-shadow(0 2px 1.5px rgba(0,0,0,.45))">${SHAPES[type](s, detail)}</svg>`;
  cache.set(key, svg);
  return svg;
}
