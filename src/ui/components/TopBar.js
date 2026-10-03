/**
 * Top status bar: player country, chronometer with speed controls, key
 * national indicators. Built once; update() only patches text and tooltips,
 * so it can run every simulated day without layout thrash.
 */
import { SPEEDS } from '../../core/GameClock.js';
import { formatDateDE, fromDayNumber } from '../../core/calendar.js';
import { formatBn, formatPct, formatSignedPct, formatPopulation, flagEmoji, esc } from '../../util/format.js';
import { debtRatio } from '../../state/selectors.js';
import { gdpTip, budgetTip, debtTip, inflationTip, approvalTip, stabilityTip, unemploymentTip } from '../tips.js';
import { GAME_TITLE } from '../../version.js';

const SPEED_ICONS = ['❚❚', '▶', '▶▶', '▶▶▶', '⏩'];

export class TopBar {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="brand"><span class="brand-mark" aria-hidden="true">✦</span><span class="brand-name">${GAME_TITLE}</span></div>
      <button class="player-chip topbar-game" data-action="focusPlayer" data-tip="Eigenes Land anzeigen">
        <span class="flag" data-k="flag"></span><span class="player-name" data-k="name"></span>
      </button>
      <div class="chrono topbar-game" role="group" aria-label="Zeitsteuerung">
        <div class="chrono-date" data-tip="Leertaste: Pause/Fortsetzen · 1–4: Geschwindigkeit · +/−: schneller/langsamer">
          <span class="chrono-day num" data-k="date"></span>
        </div>
        <div class="chrono-speeds">
          ${SPEEDS.map((s) => `<button class="speed-btn" data-action="setSpeed" data-speed="${s.id}" aria-label="${s.label}" data-tip="${s.label}${s.id ? ` (${s.daysPerSecond} Tage/Sek.)` : ''}">${SPEED_ICONS[s.id]}</button>`).join('')}
        </div>
      </div>
      <div class="top-stats topbar-game">
        ${this.statSlot('gdp', 'BIP')}
        ${this.statSlot('treasury', 'Geld (Kasse)')}
        ${this.statSlot('growth', 'Wachstum')}
        ${this.statSlot('debt', 'Schulden')}
        ${this.statSlot('inflation', 'Inflation')}
        ${this.statSlot('unemployment', 'Arbeitslos.')}
        ${this.statSlot('approval', 'Zustimmung')}
        ${this.statSlot('stability', 'Stabilität')}
        ${this.statSlot('population', 'Bevölkerung')}
      </div>
      <button class="icon-btn menu-btn" data-action="openMenu" aria-label="Menü" data-tip="Menü: Speichern, Laden, Einstellungen (Esc)">☰</button>`;
    this.slots = {};
    for (const el of this.el.querySelectorAll('[data-k]')) this.slots[el.dataset.k] = el;
  }

  statSlot(key, label) {
    return `<div class="top-stat" data-k="${key}-wrap"><span class="top-stat-label">${label}</span><span class="top-stat-value num" data-k="${key}"></span></div>`;
  }

  set(key, text, cls) {
    const el = this.slots[key];
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (cls !== undefined) el.className = `top-stat-value num ${cls}`;
  }

  tip(key, html) {
    const el = this.slots[`${key}-wrap`];
    if (el) el.dataset.tip = html;
  }

  update() {
    const state = this.ui.session.state;
    if (!state) return;
    const speed = this.ui.session.clock.speed;
    for (const b of this.el.querySelectorAll('.speed-btn')) {
      const on = Number(b.dataset.speed) === speed;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    this.el.querySelector('.chrono').classList.toggle('is-running', speed > 0);
    this.set('date', formatDateDE(state.time.day));
    const c = this.ui.session.player;
    if (!c) return;
    this.slots.flag.textContent = flagEmoji(c.iso2);
    this.set('name', c.name);
    const e = c.economy;
    this.set('gdp', formatBn(e.gdp));
    this.set('growth', formatSignedPct(e.growth), e.growth >= 0 ? 'good' : 'bad');
    this.set('treasury', formatBn(e.treasury), e.lastBalance >= 0 ? 'good' : 'bad');
    this.set('debt', formatPct(debtRatio(c), 0), debtRatio(c) > e.debtTolerance ? 'bad' : '');
    this.set('inflation', formatPct(e.inflation), e.inflation > 0.06 ? 'bad' : e.inflation < 0 ? 'warn' : '');
    this.set('unemployment', formatPct(e.unemployment), e.unemployment > 0.1 ? 'bad' : '');
    this.set('approval', String(Math.round(c.politics.approval)), c.politics.approval < 35 ? 'bad' : c.politics.approval > 60 ? 'good' : '');
    this.set('stability', String(Math.round(c.politics.stability)), c.politics.stability < 35 ? 'bad' : c.politics.stability > 65 ? 'good' : '');
    this.set('population', formatPopulation(c.population));
    // Tooltips are refreshed at most once per month (they are comparatively expensive).
    const { year, month } = fromDayNumber(state.time.day);
    const tipKey = `${year}-${month}|${this.ui.revision}`;
    if (tipKey !== this.tipKey) {
      this.tipKey = tipKey;
      this.tip('gdp', gdpTip(c));
      this.tip('growth', gdpTip(c));
      this.tip('treasury', budgetTip(c));
      this.tip('debt', debtTip(c));
      this.tip('inflation', inflationTip(c));
      this.tip('unemployment', unemploymentTip(c));
      this.tip('approval', approvalTip(c));
      this.tip('stability', stabilityTip(c));
      this.tip('population', `<b>Bevölkerung</b><br>${esc(formatPopulation(c.population))} Einwohner · Wachstum ${formatSignedPct(e.popGrowth ?? 0, 2)} pro Jahr`);
    }
  }
}
