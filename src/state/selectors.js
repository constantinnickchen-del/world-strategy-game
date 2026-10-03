/**
 * Read-only helpers over the game state. Keep derived values here instead of
 * duplicating formulas in UI and systems.
 */

export const BUDGET_CATEGORIES = {
  administration: { name: 'Verwaltung', min: 0.02, max: 0.12, description: 'Erhöht die Steuereffizienz.' },
  welfare: { name: 'Soziales & Gesundheit', min: 0.02, max: 0.35, description: 'Steigert die Zustimmung und das Bevölkerungswachstum.' },
  infrastructure: { name: 'Infrastruktur', min: 0.005, max: 0.1, description: 'Baut Infrastruktur aus: Wachstum, Steuereffizienz, Rohstoffförderung.' },
  research: { name: 'Forschung & Bildung', min: 0.001, max: 0.06, description: 'Erzeugt Forschungspunkte.' },
  military: { name: 'Militär', min: 0.002, max: 0.15, description: 'Baut militärische Ausrüstung auf.' },
};
export const BUDGET_IDS = Object.keys(BUDGET_CATEGORIES);
export const TAX_LIMITS = { min: 0.05, max: 0.65 };

export function getPlayer(state) {
  return state.countries[state.playerId];
}

export function gdpPerCapita(c) {
  return c.population > 0 ? (c.economy.gdp * 1e9) / c.population : 0;
}

export function debtRatio(c) {
  return c.economy.gdp > 0 ? c.economy.debt / c.economy.gdp : 0;
}

export function totalSpendingShare(c) {
  let s = 0;
  for (const id of BUDGET_IDS) s += c.budget[id];
  return s;
}

/** Monthly budget figures in bn USD (from the last simulated month). */
export function budgetSummary(c) {
  const e = c.economy;
  return {
    revenue: e.lastRevenue,
    expenses: e.lastExpenses,
    interest: e.lastInterest,
    resourceRent: e.lastResourceRent,
    balance: e.lastBalance,
  };
}

export function liveCountries(state) {
  return state.countryOrder.map((id) => state.countries[id]).filter((c) => !c.eliminated);
}

/** Rank of each country for a metric (1 = highest). */
export function rankBy(state, metricFn) {
  const sorted = liveCountries(state)
    .map((c) => ({ id: c.id, v: metricFn(c) }))
    .sort((a, b) => b.v - a.v);
  const ranks = {};
  sorted.forEach((e, i) => {
    ranks[e.id] = i + 1;
  });
  return ranks;
}

export function worldGdp(state) {
  let g = 0;
  for (const c of liveCountries(state)) g += c.economy.gdp;
  return g;
}
