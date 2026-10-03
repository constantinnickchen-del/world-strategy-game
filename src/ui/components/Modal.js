/**
 * Modal dialogs with focus handling, Escape to close (when dismissible) and
 * a simple stack so an event can appear over the menu.
 */
export class ModalManager {
  constructor(root) {
    this.root = root;
    this.stack = [];
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !this.stack.length) return;
      const top = this.stack[this.stack.length - 1];
      if (top.dismissible) {
        ev.stopPropagation();
        top.close();
      }
    });
  }

  get isOpen() {
    return this.stack.length > 0;
  }

  /**
   * @param {{title:string, body:string, className?:string, dismissible?:boolean, onClose?:()=>void, onRender?:(el:HTMLElement)=>void}} opts
   */
  open({ title, body, className = '', dismissible = true, onClose, onRender }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title-${this.stack.length}">
        <header class="modal-head"><h2 id="modal-title-${this.stack.length}">${title}</h2>${dismissible ? '<button class="icon-btn modal-close" aria-label="Schließen" data-modal-close>✕</button>' : ''}</header>
        <div class="modal-body"></div>
      </div>`;
    const bodyEl = backdrop.querySelector('.modal-body');
    const previousFocus = document.activeElement;
    const entry = {
      el: backdrop,
      dismissible,
      setBody: (html) => {
        bodyEl.innerHTML = html;
        onRender?.(bodyEl);
      },
      close: () => {
        const i = this.stack.indexOf(entry);
        if (i < 0) return;
        this.stack.splice(i, 1);
        backdrop.remove();
        onClose?.();
        previousFocus?.focus?.();
      },
    };
    backdrop.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-modal-close]') || (dismissible && ev.target === backdrop)) entry.close();
    });
    this.root.appendChild(backdrop);
    this.stack.push(entry);
    entry.setBody(body);
    (backdrop.querySelector('[autofocus]') ?? backdrop.querySelector('button, input, select'))?.focus();
    return entry;
  }

  closeAll() {
    for (const m of [...this.stack]) m.close();
  }
}

export class Toasts {
  constructor(root) {
    this.root = root;
  }

  show(text, { tone = 'info', ms = 3500 } = {}) {
    // at high speed many reports arrive at once: keep only the newest few on screen
    while (this.root.children.length >= 4) this.root.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.setAttribute('role', 'status');
    el.textContent = text;
    this.root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }
}
