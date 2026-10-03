/**
 * Demographics. Population lives in regions (the country total is their sum),
 * so territorial changes automatically move population with the land.
 */
import { getMod } from './modifiers.js';
import { gdpPerCapita } from '../state/selectors.js';
import { clamp, monthlyFactor } from '../util/math.js';

/** Demographic transition: richer societies converge towards low growth. */
export function demographicTarget(c) {
  const gdppc = gdpPerCapita(c);
  const dev = clamp(Math.log10(Math.max(500, gdppc) / 1000) / Math.log10(50), 0, 1);
  return 0.027 - 0.026 * dev;
}

export function populationGrowth(c) {
  const e = c.economy;
  return (
    e.popGrowthBase +
    0.03 * (c.budget.welfare - c.politics.welfareBaseline) +
    ((c.politics.approval - 50) / 100) * 0.002 -
    Math.max(0, e.unemployment - 0.1) * 0.01 +
    getMod(c, 'popGrowth')
  );
}

export function stepPopulation(state, c) {
  const e = c.economy;
  // the structural base rate slowly follows the demographic transition
  e.popGrowthBase += (demographicTarget(c) - e.popGrowthBase) * 0.002;
  const g = clamp(populationGrowth(c), -0.04, 0.05);
  e.popGrowth = g;
  const f = monthlyFactor(g);
  let total = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    r.population = Math.max(0, Math.round(r.population * f));
    total += r.population;
  }
  c.population = total;
}

export const populationSystem = {
  id: 'population',
  monthly(state) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (!c.eliminated) stepPopulation(state, c);
    }
  },
};
