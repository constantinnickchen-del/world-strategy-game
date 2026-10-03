/**
 * News filtering shared by the bottom ticker and the news panel, plus the
 * compact ticker strip at the bottom of the map.
 */
import { NEWS_CATEGORIES, newsInvolves } from '../../systems/news.js';
import { formatDateDE } from '../../core/calendar.js';
import { esc } from '../../util/format.js';

export function filterNews(state, filter = 'relevant') {
  const p = state.playerId;
  return state.news.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'own') return newsInvolves(n, p);
    return n.importance >= 2 || newsInvolves(n, p) || n.category === 'world';
  });
}

export function newsItemHtml(state, n) {
  const cat = NEWS_CATEGORIES[n.category] ?? NEWS_CATEGORIES.event;
  const target = n.countryId ? ` data-action="selectCountry" data-id="${n.countryId}"` : '';
  return `<li class="news-item imp-${n.importance}">
      <button class="news-btn"${target}${n.countryId ? '' : ' disabled'}>
        <span class="news-icon" aria-hidden="true">${cat.icon}</span>
        <span class="news-text">${esc(n.text)}</span>
        <time class="news-date num">${formatDateDE(n.day, { long: false })}</time>
      </button>
    </li>`;
}

export class NewsTicker {
  constructor(el, ui) {
    this.el = el;
    this.ui = ui;
    this.lastId = null;
  }

  render(force = false) {
    const state = this.ui.session.state;
    if (!state) return;
    const items = filterNews(state, this.ui.settings.newsFilter).slice(-3).reverse();
    const key = `${items[0]?.id}|${this.ui.settings.newsFilter}`;
    if (!force && key === this.lastId) return;
    this.lastId = key;
    this.el.innerHTML = `<div class="ticker">
        <button class="ticker-label" data-action="openPanel" data-panel="news" data-tip="Alle Nachrichten öffnen">Nachrichten</button>
        <ul class="ticker-list">${items.map((n) => newsItemHtml(state, n)).join('') || '<li class="muted small">Noch keine Meldungen.</li>'}</ul>
      </div>`;
  }
}
