/**
 * Monthly military tick for every country:
 *   manpower → budget/upkeep → maintenance → procurement deliveries →
 *   construction → production → supply purchases → refit → strength
 * Daily war-time processes (movement, combat, supply delivery) live in systems/war.
 */
import { stepManpower } from './manpower.js';
import { monthlyUpkeep, monthlyMilitaryBudget, createWallet } from './budget.js';
import { stepMaintenance } from './maintenance.js';
import { stepProcurement } from './procurement.js';
import { stepConstruction } from './construction.js';
import { stepProduction } from './production.js';
import { stepSupplies, refitUnits } from './logistics.js';
import { refreshPower } from './power.js';
import { isAtWar } from '../war/wars.js';

export function stepMilitaryMonth(state, c) {
  const m = c.military;
  stepManpower(state, c);
  const budget = monthlyMilitaryBudget(c);
  const upkeep = monthlyUpkeep(state, c);
  const wallet = createWallet(budget);
  const paid = wallet.take('upkeep', upkeep.total);
  const funding = upkeep.total > 0 ? paid / upkeep.total : 1;
  stepMaintenance(state, c, funding);
  stepProcurement(state, c, wallet);
  stepConstruction(state, c, wallet);
  stepProduction(state, c, wallet);
  stepSupplies(state, c, wallet);
  refitUnits(c);
  m.spending = {
    budget,
    upkeepNeed: upkeep.total,
    upkeep: paid,
    production: wallet.spent.production ?? 0,
    procurement: wallet.spent.procurement ?? 0,
    construction: wallet.spent.construction ?? 0,
    supplies: wallet.spent.supplies ?? 0,
    total: budget - wallet.left,
    funding,
    breakdown: upkeep,
  };
  if (!isAtWar(state, c.id)) m.exhaustion *= 0.85;
  refreshPower(c);
}

export const militarySystem = {
  id: 'military',
  monthly(state) {
    for (const id of state.countryOrder) {
      const m = state.countries[id].military;
      m.armsExportsLast = m.armsExports ?? 0;
      m.armsExports = 0;
    }
    for (const id of state.countryOrder) {
      const c = state.countries[id];
      if (!c.eliminated) stepMilitaryMonth(state, c);
    }
  },
};
