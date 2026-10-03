import { filterNews, newsItemHtml } from '../components/NewsFeed.js';
import { section } from '../widgets.js';

const FILTERS = [
  ['relevant', 'Wichtig'],
  ['own', 'Eigenes Land'],
  ['all', 'Alle'],
];

export const NewsPanel = {
  id: 'news',
  title: 'Nachrichten',
  render(ui) {
    const state = ui.session.state;
    const items = filterNews(state, ui.settings.newsFilter).slice().reverse();
    return `
      <div class="seg" role="group" aria-label="Filter">${FILTERS.map(([id, label]) => `<button class="seg-btn${ui.settings.newsFilter === id ? ' is-active' : ''}" data-action="setNewsFilter" data-filter="${id}" aria-pressed="${ui.settings.newsFilter === id}">${label}</button>`).join('')}</div>
      ${section(`Meldungen (${items.length})`, items.length ? `<ul class="news-list">${items.map((n) => newsItemHtml(state, n)).join('')}</ul>` : '<p class="muted small">Keine Meldungen für diesen Filter.</p>')}`;
  },
};
