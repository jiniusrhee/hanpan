// PNG 아이콘/OG 이미지 생성기 (외부 라이브러리 없이 zlib만 사용)
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'img');
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 4); }
  blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4; const ia = 1 - a;
    this.buf[i] = r * a + this.buf[i] * ia; this.buf[i + 1] = g * a + this.buf[i + 1] * ia; this.buf[i + 2] = b * a + this.buf[i + 2] * ia; this.buf[i + 3] = Math.min(255, this.buf[i + 3] + a * 255);
  }
  // 도형 함수: (x,y) → [r,g,b,a] 또는 null
  fill(fn) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const c = fn(x + 0.5, y + 0.5); if (c) this.blend(x, y, c[0], c[1], c[2], c[3] == null ? 1 : c[3]); } }
}
const lerp = (a, b, t) => a + (b - a) * t;
const roundRect = (x, y, w, h, r, px, py) => {
  const dx = Math.max(Math.abs(px - (x + w / 2)) - (w / 2 - r), 0), dy = Math.max(Math.abs(py - (y + h / 2)) - (h / 2 - r), 0);
  return Math.sqrt(dx * dx + dy * dy) - r; // <0 안쪽
};
const aa = (d) => Math.max(0, Math.min(1, 0.5 - d));

function drawIcon(size, { maskable = false } = {}) {
  const c = new Canvas(size, size);
  const pad = maskable ? size * 0.1 : 0;
  const R = maskable ? 0 : size * 0.22;
  // 배경
  c.fill((x, y) => { const d = roundRect(0, 0, size, size, R, x, y); if (d > 0.5) return null; const t = (x + y) / (2 * size); return [lerp(255, 255, t), lerp(138, 77, t), lerp(92, 46, t), aa(d)]; });
  // 보드
  const bx = pad + size * 0.19, bs = size - 2 * bx, cell = bs / 4;
  c.fill((x, y) => { const d = roundRect(bx, bx, bs, bs, size * 0.07, x, y); return d > 0.5 ? null : [255, 243, 230, aa(d)]; });
  c.fill((x, y) => {
    if (x < bx + 1 || y < bx + 1 || x > bx + bs - 1 || y > bx + bs - 1) return null;
    const cx = Math.floor((x - bx) / cell), cy = Math.floor((y - bx) / cell);
    return (cx + cy) % 2 === 1 ? [255, 178, 138, 1] : null;
  });
  // 돌 두 개
  const stone = (cx, cy, r, dark) => c.fill((x, y) => {
    const d = Math.hypot(x - cx, y - cy) - r; if (d > 0.5) return null;
    const hl = Math.max(0, 1 - Math.hypot(x - (cx - r * 0.35), y - (cy - r * 0.35)) / (r * 1.3));
    if (dark) return [lerp(12, 110, hl), lerp(13, 115, hl), lerp(18, 125, hl), aa(d)];
    return [lerp(232, 255, hl), lerp(234, 255, hl), lerp(240, 255, hl), aa(d)];
  });
  stone(bx + cell * 2.5, bx + cell * 1.5, cell * 0.72, true);
  stone(bx + cell * 1.5, bx + cell * 2.5, cell * 0.72, false);
  return c;
}

function drawOg(w, h) {
  const c = new Canvas(w, h);
  c.fill((x, y) => { const t = x / w; return [lerp(14, 30, t), lerp(16, 22, t), lerp(22, 40, t), 1]; });
  // 은은한 원
  c.fill((x, y) => { const d = Math.hypot(x - w * 0.8, y - h * 0.2) - 260; return d > 0.5 ? null : [255, 122, 69, aa(d) * 0.18]; });
  const icon = drawIcon(300);
  const ox = 120, oy = (h - 300) / 2;
  for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) { const i = (y * 300 + x) * 4; const a = icon.buf[i + 3] / 255; if (a > 0) c.blend(ox + x, oy + y, icon.buf[i], icon.buf[i + 1], icon.buf[i + 2], a); }
  // 오른쪽에 보드게임 말 느낌의 원들
  const dots = [[560, 200, 46, [79, 163, 255]], [680, 200, 46, [255, 107, 107]], [800, 200, 46, [61, 220, 151]], [920, 200, 46, [255, 194, 71]], [560, 320, 46, [255, 255, 255]], [680, 320, 46, [30, 30, 36]], [800, 320, 46, [255, 255, 255]], [920, 320, 46, [30, 30, 36]]];
  for (const [cx, cy, r, col] of dots) c.fill((x, y) => { const d = Math.hypot(x - cx, y - cy) - r; return d > 0.5 ? null : [col[0], col[1], col[2], aa(d)]; });
  // 하단 막대 (제목 자리 느낌)
  c.fill((x, y) => { const d = roundRect(560, 420, 420, 26, 13, x, y); return d > 0.5 ? null : [255, 122, 69, aa(d)]; });
  c.fill((x, y) => { const d = roundRect(560, 466, 300, 18, 9, x, y); return d > 0.5 ? null : [120, 128, 150, aa(d)]; });
  return c;
}

for (const [name, size, opts] of [['icon-192.png', 192, {}], ['icon-512.png', 512, { maskable: true }], ['icon-180.png', 180, {}]]) {
  const c = drawIcon(size, opts);
  writeFileSync(path.join(OUT, name), png(size, size, c.buf));
  console.log('만듦:', name);
}
const og = drawOg(1200, 630);
writeFileSync(path.join(OUT, 'og.png'), png(1200, 630, og.buf));
console.log('만듦: og.png');
