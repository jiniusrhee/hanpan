// 공통 격자 보드 렌더러 - 칸 클릭, 말 이동/제거 애니메이션, 하이라이트를 담당한다.
import { h, svg } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export class GridBoard {
  /**
   * @param root 보드를 넣을 요소
   * @param opts { rows, cols, flip, style: 'checker'|'lines'|'plain'|'none', theme, coords, onCell(r,c,ev), cellClass(r,c), extraSvg(string), lineInset }
   */
  constructor(root, opts) {
    this.root = root;
    this.rows = opts.rows;
    this.cols = opts.cols;
    this.flip = !!opts.flip;
    this.opts = opts;
    this.pieces = new Map();
    this.el = h('div', { class: `board ${opts.theme || 'wood'} ${opts.className || ''}`, style: { '--rows': this.rows, '--cols': this.cols } });
    this.bg = h('div', { class: 'board-bg' });
    this.cellsEl = h('div', { class: 'cells' });
    this.piecesEl = h('div', { class: 'pieces' });
    this.el.append(this.bg, this.cellsEl, this.piecesEl);
    root.appendChild(this.el);
    this.renderBg();
    this.renderCells();
    this.cellsEl.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.cell');
      if (!cell || !this.opts.onCell) return;
      this.opts.onCell(+cell.dataset.r, +cell.dataset.c, ev);
    });
  }

  dr(r) { return this.flip ? this.rows - 1 - r : r; }
  dc(c) { return this.flip ? this.cols - 1 - c : c; }

  renderBg() {
    const { rows, cols } = this;
    const style = this.opts.style || 'checker';
    const s = svg('svg', { viewBox: `0 0 ${cols} ${rows}`, preserveAspectRatio: 'none' });
    if (style === 'checker') {
      s.appendChild(svg('rect', { x: 0, y: 0, width: cols, height: rows, fill: 'var(--light)' }));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 1) s.appendChild(svg('rect', { x: c, y: r, width: 1, height: 1, fill: 'var(--dark)' }));
      }
    } else if (style === 'plain') {
      s.appendChild(svg('rect', { x: 0, y: 0, width: cols, height: rows, fill: 'var(--light)' }));
      for (let r = 0; r <= rows; r++) s.appendChild(svg('line', { x1: 0, y1: r, x2: cols, y2: r, stroke: 'var(--line, rgba(0,0,0,.25))', 'stroke-width': 0.03 }));
      for (let c = 0; c <= cols; c++) s.appendChild(svg('line', { x1: c, y1: 0, x2: c, y2: rows, stroke: 'var(--line, rgba(0,0,0,.25))', 'stroke-width': 0.03 }));
    } else if (style === 'lines') {
      // 교차점 보드 (바둑/오목/장기): 칸의 중심을 선으로 잇는다
      s.appendChild(svg('rect', { x: 0, y: 0, width: cols, height: rows, fill: 'var(--light)' }));
      const w = 0.035;
      for (let r = 0; r < rows; r++) s.appendChild(svg('line', { x1: 0.5, y1: r + 0.5, x2: cols - 0.5, y2: r + 0.5, stroke: 'var(--line, #3d2a14)', 'stroke-width': w }));
      for (let c = 0; c < cols; c++) s.appendChild(svg('line', { x1: c + 0.5, y1: 0.5, x2: c + 0.5, y2: rows - 0.5, stroke: 'var(--line, #3d2a14)', 'stroke-width': w }));
      s.appendChild(svg('rect', { x: 0.5, y: 0.5, width: cols - 1, height: rows - 1, fill: 'none', stroke: 'var(--line, #3d2a14)', 'stroke-width': w * 2 }));
      if (this.opts.stars) for (const [r, c] of this.opts.stars) s.appendChild(svg('circle', { cx: c + 0.5, cy: r + 0.5, r: 0.09, fill: 'var(--line, #3d2a14)' }));
    }
    if (this.opts.extraSvg) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.innerHTML = this.opts.extraSvg;
      s.appendChild(g);
    }
    if (this.flip) s.setAttribute('transform', 'rotate(180)');
    this.bg.innerHTML = '';
    this.bg.appendChild(s);
    this.svg = s;
  }

  renderCells() {
    this.cellsEl.innerHTML = '';
    this.cellMap = new Map();
    for (let dr = 0; dr < this.rows; dr++) for (let dc = 0; dc < this.cols; dc++) {
      const r = this.dr(dr), c = this.dc(dc);
      const cell = h('div', { class: 'cell' + (this.opts.cellClass ? ' ' + (this.opts.cellClass(r, c) || '') : ''), dataset: { r, c } });
      this.cellsEl.appendChild(cell);
      this.cellMap.set(r * this.cols + c, cell);
    }
    if (this.opts.coords) this.renderCoords();
  }

  renderCoords() {
    for (const el of this.el.querySelectorAll('.coords')) el.remove();
    const files = 'abcdefghijklmnopqrstuvwxyz';
    for (let dc = 0; dc < this.cols; dc++) {
      const c = this.dc(dc);
      this.el.appendChild(h('div', { class: 'coords', text: files[c], style: { left: `calc(${dc} * var(--cell) + 2px)`, bottom: '1px' } }));
    }
    for (let dr = 0; dr < this.rows; dr++) {
      const r = this.dr(dr);
      this.el.appendChild(h('div', { class: 'coords', text: String(this.rows - r), style: { top: `calc(${dr} * var(--cell) + 1px)`, right: '3px' } }));
    }
  }

  setFlip(flip) {
    if (this.flip === !!flip) return;
    this.flip = !!flip;
    this.renderBg();
    this.renderCells();
    for (const [, p] of this.pieces) this.position(p, true);
  }

  cellEl(r, c) { return this.cellMap.get(r * this.cols + c); }

  position(p, instant = false) {
    const el = p.el;
    if (instant) el.classList.add('no-anim');
    el.style.setProperty('--r', this.dr(p.r));
    el.style.setProperty('--c', this.dc(p.c));
    if (instant) { void el.offsetWidth; requestAnimationFrame(() => el.classList.remove('no-anim')); }
  }

  addPiece(id, r, c, html, { cls = '', spawn = true } = {}) {
    this.removePiece(id, { animate: false });
    const el = h('div', { class: 'piece ' + cls + (spawn ? ' spawn' : ''), dataset: { id } });
    if (typeof html === 'string') el.innerHTML = html; else if (html) el.appendChild(html);
    const p = { id, r, c, el, cls, html };
    this.pieces.set(id, p);
    this.position(p, true);
    this.piecesEl.appendChild(el);
    if (spawn) setTimeout(() => el.classList.remove('spawn'), 350);
    return el;
  }

  movePiece(id, r, c, { land = true } = {}) {
    const p = this.pieces.get(id);
    if (!p) return;
    p.r = r; p.c = c;
    p.el.classList.add('lift');
    this.position(p);
    setTimeout(() => { p.el.classList.remove('lift'); if (land) { p.el.classList.add('land'); setTimeout(() => p.el.classList.remove('land'), 400); } }, 340);
  }

  setPieceHtml(id, html, cls) {
    const p = this.pieces.get(id);
    if (!p) return;
    p.html = html;
    if (typeof html === 'string') p.el.innerHTML = html; else { p.el.innerHTML = ''; p.el.appendChild(html); }
    if (cls != null) { p.cls = cls; p.el.className = 'piece ' + cls; }
  }

  animatePiece(id, cls, ms = 450) {
    const p = this.pieces.get(id);
    if (!p) return;
    p.el.classList.remove(cls); void p.el.offsetWidth; p.el.classList.add(cls);
    setTimeout(() => p.el.classList.remove(cls), ms);
  }

  removePiece(id, { animate = true, delay = 0 } = {}) {
    const p = this.pieces.get(id);
    if (!p) return;
    this.pieces.delete(id);
    if (!animate) { p.el.remove(); return; }
    setTimeout(() => { p.el.classList.add('dying'); setTimeout(() => p.el.remove(), 400); }, delay);
  }

  getPiece(id) { return this.pieces.get(id); }
  pieceAt(r, c) { for (const p of this.pieces.values()) if (p.r === r && p.c === c) return p; return null; }

  /**
   * 목표 말 목록과 비교해서 생성/이동/삭제를 자동으로 처리한다.
   * list: [{ id, r, c, html, cls }]
   */
  sync(list, { animate = true } = {}) {
    const seen = new Set();
    for (const it of list) {
      seen.add(it.id);
      const p = this.pieces.get(it.id);
      if (!p) { this.addPiece(it.id, it.r, it.c, it.html, { cls: it.cls || '', spawn: animate }); continue; }
      if (p.r !== it.r || p.c !== it.c) { if (animate) this.movePiece(it.id, it.r, it.c); else { p.r = it.r; p.c = it.c; this.position(p, true); } }
      if (it.html !== p.html || (it.cls || '') !== p.cls) this.setPieceHtml(it.id, it.html, it.cls || '');
    }
    for (const id of [...this.pieces.keys()]) if (!seen.has(id)) this.removePiece(id, { animate });
  }

  highlight(cells, cls) { for (const { r, c } of cells) { const el = this.cellEl(r, c); if (el) el.classList.add(cls); } }
  clearHighlights(cls) {
    const classes = cls ? [cls] : ['hl-move', 'hl-capture', 'hl-select', 'hl-last', 'hl-check', 'hl-hint'];
    for (const el of this.cellsEl.children) el.classList.remove(...classes);
  }

  // FX용 좌표 (보드 요소 기준, px)
  centerOf(r, c) {
    const w = this.el.clientWidth / this.cols, hgt = this.el.clientHeight / this.rows;
    return { x: (this.dc(c) + 0.5) * w, y: (this.dr(r) + 0.5) * hgt, size: Math.min(w, hgt) };
  }

  destroy() { this.el.remove(); }
}

// 공통 말 그래픽
export function stoneSvg(color, { ring = false, label = '', labelColor = '' } = {}) {
  const dark = color === 'black';
  const fill = dark ? 'url(#g-black)' : color === 'white' ? 'url(#g-white)' : color;
  return `<svg viewBox="0 0 100 100">
    <defs>
      <radialGradient id="g-black" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#6b6f7a"/><stop offset="0.6" stop-color="#1c1e24"/><stop offset="1" stop-color="#000"/></radialGradient>
      <radialGradient id="g-white" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="0.7" stop-color="#e6e8ee"/><stop offset="1" stop-color="#b8bcc8"/></radialGradient>
    </defs>
    <ellipse cx="52" cy="56" rx="44" ry="42" fill="rgba(0,0,0,.35)"/>
    <circle cx="50" cy="50" r="44" fill="${fill}" ${!dark && color === 'white' ? 'stroke="#9aa0ad" stroke-width="1"' : ''}/>
    ${ring ? '<circle cx="50" cy="50" r="18" fill="none" stroke="' + (dark ? '#fff' : '#111') + '" stroke-width="4" opacity=".8"/>' : ''}
    ${label ? `<text x="50" y="50" text-anchor="middle" dominant-baseline="central" font-size="34" font-weight="800" fill="${labelColor || (dark ? '#fff' : '#111')}">${label}</text>` : ''}
  </svg>`;
}

// 단색 원반 (색상 지정)
export function discSvg(color, { label = '', labelColor = '#fff', border = 'rgba(0,0,0,.35)' } = {}) {
  return `<svg viewBox="0 0 100 100">
    <ellipse cx="52" cy="56" rx="44" ry="42" fill="rgba(0,0,0,.3)"/>
    <circle cx="50" cy="50" r="44" fill="${color}" stroke="${border}" stroke-width="3"/>
    <ellipse cx="40" cy="36" rx="18" ry="11" fill="rgba(255,255,255,.28)"/>
    ${label ? `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="38" font-weight="900" fill="${labelColor}">${label}</text>` : ''}
  </svg>`;
}
