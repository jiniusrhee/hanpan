// 모달 / 바텀시트
import { h, rulesToHtml } from '../core/util.js';
import { sound } from '../core/sound.js';

export function openModal({ title, body, html, buttons = [], dismissible = true, onClose = null, className = '' }) {
  const host = document.getElementById('modals');
  let closed = false;
  const modal = h('div', { class: 'modal ' + className, role: 'dialog' });
  const backdrop = h('div', { class: 'modal-backdrop' }, modal);
  const close = (result) => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (onClose) onClose(result);
  };
  modal.appendChild(h('div', { class: 'grab' }));
  if (title) modal.appendChild(h('h3', { text: title }));
  if (html) modal.appendChild(h('div', { class: 'm-body', html }));
  if (body) modal.appendChild(typeof body === 'string' ? h('p', { text: body }) : body);
  if (buttons.length) {
    modal.appendChild(h('div', { class: 'm-btns' }, buttons.map((b) => h('button', {
      class: 'btn ' + (b.cls || ''),
      text: b.text,
      onclick: () => { sound.play('click'); const r = b.onClick ? b.onClick(close) : undefined; if (r !== false && !b.keep) close(b.value); },
    }))));
  }
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop && dismissible) close(undefined); });
  host.appendChild(backdrop);
  return { close, el: modal };
}

export function confirm(title, body, { okText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title, body,
      buttons: [
        { text: cancelText, value: false },
        { text: okText, cls: danger ? 'btn-danger' : 'btn-primary', value: true },
      ],
      onClose: (r) => resolve(!!r),
    });
  });
}

export function alert(title, body, okText = '알겠어요') {
  return new Promise((resolve) => openModal({ title, body, buttons: [{ text: okText, cls: 'btn-primary', value: true }], onClose: () => resolve() }));
}

export function prompt(title, { label = '', value = '', placeholder = '', okText = '확인', maxLength = 12 } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, placeholder, maxlength: maxLength, autocomplete: 'off' });
    const field = h('div', { class: 'field' }, label ? h('label', { text: label }) : null, input);
    const m = openModal({
      title, body: field,
      buttons: [
        { text: '취소', value: null },
        { text: okText, cls: 'btn-primary', onClick: (close) => { close(input.value.trim()); return false; }, keep: true },
      ],
      onClose: (r) => resolve(r == null ? null : r),
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.close(input.value.trim()); });
    setTimeout(() => input.focus(), 80);
  });
}

export function showRules(game, rulesText) {
  openModal({ title: `${game.name} 규칙`, html: rulesToHtml(rulesText), buttons: [{ text: '닫기', cls: 'btn-primary' }] });
}
