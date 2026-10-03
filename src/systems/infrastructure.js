/**
 * Infrastructure is tracked per region (0..100). Spending raises it with
 * diminishing returns, maintenance needs cause decay. The national value is
 * the population-weighted average.
 */
import { getMod } from './modifiers.js';
import { clamp } from '../util/math.js';

export function infrastructureDelta(c, level) {
  const invest = 0.25 * (c.budget.infrastructure / 0.03) * (1 - level / 100) * (1 + getMod(c, 'infrastructureGain'));
  const decay = 0.12 * (level / 100);
  return invest - decay;
}

export function nationalInfrastructure(state, c) {
  let w = 0;
  let sum = 0;
  for (const rid of c.regionIds) {
    const r = state.regions[rid];
    const weight = Math.max(1, r.population);
    sum += r.infrastructure * weight;
    w += weight;
  }
  return w > 0 ? sum / w : 0;
}

export const infrastructureSystem = {
  id: 'infrastructure',
  monthly(state) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      for (const rid of c.regionIds) {
        const r = state.regions[rid];
        r.infrastructure = Math.round(clamp(r.infrastructure + infrastructureDelta(c, r.infrastructure), 0, 100) * 1000) / 1000;
      }
      c.infrastructure = nationalInfrastructure(state, c);
    }
  },
};
