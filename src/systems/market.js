/**
 * World commodity market.
 *
 * Each month: national production (capacity × modifiers × stability) and
 * consumption (GDP/population driven, price elastic) are aggregated, prices
 * move towards the supply/demand equilibrium and producers expand or shrink
 * capacity in response to prices. Prices feed into trade income, state
 * resource rents and the national cost index (-> inflation).
 */
import { RESOURCES, RESOURCE_IDS } from '../data/resources.js';
import { getMod } from './modifiers.js';
import { pushSeries } from '../state/history.js';
import { clamp } from '../util/math.js';

export const PRICE_HISTORY_LENGTH = 120;

/** Political stability and infrastructure limit how much of the capacity is usable. */
export function outputFactor(c) {
  const stab = clamp(c.politics.stability / 50, 0, 1);
  return 0.65 + 0.35 * stab;
}

export function productionOf(c, rid) {
  const r = c.resources[rid];
  if (r.capacity <= 0) return 0;
  return r.capacity * Math.max(0, 1 + getMod(c, `output.${rid}`)) * outputFactor(c);
}

export function consumptionOf(c, rid, price, basePrice) {
  const r = c.resources[rid];
  const def = RESOURCES[rid].demand;
  const e = c.economy;
  const size = def.gdp * Math.pow(Math.max(0.01, e.gdp / e.gdpRef), 0.8) + def.pop * (c.population / Math.max(1, e.popRef));
  const priceEffect = Math.pow(price / basePrice, -0.12);
  return r.demandBase * size * Math.max(0.2, 1 + getMod(c, `demand.${rid}`)) * priceEffect;
}

/** Recomputes national production/consumption and world supply/demand (no price change). */
export function measureMarket(state) {
  const countries = state.countryOrder.map((id) => state.countries[id]).filter((c) => !c.eliminated);
  for (const rid of RESOURCE_IDS) {
    const m = state.market[rid];
    let supply = 0;
    let demand = 0;
    for (const c of countries) {
      const r = c.resources[rid];
      r.production = productionOf(c, rid);
      r.consumption = consumptionOf(c, rid, m.price, m.basePrice);
      supply += r.production;
      demand += r.consumption;
    }
    m.supply = supply;
    m.demand = demand;
  }
  return countries;
}

export const marketSystem = {
  id: 'market',
  monthly(state) {
    const countries = measureMarket(state);
    for (const rid of RESOURCE_IDS) {
      const m = state.market[rid];
      const ratio = m.demand / Math.max(1, m.supply);
      const target = m.basePrice * clamp(Math.pow(ratio, 1 / RESOURCES[rid].elasticity), 0.25, 5);
      m.price += (target - m.price) * 0.3;
      pushSeries(m.history, m.price, PRICE_HISTORY_LENGTH);

      // Capacity investment responds to prices (annual rate applied monthly).
      const rel = m.price / m.basePrice;
      const growth = clamp(0.02 + 0.08 * (rel - 1), -0.04, 0.12) / 12;
      for (const c of countries) {
        const r = c.resources[rid];
        if (r.capacity > 0) r.capacity *= 1 + growth;
      }
    }
  },
};
