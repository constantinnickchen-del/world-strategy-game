/**
 * Records time series for charts and keeps modifiers tidy.
 * Runs last in the monthly pipeline so it captures the final values.
 */
import { pushSeries } from '../state/history.js';
import { debtRatio, worldGdp } from '../state/selectors.js';
import { expireModifiers } from './modifiers.js';
import { fromDayNumber } from '../core/calendar.js';

const YEARLY_LIMIT = 500;

export const statisticsSystem = {
  id: 'statistics',
  monthly(state) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      expireModifiers(c, state.time.day);
      const h = c.history;
      pushSeries(h.gdp, c.economy.gdp);
      pushSeries(h.growth, c.economy.growth);
      pushSeries(h.inflation, c.economy.inflation);
      pushSeries(h.unemployment, c.economy.unemployment);
      pushSeries(h.approval, c.politics.approval);
      pushSeries(h.stability, c.politics.stability);
      pushSeries(h.debtRatio, debtRatio(c));
      pushSeries(h.treasury, c.economy.treasury);
    }
    pushSeries(state.stats.worldGdpHistory, worldGdp(state), 120);
  },
  yearly(state) {
    const { year } = fromDayNumber(state.time.day);
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (c.eliminated) continue;
      pushSeries(c.yearly.year, year - 1, YEARLY_LIMIT);
      pushSeries(c.yearly.gdp, c.economy.gdp, YEARLY_LIMIT);
      pushSeries(c.yearly.population, c.population, YEARLY_LIMIT);
    }
  },
};
