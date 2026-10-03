/** News filtering and list items for the news panel. */
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
