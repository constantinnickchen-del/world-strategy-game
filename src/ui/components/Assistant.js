/**
 * Assistant card on the map: once a month it analyses the player's country
 * (systems/assistant.js) and shows the most important tips with a button to
 * the right place. It can be minimised or switched off (settings); by default
 * it is active on the difficulty levels Kinderleicht, Leicht and Mittel.
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
      <ul class="assistant-list">${this.tips
        .map((t) => `<li class="assistant-tip tone-${t.tone}">
            <b>${esc(t.title)}</b>
            <p>${esc(t.text)}</p>
            ${t.action ? actionButton(esc(t.action.label), 'assistantGo', { panel: t.action.panel }, { cls: 'btn-small' }) : ''}
          </li>`)
        .join('')}</ul>
      <footer class="assistant-foot small"><button class="link" data-action="assistantOff">Assistent ausschalten</button><span class="muted">Neue Analyse jeden Monat</span></footer>`;
  }
}
