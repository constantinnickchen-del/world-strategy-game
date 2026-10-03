/**
 * Guided introduction ("coach marks"). Each step highlights one part of the
 * interface with a spotlight and explains it in a speech bubble. Steps can
 * prepare the UI first (open a panel, select a country), so the tour shows
 * real, working controls. The game is paused while the tour runs.
 *
 * Step: { target?: css selector, title, text, prepare?(ui), placement? }
 * Without a target (or if it is not found) the bubble is centred.
 */
import { esc } from '../../util/format.js';
import { neighborCountryIds } from '../../state/worldIndex.js';

function firstForeignCountry(ui) {
  const state = ui.session.state;
  const p = ui.session.player;
  return neighborCountryIds(state, p.id)[0] ?? p.trade.partners[0]?.id ?? state.countryOrder.find((id) => id !== p.id);
}

export const TUTORIAL_STEPS = [
  {
    title: 'Willkommen, Regierungschef!',
    text: (ui) =>
      `Sie regieren jetzt <b>${esc(ui.session.player.name)}</b>. Diese kurze Einführung zeigt Ihnen in etwa einer Minute, wo Sie was finden. Das Spiel ist so lange pausiert.`,
  },
  {
    target: '.chrono',
    title: 'Die Zeit',
    text: 'Hier sehen Sie das Datum. Mit den Pfeilen starten Sie die Zeit in drei Geschwindigkeiten, mit ❚❚ halten Sie sie an. Am schnellsten geht es mit der <span class="kbd">Leertaste</span>.',
  },
  {
    target: '.top-stats',
    title: 'Ihre wichtigsten Zahlen',
    text: 'Wirtschaftsleistung, Staatskasse, Schulden, Zustimmung der Bevölkerung und Stabilität. Grün ist gut, Rot ist ein Warnzeichen. <b>Fahren Sie mit der Maus über einen Wert</b>, um zu sehen, woraus er sich zusammensetzt.',
    fallbackTarget: '.chrono',
  },
  {
    target: '#map-wrap',
    title: 'Die Weltkarte',
    text: 'Mit dem Mausrad zoomen, mit gedrückter Maustaste verschieben. <b>Klicken Sie auf ein Land</b>, um rechts Informationen dazu zu sehen.',
    placement: 'center',
    prepare: (ui) => ui.setTutorialLayout({ panel: null, select: null }),
  },
  {
    target: '.map-modes',
    title: 'Kartenmodi',
    text: 'Hier färben Sie die Karte nach Themen ein: Wohlstand, Wachstum, Beziehungen zu Ihnen, Rohstoffe und mehr. Unten rechts erklärt die Legende die Farben.',
  },
  {
    target: '#sidebar',
    title: 'Ihre Ministerien',
    text: 'Über diese Leiste öffnen Sie die Bereiche Ihrer Regierung: Wirtschaft, Politik, Diplomatie, Handel, Forschung, Militär und mehr.',
  },
  {
    target: '[data-tut="advisor"]',
    title: 'Ihr Berater',
    text: 'Im Lagebericht sagt Ihnen der Berater, was gerade wichtig ist, und führt Sie mit einem Klick direkt zur passenden Stelle. <b>Wenn Sie nicht wissen, was zu tun ist: hier schauen.</b>',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'overview', select: null }),
  },
  {
    target: '[data-tut="tax"]',
    title: 'Steuern',
    text: 'Mit dem Schieberegler legen Sie die Steuern fest. Mehr Steuern bringen mehr Geld in die Staatskasse, machen die Bevölkerung aber unzufriedener und bremsen die Wirtschaft.',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'economy', select: null }),
  },
  {
    target: '[data-tut="budget"]',
    title: 'Staatsausgaben',
    text: 'Hier verteilen Sie das Geld: Soziales macht die Menschen zufriedener, Infrastruktur und Forschung bringen langfristig Wachstum, das Militär macht Ihr Land stärker. Unten sehen Sie, ob Ihr Haushalt im Plus oder Minus ist.',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'economy', select: null }),
  },
  {
    target: '[data-tut="research"]',
    title: 'Forschung',
    text: 'Wählen Sie unten in der Liste eine Technologie mit <b>„Erforschen“</b>. Technologien bringen dauerhafte Vorteile, zum Beispiel mehr Wachstum oder günstigere Energie.',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'research', select: null }),
  },
  {
    target: '[data-tut="diplomacy"]',
    title: 'Diplomatie',
    text: (ui) =>
      `Wenn Sie ein anderes Land anklicken – hier zum Beispiel <b>${esc(ui.session.state.countries[firstForeignCountry(ui)]?.name ?? '')}</b> –, können Sie die Beziehungen verbessern und Verträge vorschlagen. Graue Buttons sind gerade nicht möglich; die Maus darüber verrät warum.`,
    prepare: (ui) => ui.setTutorialLayout({ panel: null, select: firstForeignCountry(ui) }),
  },
  {
    target: '#newsfeed',
    title: 'Nachrichten',
    text: 'Hier erscheinen Meldungen aus Ihrem Land und der Welt. Manchmal müssen Sie auch Entscheidungen treffen – dann hält das Spiel an und ein Fenster erscheint.',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'overview', select: null }),
  },
  {
    title: 'Los geht’s!',
    text: 'Ihr Ziel: Machen Sie Ihr Land wohlhabend, stabil und einflussreich – und halten Sie die Bevölkerung bei Laune. Starten Sie die Zeit mit der <span class="kbd">Leertaste</span>.<br><br>Diese Einführung finden Sie jederzeit wieder im Menü <b>☰</b> unter „Spiel“.',
    prepare: (ui) => ui.setTutorialLayout({ panel: 'overview', select: null }),
  },
];

export class Tutorial {
  constructor(root, ui, steps = TUTORIAL_STEPS) {
    this.root = root;
    this.ui = ui;
    this.steps = steps;
    this.index = -1;
    this.onResize = () => this.position();
  }

  get active() {
    return this.index >= 0;
  }

  start() {
    this.ui.session.setSpeed(0);
    this.ui.modals.closeAll();
    this.index = 0;
    this.root.hidden = false;
    window.addEventListener('resize', this.onResize);
    this.show();
  }

  next() {
    if (this.index >= this.steps.length - 1) this.finish();
    else {
      this.index++;
      this.show();
    }
  }

  back() {
    if (this.index > 0) {
      this.index--;
      this.show();
    }
  }

  finish() {
    this.index = -1;
    this.root.hidden = true;
    this.root.innerHTML = '';
    window.removeEventListener('resize', this.onResize);
    this.ui.onTutorialFinished();
  }

  show() {
    const step = this.steps[this.index];
    step.prepare?.(this.ui);
    this.ui.flush(); // render prepared panels before measuring
    const last = this.index === this.steps.length - 1;
    const text = typeof step.text === 'function' ? step.text(this.ui) : step.text;
    this.root.innerHTML = `
      <div class="tut-spot" aria-hidden="true"></div>
      <div class="tut-bubble" role="dialog" aria-modal="true" aria-labelledby="tut-title">
        <div class="tut-progress" aria-label="Schritt ${this.index + 1} von ${this.steps.length}">${this.steps.map((_, i) => `<i class="${i <= this.index ? 'on' : ''}"></i>`).join('')}</div>
        <h3 id="tut-title">${esc(step.title)}</h3>
        <p>${text}</p>
        <div class="tut-actions">
          <button class="btn btn-small tut-skip" data-tut-action="skip">${last ? 'Schließen' : 'Überspringen'}</button>
          <span class="tut-spacer"></span>
          ${this.index > 0 ? '<button class="btn btn-small" data-tut-action="back">Zurück</button>' : ''}
          <button class="btn btn-primary" data-tut-action="next" autofocus>${last ? 'Spiel starten' : 'Weiter'}</button>
        </div>
      </div>`;
    this.root.querySelectorAll('[data-tut-action]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.tutAction;
        if (a === 'next') this.next();
        else if (a === 'back') this.back();
        else this.finish();
      }),
    );
    this.position();
    this.root.querySelector('[data-tut-action="next"]').focus();
  }

  targetElement(step) {
    for (const sel of [step.target, step.fallbackTarget]) {
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) return el;
    }
    return null;
  }

  position() {
    if (!this.active) return;
    const step = this.steps[this.index];
    const spot = this.root.querySelector('.tut-spot');
    const bubble = this.root.querySelector('.tut-bubble');
    const el = this.targetElement(step);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    if (!el) {
      spot.classList.add('is-center');
      spot.removeAttribute('style');
      bubble.style.left = `${(vw - bw) / 2}px`;
      bubble.style.top = `${Math.max(16, (vh - bh) / 2)}px`;
      return;
    }
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    const rect = {
      left: Math.max(4, r.left - pad),
      top: Math.max(4, r.top - pad),
      right: Math.min(vw - 4, r.right + pad),
      bottom: Math.min(vh - 4, r.bottom + pad),
    };
    spot.classList.remove('is-center');
    Object.assign(spot.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.right - rect.left}px`, height: `${rect.bottom - rect.top}px` });

    // Bubble placement: beside the target where there is room, otherwise below/above, otherwise centred.
    const gap = 14;
    let left;
    let top;
    if (step.placement === 'center') {
      left = (vw - bw) / 2;
      top = (vh - bh) / 2;
    } else if (vw - rect.right >= bw + gap) {
      left = rect.right + gap;
      top = rect.top;
    } else if (rect.left >= bw + gap) {
      left = rect.left - bw - gap;
      top = rect.top;
    } else if (vh - rect.bottom >= bh + gap) {
      left = rect.left;
      top = rect.bottom + gap;
    } else if (rect.top >= bh + gap) {
      left = rect.left;
      top = rect.top - bh - gap;
    } else {
      left = (vw - bw) / 2;
      top = vh - bh - 16;
    }
    bubble.style.left = `${Math.max(12, Math.min(vw - bw - 12, left))}px`;
    bubble.style.top = `${Math.max(12, Math.min(vh - bh - 12, top))}px`;
  }

  /** Keyboard while the tour is active. Returns true if handled. */
  handleKey(ev) {
    if (!this.active) return false;
    if (ev.key === 'Escape') this.finish();
    else if (ev.key === 'ArrowRight' || ev.key === 'Enter') this.next();
    else if (ev.key === 'ArrowLeft') this.back();
    else if (ev.key !== 'Tab') return true; // swallow game shortcuts during the tour
    else return false;
    ev.preventDefault();
    return true;
  }
}
