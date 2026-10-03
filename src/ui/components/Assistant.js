/**
 * Assistant card on the map: once a month it analyses the player's country
 * (systems/assistant.js) and shows the most important tips with a button to
 * the right place. It can be minimised or switched off (settings); by default
 * it is active on the difficulty levels Kinderleicht, Leicht and Mittel.
 *
 * Help offers: for most problems the assistant asks "Darf ich helfen?", shows
 * exactly which changes it would make and only executes them (as ordinary
 * player commands) after the player agreed.
 */
import { assistantTips } from '../../systems/assistant.js';
import { fromDayNumber } from '../../core/calendar.js';
import { esc } from '../../util/format.js';
import { actionButton } from '../widgets.js';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export class Assistant {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
    this.tips = [];
    this.key = null;
    this.minimized = false;
    this.seen = new Set();
    this.openOffer = null; // key of the tip whose help offer is expanded
    this.done = new Map(); // key -> summary (this month)
    this.declined = new Set(); // keys (this month)
  }

  static keyOf(tip) {
    return tip.title.split(' (')[0];
  }

  get enabled() {
    return this.ui.mode === 'game' && this.ui.settings.assistant !== false && !!this.ui.session.player;
  }

  /** Re-analyse (once per month, or when forced). */
  analyse(force = false) {
    const state = this.ui.session.state;
    const { year, month } = fromDayNumber(state.time.day);
    const key = `${state.meta.gameId}|${year}-${month}`;
    if (!force && key === this.key) return;
    if (key !== this.key) {
      this.done = new Map();
      this.declined = new Set();
      this.openOffer = null;
    }
    this.key = key;
    this.label = `${MONTHS[month - 1]} ${year}`;
    const detail = this.ui.settings.difficulty === 'veryEasy';
    this.tips = assistantTips(state, this.ui.session.player, { detail }).slice(0, detail ? 4 : 3);
    // a new serious problem opens the card again
    const urgent = this.tips.filter((t) => t.tone === 'bad').map((t) => t.title.split(' (')[0]);
    if (urgent.some((t) => !this.seen.has(t))) this.minimized = false;
    this.seen = new Set(urgent);
  }

  render(force = false) {
    if (!this.enabled) {
      this.el.hidden = true;
      return;
    }
    this.analyse(force);
    this.el.hidden = false;
    const important = this.tips.filter((t) => t.tone === 'bad' || t.tone === 'warn').length;
    if (this.minimized) {
      this.el.className = 'assistant is-min';
      this.el.innerHTML = `<button class="assistant-pill${important ? ' has-alert' : ''}" data-action="assistantToggle" aria-label="Assistent öffnen">🧭 Assistent${important ? ` <b>${important}</b>` : ''}</button>`;
      return;
    }
    this.el.className = 'assistant';
    this.el.innerHTML = `<header class="assistant-head">
        <span class="assistant-title">🧭 Assistent <span class="muted small">· Analyse ${esc(this.label)}</span></span>
        <button class="icon-btn" data-action="assistantToggle" aria-label="Assistent minimieren" data-tip="Minimieren">–</button>
      </header>
      <ul class="assistant-list">${this.tips.map((t) => this.tipHtml(t)).join('')}</ul>
      <footer class="assistant-foot small"><button class="link" data-action="assistantOff">Assistent ausschalten</button><span class="muted">Neue Analyse jeden Monat</span></footer>`;
  }

  /** Commands of a help offer that are currently valid. */
  validCommands(fix) {
    return fix.commands.filter((cmd) => !this.ui.session.validate(cmd));
  }

  tipHtml(t) {
    const key = Assistant.keyOf(t);
    const done = this.done.get(key);
    const fix = t.fix && !done && !this.declined.has(key) && this.validCommands(t.fix).length ? t.fix : null;
    let help = '';
    if (done) {
      help = `<p class="assistant-done">✓ Erledigt: ${esc(done)} Die Wirkung zeigt sich in den nächsten Monaten.</p>`;
    } else if (fix && this.openOffer === key) {
      help = `<div class="assistant-offer">
          <p><b>Ich würde Folgendes tun:</b></p>
          <ul>${fix.changes.map((ch) => `<li>${esc(ch)}</li>`).join('')}</ul>
          ${fix.effect ? `<p class="small muted">${esc(fix.effect)}</p>` : ''}
          <div class="btn-row">
            ${actionButton('Ja, bitte erledigen', 'assistantAccept', { key }, { cls: 'btn-small btn-primary' })}
            ${actionButton('Nein danke', 'assistantDecline', { key }, { cls: 'btn-small' })}
          </div>
        </div>`;
    } else if (fix) {
      help = actionButton(`🤝 Darf ich helfen? (${esc(fix.label)})`, 'assistantOffer', { key }, { cls: 'btn-small btn-primary' });
    }
    return `<li class="assistant-tip tone-${t.tone}">
        <b>${esc(t.title)}</b>
        <p>${esc(t.text)}</p>
        <div class="btn-row">${help}${!done && t.action && this.openOffer !== key ? actionButton(esc(t.action.label), 'assistantGo', { panel: t.action.panel }, { cls: 'btn-small' }) : ''}</div>
      </li>`;
  }

  /** The player agreed: execute the offer through ordinary commands. */
  accept(key) {
    const t = this.tips.find((x) => Assistant.keyOf(x) === key);
    if (!t?.fix) return;
    let ok = 0;
    const failed = [];
    for (const cmd of t.fix.commands) {
      const res = this.ui.session.execute(cmd);
      if (res.ok) ok++;
      else failed.push(res.error);
    }
    this.openOffer = null;
    this.done.set(key, `${t.fix.label} (${ok} Änderung${ok === 1 ? '' : 'en'}).`);
    this.ui.toasts.show(`Assistent: ${t.fix.label} – ${ok} Änderung${ok === 1 ? '' : 'en'} umgesetzt${failed.length ? `, ${failed.length} nicht möglich (${failed[0]})` : ''}.`, { tone: failed.length ? 'warn' : 'good', ms: 4000 });
    this.ui.markAll();
  }
}
