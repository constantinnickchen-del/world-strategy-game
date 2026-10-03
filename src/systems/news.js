/**
 * News feed stored in the game state. Systems publish news here; the UI decides
 * what to show (own country, involved, world events, ...).
 */
export const NEWS_LIMIT = 250;

export const NEWS_CATEGORIES = {
  economy: { name: 'Wirtschaft', icon: '📈' },
  politics: { name: 'Politik', icon: '🏛' },
  diplomacy: { name: 'Diplomatie', icon: '🤝' },
  research: { name: 'Forschung', icon: '🔬' },
  event: { name: 'Ereignis', icon: '❗' },
  world: { name: 'Welt', icon: '🌍' },
  system: { name: 'System', icon: '💾' },
};

/**
 * @param {object} state
 * @param {{category:string, text:string, countryId?:string|null, others?:string[], importance?:number}} item
 *   importance: 1 = minor, 2 = notable, 3 = major (always shown)
 */
export function addNews(state, { category, text, countryId = null, others = [], importance = 1 }) {
  state.world.seq = (state.world.seq ?? 0) + 1;
  const item = { id: state.world.seq, day: state.time.day, category, text, countryId, others, importance };
  state.news.push(item);
  if (state.news.length > NEWS_LIMIT) state.news.splice(0, state.news.length - NEWS_LIMIT);
  return item;
}

/** Whether a news item concerns the given country. */
export function newsInvolves(item, countryId) {
  return item.countryId === countryId || item.others.includes(countryId);
}
