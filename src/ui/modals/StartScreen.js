/**
 * Start screen: pick a country (list or map), continue or load a game.
 * The world map stays visible and interactive behind it.
 */
import { SCENARIOS, DEFAULT_SCENARIO } from '../../data/scenarios.js';
import { GOVERNMENTS } from '../../data/governments.js';
import { gdpPerCapita, debtRatio } from '../../state/selectors.js';
import { formatBn, formatPopulation, formatUsd, formatPct, esc } from '../../util/format.js';
import { formatDateDE } from '../../core/calendar.js';
import { flag } from '../widgets.js';
import { GAME_TITLE, GAME_VERSION } from '../../version.js';
import { DIFFICULTIES } from '../../data/difficulty.js';

const FEATURED = ['DEU', 'USA', 'CHN', 'RUS', 'IND', 'BRA', 'FRA', 'GBR', 'JPN', 'TUR', 'NGA', 'SAU'];

export class StartScreen {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
    this.query = '';
    this.latest = null;
  }

  async show() {
    this.el.hidden = false;
    this.render();
    try {
      const list = await this.ui.saves.list();
      this.latest = list[0] ?? null;
    } catch {
      this.latest = null;
    }
    this.render();
  }

  hide() {
    this.el.hidden = true;
  }

  listHtml() {
    const state = this.ui.session.state;
    const q = this.query.trim().toLowerCase();
    let ids = state.countryOrder.filter((id) => !q || state.countries[id].name.toLowerCase().includes(q) || id.toLowerCase() === q);
    ids.sort((a, b) => state.countries[b].economy.gdp - state.countries[a].economy.gdp);
    if (!q) ids = [...FEATURED.filter((id) => state.countries[id]), ...ids.filter((id) => !FEATURED.includes(id))];
    return ids
      .map((id) => {
        const c = state.countries[id];
        return `<li><button class="start-country${id === this.ui.selected ? ' is-active' : ''}" data-action="selectCountry" data-id="${id}" aria-pressed="${id === this.ui.selected}">
            ${flag(c)}<span class="start-name">${esc(c.name)}</span><span class="num muted">${formatBn(c.economy.gdp)}</span>
          </button></li>`;
      })
      .join('');
  }

  detailHtml() {
    const state = this.ui.session.state;
    const c = state.countries[this.ui.selected];
    if (!c) return '<p class="muted start-hint">Wählen Sie ein Land in der Liste oder direkt auf der Karte.</p>';
    return `<div class="start-detail">
        <h3>${flag(c)} ${esc(c.name)}</h3>
        <dl class="start-facts">
          <div><dt>Regierung</dt><dd>${GOVERNMENTS[c.politics.government].name}</dd></div>
          <div><dt>Bevölkerung</dt><dd class="num">${formatPopulation(c.population)}</dd></div>
          <div><dt>BIP</dt><dd class="num">${formatBn(c.economy.gdp)}</dd></div>
          <div><dt>BIP pro Kopf</dt><dd class="num">${formatUsd(gdpPerCapita(c))}</dd></div>
          <div><dt>Schuldenquote</dt><dd class="num">${formatPct(debtRatio(c), 0)}</dd></div>
          <div><dt>Stabilität</dt><dd class="num">${Math.round(c.politics.stability)}</dd></div>
        </dl>
        <label class="field start-difficulty"><span>Schwierigkeitsgrad</span>
          <select data-action-change="setSetting" data-key="difficulty" data-type="string">
            ${Object.entries(DIFFICULTIES).map(([id, d]) => `<option value="${id}"${(this.ui.settings.difficulty ?? 'normal') === id ? ' selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </label>
        <p class="muted small">${esc((DIFFICULTIES[this.ui.settings.difficulty] ?? DIFFICULTIES.normal).description)}${(DIFFICULTIES[this.ui.settings.difficulty] ?? DIFFICULTIES.normal).assistant ? ' Mit Assistent.' : ''}</p>
        <button class="btn btn-primary btn-big" data-action="startGame" data-id="${c.id}">Als ${esc(c.name)} spielen</button>
      </div>`;
  }

  render() {
    const scenario = SCENARIOS[DEFAULT_SCENARIO];
    const latest = this.latest;
    const searchFocused = document.activeElement?.dataset?.input === 'startSearch';
    const selStart = searchFocused ? document.activeElement.selectionStart : null;
    this.el.innerHTML = `
      <div class="start-panel">
        <header class="start-head">
          <p class="start-eyebrow">${esc(scenario.name)} · ${formatDateDE(this.ui.session.state.time.day)}</p>
          <h1 class="start-title">${GAME_TITLE}</h1>
          <p class="start-lead">${esc(scenario.description)}</p>
        </header>
        <div class="start-actions">
          ${latest ? `<button class="btn btn-primary" data-action="loadGame" data-slot="${esc(latest.id)}">Fortsetzen: ${esc(latest.name)} <span class="muted">(${formatDateDE(latest.gameDay, { long: false })})</span></button>` : ''}
          <button class="btn" data-action="openMenu" data-tab="saves">Spielstand laden</button>
        </div>
        <label class="field start-search"><span>Land wählen</span><input type="search" placeholder="Land suchen …" value="${esc(this.query)}" data-input="startSearch" autocomplete="off"></label>
        <ul class="start-list">${this.listHtml()}</ul>
        ${this.detailHtml()}
        <p class="muted small start-foot">Version ${GAME_VERSION} · Kartendaten: Natural Earth (gemeinfrei)</p>
      </div>`;
    if (searchFocused) {
      const input = this.el.querySelector('[data-input="startSearch"]');
      input.focus();
      input.setSelectionRange(selStart, selStart);
    }
  }
}
