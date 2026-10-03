/**
 * Military capacity. Spending accumulates equipment (with depreciation);
 * the power index combines equipment, technology, stability and logistics.
 * Unit-level armies, wars and occupation will build on these values.
 */
import { getMod } from './modifiers.js';
import { clamp } from '../util/math.js';

export const EQUIPMENT_DEPRECIATION = 0.008; // per month

export function militaryPower(c) {
  const m = c.military;
  const tech = Math.max(0.1, 1 + getMod(c, 'militaryPower'));
  const readiness = 0.7 + 0.3 * (c.politics.stability / 100);
  const logistics = 0.6 + 0.4 * (c.infrastructure / 100);
  return Math.pow(Math.max(0, m.equipment), 0.8) * tech * readiness * logistics;
}

export function refreshMilitary(c) {
  const m = c.military;
  m.manpower = Math.round(c.population * clamp(0.004 + c.budget.military * 0.25, 0.002, 0.05));
  m.power = militaryPower(c);
}

export function stepMilitary(c) {
  const m = c.military;
  m.equipment = Math.max(0, m.equipment * (1 - EQUIPMENT_DEPRECIATION) + (c.economy.gdp * c.budget.military) / 12);
  refreshMilitary(c);
}

export const militarySystem = {
  id: 'military',
  monthly(state) {
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (!c.eliminated) stepMilitary(c);
    }
  },
};
