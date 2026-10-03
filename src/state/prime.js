/**
 * Fills all derived values of a freshly created state (production, trade,
 * budgets, research points, military power) without advancing time, and
 * balances world commodity demand against supply so a scenario starts in
 * market equilibrium regardless of starting technologies.
 */
import { RESOURCE_IDS } from '../data/resources.js';
import { measureMarket } from '../systems/market.js';
import { tradeSystem } from '../systems/trade.js';
import { updateBudget } from '../systems/economy.js';
import { technologySystem } from '../systems/technology.js';
import { nationalInfrastructure } from '../systems/infrastructure.js';
import { refreshMilitary } from '../systems/military.js';

export function primeDerivedValues(state) {
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    c.infrastructure = nationalInfrastructure(state, c);
  }
  measureMarket(state);
  for (const rid of RESOURCE_IDS) {
    const m = state.market[rid];
    const f = m.supply / Math.max(1e-9, m.demand);
    for (const id of state.countryOrder) state.countries[id].resources[rid].demandBase *= f;
  }
  measureMarket(state);
  tradeSystem.monthly(state);
  technologySystem.monthly(state);
  for (const id of state.countryOrder) {
    const c = state.countries[id];
    refreshMilitary(c);
    updateBudget(c, { book: false });
    // The starting position defines what is "normal" for this economy.
    c.economy.deficitTarget = (-c.economy.lastRealBalance * 12) / c.economy.gdp;
    c.economy.tradeBalanceRef = c.trade.balance / c.economy.gdp;
  }
}
